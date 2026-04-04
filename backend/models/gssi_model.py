"""
gssi_model.py
-------------
Constructs the Global Supply Chain Stress Index (GSSI) as a fixed
weighted sum of 7 normalized signals, and classifies each period into
a stress zone (HIGH / MEDIUM / LOW).
"""

import logging
from typing import Dict, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Fixed weights per the financial specification.
# All signals are pre-normalized to [0, 1]; weights sum exactly to 1.0.
# Inverted signals are already "high = stress" at this point.
GSSI_WEIGHTS: Dict[str, float] = {
    "Freight_stress": 0.20,
    "Imports_stress": 0.10,
    "Oil": 0.15,
    "CPI": 0.15,
    "PPI": 0.15,
    "MFG_stress": 0.10,
    "VIX": 0.15,
}


def classify_stress(gssi_value: float) -> str:
    """Classify a single GSSI score into a stress zone label.

    Thresholds per the financial specification:
      - GSSI >= 0.65              → "HIGH"
      - 0.40 <= GSSI < 0.65      → "MEDIUM"
      - GSSI < 0.40              → "LOW"

    Args:
        gssi_value: A GSSI score in [0, 1].

    Returns:
        One of ``"HIGH"``, ``"MEDIUM"``, or ``"LOW"``.
    """
    if gssi_value >= 0.65:
        return "HIGH"
    if gssi_value >= 0.40:
        return "MEDIUM"
    return "LOW"


class GSSIModel:
    """Computes the GSSI index from 7 fixed-weight signals.

    The index is the dot product of normalized signal values and their
    weights, guaranteed to be in [0, 1] when all inputs are in [0, 1].

    Attributes:
        weights: Feature-to-weight mapping (must sum to 1.0).
    """

    def __init__(self, weights: Optional[Dict[str, float]] = None) -> None:
        """Initialize the model with optional custom weights.

        Args:
            weights: Custom weight mapping. Defaults to the spec-defined
                     ``GSSI_WEIGHTS`` when None.
        """
        self.weights: Dict[str, float] = (
            weights if weights is not None else GSSI_WEIGHTS.copy()
        )
        total = sum(self.weights.values())
        if abs(total - 1.0) > 1e-6:
            logger.warning(
                "Weights sum to %.6f (expected 1.0). Outputs may fall outside [0,1].",
                total,
            )
        logger.info("GSSIModel initialized. Weights: %s", self.weights)

    def compute(self, df: pd.DataFrame) -> pd.Series:
        """Compute the GSSI for each row as a weighted sum of signals.

        Only columns present in both the DataFrame and weight mapping are
        used. Missing columns are logged as warnings and skipped.

        Args:
            df: DataFrame with normalized signal columns (values in [0, 1]).

        Returns:
            Series named ``"gssi"`` with values in approximately [0, 1].

        Raises:
            ValueError: If none of the weighted signals exist in ``df``.
        """
        available = {col: w for col, w in self.weights.items() if col in df.columns}
        missing = set(self.weights) - set(available)

        if missing:
            logger.warning("Missing signal columns (skipped): %s", missing)
        if not available:
            raise ValueError(
                "No GSSI signal columns found in DataFrame. "
                f"Expected: {list(self.weights.keys())}"
            )

        gssi = sum(df[col] * w for col, w in available.items())
        gssi.name = "gssi"
        logger.info("GSSI computed. Mean=%.4f, Std=%.4f", gssi.mean(), gssi.std())
        return gssi

    def compute_with_zones(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute GSSI and append a stress-zone classification column.

        Args:
            df: DataFrame with normalized signal columns.

        Returns:
            Copy of input DataFrame with two new columns:
              - ``"gssi"``        – computed index value in [0, 1]
              - ``"stress_zone"`` – one of "HIGH", "MEDIUM", "LOW"
        """
        df = df.copy()
        df["gssi"] = self.compute(df)
        df["stress_zone"] = df["gssi"].map(classify_stress)
        logger.info(
            "Stress zone distribution:\n%s",
            df["stress_zone"].value_counts().to_string(),
        )
        return df

    def feature_importance(self) -> pd.Series:
        """Return signal weights as a Series sorted descending.

        Returns:
            Series of weights indexed by signal name.
        """
        return pd.Series(self.weights, name="weight").sort_values(ascending=False)

