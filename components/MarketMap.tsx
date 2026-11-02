"use client";

import React, { useMemo } from "react";
import { useSim } from "@/lib/sim-context";
import { fmtClock, C } from "@/lib/engine";
import type { Stall } from "@/lib/engine";

/* ─── Layout constants (viewBox 960 × 340) ─── */
// Fix 4: viewBox height trimmed from 420 → 340 to eliminate empty band below stalls.
const VB_W = 960;
const VB_H = 340;

// Canopy
const CANOPY_Y = 74;
const CANOPY_H = 30;
const CANOPY_X = 40;
const CANOPY_W = 555;

// Stalls — same physical size as before
const STALL_ROW_Y = 138;
const STALL_W     = 80;
const STALL_H     = 130;
const STALL_GAP   = 10;
const STALL_START_X = 27;

// Hub
const HUB_X = 752;
const HUB_Y = 118;
const HUB_W = 118;
const HUB_H = 152;  // bottom = 270

// DC Bus
const BUS_Y  = CANOPY_Y + CANOPY_H + 10; // 114
const BUS_X1 = CANOPY_X + CANOPY_W / 2;  // 317
const BUS_X2 = HUB_X;                     // 752

// Grid pylon (moved slightly left so label fits in VB_W)
const PYLON_X      = 905;
const PYLON_GRID_Y = 164;

// Fix 3: direction label placed BELOW the pylon tower, clear of hub and X.
// Pylon tower bottom ground line: PYLON_GRID_Y + 62 = 226
// Label pill sits at y=232, text at y=248. Well below hub (270) and clear of caption.
// FIX: label now sits ABOVE the pylon, fully inside the viewBox (850..960), clear of the hub, X and sun.
const DIR_PILL_W  = 110;
const DIR_PILL_X  = PYLON_X - DIR_PILL_W / 2;  // 850
const DIR_PILL_Y  = 92;
const DIR_PILL_H  = 22;
const DIR_TEXT_Y  = DIR_PILL_Y + 16; // 108

// Fix 3 (X): broken-X sits on the hub→pylon line midpoint
// Hub right edge (870, HUB_Y+HUB_H/2=194) → Pylon (905,164), midpoint ≈ (887, 179)
const X_MID_X = (HUB_X + HUB_W + PYLON_X) / 2; // 887
const X_MID_Y = (HUB_Y + HUB_H / 2 + PYLON_GRID_Y) / 2; // (194+164)/2=179

