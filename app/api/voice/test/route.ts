/**
 * app/api/voice/test/route.ts
 * Native Voice Quality & Pronunciation QA Test API.
 *
 * GET:
 *  - Returns the list of 7 mandatory test scenarios with pre-verified native phrases.
 *  - Returns configured voice models for kn-IN, hi-IN, and en-IN.
 *
 * POST:
 *  - Accepts { language: "kn" | "hi" | "en", text?: string, scenarioId?: string }
 *  - Performs Unicode script validation
 *  - Normalizes text for speech phonetics
 *  - Synthesizes audio using Google Cloud TTS (or prepares client fallback)
 *  - Returns detailed voice diagnostics, verification status, and playable audio URL
 */

import {
  VOICE_TEST_SCENARIOS,
  validateScript,
  normalizeForSpeech,
} from "@/lib/i18n-alerts";
import {
  getVoiceConfig,
  synthesise,
  buildAudioToken,
  VOICE_MAP,
  type TtsLanguage,
} from "@/lib/tts-service";
import { audioStore } from "@/app/api/voice/alert/route";

export async function GET() {
  return Response.json({
    ok: true,
    scenarios: VOICE_TEST_SCENARIOS,
    voices: VOICE_MAP,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      language = "kn",
      scenarioId,
      customText,
    } = body as {
      language: TtsLanguage;
      scenarioId?: string;
      customText?: string;
    };

    const voiceConfig = getVoiceConfig(language);

    // 1. Determine the source text
    let rawText = "";
    let selectedScenario = VOICE_TEST_SCENARIOS[0];

    if (scenarioId) {
      const found = VOICE_TEST_SCENARIOS.find((s) => s.id === scenarioId);
      if (found) {
        selectedScenario = found;
        rawText = found.phrases[language];
      }
    }

    if (customText && customText.trim().length > 0) {
      rawText = customText.trim();
    } else if (!rawText) {
      rawText = selectedScenario.phrases[language];
    }

    // 2. Validate script (checks authentic Kannada or Devanagari Unicode ranges)
    const scriptCheck = validateScript(rawText, language);

    // 3. Normalize text for speech synthesis
    const normalizedText = normalizeForSpeech(rawText, language);

    // 4. Synthesise with native voice model if Google Cloud TTS is configured
    let audioUrl: string | undefined;
    const audioBuffer = await synthesise(normalizedText, language, true);

    if (audioBuffer) {
      const testAlertId = `qa-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      audioStore.set(testAlertId, audioBuffer);
      const token = buildAudioToken(testAlertId);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
      audioUrl = `${baseUrl}/api/voice/audio/${token}`;
    }

    return Response.json({
      ok: true,
      language,
      voiceConfig,
      scriptCheck,
      rawText,
      normalizedText,
      audioUrl,
      ttsProvider: audioBuffer ? "Google Cloud Text-to-Speech (WaveNet)" : "Browser Web Speech Fallback",
      activeVoiceName: voiceConfig.name,
      locale: voiceConfig.languageCode,
      phoneticNote: selectedScenario?.phoneticNotes?.[language] ?? "",
      scenarios: VOICE_TEST_SCENARIOS,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Voice test failed";
    return Response.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
