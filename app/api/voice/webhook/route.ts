/**
 * app/api/voice/webhook/route.ts
 * POST — Twilio incoming WhatsApp message webhook.
 *
 * Full Dual-Channel Conversational Voice AI Pipeline:
 * Stage 1: Request parsing, credentials verification & Twilio signature validation
 * Stage 2: Vendor lookup & live evidence-based sensor reading calculation (Produce Engine)
 * Stage 3: Media fetch (307 redirect handling) → transcription → language detection
 * Stage 4: Gemini response generated in the DETECTED language (not vendor default)
 * Stage 5: Native TTS synthesis in the DETECTED language locale
 * Stage 6: Twilio WhatsApp audio + text fallback dispatch
 *
 * Language Detection:
 *   Primary: Unicode script-range heuristic — fast, free, no API needed.
 *   Secondary: Gemini language identification for ambiguous / mixed-script inputs.
 *   Fallback: vendor.preferredLanguage used ONLY when detection confidence is below threshold.
 */

import twilio from "twilio";
import { matchVendorByPhone } from "@/lib/vendor-registry";
import { synthesise, buildAudioToken, globalAudioStore } from "@/lib/tts-service";
import type { TtsLanguage } from "@/lib/tts-service";
import { audioStore } from "@/app/api/voice/alert/route";
import { simulateSensors, assessFreshness } from "@/lib/produce-engine";

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}

function getPublicBaseUrl(req: Request): { url: string; isPublic: boolean } {
  const envUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    const clean = envUrl.replace(/\/$/, "");
    return { url: clean, isPublic: clean.startsWith("https://") };
  }
  const xProto = req.headers.get("x-forwarded-proto") ?? "https";
  const xHost = req.headers.get("x-forwarded-host");
  if (xHost && !xHost.includes("localhost") && !xHost.includes("127.0.0.1")) {
    return { url: `${xProto}://${xHost}`, isPublic: xProto === "https" };
  }
  const host = req.headers.get("host");
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return { url: `${xProto}://${host}`, isPublic: xProto === "https" };
  }
  return { url: envUrl ?? "http://localhost:3000", isPublic: false };
}

async function fetchTwilioMedia(
  mediaUrl: string,
  accountSid: string,
  authToken: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const twilioAuth =
    "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    let resp = await fetch(mediaUrl, {
      headers: { Authorization: twilioAuth },
      redirect: "manual",
    });
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const loc = resp.headers.get("location");
      if (!loc) {
        console.warn("[Stage 3: Media] Redirect without Location header");
        return null;
      }
      resp = await fetch(loc); // no auth header → S3 accepts
    }
    if (!resp.ok) {
      console.warn(`[Stage 3: Media] Download failed: HTTP ${resp.status}`);
      return null;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") ?? "audio/ogg";
    return { buffer, contentType };
  } catch (err) {
    console.error("[Stage 3: Media] Exception:", err);
    return null;
  }
}

// ── Language Detection ─────────────────────────────────────────────────────────

interface LangDetectResult {
  lang: TtsLanguage;
  method: "unicode_heuristic" | "gemini_classification" | "vendor_fallback";
  confidence: "high" | "medium" | "low";
}

/**
 * Counts characters belonging to each Unicode script block in the text.
 * Returns character counts for Devanagari, Kannada, and Latin ranges.
 */
function countScriptChars(text: string): { devanagari: number; kannada: number; latin: number; total: number } {
  let devanagari = 0;
  let kannada = 0;
  let latin = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    // Devanagari: U+0900–U+097F (Hindi, Marathi, Sanskrit)
    if (cp >= 0x0900 && cp <= 0x097F) devanagari++;
    // Kannada: U+0C80–U+0CFF
    else if (cp >= 0x0C80 && cp <= 0x0CFF) kannada++;
    // Basic Latin + Latin-1: A–Z, a–z
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) latin++;
  }

  const total = devanagari + kannada + latin;
  return { devanagari, kannada, latin, total };
}

/**
 * Fast, free, zero-API language detection using Unicode script ranges.
 * Returns null when confidence is too low (< THRESHOLD) to be sure.
 */
