/**
 * app/api/produce/ai-fresh/route.ts
 * POST — Gemini agricultural intelligence for produce freshness questions.
 * Falls back to a detailed deterministic analysis if no API key is available.
 */
import { GoogleGenAI } from "@google/genai";
import {
  PRODUCE_PROFILES,
  type ProduceCategory,
  type SensorReading,
  type FreshnessAssessment,
} from "@/lib/produce-engine";

const TIMEOUT_MS = 9000;
function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
}

function buildFallback(
  question: string,
  category: ProduceCategory,
  assessment: FreshnessAssessment,
  sensors: SensorReading[]
): string {
  const profile = PRODUCE_PROFILES[category];
  const stallTemp = sensors.find((s) => s.stall_id === assessment.stallId && s.sensor_type === "temperature_stall")?.value;
  const stallHumid = sensors.find((s) => s.stall_id === assessment.stallId && s.sensor_type === "relative_humidity")?.value;
  const ambTemp = sensors.find((s) => s.stall_id === "canopy" && s.sensor_type === "temperature_ambient")?.value;
  const lux = sensors.find((s) => s.stall_id === "canopy" && s.sensor_type === "illuminance_lux")?.value;
  const rain = sensors.find((s) => s.stall_id === "canopy" && s.sensor_type === "rainfall_intensity")?.value ?? 0;

  const topFactor = assessment.factors[0];
  const recs = assessment.recommendations.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join("\n");

  return `## Agricultural Environmental Analysis — ${profile.displayName}

**SITUATION:**
${profile.displayName} at ${profile.stallName} (Stall ${assessment.stallId}) are currently under **${assessment.riskLevel} environmental risk** conditions. ${assessment.summary}

**EVIDENCE:**
${stallTemp !== undefined ? `- Stall air temperature: **${stallTemp.toFixed(1)}°C** (optimal display range: ${profile.tempOptMin}–${profile.tempOptMax}°C)` : ""}
${stallHumid !== undefined ? `- Relative humidity: **${stallHumid.toFixed(1)}%** (optimal: ${profile.humidOptMin}–${profile.humidOptMax}%)` : ""}
${ambTemp !== undefined ? `- Ambient outdoor temperature: ${ambTemp.toFixed(1)}°C` : ""}
${lux !== undefined ? `- Solar illuminance: ${Math.round(lux).toLocaleString()} lux (safe limit: <${profile.maxSafeLux.toLocaleString()} lux)` : ""}
${rain > 0 ? `- Rainfall intensity: ${rain.toFixed(1)} mm/hr` : ""}
${topFactor ? `- Primary risk factor: ${topFactor.factor} (${topFactor.severity})` : ""}

**REASONING:**
${category === "apple" ? `Apples are susceptible to accelerated respiration above 26°C, leading to texture softening and flavour changes. Low humidity below 60% promotes moisture loss and surface shrivelling. Direct sunlight raises surface temperature by 5–10°C above air temperature and accelerates quality decline.` : ""}
${category === "tomato" ? `Tomatoes undergo ethylene-driven ripening that accelerates significantly above 28°C. High humidity above 90% creates conditions for fungal growth, particularly Botrytis and Alternaria. Temperature fluctuations cause condensation which promotes decay at the stem scar.` : ""}
${category === "potato" ? `Light exposure causes chlorophyll and solanine accumulation (greening) in potatoes. This process begins within hours of light exposure and cannot be reversed. High temperatures above 24°C accelerate sprouting and sugar accumulation. Environmental sensors measure light exposure risk only — they cannot confirm solanine levels.` : ""}
${category === "leafy" ? `Leafy vegetables lose turgor pressure rapidly above 25°C due to accelerated transpiration. This presents as wilting, which is irreversible once severe. High temperatures combined with low humidity create the most acute risk. Solar canopy shade can reduce this risk by 4–8°C compared to unshaded conditions.` : ""}

**RISK:**
If current conditions persist without intervention, ${
  assessment.riskLevel === "CRITICAL" ? "significant quality deterioration is likely within hours." :
  assessment.riskLevel === "HIGH" ? "quality decline may become noticeable over the next few hours." :
  assessment.riskLevel === "MODERATE" ? "gradual quality impact is possible over the next several hours." :
  "risk of quality impact remains low under current conditions."
}

**RECOMMENDATIONS:**
${recs}

**LIMITATIONS:**
${profile.limitations}

_This analysis is based on environmental sensor readings and published agricultural reference data. It reflects environmental risk conditions only. Actual produce quality assessment requires physical inspection by the vendor._`;
}

