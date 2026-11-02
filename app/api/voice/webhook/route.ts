/**
 * app/api/voice/webhook/route.ts
 * POST — Twilio incoming WhatsApp message webhook.
 *
 * Flow:
 * 1. Verify Twilio request signature.
 * 2. Parse incoming message (text or voice note MediaUrl).
 * 3. Match vendor by From number.
 * 4. If voice note: fetch audio → transcribe with Gemini (audio understanding).
 *    If text: use Body directly.
 * 5. Call Gemini with vendor context + transcript.
 * 6. TTS the response.
 * 7. Send WhatsApp reply.
 *
 * Returns 200 OK (Twilio ignores body for non-TwiML webhooks).
 */

import twilio from "twilio";
import { VENDOR_REGISTRY, getVendorPhone } from "@/lib/vendor-registry";
import { synthesise, buildAudioToken } from "@/lib/tts-service";
import type { TtsLanguage } from "@/lib/tts-service";
import { audioStore } from "@/app/api/voice/alert/route";

export async function POST(req: Request) {
  const formData = await req.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;

  // ── Twilio signature verification ──────────────────────────────────────────
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL ?? "";

  if (authToken && webhookUrl && signature) {
    const valid = twilio.validateRequest(authToken, signature, webhookUrl, params);
    if (!valid) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const from = params["From"] ?? ""; // "whatsapp:+91XXXXXXXXXX"
  const bodyText = params["Body"] ?? "";
  const mediaUrl0 = params["MediaUrl0"] ?? "";
  const numMedia = parseInt(params["NumMedia"] ?? "0", 10);

  // ── Vendor lookup by phone ─────────────────────────────────────────────────
  const rawPhone = from.replace(/^whatsapp:/, "");
  const vendor = VENDOR_REGISTRY.find((v) => getVendorPhone(v) === rawPhone);

  const vendorContext = vendor
    ? `Vendor: ${vendor.vendorName}, Stall: ${vendor.stallName}, Produce: ${vendor.produceCategories.join(", ")}`
    : "Unknown vendor at the Solar Shade Grid market";

  const lang: TtsLanguage = vendor?.preferredLanguage ?? "en";

  // ── Transcription ──────────────────────────────────────────────────────────
  let transcript = bodyText;

  const geminiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  if (numMedia > 0 && mediaUrl0 && geminiKey) {
    // Fetch the voice note audio from Twilio
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID ?? "";
      const twilioToken = process.env.TWILIO_AUTH_TOKEN ?? "";
      const audioResp = await fetch(mediaUrl0, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
        },
      });

      if (audioResp.ok) {
        const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
        const audioBase64 = audioBuffer.toString("base64");
        const contentType = audioResp.headers.get("content-type") ?? "audio/ogg";

        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const result = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: contentType as "audio/ogg",
                    data: audioBase64,
                  },
                },
                { text: "Transcribe this audio message accurately." },
              ],
            },
          ],
        });
        transcript = result.text?.trim() ?? bodyText;
      }
    } catch (err) {
      console.error("[Webhook] Audio transcription failed:", err);
    }
  }

  // ── Gemini response ────────────────────────────────────────────────────────
  let replyText =
    "Thank you for your message. The Solar Shade Grid team will respond shortly.";

  if (geminiKey && transcript) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const langName =
        lang === "kn" ? "Kannada" : lang === "hi" ? "Hindi" : "English";

      const scriptRule =
        lang === "kn"
          ? "CRITICAL: You MUST write your response entirely in pure Kannada script (ಕನ್ನಡ ಲಿಪಿ). NEVER write Romanized Kannada (Kanglish). NEVER write English alphabet letters (A-Z). Use natural spoken Kannada."
          : lang === "hi"
          ? "CRITICAL: You MUST write your response entirely in pure Devanagari Hindi script (देवनागरी लिपि). NEVER write Romanized Hindi (Hinglish). NEVER write English alphabet letters (A-Z). Use natural spoken Hindi."
          : "Write in natural, clear Indian English.";

      const systemPrompt = `You are ARIA, the AI assistant for the Solar Shade Grid — a solar-powered market in Bengaluru that provides shade and renewable energy to vendors. Answer concisely (2-3 sentences) in ${langName}. You help vendors with questions about their energy usage, produce freshness, environmental conditions and the co-operative solar system.
${scriptRule}

${vendorContext}`;

      const result = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nVendor message: ${transcript}` }],
          },
        ],
      });
      replyText = result.text?.trim() ?? replyText;
    } catch (err) {
      console.error("[Webhook] Gemini response failed:", err);
    }
  }

  // ── TTS reply ──────────────────────────────────────────────────────────────
  const audioBuffer = await synthesise(replyText, lang);
  let audioUrl: string | undefined;

  if (audioBuffer) {
    const replyAlertId = `webhook-${Date.now()}`;
    audioStore.set(replyAlertId, audioBuffer);
    const token = buildAudioToken(replyAlertId);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    audioUrl = `${baseUrl}/api/voice/audio/${token}`;
  }

  // ── Send WhatsApp reply ────────────────────────────────────────────────────
  const waFrom = process.env.TWILIO_WHATSAPP_FROM;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tokenEnv = process.env.TWILIO_AUTH_TOKEN;

  if (waFrom && sid && tokenEnv) {
    try {
      const client = twilio(sid, tokenEnv);
      await client.messages.create({
        from: waFrom,
        to: from, // "whatsapp:+91XXXXXXXXXX"
        body: replyText,
        ...(audioUrl ? { mediaUrl: [audioUrl] } : {}),
      });
    } catch (e) {
      console.error("[Webhook] Reply send failed:", e);
    }
  }

  return new Response("OK", { status: 200 });
}
