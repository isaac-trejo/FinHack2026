"""
forecast_model.py
-----------------
Autoregressive Linear Regression model for GSSI forecasting.

Uses only historical GSSI values (no external features) with lag features
(lag_1 … lag_6) to predict the next month's index value.
Supports iterative multi-step forecasting.
"""

import logging
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score, mean_absolute_error, root_mean_squared_error

logger = logging.getLogger(__name__)

N_LAGS = 12  # Number of autoregressive lag months


def _build_lag_features(gssi: pd.Series, n_lags: int = N_LAGS) -> pd.DataFrame:
    """Create a supervised learning DataFrame from a GSSI time series.

    Each row contains the previous ``n_lags`` GSSI values as features
    (lag_1 = t-1, lag_6 = t-6) and the current value as the target.
    Rows with NaN lag values (the first ``n_lags`` rows) are dropped.

    Args:
        gssi: Monthly GSSI Series with a DatetimeIndex, values in [0, 1].
        n_lags: Number of lagged periods to use as features.

    Returns:
        DataFrame with columns [lag_1, …, lag_n_lags, gssi], NaNs dropped.
    """
    df = pd.DataFrame({"gssi": gssi})
    for lag in range(1, n_lags + 1):
        df[f"lag_{lag}"] = gssi.shift(lag)
    return df.dropna()


class ForecastModel:
    """Autoregressive Linear Regression model for GSSI forecasting.

    Trained exclusively on lagged GSSI values — no external macro features.
    Supports iterative multi-step forecasting by feeding each prediction
    back as a lag for the next step.

    Attributes:
        n_lags: Number of autoregressive lag periods.
        lag_cols: Ordered list of lag column names [lag_1, …, lag_n_lags].
        model: Underlying LinearRegression instance.
        is_trained: Whether the model has been fitted.
    """

    def __init__(self, n_lags: int = N_LAGS) -> None:
        """Initialize the forecast model.

        Args:
            n_lags: Number of autoregressive lag features to build.
        """
        self.n_lags = n_lags
        self.lag_cols: List[str] = [f"lag_{i}" for i in range(1, n_lags + 1)]
        self.model = LinearRegression()
        self.is_trained = False

    @staticmethod
    def time_split(
        df: pd.DataFrame,
        test_ratio: float = 0.2,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Chronological train/test split that preserves temporal ordering.

        Args:
            df: Lag-feature DataFrame produced by ``_build_lag_features``.
            test_ratio: Fraction of rows reserved for the test set.

        Returns:
            Tuple of (train_df, test_df).

        Raises:
            ValueError: If ``test_ratio`` is not strictly between 0 and 1.
        """
        if not 0 < test_ratio < 1:
            raise ValueError("test_ratio must be strictly between 0 and 1.")
        split_idx = int(len(df) * (1 - test_ratio))
        train, test = df.iloc[:split_idx], df.iloc[split_idx:]
        logger.info("Train rows: %d | Test rows: %d", len(train), len(test))
        return train, test

    def train(self, gssi: pd.Series, test_ratio: float = 0.2) -> dict:
        """Build lag features from the GSSI series and fit LinearRegression.

        Args:
            gssi: Monthly GSSI Series (DatetimeIndex, values in [0, 1]).
            test_ratio: Fraction of data held out for evaluation.

        Returns:
            Dict with ``"train_r2"`` and ``"test_r2"`` scores.
        """
        lag_df = _build_lag_features(gssi, n_lags=self.n_lags)
        train_df, test_df = self.time_split(lag_df, test_ratio=test_ratio)

        X_train = train_df[self.lag_cols].values
        y_train = train_df["gssi"].values
        X_test = test_df[self.lag_cols].values
        y_test = test_df["gssi"].values

        self.model.fit(X_train, y_train)
        self.is_trained = True

        pred_train = self.model.predict(X_train)
        pred_test = self.model.predict(X_test)

        metrics = {
            "train_r2": round(r2_score(y_train, pred_train), 4),
            "test_r2": round(r2_score(y_test, pred_test), 4),
            "train_mae": round(mean_absolute_error(y_train, pred_train), 4),
            "test_mae": round(mean_absolute_error(y_test, pred_test), 4),
            "train_rmse": round(root_mean_squared_error(y_train, pred_train), 4),
            "test_rmse": round(root_mean_squared_error(y_test, pred_test), 4),
        }
        logger.info("ForecastModel metrics: %s", metrics)
        return metrics

    def predict_next(self, gssi: pd.Series, n_months: int = 3) -> pd.Series:
        """Iteratively forecast the next ``n_months`` GSSI values.

        Each predicted value is appended to the lag window and used to
        produce the following step, enabling multi-step forecasting without
        requiring real future data.

        The lag window is ordered oldest→newest:
          window[-1] = lag_1 (most recent), window[0] = lag_n_lags (oldest)

        Args:
            gssi: Historical GSSI Series used to seed the lag window.
                  Must contain at least ``n_lags`` observations.
            n_months: Number of future monthly values to predict.

        Returns:
            Series of predicted GSSI values with a monthly DatetimeIndex
            starting from the month after the last observed date.
            Values are clipped to [0, 1].

        Raises:
            RuntimeError: If the model has not been trained yet.
            ValueError: If ``gssi`` has fewer than ``n_lags`` observations.
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before calling predict_next().")
        if len(gssi) < self.n_lags:
            raise ValueError(
                f"Need at least {self.n_lags} observations to seed the lag window."
            )

        # Seed window: oldest at index 0, most recent at index -1
        window: List[float] = list(gssi.values[-self.n_lags:])
        last_date = gssi.index[-1]

        forecasts: List[float] = []
        dates: List[pd.Timestamp] = []

        for step in range(1, n_months + 1):
            # Build feature row: lag_1=window[-1], lag_2=window[-2], …
            x = np.array(window[::-1]).reshape(1, -1)
            predicted = float(np.clip(self.model.predict(x)[0], 0.0, 1.0))

            forecasts.append(predicted)
            dates.append(last_date + pd.DateOffset(months=step))

            # Slide window: drop oldest, append new prediction
            window.pop(0)
            window.append(predicted)

        forecast_series = pd.Series(
            forecasts,
            index=pd.DatetimeIndex(dates),
            name="gssi_forecast",
        )
        logger.info("%d-month forecast:\n%s", n_months, forecast_series.to_string())
        return forecast_series