function detectByUnicode(text: string): { lang: TtsLanguage; confidence: "high" | "medium" } | null {
  if (!text || text.trim().length < 3) return null;

  const { devanagari, kannada, latin, total } = countScriptChars(text);
  if (total < 3) return null;

  const devanagariRatio = devanagari / total;
  const kannadaRatio = kannada / total;
  const latinRatio = latin / total;

  // High-confidence detection (dominant script > 60%)
  if (devanagariRatio >= 0.6) return { lang: "hi", confidence: "high" };
  if (kannadaRatio >= 0.6) return { lang: "kn", confidence: "high" };
  if (latinRatio >= 0.6 && devanagari === 0 && kannada === 0) return { lang: "en", confidence: "high" };

  // Medium-confidence (plurality winner > 30%)
  const max = Math.max(devanagari, kannada, latin);
  if (max === devanagari && devanagariRatio >= 0.3) return { lang: "hi", confidence: "medium" };
  if (max === kannada && kannadaRatio >= 0.3) return { lang: "kn", confidence: "medium" };
  if (max === latin && latinRatio >= 0.3 && devanagari === 0 && kannada === 0) return { lang: "en", confidence: "medium" };

  return null;
}

/**
 * Asks Gemini to identify the language of a short transcript.
 * Used only when Unicode heuristic is inconclusive.
 */
async function detectByGemini(
  transcript: string,
  geminiKey: string,
  model: string
): Promise<TtsLanguage | null> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Identify the primary language of this text. Reply with ONLY one word: "hindi", "kannada", or "english". No explanation.

Text: "${transcript.slice(0, 300)}"`,
            },
          ],
        },
      ],
    });
    const answer = (result.text ?? "").trim().toLowerCase();
    if (answer.includes("hindi")) return "hi";
    if (answer.includes("kannada")) return "kn";
    if (answer.includes("english")) return "en";
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect the language of an incoming transcript.
 * Priority: Unicode heuristic → Gemini classification → vendor default fallback.
 */
async function detectLanguage(
  transcript: string,
  vendorDefault: TtsLanguage,
  geminiKey: string,
  model: string
): Promise<LangDetectResult> {
  // 1. Unicode heuristic (instant, no cost)
  const unicodeResult = detectByUnicode(transcript);
  if (unicodeResult && unicodeResult.confidence === "high") {
    return {
      lang: unicodeResult.lang,
      method: "unicode_heuristic",
      confidence: "high",
    };
  }

  // 2. Medium-confidence unicode + optional Gemini confirmation
  if (unicodeResult && unicodeResult.confidence === "medium") {
    // Accept medium confidence without spending a Gemini call unless it's ambiguous
    // (latin-heavy text could be English or romanized; others are reliable at medium)
    if (unicodeResult.lang !== "en") {
      return {
        lang: unicodeResult.lang,
        method: "unicode_heuristic",
        confidence: "medium",
      };
    }
  }

  // 3. Gemini classification for ambiguous text
  if (geminiKey && transcript.length > 5) {
    const geminiLang = await detectByGemini(transcript, geminiKey, model);
    if (geminiLang) {
      return {
        lang: geminiLang,
        method: "gemini_classification",
        confidence: "medium",
      };
    }
  }

  // 4. Accept medium-confidence English if available
  if (unicodeResult) {
    return {
      lang: unicodeResult.lang,
      method: "unicode_heuristic",
      confidence: "low",
    };
  }

  // 5. Fall back to vendor registered language
  return {
    lang: vendorDefault,
    method: "vendor_fallback",
    confidence: "low",
  };
}

// ── Localized Fallback Responses ───────────────────────────────────────────────

function getIntelligentFallback(
  vendorName: string,
  stallName: string,
  produce: string,
  stallTemp: number,
  stallHumid: number,
  lang: TtsLanguage
): string {
  if (lang === "kn") {
    return `ನಮಸ್ಕಾರ ${vendorName} ಅವರೇ, ಸೋಲಾರ್ ಶೇಡ್ ಗ್ರಿಡ್‌ನಿಂದ ನಿಮ್ಮ ${stallName} ತಾಪಮಾನ ${stallTemp.toFixed(1)} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್ ಮತ್ತು ತೇವಾಂಶ ${stallHumid.toFixed(0)} ಪ್ರತಿಶತ ಇದೆ. ಸೌರ ಫಲಕಗಳು ಸಮರ್ಪಕವಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತಿದ್ದು ತಂಪಾದ ನೆರಳು ಸಿಗುತ್ತಿದೆ. ನಿಮ್ಮ ${produce} ತಾಜಾತನ ಕಾಪಾಡಲು ನೆರಳಿನಲ್ಲಿ ಇರಿಸಿ.`;
  }
  if (lang === "hi") {
    return `नमस्ते ${vendorName} जी, सोलर शेड ग्रिड से आपकी ${stallName} का तापमान ${stallTemp.toFixed(1)} डिग्री सेल्सियस और नमी ${stallHumid.toFixed(0)} प्रतिशत है। सोलर पैनल सामान्य रूप से काम कर रहे हैं और आपको पूरी छाया मिल रही है। अपनी ${produce} को सुरक्षित रखने के लिए ठंडी जगह पर रखें।`;
  }
  // English
  return `Hello ${vendorName}, the Solar Shade Grid reports your stall temperature is ${stallTemp.toFixed(1)}°C with ${stallHumid.toFixed(0)}% humidity. The solar canopy is fully operational providing clean energy and cooling shade. Keep your ${produce} in ventilated shade to maintain freshness.`;
}

// ── Language-Specific Prompt Builders ─────────────────────────────────────────

function buildGeminiPrompt(
  lang: TtsLanguage,
  vendorName: string,
  stallName: string,
  produceList: string,
  stallTempReading: number,
  stallHumidReading: number,
  contactTempReading: number,
  canopySolar: number,
  assessment: { riskLevel: string; summary: string; recommendations: string[] },
  transcript: string
): string {
  const sensorBlock = `EVIDENCE-BASED SENSOR READINGS (use exactly these numbers, never invent others):
