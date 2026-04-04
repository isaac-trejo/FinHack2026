"""
app.py
------
Flask API for the Global Supply Chain Stress Index (GSSI) pipeline.

Routes:
  POST /pipeline/run    - fetch data, compute GSSI, train model, forecast
  GET  /gssi            - return full GSSI time series with stress zones
  GET  /forecast        - return 3-month forward forecast
  POST /demo/run-all    - single endpoint for a complete demo response
"""

import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Ensure the api/ root is importable when running from any working directory.
# ---------------------------------------------------------------------------
_API_ROOT = Path(__file__).resolve().parent
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))


from models.gssi_model import classify_stress
from services.pipeline_runner import run_pipeline

load_dotenv()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # Allow all origins – fine for a hackathon; restrict in production

# ---------------------------------------------------------------------------
# In-memory store (persists for the lifetime of the process)
# ---------------------------------------------------------------------------
_store: dict = {
    "df": None,          # pandas DataFrame: signals + gssi + stress_zone
    "forecast": None,    # pandas Series: forecasted gssi values
    "metrics": None,     # dict: train_r2, test_r2
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_pipeline():
    """Return a 400 JSON error response if the pipeline has not been run yet."""
    if _store["df"] is None:
        return jsonify({"error": "Pipeline has not been executed yet"}), 400
    return None


def _series_to_records(forecast_series):
    """Convert the forecast Series to a list of dicts for JSON serialisation."""
    records = []
    for date, value in forecast_series.items():
        gssi_val = round(float(value), 4)
        records.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "predicted_gssi": gssi_val,
                "zone": classify_stress(gssi_val),
            }
        )
    return records


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/pipeline/run", methods=["POST"])
def pipeline_run():
    """Fetch FRED data, compute GSSI, train forecast model, store results.

    Reads FRED_API_KEY from the environment or from an optional JSON body
    key ``"api_key"``.

    Returns:
        200 - { "message": "...", "rows_processed": <int> }
        500 - { "error": "<message>" }
    """
    body = request.get_json(silent=True) or {}
    api_key = body.get("api_key") or os.environ.get("FRED_API_KEY", "")

    if not api_key:
        return jsonify({"error": "FRED_API_KEY is required"}), 400

    try:
        results = run_pipeline(fred_api_key=api_key)
        _store["df"] = results["df"]
        _store["forecast"] = results["forecast"]
        _store["metrics"] = results["model_metrics"]

        return jsonify(
            {
                "message": "Pipeline executed successfully",
                "rows_processed": len(_store["df"]),
            }
        ), 200

    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.route("/gssi", methods=["GET"])
def get_gssi():
    """Return the full GSSI time series with stress zones.

    Returns:
        200 - [ { "date": "...", "gssi": 0.72, "zone": "HIGH" }, ... ]
        400 - { "error": "Pipeline has not been executed yet" }
    """
    err = _require_pipeline()
    if err:
        return err

    df = _store["df"][["gssi", "stress_zone"]].copy()
    df.index = df.index.strftime("%Y-%m-%d")
    df = df.reset_index().rename(columns={"index": "date", "stress_zone": "zone"})
    df["gssi"] = df["gssi"].round(4)

    return jsonify(df.to_dict(orient="records")), 200


@app.route("/forecast", methods=["GET"])
def get_forecast():
    """Return the 3-month forward GSSI forecast.

    Returns:
        200 - [ { "date": "...", "predicted_gssi": 0.65, "zone": "HIGH" }, ... ]
        400 - { "error": "Pipeline has not been executed yet" }
    """
    err = _require_pipeline()
    if err:
        return err

    return jsonify(_series_to_records(_store["forecast"])), 200


@app.route("/dashboard", methods=["GET"])
def get_dashboard():
    """Return all data needed by the frontend dashboard in one call.

    Returns component signals, GSSI history, forecast, metrics,
    and component weight metadata.
    """
    err = _require_pipeline()
    if err:
        return err

    df = _store["df"].copy()

    # Full signal + GSSI history
    history = []
    for date, row in df.iterrows():
        entry = {"date": date.strftime("%Y-%m-%d")}
        for col in df.columns:
            val = row[col]
            if col == "stress_zone":
                entry[col] = val
            else:
                entry[col] = round(float(val), 4)
        history.append(entry)

    # Forecast
    forecast = _series_to_records(_store["forecast"])

    # Component weights
    from models.gssi_model import GSSI_WEIGHTS
    weights = {k: round(v, 2) for k, v in GSSI_WEIGHTS.items()}

    # Metrics
    metrics = _store["metrics"] or {}

    # Current status
    latest = df.iloc[-1]
    current = {
        "date": df.index[-1].strftime("%Y-%m-%d"),
        "gssi": round(float(latest["gssi"]), 4),
        "zone": latest["stress_zone"],
    }

    return jsonify({
        "current": current,
        "history": history,
        "forecast": forecast,
        "weights": weights,
        "metrics": metrics,
    }), 200


@app.route("/demo/run-all", methods=["POST"])
def demo_run_all():
    """One-click demo: run the full pipeline and return a summary response.

    Reads FRED_API_KEY from the environment or from an optional JSON body
    key ``"api_key"``.

    Returns:
        200 – { "current": { "date", "gssi", "zone" }, "forecast": [...] }
        500 – { "error": "<message>" }
    """
    body = request.get_json(silent=True) or {}
    api_key = body.get("api_key") or os.environ.get("FRED_API_KEY", "")

    if not api_key:
        return jsonify({"error": "FRED_API_KEY is required"}), 400

    try:
        results = run_pipeline(fred_api_key=api_key)
        _store["df"] = results["df"]
        _store["forecast"] = results["forecast"]
        _store["metrics"] = results["model_metrics"]

        # Latest GSSI observation
        latest = _store["df"][["gssi", "stress_zone"]].iloc[-1]
        latest_date = _store["df"].index[-1].strftime("%Y-%m-%d")
        latest_gssi = round(float(latest["gssi"]), 4)

        return jsonify(
            {
                "current": {
                    "date": latest_date,
                    "gssi": latest_gssi,
                    "zone": latest["stress_zone"],
                },
                "forecast": _series_to_records(_store["forecast"]),
                "model_metrics": _store["metrics"],
            }
        ), 200

    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)


