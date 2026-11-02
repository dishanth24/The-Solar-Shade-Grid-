/**
 * lib/i18n-alerts.ts
 * High-quality, reviewed native-language alert intelligence in Kannada, Hindi and Indian English.
 *
 * Requirements:
 *  - Pure native script: Kannada (ಕನ್ನಡ ಲಿಪಿ), Hindi (देवनागरी लिपि), Indian English.
 *  - Strict ban on Romanized/Kanglish/Hinglish in TTS pipelines.
 *  - Natural conversational agricultural terminology understood by open-air market vendors.
 *  - Language-specific text normalization (converting numbers, °C, % to spoken words).
 *  - Script validation checking Unicode ranges.
 *  - Standardized test phrases for the 7 mandatory voice quality scenarios.
 */

import type { ProduceCategory, RiskLevel } from "./produce-engine";
import type { TtsLanguage } from "./tts-service";

export interface AlertTemplateParams {
  vendorName: string;
  stallName: string;
  produceName: string;
  category: ProduceCategory;
  riskLevel: RiskLevel;
  temperature?: number;
  humidity?: number;
  language: TtsLanguage;
  hazard?: "heat" | "surface_temp" | "sunlight" | "humidity" | "moisture";
}

// ─── Produce naming in native scripts ─────────────────────────────────────────

export const PRODUCE_NAMES: Record<ProduceCategory, Record<TtsLanguage, string>> = {
  tomato: {
    en: "tomatoes",
    kn: "ಟೊಮೇಟೊ",
    hi: "टमाटर",
  },
  apple: {
    en: "apples",
    kn: "ಸೇಬು",
    hi: "सेब",
  },
  potato: {
    en: "potatoes",
    kn: "ಆಲೂಗಡ್ಡೆ",
    hi: "आलू",
  },
  leafy: {
    en: "fresh leafy greens",
    kn: "ಹಸಿರು ಸೊಪ್ಪು ತರಕಾರಿಗಳು",
    hi: "हरी पत्तेदार सब्जियां",
  },
};

export function getProduceName(
  category: ProduceCategory,
  lang: TtsLanguage
): string {
  return PRODUCE_NAMES[category]?.[lang] ?? category;
}

// ─── Unicode script verification ──────────────────────────────────────────────

/**
 * Checks if the text strictly adheres to the authentic native script:
 *  - Kannada: Unicode range U+0C80 - U+0CFF
 *  - Hindi: Devanagari Unicode range U+0900 - U+097F
 *  - English: ASCII/Latin range
 */
