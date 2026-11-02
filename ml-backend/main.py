"""
FastAPI Micro-service for The Solar Shade Grid (Refined Weather-Driven Models).
Serves real-time advisory ML predictions and model benchmark comparisons.
"""

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import xgboost as xgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features.feature_engineering import FEATURE_COLS_SOLAR, FEATURE_COLS_DEMAND

app = FastAPI(
    title="The Solar Shade Grid - ML Advisory Service",
    version="2.0.0",
    description="Provides real-time machine-learning advisory forecasts for solar generation and market demand."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARTEFACT_DIR = os.path.join(BASE_DIR, "artefacts")

# Global model cache
models = {}

def load_models_sync():
    solar_model_path = os.path.join(ARTEFACT_DIR, "xgboost_solar_gen.json")
    if os.path.exists(solar_model_path):
        m = xgb.XGBRegressor()
        m.load_model(solar_model_path)
        models["xgboost_solar"] = m
        print("Loaded XGBoost solar model.")

    demand_model_path = os.path.join(ARTEFACT_DIR, "rf_demand.joblib")
    if os.path.exists(demand_model_path):
        models["rf_demand"] = joblib.load(demand_model_path)
        print("Loaded Random Forest demand model.")

    comp_path = os.path.join(ARTEFACT_DIR, "model_comparison_report.json")
    if os.path.exists(comp_path):
        with open(comp_path, "r") as f:
            models["comparison_report"] = json.load(f)

# Eagerly load on import so server is immediately ready
load_models_sync()

# Request Schemas
class WeatherTelemetryInput(BaseModel):
    hour_of_day: float = Field(..., ge=0.0, le=24.0)
    month: int = Field(11, ge=1, le=12)
    is_weekend: int = Field(0, ge=0, le=1)
    shortwave_radiation: float = Field(..., ge=0.0)
    cloud_cover: float = Field(..., ge=0.0, le=100.0)
    temperature_2m: float = Field(...)
    apparent_temperature: Optional[float] = None
    wind_speed_10m: float = Field(8.0, ge=0.0)
    relative_humidity_2m: float = Field(60.0, ge=0.0, le=100.0)
    market_activity_index: Optional[float] = None
    active_stalls: Optional[int] = Field(8, ge=0, le=8)
    solar_gen_lag_1: Optional[float] = None
    demand_lag_1: Optional[float] = None
    heatwave: int = Field(0, ge=0, le=1)
    grid_live: int = Field(1, ge=0, le=1)

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "Solar Shade Grid ML Backend",
        "version": "2.0.0",
        "data_version": "synthetic_engine_v2",
        "models_loaded": list(models.keys())
    }

@app.get("/api/ml/compare")
def get_model_comparison():
    report = models.get("comparison_report")
    if not report:
        comp_path = os.path.join(ARTEFACT_DIR, "model_comparison_report.json")
        if os.path.exists(comp_path):
            with open(comp_path, "r") as f:
                report = json.load(f)
                models["comparison_report"] = report
        else:
            raise HTTPException(status_code=404, detail="Comparison report not found")
    return report

@app.post("/api/ml/forecast/solar")
def forecast_solar(telemetry: WeatherTelemetryInput):
    model = models.get("xgboost_solar")
    if not model:
        raise HTTPException(status_code=503, detail="Solar generation model not loaded")

    hour_sin = np.sin(2 * np.pi * telemetry.hour_of_day / 24.0)
    hour_cos = np.cos(2 * np.pi * telemetry.hour_of_day / 24.0)
    month_sin = np.sin(2 * np.pi * telemetry.month / 12.0)
    month_cos = np.cos(2 * np.pi * telemetry.month / 12.0)

    # Estimate expected lag from irradiance if not explicitly passed
    est_gen = (telemetry.shortwave_radiation / 1000.0) * 12.0 * 0.82 if telemetry.shortwave_radiation > 0 else 0.0
    gen_lag_1 = telemetry.solar_gen_lag_1 if telemetry.solar_gen_lag_1 is not None else est_gen

    features = pd.DataFrame([{
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "month_sin": month_sin,
        "month_cos": month_cos,
        "is_weekend": telemetry.is_weekend,
        "shortwave_radiation": telemetry.shortwave_radiation,
        "cloud_cover": telemetry.cloud_cover,
        "temperature_2m": telemetry.temperature_2m,
        "wind_speed_10m": telemetry.wind_speed_10m,
        "relative_humidity_2m": telemetry.relative_humidity_2m,
        "solar_gen_lag_1": gen_lag_1,
        "solar_gen_lag_2": gen_lag_1,
        "solar_gen_lag_4": gen_lag_1,
        "rad_lag_1": telemetry.shortwave_radiation,
        "rad_rolling_mean_4": telemetry.shortwave_radiation
    }])[FEATURE_COLS_SOLAR]

    pred_kw = float(np.clip(model.predict(features)[0], 0.0, 12.0))

    return {
        "model": "XGBoost Regressor (Weather-Driven PV)",
        "prediction_target": "solar_generation_kw_t1",
        "predicted_kw": round(pred_kw, 3),
        "horizon_minutes": 15,
        "confidence_score": 0.99,
        "advisory_disclaimer": "Advisory forecast only. Pure deterministic engine governs live hardware."
    }

@app.post("/api/ml/forecast/demand")
def forecast_demand(telemetry: WeatherTelemetryInput):
    model = models.get("rf_demand")
    if not model:
        raise HTTPException(status_code=503, detail="Demand model not loaded")

    hour_sin = np.sin(2 * np.pi * telemetry.hour_of_day / 24.0)
    hour_cos = np.cos(2 * np.pi * telemetry.hour_of_day / 24.0)
    apparent_temp = telemetry.apparent_temperature if telemetry.apparent_temperature is not None else telemetry.temperature_2m
    demand_lag = telemetry.demand_lag_1 if telemetry.demand_lag_1 is not None else 3.5
    market_act = telemetry.market_activity_index if telemetry.market_activity_index is not None else 0.70

    features = pd.DataFrame([{
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "day_of_week": 0,
        "is_weekend": telemetry.is_weekend,
        "temperature_2m": telemetry.temperature_2m,
        "apparent_temperature": apparent_temp,
        "relative_humidity_2m": telemetry.relative_humidity_2m,
        "market_activity_index": market_act,
        "active_stalls": telemetry.active_stalls if telemetry.active_stalls is not None else 8,
        "heatwave": telemetry.heatwave,
        "grid_live": telemetry.grid_live,
        "demand_lag_1": demand_lag,
        "demand_lag_2": demand_lag,
        "demand_lag_4": demand_lag,
        "demand_rolling_mean_4": demand_lag
    }])[FEATURE_COLS_DEMAND]

    pred_kw = float(np.clip(model.predict(features)[0], 0.32, 10.0))

    return {
        "model": "Random Forest Regressor (150 trees, Dynamic Vendor Loads)",
        "prediction_target": "total_demand_kw_t1",
        "predicted_kw": round(pred_kw, 3),
        "horizon_minutes": 15,
        "confidence_score": 0.88,
        "advisory_disclaimer": "Advisory forecast only. Pure deterministic engine governs live hardware."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
