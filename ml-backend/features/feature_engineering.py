"""
Feature Engineering & Chronological Split Pipeline (Refined - Zero Leakage).
- Removes 'hsun' from input features to prevent closed-form trigonometric target leakage.
- Provides legitimate environmental inputs: shortwave_radiation, cloud_cover, temperature_2m,
  humidity, wind_speed, cyclic time encodings (hour_sin/cos, month_sin/cos), and autoregressive lag telemetry.
- Ensures strictly chronological split boundaries (Train 70%, Val 15%, Test 15%).
- Fits StandardScaler scalers strictly on training data partition.
"""

import os
import joblib
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler

# Strictly no 'hsun' or future proxies
FEATURE_COLS_SOLAR = [
    "hour_sin", "hour_cos", "month_sin", "month_cos", "is_weekend",
    "shortwave_radiation", "cloud_cover", "temperature_2m", "wind_speed_10m",
    "relative_humidity_2m", "solar_gen_lag_1", "solar_gen_lag_2", "solar_gen_lag_4",
    "rad_lag_1", "rad_rolling_mean_4"
]

FEATURE_COLS_DEMAND = [
    "hour_sin", "hour_cos", "day_of_week", "is_weekend",
    "temperature_2m", "apparent_temperature", "relative_humidity_2m",
    "market_activity_index", "active_stalls", "heatwave", "grid_live",
    "demand_lag_1", "demand_lag_2", "demand_lag_4",
    "demand_rolling_mean_4"
]

def create_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Cyclic time encodings (smooth circular topology without phase leakage)
    df["hour_sin"] = np.sin(2 * np.pi * df["hour_of_day"] / 24.0)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour_of_day"] / 24.0)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12.0)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12.0)

    # Lag features for Solar Generation (1 tick = 15m, 4 ticks = 1h lookback)
    df["solar_gen_lag_1"] = df["solar_generation_kw"].shift(1)
    df["solar_gen_lag_2"] = df["solar_generation_kw"].shift(2)
    df["solar_gen_lag_4"] = df["solar_generation_kw"].shift(4)
    df["rad_lag_1"] = df["shortwave_radiation"].shift(1)
    df["rad_rolling_mean_4"] = df["shortwave_radiation"].rolling(window=4).mean()

    # Lag features for Total Demand
    df["demand_lag_1"] = df["total_demand_kw"].shift(1)
    df["demand_lag_2"] = df["total_demand_kw"].shift(2)
    df["demand_lag_4"] = df["total_demand_kw"].shift(4)
    df["demand_rolling_mean_4"] = df["total_demand_kw"].rolling(window=4).mean()

    # Drop warm-up rows containing NaNs
    df = df.dropna().reset_index(drop=True)
    return df

def run_pipeline():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    input_csv = os.path.join(base_dir, "data", "synthetic", "synthetic_energy_dataset_365d.csv")
    out_dir = os.path.join(base_dir, "data", "processed")
    scaler_dir = os.path.join(base_dir, "artefacts", "scalers")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(scaler_dir, exist_ok=True)

    print("Loading raw refined dataset (synthetic_engine_v2)...")
    df_raw = pd.read_csv(input_csv)
    df_features = create_features(df_raw)

    n = len(df_features)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    # Chronological Split (Strictly temporal: Jan-Sep / Sep-Oct / Oct-Dec)
    train_df = df_features.iloc[:train_end].copy()
    val_df = df_features.iloc[train_end:val_end].copy()
    test_df = df_features.iloc[val_end:].copy()

    print(f"Dataset split: Train={len(train_df)}, Val={len(val_df)}, Test={len(test_df)}")

    # Fit scalers strictly on training data
    scaler_solar = StandardScaler()
    scaler_solar.fit(train_df[FEATURE_COLS_SOLAR])
    joblib.dump(scaler_solar, os.path.join(scaler_dir, "scaler_solar.joblib"))

    scaler_demand = StandardScaler()
    scaler_demand.fit(train_df[FEATURE_COLS_DEMAND])
    joblib.dump(scaler_demand, os.path.join(scaler_dir, "scaler_demand.joblib"))

    # Save processed splits
    train_df.to_csv(os.path.join(out_dir, "train.csv"), index=False)
    val_df.to_csv(os.path.join(out_dir, "val.csv"), index=False)
    test_df.to_csv(os.path.join(out_dir, "test.csv"), index=False)

    print("Feature pipeline complete. Scalers and processed partitions saved.")

if __name__ == "__main__":
    run_pipeline()
