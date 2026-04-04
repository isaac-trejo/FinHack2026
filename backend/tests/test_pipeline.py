"""
test_pipeline.py
----------------
Unit tests for the GSSI pipeline components:
  - Data loading and merging
  - Feature engineering
  - GSSI index calculation
  - Forecast model train/predict

Run with: pytest tests/test_pipeline.py -v
"""

import sys
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Ensure the backend root is on the path regardless of how pytest is invoked.
# ---------------------------------------------------------------------------
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from services.data_pipeline import fill_missing, normalize_features, merge_datasets
from services.feature_engineering import (
    compute_pct_change,
    compute_rolling_mean,
    compute_rolling_volatility,
    engineer_features,
)
from models.gssi_model import GSSIModel
from models.forecast_model import ForecastModel


# ===========================================================================
# Fixtures
# ===========================================================================

@pytest.fixture
def sample_df() -> pd.DataFrame:
    """Minimal DataFrame with two numeric columns and a DatetimeIndex."""
    dates = pd.date_range("2024-01-01", periods=20, freq="D")
    rng = np.random.default_rng(42)
    df = pd.DataFrame(
        {
            "oil": rng.uniform(50, 120, 20),
            "sp500": rng.uniform(3000, 5000, 20),
        },
        index=dates,
    )
    return df


@pytest.fixture
def sample_csv(tmp_path: Path) -> list:
    """Write two tiny CSV files to a temp directory and return their paths."""
    dates = pd.date_range("2024-01-01", periods=30, freq="D")
    rng = np.random.default_rng(0)

    oil_df = pd.DataFrame({"date": dates, "oil": rng.uniform(50, 120, 30)})
    inf_df = pd.DataFrame({"date": dates, "inflation": rng.uniform(0.01, 0.1, 30)})

    oil_path = tmp_path / "oil.csv"
    inf_path = tmp_path / "inflation.csv"
    oil_df.to_csv(oil_path, index=False)
    inf_df.to_csv(inf_path, index=False)

    return [str(oil_path), str(inf_path)]


# ===========================================================================
# Data Pipeline Tests
# ===========================================================================

class TestDataPipeline:

    def test_merge_datasets(self, sample_csv: list):
        """Merged DataFrame should contain columns from both source files."""
        df = merge_datasets(sample_csv, date_col="date")
        assert "oil" in df.columns
        assert "inflation" in df.columns
        assert len(df) == 30

    def test_merge_raises_on_empty(self):
        """merge_datasets should raise ValueError for an empty list."""
        with pytest.raises(ValueError):
            merge_datasets([])

    def test_fill_missing_no_residual_nans(self, sample_df: pd.DataFrame):
        """After fill_missing, there should be no NaNs (for a complete series)."""
        df_with_nan = sample_df.copy()
        df_with_nan.iloc[0] = np.nan
        df_filled = fill_missing(df_with_nan)
        assert df_filled.isna().sum().sum() == 0

    def test_normalize_features_range(self, sample_df: pd.DataFrame):
        """All normalized columns should be in [0, 1]."""
        df_norm = normalize_features(sample_df)
        assert df_norm["oil"].min() >= 0.0
        assert df_norm["oil"].max() <= 1.0
        assert df_norm["sp500"].min() >= 0.0
        assert df_norm["sp500"].max() <= 1.0

    def test_normalize_specific_columns(self, sample_df: pd.DataFrame):
        """Only specified columns should be normalized."""
        df_norm = normalize_features(sample_df, columns=["oil"])
        # oil should be in [0, 1], sp500 should be unchanged
        assert df_norm["oil"].max() <= 1.0
        pd.testing.assert_series_equal(df_norm["sp500"], sample_df["sp500"])


# ===========================================================================
# Feature Engineering Tests
# ===========================================================================

class TestFeatureEngineering:

    def test_pct_change_columns_added(self, sample_df: pd.DataFrame):
        """compute_pct_change should add '<col>_change' columns."""
        result = compute_pct_change(sample_df, columns=["oil"])
        assert "oil_change" in result.columns

    def test_pct_change_first_row_nan(self, sample_df: pd.DataFrame):
        """The first pct_change value should be NaN."""
        result = compute_pct_change(sample_df, columns=["oil"])
        assert pd.isna(result["oil_change"].iloc[0])

    def test_rolling_mean_columns_added(self, sample_df: pd.DataFrame):
        """compute_rolling_mean should add '<col>_roll_mean' columns."""
        result = compute_rolling_mean(sample_df, columns=["oil"], window=3)
        assert "oil_roll_mean" in result.columns

    def test_rolling_volatility_non_negative(self, sample_df: pd.DataFrame):
        """Rolling standard deviation should always be >= 0."""
        result = compute_rolling_volatility(sample_df, columns=["oil"], window=3)
        assert (result["oil_volatility"] >= 0).all()

    def test_engineer_features_no_residual_nans(self, sample_df: pd.DataFrame):
        """engineer_features should not leave any NaN values in the output."""
        result = engineer_features(sample_df)
        assert result.isna().sum().sum() == 0

    def test_engineer_features_row_count(self, sample_df: pd.DataFrame):
        """engineer_features should drop exactly 1 row (pct_change NaN row)."""
        result = engineer_features(sample_df)
        assert len(result) == len(sample_df) - 1


