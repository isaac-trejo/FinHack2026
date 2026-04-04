"""
feature_engineering.py
-----------------------
Derives interpretable features from the cleaned dataset for use in
the Global Supply Chain Stress Index (GSSI) model.
"""

import logging
from typing import List, Optional

import pandas as pd

logger = logging.getLogger(__name__)


def compute_pct_change(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    suffix: str = "_change",
) -> pd.DataFrame:
    """Add percentage-change features for the specified columns.

    Args:
        df: Input DataFrame with numeric columns.
        columns: Columns to compute pct change for.
                 Defaults to all numeric columns.
        suffix: String appended to each new column name.

    Returns:
        DataFrame with additional ``<col><suffix>`` columns.
    """
    df = df.copy()
    cols = columns if columns is not None else df.select_dtypes("number").columns.tolist()

    for col in cols:
        new_col = f"{col}{suffix}"
        df[new_col] = df[col].pct_change()
        logger.debug("Computed pct_change for column '%s' -> '%s'", col, new_col)

    return df


def compute_rolling_mean(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    window: int = 5,
    suffix: str = "_roll_mean",
) -> pd.DataFrame:
    """Add rolling average features for the specified columns.

    Args:
        df: Input DataFrame with numeric columns.
        columns: Columns to smooth. Defaults to all numeric columns.
        window: Rolling window size (number of periods).
        suffix: String appended to each new column name.

    Returns:
        DataFrame with additional ``<col><suffix>`` columns.
    """
    df = df.copy()
    cols = columns if columns is not None else df.select_dtypes("number").columns.tolist()

    for col in cols:
        new_col = f"{col}{suffix}"
        df[new_col] = df[col].rolling(window=window, min_periods=1).mean()
        logger.debug(
            "Computed rolling mean (window=%d) for '%s' -> '%s'", window, col, new_col
        )

    return df


def compute_rolling_volatility(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    window: int = 5,
    suffix: str = "_volatility",
) -> pd.DataFrame:
    """Add rolling standard-deviation (volatility) features.

    Args:
        df: Input DataFrame with numeric columns.
        columns: Columns to compute volatility for.
                 Defaults to all numeric columns.
        window: Rolling window size (number of periods).
        suffix: String appended to each new column name.

    Returns:
        DataFrame with additional ``<col><suffix>`` columns.
    """
    df = df.copy()
    cols = columns if columns is not None else df.select_dtypes("number").columns.tolist()

    for col in cols:
        new_col = f"{col}{suffix}"
        df[new_col] = df[col].rolling(window=window, min_periods=1).std().fillna(0)
        logger.debug(
            "Computed rolling volatility (window=%d) for '%s' -> '%s'", window, col, new_col
        )

    return df


def engineer_features(
    df: pd.DataFrame,
    base_columns: Optional[List[str]] = None,
    window: int = 5,
) -> pd.DataFrame:
    """Apply all feature-engineering steps in sequence.

    Computes percentage change, rolling mean, and rolling volatility
    for each base column and drops rows that are all-NaN after
    pct_change computation.

    Args:
        df: Cleaned, normalized input DataFrame.
        base_columns: Source columns to derive features from.
                      Defaults to all numeric columns.
        window: Rolling window size shared across all rolling steps.

    Returns:
        DataFrame enriched with all derived features, with leading
        NaN rows from pct_change dropped.
    """
    cols = base_columns if base_columns is not None else df.select_dtypes("number").columns.tolist()

    df = compute_pct_change(df, columns=cols)
    df = compute_rolling_mean(df, columns=cols, window=window)
    df = compute_rolling_volatility(df, columns=cols, window=window)

    # Drop the first row which will have NaN from pct_change
    df = df.dropna(how="all").dropna(subset=[f"{c}_change" for c in cols])

    # Replace any residual NaNs introduced by rolling on short series
    df = df.fillna(0)

    logger.info("Feature engineering complete. Final shape: %s", df.shape)
    return df
