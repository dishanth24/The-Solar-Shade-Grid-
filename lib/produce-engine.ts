/**
 * lib/produce-engine.ts
 * Agricultural environmental intelligence engine for The Solar Shade Grid.
 * Reads simulation state to compute sensor readings and freshness risk assessments.
 * NO network calls. Pure, deterministic, testable.
 *
 * IMPORTANT: This module does NOT detect spoilage, internal quality, or shelf life.
 * It evaluates environmental conditions relative to published agricultural guidance
 * and classifies environmental risk only.
 *
 * Reference sources:
 *  - USDA Agricultural Handbook 66 "The Commercial Storage of Fruits, Vegetables..."
 *  - FAO Postharvest Technology fact sheets
 *  - Karnataka State Horticulture Department guidelines
 *  - ICAR (Indian Council of Agricultural Research) postharvest standards
 */

// ─── Sensor types ────────────────────────────────────────────────────────────

export type SensorStatus = "online" | "offline" | "stale" | "simulated";
export type DataSource = "hardware" | "simulated" | "weather_api";

export interface SensorReading {
  sensor_id: string;
  stall_id: string | "canopy";
  sensor_type: SensorType;
  value: number;
  unit: string;
  status: SensorStatus;
  source: DataSource;
  timestamp: string; // ISO 8601
  label: string;
}

export type SensorType =
  | "temperature_ambient"
  | "temperature_stall"
  | "temperature_contact"
  | "relative_humidity"
  | "rainfall_intensity"
  | "illuminance_lux"
  | "solar_radiation_wm2"
  | "wind_speed_ms"
  | "air_quality_aqi";

// ─── Reference profiles ───────────────────────────────────────────────────────

export type ProduceCategory = "apple" | "tomato" | "potato" | "leafy";
export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "INSUFFICIENT_DATA";

export interface ProduceReferenceProfile {
  category: ProduceCategory;
  displayName: string;
  emoji: string;
  stallId: string; // which stall primarily sells this
  stallName: string;
  /** Optimal storage temperature range (°C). Source: USDA AH-66 */
  tempOptMin: number;
  tempOptMax: number;
  /** Caution threshold (°C) — risk begins accumulating above this */
  tempCautionAbove: number;
  /** Critical threshold (°C) — significant quality risk above this */
  tempCriticalAbove: number;
  /** Optimal relative humidity range (%) */
  humidOptMin: number;
  humidOptMax: number;
  /** Humidity below this triggers dehydration risk */
  humidCautionBelow: number;
  /** Humidity above this triggers mould/rot risk */
  humidCautionAbove: number;
  /** True if direct sunlight is harmful */
  sunlightSensitive: boolean;
  /** Illuminance above which solar exposure risk is flagged (lux) */
  maxSafeLux: number;
  /** True if rain/water contact is a risk */
  moistureSensitive: boolean;
  /** Storage guidance */
  storageNotes: string;
  /** Limitations of environmental monitoring for this produce */
  limitations: string;
  /** Reference */
  reference: string;
}

