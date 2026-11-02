"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSim } from "@/lib/sim-context";
import { fmtRuntime, fmtClock, C } from "@/lib/engine";
import {
  Sparkles,
  Send,
  Bot,
  User,
  ShieldAlert,
  Zap,
  BatteryCharging,
  Lightbulb,
  HelpCircle,
  Activity,
  SunMedium,
  Thermometer,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

// ── Lightweight inline Markdown renderer ─────────────────────────────────────
// Handles: ##/### headings, **bold**, `code`, - bullets, blank-line paragraphs.
function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  const renderInline = (raw: string): React.ReactNode => {
    // Split on **bold** and `code` patterns
    const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="px-1 py-0.5 rounded text-[10px] bg-secondary font-mono text-teal">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="font-serif text-sm font-bold text-foreground mt-3 mb-1.5 border-b border-border pb-1 first:mt-0">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="font-semibold text-xs text-foreground mt-2 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Collect consecutive bullet lines
      const bullets: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        bullets.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="space-y-0.5 my-1.5 pl-3">
          {bullets.map((b, bi) => (
            <li key={bi} className="flex gap-1.5 text-[11px] leading-relaxed">
              <span className="text-teal mt-1 shrink-0">•</span>
              <span>{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      // Collect consecutive numbered lines
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="space-y-1 my-1.5 pl-3">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-1.5 text-[11px] leading-relaxed">
              <span className="text-muted-foreground font-mono text-[10px] shrink-0 mt-0.5">{ii + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-1" />);
    } else {
      elements.push(
        <p key={key++} className="text-[11px] leading-relaxed text-foreground">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
  source?: "gemini" | "local-analyst";
}

// ── Quick prompt definitions ─────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: "Situational Briefing", q: "Give me a complete situational briefing of the microgrid right now." },
  { label: "Blackout Resilience", q: "Explain our blackout islanding resilience and estimated runtime." },
  { label: "Vendor Dividends", q: "How do vendors earn co-op solar dividends?" },
  { label: "Operator Actions", q: "Recommend operator actions for the current hour." },
  { label: "Solar Analysis", q: "Analyze current solar PV generation and temperature derating." },
  { label: "Battery Status", q: "What is the battery state and autonomy at current load?" },
];

// ── Component ────────────────────────────────────────────────────────────────
export function AiEnergyAnalyst() {
  const { state, mode, totalSoldKwh } = useSim();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buildWelcome = useCallback((): Message => ({
    id: "init_1",
    sender: "ai",
    text: `## Welcome to ARIA — Solar Shade Grid AI Analyst\n\nI am your **Autonomous Renewable Intelligence Analyst**, continuously processing live telemetry from the digital twin. I have full situational awareness of the microgrid.\n\n**Current status:** ${mode.toUpperCase()} mode • Grid ${state.gridLive ? "synchronized (BESCOM live)" : "**ISLANDED — BLACKOUT ACTIVE**"} • BESS at **${Math.round(state.soc * 100)}% SOC** (${(state.soc * C.B_CAP).toFixed(1)} kWh) • Solar **${(state.last?.genKw ?? 0).toFixed(2)} kW** vs demand **${(state.last?.demandKw ?? 0).toFixed(2)} kW**\n\nSelect a quick query or ask me anything about energy operations, vendor economics, or solar physics.`,
    time: fmtClock(state.hour),
    source: "local-analyst",
  }), []); // eslint-disable-line

  const [messages, setMessages] = useState<Message[]>(() => [buildWelcome()]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText ?? input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      sender: "user",
      text: textToSend,
      time: fmtClock(state.hour),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: textToSend,
          result: state.last,
          gridLive: state.gridLive,
          mode,
          stalls: state.stalls,
        }),
      });

      const data = await res.json();
      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        sender: "ai",
        text: data.text || "Analysis complete.",
        time: fmtClock(state.hour),
        source: data.source || "local-analyst",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: "ai",
          text: "Network error — could not reach analyst API. Please try again.",
          time: fmtClock(state.hour),
          source: "local-analyst",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClearChat = () => {
    setMessages([buildWelcome()]);
  };

  // Derive status signals
  const genKw = state.last?.genKw ?? 0;
  const demandKw = state.last?.demandKw ?? 0;
  const soc = Math.round(state.soc * 100);
  const net = genKw - demandKw;
  const bessKwh = (state.soc * C.B_CAP).toFixed(1);
  const isSurplus = net >= 0;
  const stallsShed = state.stalls.filter((s) => s.status === "shed").length;
  const stallsAmber = state.stalls.filter((s) => s.status === "amber").length;

  return (
    <div className="h-full flex flex-col gap-2.5 overflow-hidden p-1">
      {/* ── Top Stats Bar ─────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-5 gap-2">
        {/* Grid status */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card shadow-xs">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${state.gridLive ? "bg-green/10" : "bg-red/10"}`}>
            {state.gridLive ? <CheckCircle2 className="w-4 h-4 text-green" /> : <XCircle className="w-4 h-4 text-red" />}
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Grid</div>
            <div className={`text-xs font-bold truncate ${state.gridLive ? "text-green" : "text-red"}`}>
              {state.gridLive ? "Online" : "BLACKOUT"}
            </div>
          </div>
        </div>

        {/* Solar */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card shadow-xs">
          <div className="w-8 h-8 rounded-md bg-amber/10 flex items-center justify-center shrink-0">
            <SunMedium className="w-4 h-4 text-amber" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Solar</div>
            <div className="text-xs font-bold text-foreground">{genKw.toFixed(2)} kW</div>
          </div>
        </div>

        {/* Battery */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card shadow-xs">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${soc >= 50 ? "bg-green/10" : soc >= 20 ? "bg-amber/10" : "bg-red/10"}`}>
            <BatteryCharging className={`w-4 h-4 ${soc >= 50 ? "text-green" : soc >= 20 ? "text-amber" : "text-red"}`} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono text-muted-foreground uppercase">BESS</div>
            <div className="text-xs font-bold text-foreground">{soc}% · {bessKwh} kWh</div>
          </div>
        </div>

        {/* Net Power */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card shadow-xs">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${isSurplus ? "bg-green/10" : "bg-amber/10"}`}>
            <Activity className={`w-4 h-4 ${isSurplus ? "text-green" : "text-amber"}`} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Net Power</div>
            <div className={`text-xs font-bold ${isSurplus ? "text-green" : "text-amber"}`}>
              {isSurplus ? "+" : ""}{net.toFixed(2)} kW
            </div>
          </div>
        </div>

        {/* Stall status */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card shadow-xs">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${stallsShed > 0 ? "bg-red/10" : "bg-green/10"}`}>
            {stallsShed > 0
              ? <AlertTriangle className="w-4 h-4 text-red" />
              : <CheckCircle2 className="w-4 h-4 text-green" />}
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Stalls</div>
            <div className="text-xs font-bold text-foreground">
              {8 - stallsShed - stallsAmber} OK
              {stallsAmber > 0 && <span className="text-amber ml-1">{stallsAmber}⚠</span>}
              {stallsShed > 0 && <span className="text-red ml-1">{stallsShed}✗</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Chat Panel ────────────────────────────────────── */}
      <div className="flex-1 flex gap-2.5 min-h-0 overflow-hidden">
        {/* Quick Prompts Sidebar */}
        <div className="hidden md:flex flex-col w-48 shrink-0 gap-1.5 overflow-y-auto">
          <div className="text-[10px] font-mono font-semibold text-muted-foreground uppercase px-1 mb-0.5 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            Quick Queries
          </div>
          {QUICK_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p.q)}
              disabled={loading}
              className="text-left px-3 py-2 rounded-lg border border-border bg-card hover:bg-teal hover:text-white hover:border-teal text-[11px] font-medium text-foreground transition-all duration-150 shadow-xs disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}

          {/* Context card */}
          <div className="mt-auto pt-2 border-t border-border">
            <div className="p-2.5 rounded-lg border border-border bg-card text-[10px] space-y-1.5 font-mono">
              <div className="font-semibold text-muted-foreground uppercase">Live Context</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode:</span>
                <span className="font-bold text-foreground">{mode.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hour:</span>
                <span className="font-bold text-foreground">{fmtClock(state.hour)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temp:</span>
                <span className="font-bold text-foreground">{state.last?.ambient.toFixed(0) ?? "—"}°C</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pool:</span>
                <span className="font-bold text-foreground">₹{Math.round(state.coopPool)}</span>
              </div>
              {!state.gridLive && state.last?.runtimeH !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Runtime:</span>
                  <span className="font-bold text-red">{fmtRuntime(state.last.runtimeH)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          {/* Chat header */}
          <div className="shrink-0 px-4 py-2.5 border-b border-border bg-secondary/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-teal text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground">ARIA — Energy Intelligence</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Gemini AI · live digital twin context
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                <span className="text-muted-foreground">Context live</span>
              </div>
              <button
                onClick={handleClearChat}
                title="Clear conversation"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.sender === "ai" && (
                  <div className="w-6 h-6 rounded-md bg-teal/15 text-teal flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className={`max-w-[90%] rounded-xl p-3 ${
                  m.sender === "user"
                    ? "bg-teal text-white"
                    : "bg-background border border-border"
                }`}>
                  {m.sender === "ai"
                    ? <MarkdownBlock text={m.text} />
                    : <p className="text-xs leading-relaxed">{m.text}</p>
                  }
                  <div className={`mt-2 text-[9px] font-mono flex items-center gap-1.5 ${
                    m.sender === "user" ? "text-white/60" : "text-muted-foreground"
                  }`}>
                    <span>{m.time}</span>
                    {m.source && (
                      <>
                        <span>·</span>
                        <span className={m.source === "gemini" ? "text-teal font-semibold" : ""}>
                          {m.source === "gemini" ? "✦ Gemini AI" : "ARIA Local"}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {m.sender === "user" && (
                  <div className="w-6 h-6 rounded-md bg-secondary text-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2.5 items-start">
                <div className="w-6 h-6 rounded-md bg-teal/15 text-teal flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="px-4 py-3 rounded-xl border border-border bg-background flex items-center gap-1.5">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-teal animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                    Analyzing telemetry…
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Mobile quick prompts */}
          <div className="md:hidden shrink-0 px-3 py-1.5 border-t border-border/60 bg-secondary/10 flex gap-1.5 overflow-x-auto">
            {QUICK_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p.q)}
                disabled={loading}
                className="px-2.5 py-1 rounded-md bg-background border border-border text-[10px] text-muted-foreground whitespace-nowrap hover:border-teal hover:text-foreground transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="shrink-0 p-3 border-t border-border bg-card flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask ARIA about solar generation, battery dispatch, blackout resilience, vendor dividends…"
              className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-teal focus:border-teal transition-colors"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="px-3 py-2 rounded-lg bg-teal hover:bg-teal/90 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
