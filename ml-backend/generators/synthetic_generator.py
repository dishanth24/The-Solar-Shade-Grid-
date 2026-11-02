"""
Synthetic Data Generator for The Solar Shade Grid (Refined Physics & Dynamic Demand).
Generates synthetic training data clearly tagged with data_source='synthetic_engine_v2'.

Scientific Principles Applied:
1. Solar Generation Physics:
   P_pv = P_rated * (G / 1000) * efficiency * temp_derating
   - P_rated = 12.0 kW (canopy capacity from lib/engine.ts)
   - G = Global Horizontal Irradiance / Shortwave Irradiance in W/m²
   - efficiency = 0.82 (system efficiency factor from lib/engine.ts)
   - temp_derating = 1.0 - 0.004 * max(0.0, T_cell - 25.0)
     where T_cell = T_ambient + (G / 800.0) * (NOCT - 20.0), with NOCT = 45°C.
   - P_pv clamped strictly to [0.0, 12.0] kW.

2. Realistic Market Demand Dynamics:
   - 8 individual vendor stalls with realistic heterogeneous profiles:
     * Vegetables, Fruits: perishable produce, display fans + misters + scales (0.12 - 0.35 kW)
     * Flowers: delicate produce, cold spray misting + lighting (0.10 - 0.28 kW)
     * Dairy: localized chilling showcase (0.30 - 0.70 kW)
     * Spices, Grains: dry bulk goods, ventilation fans + digital billing (0.08 - 0.20 kW)
     * Snacks, Tea: hot beverage heating / electric urn / griddle / blenders (0.40 - 1.10 kW)
   - Operating Schedule:
     * Market activity profile: opens ~06:00, morning peak 08:00-11:00, afternoon dip 13:00-15:00,
       evening peak 17:00-21:00, night shutdown 22:00-05:30.
     * Weekend activity boost (+15% traffic).
   - Dynamic Central Infrastructure:
     * Central Cold Storage: base load 1.2 kW, thermostatic cycling (1.0 - 1.5 kW),
       boosted to 1.8 - 2.2 kW during heatwave or high ambient temperature.
     * Communal Misting System: triggered above 34°C, dynamic proportional cooling load (0.4 - 0.9 kW).
   - Operating Conditions (Normal, Heatwave, Blackout):
     * Blackout / load-shedding: non-critical vendor loads shed to emergency lights (0.04 kW/stall),
       central storage switches to high-priority compressor protection.
"""

import math
import os
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

# Physical constants from lib/engine.ts
C = {
    "P_CAP": 12.0,            # canopy rated capacity, kW
    "B_CAP": 20.0,            # battery capacity, kWh (LiFePO4)
    "ETA": 0.82,              # system efficiency factor
    "SOC_FLOOR": 0.20,        # battery floor while grid live
    "SOC_EMERGENCY": 0.05,    # blackout reserve floor
    "SOC_PAYOUT": 0.80,       # threshold for surplus payout
    "SELL_SHARE": 0.60,       # share of surplus sold
    "CHARGE_EFF": 0.95,       # battery charge efficiency
    "TARIFF": 6.0,            # Rs per kWh
    "HEAT_THRESHOLD": 42.0,   # deg C
    "NOCT": 45.0,             # Nominal Operating Cell Temperature, °C
    "TEMP_COEFF": 0.004,      # -0.4% per °C above 25°C
}

STALL_PROFILES = {
    "Vegetables": {"base": 0.15, "peak": 0.32, "temp_sens": 0.008, "critical": 0.04},
    "Fruits":     {"base": 0.16, "peak": 0.35, "temp_sens": 0.009, "critical": 0.04},
    "Flowers":    {"base": 0.12, "peak": 0.26, "temp_sens": 0.006, "critical": 0.04},
    "Dairy":      {"base": 0.32, "peak": 0.68, "temp_sens": 0.015, "critical": 0.15},
    "Spices":     {"base": 0.08, "peak": 0.18, "temp_sens": 0.002, "critical": 0.04},
    "Snacks":     {"base": 0.38, "peak": 0.95, "temp_sens": 0.005, "critical": 0.04},
    "Tea":        {"base": 0.42, "peak": 1.05, "temp_sens": 0.004, "critical": 0.04},
    "Grains":     {"base": 0.09, "peak": 0.20, "temp_sens": 0.002, "critical": 0.04},
}