/** Published agricultural reference profiles. Values are ranges, not absolutes. */
export const PRODUCE_PROFILES: Record<ProduceCategory, ProduceReferenceProfile> = {
  apple: {
    category: "apple",
    displayName: "Apples",
    emoji: "🍎",
    stallId: "s2",
    stallName: "Priya Fruits",
    // USDA AH-66: apples 0–4°C for long-term; open-market display 10–15°C acceptable short-term
    tempOptMin: 10,
    tempOptMax: 22,
    tempCautionAbove: 26,
    tempCriticalAbove: 32,
    humidOptMin: 60,
    humidOptMax: 85,
    humidCautionBelow: 50,
    humidCautionAbove: 90,
    sunlightSensitive: true,
    maxSafeLux: 25000,
    moistureSensitive: true,
    storageNotes:
      "Apples display best in a shaded, cool environment. Minimise temperature fluctuations. " +
      "Inspect for bruising and remove damaged fruit promptly to slow ethylene spread.",
    limitations:
      "Environmental sensors cannot detect internal browning, ethylene concentration, " +
      "bruise damage, or remaining edible life. Risk classification reflects ambient conditions only.",
    reference: "USDA AH-66 §1.2; FAO Postharvest Apple Fact Sheet",
  },
  tomato: {
    category: "tomato",
    displayName: "Tomatoes",
    emoji: "🍅",
    stallId: "s1",
    stallName: "Ramesh Vegetables",
    // FAO: tomato ripening 13–25°C; retail display acceptable up to 28°C short-term
    tempOptMin: 13,
    tempOptMax: 25,
    tempCautionAbove: 28,
    tempCriticalAbove: 35,
    humidOptMin: 55,
    humidOptMax: 85,
    humidCautionBelow: 45,
    humidCautionAbove: 92,
    sunlightSensitive: true,
    maxSafeLux: 30000,
    moistureSensitive: true,
    storageNotes:
      "Keep tomatoes shaded and ventilated. Avoid cold temperatures that halt ripening. " +
      "Ripe tomatoes are more sensitive than green ones. Separate over-ripe produce.",
    limitations:
      "Sensors cannot determine ripeness stage, blossom-end rot, or pathogen presence. " +
      "Environmental risk estimate only.",
    reference: "FAO Postharvest Tomato Fact Sheet; ICAR NRC for Tomato",
  },
  potato: {
    category: "potato",
    displayName: "Potatoes",
    emoji: "🥔",
    stallId: "s8",
    stallName: "Annapurna Grains",
    // USDA AH-66: potatoes 4–10°C optimal; retail acceptable up to 18°C
    tempOptMin: 10,
    tempOptMax: 20,
    tempCautionAbove: 24,
    tempCriticalAbove: 30,
    humidOptMin: 65,
    humidOptMax: 80,
    humidCautionBelow: 55,
    humidCautionAbove: 88,
    sunlightSensitive: true, // greening / solanine accumulation
    maxSafeLux: 5000, // very low — potatoes should be kept dark
    moistureSensitive: true,
    storageNotes:
      "Store potatoes in a cool, dark, well-ventilated area. Exposure to light causes greening. " +
      "Inspect for sprouting and separate affected stock.",
    limitations:
      "Sensors cannot detect solanine levels, internal sprouting, or potato variety. " +
      "Environmental sensors measure light exposure risk, not confirm greening.",
    reference: "USDA AH-66 §4.1; Karnataka Horticulture Dept. Potato Guidelines",
  },
  leafy: {
    category: "leafy",
    displayName: "Leafy Vegetables",
    emoji: "🥬",
    stallId: "s1",
    stallName: "Ramesh Vegetables",
    // FAO: leafy greens 0–5°C optimal cold-chain; market display up to 20°C acceptable short-term
    tempOptMin: 10,
    tempOptMax: 22,
    tempCautionAbove: 25,
    tempCriticalAbove: 32,
    humidOptMin: 65,
    humidOptMax: 95,
    humidCautionBelow: 55,
    humidCautionAbove: 98,
    sunlightSensitive: true,
    maxSafeLux: 20000,
    moistureSensitive: false, // leafies tolerate moderate moisture; excess is the risk
    storageNotes:
      "Keep leafy vegetables cool and shaded. Wilting accelerates rapidly above 25°C. " +
      "Mist lightly to maintain humidity but avoid standing water which promotes rot.",
    limitations:
      "Sensors cannot determine variety, harvest time, microbial load, or residual moisture. " +
      "High humidity risk reflects mould potential, not confirmed spoilage.",
    reference: "FAO Postharvest Leafy Vegetable Fact Sheet; ICAR postharvest standards",
  },
};

// ─── Risk assessment output ───────────────────────────────────────────────────

export interface RiskFactor {
  factor: string;
  measurement: string;
  reference: string;
  severity: "info" | "caution" | "warning" | "critical";
}

export interface FreshnessAssessment {
  category: ProduceCategory;
  stallId: string;
  riskLevel: RiskLevel;
  riskScore: number; // 0–100 internal score, not exposed as shelf life
  factors: RiskFactor[];
  recommendations: string[];
  summary: string;
  timestamp: string;
  source: "environmental_assessment_engine_v1";
  /** Always present — reminds operators what sensors cannot determine */
  limitations: string;
}

// ─── Sensor simulation ────────────────────────────────────────────────────────

export interface SimulatorInputs {
  hour: number;
  ambientTemp: number; // from engine.ts ambient
  heatwave: boolean;
  gridLive: boolean;
  stallTemps: number[]; // one per stall, length 8
  coolingKw: number; // misting active?
  hsun: number; // solar factor 0-1
}

/** 
 * Generate realistic simulated sensor readings from simulation state.
 * All values are clearly marked source: "simulated".
 * Returns a flat array of SensorReading objects.
 */
