/**
 * app/api/voice/alert/route.ts
 * POST { vendorId, category, riskLevel, temperature?, humidity?, forceTest? }
 *
 * 1. Look up vendor in registry.
 * 2. Check cooldown / opt-out (skipped when forceTest=true).
 * 3. Build alert message (Gemini if available, else template).
 * 4. Attempt TTS → store audio buffer in-memory (keyed by alertId).
 * 5. Try WhatsApp audio message (if TWILIO_WHATSAPP_FROM set + TTS succeeded).
 * 6. Fallback: try SMS with audio link (if TTS succeeded) or plain SMS.
 * 7. Last resort: on-screen preview (no Twilio).
 * 8. Return { alertId, channel, status, message, previewMessage? }
 */

import twilio from "twilio";
import {
  createAlert,
  markDelivered,
  markFailed,
  markSending,
  resetCooldown,
  riskToSeverity,
  shouldSendAlert,
} from "@/lib/alert-engine";
import {
  findVendor,
  getVendorById,
  getVendorPhone,
  markAlertSent,
} from "@/lib/vendor-registry";
import {
  buildAlertMessage,
  buildSmsBody,
  getProduceName,
} from "@/lib/i18n-alerts";
import { synthesise, buildAudioToken } from "@/lib/tts-service";
import type { ProduceCategory, RiskLevel } from "@/lib/produce-engine";
import type { TtsLanguage } from "@/lib/tts-service";

