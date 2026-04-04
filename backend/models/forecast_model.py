"""
forecast_model.py
-----------------
Two-stage residual forecasting for the GSSI time series.

WHY STANDARD REGRESSION FAILS ON SYNTHETIC INDICES
---------------------------------------------------
The GSSI is a weighted sum of 7 normalized signals that move
semi-independently.  Standard regression on raw GSSI levels fails
because:

  1. Error compounding: predicting a single composite number requires
     the model to implicitly nail all 7 components simultaneously.
     Any per-component error gets amplified through the weighted sum.

  2. Low signal-to-noise ratio: raw index levels are dominated by slow
     trends.  Month-to-month changes are small relative to the level,
     so squared-error loss is dominated by the level offset, not by the
     dynamics the model should learn.

  3. Outlier sensitivity: extreme months (COVID) produce squared-error
     gradients that overwhelm the rest of the training signal.

  4. Naive baselines are strong: on trending data, "predict last value"
     is hard to beat with R².  R² can be negative even when the model
     captures directional changes, because it penalizes scale mismatch
     versus the variance of the level.

HOW THIS MODULE ADDRESSES EACH ISSUE
-------------------------------------
  1. Two-stage component modeling:  each of the 7 signals gets its own
     small model.  GSSI is reconstructed from component predictions via
     fixed weights.  Errors stay isolated per component.

  2. Target transformation (residual modeling):  models predict the
     deviation from an EWMA baseline, not the raw level.  The baseline
     handles the trend; the model only learns short-horizon surprises.
     This drastically reduces target variance.

  3. Huber regression:  linear loss for large errors limits the
     influence of outlier months.

  4. RAE as primary metric:  Relative Absolute Error = MAE / MAE_naive.
     RAE < 1 means improvement over naive last-value.  This is fairer
     than R² for residual targets that have low variance.

  5. Walk-forward evaluation:  expanding-window folds with no random
     shuffling.  Baselines included: naive last-value, rolling mean,
     historical mean.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import HuberRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# ── Hyperparameters ──────────────────────────────────────────────────────────
EWMA_SPAN = 6           # months for baseline EWMA
N_LAGS = 3              # residual lags (lean for ~80 observations)
ROLLING_VOL_WINDOW = 3  # rolling std window
DEFAULT_TEST_WINDOW = 3 # months per walk-forward test fold
HUBER_EPSILON = 1.35    # Huber transition (sklearn default)
HUBER_ALPHA = 0.01      # L2 regularization inside HuberRegressor


# ── Metric helpers ───────────────────────────────────────────────────────────

def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def _rae(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_naive: np.ndarray,
) -> float:
    """Relative Absolute Error: MAE(model) / MAE(naive).  < 1 beats naive."""
    mae_model = mean_absolute_error(y_true, y_pred)
    mae_naive = mean_absolute_error(y_true, y_naive)
    if mae_naive < 1e-12:
        return 1.0
    return float(mae_model / mae_naive)


def _compute_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_naive: np.ndarray,
) -> Dict[str, float]:
    return {
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "rmse": round(_rmse(y_true, y_pred), 4),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 4),
        "rae": round(_rae(y_true, y_pred, y_naive), 4),
    }


# ── Baseline / Residual decomposition ───────────────────────────────────────

def _ewma(series: pd.Series, span: int = EWMA_SPAN) -> pd.Series:
    """Causal EWMA — value at t uses only observations up to t."""
    return series.ewm(span=span, adjust=False).mean()


def _decompose(
    series: pd.Series,
    span: int = EWMA_SPAN,
) -> Tuple[pd.Series, pd.Series]:
    """Decompose into one-step-ahead baseline and residual.

    baseline(t) = ewma(t-1)  — the "forecast" for time t made at t-1
    residual(t) = series(t) - baseline(t)  — the "surprise" at time t

    The model learns to predict residual(t) from features known at t-1.
    Reconstruction: predicted(t) = baseline(t) + predicted_residual(t).
    """
    ewma_vals = _ewma(series, span)
    baseline = ewma_vals.shift(1)  # one-step-ahead baseline
    residual = series - baseline
    return baseline, residual


# ── Feature engineering ──────────────────────────────────────────────────────

def _build_component_features(
    residual: pd.Series,
    raw_signal: pd.Series,
    n_lags: int = N_LAGS,
) -> pd.DataFrame:
    """Features for predicting one component's next-month residual.

    All features use information available at time t-1 to predict
    residual(t).  No contemporaneous or future information.

    Features:
      resid_lag_1..n  — past residuals (short-memory autoregression)
      resid_vol_3     — recent residual volatility (regime indicator)
      momentum_3      — 3-month raw-signal change (trend persistence)
      level           — last known raw signal value (location anchor)
    """
    df = pd.DataFrame(index=residual.index)

    for lag in range(1, n_lags + 1):
        df[f"resid_lag_{lag}"] = residual.shift(lag)

    df["resid_vol_3"] = residual.shift(1).rolling(ROLLING_VOL_WINDOW).std()
    df["momentum_3"] = raw_signal.shift(1) - raw_signal.shift(n_lags + 1)
    df["level"] = raw_signal.shift(1)

    return df


def _build_gssi_features(
    gssi_residual: pd.Series,
    gssi_raw: pd.Series,
    component_df: pd.DataFrame,
    n_lags: int = N_LAGS,
) -> pd.DataFrame:
    """Features for the single-GSSI residual model.

    Includes one cross-component feature (stress dispersion) that
    captures regime breadth — useful for numeric stability.
    """
    df = pd.DataFrame(index=gssi_raw.index)

    for lag in range(1, n_lags + 1):
        df[f"gssi_resid_lag_{lag}"] = gssi_residual.shift(lag)

    df["gssi_vol_3"] = gssi_residual.shift(1).rolling(ROLLING_VOL_WINDOW).std()
    df["gssi_momentum_3"] = gssi_raw.shift(1) - gssi_raw.shift(n_lags + 1)
    df["gssi_level"] = gssi_raw.shift(1)

    # Cross-component stress dispersion: max - min across components
    shifted_comp = component_df.shift(1)
    df["stress_spread"] = shifted_comp.max(axis=1) - shifted_comp.min(axis=1)

    return df


# ── Per-component residual model ─────────────────────────────────────────────

class _ComponentModel:
    """Thin wrapper: StandardScaler + HuberRegressor for one signal."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.pipeline: Optional[Pipeline] = None
        self.feature_cols: List[str] = []
        self.is_fitted = False

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> None:
        self.feature_cols = list(X.columns)
        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("huber", HuberRegressor(
                epsilon=HUBER_EPSILON, alpha=HUBER_ALPHA, max_iter=1000,
            )),
        ])
        self.pipeline.fit(X, y)
        self.is_fitted = True

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        if not self.is_fitted or self.pipeline is None:
            raise RuntimeError(f"_ComponentModel('{self.name}') not fitted.")
        return self.pipeline.predict(X[self.feature_cols])