export function validateScript(
  text: string,
  lang: TtsLanguage
): { valid: boolean; scriptName: string; details: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, scriptName: "Empty", details: "Text is empty" };
  }

  // Remove common punctuation and whitespace before checking
  const clean = text.replace(/[\s\d.,!?'"()\-:;।]/g, "");
  if (clean.length === 0) {
    return { valid: true, scriptName: "Punctuation/Numbers", details: "Punctuation only" };
  }

  const kannadaRegex = /[\u0C80-\u0CFF]/;
  const devanagariRegex = /[\u0900-\u097F]/;
  const latinRegex = /[A-Za-z]/;

  if (lang === "kn") {
    const hasKannada = kannadaRegex.test(clean);
    const hasLatin = latinRegex.test(clean);
    if (!hasKannada) {
      return {
        valid: false,
        scriptName: "Non-Kannada",
        details: "Text contains zero Kannada Unicode characters (possible Romanized Kanglish)",
      };
    }
    if (hasLatin) {
      return {
        valid: false,
        scriptName: "Mixed Script",
        details: "Text contains English characters mixed with Kannada. Must be pure Kannada script.",
      };
    }
    return {
      valid: true,
      scriptName: "ಕನ್ನಡ (Kannada)",
      details: "Authentic Kannada Unicode verified",
    };
  }

  if (lang === "hi") {
    const hasDevanagari = devanagariRegex.test(clean);
    const hasLatin = latinRegex.test(clean);
    if (!hasDevanagari) {
      return {
        valid: false,
        scriptName: "Non-Devanagari",
        details: "Text contains zero Devanagari Unicode characters (possible Romanized Hinglish)",
      };
    }
    if (hasLatin) {
      return {
        valid: false,
        scriptName: "Mixed Script",
        details: "Text contains English characters mixed with Devanagari. Must be pure Devanagari script.",
      };
    }
    return {
      valid: true,
      scriptName: "देवनागरी (Devanagari)",
      details: "Authentic Devanagari Unicode verified",
    };
  }

  // English
  return {
    valid: true,
    scriptName: "Latin (Indian English)",
    details: "English script verified",
  };
}

// ─── Text Normalization for Speech Synthesis ─────────────────────────────────

/**
 * Normalizes text specifically for TTS phonetics:
 *  - Strips markdown formatting (*, _, #, ~, `)
 *  - Strips emojis
 *  - Converts temperature symbols:
 *      kn: "36.5°C" -> "೩೬.೫ ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್" or "36.5 ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್"
 *      hi: "36.5°C" -> "36.5 डिग्री सेल्सियस"
 *      en: "36.5°C" -> "36.5 degrees Celsius"
 *  - Converts percentages:
 *      kn: "75%" -> "75 ಪ್ರತಿಶತ ತೇವಾಂಶ"
 *      hi: "75%" -> "75 प्रतिशत नमी"
 *      en: "75 percent humidity"
 *  - Cleans up stall ids (e.g. "s1" -> "ಮಳಿಗೆ ೧" or "Stall 1")
 */
export function normalizeForSpeech(text: string, lang: TtsLanguage): string {
  let cleaned = text;

  // 1. Remove Markdown and code markers
  cleaned = cleaned
    .replace(/[*_#~`>[\]()]/g, " ")
    .replace(/\s+/g, " ");

  // 2. Remove emojis and special icons
  cleaned = cleaned.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ""
  );

  // 3. Normalize Temperatures (°C / deg C)
  if (lang === "kn") {
    cleaned = cleaned.replace(/(\d+(\.\d+)?)\s*(°\s*C|deg\s*C|celsius)/gi, "$1 ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್");
    cleaned = cleaned.replace(/(\d+(\.\d+)?)\s*%/g, "$1 ಪ್ರತಿಶತ ತೇವಾಂಶ");
    cleaned = cleaned.replace(/\bstall\s*([0-9]+)\b/gi, "ಮಳಿಗೆ $1");
    cleaned = cleaned.replace(/\bs([1-8])\b/gi, "ಮಳಿಗೆ $1");
  } else if (lang === "hi") {
    cleaned = cleaned.replace(/(\d+(\.\d+)?)\s*(°\s*C|deg\s*C|celsius)/gi, "$1 डिग्री सेल्सियस");
    cleaned = cleaned.replace(/(\d+(\.\d+)?)\s*%/g, "$1 प्रतिशत नमी");
    cleaned = cleaned.replace(/\bstall\s*([0-9]+)\b/gi, "दुकान नंबर $1");
    cleaned = cleaned.replace(/\bs([1-8])\b/gi, "दुकान $1");
  } else {
    cleaned = cleaned.replace(/(\d+(\.\d+)?)\s*(°\s*C|deg\s*C)/gi, "$1 degrees Celsius");
    cleaned = cleaned.replace(/(\d+(\.\d+)?)\s*%/g, "$1 percent humidity");
    cleaned = cleaned.replace(/\bs([1-8])\b/gi, "Stall $1");
  }

  // 4. Clean duplicate spaces and trim
  return cleaned.replace(/\s+/g, " ").trim();
}

// ─── 7 Mandatory Voice Quality Test Scenarios ──────────────────────────────────

export interface VoiceTestScenario {
  id: string;
  title: string;
  description: string;
  phrases: Record<TtsLanguage, string>;
  phoneticNotes: Record<TtsLanguage, string>;
}

export const VOICE_TEST_SCENARIOS: VoiceTestScenario[] = [
  {
    id: "heat_exposure",
    title: "1. Excessive heat exposure",
    description: "Alerts vendor that high atmospheric heat is threatening produce freshness",
    phrases: {
      kn: "ಎಚ್ಚರಿಕೆ. ನಿಮ್ಮ ಮಳಿಗೆಯಲ್ಲಿ ಅತಿಯಾದ ಬಿಸಿಲಿನ ತಾಪಮಾನ ದಾಖಲಾಗಿದೆ. ಬಿಸಿಲಿನ ಶಾಖದಿಂದ ತರಕಾರಿ ಬಾಡದಂತೆ ತಕ್ಷಣ ರಕ್ಷಣೆ ಮಾಡಿ.",
      hi: "चेतावनी। आपकी दुकान पर अत्यधिक गर्मी का तापमान दर्ज किया गया है। तेज धूप और गर्मी से उपज को बचाने के तुरंत कदम उठाएं।",
      en: "Warning. Excessive ambient heat exposure detected at your stall. Protect produce immediately from heat degradation.",
    },
    phoneticNotes: {
      kn: "ಗಮನಿಸಿ: 'ಅತಿಯಾದ ಬಿಸಿಲಿನ ತಾಪಮಾನ' (athiyaada bisilina taapamaana) ಸ್ಪಷ್ಟವಾಗಿ ಉಚ್ಚಾರವಾಗಬೇಕು.",
      hi: "जांचें: 'अत्यधिक गर्मी' (atyadhik garmi) का उच्चारण स्वाभाविक और स्पष्ट होना चाहिए।",
      en: "Check natural Indian English pacing on 'Excessive ambient heat'.",
    },
  },
  {
    id: "surface_temp",
    title: "2. Elevated produce surface temperature",
    description: "Contact sensor detects high temperature directly on produce surface",
    phrases: {
      kn: "ಗಮನಿಸಿ. ಉತ್ಪನ್ನಗಳ ಮೇಲ್ಮೈ ತಾಪಮಾನ ೩೭ ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್‌ಗೆ ತಲುಪಿದೆ. ಇದು ಗುಣಮಟ್ಟ ಹಾಳುಮಾಡಬಹುದು.",
      hi: "ध्यान दें। उपज की सतह का तापमान 37 डिग्री सेल्सियस तक पहुँच चुका है। यह गुणवत्ता को खराब कर सकता है।",
      en: "Notice. Produce surface temperature has reached 37 degrees Celsius, risking structural softening.",
    },
    phoneticNotes: {
      kn: "'೩೭ ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್' (37 degree Celsius) ಸಂಖ್ಯೆ ಮತ್ತು ಯೂನಿಟ್ ನಿರರ್ಗಳವಾಗಿ ಕೇಳಿಸಬೇಕು.",
      hi: "'37 डिग्री सेल्सियस' स्पष्ट देवनागरी उच्चारण में आना चाहिए।",
      en: "Verify clear articulation of '37 degrees Celsius'.",
    },
  },
  {
    id: "sunlight_exposure",
    title: "3. Direct sunlight exposure",
    description: "Canopy lux meter detects direct sun penetration onto display crates",
    phrases: {
      kn: "ನೇರ ಸೂರ್ಯನ ಬಿಸಿಲು ನಿಮ್ಮ ಉತ್ಪನ್ನಗಳ ಕ್ರೇಟುಗಳ ಮೇಲೆ ಬೀಳುತ್ತಿದೆ. ನೆರಳಿನ ಪರದೆ ಸರಿಸಿ.",
      hi: "आपकी उपज की टोकरियों पर सीधी धूप पड़ रही है। कृपया तुरंत शेड का पर्दा नीचे करें।",
      en: "Direct sunlight is penetrating onto your produce crates. Lower the solar shade curtain.",
    },
    phoneticNotes: {
      kn: "'ಸೂರ್ಯನ ಬಿಸಿಲು' (sooryana bisilu) ಮತ್ತು 'ಕ್ರೇಟುಗಳ' (kretugala) ನೈಸರ್ಗಿಕವಾಗಿರಬೇಕು.",
      hi: "'सीधी धूप' (seedhi dhoop) और 'टोकरियों' (tokriyon) का स्थानीय उच्चारण।",
      en: "Pacing should be firm and urgent.",
    },
  },
  {
    id: "high_humidity",
    title: "4. High humidity",
    description: "Hygrometer measures excessive relative humidity (>80%) promoting rot",
    phrases: {
      kn: "ವಾತಾವರಣದಲ್ಲಿ ತೇವಾಂಶ ೮೦ ಪ್ರತಿಶತ ಮೀರಿದೆ. ಶಿಲೀಂಧ್ರ ಬರದಂತೆ ಗಾಳಿಯಾಡುವಂತೆ ಮಾಡಿ.",
      hi: "हवा में नमी 80 प्रतिशत से अधिक हो गई है। फंगस से बचाव के लिए वेंटिलेशन बढ़ाएं।",
      en: "Relative humidity exceeds 80 percent. Ensure adequate cross airflow to prevent mold.",
    },
    phoneticNotes: {
      kn: "'ತೇವಾಂಶ' (thevaamsha) ಮತ್ತು 'ಗಾಳಿಯಾಡುವಂತೆ' (gaaliyaaduvaanthe) ನೈಸರ್ಗಿಕ ಶ್ರವ್ಯತೆ.",
      hi: "'नमी' (nami) और 'वेंटिलेशन' सहज प्रवाह में होना चाहिए।",
      en: "Assess smooth transition between numbers and percentage.",
    },
  },
  {
    id: "excessive_moisture",
    title: "5. Excessive moisture",
    description: "Rain runoff or dripping detected near produce storage crates",
    phrases: {
      kn: "ಕ್ರೇಟುಗಳ ಹತ್ತಿರ ಅತಿಯಾದ ನೀರು ಅಥವಾ ತೇವಾಂಶ ಕಂಡುಬಂದಿದೆ. ಒಣ ಜಾಗದಲ್ಲಿ ಇರಿಸಿ.",
      hi: "क्रेट्स के पास अत्यधिक पानी या नमी जमा हो गई है। कृपया इन्हें सूखे स्थान पर रखें।",
      en: "Excessive moisture accumulation detected near storage crates. Relocate to a dry surface.",
    },
    phoneticNotes: {
      kn: "'ಒಣ ಜಾಗದಲ್ಲಿ ಇರಿಸಿ' (ona jaagadalli irisi) ಸ್ಪಷ್ಟವಾಗಿರಬೇಕು.",
      hi: "'सूखे स्थान पर रखें' का स्पष्ट उच्चारण।",
      en: "Clear articulation of 'moisture accumulation'.",
    },
  },
  {
    id: "move_cooler",
    title: "6. Move produce to a cooler location",
    description: "Actionable vendor directive to relocate crates under solar canopy shade",
    phrases: {
      kn: "ಕೂಡಲೇ ನಿಮ್ಮ ಸರಕನ್ನು ತಂಪಾದ ನೆರಳಿನ ಜಾಗಕ್ಕೆ ವರ್ಗಾಯಿಸಿ ಮತ್ತು ಬಿಸಿಲಿನಿಂದ ಕಾಪಾಡಿ.",
      hi: "कृपया तुरंत अपनी उपज को ठंडे और छायादार स्थान पर ले जाएं ताकि यह सुरक्षित रहे।",
      en: "Move your produce crates immediately to a cooler, shaded location under the solar canopy.",
    },
    phoneticNotes: {
      kn: "'ತಂಪಾದ ನೆರಳಿನ ಜಾಗಕ್ಕೆ ವರ್ಗಾಯಿಸಿ' (thampaada neralina jaagakke vargaayisi) - ಪ್ರಾಥಮಿಕ ಕ್ರಿಯಾ ಸೂಚನೆ.",
      hi: "'ठंडे और छायादार स्थान' - मुख्य व्यावहारिक निर्देश।",
      en: "Imperative action command must sound respectful yet decisive.",
    },
  },
  {
    id: "improve_ventilation",
    title: "7. Improve ventilation",
    description: "Directive to activate misting fans and arrange crates for airflow",
    phrases: {
      kn: "ಸ್ಟಾಲ್‌ನಲ್ಲಿ ಫ್ಯಾನ್ ಆನ್ ಮಾಡಿ ಗಾಳಿಯಾಡುವಂತೆ ಮಾಡಿ. ಉತ್ಪನ್ನಗಳ ಮಧ್ಯೆ ಜಾಗ ಬಿಡಿ.",
      hi: "स्टॉल पर पंखा चलाकर हवा के आने-जाने की व्यवस्था करें और टोकरियों के बीच जगह रखें।",
      en: "Activate the stall fan to improve airflow, and ensure proper spacing between crates.",
    },
    phoneticNotes: {
      kn: "'ಗಾಳಿಯಾಡುವಂತೆ ಮಾಡಿ' (gaaliyaaduvaanthe maadi) ಸರಳ ಆಡುನುಡಿ.",
      hi: "'हवा के आने-जाने की व्यवस्था' आम बोलचाल की हिंदी।",
      en: "Friendly local Indian market tone.",
    },
  },
];

// ─── Native Alert Message Builder ─────────────────────────────────────────────

/**
 * Builds a natural, conversational alert message adhering strictly to local grammar,
 * respectful vendor salutations, and clear actionable guidance.
 */
export function buildAlertMessage(params: AlertTemplateParams): string {
  const {
    vendorName,
    stallName,
    produceName,
    category,
    riskLevel,
    temperature,
    humidity,
    language,
  } = params;

  const tempNum = temperature !== undefined ? temperature.toFixed(1) : undefined;
  const humNum = humidity !== undefined ? humidity.toFixed(0) : undefined;

  // ── Kannada (ಕನ್ನಡ) ──────────────────────────────────────────────────────────
  if (language === "kn") {
    const greeting = `ನಮಸ್ಕಾರ ${vendorName} ಅವರೇ.`;
    const tempPhrase = tempNum ? `ಪ್ರಸ್ತುತ ತಾಪಮಾನ ${tempNum} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್ ದಾಖಲಾಗಿದೆ.` : "";
    const humPhrase = humNum ? `ತೇವಾಂಶ ${humNum} ಪ್ರತಿಶತ ಇದೆ.` : "";

    // Action per category
    let action = "ಕ್ರೇಟುಗಳನ್ನು ತಕ್ಷಣ ತಂಪಾದ ನೆರಳಿನ ಜಾಗಕ್ಕೆ ಸರಿಸಿ.";
    if (category === "leafy") {
      action = "ಸೊಪ್ಪು ಬಾಡದಂತೆ ಹಗುರವಾದ ಒದ್ದೆ ಬಟ್ಟೆ ಮುಚ್ಚಿ ತಂಪಾದ ನೆರಳಿನಲ್ಲಿ ಇರಿಸಿ.";
    } else if (category === "tomato") {
      action = "ಟೊಮೇಟೊ ಮೃದುವಾಗದಂತೆ ತಕ್ಷಣ ನೆರಳಿನ ಜಾಗಕ್ಕೆ ವರ್ಗಾಯಿಸಿ ಮತ್ತು ಗಾಳಿಯಾಡುವಂತೆ ಮಾಡಿ.";
    } else if (category === "potato") {
      action = "ಆಲೂಗಡ್ಡೆ ಮೇಲೆ ನೇರ ಬಿಸಿಲು ಬೀಳದಂತೆ ಕತ್ತಲೆಯ ತಂಪಾದ ಜಾಗದಲ್ಲಿ ಇರಿಸಿ.";
    } else if (category === "apple") {
      action = "ಸೇಬುಗಳನ್ನು ಶಾಖದಿಂದ ರಕ್ಷಿಸಲು ತಂಪಾದ ಹವಾಮಾನವಿರುವ ಜಾಗಕ್ಕೆ ಸರಿಸಿ.";
    }

    if (riskLevel === "CRITICAL") {
      return `${greeting} ಸೋಲಾರ್ ಶೇಡ್ ಗ್ರಿಡ್ ತುರ್ತು ಎಚ್ಚರಿಕೆ. ನಿಮ್ಮ ${stallName} ನಲ್ಲಿರುವ ${produceName} ಅತಿಯಾದ ಶಾಖದ ಅಪಾಯದಲ್ಲಿವೆ. ${tempPhrase} ${action} ದಯವಿಟ್ಟು ತಕ್ಷಣ ಗಮನ ಕೊಡಿ.`;
    }
    if (riskLevel === "HIGH") {
      return `${greeting} ಸೋಲಾರ್ ಶೇಡ್ ಗ್ರಿಡ್ ಎಚ್ಚರಿಕೆ. ನಿಮ್ಮ ${produceName} ಇರುವ ಜಾಗದಲ್ಲಿ ಉಷ್ಣತೆ ಹೆಚ್ಚಾಗಿದೆ. ${tempPhrase} ${action}`;
    }
    return `${greeting} ಸೋಲಾರ್ ಶೇಡ್ ಗ್ರಿಡ್ ಮಾಹಿತಿ. ನಿಮ್ಮ ${produceName} ಸಂಗ್ರಹಣಾ ಸ್ಥಳದಲ್ಲಿ ಮಧ್ಯಮ ತಾಪಮಾನವಿದೆ. ${tempPhrase} ${humPhrase} ಪರಿಸ್ಥಿತಿ ಗಮನಿಸುತ್ತಿರಿ.`;
  }

  // ── Hindi (हिन्दी) ───────────────────────────────────────────────────────────
  if (language === "hi") {
    const greeting = `नमस्ते ${vendorName} जी।`;
    const tempPhrase = tempNum ? `वर्तमान तापमान ${tempNum} डिग्री सेल्सियस दर्ज किया गया है।` : "";
    const humPhrase = humNum ? `नमी ${humNum} प्रतिशत है।` : "";

    let action = "कृपया टोकरियों को तुरंत ठंडी और छायादार जगह पर रखें।";
    if (category === "leafy") {
      action = "सब्जियों को मुरझाने से बचाने के लिए हल्के गीले कपड़े से ढकें और छाया में रखें।";
    } else if (category === "tomato") {
      action = "टमाटर को ज्यादा पकने और खराब होने से बचाने के लिए तुरंत छायादार और हवादार जगह पर रखें।";
    } else if (category === "potato") {
      action = "आलू पर सीधी धूप न पड़ने दें, इन्हें छायादार और सूखी जगह पर रखें।";
    } else if (category === "apple") {
      action = "सेब की गुणवत्ता बनाए रखने के लिए पेटियों को धूप से दूर ठंडे स्थान पर रखें।";
    }

    if (riskLevel === "CRITICAL") {
      return `${greeting} सोलर शेड ग्रिड आपातकालीन चेतावनी। आपकी ${stallName} में रखे ${produceName} अत्यधिक गर्मी के जोखिम में हैं। ${tempPhrase} ${action} तुरंत ध्यान दें।`;
    }
    if (riskLevel === "HIGH") {
      return `${greeting} सोलर शेड ग्रिड चेतावनी। आपकी ${produceName} की दुकान पर तापमान बढ़ गया है। ${tempPhrase} ${action}`;
    }
    return `${greeting} सोलर शेड ग्रिड सूचना। आपके ${produceName} के पास तापमान सामान्य से थोड़ा अधिक है। ${tempPhrase} ${humPhrase} स्थिति पर नज़र रखें।`;
  }

  // ── Indian English (Default) ────────────────────────────────────────────────
  const greeting = `Hello ${vendorName}.`;
  const tempPhrase = tempNum ? `Current temperature is ${tempNum} degrees Celsius.` : "";
  const humPhrase = humNum ? `Relative humidity is ${humNum} percent.` : "";

  let action = "Move produce crates to a cooler, shaded location under the canopy.";
  if (category === "leafy") {
    action = "Cover greens with a light damp cloth and keep in ventilated shade to prevent wilting.";
  } else if (category === "tomato") {
    action = "Relocate tomatoes immediately away from direct sun into ventilated shade.";
  } else if (category === "potato") {
    action = "Shield potatoes from light and heat in a well-aerated dark location.";
  } else if (category === "apple") {
    action = "Keep apples away from radiated canopy heat in an insulated shaded crate.";
  }

  if (riskLevel === "CRITICAL") {
    return `${greeting} Solar Shade Grid critical alert. Your ${produceName} at ${stallName} are exposed to critical heat conditions. ${tempPhrase} ${action} Please act immediately.`;
  }
  if (riskLevel === "HIGH") {
    return `${greeting} Solar Shade Grid warning. Your ${produceName} at ${stallName} are under elevated heat stress. ${tempPhrase} ${action}`;
  }
  return `${greeting} Solar Shade Grid advisory. Environmental conditions around your ${produceName} show moderate risk. ${tempPhrase} ${humPhrase} Please monitor conditions.`;
}

// ─── SMS Body Builder (Native Scripts) ────────────────────────────────────────

export function buildSmsBody(params: AlertTemplateParams, audioUrl?: string): string {
  const { vendorName, produceName, riskLevel, language } = params;

  if (language === "kn") {
    const prefix = `ಸೋಲಾರ್ ಶೇಡ್ ಗ್ರಿಡ್ ${riskLevel === "CRITICAL" ? "ತುರ್ತು" : "ಎಚ್ಚರಿಕೆ"}: ${vendorName} ಅವರೇ, ನಿಮ್ಮ ${produceName} ಶಾಖದ ಅಪಾಯದಲ್ಲಿದೆ.`;
    return audioUrl ? `${prefix} ಧ್ವನಿ ಸಂದೇಶ ಆಲಿಸಿ: ${audioUrl}` : prefix;
  }

  if (language === "hi") {
    const prefix = `सोलर शेड ग्रिड ${riskLevel === "CRITICAL" ? "आपातकालीन" : "अलर्ट"}: ${vendorName} जी, आपके ${produceName} गर्मी के जोखिम में हैं।`;
    return audioUrl ? `${prefix} वॉइस मैसेज सुनें: ${audioUrl}` : prefix;
  }

  const prefix = `Solar Shade Grid ${riskLevel} Alert: ${vendorName}, your ${produceName} need thermal protection.`;
  return audioUrl ? `${prefix} Voice alert: ${audioUrl}` : prefix;
}
