"""
pipeline_runner.py
------------------
Orchestrates the full GSSI pipeline:
  1. Fetch 7 signals from FRED (2018-mid 2024)
  2. Normalize to [0, 1] and invert low-stress signals
  3. Compute GSSI weighted sum + stress zone classification
  4. Validate: March 2020 should be HIGH stress (COVID shock)
  5. Train autoregressive forecast model on GSSI history
  6. Generate 3-month forward forecast
"""

import logging
import os
import sys
from pathlib import Path
from typing import Dict

import pandas as pd

# ---------------------------------------------------------------------------
# Ensure the api root is importable when running this file directly.
# ---------------------------------------------------------------------------
_API_ROOT = Path(__file__).resolve().parent.parent
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from services.data_pipeline import build_dataset
from models.gssi_model import GSSIModel
from models.forecast_model import ForecastModel

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Validation anchor: COVID supply-chain shock should register as HIGH stress
_VALIDATION_MONTH = "2020-03"
_VALIDATION_THRESHOLD = 0.65


def _validate_march_2020(gssi: pd.Series) -> None:
    """Log a PASS/FAIL check for the March 2020 COVID stress spike.

    Args:
        gssi: Full GSSI Series with a monthly DatetimeIndex.
    """
    mask = gssi.index.strftime("%Y-%m") == _VALIDATION_MONTH
    if not mask.any():
        logger.warning("Validation skipped: %s not in dataset range.", _VALIDATION_MONTH)
        return

    value = float(gssi[mask].iloc[0])
    if value >= _VALIDATION_THRESHOLD:
        logger.info(
            "Validation PASSED: March 2020 GSSI = %.4f (>= %.2f HIGH threshold)",
            value,
            _VALIDATION_THRESHOLD,
        )
    else:
        logger.warning(
            "Validation FAILED: March 2020 GSSI = %.4f (expected >= %.2f)",
            value,
            _VALIDATION_THRESHOLD,
        )


def run_pipeline(
    fred_api_key: str,
    start: str = "2018-01-01",
    end: str = "2024-12-31",
    test_ratio: float = 0.2,
    n_forecast_months: int = 3,
) -> Dict:
    """Execute the end-to-end GSSI pipeline.

    Args:
        fred_api_key: FRED API key for fetching macroeconomic data.
        start: Data start date (YYYY-MM-DD).
        end: Data end date (YYYY-MM-DD).
        test_ratio: Fraction of GSSI history used for model evaluation.
        n_forecast_months: Number of future months to forecast.

    Returns:
        Dict with keys:
          - ``"df"``            - DataFrame with all signals, GSSI, and stress_zone
          - ``"forecast"``      - Series of forecasted GSSI values (monthly index)
          - ``"model_metrics"`` - Dict with ``train_r2`` and ``test_r2``
    """

    # ------------------------------------------------------------------
    # Step 1 — Fetch, fill, normalize, and invert signals
    # ------------------------------------------------------------------
    logger.info("=== Step 1: Fetching and preparing data from FRED ===")
    df = build_dataset(fred_api_key, start=start, end=end)
    logger.info("Prepared dataset shape: %s | columns: %s", df.shape, df.columns.tolist())

    # ------------------------------------------------------------------
    # Step 2 — Compute GSSI + stress zone classification
    # ------------------------------------------------------------------
    logger.info("=== Step 2: Computing GSSI index and stress zones ===")
    gssi_model = GSSIModel()
    df = gssi_model.compute_with_zones(df)

    logger.info("Signal weights:\n%s", gssi_model.feature_importance().to_string())
    logger.info("GSSI tail (last 6 months):\n%s", df[["gssi", "stress_zone"]].tail(6).to_string())

    # ------------------------------------------------------------------
    # Step 3 — Validate March 2020 anchor point
    # ------------------------------------------------------------------
    logger.info("=== Step 3: Validation check ===")
    _validate_march_2020(df["gssi"])

    # ------------------------------------------------------------------
    # Step 4 — Train autoregressive forecast model on GSSI history
    # ------------------------------------------------------------------
    logger.info("=== Step 4: Training autoregressive forecast model ===")
    forecast_model = ForecastModel()
    metrics = forecast_model.train(df["gssi"], test_ratio=test_ratio)
    logger.info("Model metrics: %s", metrics)

    # ------------------------------------------------------------------
    # Step 5 — Generate forward forecast
    # ------------------------------------------------------------------
    logger.info("=== Step 5: Generating %d-month forward forecast ===", n_forecast_months)
    forecast = forecast_model.predict_next(df["gssi"], n_months=n_forecast_months)
    logger.info("Forecast:\n%s", forecast.to_string())

    logger.info("=== Pipeline complete ===")
    return {
        "df": df,
        "forecast": forecast,
        "model_metrics": metrics,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the GSSI pipeline.")
    parser.add_argument(
        "--api-key",
        type=str,
        default=os.environ.get("FRED_API_KEY", ""),
        help="FRED API key (or set FRED_API_KEY env var)",
    )
    parser.add_argument("--start", type=str, default="2018-01-01")
    parser.add_argument("--end", type=str, default="2024-12-31")
    parser.add_argument("--test-ratio", type=float, default=0.2)
    args = parser.parse_args()

    if not args.api_key:
        print("ERROR: Provide --api-key or set the FRED_API_KEY environment variable.")
        sys.exit(1)

    results = run_pipeline(
        fred_api_key=args.api_key,
        start=args.start,
        end=args.end,
        test_ratio=args.test_ratio,
    )

    print("\n--- GSSI (last 12 months) ---")
    print(results["df"][["gssi", "stress_zone"]].tail(12).to_string())
    print("\n--- 3-Month Forecast ---")
    print(results["forecast"].to_string())
    print("\n--- Model Metrics ---")
    for k, v in results["model_metrics"].items():
        print(f"  {k}: {v}")

