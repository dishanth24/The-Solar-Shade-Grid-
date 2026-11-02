"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  CloudSun,
  SunMedium,
  Thermometer,
  Droplets,
  CloudRain,
  CloudDrizzle,
  Cloud,
  Wind,
  RefreshCw,
  AlertCircle,
  Calendar,
  Clock,
  MapPin,
  Sunrise,
  Sunset,
  Zap,
  Info,
  CheckCircle2,
} from "lucide-react";
import type { WeatherApiResponse } from "@/app/api/weather/route";

export function WeatherIntelligence() {
  const [data, setData] = useState<WeatherApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [chartRange, setChartRange] = useState<"24h" | "48h" | "7d">("48h");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/weather");
      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(
          errorJson?.details || errorJson?.error || `HTTP ${res.status}: Failed to fetch weather`
        );
      }
      const json: WeatherApiResponse = await res.json();
      if (!json || !json.hourly || !json.daily) {
        throw new Error("Invalid weather data structure received from server");
      }
      setData(json);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Weather fetch failed:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  // Hourly Chart Data formatting
  const hourlyChartData = useMemo(() => {
    if (!data?.hourly?.time) return [];

    const limit = chartRange === "24h" ? 24 : chartRange === "48h" ? 48 : 168;
    const times = data.hourly.time.slice(0, limit);

    return times.map((t, idx) => {
      // Parse ISO or "YYYY-MM-DDTHH:00"
      const dateObj = new Date(t);
      const hourStr = isNaN(dateObj.getTime())
        ? t.slice(11, 16)
        : dateObj.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

      const dayStr = isNaN(dateObj.getTime())
        ? ""
        : dateObj.toLocaleDateString("en-IN", { weekday: "short" });

      return {
        timestamp: t,
        label: chartRange === "7d" ? `${dayStr} ${hourStr}` : hourStr,
        temp: data.hourly.temperature_2m[idx] ?? 0,
        apparentTemp: data.hourly.apparent_temperature[idx] ?? 0,
        radiation: data.hourly.shortwave_radiation[idx] ?? 0,
        cloudCover: data.hourly.cloud_cover[idx] ?? 0,
        precipitation: data.hourly.precipitation[idx] ?? 0,
        humidity: data.hourly.relative_humidity_2m[idx] ?? 0,
      };
    });
  }, [data, chartRange]);

  // 7-day Daily Chart & Table Data formatting
  const dailyData = useMemo(() => {
    if (!data?.daily?.time) return [];

    return data.daily.time.map((t, idx) => {
      const dateObj = new Date(t);
      const isToday = idx === 0;
      const dayLabel = isToday
        ? "Today"
        : isNaN(dateObj.getTime())
        ? t
        : dateObj.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });

      const sunriseRaw = data.daily.sunrise[idx] ?? "";
      const sunsetRaw = data.daily.sunset[idx] ?? "";

      const sunriseFormatted = sunriseRaw ? sunriseRaw.slice(11, 16) : "--:--";
      const sunsetFormatted = sunsetRaw ? sunsetRaw.slice(11, 16) : "--:--";

      return {
        date: t,
        dayLabel,
        maxTemp: data.daily.temperature_2m_max[idx] ?? 0,
        minTemp: data.daily.temperature_2m_min[idx] ?? 0,
        precipSum: data.daily.precipitation_sum[idx] ?? 0,
        precipProbMax: data.daily.precipitation_probability_max[idx] ?? 0,
        radiationSum: data.daily.shortwave_radiation_sum[idx] ?? 0,
        sunrise: sunriseFormatted,
        sunset: sunsetFormatted,
      };
    });
  }, [data]);

  // Current metric values from currentHourForecast or first index
  const cur = data?.currentHourForecast;

  return (
    <div className="flex-1 rounded-xl border border-border bg-card p-4 md:p-6 shadow-xs min-h-0 overflow-y-auto">
      <div className="max-w-7xl mx-auto flex flex-col gap-5">
        {/* Top Header & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber/15 text-amber flex items-center justify-center shrink-0 border border-amber/30">
              <CloudSun className="w-5 h-5 text-amber" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-xl md:text-2xl font-bold text-foreground tracking-tight">
                  Weather Intelligence
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal/15 text-teal border border-teal/30 font-semibold flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Bengaluru, KA
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Lat: 12.9716° N • Lon: 77.5946° E</span>
                <span>•</span>
                <span>Elev: 910 m</span>
                <span>•</span>
                <span className="font-mono text-foreground/80">Asia/Kolkata (IST)</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {data && (
              <div className="text-right hidden md:block">
                <span className="text-[10px] font-mono text-muted-foreground block">
                  Last updated
                </span>
                <span className="text-xs font-mono font-medium text-foreground">
                  {lastRefreshed ? lastRefreshed.toLocaleTimeString("en-IN") : "--"}
                </span>
              </div>
            )}
            <button
              onClick={fetchWeather}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Refresh weather data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-teal" : ""}`} />
              <span>{loading ? "Fetching..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* ERROR STATE */}
        {error && !loading && (
          <div className="rounded-xl border border-red/40 bg-red/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-red">Unable to load live weather</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={fetchWeather}
              className="px-3 py-1.5 rounded-lg bg-red text-white text-xs font-semibold hover:bg-red/90 transition shadow-xs cursor-pointer shrink-0"
            >
              Retry Fetch
            </button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading && !data && (
          <div className="flex flex-col gap-4 animate-pulse">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-secondary/50 border border-border/50" />
              ))}
            </div>
            <div className="h-28 rounded-xl bg-secondary/40 border border-border/50" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-72 rounded-xl bg-secondary/40 border border-border/50" />
              <div className="h-72 rounded-xl bg-secondary/40 border border-border/50" />
            </div>
          </div>
        )}

        {/* LOADED CONTENT */}
        {data && (
          <>
            {/* 1. CURRENT ENVIRONMENTAL TELEMETRY (8 Cards) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                  <SunMedium className="w-4 h-4 text-amber" />
                  <span>Current Hourly Forecast Telemetry</span>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Time: {cur?.time ? cur.time.replace("T", " ") : "Current hour"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                {/* Temperature */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-amber/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Temp</span>
                    <Thermometer className="w-3.5 h-3.5 text-amber" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.temperature_2m.toFixed(1) : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">°C</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Ambient air</span>
                </div>

                {/* Feels Like */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-amber/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Feels Like</span>
                    <Thermometer className="w-3.5 h-3.5 text-teal" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.apparent_temperature.toFixed(1) : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">°C</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Heat index</span>
                </div>

                {/* Relative Humidity */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-blue/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Humidity</span>
                    <Droplets className="w-3.5 h-3.5 text-blue" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.relative_humidity_2m : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Moisture</span>
                </div>

                {/* Solar Radiation */}
                <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 flex flex-col justify-between shadow-2xs hover:border-amber/60 transition">
                  <div className="flex items-center justify-between text-amber">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Solar Rad</span>
                    <SunMedium className="w-3.5 h-3.5 text-amber" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-amber">
                      {cur ? Math.round(cur.shortwave_radiation) : "--"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground ml-1">W/m²</span>
                  </div>
                  <span className="text-[10px] text-amber/80 font-medium">Irradiance</span>
                </div>

                {/* Cloud Cover */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-teal/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Clouds</span>
                    <Cloud className="w-3.5 h-3.5 text-teal" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.cloud_cover : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Coverage</span>
                </div>

                {/* Precip Prob */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-blue/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Rain Prob</span>
                    <CloudRain className="w-3.5 h-3.5 text-blue" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.precipitation_probability : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Chance of rain</span>
                </div>

                {/* Rainfall */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-blue/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Rainfall</span>
                    <CloudDrizzle className="w-3.5 h-3.5 text-blue" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.precipitation.toFixed(1) : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">mm</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Precipitation</span>
                </div>

                {/* Wind Speed */}
                <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-2xs hover:border-teal/40 transition">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[10px] font-medium uppercase tracking-wider">Wind</span>
                    <Wind className="w-3.5 h-3.5 text-teal" />
                  </div>
                  <div className="my-1">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {cur ? cur.wind_speed_10m.toFixed(1) : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">km/h</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">At 10m height</span>
                </div>
              </div>
            </div>

            {/* 2. SOLAR ENERGY INSIGHTS (Environmental Indicators) */}
            <div className="rounded-xl border border-border bg-secondary/25 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber" />
                  <h3 className="font-serif text-sm font-bold text-foreground">
                    Solar Canopy Environmental Impact Indicators
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-card border border-border text-muted-foreground">
                  <Info className="w-3 h-3 text-teal" />
                  <span>Physical correlations for 12 kW canopy</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber">
                    <SunMedium className="w-3.5 h-3.5" />
                    <span>Solar Radiation</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Incoming shortwave radiation is the primary resource available to PV panels. Higher irradiance can improve potential generation output, but whether that results in surplus and co-op revenue also depends on current demand, battery SOC, system losses, and operating conditions.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Cloud Attenuation</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cloud cover is correlated with reduced incoming shortwave solar radiation. Higher cloud cover often corresponds to lower irradiance reaching panel surfaces, which can reduce available PV generation potential across the canopy.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue">
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Precipitation Risk</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Active rainfall typically accompanies heavy cloud cover and lower solar irradiance, which may reduce canopy generation. Rainfall and storm events are also relevant for market operations and equipment protection.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Wind className="w-3.5 h-3.5 text-teal" />
                    <span>Thermal &amp; Wind Drift</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Elevated ambient temperatures can reduce PV conversion efficiency. Wind at panel height may provide some passive convective cooling of panel surfaces, which can partially offset temperature-related efficiency losses.
                  </p>
                </div>
              </div>

              {/* Explicit Phase Clarification Disclaimer */}
              <div className="rounded-lg bg-card/60 border border-border/80 px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Info className="w-3.5 h-3.5 text-amber shrink-0" />
                <span>
                  <strong className="text-foreground font-semibold">Real-Time Context Note:</strong>{" "}
                  These values represent atmospheric observations and physics-based correlations. They are not ML model forecasts. Future ML phases will deploy XGBoost, Random Forest, and LSTM algorithms using this data to predict canopy generation and stall power demand.
                </span>
              </div>
            </div>

            {/* 3. RECHARTS WEATHER ANALYTICS */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-teal" />
                  <h3 className="font-serif text-base font-bold text-foreground">
                    Hourly &amp; Daily Forecast Analytics
                  </h3>
                </div>

                {/* Range Toggle */}
                <div className="flex items-center gap-1 bg-secondary/80 p-0.5 rounded-lg border border-border text-xs font-medium">
                  {(["24h", "48h", "7d"] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setChartRange(range)}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer font-mono text-[11px] ${
                        chartRange === range
                          ? "bg-card text-foreground font-bold shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {range.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Chart 1: Hourly Temperature vs Feels Like */}
                <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-amber" />
                      <h4 className="font-serif text-xs font-bold text-foreground">
                        Temperature &amp; Heat Index Forecast
                      </h4>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="flex items-center gap-1 text-amber">
                        <span className="w-2 h-2 rounded-full bg-amber inline-block" />
                        Air Temp (°C)
                      </span>
                      <span className="flex items-center gap-1 text-teal">
                        <span className="w-2 h-2 rounded-full bg-teal inline-block" />
                        Feels Like (°C)
                      </span>
                    </div>
                  </div>

                  <div className="h-56 w-full">
                    {mounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={hourlyChartData}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--amber)" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="var(--amber)" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="apparentGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="var(--teal)" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            opacity={0.4}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                          />
                          <YAxis
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            domain={["dataMin - 2", "dataMax + 2"]}
                            tickFormatter={(v) => `${Math.round(v)}°`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--card)",
                              borderColor: "var(--border)",
                              borderRadius: "8px",
                              fontSize: "11px",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                              color: "var(--foreground)",
                            }}
                            formatter={(val: any, name: any) => [
                              `${Number(val).toFixed(1)} °C`,
                              name === "temp" ? "Air Temp" : "Feels Like",
                            ]}
                            labelFormatter={(label) => `Time: ${label}`}
                          />
                          <Area
                            type="monotone"
                            dataKey="temp"
                            stroke="var(--amber)"
                            strokeWidth={2}
                            fill="url(#tempGrad)"
                            isAnimationActive={false}
                          />
                          <Area
                            type="monotone"
                            dataKey="apparentTemp"
                            stroke="var(--teal)"
                            strokeWidth={1.5}
                            strokeDasharray="4 2"
                            fill="url(#apparentGrad)"
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Chart 2: Hourly Solar Shortwave Radiation */}
                <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <SunMedium className="w-4 h-4 text-amber" />
                      <h4 className="font-serif text-xs font-bold text-foreground">
                        Solar Shortwave Irradiance (GHI)
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Unit: W/m² (Peak at Solar Noon)
                    </span>
                  </div>

                  <div className="h-56 w-full">
                    {mounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={hourlyChartData}
                          margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="radGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--amber)" stopOpacity={0.65} />
                              <stop offset="95%" stopColor="var(--amber)" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            opacity={0.4}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                          />
                          <YAxis
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            domain={[0, "auto"]}
                            tickFormatter={(v) => `${Math.round(v)}`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--card)",
                              borderColor: "var(--border)",
                              borderRadius: "8px",
                              fontSize: "11px",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                              color: "var(--foreground)",
                            }}
                            formatter={(val: any) => [`${Math.round(val)} W/m²`, "Solar Irradiance"]}
                            labelFormatter={(label) => `Time: ${label}`}
                          />
                          <Area
                            type="monotone"
                            dataKey="radiation"
                            stroke="var(--amber)"
                            strokeWidth={2}
                            fill="url(#radGrad)"
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Chart 3: 7-Day Temperature Range & Precipitation */}
              <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal" />
                    <h4 className="font-serif text-xs font-bold text-foreground">
                      7-Day Daily Temperature Range &amp; Precipitation
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="flex items-center gap-1 text-amber">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber inline-block" />
                      Max Temp (°C)
                    </span>
                    <span className="flex items-center gap-1 text-teal">
                      <span className="w-2.5 h-2.5 rounded-sm bg-teal inline-block" />
                      Min Temp (°C)
                    </span>
                    <span className="flex items-center gap-1 text-blue">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue inline-block" />
                      Rainfall mm (→)
                    </span>
                  </div>
                </div>

                <div className="h-56 w-full">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dailyData}
                        margin={{ top: 10, right: 40, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          opacity={0.4}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="dayLabel"
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        {/* Left Y-axis: temperature in °C */}
                        <YAxis
                          yAxisId="temp"
                          orientation="left"
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          domain={["dataMin - 2", "dataMax + 2"]}
                          tickFormatter={(v) => `${Math.round(v)}°`}
                        />
                        {/* Right Y-axis: precipitation in mm */}
                        <YAxis
                          yAxisId="precip"
                          orientation="right"
                          stroke="var(--blue)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, "auto"]}
                          tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderColor: "var(--border)",
                            borderRadius: "8px",
                            fontSize: "11px",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            color: "var(--foreground)",
                          }}
                          formatter={(val: any, name: any) => [
                            name === "precipSum"
                              ? `${Number(val).toFixed(1)} mm`
                              : `${Number(val).toFixed(1)} °C`,
                            name === "maxTemp"
                              ? "Max Temp"
                              : name === "minTemp"
                              ? "Min Temp"
                              : "Rainfall",
                          ]}
                          labelFormatter={(label) => `Day: ${label}`}
                        />
                        <Bar
                          yAxisId="temp"
                          dataKey="maxTemp"
                          fill="var(--amber)"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="temp"
                          dataKey="minTemp"
                          fill="var(--teal)"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="precip"
                          dataKey="precipSum"
                          fill="var(--blue)"
                          fillOpacity={0.75}
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* 4. SEVEN-DAY DETAILED FORECAST TABLE */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-teal" />
                  <h3 className="font-serif text-sm font-bold text-foreground">
                    7-Day Extended Weather Matrix
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  Open-Meteo High-Resolution Model
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase font-mono text-muted-foreground">
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Temperature</th>
                      <th className="py-2 px-2.5">Precipitation</th>
                      <th className="py-2 px-2.5">Rain Prob</th>
                      <th className="py-2 px-2.5">Daily Solar Rad</th>
                      <th className="py-2 px-2.5">Sunrise</th>
                      <th className="py-2 px-2.5">Sunset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {dailyData.map((d, i) => (
                      <tr
                        key={d.date}
                        className={`hover:bg-secondary/30 transition-colors ${
                          i === 0 ? "bg-secondary/15 font-medium" : ""
                        }`}
                      >
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {i === 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green inline-block animate-pulse" />
                            )}
                            <span className="font-medium text-foreground">{d.dayLabel}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap font-mono">
                          <span className="text-amber font-semibold">{d.maxTemp.toFixed(1)}°</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-teal font-semibold">{d.minTemp.toFixed(1)}°C</span>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap font-mono">
                          <span className={d.precipSum > 0 ? "text-blue font-semibold" : "text-muted-foreground"}>
                            {d.precipSum.toFixed(1)} mm
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap font-mono">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              d.precipProbMax > 40
                                ? "bg-blue/15 text-blue font-bold"
                                : "text-muted-foreground"
                            }`}
                          >
                            {d.precipProbMax}%
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap font-mono">
                          <span className="text-foreground">{d.radiationSum.toFixed(1)}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">MJ/m²</span>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap font-mono text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Sunrise className="w-3 h-3 text-amber" />
                            <span>{d.sunrise}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap font-mono text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Sunset className="w-3 h-3 text-amber/80" />
                            <span>{d.sunset}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
