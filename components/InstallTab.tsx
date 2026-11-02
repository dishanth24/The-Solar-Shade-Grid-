"use client";

import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Ruler,
  HardHat,
  Sun,
  Cable,
  Plug,
} from "lucide-react";

// The 5 install steps from slide 3. Text matches the slide.
const STEPS = [
  { n: 1, title: "Survey & Map", desc: "Mark stall rows and aisle widths", Icon: Ruler },
  { n: 2, title: "Fix the Frame", desc: "Modular poles on base plates between stall rows", Icon: HardHat },
  { n: 3, title: "Mount Canopy", desc: "PV membrane panels clip onto the frame", Icon: Sun },
  { n: 4, title: "Wire to Hub", desc: "DC bus runs along the frame to the hub", Icon: Cable },
  { n: 5, title: "Tap In Stalls", desc: "Each stall gets a metered plug for lights, fan and mist", Icon: Plug },
];

const STALL_X = [60, 250, 440]; // stall left edges
const STALL_W = 130;
const POLE_X = [40, 220, 410, 600]; // poles sit in the aisles between stall rows

const STEEL = "#516F75";
const AMBER = "#F5A623";
const TEAL = "#0F3A40";
const BLUE = "#2B7BB9";
const GREEN = "#1F8A5B";

export function InstallTab() {
  const [step, setStep] = useState<number>(1);
  const [auto, setAuto] = useState<boolean>(false);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setStep((s) => (s % 5) + 1), 2400);
    return () => clearInterval(t);
  }, [auto]);

  // Each part of the drawing fades/slides in when its step is reached.
  const reveal = (n: number): React.CSSProperties => ({
    opacity: step >= n ? 1 : 0,
    transform: step >= n ? "translateY(0px)" : "translateY(-14px)",
    transition: "opacity 600ms ease, transform 600ms ease, filter 400ms ease",
    filter: step === n ? "drop-shadow(0 0 6px rgba(245,166,35,0.9))" : "none",
  });

  const stroke = (n: number) => (step === n ? AMBER : STEEL);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-3">
      <style>{`
        @keyframes installDash { to { stroke-dashoffset: -24; } }
        @keyframes installDrop {
          0% { transform: translateY(0px); opacity: 0.85; }
          100% { transform: translateY(26px); opacity: 0; }
        }
        .install-dash { stroke-dasharray: 12 12; animation: installDash 1.2s linear infinite; }
        .install-drop { animation: installDrop 1s ease-in infinite; }
        @media (prefers-reduced-motion: reduce) {
          .install-dash, .install-drop { animation: none !important; }
        }
      `}</style>

      <div>
        <h2 className="font-serif text-2xl font-bold text-foreground">
          How the Grid Is Installed for Vendors
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Five steps, no ground digging: step through them or press Auto-play.
        </p>
      </div>

      {/* Drawing builds up as the steps advance */}
      <div className="rounded-xl border border-border bg-secondary/20 p-2">
        <svg
          viewBox="0 0 760 280"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-[250px]"
          aria-label="Installation steps diagram"
        >
          {/* Ground (always there) */}
          <rect x="20" y="236" width="720" height="10" rx="3" fill="#8FAAB0" opacity="0.55" />
          <text x="380" y="270" textAnchor="middle" fontSize="15" className="fill-current text-muted-foreground">
            Market aisle / ground level
          </text>

          {/* Step 1: survey marks (fade out once step 2 starts) */}
          <g style={{ opacity: step === 1 ? 1 : 0, transition: "opacity 500ms ease" }}>
            {STALL_X.map((x) => (
              <rect key={x} x={x} y={156} width={STALL_W} height={80} rx="6"
                fill="none" stroke={AMBER} strokeWidth="2.5" strokeDasharray="8 6" />
            ))}
            <line x1="190" y1="130" x2="190" y2="236" stroke={AMBER} strokeWidth="2" strokeDasharray="4 4" />
            <line x1="250" y1="130" x2="250" y2="236" stroke={AMBER} strokeWidth="2" strokeDasharray="4 4" />
            <line x1="190" y1="136" x2="250" y2="136" stroke={AMBER} strokeWidth="2.5" />
            <text x="220" y="124" textAnchor="middle" fontSize="15" fontWeight="700" fill={AMBER}>aisle</text>
            <text x="125" y="200" textAnchor="middle" fontSize="15" fontWeight="700" fill={AMBER}>stall row</text>
          </g>

          {/* Step 5: stalls filled in */}
          {STALL_X.map((x) => (
            <rect key={"s" + x} x={x} y={156} width={STALL_W} height={80} rx="6"
              fill={step >= 5 ? AMBER : "none"} stroke={step >= 5 ? AMBER : "none"}
              style={{ transition: "fill 600ms ease" }} />
          ))}
          {STALL_X.map((x) => (
            <text key={"t" + x} x={x + STALL_W / 2} y={204} textAnchor="middle"
              fontSize="17" fontWeight="800" fill={TEAL}
              style={{ opacity: step >= 5 ? 1 : 0, transition: "opacity 600ms ease" }}>
              Vendor stall
            </text>
          ))}

          {/* Step 2: poles + base plates */}
          <g style={reveal(2)}>
            {POLE_X.map((x) => (
              <g key={x}>
                <rect x={x - 5} y={70} width="10" height="166" rx="2" fill="#1B3A40" stroke={stroke(2)} strokeWidth="2" />
                <rect x={x - 16} y={230} width="32" height="7" rx="2" fill={stroke(2)} />
              </g>
            ))}
          </g>

          {/* Step 3: PV canopy panels */}
          <g style={reveal(3)}>
            <rect x="20" y="48" width="610" height="24" rx="4" fill={TEAL} stroke={stroke(3)} strokeWidth="2" />
            {Array.from({ length: 6 }).map((_, i) => (
              <rect key={i} x={26 + i * 100} y={52} width="94" height="16" rx="2"
                fill={AMBER} opacity="0.8" />
            ))}
            <text x="325" y="40" textAnchor="middle" fontSize="15" fontWeight="700" className="fill-current text-foreground">
              Lightweight PV canopy panels
            </text>
          </g>

          {/* Step 4: DC bus + hub */}
          <g style={reveal(4)}>
            <polyline points="40,86 690,86 690,118" fill="none" stroke="#264F54" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="40,86 690,86 690,118" fill="none" stroke={AMBER} strokeWidth="3.5"
              strokeLinecap="round" strokeLinejoin="round" className="install-dash" />
            <text x="450" y="108" textAnchor="middle" fontSize="15" fontWeight="700" fill={AMBER}>DC bus</text>
            <rect x="640" y="118" width="100" height="118" rx="8" fill={TEAL} stroke={stroke(4)} strokeWidth="2.5" />
            <text x="690" y="158" textAnchor="middle" fontSize="16" fontWeight="800" fill="#F1F5F4">Hub</text>
            <text x="690" y="182" textAnchor="middle" fontSize="14" fill="#93B8BC">battery</text>
            <text x="690" y="202" textAnchor="middle" fontSize="14" fill="#93B8BC">cold store</text>
          </g>

          {/* Step 5: metered plug + mist nozzle per stall */}
          <g style={reveal(5)}>
            {STALL_X.map((x) => {
              const cx = x + STALL_W / 2;
              return (
                <g key={"p" + x}>
                  <circle cx={cx} cy={96} r="5" fill={BLUE} />
                  <ellipse cx={cx} cy={108} rx="2.5" ry="4" fill="#93C6E8" className="install-drop" />
                  <rect x={cx - 9} y={148} width="18" height="14" rx="3" fill={GREEN} stroke={stroke(5)} strokeWidth="2" />
                </g>
              );
            })}
            <text x={STALL_X[0] + STALL_W / 2} y={138} textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>
              metered plug
            </text>
            <text x={STALL_X[1] + STALL_W / 2} y={128} textAnchor="middle" fontSize="14" fontWeight="700" fill={BLUE}>
              mist nozzle
            </text>
          </g>
        </svg>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous step"
            onClick={() => { setAuto(false); setStep((s) => Math.max(1, s - 1)); }}
            className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-semibold flex items-center gap-1 hover:border-teal/40"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            aria-label="Next step"
            onClick={() => { setAuto(false); setStep((s) => Math.min(5, s + 1)); }}
            className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-semibold flex items-center gap-1 hover:border-teal/40"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          aria-label={auto ? "Stop auto-play" : "Start auto-play"}
          onClick={() => setAuto((a) => !a)}
          className="h-8 px-3 rounded-lg bg-amber text-teal text-xs font-bold flex items-center gap-1.5"
        >
          {auto ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {auto ? "Stop auto-play" : "Auto-play"}
        </button>
      </div>

      {/* Step cards */}
      <div className="grid grid-cols-5 gap-2.5">
        {STEPS.map(({ n, title, desc, Icon }) => {
          const active = step === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => { setAuto(false); setStep(n); }}
              className={`text-left p-3 rounded-xl border flex flex-col gap-1.5 transition-all duration-300 ${
                active
                  ? "border-amber bg-amber/10 shadow-xs"
                  : step > n
                  ? "border-green/40 bg-secondary/30"
                  : "border-border bg-secondary/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-teal dark:text-amber" />
                <span className="font-mono text-lg font-bold text-amber">{n}</span>
              </div>
              <h3 className="font-serif text-sm font-bold text-foreground leading-tight">{title}</h3>
              <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