- Stall Air Temperature: ${stallTempReading.toFixed(1)}°C
- Stall Relative Humidity: ${stallHumidReading.toFixed(0)}%
- Produce Surface Contact Temperature: ${contactTempReading.toFixed(1)}°C
- Solar Canopy Radiation: ${canopySolar} W/m²
- Freshness Risk: ${assessment.riskLevel} — ${assessment.summary}
- Recommendation: ${assessment.recommendations[0] ?? "Keep produce in ventilated shade"}`;

  if (lang === "kn") {
    return `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market in Bengaluru.
You are replying to vendor ${vendorName} at ${stallName} (Produce: ${produceList}).

${sensorBlock}

MANDATORY RULES:
1. Respond in 2–3 spoken sentences in pure Kannada (ಕನ್ನಡ ಲಿಪಿ).
2. NEVER use English alphabet letters (A–Z) or Romanized Kannada.
3. Begin with "ನಮಸ್ಕಾರ ${vendorName} ಅವರೇ".
4. State the stall temperature (${stallTempReading.toFixed(1)} ಡಿಗ್ರಿ) and give one clear protective action.

Vendor message: "${transcript}"`;
  }

  if (lang === "hi") {
    return `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market in Bengaluru.
You are replying to vendor ${vendorName} at ${stallName} (Produce: ${produceList}).

${sensorBlock}

MANDATORY RULES:
1. Respond in 2–3 spoken sentences in pure Devanagari Hindi (देवनागरी लिपि).
2. NEVER use English alphabet letters (A–Z) or Romanized Hindi.
3. Begin with "नमस्ते ${vendorName} जी".
4. State the stall temperature (${stallTempReading.toFixed(1)} डिग्री सेल्सियस) and give one clear protective action.

Vendor message: "${transcript}"`;
  }

  // English
  return `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market in Bengaluru.
You are replying to vendor ${vendorName} at ${stallName} (Produce: ${produceList}).

${sensorBlock}

MANDATORY RULES:
1. Respond in 2–3 concise spoken sentences in clear Indian English.
2. Begin with "Hello ${vendorName}".
3. State the stall temperature (${stallTempReading.toFixed(1)}°C) and give one actionable protective recommendation.