/* ─── helpers ─── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function sunPosition(hour: number): { x: number; y: number; isMoon: boolean } {
  const isMoon = hour < 6 || hour >= 18;
  if (!isMoon) {
    const t = (hour - 6) / 12;
    return { x: lerp(80, 880, t), y: 60 - Math.sin(Math.PI * t) * 48, isMoon: false };
  }
  const t = hour >= 18 ? (hour - 18) / 12 : (hour + 6) / 12;
  return { x: lerp(820, 120, t), y: 24, isMoon: true };
}

function stallX(i: number) {
  return STALL_START_X + i * (STALL_W + STALL_GAP);
}

function stallColor(status: Stall["status"], gridLive: boolean) {
  if (!gridLive || status === "shed") return { fill: "#4B6268", stroke: "#6B8288" };
  if (status === "amber") return { fill: "#8B5E0A", stroke: "#F5A623" };
  return { fill: "#1A4A38", stroke: "#1F8A5B" };
}

function stallTextColor(status: Stall["status"], gridLive: boolean) {
  if (!gridLive || status === "shed") return "#8FAAB0";
  if (status === "amber") return "#F5A623";
  return "#A7E6C8";
}

/* ─── Component ─── */
export function MarketMap() {
  const { state } = useSim();
  const last = state.last;

  const hsun          = last?.hsun          ?? 0;
  const genKw         = last?.genKw         ?? 0;
  const coolingKw     = last?.coolingKw     ?? 0;
  const soldKwh       = last?.soldKwh       ?? 0;
  const gridImportKwh = last?.gridImportKwh ?? 0;
  const soc           = state.soc;
  const gridLive      = state.gridLive;
  const isDark        = !gridLive;

  const sunPos = useMemo(() => sunPosition(state.hour), [state.hour]);

  // DC bus dash speed
  const dashSpeed = genKw > 0.05 ? Math.max(0.6, lerp(3, 0.6, genKw / C.P_CAP)) : 0;
  const dashAnim  = dashSpeed > 0 ? `dcDash ${dashSpeed}s linear infinite` : "none";

  // Grid line
  const gridLineColor = !gridLive       ? "#D4533B"
    : soldKwh       > 0                 ? "#1F8A5B"
    : gridImportKwh > 0                 ? "#D4533B"
    :                                     "#516F75";
  const gridLineDash = !gridLive       ? "none"
    : soldKwh       > 0                 ? "gridOut 1.2s linear infinite"
    : gridImportKwh > 0                 ? "gridIn 1.2s linear infinite"
    :                                     "none";

  // Direction label text (Fix 3)
  const dirLabel = !gridLive       ? "GRID DOWN"
    : soldKwh       > 0            ? "▶ Selling"
    : gridImportKwh > 0            ? "◀ Importing"
    :                                "Standby";
  const dirLabelColor = !gridLive || gridImportKwh > 0 ? "#D4533B"
    : soldKwh > 0 ? "#1F8A5B"
    : "#516F75";

  // Battery fill
  const battFillH = Math.max(2, soc * (HUB_H - 44));
  const battFillY = HUB_Y + HUB_H - 22 - battFillH;
  const battColor = soc > 0.4 ? "#1F8A5B" : soc > 0.2 ? "#F5A623" : "#D4533B";

  const skyOpacity   = isDark ? 0.18 : 1;
  const sceneOpacity = isDark ? 0.45 : 1;

  const caption = !gridLive
    ? "⚡ BLACKOUT – Battery sustaining critical loads"
    : state.heatwave
    ? "🌡 HEATWAVE – Misting active, cold storage boosted"
    : genKw > 0.5
    ? "☀ Normal Operation – Solar covering full load"
    : "🌙 Night Mode – Battery reserve active";

  const nozzleXs = [60, 140, 220, 300, 380, 460];
  const mistOn   = coolingKw > 0;

  return (
    <div className="w-full" style={{ aspectRatio: "960/340" }}>
      <style>{`
        @keyframes dcDash {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -24; }
        }
        @keyframes gridOut {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -20; }
        }
        @keyframes gridIn {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: 20; }
        }
        @keyframes drop {
          0%   { transform: translateY(0px);  opacity: 0.85; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(42px); opacity: 0; }
        }
        @keyframes snowPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.18); }
        }
        @keyframes safetyGlow {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        .dc-dash {
          stroke-dasharray: 12 12;
          animation: ${dashAnim};
        }
        .grid-line-anim {
          stroke-dasharray: 10 10;
          animation: ${gridLineDash};
        }
        .snowflake-pulse {
          animation: snowPulse 1.6s ease-in-out infinite;
          transform-origin: center;
        }
        .safety-glow {
          animation: safetyGlow 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .dc-dash, .grid-line-anim, .snowflake-pulse, .safety-glow {
            animation: none !important;
          }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        aria-label="Solar Shade Grid digital twin market map"
      >
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={isDark ? "#060F12" : "#BDE0F5"} />
            <stop offset="100%" stopColor={isDark ? "#0A1F23" : "#E8F6FC"} />
          </linearGradient>
          <linearGradient id="cellGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={`rgba(245,166,35,${0.15 + hsun * 0.75})`} />
            <stop offset="100%" stopColor={`rgba(15,58,64,${0.6 + hsun * 0.4})`} />
          </linearGradient>
          <linearGradient id="battGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stopColor={battColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={battColor} stopOpacity="0.45" />
          </linearGradient>
          <filter id="hubGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="safeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="sunGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Sky ── */}
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#skyGrad)" />
        {isDark && [
          [120,12],[240,18],[380,8],[500,26],[650,14],[780,10],[860,20],[160,38],[450,32],[720,28],
        ].map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r="1.4" fill="#BDE0F5" opacity="0.6" />
        ))}

        {/* ── Sun / Moon ── */}
        {!sunPos.isMoon ? (
          <g filter="url(#sunGlow)" opacity={skyOpacity}>
            <circle cx={sunPos.x} cy={sunPos.y} r={14 + hsun * 8}  fill="#F5A623" opacity={0.18 + hsun * 0.12} />
            <circle cx={sunPos.x} cy={sunPos.y} r={10 + hsun * 4}  fill={`rgba(255,210,60,${0.55 + hsun * 0.45})`} />
            {[0,45,90,135,180,225,270,315].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const inner = 14 + hsun * 4, outer = 22 + hsun * 6;
              return (
                <line key={i}
                  x1={sunPos.x + Math.cos(rad) * inner} y1={sunPos.y + Math.sin(rad) * inner}
                  x2={sunPos.x + Math.cos(rad) * outer} y2={sunPos.y + Math.sin(rad) * outer}
                  stroke="#FFD43B" strokeWidth="2" strokeLinecap="round"
                  opacity={0.5 + hsun * 0.5}
                />
              );
            })}
          </g>
        ) : (
          <g opacity={0.8}>
            <circle cx={sunPos.x} cy={sunPos.y} r={12} fill="#B8CFDA" />
            <circle cx={sunPos.x + 5} cy={sunPos.y - 3} r={9} fill={isDark ? "#060F12" : "#BDE0F5"} />
          </g>
        )}

        {/* ── PV Canopy Bar ── */}
        <g opacity={sceneOpacity}>
          <rect x={CANOPY_X} y={CANOPY_Y} width={CANOPY_W} height={CANOPY_H}
            rx="4" fill="#0F3A40" stroke="#264F54" strokeWidth="1.5" />
          {Array.from({ length: 7 }).map((_, i) => {
            const cellW = (CANOPY_W - 16) / 7;
            const cx    = CANOPY_X + 8 + i * cellW;
            return (
              <rect key={i}
                x={cx + 1} y={CANOPY_Y + 3} width={cellW - 2} height={CANOPY_H - 6}
                rx="2" fill="url(#cellGrad)"
                stroke={`rgba(245,166,35,${0.2 + hsun * 0.6})`} strokeWidth="0.8"
              />
            );
          })}

          {/* Fix 5: Canopy label — dark on light sky, light on dark sky — with pill */}
          <rect
            x={CANOPY_X + CANOPY_W / 2 - 140} y={CANOPY_Y - 26}
            width={280} height={22} rx="11"
            fill={isDark ? "rgba(10,31,35,0.85)" : "rgba(15,58,64,0.82)"}
          />
          <text x={CANOPY_X + CANOPY_W / 2} y={CANOPY_Y - 10}
            textAnchor="middle" fill="#F1F5F4" fontSize="16" fontWeight="700">
            12 kW PV Canopy · {genKw.toFixed(1)} kW now
          </text>
        </g>

        {/* ── Mist Nozzles + Droplets ── */}
        {nozzleXs.map((nx, i) => (
          <g key={i} opacity={sceneOpacity}>
            <circle cx={CANOPY_X + nx} cy={CANOPY_Y + CANOPY_H + 3}
              r="4" fill={mistOn ? "#2B7BB9" : "#264F54"}
              stroke={mistOn ? "#93C6E8" : "#1C484F"} strokeWidth="1" />
            {mistOn && [0, 1, 2].map((d) => {
              const dropX = CANOPY_X + nx + (d - 1) * 6;
              const delay = (i * 0.17 + d * 0.25).toFixed(2);
              const dur   = (0.9 + d * 0.15).toFixed(2);
              return (
                <ellipse key={d}
                  cx={dropX} cy={CANOPY_Y + CANOPY_H + 14}
                  rx="2" ry="3.5"
                  fill="#93C6E8" opacity="0.75"
                  style={{ animation: `drop ${dur}s ease-in ${delay}s infinite` }}
                />
              );
            })}
          </g>
        ))}

        {/* ── Stalls ── */}
        {state.stalls.map((stall, i) => {
          const sx = stallX(i);
          const sy = STALL_ROW_Y;
          const { fill, stroke } = stallColor(stall.status, gridLive);
          const textCol = stallTextColor(stall.status, gridLive);
          const isShed  = !gridLive || stall.status === "shed";
          const pillLabel = isShed ? "SHED" : stall.status === "amber" ? "HOT" : "OK";
          const pillColor = isShed || stall.status === "amber" ? "#F5A623" : "#1F8A5B";

          return (
            <g key={stall.id}
              style={{ transition: "opacity 700ms ease" }}
              opacity={isDark && !isShed ? 0.5 : 1}>
              {/* Stall body */}
              <rect x={sx} y={sy} width={STALL_W} height={STALL_H}
                rx="7" fill={fill} stroke={stroke} strokeWidth="1.5" />
              {/* Top colour stripe */}
              <rect x={sx + 1} y={sy + 1} width={STALL_W - 2} height="9"
                rx="6" fill={stroke} opacity="0.6" />

              {/* Safety-light glow for shed stalls */}
              {isShed && (
                <circle cx={sx + STALL_W / 2} cy={sy + 16}
                  r="8" fill="#F5A623" opacity="0.85"
                  className="safety-glow" filter="url(#safeGlow)" />
              )}

              {/*
                Fix 1: stall name — fontSize 16 + textLength clamps long names like
                "Vegetables" inside the stall box (STALL_W=80, budget=68 px).
              */}
              <text
                x={sx + STALL_W / 2} y={sy + (isShed ? 38 : 36)}
                textAnchor="middle" fill={textCol}
                fontSize="16" fontWeight="700"
                textLength={STALL_W - 12}
                lengthAdjust="spacingAndGlyphs">
                {stall.name}
              </text>

              {/* Temperature — 22 px bold */}
              <text x={sx + STALL_W / 2} y={sy + 70}
                textAnchor="middle" fill={textCol}
                fontSize="22" fontWeight="800" fontFamily="monospace">
                {stall.temp.toFixed(0)}°
              </text>

              {/* Status pill — 16 px */}
              <text x={sx + STALL_W / 2} y={sy + 100}
                textAnchor="middle" fill={pillColor}
                fontSize="16" fontWeight="700"
                style={{ letterSpacing: "1px" }}>
                {pillLabel}
              </text>
            </g>
          );
        })}

        {/* ── DC Bus ── */}
        <g opacity={sceneOpacity}>
          {/* Rail background */}
          <line x1={BUS_X1} y1={BUS_Y} x2={BUS_X2} y2={BUS_Y}
            stroke="#264F54" strokeWidth="6" strokeLinecap="round" />
          {/* Animated dashes */}
          <line x1={BUS_X1} y1={BUS_Y} x2={BUS_X2} y2={BUS_Y}
            stroke={genKw > 0.1 ? "#F5A623" : "#516F75"}
            strokeWidth="3.5" strokeLinecap="round"
            className={genKw > 0.05 ? "dc-dash" : undefined} />

          {/*
            Fix 2: DC Micro-Bus label moved into the clear gap between bus and stalls.
            Placed at the RIGHT portion of the bus (x≈620) in a dark pill so it
            does not overlap the canopy label above or the stall tops below.
            Pill: y=BUS_Y+6=120, h=18, clears stalls at y=STALL_ROW_Y=138 by 0px → shift up.
            Safe zone: BUS_Y(114)+rail(6px)=120 to STALL_ROW_Y(138)=18px gap.
            Pill sits at y=119, h=16, text at y=131 — 7px clear of stall tops.
          */}
          <rect
            x={440} y={BUS_Y + 5}
            width={200} height={18} rx="9"
            fill="rgba(10,31,35,0.82)"
            stroke="#264F54" strokeWidth="1"
          />
          <text x={540} y={BUS_Y + 18}
            textAnchor="middle" fill="#93B8BC" fontSize="14" fontWeight="600">
            DC Micro-Bus · {(genKw * 0.82).toFixed(1)} kWh/h
          </text>

          {/* Vertical stubs */}
          <line x1={CANOPY_X + CANOPY_W / 2} y1={CANOPY_Y + CANOPY_H}
                x2={BUS_X1} y2={BUS_Y} stroke="#264F54" strokeWidth="2.5" />
          <line x1={BUS_X2} y1={BUS_Y}
                x2={HUB_X} y2={HUB_Y + 20} stroke="#264F54" strokeWidth="2.5" />
        </g>

        {/* ── Hub Box ── */}
        <g filter={isDark ? "url(#hubGlow)" : undefined}>
          <rect x={HUB_X} y={HUB_Y} width={HUB_W} height={HUB_H}
            rx="9" fill="#0F3A40" stroke="#264F54" strokeWidth="2" />

          {/* Hub title */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + 18}
            textAnchor="middle" fill="#93B8BC" fontSize="16" fontWeight="700">
            MICRO-HUB
          </text>

          {/* Battery container */}
          <rect x={HUB_X + 12} y={HUB_Y + 24} width={HUB_W - 24} height={HUB_H - 46}
            rx="4" fill="#0A1F23" stroke="#1C484F" strokeWidth="1" />
          {/* Battery fill bar */}
          <rect x={HUB_X + 13} y={battFillY}
            width={HUB_W - 26} height={battFillH}
            rx="3" fill="url(#battGrad)"
            style={{ transition: "y 600ms ease, height 600ms ease" }} />

          {/* SOC % */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + 24 + (HUB_H - 46) / 2 + 7}
            textAnchor="middle" fill="#F1F5F4" fontSize="20" fontWeight="800" fontFamily="monospace">
            {Math.round(soc * 100)}%
          </text>
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + 24 + (HUB_H - 46) / 2 + 26}
            textAnchor="middle" fill="#93B8BC" fontSize="16">
            20 kWh
          </text>

          {/* Snowflake */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + HUB_H - 16}
            textAnchor="middle" fontSize="18"
            fill={last?.storageKw ? "#93C6E8" : "#264F54"}
            className={last?.storageKw ? "snowflake-pulse" : undefined}>
            ❄
          </text>

          {/* Inverter label */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + HUB_H - 2}
            textAnchor="middle" fill="#516F75" fontSize="16" fontWeight="500">
            Inverter
          </text>
        </g>

        {/* ── Grid Pylon + Line ── */}
        <g opacity={sceneOpacity}>
          {/* Tower */}
          <line x1={PYLON_X} y1={PYLON_GRID_Y - 32} x2={PYLON_X} y2={PYLON_GRID_Y + 62}
            stroke="#516F75" strokeWidth="4" strokeLinecap="round" />
          <line x1={PYLON_X - 20} y1={PYLON_GRID_Y - 12} x2={PYLON_X + 20} y2={PYLON_GRID_Y - 12}
            stroke="#516F75" strokeWidth="3" strokeLinecap="round" />
          <line x1={PYLON_X - 14} y1={PYLON_GRID_Y + 10} x2={PYLON_X + 14} y2={PYLON_GRID_Y + 10}
            stroke="#516F75" strokeWidth="3" strokeLinecap="round" />
          {/* Ground */}
          <line x1={PYLON_X - 14} y1={PYLON_GRID_Y + 62} x2={PYLON_X + 14} y2={PYLON_GRID_Y + 62}
            stroke="#516F75" strokeWidth="3" />
          <line x1={PYLON_X - 8}  y1={PYLON_GRID_Y + 68} x2={PYLON_X + 8}  y2={PYLON_GRID_Y + 68}
            stroke="#516F75" strokeWidth="2" opacity="0.5" />

          {/* Hub → pylon line */}
          <line
            x1={HUB_X + HUB_W} y1={HUB_Y + HUB_H / 2}
            x2={PYLON_X}        y2={PYLON_GRID_Y}
            stroke={gridLineColor} strokeWidth="3.5" strokeLinecap="round"
            className={!gridLive ? undefined : (soldKwh > 0 || gridImportKwh > 0) ? "grid-line-anim" : undefined}
            strokeDasharray={(!gridLive || soldKwh > 0 || gridImportKwh > 0) ? "10 10" : undefined}
          />

          {/* Broken-X — sits on line midpoint, well away from the direction label */}
          {!gridLive && (
            <g>
              <line x1={X_MID_X - 12} y1={X_MID_Y - 12} x2={X_MID_X + 12} y2={X_MID_Y + 12}
                stroke="#D4533B" strokeWidth="5" strokeLinecap="round" />
              <line x1={X_MID_X + 12} y1={X_MID_Y - 12} x2={X_MID_X - 12} y2={X_MID_Y + 12}
                stroke="#D4533B" strokeWidth="5" strokeLinecap="round" />
            </g>
          )}

          {/*
            Fix 3: Direction label placed BELOW the pylon tower (y ≈ 232–248),
            clear of the hub (bottom 270 is to the LEFT), the X (y≈179),
            and the caption chip (y≈298).
            Pill background prevents it merging with any line.
          */}
          <rect
            x={DIR_PILL_X} y={DIR_PILL_Y}
            width={DIR_PILL_W} height={DIR_PILL_H} rx="11"
            fill="rgba(10,31,35,0.88)"
            stroke={dirLabelColor} strokeWidth="1.2"
          />
          <text
            x={DIR_PILL_X + DIR_PILL_W / 2} y={DIR_TEXT_Y}
            textAnchor="middle" fontSize="14" fontWeight="700"
            fill={dirLabelColor}>
            {dirLabel}
          </text>

          {/* "Grid" label directly below tower ground */}
          <text x={PYLON_X} y={PYLON_GRID_Y + 84}
            textAnchor="middle" fill="#516F75" fontSize="16" fontWeight="500">
            Grid
          </text>
        </g>

        {/* ── Caption chip ── */}
        <g>
          <rect
            x={VB_W / 2 - 270} y={VB_H - 38}
            width={540} height={32}
            rx="16" fill={isDark ? "rgba(10,31,35,0.92)" : "rgba(15,58,64,0.88)"}
            stroke={isDark ? "#F5A623" : "#264F54"} strokeWidth="1.5"
          />
          <text
            x={VB_W / 2} y={VB_H - 16}
            textAnchor="middle"
            fill={isDark ? "#F5A623" : "#F1F5F4"}
            fontSize="20" fontWeight="700">
            {caption}
          </text>
        </g>

        {/* ── Clock chip ── */}
        <g>
          <rect x={8} y={8} width={80} height={26} rx="13"
            fill="rgba(10,31,35,0.80)" stroke="#264F54" strokeWidth="1" />
          <text x={48} y={26} textAnchor="middle" fill="#F1F5F4"
            fontSize="16" fontWeight="700" fontFamily="monospace">
            {fmtClock(state.hour)}
          </text>
        </g>

        {/* ── Ambient temp chip ── */}
        <g>
          <rect x={96} y={8} width={106} height={26} rx="13"
            fill="rgba(10,31,35,0.80)" stroke="#264F54" strokeWidth="1" />
          <text x={149} y={26} textAnchor="middle"
            fill={last?.hot ? "#F5A623" : "#93B8BC"}
            fontSize="16" fontWeight="700">
            {last ? `${last.ambient.toFixed(0)}°C` : "--"}{last?.hot ? " 🌡" : ""}
          </text>
        </g>
      </svg>
    </div>
  );
}
