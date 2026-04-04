"""
data_pipeline.py
----------------
Fetches 7 macroeconomic signals from the FRED API, resamples to monthly
frequency, normalizes to [0, 1], and inverts the low-stress signals
(Imports, Manufacturing Employment) so HIGH always means MORE stress.
"""

import logging
from typing import Dict

import pandas as pd
from fredapi import Fred
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)

# FRED series IDs → column names used throughout the pipeline
FRED_SERIES: Dict[str, str] = {
    "TSIFRGHT": "Freight", # Freight Transport Services Index – LOW  = stress (inverted)
    "IMPGSC1": "Imports",  # US Imports of G&S               – LOW  = stress (inverted)
    "DCOILWTICO": "Oil",   # WTI Crude Oil                   – HIGH = stress
    "CPIAUCSL": "CPI",     # Consumer Price Index            – HIGH = stress
    "PPIACO": "PPI",       # Producer Price Index            – HIGH = stress
    "MANEMP": "MFG",       # Manufacturing Employment        – LOW  = stress (inverted)
    "VIXCLS": "VIX",       # CBOE Volatility Index           – HIGH = stress
}

# Signals reported at daily frequency that need monthly resampling
DAILY_SERIES = {"Oil", "VIX"}

# Signals where LOW values indicate MORE stress → inverted after normalization
INVERT_SIGNALS = {"Freight", "Imports", "MFG"}


def fetch_fred_data(
    api_key: str,
    start: str = "2018-01-01",
    end: str = "2024-12-31",
) -> pd.DataFrame:
    """Fetch all 7 GSSI signals from FRED and align to a monthly index.

    Daily series (BDI, Oil, VIX) are resampled to monthly mean.
    Monthly series are re-indexed to month-start dates for consistency.

    Args:
        api_key: FRED API key string.
        start: Earliest observation date (YYYY-MM-DD).
        end: Latest observation date (YYYY-MM-DD).

    Returns:
        DataFrame with one column per signal, indexed by month-start dates.
    """
    fred = Fred(api_key=api_key)
    frames: Dict[str, pd.Series] = {}

    for series_id, col_name in FRED_SERIES.items():
        logger.info("Fetching %s (%s)...", col_name, series_id)
        raw: pd.Series = fred.get_series(
            series_id, observation_start=start, observation_end=end
        )
        raw.name = col_name

        if col_name in DAILY_SERIES:
            raw = raw.resample("MS").mean()
        else:
            # Normalize monthly index to month-start so all series align
            raw.index = raw.index.to_period("M").to_timestamp()

        frames[col_name] = raw

    df = pd.DataFrame(frames).sort_index()
    logger.info("Raw combined shape: %s", df.shape)
    return df


def fill_missing(df: pd.DataFrame) -> pd.DataFrame:
    """Fill NaN values with forward fill then back fill.

    Forward fill covers gaps mid-series; back fill handles leading NaNs.

    Args:
        df: DataFrame that may contain NaN values.

    Returns:
        DataFrame with NaNs filled.
    """
    filled = df.ffill().bfill()
    remaining = filled.isna().sum().sum()
    if remaining > 0:
        logger.warning("%d NaN values remain after filling.", remaining)
    return filled


def normalize_and_invert(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize all signals to [0, 1] and invert the low-stress signals.

    Inversion formula:
        ``<signal>_stress = 1 - normalized_<signal>``

    After inversion, the columns ``Imports`` and ``MFG`` are dropped and
    replaced by ``Imports_stress`` and ``MFG_stress`` respectively.

    Args:
        df: DataFrame of raw or filled signal values.

    Returns:
        DataFrame with all columns in [0, 1] and inverted columns renamed.
    """
    df = df.copy()
    cols = df.columns.tolist()

    scaler = MinMaxScaler()
    df[cols] = scaler.fit_transform(df[cols])
    logger.info("Normalized %d columns to [0, 1].", len(cols))

    for signal in INVERT_SIGNALS:
        if signal in df.columns:
            stress_col = f"{signal}_stress"
            df[stress_col] = 1.0 - df[signal]
            df.drop(columns=[signal], inplace=True)
            logger.info("Inverted '%s' → '%s'", signal, stress_col)

    return df


def build_dataset(
    api_key: str,
    start: str = "2018-01-01",
    end: str = "2024-12-31",
) -> pd.DataFrame:
    """Full data preparation: fetch → fill → normalize + invert.

    Args:
        api_key: FRED API key.
        start: Start date (YYYY-MM-DD).
        end: End date (YYYY-MM-DD).

    Returns:
        Clean, normalized monthly DataFrame ready for GSSI computation.
        Columns: BDI, Oil, CPI, PPI, VIX, Imports_stress, MFG_stress.
    """
    df = fetch_fred_data(api_key, start=start, end=end)
    df = fill_missing(df)
    df = normalize_and_invert(df)
    logger.info("Final dataset shape: %s | columns: %s", df.shape, df.columns.tolist())
    return df