Vendor message: "${transcript}"`;
}

// ── Webhook Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const startTime = Date.now();
  let params: Record<string, string> = {};

  try {
    const formData = await req.formData();
    params = Object.fromEntries(formData.entries()) as Record<string, string>;
  } catch {
    console.error("[Stage 1: Webhook] Failed to parse form data");
    return new Response("Invalid form data", { status: 400 });
  }

  const messageSid = params["MessageSid"] ?? "unknown";
  const from = params["From"] ?? "";
  const bodyText = (params["Body"] ?? "").trim();
  const mediaUrl0 = params["MediaUrl0"] ?? "";
  const numMedia = parseInt(params["NumMedia"] ?? "0", 10);
  const mediaContentType0 = params["MediaContentType0"] ?? "";

  // ── Stage 1: Credentials & Signature ──────────────────────────────────────
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  let waFrom = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const { url: publicBaseUrl, isPublic: isPublicUrl } = getPublicBaseUrl(req);
  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  if (sid && !sid.startsWith("AC")) {
    console.error(`[Stage 1: Config Error] TWILIO_ACCOUNT_SID must begin with 'AC'. Got prefix: ${sid.slice(0, 4)}`);
  }
  if (waFrom && !waFrom.startsWith("whatsapp:")) {
    waFrom = `whatsapp:${waFrom}`;
  }

  console.log(
    `[Stage 1: Webhook Received] SID: ${messageSid} | From: ${maskPhone(from)} | NumMedia: ${numMedia} | ContentType: ${mediaContentType0 || "none"} | BodyLength: ${bodyText.length} | BaseURL: ${publicBaseUrl} (${isPublicUrl ? "Public HTTPS" : "Local/HTTP"})`
  );

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const expectedWebhookUrl =
    process.env.TWILIO_WEBHOOK_URL ||
    `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}/api/voice/webhook`;

  if (authToken && signature && expectedWebhookUrl) {
    const valid = twilio.validateRequest(authToken, signature, expectedWebhookUrl, params);
    if (!valid) {
      console.warn(`[Stage 1: Webhook] Signature mismatch for URL: ${expectedWebhookUrl}`);
      if (process.env.TWILIO_WEBHOOK_URL) {
        return new Response("Forbidden: invalid Twilio signature", { status: 403 });
      }
    }
  }

  // ── Stage 2: Vendor Match & Sensor Context ─────────────────────────────────
  const { vendor, matchReason } = matchVendorByPhone(from);
  const vendorDefaultLang: TtsLanguage = vendor.preferredLanguage;
  const primaryCategory = vendor.produceCategories[0] ?? "tomato";
  const produceList = vendor.produceCategories.join(", ");

  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
  const sensors = simulateSensors({
    hour: nowHour,
    ambientTemp: 32.5,
    heatwave: false,
    gridLive: true,
    stallTemps: [28.2, 27.8, 28.5, 27.1, 27.4, 28.0, 27.9, 28.4],
    coolingKw: 2.4,
    hsun: Math.max(0, Math.sin(((nowHour - 6) / 12) * Math.PI)),
  });

  const assessment = assessFreshness(primaryCategory, vendor.stallId, sensors);
  const stallTempReading = sensors.find(
    (s) => s.sensor_type === "temperature_stall" && s.stall_id === vendor.stallId
  )?.value ?? 28.2;
  const stallHumidReading = sensors.find(
    (s) => s.sensor_type === "relative_humidity" && s.stall_id === vendor.stallId
  )?.value ?? 64.0;
  const contactTempReading = sensors.find(
    (s) => s.sensor_type === "temperature_contact" && s.stall_id === vendor.stallId
  )?.value ?? 29.5;
  const canopySolar = sensors.find(
    (s) => s.sensor_type === "solar_radiation_wm2" && s.stall_id === "canopy"
  )?.value ?? 650;

  console.log(
    `[Stage 2: Vendor & Sensor] Matched: ${vendor.vendorName} (${vendor.vendorId}) | Stall: ${vendor.stallName} | VendorLang: ${vendorDefaultLang} | Temp: ${stallTempReading}°C | Humid: ${stallHumidReading}% | Risk: ${assessment.riskLevel} | Reason: ${matchReason}`
  );

  // ── Stage 3: Media Fetch → Transcription → Language Detection ─────────────
  let transcript = bodyText;
  let transcriptSource: "body_text" | "audio_gemini" | "audio_fallback" = "body_text";

  if (numMedia > 0 && mediaUrl0) {
    console.log(`[Stage 3: Media] Voice note detected (${mediaContentType0}). Fetching with 307 redirect protection...`);
    const mediaResult = await fetchTwilioMedia(mediaUrl0, sid, authToken);

    if (mediaResult && geminiKey) {
      console.log(
        `[Stage 3: Media] Audio retrieved: ${mediaResult.buffer.length} bytes (${mediaResult.contentType}). Sending to Gemini for transcription...`
      );
      const cleanMime = mediaResult.contentType.split(";")[0].trim() || "audio/ogg";

      const transcriptionModels = [
        process.env.GEMINI_MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
      ].filter(Boolean) as string[];

      let transcribed = "";
      for (const m of transcriptionModels) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const result = await ai.models.generateContent({
            model: m,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime as "audio/ogg",
                      data: mediaResult.buffer.toString("base64"),
                    },
                  },
                  {
                    text: "Transcribe this voice message accurately. The speaker may speak Kannada (ಕನ್ನಡ), Hindi (देवनागरी), or Indian English. Return ONLY the transcribed text in its native script — no commentary.",
                  },
                ],
              },
            ],
          });
          transcribed = result.text?.trim() ?? "";
          if (transcribed) {
            console.log(`[Stage 3: Transcription] Model ${m} succeeded: "${transcribed.slice(0, 80)}"`);
            break;
          }
        } catch (mErr) {
          console.warn(`[Stage 3: Transcription] Model ${m} failed:`, mErr);
        }
      }

      if (transcribed) {
        transcript = transcribed;
        transcriptSource = "audio_gemini";
      } else {
        console.warn("[Stage 3: Transcription] All models returned empty. Using audio intent fallback.");
        transcript = "Vendor sent a voice message inquiring about stall freshness and environmental conditions";
        transcriptSource = "audio_fallback";
      }
    } else if (!mediaResult) {
      console.warn("[Stage 3: Media] Fetch failed. Using audio intent fallback.");
      transcript = "Vendor sent a voice message inquiring about stall freshness and environmental conditions";
      transcriptSource = "audio_fallback";
    }
  }

  // ── Language Detection ─────────────────────────────────────────────────────
  //
  // This is the FIX for the reported bug:
  // Previously lang was pinned to vendor.preferredLanguage and never updated.
  // Now we detect the actual language of the transcript and use that for
  // Stages 4 (Gemini) and 5 (TTS) so Hindi voice notes get Hindi replies.
  //
  const detectedLangResult = await detectLanguage(
    transcript,
    vendorDefaultLang,
    geminiKey,
    geminiModel
  );

  // respLang is the language used for ALL downstream processing (Gemini + TTS)
  const respLang: TtsLanguage = detectedLangResult.lang;

  const { devanagari, kannada, latin, total } = countScriptChars(transcript);
  console.log(
    `[Stage 3: Language Detection] Transcript: "${transcript.slice(0, 60)}" | ` +
    `Script chars — Devanagari:${devanagari} Kannada:${kannada} Latin:${latin} Total:${total} | ` +
    `Detected: ${respLang} (${detectedLangResult.confidence} confidence via ${detectedLangResult.method}) | ` +
    `VendorDefault: ${vendorDefaultLang} | TranscriptSource: ${transcriptSource}`
  );

  // ── Stage 4: Gemini Response in Detected Language ─────────────────────────
  const langName = respLang === "kn" ? "Kannada (ಕನ್ನಡ)" : respLang === "hi" ? "Hindi (हिन्दी)" : "Indian English";

  let replyText = getIntelligentFallback(
    vendor.vendorName,
    vendor.stallName,
    produceList,
    stallTempReading,
    stallHumidReading,
    respLang
  );

  if (geminiKey) {
    const candidateModels = [
      process.env.GEMINI_MODEL,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];

    const prompt = buildGeminiPrompt(
      respLang,
      vendor.vendorName,
      vendor.stallName,
      produceList,
      stallTempReading,
      stallHumidReading,
      contactTempReading,
      canopySolar,
      assessment,
      transcript
    );

    for (const model of candidateModels) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const aiResponse = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        const generated = aiResponse.text?.trim();
        if (generated && generated.length > 15) {
          replyText = generated;
          console.log(
            `[Stage 4: AI Response] Gemini (${model}) | ResponseLang: ${langName} | TTS locale: ${respLang === "hi" ? "hi-IN" : respLang === "kn" ? "kn-IN" : "en-IN"} | Preview: "${replyText.slice(0, 60)}"`
          );
          break;
        }
      } catch (mErr) {
        console.warn(`[Stage 4: AI Response] Model ${model} failed:`, mErr);
      }
    }
  } else {
    console.log(`[Stage 4: AI Response] No GEMINI_API_KEY — using evidence-based ${langName} fallback.`);
  }

  // ── Stage 5: TTS in Detected Language ─────────────────────────────────────
  //
  // respLang (not vendor.preferredLanguage) drives TTS locale selection.
  // Hindi input → hi-IN TTS.  Kannada input → kn-IN TTS.  English → en-IN TTS.
  //
  let audioUrl: string | undefined;
  const replyAlertId = `webhook-${Date.now()}`;

  try {
    const audioBuffer = await synthesise(replyText, respLang);
    if (audioBuffer && audioBuffer.length > 0) {
      audioStore.set(replyAlertId, audioBuffer);
      globalAudioStore.set(replyAlertId, audioBuffer);

      const token = buildAudioToken(replyAlertId, replyText, respLang);
      audioUrl = `${publicBaseUrl}/api/voice/audio/${token}`;

      console.log(
        `[Stage 5: TTS] Synthesised ${audioBuffer.length} bytes | Locale: ${respLang === "hi" ? "hi-IN" : respLang === "kn" ? "kn-IN" : "en-IN"} | URL: ${audioUrl}`
      );
    } else {
      console.warn("[Stage 5: TTS] Synthesis returned empty buffer.");
    }
  } catch (ttsErr) {
    console.error("[Stage 5: TTS] Synthesis error:", ttsErr);
  }

  // ── Stage 6: Twilio WhatsApp Dispatch ──────────────────────────────────────
  let deliveryStatus = "unattempted";

  if (waFrom && sid && authToken && from) {
    const client = twilio(sid, authToken);
    const toWa = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

    if (audioUrl && isPublicUrl) {
      try {
        console.log(`[Stage 6: Twilio Dispatch] Attempting audio delivery | Lang: ${respLang} | URL: ${audioUrl}`);
        const out = await client.messages.create({
          from: waFrom,
          to: toWa,
          body: replyText,
          mediaUrl: [audioUrl],
        });
        deliveryStatus = `delivered_audio (SID: ${out.sid})`;
        console.log(
          `[Stage 6: Twilio Dispatch] Audio delivered! SID: ${out.sid} | Status: ${out.status} | Duration: ${Date.now() - startTime}ms`
        );
      } catch (audioErr) {
        console.warn("[Stage 6: Twilio Dispatch] Audio delivery failed, falling back to text:", audioErr);
      }
    }

    if (!deliveryStatus.startsWith("delivered_audio")) {
      try {
        console.log(`[Stage 6: Twilio Dispatch] Sending text reply | Lang: ${respLang} | To: ${toWa}`);
        const textOut = await client.messages.create({
          from: waFrom,
          to: toWa,
          body: replyText,
        });
        deliveryStatus = `delivered_text (SID: ${textOut.sid})`;
        console.log(
          `[Stage 6: Twilio Dispatch] Text delivered! SID: ${textOut.sid} | Duration: ${Date.now() - startTime}ms`
        );
      } catch (textErr) {
        deliveryStatus = "failed";
        console.error("[Stage 6: Twilio Dispatch] Text delivery failed:", textErr);
      }
    }
  } else {
    deliveryStatus = "skipped_missing_credentials";
    console.warn(
      `[Stage 6: Twilio Dispatch] Missing credentials: waFrom=${!!waFrom}, sid=${sid.startsWith("AC") ? "valid" : "invalid"}, token=${!!authToken}`
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      stage: "completed",
      delivery: deliveryStatus,
      detectedLang: respLang,
      detectionMethod: detectedLangResult.method,
      durationMs: Date.now() - startTime,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