export async function POST(req: Request) {
  let question = "";
  let category: ProduceCategory = "leafy";
  let assessment: FreshnessAssessment | undefined;
  let sensors: SensorReading[] = [];

  try {
    const body = await req.json();
    question = body?.question ?? "";
    category = body?.category ?? "leafy";
    assessment = body?.assessment;
    sensors = Array.isArray(body?.sensors) ? body.sensors : [];
  } catch {
    return Response.json({ text: "Parse error.", source: "template" }, { status: 400 });
  }

  if (!assessment) {
    return Response.json({ text: "No assessment data provided.", source: "template" }, { status: 400 });
  }

  const profile = PRODUCE_PROFILES[category];
  const apiKey = process.env.GEMINI_API_KEY;
  const modelId = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    return Response.json({
      text: buildFallback(question, category, assessment, sensors),
      source: "local-analyst",
    });
  }

  const stallTemp = sensors.find((s) => s.stall_id === assessment!.stallId && s.sensor_type === "temperature_stall")?.value;
  const stallHumid = sensors.find((s) => s.stall_id === assessment!.stallId && s.sensor_type === "relative_humidity")?.value;
  const lux = sensors.find((s) => s.stall_id === "canopy" && s.sensor_type === "illuminance_lux")?.value;
  const rain = sensors.find((s) => s.stall_id === "canopy" && s.sensor_type === "rainfall_intensity")?.value ?? 0;

  const context = `
=== PRODUCE: ${profile.displayName} at ${profile.stallName} (${assessment.stallId}) ===
Risk Level: ${assessment.riskLevel} (score: ${assessment.riskScore}/100)
Stall Temperature: ${stallTemp?.toFixed(1) ?? "N/A"}°C
Stall Humidity: ${stallHumid?.toFixed(1) ?? "N/A"}%
Illuminance: ${lux ? Math.round(lux).toLocaleString() + " lux" : "N/A"}
Rainfall: ${rain.toFixed(1)} mm/hr
Risk Factors: ${assessment.factors.map((f) => f.factor + " [" + f.severity + "]").join("; ")}
Summary: ${assessment.summary}
Reference: Optimal temp ${profile.tempOptMin}–${profile.tempOptMax}°C, humidity ${profile.humidOptMin}–${profile.humidOptMax}%
Limitations: ${profile.limitations}`;

  const systemInstruction = `You are ARIA-Agri, the agricultural environmental intelligence analyst for The Solar Shade Grid — a solar-powered market infrastructure in Bengaluru, India. 
You analyse environmental sensor data and explain conditions relevant to fresh produce quality.

CRITICAL RULES:
1. You NEVER claim sensors detect spoilage, internal produce quality, or shelf life.
2. You NEVER invent measurements or fabricate sensor readings.
3. You ALWAYS distinguish environmental risk estimates from actual produce quality.
4. You answer using the SITUATION / EVIDENCE / REASONING / RISK / RECOMMENDATIONS / LIMITATIONS structure.
5. You cite specific sensor measurements from the context provided.
6. You are concise, practical, and speak to Indian open-air market vendors in clear language.`;

  const prompt = `${context}\n\nVendor question: "${question || `What is the current environmental risk for our ${profile.displayName} display and what should we do?`}"`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await Promise.race([
      ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 700,
        },
      }),
      timeout<never>(TIMEOUT_MS),
    ]);

    const text = response.text?.trim();
    if (!text) throw new Error("Empty response");
    return Response.json({ text, source: "gemini" });
  } catch (err) {
    console.warn("[produce/ai-fresh] Gemini fallback:", err);
    return Response.json({
      text: buildFallback(question, category, assessment, sensors),
      source: "local-analyst",
    });
  }
}
