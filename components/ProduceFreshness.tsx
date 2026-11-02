"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSim } from "@/lib/sim-context";
import {
  PRODUCE_PROFILES,
  assessFreshness,
  simulateSensors,
  riskLevelBadge,
  riskLevelColor,
  riskLevelBg,
  sensorStatusColor,
  sensorHealthSummary,
  type SensorReading,
  type FreshnessAssessment,
  type ProduceCategory,
  type RiskLevel,
} from "@/lib/produce-engine";
import {
  Leaf,
  Thermometer,
  Droplets,
  Wind,
  Sun,
  CloudRain,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Wifi,
  Bot,
  Send,
  ChevronRight,
  Activity,
  ShieldAlert,
  Eye,
  Clock,
  Database,
  RefreshCw,
  X,
  HelpCircle,
  Sparkles,
} from "lucide-react";

// ── Markdown renderer (reused pattern from AiEnergyAnalyst) ──────────────────
function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  const inline = (raw: string): React.ReactNode =>
    raw.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i} className="px-1 rounded text-[10px] bg-secondary font-mono text-teal">{part.slice(1, -1)}</code>;
      return part;
    });

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="font-serif text-sm font-bold text-foreground mt-3 mb-1 border-b border-border pb-1 first:mt-0">{inline(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="font-semibold text-xs text-foreground mt-2 mb-0.5">{inline(line.slice(4))}</h3>);
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={key++} className="text-xs font-bold text-foreground mt-1.5">{inline(line)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const bullets: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        bullets.push(lines[i].slice(2)); i++;
      }
      elements.push(<ul key={key++} className="space-y-0.5 my-1 pl-3">{bullets.map((b, bi) => <li key={bi} className="flex gap-1.5 text-[11px] leading-relaxed"><span className="text-teal mt-0.5 shrink-0">•</span><span>{inline(b)}</span></li>)}</ul>);
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      elements.push(<ol key={key++} className="space-y-0.5 my-1 pl-3">{items.map((it, ii) => <li key={ii} className="flex gap-1.5 text-[11px] leading-relaxed"><span className="text-muted-foreground font-mono text-[10px] shrink-0 mt-0.5">{ii + 1}.</span><span>{inline(it)}</span></li>)}</ol>);
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-1" />);
    } else {
      elements.push(<p key={key++} className="text-[11px] leading-relaxed">{inline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type View = "overview" | "alerts";

interface ProduceCardDetail {
  category: ProduceCategory;
  assessment: FreshnessAssessment;
}

interface AiMessage { sender: "user" | "ai"; text: string; source?: string }

// ── Quick AI prompts ──────────────────────────────────────────────────────────
const AI_PROMPTS: Record<ProduceCategory, string[]> = {
  apple: [
    "Is the current temperature suitable for apple display?",
    "How does humidity affect our apples right now?",
    "What should we do to protect apples from heat?",
  ],
  tomato: [
    "Is rain exposure affecting our tomatoes?",
    "What temperature should we target for tomato storage?",
    "Why are our tomatoes at elevated environmental risk?",
  ],
  potato: [
    "Is our potato storage getting too much light?",
    "What conditions prevent potato sprouting?",
    "How does current humidity affect our potatoes?",
  ],
  leafy: [
    "Why are leafy vegetables sensitive to current conditions?",
    "What should we do to prevent wilting right now?",
    "How does the solar canopy help protect leafy produce?",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
export function ProduceFreshness() {
  const { state, mode } = useSim();
  const [activeView, setActiveView] = useState<View>("overview");
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [assessments, setAssessments] = useState<Record<ProduceCategory, FreshnessAssessment | null>>({
    apple: null, tomato: null, potato: null, leafy: null,
  });
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<ProduceCategory | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiEndRef = useRef<HTMLDivElement>(null);

  // Derive stall temps array
  const stallTemps = state.stalls.map((s) => s.temp);
  const hsun = state.last?.hsun ?? 0;
  const ambientTemp = state.last?.ambient ?? 30;
  const coolingKw = state.last?.coolingKw ?? 0;

  // ── Fetch sensors & run assessment ─────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/produce/sensors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hour: state.hour, ambientTemp, heatwave: state.heatwave, gridLive: state.gridLive, stallTemps, coolingKw, hsun }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const sensorList: SensorReading[] = data.sensors;
      setSensors(sensorList);

      // Run all four assessments client-side (pure function — no network needed)
      const cats: ProduceCategory[] = ["apple", "tomato", "potato", "leafy"];
      const stallMap: Record<ProduceCategory, string> = {
        apple: "s2", tomato: "s1", potato: "s8", leafy: "s1",
      };
      const newAssessments: Record<ProduceCategory, FreshnessAssessment | null> = {
        apple: null, tomato: null, potato: null, leafy: null,
      };
      for (const cat of cats) {
        newAssessments[cat] = assessFreshness(cat, stallMap[cat], sensorList);
      }
      setAssessments(newAssessments);

      // ── Auto-trigger Voice AI alerts for HIGH / CRITICAL risk ────────────
      for (const [cat, assessment] of Object.entries(newAssessments)) {
        const a = assessment as typeof newAssessments[ProduceCategory];
        if (!a) continue;
        if (a.riskLevel === "HIGH" || a.riskLevel === "CRITICAL") {
          const stallMap: Record<string, string> = {
            apple: "s2", tomato: "s1", potato: "s8", leafy: "s1",
          };
          const tempSensor = sensorList.find(
            (s) => s.stall_id === stallMap[cat] && s.sensor_type === "temperature_stall"
          );
          const humSensor = sensorList.find(
            (s) => s.stall_id === stallMap[cat] && s.sensor_type === "relative_humidity"
          );
          // Fire-and-forget — do not block the UI
          fetch("/api/voice/alert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stallId: stallMap[cat],
              category: cat,
              riskLevel: a.riskLevel,
              temperature: tempSensor?.value,
              humidity: humSensor?.value,
              forceTest: false,
            }),
          }).catch(() => { /* silent — network errors do not affect UI */ });
        }
      }
    } catch (err) {
      console.error("ProduceFreshness refresh error:", err);
    } finally {
      setLoading(false);
    }
  }, [state.hour, ambientTemp, state.heatwave, state.gridLive, coolingKw, hsun]); // eslint-disable-line

  useEffect(() => { refresh(); }, [state.hour, state.heatwave, state.gridLive]); // eslint-disable-line

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, aiLoading]);

  // ── AI handler ────────────────────────────────────────────────────────────
  const handleAiSend = async (q?: string) => {
    const question = q ?? aiInput;
    if (!question.trim() || aiLoading || !selectedCard) return;
    setAiMessages((p) => [...p, { sender: "user", text: question }]);
    if (!q) setAiInput("");
    setAiLoading(true);
    try {
      const res = await fetch("/api/produce/ai-fresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          category: selectedCard,
          assessment: assessments[selectedCard],
          sensors,
        }),
      });
      const data = await res.json();
      setAiMessages((p) => [...p, { sender: "ai", text: data.text, source: data.source }]);
    } catch {
      setAiMessages((p) => [...p, { sender: "ai", text: "Analysis temporarily unavailable. Please try again.", source: "error" }]);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const health = sensorHealthSummary(sensors);
  const canopyTemp = sensors.find((s) => s.sensor_id === "canopy_temp_sht31")?.value;
  const canopyHumid = sensors.find((s) => s.sensor_id === "canopy_humid_sht31")?.value;
  const rainfall = sensors.find((s) => s.sensor_id === "canopy_rain_gauge")?.value ?? 0;
  const luxVal = sensors.find((s) => s.sensor_id === "canopy_lux_bh1750")?.value ?? 0;
  const solarRad = sensors.find((s) => s.sensor_id === "canopy_solar_rad")?.value ?? 0;
  const windMs = sensors.find((s) => s.sensor_id === "canopy_wind_anem")?.value ?? 0;

  const alerts = useMemo(() => {
    const list: { severity: "caution" | "warning" | "critical"; msg: string; produce?: string }[] = [];
    for (const [cat, a] of Object.entries(assessments)) {
      if (!a) continue;
      for (const f of a.factors) {
        if (f.severity === "critical" || f.severity === "warning") {
          list.push({ severity: f.severity, msg: `${PRODUCE_PROFILES[cat as ProduceCategory].displayName} — ${f.factor}`, produce: cat });
        }
      }
    }
    if (rainfall > 2)
      list.push({ severity: "warning", msg: `Rainfall ${rainfall.toFixed(1)} mm/hr — check produce rain coverage` });
    if (mode === "heatwave")
      list.push({ severity: "critical", msg: "Heatwave active — all fresh produce at elevated environmental risk" });
    return list;
  }, [assessments, rainfall, mode]);

  const riskIcon = (level: RiskLevel) => {
    if (level === "LOW") return <CheckCircle2 className="w-4 h-4 text-green" />;
    if (level === "MODERATE") return <AlertTriangle className="w-4 h-4 text-amber" />;
    if (level === "HIGH") return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    if (level === "CRITICAL") return <XCircle className="w-4 h-4 text-red" />;
    return <Info className="w-4 h-4 text-muted-foreground" />;
  };

  const cats: ProduceCategory[] = ["leafy", "apple", "tomato", "potato"];

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col gap-2.5 overflow-hidden p-1 text-foreground">

      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green/15 flex items-center justify-center">
            <Leaf className="w-4.5 h-4.5 text-green" />
          </div>
          <div>
            <h2 className="font-serif text-sm font-bold text-foreground">Produce Freshness Intelligence</h2>
            <p className="text-[10px] font-mono text-muted-foreground">
              ESP32 IoT Sensor Network · Simulated Mode · {health.active}/{health.total} sensors active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-md border border-blue/30 bg-blue/5 text-[10px] font-mono text-blue flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            <span>SIMULATION MODE — No hardware connected</span>
          </div>
          <button onClick={refresh} className="p-1.5 rounded-md border border-border hover:bg-secondary text-muted-foreground transition-colors" title="Refresh sensors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Nav bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 border-b border-border pb-2">
        {(["overview", "alerts"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 capitalize ${activeView === v ? "bg-teal text-white shadow-xs" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}
          >
            {v === "overview" && <Activity className="w-3.5 h-3.5" />}
            {v === "alerts" && <ShieldAlert className="w-3.5 h-3.5" />}
            {v === "overview" ? "Produce Overview" : `Alerts ${alerts.length > 0 ? `(${alerts.length})` : ""}`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span className={mode === "heatwave" ? "text-amber font-bold" : mode === "blackout" ? "text-red font-bold" : "text-green"}>
            {mode === "heatwave" ? "⚠ HEATWAVE" : mode === "blackout" ? "⚡ BLACKOUT" : "✓ NORMAL"}
          </span>
          <span>· Hour {Math.floor(state.hour).toString().padStart(2, "0")}:00</span>
        </div>
      </div>

      {/* ── OVERVIEW VIEW ─────────────────────────────────────────────────── */}
      {activeView === "overview" && (
        <div className="flex-1 flex gap-2.5 min-h-0 overflow-hidden">
          {/* Left: Env cards + Produce cards */}
          <div className="flex-1 flex flex-col gap-2.5 min-h-0 overflow-y-auto">
            {/* Environmental summary row */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 shrink-0">
              {[
                { icon: <Thermometer className="w-3.5 h-3.5 text-red" />, label: "Ambient", value: canopyTemp?.toFixed(1) ?? "—", unit: "°C", warn: (canopyTemp ?? 0) > 35 },
                { icon: <Droplets className="w-3.5 h-3.5 text-blue" />, label: "Humidity", value: canopyHumid?.toFixed(0) ?? "—", unit: "%", warn: (canopyHumid ?? 60) < 40 },
                { icon: <CloudRain className="w-3.5 h-3.5 text-blue" />, label: "Rainfall", value: rainfall.toFixed(1), unit: "mm/hr", warn: rainfall > 2 },
                { icon: <Sun className="w-3.5 h-3.5 text-amber" />, label: "Solar Rad.", value: Math.round(solarRad).toString(), unit: "W/m²", warn: solarRad > 800 },
                { icon: <Zap className="w-3.5 h-3.5 text-amber" />, label: "Illuminance", value: (luxVal / 1000).toFixed(1), unit: "klux", warn: luxVal > 60000 },
                { icon: <Wind className="w-3.5 h-3.5 text-teal" />, label: "Wind", value: windMs.toFixed(1), unit: "m/s", warn: windMs > 5 },
              ].map((m, idx) => (
                <div key={idx} className={`p-2.5 rounded-lg border bg-card shadow-xs flex flex-col gap-1 ${m.warn ? "border-amber/40 bg-amber/5" : "border-border"}`}>
                  <div className="flex items-center gap-1.5">{m.icon}<span className="text-[10px] text-muted-foreground font-mono">{m.label}</span></div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-lg font-bold text-foreground">{m.value}</span>
                    <span className="text-[10px] text-muted-foreground">{m.unit}</span>
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground">SHT31 · simulated</div>
                </div>
              ))}
            </div>

            {/* Produce cards 2×2 */}
            <div className="grid grid-cols-2 gap-2.5 flex-1">
              {cats.map((cat) => {
                const profile = PRODUCE_PROFILES[cat];
                const a = assessments[cat];
                const level: RiskLevel = a?.riskLevel ?? "INSUFFICIENT_DATA";
                const stallT = sensors.find((s) => s.stall_id === profile.stallId && s.sensor_type === "temperature_stall")?.value;
                const stallH = sensors.find((s) => s.stall_id === profile.stallId && s.sensor_type === "relative_humidity")?.value;
                const topFactor = a?.factors[0];
                const isSelected = selectedCard === cat;

                return (
                  <div
                    key={cat}
                    onClick={() => {
                      setSelectedCard(cat);
                      setAiMessages([]);
                    }}
                    className={`rounded-xl border bg-card shadow-xs p-3.5 cursor-pointer transition-all hover:shadow-md flex flex-col gap-2 ${isSelected ? "border-teal ring-1 ring-teal/30" : "border-border hover:border-teal/40"}`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{profile.emoji}</span>
                        <div>
                          <div className="text-xs font-bold text-foreground">{profile.displayName}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{profile.stallName}</div>
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${riskLevelBadge(level)}`}>
                        {level.replace("_", " ")}
                      </span>
                    </div>

                    {/* Metrics row */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-secondary/30">
                        <Thermometer className="w-3 h-3 text-red shrink-0" />
                        <div>
                          <div className="text-[9px] text-muted-foreground">Stall Temp</div>
                          <div className="text-[11px] font-bold text-foreground">{stallT?.toFixed(1) ?? "—"}°C</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-secondary/30">
                        <Droplets className="w-3 h-3 text-blue shrink-0" />
                        <div>
                          <div className="text-[9px] text-muted-foreground">Humidity</div>
                          <div className="text-[11px] font-bold text-foreground">{stallH?.toFixed(0) ?? "—"}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Top risk */}
                    {topFactor && (
                      <div className={`rounded-md p-2 border text-[10px] ${riskLevelBg(level)}`}>
                        <div className="flex items-center gap-1">
                          {riskIcon(level)}
                          <span className="font-semibold truncate">{topFactor.factor}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5 text-[9px]">{topFactor.measurement}</div>
                      </div>
                    )}

                    {/* Recommendation preview */}
                    {a?.recommendations[0] && (
                      <p className="text-[10px] text-muted-foreground leading-snug border-t border-border/60 pt-1.5">
                        💡 {a.recommendations[0]}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground border-t border-border/60 pt-1">
                      <span className="flex items-center gap-1"><Database className="w-2.5 h-2.5" /> simulated · ESP32 node</span>
                      <span className="flex items-center gap-1"><ChevronRight className="w-3 h-3" /> tap to ask ARIA</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Limitations disclaimer */}
            <div className="shrink-0 p-2.5 rounded-lg border border-blue/20 bg-blue/5 flex items-start gap-2 text-[10px] text-muted-foreground">
              <Info className="w-3.5 h-3.5 text-blue shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Environmental risk estimates only.</strong>{" "}
                Sensor readings reflect ambient and stall conditions. Sensors cannot detect internal produce quality, spoilage, microbial load, or remaining shelf life. Physical inspection by the vendor is always required.
                Reference: USDA Agricultural Handbook 66; FAO Postharvest Technology; ICAR postharvest standards.
              </span>
            </div>
          </div>

          {/* Right: ARIA Analyst panel (shows when produce selected) */}
          <div className="w-[360px] shrink-0 flex flex-col rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            {!selectedCard ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-green/10 flex items-center justify-center">
                  <Leaf className="w-6 h-6 text-green" />
                </div>
                <div>
                  <p className="font-serif font-bold text-sm text-foreground">ARIA Agri-Intelligence</p>
                  <p className="text-xs text-muted-foreground mt-1">Select a produce card to ask ARIA about environmental conditions, risks, and vendor recommendations.</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 w-full text-[10px]">
                  {cats.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setSelectedCard(cat); setAiMessages([]); }}
                      className="px-2 py-1.5 rounded-md border border-border hover:border-teal bg-secondary/30 hover:bg-teal/5 text-muted-foreground hover:text-teal transition-all"
                    >
                      {PRODUCE_PROFILES[cat].emoji} {PRODUCE_PROFILES[cat].displayName}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* ARIA header */}
                <div className="shrink-0 px-3.5 py-2.5 border-b border-border bg-secondary/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-green/15 text-green flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        ARIA · {PRODUCE_PROFILES[selectedCard].emoji} {PRODUCE_PROFILES[selectedCard].displayName}
                      </div>
                      <div className="text-[9px] font-mono text-muted-foreground">Agricultural Environmental Analyst</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCard(null)} className="p-1 rounded-md hover:bg-secondary text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Risk summary banner */}
                {assessments[selectedCard] && (
                  <div className={`shrink-0 px-3.5 py-2 border-b border-border flex items-center justify-between ${riskLevelBg(assessments[selectedCard]!.riskLevel)}`}>
                    <div className="flex items-center gap-1.5">
                      {riskIcon(assessments[selectedCard]!.riskLevel)}
                      <span className={`text-xs font-bold ${riskLevelColor(assessments[selectedCard]!.riskLevel)}`}>
                        {assessments[selectedCard]!.riskLevel.replace("_", " ")} ENVIRONMENTAL RISK
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground">Score: {assessments[selectedCard]!.riskScore}/100</span>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3">
                  {aiMessages.length === 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        {assessments[selectedCard]?.summary}
                      </p>
                      <div className="text-[10px] font-semibold text-muted-foreground">Suggested questions:</div>
                      {AI_PROMPTS[selectedCard].map((q, i) => (
                        <button key={i} onClick={() => handleAiSend(q)}
                          className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-md border border-border hover:border-teal bg-secondary/30 hover:bg-green/5 text-foreground transition-all">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {aiMessages.map((m, idx) => (
                    <div key={idx} className={`flex gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                      {m.sender === "ai" && (
                        <div className="w-5 h-5 rounded-md bg-green/15 text-green flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-3 h-3" />
                        </div>
                      )}
                      <div className={`max-w-[90%] rounded-xl p-2.5 ${m.sender === "user" ? "bg-teal text-white text-[11px]" : "bg-background border border-border"}`}>
                        {m.sender === "ai" ? <MarkdownBlock text={m.text} /> : <p className="text-[11px]">{m.text}</p>}
                        {m.source && <div className="text-[9px] mt-1 font-mono text-muted-foreground">{m.source === "gemini" ? "✦ Gemini AI" : "ARIA Local"}</div>}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex gap-2 items-center">
                      <div className="w-5 h-5 rounded-md bg-green/15 text-green flex items-center justify-center shrink-0">
                        <Bot className="w-3 h-3" />
                      </div>
                      <div className="px-3 py-2 rounded-xl border border-border bg-background flex gap-1.5">
                        {[0, 120, 240].map((d) => (
                          <span key={d} className="w-1.5 h-1.5 rounded-full bg-green animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={aiEndRef} />
                </div>

                {/* Input */}
                <div className="shrink-0 p-2.5 border-t border-border flex gap-1.5">
                  <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAiSend()}
                    placeholder={`Ask about ${PRODUCE_PROFILES[selectedCard].displayName}…`}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border text-[11px] focus:outline-hidden focus:ring-1 focus:ring-teal focus:border-teal" />
                  <button onClick={() => handleAiSend()} disabled={aiLoading || !aiInput.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-green hover:bg-green/90 disabled:opacity-40 text-white shadow-xs transition-colors">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Limitations */}
                {selectedCard && (
                  <div className="shrink-0 px-3 pb-2.5 text-[9px] text-muted-foreground border-t border-border/60 pt-1.5">
                    ⚠ {PRODUCE_PROFILES[selectedCard].limitations}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ALERTS VIEW ─────────────────────────────────────────────────── */}
      {activeView === "alerts" && (
        <div className="flex-1 overflow-y-auto space-y-2.5">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-green" />
              <p className="font-serif font-bold text-foreground">No Active Alerts</p>
              <p className="text-xs text-muted-foreground">All produce display areas are within acceptable environmental parameters.</p>
            </div>
          ) : (
            alerts.map((alert, idx) => (
              <div key={idx} className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                alert.severity === "critical" ? "bg-red/5 border-red/30" :
                alert.severity === "warning" ? "bg-amber/5 border-amber/30" : "bg-secondary/30 border-border"}`}>
                {alert.severity === "critical" ? <XCircle className="w-5 h-5 text-red shrink-0 mt-0.5" /> :
                 alert.severity === "warning" ? <AlertTriangle className="w-5 h-5 text-amber shrink-0 mt-0.5" /> :
                 <Info className="w-5 h-5 text-blue shrink-0 mt-0.5" />}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{alert.msg}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase ${
                      alert.severity === "critical" ? "text-red border-red/30 bg-red/10" :
                      alert.severity === "warning" ? "text-amber border-amber/30 bg-amber/10" : "text-muted-foreground border-border"}`}>
                      {alert.severity}
                    </span>
                  </div>
                  {alert.produce && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {assessments[alert.produce as ProduceCategory]?.recommendations[0]}
                    </div>
                  )}
                  <div className="mt-1 text-[9px] font-mono text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {new Date().toLocaleTimeString()} · simulated sensor data
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
