"use client";

/**
 * components/VoiceNotificationCenter.tsx
 * Voice AI Vendor Communication System — Clean Dashboard.
 *
 * Restored Clean Layout:
 *  1. Header & Configuration Status Bar
 *  2. On-Screen Voice Alert Preview (playable audio)
 *  3. Vendor Registry (with Kannada kn-IN and Hindi hi-IN language routing)
 *  4. Alert History (accordion view with native audio preview)
 *  5. Communication Architecture Reference
 *
 * Voice Refinement:
 *  - Hindi: Kept exactly as configured (hi-IN-Wavenet-D, natural conversational style).
 *  - Kannada: Refined native speech (kn-IN-Wavenet-A, 0.88x pacing, smooth flow).
 *  - English option removed from voice configuration.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MessageSquare,
  Phone,
  Send,
  RefreshCw,
  Volume2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Play,
  Loader2,
} from "lucide-react";
import type { AlertRecord, DeliveryChannel, AlertStatus } from "@/lib/alert-engine";
import type { VendorProfile } from "@/lib/vendor-registry";
import type { ProduceCategory } from "@/lib/produce-engine";
import { VOICE_MAP, type TtsLanguage } from "@/lib/tts-service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SafeVendor extends Omit<VendorProfile, "phone"> {
  phone: string; // "***REDACTED***"
}

interface SendState {
  loading: boolean;
  error?: string;
  result?: {
    channel: DeliveryChannel;
    message: string;
    previewMessage?: string;
    language?: TtsLanguage;
    audioUrl?: string;
  };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: DeliveryChannel }) {
  const cfg: Record<DeliveryChannel, { label: string; cls: string }> = {
    whatsapp: { label: "WhatsApp Voice", cls: "bg-green/20 text-green border-green/30" },
    sms: { label: "SMS + Audio", cls: "bg-blue/20 text-blue border-blue/30" },
    preview: { label: "Preview", cls: "bg-amber/20 text-amber border-amber/30" },
    none: { label: "None", cls: "bg-muted text-muted-foreground border-border" },
  };
  const { label, cls } = cfg[channel] ?? cfg.none;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: AlertStatus }) {
  const cfg: Record<AlertStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    generated: { label: "Generated", icon: <Clock className="w-3 h-3" />, cls: "text-muted-foreground" },
    sending: { label: "Sending…", icon: <Loader2 className="w-3 h-3 animate-spin" />, cls: "text-amber" },
    delivered: { label: "Delivered", icon: <CheckCircle className="w-3 h-3" />, cls: "text-green" },
    failed: { label: "Failed", icon: <XCircle className="w-3 h-3" />, cls: "text-red" },
    acknowledged: { label: "Acknowledged", icon: <CheckCircle className="w-3 h-3" />, cls: "text-teal" },
  };
  const { label, icon, cls } = cfg[status] ?? cfg.generated;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    critical: "bg-red",
    warning: "bg-amber",
    caution: "bg-yellow-400",
    info: "bg-blue",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${cls[severity] ?? "bg-muted"}`}
    />
  );
}

function LanguagePill({ lang }: { lang: string }) {
  const map: Record<string, { name: string; script: string; cls: string }> = {
    kn: { name: "ಕನ್ನಡ", script: "kn-IN", cls: "bg-amber/15 text-amber border-amber/30" },
    hi: { name: "हिन्दी", script: "hi-IN", cls: "bg-purple/15 text-purple border-purple/30" },
    en: { name: "English", script: "en-IN", cls: "bg-teal/15 text-teal border-teal/30" },
  };
  const item = map[lang] ?? map.kn;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${item.cls}`}>
      <span>{item.name}</span>
      <span className="opacity-60 text-[9px] font-mono">({item.script})</span>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoiceNotificationCenter() {
  const [vendors, setVendors] = useState<SafeVendor[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    text: string;
    lang: TtsLanguage;
    audioUrl?: string;
  } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);

  // ── Fetch registry ─────────────────────────────────────────────────────────
  const fetchRegistry = useCallback(() => {
    fetch("/api/voice/registry")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setVendors(d.vendors as SafeVendor[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  // ── Poll alert history every 5s ────────────────────────────────────────────
  const fetchAlerts = useCallback(() => {
    fetch("/api/voice/alerts")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAlerts(d.alerts as AlertRecord[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAlerts();
    pollRef.current = setInterval(fetchAlerts, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAlerts]);

  // ── Vendor Language Switcher (Kannada / Hindi only) ─────────────────────────
  const handleLanguageChange = async (vendorId: string, newLang: TtsLanguage) => {
    try {
      const resp = await fetch("/api/voice/registry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, preferredLanguage: newLang }),
      });
      const data = await resp.json();
      if (data.ok) {
        setVendors(data.vendors);
      }
    } catch {
      // ignore network errors
    }
  };

  // ── Send Test Alert ────────────────────────────────────────────────────────
  const sendTestAlert = useCallback(
    async (vendor: SafeVendor) => {
      const key = vendor.vendorId;
      setSendStates((prev) => ({
        ...prev,
        [key]: { loading: true },
      }));

      const category: ProduceCategory = vendor.produceCategories[0] ?? "tomato";

      try {
        const resp = await fetch("/api/voice/alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorId: vendor.vendorId,
            category,
            riskLevel: "HIGH",
            temperature: 36.5,
            humidity: 72,
            forceTest: true,
          }),
        });

        const data = (await resp.json()) as {
          ok: boolean;
          channel?: DeliveryChannel;
          message?: string;
          previewMessage?: string;
          language?: TtsLanguage;
          audioUrl?: string;
          error?: string;
        };

        const targetLang: TtsLanguage =
          (data.language === "hi" || data.language === "kn")
            ? data.language
            : vendor.preferredLanguage;

        setSendStates((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            result: {
              channel: data.channel ?? "none",
              message: data.message ?? "",
              previewMessage: data.previewMessage,
              language: targetLang,
              audioUrl: data.audioUrl,
            },
            error: data.ok ? undefined : data.error,
          },
        }));

        if (data.previewMessage) {
          setPreviewData({
            text: data.previewMessage,
            lang: targetLang,
            audioUrl: data.audioUrl,
          });
        }

        fetchAlerts();
      } catch {
        setSendStates((prev) => ({
          ...prev,
          [key]: { loading: false, error: "Network error" },
        }));
      }
    },
    [fetchAlerts]
  );

  // ── Speech synthesis preview (calibrated for natural Kannada & Hindi) ──────
  const speakPreview = useCallback((text: string, lang: TtsLanguage = "kn") => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    const localeMap: Record<string, string> = {
      kn: "kn-IN",
      hi: "hi-IN",
      en: "en-IN",
    };

    utt.lang = localeMap[lang] || "kn-IN";
    utt.rate = 0.88; // Refined to match Hindi's natural, calm speaking pace
    utt.pitch = 1.0;

    // Search available voices in browser
    const voices = window.speechSynthesis.getVoices();
    const targetPrefix = lang === "kn" ? "kn" : "hi";
    const exactMatch = voices.find(
      (v) => v.lang.toLowerCase().replace("_", "-") === (localeMap[lang] || "").toLowerCase()
    );
    const langMatch = voices.find((v) =>
      v.lang.toLowerCase().startsWith(targetPrefix)
    );

    if (exactMatch) {
      utt.voice = exactMatch;
    } else if (langMatch) {
      utt.voice = langMatch;
    }

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* Hidden audio element for server-synthesized native audio */}
      <audio
        ref={audioElemRef}
        onEnded={() => setSpeaking(false)}
        onError={() => setSpeaking(false)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple/20 border border-purple/30">
          <Mic className="w-5 h-5 text-purple" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Voice AI Vendor Communication
          </h2>
          <p className="text-[11px] text-muted-foreground">
            WhatsApp voice alerts · SMS fallback · Gemini conversational AI
          </p>
        </div>
      </div>

      {/* Config status pills */}
      <ConfigStatusBar />

      {/* On-screen TTS preview panel */}
      {previewData && (
        <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 flex items-start gap-3">
          <Volume2 className="w-4 h-4 text-amber mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] font-semibold text-amber">
                On-Screen Alert Preview
              </p>
              <LanguagePill lang={previewData.lang} />
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed font-serif">
              {previewData.text}
            </p>
          </div>
          <button
            onClick={() => {
              if (previewData.audioUrl && audioElemRef.current) {
                audioElemRef.current.src = previewData.audioUrl;
                audioElemRef.current.play().catch(() => {});
                setSpeaking(true);
              } else {
                speakPreview(previewData.text, previewData.lang);
              }
            }}
            disabled={speaking}
            title="Play via native voice"
            className="shrink-0 p-1.5 rounded-lg bg-amber/20 hover:bg-amber/30 text-amber border border-amber/30 transition-colors disabled:opacity-50"
          >
            {speaking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setPreviewData(null)}
            className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Vendor registry */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-teal" />
            <span className="text-xs font-semibold text-foreground">Vendor Registry</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {vendors.length} vendors
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Vendor</th>
                <th className="text-left px-4 py-2 font-medium">Stall</th>
                <th className="text-left px-4 py-2 font-medium">Produce</th>
                <th className="text-left px-4 py-2 font-medium">Language</th>
                <th className="text-left px-4 py-2 font-medium">Channels</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const st = sendStates[v.vendorId];
                return (
                  <tr
                    key={v.vendorId}
                    className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{v.vendorName}</div>
                      <div className="text-[10px] text-muted-foreground">{v.vendorId}</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {v.stallId.toUpperCase()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {v.produceCategories.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 rounded bg-teal/10 text-teal border border-teal/20 text-[10px]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={v.preferredLanguage}
                          onChange={(e) =>
                            handleLanguageChange(
                              v.vendorId,
                              e.target.value as TtsLanguage
                            )
                          }
                          className="text-xs bg-secondary/60 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-purple font-medium"
                        >
                          <option value="kn">ಕನ್ನಡ (kn-IN)</option>
                          <option value="hi">हिन्दी (hi-IN)</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {v.whatsappEnabled ? (
                          <span title="WhatsApp enabled" className="text-green">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span title="WhatsApp disabled" className="text-muted-foreground/40">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {v.smsEnabled ? (
                          <span title="SMS enabled" className="text-blue">
                            <Phone className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span title="SMS disabled" className="text-muted-foreground/40">
                            <Phone className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {v.voiceConsentGiven ? (
                          <span title="Voice consent given" className="text-teal">
                            <Shield className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span title="No voice consent" className="text-red/50">
                            <Shield className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {st?.result && <ChannelBadge channel={st.result.channel} />}
                        {st?.error && (
                          <span className="text-[10px] text-red truncate max-w-[100px]" title={st.error}>
                            {st.error}
                          </span>
                        )}
                        <button
                          onClick={() => sendTestAlert(v)}
                          disabled={st?.loading || v.optedOut}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple/15 hover:bg-purple/25 text-purple border border-purple/30 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {st?.loading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          {st?.loading ? "Sending…" : "Test Alert"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {vendors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    Loading vendor registry…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert History */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber" />
          <span className="text-xs font-semibold text-foreground">Alert History</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{alerts.length} records</span>
            <button
              onClick={fetchAlerts}
              className="p-1 rounded hover:bg-secondary/50 text-muted-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-xs">
            No alerts yet. Send a test alert above to see the history.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {alerts.map((a) => (
              <div key={a.alertId} className="px-4 py-2.5">
                <button
                  className="w-full flex items-center gap-3 text-left"
                  onClick={() =>
                    setExpandedAlert((prev) =>
                      prev === a.alertId ? null : a.alertId
                    )
                  }
                >
                  <SeverityDot severity={a.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">
                        {a.vendorName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {a.stallId.toUpperCase()} · {a.category}
                      </span>
                      <LanguagePill lang={a.language === "hi" ? "hi" : "kn"} />
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {new Date(a.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ChannelBadge channel={a.channel} />
                    <StatusBadge status={a.status} />
                    {expandedAlert === a.alertId ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {expandedAlert === a.alertId && (
                  <div className="mt-2 ml-5 p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <p className="text-[11px] font-serif text-foreground/80 leading-relaxed mb-2">
                      {a.message}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        Voice: <span className="font-mono">{VOICE_MAP[a.language === "hi" ? "hi" : "kn"]?.name}</span>
                      </span>
                      {a.twilioSid && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          SID: {a.twilioSid.slice(0, 20)}…
                        </span>
                      )}
                      {a.errorMessage && (
                        <span className="text-[10px] text-red">⚠ {a.errorMessage}</span>
                      )}
                      <button
                        onClick={() => speakPreview(a.message, a.language === "hi" ? "hi" : "kn")}
                        disabled={speaking}
                        className="ml-auto flex items-center gap-1 text-[10px] text-purple hover:text-purple/80 transition-colors"
                      >
                        <Volume2 className="w-3 h-3" />
                        Preview Voice
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Architecture note for judges */}
      <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
        <p className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5 text-teal" />
          Communication Architecture
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] text-muted-foreground">
          <div>
            <div className="font-medium text-green mb-1">Primary: WhatsApp Voice</div>
            <div>Twilio WhatsApp API → Google TTS MP3 → Signed audio URL → Vendor&apos;s WhatsApp</div>
          </div>
          <div>
            <div className="font-medium text-blue mb-1">Fallback: SMS + Audio Link</div>
            <div>Twilio SMS → Short alert text + secure audio link → Vendor&apos;s phone browser</div>
          </div>
          <div>
            <div className="font-medium text-amber mb-1">Demo: On-Screen Preview</div>
            <div>Browser Web Speech API reads alert aloud. No Twilio/TTS keys needed.</div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2">
          Two-way: Vendors can reply via WhatsApp voice note → Gemini STT + AI response → TTS reply sent back.
        </p>
      </div>
    </div>
  );
}

// ─── Config Status Bar ────────────────────────────────────────────────────────

function ConfigStatusBar() {
  const items = [
    {
      label: "Twilio SMS",
      desc: "TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM",
      icon: <Phone className="w-3.5 h-3.5" />,
    },
    {
      label: "WhatsApp Voice",
      desc: "TWILIO_WHATSAPP_FROM (whatsapp:+14155238886)",
      icon: <MessageSquare className="w-3.5 h-3.5" />,
    },
    {
      label: "Google TTS",
      desc: "GOOGLE_TTS_API_KEY (Cloud Text-to-Speech kn-IN / hi-IN WaveNet)",
      icon: <Volume2 className="w-3.5 h-3.5" />,
    },
    {
      label: "Gemini AI",
      desc: "GEMINI_API_KEY (Personalised native alert text)",
      icon: <Mic className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-3">
      <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1.5">
        <WifiOff className="w-3 h-3" />
        Services — configure in <code className="font-mono bg-muted/50 px-1 rounded">.env.local</code>. App runs fully without them (preview mode).
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card text-muted-foreground"
            title={item.desc}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
