/**
 * lib/tts-service.ts
 * Text-to-Speech service for Solar Shade Grid native-language voice alerts.
 *
 * Configured Native Voice Models:
 *  - Kannada (kn-IN): Google WaveNet `kn-IN-Wavenet-A` (Natural Kannada female voice, 0.88x pacing)
 *  - Hindi (hi-IN): Google WaveNet `hi-IN-Wavenet-D` (Natural Hindi female voice, 0.88x pacing)
 *  - English (en-IN): Google WaveNet `en-IN-Wavenet-D` (Authentic Indian English voice, 0.90x pacing)
 *
 * Features:
 *  - SSML prosody wrapping with deliberate sentence breaks for elderly vendor comprehension.
 *  - Text normalization before synthesis (temperature °C, % humidity, clean punctuation).
 *  - Secure HMAC-signed expiring audio tokens for WhatsApp voice notes and SMS fallback.
 *  - Graceful fallback when GOOGLE_TTS_API_KEY is not set (UI uses browser Web Speech with kn-IN / hi-IN).
 */

import { normalizeForSpeech } from "./i18n-alerts";

export type TtsLanguage = "en" | "kn" | "hi";

export interface VoiceModelConfig {
  languageCode: string;
  name: string;
  ssmlGender: "FEMALE" | "MALE";
  speakingRate: number;
  pitch: number;
  displayName: string;
  localeLabel: string;
  scriptLabel: string;
}

export const VOICE_MAP: Record<TtsLanguage, VoiceModelConfig> = {
  kn: {
    languageCode: "kn-IN",
    name: "kn-IN-Wavenet-A",
    ssmlGender: "FEMALE",
    speakingRate: 0.88, // Gentle, easily intelligible cadence for Karnataka market vendors
    pitch: -0.5,
    displayName: "Google Cloud WaveNet (Kannada Female A)",
    localeLabel: "kn-IN (Bengaluru/Karnataka)",
    scriptLabel: "ಕನ್ನಡ ಲಿಪಿ (Kannada Script)",
  },
  hi: {
    languageCode: "hi-IN",
    name: "hi-IN-Wavenet-D",
    ssmlGender: "FEMALE",
    speakingRate: 0.88, // Natural North/Central Indian Hindi conversational pace
    pitch: -0.5,
    displayName: "Google Cloud WaveNet (Hindi Female D)",
    localeLabel: "hi-IN (National / Devanagari)",
    scriptLabel: "देवनागरी लिपि (Devanagari Script)",
  },
  en: {
    languageCode: "en-IN",
    name: "en-IN-Wavenet-D",
    ssmlGender: "FEMALE",
    speakingRate: 0.90, // Clear Indian English articulation
    pitch: -0.5,
    displayName: "Google Cloud WaveNet (Indian English Female D)",
    localeLabel: "en-IN (Indian English)",
    scriptLabel: "Latin Script (Indian English)",
  },
};

export function getVoiceConfig(language: TtsLanguage): VoiceModelConfig {
  return VOICE_MAP[language] ?? VOICE_MAP.en;
}

/**
 * Builds SSML with natural conversational pauses between sentences and clauses.
 */
export function buildSsml(cleanText: string, language: TtsLanguage): string {
  const cfg = getVoiceConfig(language);
  const ratePercent = `${Math.round(cfg.speakingRate * 100)}%`;

  // Insert SSML pauses at sentence and clause boundaries
  const punctuated = cleanText
    .replace(/([.!?।])\s+/g, '$1 <break time="380ms"/> ')
    .replace(/([,;:])\s+/g, '$1 <break time="180ms"/> ');

  return `<speak><prosody rate="${ratePercent}" pitch="-0.5st">${punctuated}</prosody></speak>`;
}

interface GoogleTtsRequest {
  input: { text?: string; ssml?: string };
  voice: { languageCode: string; name: string; ssmlGender: "FEMALE" | "MALE" };
  audioConfig: { audioEncoding: "MP3"; speakingRate: number; pitch: number };
}

/**
 * Synthesise speech into an MP3 Buffer using native voices and SSML pacing.
 * Returns null if GOOGLE_TTS_API_KEY is not configured or fails.
 */
export async function synthesise(
  rawText: string,
  language: TtsLanguage = "en",
  useSsml = true
): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) return null;

  const voice = getVoiceConfig(language);
  const normalizedText = normalizeForSpeech(rawText, language);

  const body: GoogleTtsRequest = {
    input: useSsml
      ? { ssml: buildSsml(normalizedText, language) }
      : { text: normalizedText },
    voice: {
      languageCode: voice.languageCode,
      name: voice.name,
      ssmlGender: voice.ssmlGender,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: voice.speakingRate,
      pitch: voice.pitch,
    },
  };

  try {
    const resp = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      console.error("[TTS] Google Cloud TTS error:", resp.status, await resp.text());
      return null;
    }

    const json = (await resp.json()) as { audioContent?: string };
    if (!json.audioContent) return null;

    return Buffer.from(json.audioContent, "base64");
  } catch (err) {
    console.error("[TTS] synthesise error:", err);
    return null;
  }
}

/**
 * Build the audio token used by /api/voice/audio/[token].
 * Format: base64url( JSON({ alertId, exp }) ) + "." + HMAC-SHA256 signature
 */
export function buildAudioToken(alertId: string): string {
  const secret = process.env.AUDIO_SIGNING_SECRET ?? "demo-secret-change-me";
  const expiry =
    Date.now() + Number(process.env.AUDIO_EXPIRY_SECONDS ?? 3600) * 1000;
  const payload = Buffer.from(JSON.stringify({ alertId, exp: expiry })).toString(
    "base64url"
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${sig}`;
}

/**
 * Verify a token and return alertId, or null if expired / tampered.
 */
export function verifyAudioToken(token: string): string | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const secret = process.env.AUDIO_SIGNING_SECRET ?? "demo-secret-change-me";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto") as typeof import("crypto");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

    if (expected !== sig) return null;

    const { alertId, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { alertId: string; exp: number };

    if (Date.now() > exp) return null;

    return alertId;
  } catch {
    return null;
  }
}
