import { NextResponse } from "next/server";

// Bengaluru (Karnataka, India) Fixed Coordinates
const BENGALURU_COORDS = {
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  latitude: 12.9716,
  longitude: 77.5946,
  timezone: "Asia/Kolkata",
} as const;

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";

const HOURLY_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation_probability",
  "precipitation",
  "cloud_cover",
  "shortwave_radiation",
  "wind_speed_10m",
].join(",");

const DAILY_VARIABLES = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "shortwave_radiation_sum",
  "sunrise",
  "sunset",
].join(",");

export interface OpenMeteoHourlyUnits {
  time: string;
  temperature_2m: string;
  apparent_temperature: string;
  relative_humidity_2m: string;
  precipitation_probability: string;
  precipitation: string;
  cloud_cover: string;
  shortwave_radiation: string;
  wind_speed_10m: string;
}

export interface OpenMeteoHourlyData {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  relative_humidity_2m: number[];
  precipitation_probability: number[];
  precipitation: number[];
  cloud_cover: number[];
  shortwave_radiation: number[];
  wind_speed_10m: number[];
}

export interface OpenMeteoDailyUnits {
  time: string;
  temperature_2m_max: string;
  temperature_2m_min: string;
  precipitation_sum: string;
  precipitation_probability_max: string;
  shortwave_radiation_sum: string;
  sunrise: string;
  sunset: string;
}

export interface OpenMeteoDailyData {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  shortwave_radiation_sum: number[];
  sunrise: string[];
  sunset: string[];
}

interface RawOpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: OpenMeteoHourlyUnits;
  hourly: OpenMeteoHourlyData;
  daily_units: OpenMeteoDailyUnits;
  daily: OpenMeteoDailyData;
}

export interface WeatherApiResponse {
  success: boolean;
  fetchedAt: string;
  source: "open-meteo" | "cache";
  location: {
    city: string;
    state: string;
    country: string;
    requestedLatitude: number;
    requestedLongitude: number;
    resolvedLatitude: number;
    resolvedLongitude: number;
    elevationMeters: number;
    timezone: string;
    timezoneAbbreviation: string;
    utcOffsetSeconds: number;
  };
  units: {
    hourly: OpenMeteoHourlyUnits;
    daily: OpenMeteoDailyUnits;
  };
  currentHourForecast?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation_probability: number;
    precipitation: number;
    cloud_cover: number;
    shortwave_radiation: number;
    wind_speed_10m: number;
  };
  hourly: OpenMeteoHourlyData;
  daily: OpenMeteoDailyData;
}

// In-memory cache for server resiliency (15 minutes TTL)
let memoryCache: { timestamp: number; data: WeatherApiResponse } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

function validateOpenMeteoData(data: unknown): data is RawOpenMeteoResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<RawOpenMeteoResponse>;

  if (typeof d.latitude !== "number" || typeof d.longitude !== "number") return false;
  if (!d.timezone || typeof d.timezone !== "string") return false;

  // Validate hourly structure
  if (!d.hourly || !Array.isArray(d.hourly.time) || d.hourly.time.length === 0) return false;
  if (!Array.isArray(d.hourly.temperature_2m) || !Array.isArray(d.hourly.shortwave_radiation)) {
    return false;
  }

  // Validate daily structure
  if (!d.daily || !Array.isArray(d.daily.time) || d.daily.time.length === 0) return false;
  if (!Array.isArray(d.daily.temperature_2m_max) || !Array.isArray(d.daily.sunrise)) {
    return false;
  }

  return true;
}

export async function GET() {
  const now = Date.now();

  // Return fresh cache if within TTL
  if (memoryCache && now - memoryCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        ...memoryCache.data,
        source: "cache",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
          "X-Cache": "HIT",
        },
      }
    );
  }

  const queryParams = new URLSearchParams({
    latitude: BENGALURU_COORDS.latitude.toString(),
    longitude: BENGALURU_COORDS.longitude.toString(),
    hourly: HOURLY_VARIABLES,
    daily: DAILY_VARIABLES,
    forecast_days: "7",
    timezone: BENGALURU_COORDS.timezone,
  });

  const targetUrl = `${OPEN_METEO_BASE_URL}?${queryParams.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000), // 8-second timeout
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(`Open-Meteo HTTP ${response.status}: ${errText}`);
    }

    const rawData = await response.json();

    if (!validateOpenMeteoData(rawData)) {
      throw new Error("Open-Meteo returned malformed or incomplete forecast payload");
    }

    // Determine current hour index based on Asia/Kolkata local time
    const nowIsoPrefix = new Intl.DateTimeFormat("en-CA", {
      timeZone: BENGALURU_COORDS.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(/(\d{4})-(\d{2})-(\d{2}),?\s*(\d{2})/, "$1-$2-$3T$4:00");

    let currentHourIndex = rawData.hourly.time.indexOf(nowIsoPrefix);
    if (currentHourIndex === -1) {
      // Nearest past hour
      currentHourIndex = 0;
    }

    const currentHourForecast = {
      time: rawData.hourly.time[currentHourIndex],
      temperature_2m: rawData.hourly.temperature_2m[currentHourIndex],
      apparent_temperature: rawData.hourly.apparent_temperature[currentHourIndex],
      relative_humidity_2m: rawData.hourly.relative_humidity_2m[currentHourIndex],
      precipitation_probability: rawData.hourly.precipitation_probability[currentHourIndex],
      precipitation: rawData.hourly.precipitation[currentHourIndex],
      cloud_cover: rawData.hourly.cloud_cover[currentHourIndex],
      shortwave_radiation: rawData.hourly.shortwave_radiation[currentHourIndex],
      wind_speed_10m: rawData.hourly.wind_speed_10m[currentHourIndex],
    };

    const structuredPayload: WeatherApiResponse = {
      success: true,
      fetchedAt: new Date().toISOString(),
      source: "open-meteo",
      location: {
        city: BENGALURU_COORDS.city,
        state: BENGALURU_COORDS.state,
        country: BENGALURU_COORDS.country,
        requestedLatitude: BENGALURU_COORDS.latitude,
        requestedLongitude: BENGALURU_COORDS.longitude,
        resolvedLatitude: rawData.latitude,
        resolvedLongitude: rawData.longitude,
        elevationMeters: rawData.elevation,
        timezone: rawData.timezone,
        timezoneAbbreviation: rawData.timezone_abbreviation,
        utcOffsetSeconds: rawData.utc_offset_seconds,
      },
      units: {
        hourly: rawData.hourly_units,
        daily: rawData.daily_units,
      },
      currentHourForecast,
      hourly: rawData.hourly,
      daily: rawData.daily,
    };

    // Update memory cache
    memoryCache = {
      timestamp: now,
      data: structuredPayload,
    };

    return NextResponse.json(structuredPayload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Weather service error";

    // Fall back to stale cache if available
    if (memoryCache) {
      return NextResponse.json(
        {
          ...memoryCache.data,
          source: "cache",
          warning: `Serving cached forecast due to upstream error: ${errorMessage}`,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=300",
            "X-Cache": "STALE",
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve real-time weather forecast for Bengaluru",
        details: errorMessage,
        location: {
          city: BENGALURU_COORDS.city,
          state: BENGALURU_COORDS.state,
          country: BENGALURU_COORDS.country,
          latitude: BENGALURU_COORDS.latitude,
          longitude: BENGALURU_COORDS.longitude,
          timezone: BENGALURU_COORDS.timezone,
        },
        fetchedAt: new Date().toISOString(),
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
