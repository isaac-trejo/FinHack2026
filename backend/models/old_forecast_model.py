"""
old_forecast_model.py
---------------------
Baseline linear-regression forecaster for the GSSI time series.

This is the naive approach we started with before moving to the
two-stage Huber residual model.  Kept for comparison so judges can
see the improvement.

Limitations (by design):
  - Plain OLS is sensitive to outliers (COVID, Ukraine shock).
  - Lag-only features miss cross-signal information.
  - Recursive multi-step forecast compounds errors.
  - No residual decomposition → model must learn both trend and noise.
"""

import logging

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def create_lag_features(df: pd.DataFrame, n_lags: int = 6) -> pd.DataFrame:
    """Add lag_1 … lag_n columns and drop rows with NaNs."""
    out = df.copy()
    for lag in range(1, n_lags + 1):
        out[f"lag_{lag}"] = out["gssi"].shift(lag)
    out.dropna(inplace=True)
    out.reset_index(drop=True, inplace=True)
    return out


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_model(df: pd.DataFrame, train_ratio: float = 0.80):
    """Chronological 80/20 split → fit LinearRegression on lag features.

    Returns (model, X_train, X_test, y_train, y_test).
    """
    feat = create_lag_features(df)
    feature_cols = [c for c in feat.columns if c.startswith("lag_")]
    X = feat[feature_cols]
    y = feat["gssi"]

    split = int(len(feat) * train_ratio)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    logger.info("Training baseline linear regression model...")
    logger.info("Train size: %d, Test size: %d", len(X_train), len(X_test))

    model = LinearRegression()
    model.fit(X_train, y_train)

    return model, X_train, X_test, y_train, y_test


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_model(model, X_test: pd.DataFrame, y_test: pd.Series):
    """Compute and log R² and MSE on the held-out test set."""
    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)

    logger.info("R² Score: %.4f", r2)
    logger.info("MSE:      %.6f", mse)

    return {"r2": round(r2, 4), "mse": round(mse, 6), "y_pred": y_pred}


# ---------------------------------------------------------------------------
# Recursive multi-step forecast
# ---------------------------------------------------------------------------

def forecast_next_steps(
    model,
    last_known_values: np.ndarray,
    steps: int = 3,
) -> list[float]:
    """Predict *steps* months ahead by feeding each prediction back in.

    Parameters
    ----------
    last_known_values : array of shape (n_lags,)
        Most recent GSSI values in chronological order (oldest first).
    steps : number of months to forecast.

    Returns
    -------
    List of predicted GSSI values for months +1 … +steps.
    """
    logger.info("Generating %d-step forecast...", steps)

    window = list(last_known_values)
    forecasts: list[float] = []

    for i in range(steps):
        # Features are [lag_1, lag_2, …, lag_n] = most recent first
        features = np.array(window[-1::-1][: model.n_features_in_]).reshape(1, -1)
        pred = float(model.predict(features)[0])
        pred = np.clip(pred, 0.0, 1.0)
        forecasts.append(round(pred, 4))
        window.append(pred)

    for i, val in enumerate(forecasts, start=1):
        logger.info("  Month +%d: %.4f", i, val)

    return forecasts


# ---------------------------------------------------------------------------
# Self-contained demo
# ---------------------------------------------------------------------------

def _generate_synthetic_gssi(n: int = 84) -> pd.DataFrame:
    """Create ~7 years of plausible monthly GSSI data for demo purposes."""
    rng = np.random.default_rng(42)
    trend = np.linspace(0.30, 0.55, n)
    # Add a COVID-like spike around month 50
    spike = 0.25 * np.exp(-0.5 * ((np.arange(n) - 50) / 3) ** 2)
    noise = rng.normal(0, 0.02, n)
    gssi = np.clip(trend + spike + noise, 0, 1)

    dates = pd.date_range("2018-01-01", periods=n, freq="MS")
    return pd.DataFrame({"date": dates, "gssi": gssi})


def run_demo():
    """End-to-end demo: generate data → train → evaluate → forecast."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
    )

    print("=" * 60)
    print("  GSSI Baseline Model Demo (Linear Regression + Lags)")
    print("=" * 60)

    df = _generate_synthetic_gssi()
    print(f"\nDataset: {len(df)} monthly observations")
    print(f"Date range: {df['date'].iloc[0].date()} → {df['date'].iloc[-1].date()}")
    print(f"GSSI range: {df['gssi'].min():.4f} – {df['gssi'].max():.4f}\n")

    model, X_train, X_test, y_train, y_test = train_model(df)

    print()
    results = evaluate_model(model, X_test, y_test)

    # Show a few sample predictions vs actuals
    print("\nSample predictions (last 5 test months):")
    print(f"  {'Actual':>8}  {'Predicted':>10}")
    for actual, pred in zip(
        y_test.values[-5:], results["y_pred"][-5:]
    ):
        print(f"  {actual:8.4f}  {pred:10.4f}")

    # Forecast next 3 months from the last known data
    print()
    last_vals = df["gssi"].values[-6:]  # last 6 known values
    forecasts = forecast_next_steps(model, last_vals, steps=3)

    print("\n" + "=" * 60)
    print("  Demo complete.")
    print("=" * 60)

    return results, forecasts


if __name__ == "__main__":
    run_demo()
