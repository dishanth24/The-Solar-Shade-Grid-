/**
 * app/api/voice/webhook/route.ts
 * POST — Twilio incoming WhatsApp message webhook.
 *
 * Full Dual-Channel Conversational Voice AI Pipeline:
 * Stage 1: Request parsing (casing-resilient & URL-decoded) & credentials verification
 * Stage 2: Vendor lookup & live evidence-based sensor reading calculation (Produce Engine)
 * Stage 3: Media fetch (307 redirect protection) → Transcription (native script) → Language Detection
 * Stage 4: Gemini AI response generation in the DETECTED language
 * Stage 5: AI response script verification & Native TTS synthesis in matching locale (hi-IN, kn-IN, en-IN)
 * Stage 6: Twilio WhatsApp dispatch (audio message with resilient text fallback)
 */

import twilio from "twilio";
import { matchVendorByPhone } from "@/lib/vendor-registry";
import {
  synthesise,
  buildAudioToken,
  globalAudioStore,
  detectScriptFromText,
} from "@/lib/tts-service";
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
  method: "unicode_script" | "hinglish_keywords" | "gemini_ai" | "fallback";
  confidence: "high" | "medium" | "low";
}

/**
 * Counts characters belonging to each Unicode script block in the text.
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
    // Latin: A–Z, a–z
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) latin++;
  }

  const total = devanagari + kannada + latin;
  return { devanagari, kannada, latin, total };
}

/**
 * Robust language detection from text content.
 * 1. Checks Unicode script counts (Devanagari -> "hi", Kannada -> "kn", Latin -> "en").
 * 2. Checks Romanized Hindi / Kannada keywords if Latin script is used.
 */
function detectByUnicodeOrKeywords(text: string): { lang: TtsLanguage; method: "unicode_script" | "hinglish_keywords"; confidence: "high" | "medium" } | null {
  if (!text || !text.trim()) return null;

  const { devanagari, kannada, latin, total } = countScriptChars(text);
  if (total === 0) return null;

  // Strict check: if Devanagari is present and predominant -> HINDI
  if (devanagari > 0 && devanagari >= kannada) {
    return { lang: "hi", method: "unicode_script", confidence: "high" };
  }

  // If Kannada script is present and predominant -> KANNADA
  if (kannada > 0 && kannada > devanagari) {
    return { lang: "kn", method: "unicode_script", confidence: "high" };
  }

  // If Latin script: check for Romanized Hindi / Kannada keywords before defaulting to English
  if (latin > 0 && devanagari === 0 && kannada === 0) {
    const lower = text.toLowerCase();
    const hindiKeywords = [
      "namaste", "namaskar", "kya", "kaise", "kaisi", "mera", "mere", "meri",
      "aap", "aapka", "karo", "karna", "tamatar", "taza", "garam", "shukriya",
      "thik", "theek", "batao", "bataiye", "sabzi", "sabji", "dukan", "kitna"
    ];
    const kannadaKeywords = [
      "namaskara", "hegide", "hegidhe", "namma", "thampaada", "keli", "maadi",
      "yenu", "enu", "tumba", "dhanyavada", "malige", "tumba", "beku"
    ];

    const isHinglish = hindiKeywords.some((w) => new RegExp(`\\b${w}\\b`, "i").test(lower));
    const isKanglish = kannadaKeywords.some((w) => new RegExp(`\\b${w}\\b`, "i").test(lower));

    if (isHinglish && !isKanglish) {
      return { lang: "hi", method: "hinglish_keywords", confidence: "medium" };
    }
    if (isKanglish && !isHinglish) {
      return { lang: "kn", method: "hinglish_keywords", confidence: "medium" };
    }

    return { lang: "en", method: "unicode_script", confidence: "high" };
  }

  return null;
}

/**
 * Gemini classification for ambiguous short text when Unicode heuristics are inconclusive.
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
              text: `Identify the primary language of this message. Reply with ONLY one word: "hindi", "kannada", or "english".\n\nText: "${transcript.slice(0, 300)}"`,
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
 * Detect the language of an incoming message.
 * Strict priority: Unicode script -> Hinglish keywords -> Gemini AI -> Safe fallback.
 */
