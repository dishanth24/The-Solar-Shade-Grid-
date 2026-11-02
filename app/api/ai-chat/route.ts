import { GoogleGenAI } from "@google/genai";
import { fmtRuntime, fmtClock, C } from "@/lib/engine";
import type { TickResult } from "@/lib/engine";

const TIMEOUT_MS = 8000;

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI generation timeout")), ms)
  );
}

type StallInfo = {
  id: string;
  name: string;
  temp: number;
  loadKw: number;
  status: string;
  wallet: number;
};

function buildTelemetrySummary(
  result: TickResult | undefined,
  gridLive: boolean,
  mode: string,
  stalls: StallInfo[]
): string {
  const hour = result ? fmtClock(result.hour) : "12:00";
  const gen = result ? result.genKw.toFixed(2) : "0.00";
  const demand = result ? result.demandKw.toFixed(2) : "0.00";
  const soc = result ? Math.round(result.socAfter * 100) : 50;
  const ambient = result ? result.ambient.toFixed(1) : "30.0";
  const hsun = result ? (result.hsun * 100).toFixed(0) : "0";
  const net = result ? (result.genKw - result.demandKw).toFixed(2) : "0.00";
  const sold = result ? result.soldKwh.toFixed(3) : "0.000";
  const bessKwh = (soc / 100) * C.B_CAP;
  const shedding = result?.shedding ? "YES" : "NO";
  const cooling = result?.coolingKw ? `${result.coolingKw.toFixed(2)} kW (Active)` : "Standby";
  const runtime = !gridLive && result ? fmtRuntime(result.runtimeH) : "∞ (Grid Synchronized)";
  const stallsShed = stalls.filter((s) => s.status === "shed").length;
  const stallsAmber = stalls.filter((s) => s.status === "amber").length;
  const coopWallet = stalls.reduce((a, s) => a + s.wallet, 0);

  return [
    `=== LIVE DIGITAL TWIN TELEMETRY — ${hour} ===`,
    `Mode: ${mode.toUpperCase()} | Grid: ${gridLive ? "ONLINE" : "BLACKOUT / ISLANDED"}`,
    `Solar Output: ${gen} kW (irradiance: ${hsun}% of peak)`,
    `Market Demand: ${demand} kW | Net Power: ${net} kW (${Number(net) >= 0 ? "SURPLUS" : "DEFICIT"})`,
    `Ambient Temperature: ${ambient}°C | Load Shedding: ${shedding}`,
    `BESS SOC: ${soc}% (${bessKwh.toFixed(1)} kWh stored of ${C.B_CAP} kWh) | Autonomous Runtime: ${runtime}`,
    `Misting System: ${cooling} | Surplus Sold This Tick: ${sold} kWh`,
    `Stall Status: ${8 - stallsShed - stallsAmber} OK, ${stallsAmber} amber, ${stallsShed} load-shed`,
    `Vendor Co-op Wallet: ₹${Math.round(coopWallet)} total across 8 vendors`,
  ].join("\n");
}

