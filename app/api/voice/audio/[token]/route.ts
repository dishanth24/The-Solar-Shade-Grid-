/**
 * app/api/voice/audio/[token]/route.ts
 * GET — Serves a temporary, HMAC-signed audio file (MP3).
 *
 * Resilience:
 *  1. Checks in-memory globalAudioStore.
 *  2. If missing (e.g. serverless cold start / multi-instance), re-synthesizes on demand
 *     using the verified text & language from the HMAC-signed payload.
 *  3. Returns standard 200 OK with audio/mpeg headers for Twilio WhatsApp voice delivery.
 */

import { verifyAudioToken, synthesise, globalAudioStore, detectScriptFromText } from "@/lib/tts-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const tokenData = verifyAudioToken(token);
  if (!tokenData) {
    console.warn("[Voice Audio Route] Unauthorized or expired audio token requested.");
    return new Response("Unauthorized: invalid or expired token", { status: 401 });
  }

  const { alertId, text, lang } = tokenData;

  // 1. Check in-memory store
  let buffer = globalAudioStore.get(alertId);

  // 2. Multi-instance serverless resilience: if not in memory, re-synthesize
  // Explicitly uses script detection from the text payload to avoid defaulting to Kannada.
  if (!buffer && text) {
    const effectiveLang = detectScriptFromText(text) ?? lang ?? "hi";
    console.log(`[Voice Audio Route] Audio not in memory for ${alertId}, synthesizing on demand with locale ${effectiveLang}...`);
    const synthesized = await synthesise(text, effectiveLang);
    if (synthesized) {
      buffer = synthesized;
      globalAudioStore.set(alertId, buffer);
    }
  }

  if (!buffer) {
    // If still no buffer, synthesize a fallback audio frame so Twilio never gets 404
    const fallback = await synthesise("", lang ?? "hi");
    if (fallback) {
      buffer = fallback;
    } else {
      console.error(`[Voice Audio Route] Audio not available for alertId ${alertId}`);
      return new Response("Not found: audio not available", { status: 404 });
    }
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Disposition": `inline; filename="voice-${alertId}.mp3"`,
    },
  });
}

export async function HEAD(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const getResp = await GET(req, context);
  return new Response(null, {
    status: getResp.status,
    headers: getResp.headers,
  });
}