// In-memory audio store: alertId → Buffer
// Module-scoped — persists between requests in the same process.
export const audioStore = new Map<string, Buffer>();

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Bad request body" }, { status: 400 });
  }

  const {
    vendorId,
    stallId,
    category,
    riskLevel,
    temperature,
    humidity,
    forceTest = false,
  } = body as {
    vendorId?: string;
    stallId?: string;
    category: ProduceCategory;
    riskLevel: RiskLevel;
    temperature?: number;
    humidity?: number;
    forceTest?: boolean;
  };

  // ── Vendor lookup ──────────────────────────────────────────────────────────
  const vendor = vendorId
    ? getVendorById(vendorId)
    : stallId
    ? findVendor(stallId, category)
    : undefined;

  if (!vendor) {
    return Response.json({ ok: false, error: "Vendor not found" }, { status: 404 });
  }

  if (vendor.optedOut) {
    return Response.json({ ok: false, error: "Vendor opted out" }, { status: 200 });
  }

  // ── Cooldown check ─────────────────────────────────────────────────────────
  if (!forceTest && !shouldSendAlert(vendor.vendorId, category)) {
    return Response.json({ ok: false, error: "Cooldown active" }, { status: 200 });
  }

  if (forceTest) {
    resetCooldown(vendor.vendorId, category);
  }

  // ── Build message ──────────────────────────────────────────────────────────
  const lang: TtsLanguage = vendor.preferredLanguage;
  const produceName = getProduceName(category, lang);

  const fallbackTemplate = buildAlertMessage({
    vendorName: vendor.vendorName,
    stallName: vendor.stallName,
    produceName,
    category,
    riskLevel,
    temperature,
    humidity,
    language: lang,
  });

  let alertMessage = fallbackTemplate;

  // Try Gemini for a richer message with strict native-script enforcement
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

      const prompt =
        lang === "kn"
          ? `You are an agricultural voice advisor for Solar Shade Grid open-air market in Bengaluru.
Generate a brief, spoken-word voice alert (2-3 sentences) for vendor ${vendor.vendorName} at ${vendor.stallName}.
CRITICAL SCRIPT & LANGUAGE RULES:
1. You MUST write ONLY in authentic Kannada script (ಕನ್ನಡ ಲಿಪಿ).
2. NEVER output Romanized Kannada (no Kanglish).
3. NEVER include English words or Latin letters (A-Z).
4. Respectful greeting: "ನಮಸ್ಕಾರ ${vendor.vendorName} ಅವರೇ".
5. Mention produce: ${produceName}.
6. State the detected risk (${riskLevel === "CRITICAL" ? "ತುರ್ತು ಶಾಖದ ಅಪಾಯ" : "ಹೆಚ್ಚಿನ ತಾಪಮಾನ"}${temperature ? `, ${temperature.toFixed(1)} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್` : ""}).
7. Give a clear immediate action (e.g. "ಕ್ರೇಟುಗಳನ್ನು ತಂಪಾದ ನೆರಳಿನ ಜಾಗಕ್ಕೆ ಸರಿಸಿ").
8. Do NOT use markdown (*, _), emojis, or bullet points.`
          : lang === "hi"
          ? `You are an agricultural voice advisor for Solar Shade Grid open-air market in Bengaluru.
Generate a brief, spoken-word voice alert (2-3 sentences) for vendor ${vendor.vendorName} at ${vendor.stallName}.
CRITICAL SCRIPT & LANGUAGE RULES:
1. You MUST write ONLY in authentic Devanagari Hindi script (देवनागरी लिपि).
2. NEVER output Romanized Hindi (no Hinglish).
3. NEVER include English words or Latin letters (A-Z).
4. Respectful greeting: "नमस्ते ${vendor.vendorName} जी".
5. Mention produce: ${produceName}.
6. State the detected risk (${riskLevel === "CRITICAL" ? "आपातकालीन गर्मी जोखिम" : "बढ़ा हुआ तापमान"}${temperature ? `, ${temperature.toFixed(1)} डिग्री सेल्सियस` : ""}).
7. Give a clear immediate action (e.g. "कृपया टोकरियों को तुरंत ठंडी और छायादार जगह पर रखें।").
8. Do NOT use markdown (*, _), emojis, or bullet points.`
          : `You are an agricultural voice advisor for Solar Shade Grid open-air market in Bengaluru.
Generate a concise spoken-word voice alert (2-3 sentences) in natural Indian English for vendor ${vendor.vendorName} at ${vendor.stallName}.
Start with "Hello ${vendor.vendorName}". Mention ${produceName} and current condition (${riskLevel}${temperature ? ` at ${temperature.toFixed(1)}°C` : ""}), and give an immediate actionable instruction to protect the produce. No markdown, no emojis.`;

      const result = await ai.models.generateContent({ model, contents: prompt });
      const rawAiText = result.text?.trim();

      if (rawAiText && rawAiText.length > 20) {
        // Validate script: reject any Romanized Kannada/Hindi from entering the pipeline
        const { validateScript } = await import("@/lib/i18n-alerts");
        const check = validateScript(rawAiText, lang);
        if (check.valid) {
          alertMessage = rawAiText;
        } else {
          console.warn("[Voice Alert] AI output failed native script check, using reviewed template:", check.details);
          alertMessage = fallbackTemplate;
        }
      }
    } catch {
      // Fall through to pre-reviewed template message
      alertMessage = fallbackTemplate;
    }
  }

  // ── Create alert record ────────────────────────────────────────────────────
  const alert = createAlert({
    vendorId: vendor.vendorId,
    stallId: vendor.stallId,
    stallName: vendor.stallName,
    vendorName: vendor.vendorName,
    category,
    riskLevel,
    severity: riskToSeverity(riskLevel),
    message: alertMessage,
    language: lang,
    channel: "none",
  });

  markSending(alert.alertId);
  markAlertSent(vendor.vendorId, alert.alertId);

  const phone = getVendorPhone(vendor);

  // ── TTS ────────────────────────────────────────────────────────────────────
  const audioBuffer = await synthesise(alertMessage, lang);
  if (audioBuffer) {
    audioStore.set(alert.alertId, audioBuffer);
  }

  // ── Build audio URL (only if audio available) ──────────────────────────────
  let audioUrl: string | undefined;
  if (audioBuffer) {
    const token = buildAudioToken(alert.alertId);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    audioUrl = `${baseUrl}/api/voice/audio/${token}`;
  }

  // ── Twilio credentials check ───────────────────────────────────────────────
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const smsFrom = process.env.TWILIO_FROM;
  const waFrom = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
  const twilioReady = !!(sid && token && smsFrom && phone.startsWith("+"));
  const whatsappReady = !!(waFrom && audioUrl && twilioReady && vendor.whatsappEnabled);

  // ── Attempt WhatsApp ───────────────────────────────────────────────────────
  if (whatsappReady) {
    try {
      const client = twilio(sid!, token!);
      const msg = await client.messages.create({
        from: waFrom!,
        to: `whatsapp:${phone}`,
        body: alertMessage,
        ...(audioUrl ? { mediaUrl: [audioUrl] } : {}),
      });
      markDelivered(alert.alertId, "whatsapp", msg.sid);
      return Response.json({
        ok: true,
        alertId: alert.alertId,
        channel: "whatsapp",
        status: "delivered",
        message: alertMessage,
        twilioSid: msg.sid,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message.slice(0, 200) : "WhatsApp error";
      console.error("[Voice Alert] WhatsApp failed:", errMsg);
      // Fall through to SMS
    }
  }

  // ── Attempt SMS ────────────────────────────────────────────────────────────
  if (twilioReady && vendor.smsEnabled) {
    try {
      const client = twilio(sid!, token!);
      const smsBody = buildSmsBody(
        {
          vendorName: vendor.vendorName,
          stallName: vendor.stallName,
          produceName,
          category,
          riskLevel,
          temperature,
          humidity,
          language: lang,
        },
        audioUrl
      );
      const msg = await client.messages.create({
        from: smsFrom!,
        to: phone,
        body: smsBody,
      });
      markDelivered(alert.alertId, "sms", msg.sid);
      return Response.json({
        ok: true,
        alertId: alert.alertId,
        channel: "sms",
        status: "delivered",
        message: alertMessage,
        smsBody,
        language: lang,
        twilioSid: msg.sid,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message.slice(0, 200) : "SMS error";
      markFailed(alert.alertId, errMsg);
      return Response.json({
        ok: false,
        alertId: alert.alertId,
        channel: "none",
        status: "failed",
        error: errMsg,
        message: alertMessage,
        language: lang,
        previewMessage: alertMessage,
      });
    }
  }

  // ── On-screen preview (no Twilio configured) ───────────────────────────────
  markDelivered(alert.alertId, "preview");
  return Response.json({
    ok: true,
    alertId: alert.alertId,
    channel: "preview",
    status: "delivered",
    message: alertMessage,
    previewMessage: alertMessage,
    language: lang,
    audioUrl,
  });
}