STALL_NAMES = list(STALL_PROFILES.keys())

def solar_elevation_factor(hour: float) -> float:
    """Ideal geometric solar elevation factor [0, 1] for Bengaluru (12.97° N)."""
    if 6.0 <= hour <= 18.0:
        return math.sin((math.pi * (hour - 6.0)) / 12.0)
    return 0.0

def market_activity_factor(hour: float, is_weekend: bool) -> float:
    """
    Simulates real Indian market traffic curve:
    - Early setup (05:00 - 07:00): 0.2 - 0.5
    - Morning shopping rush (08:00 - 11:30): 0.85 - 1.0
    - Midday lull (12:30 - 15:30): 0.45 - 0.60
    - Evening peak rush (17:00 - 21:00): 0.90 - 1.05
    - Night shutdown (22:00 - 05:00): 0.05 (security lights / background trickle)
    """
    weekend_multiplier = 1.15 if is_weekend else 1.0
    if hour < 5.0:
        base = 0.05
    elif hour < 7.0:
        base = 0.20 + 0.30 * (hour - 5.0) / 2.0
    elif hour < 12.0:
        # Morning peak around 10:00
        base = 0.70 + 0.30 * math.sin(math.pi * (hour - 7.0) / 5.0)
    elif hour < 16.0:
        # Afternoon lull
        base = 0.50 + 0.15 * math.sin(math.pi * (hour - 12.0) / 4.0)
    elif hour < 21.5:
        # Evening peak around 19:00
        base = 0.75 + 0.35 * math.sin(math.pi * (hour - 16.0) / 5.5)
    elif hour < 23.0:
        base = 0.40 * (1.0 - (hour - 21.5) / 1.5) + 0.08
    else:
        base = 0.05
    return min(1.20, base * weekend_multiplier)

def calculate_pv_generation(shortwave_rad: float, ambient_t: float) -> float:
    """
    Photovoltaic power calculation:
    P_pv = P_rated * (G / 1000) * efficiency * temp_derating
    """
    if shortwave_rad <= 0.5:
        return 0.0

    # Cell temperature modeling via NOCT
    t_cell = ambient_t + (shortwave_rad / 800.0) * (C["NOCT"] - 20.0)
    temp_derating = 1.0 - C["TEMP_COEFF"] * max(0.0, t_cell - 25.0)
    temp_derating = max(0.70, min(1.05, temp_derating))  # physical limits

    p_pv = C["P_CAP"] * (shortwave_rad / 1000.0) * C["ETA"] * temp_derating
    return round(float(np.clip(p_pv, 0.0, C["P_CAP"])), 4)