export function simulateSensors(inputs: SimulatorInputs): SensorReading[] {
  const now = new Date().toISOString();
  const { hour, ambientTemp, heatwave, gridLive, stallTemps, coolingKw, hsun } = inputs;

  // Rainfall: simulate brief afternoon showers in non-heatwave (Bengaluru pattern)
  const isRaining = !heatwave && hour >= 14 && hour <= 16 ? 0.4 : 0;
  const rainfallMm = isRaining * (2.5 + (hour % 3) * 0.8); // mm/hr simulated

  // Illuminance from solar factor: peak ~85,000 lux at noon clear sky
  const illuminanceLux = Math.max(0, hsun * 82000 * (heatwave ? 1.05 : 1.0));

  // Solar radiation W/m²: 1,000 × hsun on clear day
  const solarRadWm2 = Math.max(0, hsun * 1000 * (heatwave ? 1.08 : 1.0));

  // Wind: lighter in heatwave (typical Bengaluru stagnant heat)
  const windMs = heatwave ? 0.8 + (hsun * 1.2) : 1.5 + (hsun * 2.5);

  // Under-canopy ambient: 3–6°C cooler than open, more in heatwave
  const underCanopyTemp = ambientTemp - (heatwave ? 5.5 : 3.5);
  const underCanopyHumid = heatwave ? 42 + hsun * 12 : 62 + hsun * 8;

  // Misting effect on humidity
  const mistHumidBoost = coolingKw > 0 ? 12 : 0;

  const readings: SensorReading[] = [];

  // ── CANOPY WEATHER STATION ────────────────────────────────────────────
  readings.push({
    sensor_id: "canopy_temp_sht31",
    stall_id: "canopy",
    sensor_type: "temperature_ambient",
    value: parseFloat(ambientTemp.toFixed(1)),
    unit: "°C",
    status: gridLive ? "simulated" : "simulated",
    source: "simulated",
    timestamp: now,
    label: "Ambient Temperature (SHT31)",
  });

  readings.push({
    sensor_id: "canopy_humid_sht31",
    stall_id: "canopy",
    sensor_type: "relative_humidity",
    value: parseFloat((heatwave ? 35 + hsun * 10 : 58 + hsun * 15).toFixed(1)),
    unit: "%",
    status: "simulated",
    source: "simulated",
    timestamp: now,
    label: "Ambient Humidity (SHT31)",
  });

  readings.push({
    sensor_id: "canopy_rain_gauge",
    stall_id: "canopy",
    sensor_type: "rainfall_intensity",
    value: parseFloat(rainfallMm.toFixed(2)),
    unit: "mm/hr",
    status: "simulated",
    source: "simulated",
    timestamp: now,
    label: "Rainfall Intensity (Tipping Bucket)",
  });

  readings.push({
    sensor_id: "canopy_lux_bh1750",
    stall_id: "canopy",
    sensor_type: "illuminance_lux",
    value: Math.round(illuminanceLux),
    unit: "lux",
    status: "simulated",
    source: "simulated",
    timestamp: now,
    label: "Illuminance (BH1750)",
  });

  readings.push({
    sensor_id: "canopy_solar_rad",
    stall_id: "canopy",
    sensor_type: "solar_radiation_wm2",
    value: Math.round(solarRadWm2),
    unit: "W/m²",
    status: "simulated",
    source: "simulated",
    timestamp: now,
    label: "Solar Radiation (Pyranometer)",
  });

  readings.push({
    sensor_id: "canopy_wind_anem",
    stall_id: "canopy",
    sensor_type: "wind_speed_ms",
    value: parseFloat(windMs.toFixed(1)),
    unit: "m/s",
    status: "simulated",
    source: "simulated",
    timestamp: now,
    label: "Wind Speed (Anemometer)",
  });

  // ── PER-STALL SENSORS ─────────────────────────────────────────────────
  const stallIds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  stallIds.forEach((stallId, i) => {
    const stallTemp = stallTemps[i] ?? underCanopyTemp;
    // Stalls vary slightly: end stalls are more exposed
    const exposureFactor = (i === 0 || i === 7) ? 1.12 : (i === 3 || i === 4) ? 0.95 : 1.0;
    const localTemp = parseFloat((stallTemp * exposureFactor).toFixed(1));
    const localHumid = parseFloat(
      Math.min(98, Math.max(20, underCanopyHumid + mistHumidBoost + (i % 3) * 1.5)).toFixed(1)
    );
    // Contact temp (produce surface): slightly above stall air temp
    const contactTemp = parseFloat((localTemp + 1.5 + (heatwave ? 2.0 : 0.8)).toFixed(1));

    readings.push({
      sensor_id: `${stallId}_temp_sht31`,
      stall_id: stallId,
      sensor_type: "temperature_stall",
      value: localTemp,
      unit: "°C",
      status: "simulated",
      source: "simulated",
      timestamp: now,
      label: `Stall Air Temperature (SHT31)`,
    });

    readings.push({
      sensor_id: `${stallId}_humid_sht31`,
      stall_id: stallId,
      sensor_type: "relative_humidity",
      value: localHumid,
      unit: "%",
      status: "simulated",
      source: "simulated",
      timestamp: now,
      label: `Stall Humidity (SHT31)`,
    });

    readings.push({
      sensor_id: `${stallId}_contact_ds18b20`,
      stall_id: stallId,
      sensor_type: "temperature_contact",
      value: contactTemp,
      unit: "°C",
      status: "simulated",
      source: "simulated",
      timestamp: now,
      label: `Produce Surface Temperature (DS18B20)`,
    });
  });

  return readings;
}