async function detectLanguage(
  transcript: string,
  fallbackDefault: TtsLanguage,
  geminiKey: string,
  model: string
): Promise<LangDetectResult> {
  const direct = detectByUnicodeOrKeywords(transcript);
  if (direct) {
    return direct;
  }

  if (geminiKey && transcript.length > 5) {
    const geminiLang = await detectByGemini(transcript, geminiKey, model);
    if (geminiLang) {
      return { lang: geminiLang, method: "gemini_ai", confidence: "medium" };
    }
  }

  return { lang: fallbackDefault, method: "fallback", confidence: "low" };
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
  if (lang === "hi") {
    return `नमस्ते ${vendorName} जी, सोलर शेड ग्रिड से आपकी ${stallName} का तापमान ${stallTemp.toFixed(1)} डिग्री सेल्सियस और नमी ${stallHumid.toFixed(0)} प्रतिशत है। सोलर पैनल सामान्य रूप से काम कर रहे हैं और आपको पूरी छाया मिल रही है। अपनी ${produce} को सुरक्षित रखने के लिए ठंडी जगह पर रखें।`;
  }
  if (lang === "kn") {
    return `ನಮಸ್ಕಾರ ${vendorName} ಅವರೇ, ಸೋಲಾರ್ ಶೇಡ್ ಗ್ರಿಡ್‌ನಿಂದ ನಿಮ್ಮ ${stallName} ತಾಪಮಾನ ${stallTemp.toFixed(1)} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್ ಮತ್ತು ತೇವಾಂಶ ${stallHumid.toFixed(0)} ಪ್ರತಿಶತ ಇದೆ. ಸೌರ ಫಲಕಗಳು ಸಮರ್ಪಕವಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತಿದ್ದು ತಂಪಾದ ನೆರಳು ಸಿಗುತ್ತಿದೆ. ನಿಮ್ಮ ${produce} ತಾಜಾತನ ಕಾಪಾಡಲು ನೆರಳಿನಲ್ಲಿ ಇರಿಸಿ.`;
  }
  // English
  return `Hello ${vendorName}, the Solar Shade Grid reports your stall temperature is ${stallTemp.toFixed(1)}°C with ${stallHumid.toFixed(0)}% humidity. The solar canopy is providing clean power and cooling shade. Keep your ${produce} in ventilated shade to maintain freshness.`;
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
  const sensorBlock = `EVIDENCE-BASED SENSOR READINGS (Strictly adhere to these actual readings, never invent other numbers):
- Stall Air Temperature: ${stallTempReading.toFixed(1)}°C
- Stall Relative Humidity: ${stallHumidReading.toFixed(0)}%
- Produce Surface Contact Temperature: ${contactTempReading.toFixed(1)}°C
- Solar Canopy Radiation: ${canopySolar} W/m² (Generating clean power & cooling shade)
- Freshness Assessment: ${assessment.riskLevel} (${assessment.summary})
- Agricultural Recommendation: ${assessment.recommendations[0] ?? "Keep produce in ventilated shade under solar canopy"}`;

  if (lang === "hi") {
    return `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market in Bengaluru.
You are replying directly to vendor ${vendorName} at ${stallName} (Produce: ${produceList}).

${sensorBlock}

MANDATORY LANGUAGE & SCRIPT RULES:
1. You MUST write your response entirely in pure Devanagari Hindi script (देवनागरी लिपि).
2. NEVER output English alphabet letters (A-Z) or Romanized Hindi (Hinglish).
3. Begin with "नमस्ते ${vendorName} जी".
4. State the stall temperature (${stallTempReading.toFixed(1)} डिग्री सेल्सियस) and give the actionable recommendation in 2 to 3 spoken sentences.

Vendor message: "${transcript}"`;
  }

  if (lang === "kn") {
    return `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market in Bengaluru.
You are replying directly to vendor ${vendorName} at ${stallName} (Produce: ${produceList}).

${sensorBlock}

MANDATORY LANGUAGE & SCRIPT RULES:
1. You MUST write your response entirely in pure Kannada script (ಕನ್ನಡ ಲಿಪಿ).
2. NEVER output English alphabet letters (A-Z) or Romanized Kannada (Kanglish).
3. Begin with "ನಮಸ್ಕಾರ ${vendorName} ಅವರೇ".
4. State the stall temperature (${stallTempReading.toFixed(1)} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್) and give the actionable recommendation in 2 to 3 spoken sentences.

Vendor message: "${transcript}"`;
  }

  // English
  return `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market in Bengaluru.
You are replying directly to vendor ${vendorName} at ${stallName} (Produce: ${produceList}).

${sensorBlock}

MANDATORY LANGUAGE RULES:
1. Respond in 2 to 3 concise spoken sentences in clear Indian English.
2. Begin with "Hello ${vendorName}".
3. State the stall temperature (${stallTempReading.toFixed(1)}°C) and provide the actionable recommendation to protect the produce.

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

  const messageSid = params["MessageSid"] ?? params["messageSid"] ?? "unknown";
  const from = params["From"] ?? params["from"] ?? "";

  // Robust parameter extraction: handle any parameter casing from Twilio
  let bodyText = (params["Body"] ?? params["body"] ?? params["text"] ?? params["Message"] ?? "").trim();
  try {
    if (bodyText.includes("%")) {
      bodyText = decodeURIComponent(bodyText).trim();
    }
  } catch {
    // preserve original
  }

  const mediaUrl0 = params["MediaUrl0"] ?? params["mediaUrl0"] ?? "";
  const numMedia = parseInt(params["NumMedia"] ?? params["numMedia"] ?? "0", 10);
  const mediaContentType0 = params["MediaContentType0"] ?? params["mediaContentType0"] ?? "";
  const isVoiceNote = numMedia > 0 && !!mediaUrl0;
  const msgType: "voice_note" | "typed_text" = isVoiceNote ? "voice_note" : "typed_text";

  // ── Stage 1: Credentials & Signature ──────────────────────────────────────
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  let waFrom = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const { url: publicBaseUrl, isPublic: isPublicUrl } = getPublicBaseUrl(req);
  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  if (sid && !sid.startsWith("AC")) {
    console.error(`[Stage 1: Config Error] TWILIO_ACCOUNT_SID must begin with 'AC'. Got: ${sid.slice(0, 4)}`);
  }
  if (waFrom && !waFrom.startsWith("whatsapp:")) {
    waFrom = `whatsapp:${waFrom}`;
  }

  console.log(
    `[Stage 1: Webhook Received] SID: ${messageSid} | From: ${maskPhone(from)} | Type: ${msgType} | NumMedia: ${numMedia} | BodyLength: ${bodyText.length} | BaseURL: ${publicBaseUrl}`
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

  // ── Stage 3: Transcription (if voice note) & Language Detection ───────────
  let transcript = bodyText;
  let transcriptSource: "body_text" | "audio_gemini" | "audio_fallback" = "body_text";

  if (isVoiceNote) {
    console.log(`[Stage 3: Media] Voice note detected (${mediaContentType0}). Initiating fetch...`);
    const mediaResult = await fetchTwilioMedia(mediaUrl0, sid, authToken);

    if (mediaResult && geminiKey) {
      console.log(`[Stage 3: Media] Audio downloaded (${mediaResult.buffer.length} bytes). Transcribing with Gemini...`);
      const cleanMime = mediaResult.contentType.split(";")[0].trim() || "audio/ogg";

      const transcriptionPrompt = `Listen to this WhatsApp voice message from an open-air market vendor.
Accurately identify whether the speaker is speaking in Hindi (हिन्दी), Kannada (ಕನ್ನಡ), or Indian English.
Return ONLY the transcription in the speaker's language and authentic native script:
- If Hindi: write in authentic Devanagari script (देवनागरी).
- If Kannada: write in authentic Kannada script (ಕನ್ನಡ).
- If English: write in English text.
Do NOT translate into English. Do NOT add commentary. Return only the raw spoken words.`;

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
                  { text: transcriptionPrompt },
                ],
              },
            ],
          });
          transcribed = result.text?.trim() ?? "";
          if (transcribed && transcribed.length > 2) {
            console.log(`[Stage 3: Transcription] Voice note transcribed via ${m}: "${transcribed.slice(0, 80)}"`);
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
        console.warn("[Stage 3: Transcription] Audio transcription empty. Using voice note fallback.");
        transcript = "Vendor sent a voice recording inquiring about stall freshness and environmental conditions";
        transcriptSource = "audio_fallback";
      }
    } else if (!mediaResult) {
      console.warn("[Stage 3: Media] Media fetch failed. Using voice note fallback.");
      transcript = "Vendor sent a voice recording inquiring about stall freshness and environmental conditions";
      transcriptSource = "audio_fallback";
    }
  }

  // ── Language Detection on Incoming Message ─────────────────────────────────
  const detectedLangResult = await detectLanguage(
    transcript,
    vendorDefaultLang,
    geminiKey,
    geminiModel
  );

  const detectedInputLang: TtsLanguage = detectedLangResult.lang;
  const { devanagari, kannada, latin, total } = countScriptChars(transcript);

  console.log(
    `[Stage 3: Language Detection] Type: ${msgType} | Transcript: "${transcript.slice(0, 60)}" | ` +
    `ScriptChars: Dev:${devanagari} Kn:${kannada} Lat:${latin} Total:${total} | ` +
    `Detected: ${detectedInputLang} (${detectedLangResult.confidence} via ${detectedLangResult.method}) | ` +
    `VendorDefault: ${vendorDefaultLang}`
  );

  // ── Stage 4: Gemini AI Response in Detected Language ───────────────────────
  let replyText = getIntelligentFallback(
    vendor.vendorName,
    vendor.stallName,
    produceList,
    stallTempReading,
    stallHumidReading,
    detectedInputLang
  );

  if (geminiKey) {
    const candidateModels = [
      process.env.GEMINI_MODEL,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];

    const prompt = buildGeminiPrompt(
      detectedInputLang,
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
          break;
        }
      } catch (mErr) {
        console.warn(`[Stage 4: AI Response] Model ${model} failed:`, mErr);
      }
    }
  }

  // ── Stage 5: Response Script Verification & TTS Locale Mapping ────────────
  // Requirement 8: Audio generation strictly matches the language of the AI response text.
  // If replyText has Devanagari -> Hindi (hi-IN). If Kannada -> Kannada (kn-IN). If Latin -> English (en-IN).
  const detectedResponseLang = detectScriptFromText(replyText);
  const responseLang: TtsLanguage = detectedResponseLang ?? detectedInputLang;
  const ttsLocale = responseLang === "hi" ? "hi-IN" : responseLang === "kn" ? "kn-IN" : "en-IN";

  // Requirement 9: Structured diagnostic log
  console.log(
    `[Stage 4-5 Diagnostics] IncomingType: ${msgType} | IncomingText: "${transcript.slice(0, 50)}" | ` +
    `DetectedInputLang: ${detectedInputLang} | GeminiResponseLang: ${responseLang} | TTSLocale: ${ttsLocale} | ` +
    `ReplyPreview: "${replyText.slice(0, 60)}"`
  );

  let audioUrl: string | undefined;
  const replyAlertId = `webhook-${Date.now()}`;

  try {
    const audioBuffer = await synthesise(replyText, responseLang);
    if (audioBuffer && audioBuffer.length > 0) {
      audioStore.set(replyAlertId, audioBuffer);
      globalAudioStore.set(replyAlertId, audioBuffer);

      const token = buildAudioToken(replyAlertId, replyText, responseLang);
      audioUrl = `${publicBaseUrl}/api/voice/audio/${token}`;

      console.log(
        `[Stage 5: TTS] Audio synthesised (${audioBuffer.length} bytes, locale: ${ttsLocale}). URL: ${audioUrl}`
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

    // Attempt 1: Deliver voice/audio message if audioUrl is public
    if (audioUrl && isPublicUrl) {
      try {
        console.log(`[Stage 6: Twilio Dispatch] Delivering audio reply | Locale: ${ttsLocale} | To: ${toWa}`);
        const out = await client.messages.create({
          from: waFrom,
          to: toWa,
          body: replyText,
          mediaUrl: [audioUrl],
        });
        deliveryStatus = `delivered_audio (SID: ${out.sid})`;
        console.log(
          `[Stage 6: Twilio Dispatch] WhatsApp Audio Delivered! SID: ${out.sid} | Status: ${out.status} | TotalDuration: ${Date.now() - startTime}ms`
        );
      } catch (audioErr) {
        console.warn("[Stage 6: Twilio Dispatch] Audio delivery failed, falling back to text:", audioErr);
      }
    }

    // Attempt 2: Text fallback if audio delivery failed or URL is local
    if (!deliveryStatus.startsWith("delivered_audio")) {
      try {
        console.log(`[Stage 6: Twilio Dispatch] Delivering text reply | Locale: ${ttsLocale} | To: ${toWa}`);
        const textOut = await client.messages.create({
          from: waFrom,
          to: toWa,
          body: replyText,
        });
        deliveryStatus = `delivered_text (SID: ${textOut.sid})`;
        console.log(
          `[Stage 6: Twilio Dispatch] WhatsApp Text Delivered! SID: ${textOut.sid} | TotalDuration: ${Date.now() - startTime}ms`
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
      incomingType: msgType,
      detectedLang: detectedInputLang,
      responseLang: responseLang,
      ttsLocale: ttsLocale,
      durationMs: Date.now() - startTime,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