def generate_dataset(num_days: int = 365, seed: int = 42) -> pd.DataFrame:
    """
    Generates realistic chronological 15-minute resolution dataset for 365 days.
    Total ticks: 365 * 96 = 35,040 rows.
    """
    np.random.seed(seed)
    start_date = datetime(2025, 1, 1, 0, 0)
    ticks_per_day = 96
    total_ticks = num_days * ticks_per_day

    records = []
    soc_tracker = 0.70

    # Auto-regressive state for weather continuity
    current_cloud = 30.0

    for t in range(total_ticks):
        current_dt = start_date + timedelta(minutes=15 * t)
        hour = current_dt.hour + (current_dt.minute / 60.0)
        day_of_year = current_dt.timetuple().tm_yday
        is_weekend = bool(current_dt.weekday() >= 5)

        # 1. Weather Generation (Bengaluru tropical savanna climate)
        # Seasonal solar declination factor
        seasonal_solar = 1.0 + 0.12 * math.sin((2 * math.pi * (day_of_year - 80)) / 365.0)

        # Cloud cover with Markov persistence (monsoon peak mid-year days 150-270)
        monsoon_factor = 1.0 + 0.8 * math.exp(-((day_of_year - 210) ** 2) / (2 * 45 ** 2))
        target_cloud = 35.0 * monsoon_factor + np.random.normal(0, 15)
        current_cloud = 0.85 * current_cloud + 0.15 * target_cloud
        cloud_cover = float(np.clip(current_cloud, 0.0, 100.0))

        # Solar Irradiance G (W/m²)
        sun_elev = solar_elevation_factor(hour)
        if sun_elev > 0.0:
            # Clear sky GHI peaks ~980 W/m² in Bengaluru spring/summer
            clear_sky_ghi = 980.0 * sun_elev * seasonal_solar
            # Cloud attenuation (direct beam scattering)
            attenuation = 1.0 - 0.75 * (cloud_cover / 100.0) ** 1.2
            noise = np.random.normal(0, 12)
            shortwave_radiation = max(0.0, clear_sky_ghi * attenuation + noise)
        else:
            shortwave_radiation = 0.0

        # Ambient & Apparent Temperature
        is_heatwave = (day_of_year in range(90, 150)) and (np.random.rand() < 0.20)
        diurnal_temp = 22.0 + 9.0 * math.sin((math.pi * max(0.0, hour - 8.0)) / 14.0) if 8.0 <= hour <= 22.0 else 22.0 - 2.5 * math.cos((math.pi * hour) / 8.0)
        heatwave_boost = 7.5 if is_heatwave else 0.0
        ambient_t = round(float(diurnal_temp + heatwave_boost + np.random.normal(0, 0.8)), 2)

        # Relative humidity and apparent temperature
        humidity = float(np.clip(72.0 - (ambient_t - 24.0) * 2.2 + cloud_cover * 0.15 + np.random.normal(0, 3), 20.0, 98.0))
        apparent_t = round(ambient_t + (humidity / 100.0) * 2.5 - 0.8, 2)

        # Wind & Precipitation
        wind_speed = round(float(np.clip(7.0 + 3.0 * math.sin(hour / 3.0) + np.random.normal(0, 1.8), 0.8, 25.0)), 1)
        precip_prob = round(float(np.clip((cloud_cover - 45.0) * 1.6 + np.random.normal(0, 8), 0.0, 100.0)), 1) if cloud_cover > 45 else 0.0
        precip_mm = round(float(np.random.exponential(2.8)), 2) if precip_prob > 60 and np.random.rand() < 0.35 else 0.0

        # Municipal grid outages
        outage_prob = 0.08 if (is_heatwave or 18.0 <= hour <= 21.0) else 0.02
        grid_live = int(np.random.rand() >= outage_prob)

        # 2. Solar PV Power Generation (Weather-Driven Physics)
        gen_kw = calculate_pv_generation(shortwave_radiation, ambient_t)
        dt = 0.25  # 15 minutes = 0.25 hours
        e_gen = gen_kw * dt

        # 3. Dynamic Market Energy Demand Generation
        activity = market_activity_factor(hour, is_weekend)

        # Individual Vendor Stalls Demand
        stall_loads = {}
        stall_temps = {}
        total_vendor_kw = 0.0
        active_stalls_count = 0

        is_shedding = (grid_live == 0)

        for name, prof in STALL_PROFILES.items():
            # Stochastic vendor attendance based on schedule
            is_active = (activity > 0.15) and (np.random.rand() < 0.96)
            if is_active:
                active_stalls_count += 1

            if is_shedding:
                load = prof["critical"]
                status = "shed"
            elif is_active:
                # Load scales with activity + temperature sensitivity + stochastic noise
                temp_delta = max(0.0, ambient_t - 28.0)
                dyn_load = prof["base"] + (prof["peak"] - prof["base"]) * activity + prof["temp_sens"] * temp_delta
                load = dyn_load * (1.0 + np.random.normal(0, 0.05))
                status = "amber" if is_heatwave else "ok"
            else:
                # Standby / closed load
                load = 0.02
                status = "ok"

            load = round(float(np.clip(load, 0.01, 1.50)), 3)
            stall_loads[f"stall_{name.lower()}_kw"] = load
            total_vendor_kw += load

            # Stall microclimate temperature
            cooling_active = (ambient_t > 34.0 and not is_shedding)
            stall_temp = ambient_t - 3.5 - (3.5 if cooling_active else 0.0) + np.random.normal(0, 0.4)
            stall_temps[f"stall_{name.lower()}_temp"] = round(stall_temp, 2)

        # Central Infrastructure Loads
        # Communal Cold Storage: base cycling + ambient heat conduction load
        storage_base = 1.2
        storage_heat_conduct = max(0.0, ambient_t - 25.0) * 0.035
        storage_cycling = 0.15 * math.sin(hour * math.pi * 2 / 1.5)  # thermostat compressor cycle
        storage_kw = round(float(np.clip(storage_base + storage_heat_conduct + storage_cycling, 0.9, 2.4)), 2)

        # Communal Misting Pumps: active above 34°C if not shedding
        cooling_kw = round(float(np.clip(0.65 + 0.03 * (ambient_t - 34.0) + np.random.normal(0, 0.05), 0.4, 1.0)), 2) if (ambient_t > 34.0 and not is_shedding) else 0.0

        total_demand_kw = round(total_vendor_kw + storage_kw + cooling_kw, 3)

        # Battery & Energy Balance (matching lib/engine.ts governing formulas)
        l_loss = 0.04 * e_gen + 0.02 * dt
        e_avail = e_gen + C["B_CAP"] * soc_tracker - l_loss
        net = e_gen - l_loss - total_demand_kw * dt

        sold_kwh = 0.0
        grid_import_kwh = 0.0
        soc = soc_tracker

        if net >= 0:
            share = C["SELL_SHARE"] if (grid_live and soc >= C["SOC_PAYOUT"]) else 0.0
            sold_kwh = net * share
            room = (1.0 - soc) * C["B_CAP"]
            to_battery = min((net - sold_kwh) * C["CHARGE_EFF"], room)
            soc += to_battery / C["B_CAP"]
            leftover = max(0.0, net - sold_kwh - to_battery / C["CHARGE_EFF"])
            if grid_live:
                sold_kwh += leftover
        else:
            deficit = -net
            floor = C["SOC_FLOOR"] if grid_live else C["SOC_EMERGENCY"]
            from_battery = min(deficit, max(0.0, soc - floor) * C["B_CAP"])
            soc -= from_battery / C["B_CAP"]
            grid_import_kwh = (deficit - from_battery) if grid_live else 0.0

        soc = float(np.clip(soc, 0.0, 1.0))
        soc_tracker = soc
        payout = sold_kwh * C["TARIFF"]

        record = {
            "data_source": "synthetic_engine_v2",
            "timestamp": current_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "hour_of_day": round(hour, 2),
            "day_of_week": current_dt.weekday(),
            "month": current_dt.month,
            "is_weekend": int(is_weekend),
            "market_activity_index": round(activity, 3),
            "active_stalls": active_stalls_count,

            # Weather stream
            "temperature_2m": ambient_t,
            "apparent_temperature": apparent_t,
            "relative_humidity_2m": round(humidity, 1),
            "precipitation": precip_mm,
            "precipitation_probability": precip_prob,
            "cloud_cover": round(cloud_cover, 1),
            "shortwave_radiation": round(shortwave_radiation, 1),
            "wind_speed_10m": wind_speed,

            # Physics engine indicators
            "heatwave": int(is_heatwave),
            "grid_live": int(grid_live),
            "mode": "blackout" if not grid_live else ("heatwave" if is_heatwave else "normal"),

            # Power and Energy Telemetry
            "solar_generation_kw": round(gen_kw, 3),
            "total_demand_kw": total_demand_kw,
            "vendor_kw": round(total_vendor_kw, 3),
            "storage_kw": storage_kw,
            "cooling_kw": cooling_kw,
            "battery_soc": round(soc, 4),
            "grid_import_kwh": round(grid_import_kwh, 3),
            "solar_export_kwh": round(sold_kwh, 3),
            "shedding": int(is_shedding),
            "coop_payout_rs": round(payout, 2),
            **stall_loads,
            **stall_temps,
        }
        records.append(record)

    df = pd.DataFrame(records)

    # Next-Step Targets (Shifted strictly forward by 1 tick = 15m)
    df["target_solar_gen_kw_t1"] = df["solar_generation_kw"].shift(-1)
    df["target_total_demand_kw_t1"] = df["total_demand_kw"].shift(-1)
    df["target_battery_soc_t1"] = df["battery_soc"].shift(-1)

    # Drop final row where shifted target is NaN
    df = df.dropna().reset_index(drop=True)
    return df

if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "synthetic_energy_dataset_365d.csv")

    print("Generating refined 365-day weather-driven micro-grid dataset (synthetic_engine_v2)...")
    df = generate_dataset(num_days=365)
    df.to_csv(out_path, index=False)
    print(f"Successfully generated {len(df)} rows and {len(df.columns)} columns.")
    print(f"Saved to: {out_path}")