# ===========================================================================
# GSSI Model Tests
# ===========================================================================

class TestGSSIModel:

    def test_default_weights_sum_to_one(self):
        """Normalized default weights must sum to 1."""
        model = GSSIModel()
        total = sum(model.normalized_weights.values())
        assert abs(total - 1.0) < 1e-9

    def test_custom_weights(self):
        """Custom weights should be accepted and normalized."""
        weights = {"oil_change": 1.0, "inflation_change": 1.0}
        model = GSSIModel(weights=weights)
        assert abs(sum(model.normalized_weights.values()) - 1.0) < 1e-9

    def test_compute_produces_series(self, sample_df: pd.DataFrame):
        """compute() should return a pandas Series named 'gssi'."""
        df = engineer_features(sample_df)
        weights = {"oil_change": 0.5, "sp500_change": 0.5}
        model = GSSIModel(weights=weights)
        gssi = model.compute(df)
        assert isinstance(gssi, pd.Series)
        assert gssi.name == "gssi"
        assert len(gssi) == len(df)

    def test_compute_raises_on_missing_features(self):
        """compute() should raise ValueError when no features match."""
        df = pd.DataFrame({"unrelated_col": [1, 2, 3]})
        model = GSSIModel()
        with pytest.raises(ValueError):
            model.compute(df)

    def test_zero_weights_raises(self):
        """GSSIModel should raise ValueError if all weights are zero."""
        with pytest.raises(ValueError):
            GSSIModel(weights={"oil_change": 0.0})

    def test_feature_importance_sorted(self):
        """feature_importance() should return weights sorted descending."""
        model = GSSIModel(weights={"oil_change": 0.1, "inflation_change": 0.9})
        importance = model.feature_importance()
        values = importance.tolist()
        assert values == sorted(values, reverse=True)


# ===========================================================================
# Forecast Model Tests
# ===========================================================================

class TestForecastModel:

    def _make_gssi_df(self, sample_df: pd.DataFrame) -> pd.DataFrame:
        """Helper: engineer features + attach a synthetic GSSI column."""
        df = engineer_features(sample_df)
        weights = {"oil_change": 0.5, "sp500_change": 0.5}
        gssi_model = GSSIModel(weights=weights)
        df["gssi"] = gssi_model.compute(df)
        return df

    def test_time_split_ratio(self, sample_df: pd.DataFrame):
        """time_split should respect the test_ratio approximately."""
        df = self._make_gssi_df(sample_df)
        train, test = ForecastModel.time_split(df, test_ratio=0.2)
        assert len(train) + len(test) == len(df)
        assert len(test) == pytest.approx(len(df) * 0.2, abs=1)

    def test_time_split_order(self, sample_df: pd.DataFrame):
        """Train dates should all precede test dates."""
        df = self._make_gssi_df(sample_df)
        train, test = ForecastModel.time_split(df, test_ratio=0.2)
        assert train.index.max() < test.index.min()

    def test_train_returns_metrics(self, sample_df: pd.DataFrame):
        """train() should return a dict with r2, mae, rmse keys."""
        df = self._make_gssi_df(sample_df)
        model = ForecastModel()
        metrics = model.train(df, target_col="gssi")
        assert set(metrics.keys()) == {"r2", "mae", "rmse"}

    def test_predict_returns_series(self, sample_df: pd.DataFrame):
        """predict() should return a Series with the same index as input."""
        df = self._make_gssi_df(sample_df)
        train, test = ForecastModel.time_split(df, test_ratio=0.2)
        model = ForecastModel()
        model.train(train, target_col="gssi")
        preds = model.predict(test)
        assert isinstance(preds, pd.Series)
        assert list(preds.index) == list(test.index)

    def test_predict_raises_before_training(self, sample_df: pd.DataFrame):
        """predict() should raise RuntimeError if called before train()."""
        df = self._make_gssi_df(sample_df)
        model = ForecastModel()
        with pytest.raises(RuntimeError):
            model.predict(df)

    def test_feature_importance_length(self, sample_df: pd.DataFrame):
        """feature_importance() should have one entry per feature column."""
        df = self._make_gssi_df(sample_df)
        model = ForecastModel()
        model.train(df, target_col="gssi")
        importance = model.feature_importance()
        expected_n_features = len([c for c in df.columns if c != "gssi"])
        assert len(importance) == expected_n_features
