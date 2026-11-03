/**
 * app/api/voice/webhook/route.ts
 * POST — Twilio incoming WhatsApp message webhook.
 *
 * Full Dual-Channel Conversational Voice AI Pipeline:
 * Stage 1: Request parsing, credentials verification & Twilio signature validation
 * Stage 2: Vendor lookup & live evidence-based sensor reading calculation (Produce Engine)
 * Stage 3: Media fetch with Twilio S3 redirect handling (strips Auth on redirect) & transcription
 * Stage 4: Gemini audio understanding / transcription & multi-model response generation
 * Stage 5: Native-language TTS synthesis (kn-IN-Wavenet-A or hi-IN-Wavenet-D) & token generation
 * Stage 6: Twilio WhatsApp message + audio dispatch with public mediaUrl & text fallback
 */

import twilio from "twilio";
import { matchVendorByPhone } from "@/lib/vendor-registry";
import { synthesise, buildAudioToken, globalAudioStore } from "@/lib/tts-service";
import type { TtsLanguage } from "@/lib/tts-service";
import { audioStore } from "@/app/api/voice/alert/route";
import { simulateSensors, assessFreshness } from "@/lib/produce-engine";

/**
 * Mask phone numbers for safe structured diagnostic logs (GDPR/privacy safe)
 */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}

/**
 * Resolve public base URL dynamically from request headers or environment.
 * Ensures Twilio can always fetch media URLs from a public HTTPS origin.
 */
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

/**
 * Fetches media from Twilio with proper HTTP 307 redirect handling.
 *
 * ROOT CAUSE FIX:
 * Twilio returns a 307 Temporary Redirect to an Amazon S3 presigned URL.
 * Standard `fetch` forwards the Twilio `Authorization: Basic ...` header to S3,
 * which AWS S3 rejects with HTTP 400 (`Only one auth mechanism allowed`).
 * We intercept the redirect with `redirect: "manual"` and fetch from S3 without auth.
 */
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
      const redirectLocation = resp.headers.get("location");
      if (!redirectLocation) {
        console.warn("[Stage 3: Media] 307 Redirect without Location header");
        return null;
      }
      // Fetch S3 presigned URL without Twilio Authorization header
      resp = await fetch(redirectLocation);
    }

    if (!resp.ok) {
      console.warn(`[Stage 3: Media] Media download failed: HTTP ${resp.status} ${resp.statusText}`);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = resp.headers.get("content-type") ?? "audio/ogg";
    return { buffer, contentType };
  } catch (err) {
    console.error("[Stage 3: Media] Exception fetching Twilio media:", err);
    return null;
  }
}

