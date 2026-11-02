/**
 * app/api/voice/audio/[token]/route.ts
 * GET — Serves a temporary, HMAC-signed audio file (MP3).
 *
 * Token format: base64url(payload) . base64url(HMAC-SHA256)
 * Payload: { alertId: string, exp: number }
 *
 * Returns the MP3 with correct MIME type and cache headers.
 * Returns 401 if token is invalid or expired.
 * Returns 404 if audio buffer is not in the in-memory store.
 */

import { verifyAudioToken } from "@/lib/tts-service";
import { audioStore } from "@/app/api/voice/alert/route";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const alertId = verifyAudioToken(token);
  if (!alertId) {
    return new Response("Unauthorized: invalid or expired token", { status: 401 });
  }

  const buffer = audioStore.get(alertId);
  if (!buffer) {
    return new Response("Not found: audio not available", { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="alert-${alertId}.mp3"`,
    },
  });
}