# ── Main ForecastModel ───────────────────────────────────────────────────────

class ForecastModel:
    """Two-stage residual forecaster for the GSSI index.

    Strategy
    --------
    1. Decompose each component signal into (EWMA baseline, residual).
    2. Train a HuberRegressor per component to predict next-month residual.
    3. Reconstruct GSSI = sum(weight_i * (baseline_i + predicted_residual_i)).

    Also trains a single-GSSI residual model as a comparison / fallback.

    Walk-forward evaluation compares five variants:
      naive_last         — last observed GSSI (strong baseline)
      rolling_mean       — 3-month rolling average
      mean_pred          — historical training mean
      component_residual — two-stage component prediction (primary)
      gssi_residual      — single-index residual prediction (fallback)
    """

    def __init__(
        self,
        weights: Optional[Dict[str, float]] = None,
        n_lags: int = N_LAGS,
        ewma_span: int = EWMA_SPAN,
    ) -> None:
        self.weights: Dict[str, float] = weights or {}
        self.n_lags = n_lags
        self.ewma_span = ewma_span

        self.component_models: Dict[str, _ComponentModel] = {}
        self.gssi_pipeline: Optional[Pipeline] = None
        self.gssi_feature_cols: List[str] = []

        self.is_trained = False
        self.selected_model_name: Optional[str] = None
        self.last_metrics: Dict[str, Any] = {}
        self.fold_metrics: List[Dict[str, Any]] = []
        self.summary_metrics: List[Dict[str, Any]] = []

    # ── Internal fitting helpers ─────────────────────────────────────────

    def _fit_components(self, comp_df: pd.DataFrame) -> None:
        """Fit one residual model per weighted component."""
        for col in self.weights:
            if col not in comp_df.columns:
                logger.warning("Component '%s' not in DataFrame — skipped.", col)
                continue

            baseline, residual = _decompose(comp_df[col], self.ewma_span)
            features = _build_component_features(residual, comp_df[col], self.n_lags)

            target = residual.reindex(features.index)
            mask = features.notna().all(axis=1) & target.notna()
            X, y = features.loc[mask], target.loc[mask].to_numpy()

            if len(X) < self.n_lags + 2:
                logger.warning(
                    "Too few samples for '%s' (%d) — skipped.", col, len(X),
                )
                continue

            model = _ComponentModel(col)
            model.fit(X, y)
            self.component_models[col] = model

    def _fit_gssi_residual(
        self,
        comp_df: pd.DataFrame,
        gssi: pd.Series,
    ) -> None:
        """Fit the single-GSSI residual model."""
        baseline, residual = _decompose(gssi, self.ewma_span)
        features = _build_gssi_features(residual, gssi, comp_df, self.n_lags)

        target = residual.reindex(features.index)
        mask = features.notna().all(axis=1) & target.notna()
        X, y = features.loc[mask], target.loc[mask].to_numpy()

        self.gssi_feature_cols = list(X.columns)
        self.gssi_pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("huber", HuberRegressor(
                epsilon=HUBER_EPSILON, alpha=HUBER_ALPHA, max_iter=1000,
            )),
        ])
        self.gssi_pipeline.fit(X, y)

    # ── Internal prediction helpers ──────────────────────────────────────

    def _predict_via_components(
        self,
        comp_df: pd.DataFrame,
        target_index: pd.DatetimeIndex,
    ) -> np.ndarray:
        """Predict GSSI at target_index via weighted component predictions."""
        gssi_pred = np.zeros(len(target_index))

        for col, weight in self.weights.items():
            if col not in comp_df.columns:
                continue

            baseline, residual = _decompose(comp_df[col], self.ewma_span)
            features = _build_component_features(
                residual, comp_df[col], self.n_lags,
            )

            # Baseline at target times (ewma from previous month)
            base_vals = baseline.reindex(target_index).to_numpy()

            if col in self.component_models:
                aligned = features.reindex(target_index)
                valid = aligned.notna().all(axis=1)
                pred_resid = np.zeros(len(target_index))
                if valid.any():
                    pred_resid[valid.to_numpy()] = (
                        self.component_models[col].predict(aligned.loc[valid])
                    )
                component_pred = base_vals + pred_resid
            else:
                component_pred = base_vals  # baseline only

            # NaN baseline (first row) → fall back to raw signal
            nan_mask = np.isnan(component_pred)
            if nan_mask.any():
                fallback = comp_df[col].reindex(target_index).to_numpy()
                component_pred[nan_mask] = fallback[nan_mask]

            gssi_pred += weight * component_pred

        return gssi_pred

    def _predict_via_gssi_residual(
        self,
        comp_df: pd.DataFrame,
        gssi: pd.Series,
        target_index: pd.DatetimeIndex,
    ) -> np.ndarray:
        """Predict GSSI at target_index using single-index residual model."""
        baseline, residual = _decompose(gssi, self.ewma_span)
        features = _build_gssi_features(residual, gssi, comp_df, self.n_lags)

        base_vals = baseline.reindex(target_index).to_numpy()
        pred_resid = np.zeros(len(target_index))

        if self.gssi_pipeline is not None:
            aligned = features.reindex(target_index)
            valid = aligned.notna().all(axis=1)
            if valid.any():
                pred_resid[valid.to_numpy()] = self.gssi_pipeline.predict(
                    aligned.loc[valid][self.gssi_feature_cols]
                )

        result = base_vals + pred_resid

        nan_mask = np.isnan(result)
        if nan_mask.any():
            fallback = gssi.reindex(target_index).to_numpy()
            result[nan_mask] = fallback[nan_mask]

        return result

    # ── Walk-forward evaluation ──────────────────────────────────────────

    @staticmethod
    def _walk_forward_windows(
        n: int,
        init: int,
        window: int,
        step: int,
    ) -> List[Tuple[int, int]]:
        wins: List[Tuple[int, int]] = []
        t = init
        while t < n:
            end = min(t + window, n)
            wins.append((t, end))
            if end == n:
                break
            t += step
        return wins

    def walk_forward_evaluate(
        self,
        comp_df: pd.DataFrame,
        gssi: pd.Series,
        initial_train: int,
        test_window: int = DEFAULT_TEST_WINDOW,
        step: int = DEFAULT_TEST_WINDOW,
    ) -> Dict[str, Any]:
        """Expanding-window walk-forward evaluation."""
        min_rows = self.n_lags + ROLLING_VOL_WINDOW + 3
        initial_train = max(initial_train, min_rows)

        windows = self._walk_forward_windows(
            len(gssi), initial_train, test_window, step,
        )
        if not windows:
            raise ValueError("Cannot construct walk-forward folds.")

        variants = (
            "naive_last",
            "rolling_mean",
            "mean_pred",
            "component_residual",
            "gssi_residual",
        )
        rows: List[Dict[str, Any]] = []

        for fold, (t_end, te_end) in enumerate(windows, start=1):
            train_gssi = gssi.iloc[:t_end]
            test_gssi = gssi.iloc[t_end:te_end]
            train_comp = comp_df.iloc[:t_end]
            full_comp = comp_df.iloc[:te_end]
            full_gssi = gssi.iloc[:te_end]

            y_true = test_gssi.to_numpy()
            y_naive = np.full_like(y_true, train_gssi.iloc[-1])

            for v in variants:
                if v == "naive_last":
                    y_pred = y_naive.copy()

                elif v == "rolling_mean":
                    val = float(
                        train_gssi.iloc[-ROLLING_VOL_WINDOW:].mean()
                    )
                    y_pred = np.full_like(y_true, val)

                elif v == "mean_pred":
                    val = float(train_gssi.mean())
                    y_pred = np.full_like(y_true, val)

                elif v == "component_residual":
                    temp = ForecastModel(
                        weights=self.weights,
                        n_lags=self.n_lags,
                        ewma_span=self.ewma_span,
                    )
                    temp._fit_components(train_comp)
                    y_pred = temp._predict_via_components(
                        full_comp, test_gssi.index,
                    )

                elif v == "gssi_residual":
                    temp = ForecastModel(
                        weights=self.weights,
                        n_lags=self.n_lags,
                        ewma_span=self.ewma_span,
                    )
                    temp._fit_gssi_residual(train_comp, train_gssi)
                    y_pred = temp._predict_via_gssi_residual(
                        full_comp, full_gssi, test_gssi.index,
                    )
                else:
                    continue

                y_pred = np.clip(y_pred, 0.0, 1.0)
                m = _compute_metrics(y_true, y_pred, y_naive)

                # Store raw absolute errors for pooled RAE
                sum_ae = float(np.sum(np.abs(y_true - y_pred)))
                sum_ae_naive = float(np.sum(np.abs(y_true - y_naive)))

                rows.append({
                    "fold": fold,
                    "model": v,
                    "train_size": t_end,
                    "test_start": test_gssi.index[0].strftime("%Y-%m"),
                    "test_end": test_gssi.index[-1].strftime("%Y-%m"),
                    "_sum_ae": sum_ae,
                    "_sum_ae_naive": sum_ae_naive,
                    **m,
                })

        # Aggregate — use POOLED RAE (total errors across folds)
        summaries: List[Dict[str, Any]] = []
        for v in variants:
            v_rows = [r for r in rows if r["model"] == v]
            if not v_rows:
                continue
            total_ae = sum(r["_sum_ae"] for r in v_rows)
            total_ae_naive = sum(r["_sum_ae_naive"] for r in v_rows)
            pooled_rae = (
                total_ae / total_ae_naive if total_ae_naive > 1e-12 else 1.0
            )
            s: Dict[str, Any] = {"model": v, "folds": len(v_rows)}
            for k in ("r2", "rmse", "mae"):
                s[k] = round(
                    float(np.mean([r[k] for r in v_rows])), 4,
                )
            s["rae"] = round(pooled_rae, 4)
            summaries.append(s)

        summaries.sort(key=lambda x: (x["rae"], x["mae"]))

        return {
            "fold_metrics": rows,
            "summary_metrics": summaries,
            "walk_forward_plan": {
                "n_folds": len(windows),
                "initial_train": initial_train,
                "test_window": test_window,
                "step": step,
            },
        }

    # ── Public API ────────────────────────────────────────────────────────

    def train(
        self,
        comp_df: pd.DataFrame,
        gssi: pd.Series,
        weights: Dict[str, float],
        test_ratio: float = 0.2,
        test_window: int = DEFAULT_TEST_WINDOW,
        step: int = DEFAULT_TEST_WINDOW,
    ) -> Dict[str, Any]:
        """Walk-forward evaluate, select best variant, fit on all data."""
        self.weights = weights

        n = len(gssi)
        init = max(
            int(n * (1 - test_ratio)),
            self.n_lags + ROLLING_VOL_WINDOW + 4,
        )
        init = min(init, n - 1)

        evaluation = self.walk_forward_evaluate(
            comp_df, gssi,
            initial_train=init,
            test_window=test_window,
            step=step,
        )

        self.fold_metrics = evaluation["fold_metrics"]
        self.summary_metrics = evaluation["summary_metrics"]

        # Pick the best non-baseline variant by RAE
        candidates = [
            s for s in self.summary_metrics
            if s["model"] not in ("naive_last", "rolling_mean", "mean_pred")
        ]
        best = min(candidates, key=lambda s: s["rae"])
        self.selected_model_name = best["model"]

        logger.info(
            "Walk-forward selected: %s  (RAE=%.4f  MAE=%.4f  R²=%.4f)",
            best["model"], best["rae"], best["mae"], best["r2"],
        )

        # Fit on full data
        self._fit_components(comp_df)
        self._fit_gssi_residual(comp_df, gssi)
        self.is_trained = True

        # In-sample metrics
        if self.selected_model_name == "component_residual":
            fitted = self._predict_via_components(comp_df, gssi.index)
        else:
            fitted = self._predict_via_gssi_residual(
                comp_df, gssi, gssi.index,
            )

        fitted = np.clip(fitted, 0.0, 1.0)
        naive = np.roll(gssi.to_numpy(), 1)
        naive[0] = gssi.iloc[0]
        full_fit = _compute_metrics(gssi.to_numpy(), fitted, naive)

        self.last_metrics = {
            "recommended_model": self.selected_model_name,
            "walk_forward_plan": evaluation["walk_forward_plan"],
            "summary_metrics": self.summary_metrics,
            "fold_metrics": self.fold_metrics,
            "full_fit_metrics": full_fit,
        }

        return self.last_metrics

    def predict_next(
        self,
        comp_df: pd.DataFrame,
        gssi: pd.Series,
        n_months: int = 3,
    ) -> pd.Series:
        """Iteratively forecast the next n_months of GSSI."""
        if not self.is_trained:
            raise RuntimeError("Call train() before predict_next().")

        last_date = pd.Timestamp(gssi.index[-1])
        forecasts: List[float] = []
        dates: List[pd.Timestamp] = []

        ext_comp = comp_df.copy()
        ext_gssi = gssi.copy()

        for s in range(1, n_months + 1):
            next_date = last_date + pd.DateOffset(months=s)

            if self.selected_model_name == "component_residual":
                pred_gssi_val = 0.0
                new_row: Dict[str, float] = {}

                for col, w in self.weights.items():
                    if col not in ext_comp.columns:
                        continue

                    baseline, residual = _decompose(
                        ext_comp[col], self.ewma_span,
                    )
                    features = _build_component_features(
                        residual, ext_comp[col], self.n_lags,
                    )
                    last_feat = features.dropna().iloc[-1:]

                    # Baseline for next month = ewma at current last month
                    base_val = float(
                        _ewma(ext_comp[col], self.ewma_span).iloc[-1]
                    )

                    if col in self.component_models and len(last_feat) > 0:
                        pred_r = float(
                            self.component_models[col].predict(last_feat)[0]
                        )
                    else:
                        pred_r = 0.0

                    comp_val = float(np.clip(base_val + pred_r, 0.0, 1.0))
                    new_row[col] = comp_val
                    pred_gssi_val += w * comp_val

                pred_gssi_val = float(np.clip(pred_gssi_val, 0.0, 1.0))

                # Extend component df for next iteration
                ext_comp = pd.concat([
                    ext_comp,
                    pd.DataFrame(new_row, index=[next_date]),
                ])

            else:  # gssi_residual
                baseline, residual = _decompose(ext_gssi, self.ewma_span)
                features = _build_gssi_features(
                    residual, ext_gssi, ext_comp, self.n_lags,
                )
                last_feat = features.dropna().iloc[-1:]

                base_val = float(
                    _ewma(ext_gssi, self.ewma_span).iloc[-1]
                )

                if self.gssi_pipeline is not None and len(last_feat) > 0:
                    pred_r = float(
                        self.gssi_pipeline.predict(
                            last_feat[self.gssi_feature_cols]
                        )[0]
                    )
                else:
                    pred_r = 0.0

                pred_gssi_val = float(np.clip(base_val + pred_r, 0.0, 1.0))

            ext_gssi = pd.concat([
                ext_gssi,
                pd.Series(
                    [pred_gssi_val], index=[next_date], name="gssi",
                ),
            ])

            forecasts.append(pred_gssi_val)
            dates.append(next_date)

        result = pd.Series(
            forecasts,
            index=pd.DatetimeIndex(dates),
            name="gssi_forecast",
        )
        logger.info("%d-month forecast:\n%s", n_months, result.to_string())
        return result

    def feature_importance(self) -> Dict[str, pd.Series]:
        """Coefficient magnitudes per model (component + GSSI)."""
        if not self.is_trained:
            raise RuntimeError("Train the model first.")

        out: Dict[str, pd.Series] = {}
        for name, m in self.component_models.items():
            if m.pipeline is not None:
                coefs = m.pipeline.named_steps["huber"].coef_
                s = pd.Series(
                    coefs, index=m.feature_cols, name=f"{name}_coef",
                )
                out[name] = s.reindex(
                    s.abs().sort_values(ascending=False).index
                )

        if self.gssi_pipeline is not None:
            coefs = self.gssi_pipeline.named_steps["huber"].coef_
            s = pd.Series(
                coefs, index=self.gssi_feature_cols, name="gssi_coef",
            )
            out["gssi"] = s.reindex(
                s.abs().sort_values(ascending=False).index
            )

        return out