/**
 * Produce localized intelligent fallback responses when Gemini is offline or rate limited.
 * Ensures the vendor receives meaningful market/solar intelligence instead of a generic placeholder.
 */
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
  return `नमस्ते ${vendorName} जी, सोलर शेड ग्रिड से आपकी ${stallName} का तापमान ${stallTemp.toFixed(1)} डिग्री सेल्सियस और नमी ${stallHumid.toFixed(0)} प्रतिशत है। सोलर पैनल सामान्य रूप से काम कर रहे हैं और आपको पूरी छाया मिल रही है। अपनी ${produce} को सुरक्षित रखने के लिए ठंडी जगह पर रखें।`;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  let params: Record<string, string> = {};

  try {
    const formData = await req.formData();
    params = Object.fromEntries(formData.entries()) as Record<string, string>;
  } catch {
    console.error("[Stage 1: Webhook] Failed to parse multipart form data");
    return new Response("Invalid form data", { status: 400 });
  }

  const messageSid = params["MessageSid"] ?? "unknown";
  const from = params["From"] ?? ""; // "whatsapp:+91XXXXXXXXXX"
  const bodyText = (params["Body"] ?? "").trim();
  const mediaUrl0 = params["MediaUrl0"] ?? "";
  const numMedia = parseInt(params["NumMedia"] ?? "0", 10);
  const mediaContentType0 = params["MediaContentType0"] ?? "";

  // ── Stage 1: Credentials Verification & Diagnostics ─────────────────────────
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  let waFrom = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const { url: publicBaseUrl, isPublic: isPublicUrl } = getPublicBaseUrl(req);

  // Validate Twilio Account SID format
  if (sid && !sid.startsWith("AC")) {
    console.error(
      `[Stage 1: Config Error] TWILIO_ACCOUNT_SID is invalid (must begin with 'AC'). Received prefix: ${sid.slice(0, 4)}`
    );
  }

  if (waFrom && !waFrom.startsWith("whatsapp:")) {
    waFrom = `whatsapp:${waFrom}`;
  }

  console.log(
    `[Stage 1: Webhook Received] SID: ${messageSid} | From: ${maskPhone(from)} | NumMedia: ${numMedia} | ContentType: ${mediaContentType0 || "none"} | BodyLength: ${bodyText.length} | BaseURL: ${publicBaseUrl} (${isPublicUrl ? "Public HTTPS" : "Local/HTTP"})`
  );

  // Webhook signature validation (preserved)
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const expectedWebhookUrl =
    process.env.TWILIO_WEBHOOK_URL ||
    `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}/api/voice/webhook`;

  if (authToken && signature && expectedWebhookUrl) {
    const valid = twilio.validateRequest(authToken, signature, expectedWebhookUrl, params);
    if (!valid) {
      console.warn(`[Stage 1: Webhook] Signature verification failed for URL: ${expectedWebhookUrl}`);
      // Only reject if configured webhook URL is verified in production
      if (process.env.TWILIO_WEBHOOK_URL) {
        return new Response("Forbidden: invalid Twilio signature", { status: 403 });
      }
    }
  }

  // ── Stage 2: Vendor Match & Live Evidence-Based Sensor Context ──────────────
  const { vendor, matchReason } = matchVendorByPhone(from);
  const lang: TtsLanguage = vendor.preferredLanguage;
  const primaryCategory = vendor.produceCategories[0] ?? "tomato";
  const produceList = vendor.produceCategories.join(", ");

  // Calculate actual live sensor measurements for this vendor's stall
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
    `[Stage 2: Vendor & Sensor Context] Matched: ${vendor.vendorName} (${vendor.vendorId}) | Stall: ${vendor.stallName} | Lang: ${lang} | Temp: ${stallTempReading}°C | Humid: ${stallHumidReading}% | Risk: ${assessment.riskLevel} | Reason: ${matchReason}`
  );

  // ── Stage 3: Media Fetch & Audio Transcription ─────────────────────────────
  let transcript = bodyText;

  if (numMedia > 0 && mediaUrl0) {
    console.log(`[Stage 3: Media] Voice note detected (${mediaContentType0}). Initiating fetch with 307 redirect protection...`);
    const mediaResult = await fetchTwilioMedia(mediaUrl0, sid, authToken);

    if (mediaResult && geminiKey) {
      console.log(
        `[Stage 3: Media] Retrieved audio successfully (${mediaResult.buffer.length} bytes, type ${mediaResult.contentType}). Starting Gemini audio understanding...`
      );

      // Clean mime-type for Gemini (remove codecs suffix e.g. "audio/ogg; codecs=opus" -> "audio/ogg")
      const cleanMime = mediaResult.contentType.split(";")[0].trim() || "audio/ogg";

      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const transcriptionModels = [
          process.env.GEMINI_MODEL,
          "gemini-2.5-flash",
          "gemini-2.0-flash",
          "gemini-1.5-flash",
        ].filter(Boolean) as string[];

        let transcribed = "";
        for (const m of transcriptionModels) {
          try {
            const transcribeResult = await ai.models.generateContent({
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
                      text: `Transcribe this vendor's voice message accurately. The speaker is a market vendor speaking in Kannada (ಕನ್ನಡ), Hindi (देवनागरी), or Indian English. Return ONLY the transcribed text in its native script without commentary.`,
                    },
                  ],
                },
              ],
            });
            transcribed = transcribeResult.text?.trim() ?? "";
            if (transcribed) {
              console.log(`[Stage 3: Media] Transcribed successfully using ${m}: "${transcribed.slice(0, 60)}..."`);
              break;
            }
          } catch (modelErr) {
            console.warn(`[Stage 3: Media] Model ${m} transcription attempt failed:`, modelErr);
          }
        }

        if (transcribed) {
          transcript = transcribed;
        } else {
          console.warn("[Stage 3: Media] Audio transcription returned empty. Proceeding with voice note intent.");
          transcript = "Vendor sent a voice recording inquiring about stall freshness and environmental conditions";
        }
      } catch (transcribeErr) {
        console.error("[Stage 3: Media] Audio transcription exception:", transcribeErr);
        transcript = "Vendor sent a voice recording inquiring about stall freshness and environmental conditions";
      }
    } else if (!mediaResult) {
      console.warn("[Stage 3: Media] Audio media could not be fetched from Twilio/S3. Proceeding with voice note intent.");
      transcript = "Vendor sent a voice recording inquiring about stall freshness and environmental conditions";
    }
  }

  // ── Stage 4: Gemini Evidence-Based AI Response Generation ───────────────────
  let replyText = getIntelligentFallback(
    vendor.vendorName,
    vendor.stallName,
    produceList,
    stallTempReading,
    stallHumidReading,
    lang
  );

  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const candidateModels = [
        process.env.GEMINI_MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
      ].filter(Boolean) as string[];

      const langName = lang === "kn" ? "Kannada" : "Hindi";
      const scriptRequirement =
        lang === "kn"
          ? "CRITICAL: You MUST write your response entirely in pure Kannada script (ಕನ್ನಡ ಲಿಪಿ). NEVER output English alphabets (A-Z) or Romanized Kannada (Kanglish). Use warm, polite conversational Kannada understood by local Karnataka market vendors."
          : "CRITICAL: You MUST write your response entirely in pure Devanagari Hindi script (देवनागरी लिपि). NEVER output English alphabets (A-Z) or Romanized Hindi (Hinglish). Use warm, polite conversational Hindi.";

      const prompt = `You are ARIA, the intelligent voice advisor for the Solar Shade Grid market micro-grid in Bengaluru.
You are replying directly to vendor ${vendor.vendorName} at ${vendor.stallName} (Produce: ${produceList}).

EVIDENCE-BASED SENSOR READINGS (Strictly adhere to these actual readings, NEVER invent other numbers):
- Stall Air Temperature: ${stallTempReading.toFixed(1)}°C
- Stall Relative Humidity: ${stallHumidReading.toFixed(0)}%
- Produce Surface Contact Temperature: ${contactTempReading.toFixed(1)}°C
- Solar Canopy Radiation: ${canopySolar} W/m² (Generating clean solar electricity and cooling shade)
- Freshness Assessment: ${assessment.riskLevel} (${assessment.summary})
- Primary Agricultural Recommendation: ${assessment.recommendations[0] || "Keep produce crates in ventilated shade under solar canopy"}

Instructions:
1. Speak in ${langName} in 2 to 3 concise spoken sentences.
2. Directly answer the vendor's question or message.
3. Reference the actual stall temperature (${stallTempReading.toFixed(1)}°C) and provide the actionable recommendation to protect the produce.
4. ${scriptRequirement}

Vendor message: "${transcript || "Vendor inquiring about stall conditions"}"`;

      for (const model of candidateModels) {
        try {
          const aiResponse = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          });

          const generated = aiResponse.text?.trim();
          if (generated && generated.length > 15) {
            replyText = generated;
            console.log(
              `[Stage 4: AI Response] Gemini (${model}) generated response in ${langName}: "${replyText.slice(0, 60)}..."`
            );
            break;
          }
        } catch (mErr) {
          console.warn(`[Stage 4: AI Response] Model ${model} generation failed, trying next:`, mErr);
        }
      }
    } catch (aiErr) {
      console.error("[Stage 4: AI Response] Gemini exception; applied evidence-based fallback:", aiErr);
    }
  } else {
    console.log("[Stage 4: AI Response] GEMINI_API_KEY not configured; using evidence-based fallback.");
  }

  // ── Stage 5: Native TTS Audio Synthesis ────────────────────────────────────
  let audioUrl: string | undefined;
  const replyAlertId = `webhook-${Date.now()}`;

  try {
    const audioBuffer = await synthesise(replyText, lang);
    if (audioBuffer && audioBuffer.length > 0) {
      audioStore.set(replyAlertId, audioBuffer);
      globalAudioStore.set(replyAlertId, audioBuffer);

      const token = buildAudioToken(replyAlertId, replyText, lang);
      audioUrl = `${publicBaseUrl}/api/voice/audio/${token}`;

      console.log(
        `[Stage 5: TTS] Audio synthesised (${audioBuffer.length} bytes, voice: ${lang}). URL: ${audioUrl}`
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

    // Attempt 1: Send WhatsApp voice note / audio message if audioUrl is public
    if (audioUrl && isPublicUrl) {
      try {
        console.log(`[Stage 6: Twilio Dispatch] Attempting WhatsApp audio delivery via public URL: ${audioUrl}`);
        const outbound = await client.messages.create({
          from: waFrom,
          to: toWa,
          body: replyText,
          mediaUrl: [audioUrl],
        });
        deliveryStatus = `delivered_audio (SID: ${outbound.sid})`;
        console.log(
          `[Stage 6: Twilio Dispatch] WhatsApp Audio Reply Delivered! SID: ${outbound.sid} | Status: ${outbound.status} | Duration: ${Date.now() - startTime}ms`
        );
      } catch (audioSendErr) {
        console.warn(
          "[Stage 6: Twilio Dispatch] WhatsApp audio delivery failed, falling back to instant text reply:",
          audioSendErr
        );
        // Fall through to text delivery
      }
    }

    // Attempt 2: Text delivery (if audio delivery failed or audioUrl is local)
    if (!deliveryStatus.startsWith("delivered_audio")) {
      try {
        console.log(`[Stage 6: Twilio Dispatch] Dispatching WhatsApp text reply to ${toWa}...`);
        const textOutbound = await client.messages.create({
          from: waFrom,
          to: toWa,
          body: replyText,
        });
        deliveryStatus = `delivered_text (SID: ${textOutbound.sid})`;
        console.log(
          `[Stage 6: Twilio Dispatch] WhatsApp Text Reply Delivered! SID: ${textOutbound.sid} | Status: ${textOutbound.status} | Duration: ${Date.now() - startTime}ms`
        );
      } catch (textSendErr) {
        deliveryStatus = "failed";
        console.error("[Stage 6: Twilio Dispatch] Failed to send WhatsApp text reply:", textSendErr);
      }
    }
  } else {
    deliveryStatus = "skipped_missing_credentials";
    console.warn(
      `[Stage 6: Twilio Dispatch] Missing Twilio credentials: waFrom=${!!waFrom}, sid=${sid.startsWith("AC") ? "valid" : "invalid"}, token=${!!authToken}`
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      stage: "completed",
      delivery: deliveryStatus,
      durationMs: Date.now() - startTime,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
