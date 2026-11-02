"""
XGBoost Solar Generation Forecaster.
Trains gradient boosted decision trees for solar generation forecasting.
Evaluates MAE, RMSE, R2, and saves model artefact.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

# Ensure ml-backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from features.feature_engineering import FEATURE_COLS_SOLAR

def train_and_evaluate():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    train_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "train.csv"))
    val_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "val.csv"))
    test_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "test.csv"))
    artefact_dir = os.path.join(base_dir, "artefacts")

    X_train = train_df[FEATURE_COLS_SOLAR]
    y_train = train_df["target_solar_gen_kw_t1"]

    X_val = val_df[FEATURE_COLS_SOLAR]
    y_val = val_df["target_solar_gen_kw_t1"]

    X_test = test_df[FEATURE_COLS_SOLAR]
    y_test = test_df["target_solar_gen_kw_t1"]

    print("Training XGBoost Solar Generation Regressor...")
    model = xgb.XGBRegressor(
        n_estimators=300,
        learning_rate=0.03,
        max_depth=6,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        n_jobs=-1
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )

    preds_test = model.predict(X_test)
    preds_test = np.clip(preds_test, 0.0, 12.0)  # Bound physically by canopy P_CAP

    mae = mean_absolute_error(y_test, preds_test)
    rmse = root_mean_squared_error(y_test, preds_test)
    r2 = r2_score(y_test, preds_test)

    # Calculate MAPE safely on daytime hours (actual > 0.1 kW)
    day_mask = y_test > 0.1
    mape = np.mean(np.abs((y_test[day_mask] - preds_test[day_mask]) / y_test[day_mask])) * 100.0

    print("=== XGBoost Solar Generation Evaluation (Test Set) ===")
    print(f"MAE:  {mae:.4f} kW")
    print(f"RMSE: {rmse:.4f} kW")
    print(f"R²:   {r2:.4f}")
    print(f"MAPE (Daytime): {mape:.2f} %")

    # Feature Importances
    importances = dict(zip(FEATURE_COLS_SOLAR, [round(float(v), 4) for v in model.feature_importances_]))
    sorted_importances = dict(sorted(importances.items(), key=lambda item: item[1], reverse=True))

    model_path = os.path.join(artefact_dir, "xgboost_solar_gen.json")
    model.save_model(model_path)

    metrics_path = os.path.join(artefact_dir, "xgboost_solar_metrics.json")
    metrics_data = {
        "model": "XGBoost",
        "task": "Solar Generation Forecast (t+1)",
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "r2": round(r2, 4),
        "mape": round(mape, 2),
        "feature_importances": sorted_importances
    }
    with open(metrics_path, "w") as f:
        json.dump(metrics_data, f, indent=2)

    print(f"Model saved to {model_path}")
    return metrics_data

if __name__ == "__main__":
    train_and_evaluate()