function buildIntelligentFallback(
  question: string,
  result: TickResult | undefined,
  gridLive: boolean,
  mode: string,
  stalls: StallInfo[]
): string {
  const hour = result ? fmtClock(result.hour) : "12:00";
  const genKw = result?.genKw ?? 0;
  const demandKw = result?.demandKw ?? 0;
  const soc = result ? Math.round(result.socAfter * 100) : 50;
  const ambient = result ? result.ambient.toFixed(1) : "30.0";
  const hsun = result ? (result.hsun * 100).toFixed(0) : "0";
  const net = genKw - demandKw;
  const bessKwh = (soc / 100) * C.B_CAP;
  const runtime = !gridLive && result ? fmtRuntime(result.runtimeH) : null;
  const stallsShed = stalls.filter((s) => s.status === "shed").length;
  const coopWallet = stalls.reduce((a, s) => a + s.wallet, 0);
  const q = question.toLowerCase();

  // Determine situation
  const isNight = genKw === 0;
  const isSurplus = net > 0;
  const isBlackout = !gridLive;
  const isHeatwave = mode === "heatwave";
  const atPayoutThreshold = soc >= (C.SOC_PAYOUT * 100);

  if (q.includes("blackout") || q.includes("island") || q.includes("grid down") || q.includes("outage")) {
    if (isBlackout) {
      return `## ⚡ Blackout Response Analysis — ${hour}

The municipal grid feeder is **currently offline**. The Solar Shade Grid has seamlessly transitioned into **autonomous islanding mode** in under 16 ms, maintaining uninterrupted power to all critical loads.

**What is happening right now:**
The 20 kWh LiFePO4 battery bank (currently at **${soc}% SOC**, holding **${bessKwh.toFixed(1)} kWh**) is serving as the sole AC voltage reference for the market microgrid. ${genKw > 0 ? `The solar canopy is actively contributing **${genKw.toFixed(2)} kW**, reducing battery draw.` : "Solar generation is unavailable at this hour, so the battery is the primary energy source."}

**Load prioritisation:**
${stallsShed > 0 ? `${stallsShed} non-critical stall loads have been shed to conserve battery reserves.` : "All 8 vendor stalls remain fully powered — no load shedding required at this battery level."} Cold storage and safety illumination are protected at the highest priority tier.

**Autonomous runtime estimate:** ${runtime ?? "Calculating..."}

**Recommended actions:**
1. Monitor battery SOC — if it drops below 20%, further load shedding activates automatically.
2. The misting system will throttle automatically under the energy budget.
3. Vendors can continue trading. Solar generation will resume at sunrise and extend runtime indefinitely if grid remains down.`;
    } else {
      return `## ⚡ Grid Resilience Assessment — ${hour}

The municipal grid is **currently live and synchronized**. The Solar Shade Grid is operating in standard grid-connected mode.

**Blackout preparedness:**
The BESS is at **${soc}% SOC (${bessKwh.toFixed(1)} kWh)**. If a blackout occurred right now, the system would island in under 16 ms. At current market load of **${demandKw.toFixed(2)} kW**, the battery alone could sustain operations for approximately **${(bessKwh / Math.max(demandKw, 0.5)).toFixed(1)} hours** without any solar contribution.

**Resilience features:**
The anti-islanding switch disconnects from the utility in under 16 ms, preventing back-feed to downed lines. The hybrid inverter immediately becomes the grid-forming source, maintaining 230 V / 50 Hz for all stall equipment.`;
    }
  }

  if (q.includes("solar") || q.includes("generation") || q.includes("pv") || q.includes("canopy") || q.includes("panel")) {
    return `## ☀️ Solar Canopy Performance — ${hour}

The 12 kW bifacial solar array is ${genKw > 0 ? `generating **${genKw.toFixed(2)} kW**` : "currently inactive (nighttime or overcast)"} at a sun irradiance factor of **${hsun}%** of peak geometry.

**Physics behind the output:**
Solar generation follows the formula *P = P_rated × H_sun × η*, where P_rated is 12 kW and η = 0.82 accounts for inverter losses, cable losses, and panel degradation. ${isHeatwave ? `The heatwave ambient of **${ambient}°C** causes slight panel temperature derating — actual cell temperatures typically run 15–25°C above ambient, reducing efficiency by roughly ${((Number(ambient) - 25) * 0.4).toFixed(1)}%.` : `At **${ambient}°C** ambient, temperature derating is minimal.`}

**Energy balance:**
With market demand at **${demandKw.toFixed(2)} kW**, the net power is **${net.toFixed(2)} kW** — a ${isSurplus ? `surplus that is simultaneously charging the BESS and ${atPayoutThreshold ? "exporting to the grid for vendor credits." : "building battery reserves."}` : "deficit covered by the BESS and grid import."}

**Daily potential:**
${isNight ? "The array will resume generation at approximately 06:00 sunrise." : `At this trajectory, the canopy is on course to generate roughly ${(genKw * 12 * 0.6).toFixed(1)} kWh today, offsetting approximately ${((genKw * 12 * 0.6 * 0.82) * 0.4).toFixed(1)} kg of CO₂ emissions.`}`;
  }

  if (q.includes("vendor") || q.includes("dividend") || q.includes("credit") || q.includes("wallet") || q.includes("co-op") || q.includes("coop")) {
    return `## 💰 Vendor Co-operative Energy Dividend Model — ${hour}

The Solar Shade Grid uses a **community energy ledger** to distribute the financial benefit of solar generation back to market vendors equitably.

**How it works:**
Whenever the battery SOC exceeds **${(C.SOC_PAYOUT * 100).toFixed(0)}%**, the system sells **${(C.SELL_SHARE * 100).toFixed(0)}%** of surplus solar generation back to BESCOM at a feed-in tariff of **₹${C.TARIFF}/kWh**. The revenue flows into a shared co-operative pool, currently holding **₹${Math.round(coopWallet)}**, and is periodically distributed to all 8 vendor stalls proportional to their metered participation.

**Current wallet snapshot:**
${stalls.slice(0, 4).map(s => `- ${s.name}: ₹${Math.round(s.wallet)}`).join("\n")}
- …and 4 more vendors.

**Why this matters:**
Traditional market vendors pay ₹8–12/kWh from the utility. Under the Solar Shade Grid, they receive subsidised power and earn back dividends when the market generates more than it consumes. This turns every vendor from a passive consumer into a micro-stakeholder in their own renewable energy infrastructure.`;
  }

  if (q.includes("recommend") || q.includes("action") || q.includes("what should") || q.includes("operator")) {
    const actions: string[] = [];

    if (isBlackout) {
      actions.push(`🔴 **Priority 1 — Blackout Management:** Grid is offline. Autonomous runtime is ${runtime}. Monitor SOC above 20% emergency floor. Dispatch SMS alert to market coordinator.`);
    }
    if (isHeatwave) {
      actions.push(`🟡 **Priority 2 — Thermal Safety:** Ambient temperature is ${ambient}°C. High-pressure misting system should be active to protect perishable produce. Check cold storage is drawing its full ${C.STORAGE_HEAT} kW budget.`);
    }
    if (soc < 30 && !gridLive) {
      actions.push(`🔴 **Priority 3 — Battery Reserve:** SOC is critically low at ${soc}%. Consider shedding lower-priority loads to extend runtime until solar generation resumes.`);
    } else if (soc >= (C.SOC_PAYOUT * 100)) {
      actions.push(`🟢 **Battery Export Opportunity:** SOC is above the ${(C.SOC_PAYOUT * 100).toFixed(0)}% payout threshold. ${(C.SELL_SHARE * 100).toFixed(0)}% of current surplus (${(net * C.SELL_SHARE).toFixed(2)} kW) is being monetised at ₹${C.TARIFF}/kWh.`);
    }
    if (stallsShed > 0) {
      actions.push(`🟡 **Restore Shed Stalls:** ${stallsShed} stalls are in safety-only mode. Restore power when net generation improves above ${demandKw.toFixed(1)} kW.`);
    }
    if (actions.length === 0) {
      actions.push(`🟢 **All Systems Nominal:** Solar output is ${genKw.toFixed(2)} kW, demand is ${demandKw.toFixed(2)} kW, BESS at ${soc}%, grid live. No immediate action required.`);
      actions.push(`💡 **Optimisation Tip:** ${genKw > 8 ? "Peak solar production window. Ensure cold storage is pre-cooling to maximum capacity before dusk." : "Consider deferring non-essential loads to the 10:00–14:00 peak solar window to maximise self-consumption."}`);
    }

    return `## 🎛️ Operator Action Recommendations — ${hour}\n\n${actions.join("\n\n")}`;
  }

  if (q.includes("battery") || q.includes("bess") || q.includes("soc") || q.includes("storage") || q.includes("charge")) {
    return `## 🔋 Battery Energy Storage System (BESS) Analysis — ${hour}

The central 20 kWh LiFePO4 battery is at **${soc}% SOC**, holding **${bessKwh.toFixed(1)} kWh** of stored energy.

**Operational thresholds:**
- **20% floor (${(C.SOC_FLOOR * C.B_CAP).toFixed(1)} kWh):** Minimum while grid is live. Protects cell longevity.
- **5% emergency floor (${(C.SOC_EMERGENCY * C.B_CAP).toFixed(1)} kWh):** Only accessible during blackout.
- **80% export trigger (${(C.SOC_PAYOUT * C.B_CAP).toFixed(1)} kWh):** Surplus sale begins above this level.

**Current state:**
${soc >= 80 ? `Battery is **above the export threshold**. ${(C.SELL_SHARE * 100).toFixed(0)}% of surplus generation is being sold back to the grid, earning vendor co-op credits at ₹${C.TARIFF}/kWh.` : soc >= 40 ? `Battery is in the **healthy operating band**. Charging ${net > 0 ? `at ${(net * C.CHARGE_EFF).toFixed(2)} kW` : "is paused — demand exceeds generation"}.` : `Battery is in the **lower reserve zone**. Prioritising charging over export until SOC recovers.`}

**Autonomy at current load (${demandKw.toFixed(2)} kW):**
${runtime ? `Grid is offline — runtime estimate: **${runtime}**.` : `If the grid disconnected now, the BESS would sustain market operations for approximately **${(bessKwh / Math.max(demandKw, 0.5)).toFixed(1)} hours** at current load.`}`;
  }

  if (q.includes("heatwave") || q.includes("heat") || q.includes("temperature") || q.includes("mist") || q.includes("cooling")) {
    return `## 🌡️ Thermal Management System — ${hour}

Ambient temperature is **${ambient}°C**. ${isHeatwave ? `The **heatwave scenario is active** — the system is operating at elevated thermal load.` : "Conditions are within normal operating range."}

**Solar canopy shade benefit:**
The overhead bifacial panel array covers approximately 85 m² of market walkway. Shade alone reduces the perceived temperature by 6–10°C compared to unshaded open-air markets, dramatically reducing heat stress on both vendors and perishable goods.

**Misting system:**
The high-pressure evaporative misting pumps are rated at **${C.MIST} kW**. ${isHeatwave ? `They are currently **active**, consuming ${result?.coolingKw?.toFixed(2) ?? C.MIST.toFixed(2)} kW. This typically achieves a further 4–6°C temperature reduction through latent heat evaporation.` : "They are in standby mode and will activate automatically above the heatwave threshold."}

**Cold storage:**
${isHeatwave ? `Boosted cold storage is consuming **${C.STORAGE_HEAT} kW**` : `Baseline cold storage is consuming **${C.STORAGE_BASE} kW**`} to protect dairy, produce, and spice inventory from thermal spoilage. This alone can prevent ₹10,000–50,000 of daily vendor losses during peak summer.`;
  }

  // Default comprehensive overview
  return `## 📊 Solar Shade Grid Situational Analysis — ${hour}

The microgrid is operating in **${mode.toUpperCase()}** mode, ${isBlackout ? "islanded from the municipal grid." : "synchronized with the BESCOM utility feeder."}

**Power Balance:**
The 12 kW solar canopy is ${isNight ? "inactive (nighttime)" : `generating **${genKw.toFixed(2)} kW**`} against a market demand of **${demandKw.toFixed(2)} kW**, resulting in a net **${isSurplus ? `surplus of ${net.toFixed(2)} kW` : `deficit of ${Math.abs(net).toFixed(2)} kW`}**. ${isSurplus ? "Excess energy is charging the central BESS." : "The battery and grid are covering the shortfall."}

**Battery Status:**
The 20 kWh LiFePO4 BESS is at **${soc}% SOC** (${bessKwh.toFixed(1)} kWh). ${soc >= 80 ? "Above the export threshold — vendor co-op credits are accumulating." : soc < 30 ? "In the lower reserve zone — prioritising recharge." : "In the healthy operating band."}

**Vendor Network:**
All ${8 - stallsShed} active stalls are powered${stallsShed > 0 ? `, with ${stallsShed} in safety-only load-shed mode` : ""}. The co-operative energy pool holds **₹${Math.round(coopWallet)}** in vendor dividends from surplus solar export.

**Key Insight:**
${isHeatwave ? "The heatwave is increasing cooling loads, but the solar canopy is simultaneously providing peak generation. The shade infrastructure directly reduces the temperature-driven energy penalty." : isBlackout ? "The system is demonstrating its core resilience value — the market continues trading through a grid outage with zero disruption to vendors." : "The Solar Shade Grid is delivering its full value proposition: clean shade, zero-carbon electricity, and community-owned energy economics — simultaneously."}`;
}

