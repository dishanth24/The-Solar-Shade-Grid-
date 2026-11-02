"""
Unified Model Comparison & Benchmarking (Refined Models vs Statistical Baselines).
Evaluates XGBoost, Random Forest, Persistence, Historical Average, and Time-of-Day baselines.
Computes Daytime-only solar metrics, overall MAE, RMSE, R², target variance, and exports comparison charts.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from features.feature_engineering import FEATURE_COLS_SOLAR, FEATURE_COLS_DEMAND

def run_comparison():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    train_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "train.csv"))
    test_df = pd.read_csv(os.path.join(base_dir, "data", "processed", "test.csv"))
    artefact_dir = os.path.join(base_dir, "artefacts")
    plots_dir = os.path.join(base_dir, "artefacts", "plots")
    os.makedirs(plots_dir, exist_ok=True)

    # ==========================
    # 1. SOLAR GENERATION BENCHMARKS
    # ==========================
    xgb_solar = xgb.XGBRegressor()
    xgb_solar.load_model(os.path.join(artefact_dir, "xgboost_solar_gen.json"))

    y_true_solar = test_df["target_solar_gen_kw_t1"].values
    y_pred_solar = np.clip(xgb_solar.predict(test_df[FEATURE_COLS_SOLAR]), 0.0, 12.0)

    # Baselines
    y_persist_solar = test_df["solar_generation_kw"].values
    mean_solar_val = train_df["target_solar_gen_kw_t1"].mean()
    y_hist_mean_solar = np.full_like(y_true_solar, mean_solar_val)
    tod_solar_map = train_df.groupby("hour_of_day")["target_solar_gen_kw_t1"].mean()
    y_tod_solar = test_df["hour_of_day"].map(tod_solar_map).values

    # Daytime mask (actual solar generation > 0.05 kW)
    day_mask = y_true_solar > 0.05

    def get_metrics(y_true, y_pred, mask=None):
        yt = y_true[mask] if mask is not None else y_true
        yp = y_pred[mask] if mask is not None else y_pred
        return {
            "mae": round(float(mean_absolute_error(yt, yp)), 4),
            "rmse": round(float(root_mean_squared_error(yt, yp)), 4),
            "r2": round(float(r2_score(yt, yp)), 4),
            "mape": round(float(np.mean(np.abs((yt - yp) / np.maximum(yt, 0.05))) * 100.0), 2)
        }

    solar_benchmarks = {
        "target_variance": round(float(np.var(y_true_solar)), 4),
        "overall": {
            "xgboost": get_metrics(y_true_solar, y_pred_solar),
            "persistence": get_metrics(y_true_solar, y_persist_solar),
            "time_of_day_mean": get_metrics(y_true_solar, y_tod_solar),
            "historical_mean": get_metrics(y_true_solar, y_hist_mean_solar),
        },
        "daytime_only": {
            "xgboost": get_metrics(y_true_solar, y_pred_solar, day_mask),
            "persistence": get_metrics(y_true_solar, y_persist_solar, day_mask),
            "time_of_day_mean": get_metrics(y_true_solar, y_tod_solar, day_mask),
            "historical_mean": get_metrics(y_true_solar, y_hist_mean_solar, day_mask),
        }
    }

    # ==========================
    # 2. MARKET DEMAND BENCHMARKS
    # ==========================
    rf_demand = joblib.load(os.path.join(artefact_dir, "rf_demand.joblib"))
    y_true_demand = test_df["target_total_demand_kw_t1"].values
    y_pred_rf_demand = np.clip(rf_demand.predict(test_df[FEATURE_COLS_DEMAND]), 0.32, 10.0)

    # XGBoost Alternative for Demand
    xgb_demand = xgb.XGBRegressor(n_estimators=150, max_depth=5, learning_rate=0.05, random_state=42)
    xgb_demand.fit(train_df[FEATURE_COLS_DEMAND], train_df["target_total_demand_kw_t1"])
    y_pred_xgb_demand = np.clip(xgb_demand.predict(test_df[FEATURE_COLS_DEMAND]), 0.32, 10.0)

    # Baselines
    y_persist_demand = test_df["total_demand_kw"].values
    mean_demand_val = train_df["target_total_demand_kw_t1"].mean()
    y_hist_mean_demand = np.full_like(y_true_demand, mean_demand_val)
    tod_demand_map = train_df.groupby("hour_of_day")["target_total_demand_kw_t1"].mean()
    y_tod_demand = test_df["hour_of_day"].map(tod_demand_map).values

    demand_benchmarks = {
        "target_variance": round(float(np.var(y_true_demand)), 4),
        "overall": {
            "random_forest": get_metrics(y_true_demand, y_pred_rf_demand),
            "xgboost": get_metrics(y_true_demand, y_pred_xgb_demand),
            "persistence": get_metrics(y_true_demand, y_persist_demand),
            "time_of_day_mean": get_metrics(y_true_demand, y_tod_demand),
            "historical_mean": get_metrics(y_true_demand, y_hist_mean_demand),
        }
    }

    report = {
        "notice": "Synthetic simulation (synthetic_engine_v2) - not real-world measured performance.",
        "solar_generation": solar_benchmarks,
        "market_demand": demand_benchmarks
    }

    report_path = os.path.join(artefact_dir, "model_comparison_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    # ==========================
    # 3. ACTUAL VS PREDICTED PLOTS
    # ==========================
    # Slice 96 ticks (24 hours) for clear high-resolution visualization
    sample_window = 96 * 3  # 3 days window
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), sharex=False)

    # Solar Plot
    ax1.plot(y_true_solar[:sample_window], label="Actual Simulated Solar (kW)", color="#0F3A40", linewidth=2.0)
    ax1.plot(y_pred_solar[:sample_window], label="XGBoost Predicted (kW)", color="#F5A623", linestyle="--", linewidth=1.8)
    ax1.plot(y_persist_solar[:sample_window], label="Persistence Baseline (kW)", color="#999999", linestyle=":", alpha=0.7)
    ax1.set_title("Solar Generation Forecast (3-Day Horizon, 15-min ticks) - Actual vs Predicted", fontsize=12, fontweight="bold")
    ax1.set_ylabel("Power (kW)")
    ax1.legend(loc="upper right")
    ax1.grid(True, linestyle="--", alpha=0.5)

    # Demand Plot
    ax2.plot(y_true_demand[:sample_window], label="Actual Simulated Demand (kW)", color="#0F3A40", linewidth=2.0)
    ax2.plot(y_pred_rf_demand[:sample_window], label="Random Forest Predicted (kW)", color="#1F8A5B", linestyle="--", linewidth=1.8)
    ax2.plot(y_persist_demand[:sample_window], label="Persistence Baseline (kW)", color="#999999", linestyle=":", alpha=0.7)
    ax2.set_title("Market Demand Forecast (3-Day Horizon, 15-min ticks) - Actual vs Predicted", fontsize=12, fontweight="bold")
    ax2.set_xlabel("Observation Ticks (15-min intervals)")
    ax2.set_ylabel("Power (kW)")
    ax2.legend(loc="upper right")
    ax2.grid(True, linestyle="--", alpha=0.5)

    plt.tight_layout()
    plot_path = os.path.join(plots_dir, "actual_vs_predicted_validation.png")
    plt.savefig(plot_path, dpi=180)
    plt.close()

    print("=== MODEL COMPARISON BENCHMARK COMPLETE ===")
    print(json.dumps(report, indent=2))
    print(f"Validation plot saved to: {plot_path}")
    return report

if __name__ == "__main__":
    run_comparison()