// ─── Freshness assessment engine ──────────────────────────────────────────────

export function assessFreshness(
  category: ProduceCategory,
  stallId: string,
  sensors: SensorReading[]
): FreshnessAssessment {
  const profile = PRODUCE_PROFILES[category];
  const now = new Date().toISOString();

  const byType = (type: SensorType, sid?: string) =>
    sensors.find((s) => s.sensor_type === type && (sid ? s.stall_id === sid : true));

  const stallTemp = byType("temperature_stall", stallId)?.value;
  const stallHumid = byType("relative_humidity", stallId)?.value;
  const contactTemp = byType("temperature_contact", stallId)?.value;
  const ambientTemp = byType("temperature_ambient", "canopy")?.value;
  const rainfallMm = byType("rainfall_intensity", "canopy")?.value ?? 0;
  const lux = byType("illuminance_lux", "canopy")?.value ?? 0;
  const windMs = byType("wind_speed_ms", "canopy")?.value ?? 0;

  if (stallTemp === undefined || stallHumid === undefined) {
    return {
      category,
      stallId,
      riskLevel: "INSUFFICIENT_DATA",
      riskScore: 0,
      factors: [],
      recommendations: ["Sensor data unavailable. Check sensor connectivity."],
      summary: "Cannot assess environmental risk: stall sensor readings unavailable.",
      timestamp: now,
      source: "environmental_assessment_engine_v1",
      limitations: profile.limitations,
    };
  }

  const factors: RiskFactor[] = [];
  let riskScore = 0;

  // ── Temperature risk ─────────────────────────────────────────────────────
  const tempRef = `Optimal ${profile.tempOptMin}–${profile.tempOptMax}°C (${profile.reference})`;
  if (stallTemp > profile.tempCriticalAbove) {
    factors.push({
      factor: "Excessive heat exposure",
      measurement: `Stall temperature: ${stallTemp.toFixed(1)}°C`,
      reference: tempRef,
      severity: "critical",
    });
    riskScore += 40;
  } else if (stallTemp > profile.tempCautionAbove) {
    factors.push({
      factor: "Elevated temperature",
      measurement: `Stall temperature: ${stallTemp.toFixed(1)}°C`,
      reference: tempRef,
      severity: "warning",
    });
    riskScore += 22;
  } else if (stallTemp > profile.tempOptMax) {
    factors.push({
      factor: "Temperature above optimal display range",
      measurement: `Stall temperature: ${stallTemp.toFixed(1)}°C`,
      reference: tempRef,
      severity: "caution",
    });
    riskScore += 10;
  }

  // ── Humidity risk ────────────────────────────────────────────────────────
  const humidRef = `Optimal ${profile.humidOptMin}–${profile.humidOptMax}% RH`;
  if (stallHumid < profile.humidCautionBelow) {
    factors.push({
      factor: "Low humidity — potential moisture loss",
      measurement: `Relative humidity: ${stallHumid.toFixed(1)}%`,
      reference: humidRef,
      severity: stallHumid < profile.humidCautionBelow - 10 ? "warning" : "caution",
    });
    riskScore += 18;
  } else if (stallHumid > profile.humidCautionAbove) {
    factors.push({
      factor: "Excess humidity — condensation and mould risk",
      measurement: `Relative humidity: ${stallHumid.toFixed(1)}%`,
      reference: humidRef,
      severity: "warning",
    });
    riskScore += 16;
  }

  // ── Rainfall / moisture exposure ─────────────────────────────────────────
  if (profile.moistureSensitive && rainfallMm > 1.0) {
    factors.push({
      factor: "Rainfall moisture exposure",
      measurement: `Rainfall intensity: ${rainfallMm.toFixed(1)} mm/hr`,
      reference: "Produce should be sheltered from direct rain",
      severity: rainfallMm > 5 ? "warning" : "caution",
    });
    riskScore += rainfallMm > 5 ? 18 : 10;
  }

  // ── Sunlight / illuminance ───────────────────────────────────────────────
  if (profile.sunlightSensitive && lux > profile.maxSafeLux) {
    const luxOver = lux - profile.maxSafeLux;
    const severity = luxOver > 30000 ? "warning" : "caution";
    factors.push({
      factor: "Direct sunlight exposure",
      measurement: `Illuminance: ${Math.round(lux).toLocaleString()} lux`,
      reference: `Safe limit for ${profile.displayName}: <${profile.maxSafeLux.toLocaleString()} lux`,
      severity,
    });
    riskScore += severity === "warning" ? 20 : 10;
  }

  // ── Wind / ventilation ───────────────────────────────────────────────────
  if (category === "leafy" && windMs < 0.5) {
    factors.push({
      factor: "Low air movement — heat and humidity may concentrate",
      measurement: `Wind speed: ${windMs.toFixed(1)} m/s`,
      reference: "Some air circulation recommended for leafy produce",
      severity: "caution",
    });
    riskScore += 8;
  }

  if (category === "leafy" && windMs > 4.0) {
    factors.push({
      factor: "High wind — accelerated moisture loss and wilting",
      measurement: `Wind speed: ${windMs.toFixed(1)} m/s`,
      reference: "Shelter from strong wind recommended",
      severity: "caution",
    });
    riskScore += 8;
  }

  // ── Contact temperature (if available) ──────────────────────────────────
  if (contactTemp !== undefined && contactTemp > profile.tempCautionAbove + 3) {
    factors.push({
      factor: "Elevated produce surface temperature",
      measurement: `Contact temperature: ${contactTemp.toFixed(1)}°C`,
      reference: `Surface should track below ${profile.tempCautionAbove}°C`,
      severity: contactTemp > profile.tempCriticalAbove ? "critical" : "warning",
    });
    riskScore += 15;
  }

  riskScore = Math.min(100, riskScore);

  // ── Risk level classification ────────────────────────────────────────────
  let riskLevel: RiskLevel;
  if (riskScore === 0) riskLevel = "LOW";
  else if (riskScore <= 15) riskLevel = "LOW";
  else if (riskScore <= 30) riskLevel = "MODERATE";
  else if (riskScore <= 55) riskLevel = "HIGH";
  else riskLevel = "CRITICAL";

  // ── Recommendations ──────────────────────────────────────────────────────
  const recommendations: string[] = [];

  if (category === "apple") {
    if (stallTemp > profile.tempCautionAbove)
      recommendations.push("Move apple display away from direct sun or heat sources.");
    if (stallHumid < profile.humidCautionBelow)
      recommendations.push("Lightly mist surrounding area to raise local humidity. Do not wet the apples directly.");
    if (rainfallMm > 1.0)
      recommendations.push("Cover apple display to prevent water spotting and stem-end rot.");
    if (lux > profile.maxSafeLux)
      recommendations.push("Shade the apple display — direct sunlight raises surface temperature and speeds respiration.");
    if (riskScore <= 15)
      recommendations.push("Conditions are acceptable. Inspect for bruising and remove damaged fruit.");
  }

  if (category === "tomato") {
    if (stallTemp > profile.tempCautionAbove)
      recommendations.push("Ensure adequate ventilation around tomato crates. Avoid stacking in direct sun.");
    if (stallTemp < profile.tempOptMin)
      recommendations.push("Temperature is below optimal — ripening will slow. Monitor ripe tomatoes for chilling injury.");
    if (stallHumid > profile.humidCautionAbove)
      recommendations.push("High humidity detected. Improve ventilation and inspect for soft spots or mould.");
    if (rainfallMm > 1.0)
      recommendations.push("Shelter tomatoes from rain — excess moisture can cause cracking and accelerate decay.");
    if (riskScore <= 15)
      recommendations.push("Conditions are within acceptable range. Separate ripe and green tomatoes.");
  }

  if (category === "potato") {
    if (lux > profile.maxSafeLux)
      recommendations.push("Cover potatoes immediately — light exposure causes greening. Use opaque covering.");
    if (stallTemp > profile.tempCautionAbove)
      recommendations.push("Move potatoes to a cooler, ventilated location to slow sprouting and sugar accumulation.");
    if (stallHumid > profile.humidCautionAbove)
      recommendations.push("High humidity detected. Ensure ventilation to prevent condensation and decay.");
    if (riskScore <= 15)
      recommendations.push("Conditions are acceptable. Inspect for sprouting and separate affected stock.");
  }

  if (category === "leafy") {
    if (stallTemp > profile.tempCautionAbove)
      recommendations.push("Move leafy vegetables to the coolest shaded area. Wilting accelerates rapidly above 25°C.");
    if (stallHumid < profile.humidCautionBelow)
      recommendations.push("Humidity is low. Lightly mist leaves or wrap in damp cloth to slow moisture loss.");
    if (lux > profile.maxSafeLux)
      recommendations.push("Direct sunlight detected. Move leafy produce to shade immediately to prevent wilting.");
    if (rainfallMm > 3.0)
      recommendations.push("Heavy rain exposure. Gently shake excess water off leaves and improve drainage.");
    if (riskScore <= 15)
      recommendations.push("Conditions are within acceptable range. Remove any wilted or yellowing leaves.");
  }

  if (recommendations.length === 0) {
    recommendations.push(`Environmental conditions are within acceptable range for ${profile.displayName}.`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const topFactor = factors.find((f) => f.severity === "critical")
    ?? factors.find((f) => f.severity === "warning")
    ?? factors[0];

  const summary = topFactor
    ? `${riskLevel} environmental risk — primary concern: ${topFactor.factor.toLowerCase()}. ` +
      `Temperature: ${stallTemp.toFixed(1)}°C, Humidity: ${stallHumid.toFixed(1)}%.`
    : `Environmental conditions are acceptable for ${profile.displayName} display. ` +
      `Temperature: ${stallTemp.toFixed(1)}°C, Humidity: ${stallHumid.toFixed(1)}%.`;

  return {
    category,
    stallId,
    riskLevel,
    riskScore,
    factors,
    recommendations,
    summary,
    timestamp: now,
    source: "environmental_assessment_engine_v1",
    limitations: profile.limitations,
  };
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

export function riskLevelColor(level: RiskLevel): string {
  switch (level) {
    case "LOW": return "text-green";
    case "MODERATE": return "text-amber";
    case "HIGH": return "text-orange-500";
    case "CRITICAL": return "text-red";
    case "INSUFFICIENT_DATA": return "text-muted-foreground";
  }
}

export function riskLevelBg(level: RiskLevel): string {
  switch (level) {
    case "LOW": return "bg-green/10 border-green/30";
    case "MODERATE": return "bg-amber/10 border-amber/30";
    case "HIGH": return "bg-orange-500/10 border-orange-500/30";
    case "CRITICAL": return "bg-red/10 border-red/30";
    case "INSUFFICIENT_DATA": return "bg-muted border-border";
  }
}

export function riskLevelBadge(level: RiskLevel): string {
  switch (level) {
    case "LOW": return "bg-green/15 text-green border-green/30";
    case "MODERATE": return "bg-amber/15 text-amber border-amber/40";
    case "HIGH": return "bg-orange-500/15 text-orange-600 border-orange-500/40";
    case "CRITICAL": return "bg-red/15 text-red border-red/40";
    case "INSUFFICIENT_DATA": return "bg-muted text-muted-foreground border-border";
  }
}

export function sensorStatusColor(status: SensorStatus): string {
  switch (status) {
    case "online": return "text-green";
    case "simulated": return "text-blue";
    case "stale": return "text-amber";
    case "offline": return "text-red";
  }
}

/** Count total online/simulated sensors vs offline */
export function sensorHealthSummary(sensors: SensorReading[]) {
  const total = sensors.length;
  const active = sensors.filter((s) => s.status === "online" || s.status === "simulated").length;
  const offline = sensors.filter((s) => s.status === "offline").length;
  const stale = sensors.filter((s) => s.status === "stale").length;
  return { total, active, offline, stale };
}