export async function POST(req: Request) {
  let question = "";
  let result: TickResult | undefined;
  let gridLive = true;
  let mode = "normal";
  let stalls: StallInfo[] = [];

  try {
    const body = await req.json();
    question = body?.question ?? "";
    result = body?.result;
    gridLive = body?.gridLive !== false;
    mode = typeof body?.mode === "string" ? body.mode : "normal";
    stalls = Array.isArray(body?.stalls) ? body.stalls : [];
  } catch {
    return Response.json({ text: "Unable to parse request.", source: "template" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const modelId = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  // ── If no API key, use the rich intelligent fallback ──
  if (!apiKey) {
    return Response.json({
      text: buildIntelligentFallback(question, result, gridLive, mode, stalls),
      source: "local-analyst",
    });
  }

  // ── Gemini path ──
  const telemetry = buildTelemetrySummary(result, gridLive, mode, stalls);

  const systemInstruction = `You are ARIA — Autonomous Renewable Intelligence Analyst — the embedded AI operator for "The Solar Shade Grid", an urban solar canopy microgrid powering an 8-vendor Indian open-air market.

System specs you know:
- Solar canopy: 12 kW bifacial, efficiency η = 0.82
- BESS: 20 kWh LiFePO4, SOC floor 20% (5% in blackout), export trigger at 80%
- Surplus sale: 60% of excess kWh at ₹6/kWh to BESCOM
- Cold storage: 1.2 kW base, 1.8 kW heatwave. Misting: 0.8 kW.
- 8 vendor stalls: Vegetables, Fruits, Flowers, Dairy, Spices, Snacks, Tea, Grains
- Heatwave threshold: 42°C ambient
- Islanding transfer: < 16 ms

Your role: provide expert, data-driven, actionable analysis in clear markdown. Be specific with numbers from the telemetry. Write like a real energy systems engineer, not a chatbot. Use headers, bullet points, and actual data. 3–5 paragraphs max. No generic filler.`;

  const userPrompt = `${telemetry}\n\nOperator question: ${question || "Give me a complete situational briefing of the microgrid right now."}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await Promise.race([
      ai.models.generateContent({
        model: modelId,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 600,
        },
      }),
      timeout<never>(TIMEOUT_MS),
    ]);

    const text = response.text?.trim();
    if (!text) {
      return Response.json({
        text: buildIntelligentFallback(question, result, gridLive, mode, stalls),
        source: "local-analyst",
      });
    }

    return Response.json({ text, source: "gemini" });
  } catch (err) {
    console.warn("[ai-chat] Gemini fallback:", err);
    return Response.json({
      text: buildIntelligentFallback(question, result, gridLive, mode, stalls),
      source: "local-analyst",
    });
  }
}
