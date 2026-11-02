"""
Random Forest Total Market Demand Forecaster.
Trains ensemble decision trees to forecast market load.
Evaluates MAE, RMSE, R2, and saves model artefact.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from features.feature_engineering import FEATURE_COLS_DEMAND

def train_and_evaluate():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    train_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "train.csv"))
    val_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "val.csv"))
    test_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "test.csv"))
    artefact_dir = os.path.join(base_dir, "artefacts")

    X_train = train_df[FEATURE_COLS_DEMAND]
    y_train = train_df["target_total_demand_kw_t1"]

    X_test = test_df[FEATURE_COLS_DEMAND]
    y_test = test_df["target_total_demand_kw_t1"]

    print("Training Random Forest Demand Regressor (150 trees)...")
    model = RandomForestRegressor(
        n_estimators=150,
        max_depth=12,
        min_samples_split=4,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train, y_train)

    preds_test = model.predict(X_test)
    preds_test = np.clip(preds_test, 0.32, 10.0)  # Bound by physical minimum (8 safety lights = 0.32 kW)

    mae = mean_absolute_error(y_test, preds_test)
    rmse = root_mean_squared_error(y_test, preds_test)
    r2 = r2_score(y_test, preds_test)
    mape = np.mean(np.abs((y_test - preds_test) / y_test)) * 100.0

    print("=== Random Forest Demand Evaluation (Test Set) ===")
    print(f"MAE:  {mae:.4f} kW")
    print(f"RMSE: {rmse:.4f} kW")
    print(f"R²:   {r2:.4f}")
    print(f"MAPE: {mape:.2f} %")

    importances = dict(zip(FEATURE_COLS_DEMAND, [round(float(v), 4) for v in model.feature_importances_]))
    sorted_importances = dict(sorted(importances.items(), key=lambda item: item[1], reverse=True))

    model_path = os.path.join(artefact_dir, "rf_demand.joblib")
    joblib.dump(model, model_path)

    metrics_path = os.path.join(artefact_dir, "rf_demand_metrics.json")
    metrics_data = {
        "model": "Random Forest",
        "task": "Market Demand Forecast (t+1)",
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
