"use client";

import React, { useMemo } from "react";
import { useSim } from "@/lib/sim-context";
import { fmtClock, C } from "@/lib/engine";
import type { Stall } from "@/lib/engine";

/* ─── Layout constants (viewBox 960 × 420) ─── */
const VB_W = 960;
const VB_H = 420;

// Sky / canopy
const SKY_H = 80;        // sky fills top 80 px
const CANOPY_Y = 80;     // canopy bar top
const CANOPY_H = 28;     // canopy bar height
const CANOPY_X = 40;     // canopy left
const CANOPY_W = 560;    // canopy width

// Stalls
const STALL_ROW_Y = 142; // stall tops
const STALL_W = 64;
const STALL_H = 110;
const STALL_GAP = 8;
const STALL_START_X = 40;

// Hub
const HUB_X = 740;
const HUB_Y = 130;
const HUB_W = 110;
const HUB_H = 140;

// DC Bus (horizontal line from canopy centre to hub left edge)
const BUS_Y = CANOPY_Y + CANOPY_H + 10; // 118 px
const BUS_X1 = CANOPY_X + CANOPY_W / 2;
const BUS_X2 = HUB_X;

// Grid pylon
const PYLON_X = 900;
const PYLON_GRID_Y = 170;

/* ─── helpers ─── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function sunPosition(hour: number): { x: number; y: number; isMoon: boolean } {
  // Arc from left (06:00) to right (18:00) across the sky
  const isMoon = hour < 6 || hour >= 18;
  if (!isMoon) {
    const t = (hour - 6) / 12; // 0..1
    const x = lerp(80, 880, t);
    const y = lerp(68, 68, 0) - Math.sin(Math.PI * t) * 56; // arc up
    return { x, y, isMoon: false };
  }
  // Moon: shown at a fixed spot top-right during night
  const t = hour >= 18 ? (hour - 18) / 12 : (hour + 6) / 12;
  const x = lerp(820, 120, t);
  const y = 28;
  return { x, y, isMoon: true };
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

  const hsun = last?.hsun ?? 0;
  const genKw = last?.genKw ?? 0;
  const coolingKw = last?.coolingKw ?? 0;
  const soldKwh = last?.soldKwh ?? 0;
  const gridImportKwh = last?.gridImportKwh ?? 0;
  const soc = state.soc;
  const gridLive = state.gridLive;
  const isDark = !gridLive;

  const sunPos = useMemo(() => sunPosition(state.hour), [state.hour]);

  // DC bus dash animation speed: proportional to genKw / P_CAP (max 12 kW)
  const dashSpeed = genKw > 0.05 ? Math.max(0.6, lerp(3, 0.6, genKw / C.P_CAP)) : 0;
  const dashAnim = dashSpeed > 0 ? `dcDash ${dashSpeed}s linear infinite` : "none";

  // Grid line state
  const gridLineColor = !gridLive ? "#D4533B" : soldKwh > 0 ? "#1F8A5B" : gridImportKwh > 0 ? "#D4533B" : "#516F75";
  const gridLineDash = !gridLive ? "none" : soldKwh > 0 ? `gridOut 1.2s linear infinite` : gridImportKwh > 0 ? `gridIn 1.2s linear infinite` : "none";

  // Battery fill height
  const battFillH = Math.max(2, soc * (HUB_H - 40));
  const battFillY = HUB_Y + HUB_H - 20 - battFillH;
  const battColor = soc > 0.4 ? "#1F8A5B" : soc > 0.2 ? "#F5A623" : "#D4533B";

  // Sky gradient control — dims in dark mode
  const skyOpacity = isDark ? 0.18 : 1;
  const sceneOpacity = isDark ? 0.45 : 1;

  // Caption
  const caption = !gridLive
    ? "⚡ BLACKOUT – Battery sustaining critical loads"
    : state.heatwave
    ? "🌡 HEATWAVE – Misting active, cold storage boosted"
    : genKw > 0.5
    ? "☀ Normal Operation – Solar covering full load"
    : "🌙 Night Mode – Battery reserve active";

  // Mist nozzle X positions (every 80 px across canopy)
  const nozzleXs = [80, 160, 240, 320, 400, 480];
  const mistOn = coolingKw > 0;

  return (
    <div className="w-full h-full relative">
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
          0%   { transform: translateY(0px);   opacity: 0.85; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(38px);  opacity: 0; }
        }
        @keyframes snowPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.18); }
        }
        @keyframes safetyGlow {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1; }
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
        className="w-full h-full"
        aria-label="Solar Shade Grid digital twin market map"
      >
        <defs>
          {/* Sky gradient */}
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDark ? "#060F12" : "#BDE0F5"} />
            <stop offset="100%" stopColor={isDark ? "#0A1F23" : "#E8F6FC"} />
          </linearGradient>
          {/* Canopy cell gradient */}
          <linearGradient id="cellGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(245,166,35,${0.15 + hsun * 0.75})`} />
            <stop offset="100%" stopColor={`rgba(15,58,64,${0.6 + hsun * 0.4})`} />
          </linearGradient>
          {/* Battery fill gradient */}
          <linearGradient id="battGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={battColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={battColor} stopOpacity="0.45" />
          </linearGradient>
          {/* Hub glow filter */}
          <filter id="hubGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Safety light glow */}
          <filter id="safeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Sun glow */}
          <filter id="sunGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="dimFilter">
            <feColorMatrix type="saturate" values={isDark ? "0.3" : "1"} />
          </filter>
        </defs>

        {/* ── Sky Background ── */}
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#skyGrad)" />

        {/* Stars in dark/night mode */}
        {isDark && [
          [120, 15], [240, 22], [380, 10], [500, 30], [650, 18], [780, 12], [860, 25],
          [160, 45], [450, 40], [720, 35],
        ].map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r="1.2" fill="#BDE0F5" opacity="0.6" />
        ))}

        {/* ── Sun / Moon ── */}
        {!sunPos.isMoon ? (
          <g filter="url(#sunGlow)" opacity={skyOpacity}>
            {/* Halo */}
            <circle cx={sunPos.x} cy={sunPos.y} r={14 + hsun * 8} fill="#F5A623" opacity={0.18 + hsun * 0.12} />
            {/* Sun disc */}
            <circle cx={sunPos.x} cy={sunPos.y} r={10 + hsun * 4} fill={`rgba(255,210,60,${0.55 + hsun * 0.45})`} />
            {/* Sun rays */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const inner = 14 + hsun * 4;
              const outer = 22 + hsun * 6;
              return (
                <line
                  key={i}
                  x1={sunPos.x + Math.cos(rad) * inner}
                  y1={sunPos.y + Math.sin(rad) * inner}
                  x2={sunPos.x + Math.cos(rad) * outer}
                  y2={sunPos.y + Math.sin(rad) * outer}
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
          {/* Canopy frame */}
          <rect
            x={CANOPY_X} y={CANOPY_Y} width={CANOPY_W} height={CANOPY_H}
            rx="4" fill="#0F3A40" stroke="#264F54" strokeWidth="1.5"
          />
          {/* Individual panel cells (7 cells) */}
          {Array.from({ length: 7 }).map((_, i) => {
            const cellW = (CANOPY_W - 16) / 7;
            const cx = CANOPY_X + 8 + i * cellW;
            return (
              <rect
                key={i}
                x={cx + 1} y={CANOPY_Y + 3}
                width={cellW - 2} height={CANOPY_H - 6}
                rx="2"
                fill="url(#cellGrad)"
                stroke={`rgba(245,166,35,${0.2 + hsun * 0.6})`}
                strokeWidth="0.8"
              />
            );
          })}
          {/* Canopy label */}
          <text x={CANOPY_X + CANOPY_W / 2} y={CANOPY_Y - 8}
            textAnchor="middle" fill="#93B8BC" fontSize="13" fontWeight="600">
            12 kW PV Canopy · {(genKw).toFixed(1)} kW now
          </text>
        </g>

        {/* ── Mist Nozzles + Droplets ── */}
        {nozzleXs.map((nx, i) => (
          <g key={i} opacity={sceneOpacity}>
            {/* Nozzle dot */}
            <circle
              cx={CANOPY_X + nx} cy={CANOPY_Y + CANOPY_H + 2}
              r="3.5"
              fill={mistOn ? "#2B7BB9" : "#264F54"}
              stroke={mistOn ? "#93C6E8" : "#1C484F"}
              strokeWidth="0.8"
            />
            {/* Droplets – only rendered when misting is on */}
            {mistOn && [0, 1, 2].map((d) => {
              const dropX = CANOPY_X + nx + (d - 1) * 5;
              const delay = (i * 0.17 + d * 0.25).toFixed(2);
              const dur = (0.9 + d * 0.15).toFixed(2);
              return (
                <ellipse
                  key={d}
                  cx={dropX} cy={CANOPY_Y + CANOPY_H + 12}
                  rx="1.6" ry="3"
                  fill="#93C6E8" opacity="0.75"
                  style={{
                    animation: `drop ${dur}s ease-in ${delay}s infinite`,
                  }}
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
          const isShed = !gridLive || stall.status === "shed";

          return (
            <g key={stall.id} style={{ transition: "opacity 700ms ease" }} opacity={isDark && !isShed ? 0.5 : 1}>
              {/* Stall body */}
              <rect
                x={sx} y={sy} width={STALL_W} height={STALL_H}
                rx="6" fill={fill} stroke={stroke} strokeWidth="1.5"
              />
              {/* Status stripe at top */}
              <rect
                x={sx + 1} y={sy + 1} width={STALL_W - 2} height="8"
                rx="5" fill={stroke} opacity="0.6"
              />

              {/* Safety-light amber glow for shed stalls */}
              {isShed && (
                <circle
                  cx={sx + STALL_W / 2} cy={sy + 14}
                  r="6" fill="#F5A623"
                  opacity="0.85"
                  className="safety-glow"
                  filter="url(#safeGlow)"
                />
              )}

              {/* Stall name */}
              <text
                x={sx + STALL_W / 2} y={sy + (isShed ? 34 : 30)}
                textAnchor="middle" fill={textCol}
                fontSize="10.5" fontWeight="700"
                style={{ letterSpacing: "-0.3px" }}
              >
                {stall.name}
              </text>

              {/* Temperature */}
              <text
                x={sx + STALL_W / 2} y={sy + 50}
                textAnchor="middle" fill={textCol}
                fontSize="15" fontWeight="800" fontFamily="monospace"
              >
                {stall.temp.toFixed(0)}°
              </text>

              {/* Status pill text */}
              <text
                x={sx + STALL_W / 2} y={sy + 68}
                textAnchor="middle"
                fill={isShed ? "#F5A623" : stall.status === "amber" ? "#F5A623" : "#1F8A5B"}
                fontSize="9" fontWeight="700"
                style={{ letterSpacing: "1px", textTransform: "uppercase" }}
              >
                {isShed ? "SHED" : stall.status === "amber" ? "HOT" : "OK"}
              </text>

              {/* Wallet */}
              <text
                x={sx + STALL_W / 2} y={sy + STALL_H - 14}
                textAnchor="middle" fill={textCol}
                fontSize="10" fontWeight="600" fontFamily="monospace"
              >
                ₹{Math.round(stall.wallet)}
              </text>

              {/* Load kW */}
              <text
                x={sx + STALL_W / 2} y={sy + STALL_H - 3}
                textAnchor="middle" fill={textCol}
                fontSize="9" opacity="0.7"
              >
                {stall.loadKw.toFixed(2)} kW
              </text>
            </g>
          );
        })}

        {/* ── DC Bus ── */}
        <g opacity={sceneOpacity}>
          {/* Bus rail background */}
          <line
            x1={BUS_X1} y1={BUS_Y} x2={BUS_X2} y2={BUS_Y}
            stroke="#264F54" strokeWidth="5" strokeLinecap="round"
          />
          {/* Animated dashes */}
          <line
            x1={BUS_X1} y1={BUS_Y} x2={BUS_X2} y2={BUS_Y}
            stroke={genKw > 0.1 ? "#F5A623" : "#516F75"}
            strokeWidth="3"
            strokeLinecap="round"
            className={genKw > 0.05 ? "dc-dash" : undefined}
          />
          {/* Bus label */}
          <text
            x={(BUS_X1 + BUS_X2) / 2} y={BUS_Y - 8}
            textAnchor="middle" fill="#516F75" fontSize="11" fontWeight="500"
          >
            DC Micro-Bus · {(genKw * 0.82).toFixed(1)} kWh/h
          </text>
          {/* Vertical drops from canopy down to bus */}
          <line x1={CANOPY_X + CANOPY_W / 2} y1={CANOPY_Y + CANOPY_H}
            x2={BUS_X1} y2={BUS_Y}
            stroke="#264F54" strokeWidth="2.5" />
          {/* Vertical drop from bus to hub */}
          <line x1={BUS_X2} y1={BUS_Y}
            x2={HUB_X} y2={HUB_Y + 20}
            stroke="#264F54" strokeWidth="2.5" />
        </g>

        {/* ── Hub Box ── */}
        <g filter={isDark ? "url(#hubGlow)" : undefined}>
          {/* Hub background */}
          <rect
            x={HUB_X} y={HUB_Y} width={HUB_W} height={HUB_H}
            rx="8" fill="#0F3A40" stroke="#264F54" strokeWidth="2"
          />

          {/* Hub title */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + 16}
            textAnchor="middle" fill="#93B8BC" fontSize="11" fontWeight="700">
            MICRO-HUB
          </text>

          {/* Battery container */}
          <rect
            x={HUB_X + 12} y={HUB_Y + 22} width={HUB_W - 24} height={HUB_H - 40}
            rx="4" fill="#0A1F23" stroke="#1C484F" strokeWidth="1"
          />
          {/* Battery fill */}
          <rect
            x={HUB_X + 13} y={battFillY}
            width={HUB_W - 26} height={battFillH}
            rx="3" fill="url(#battGrad)"
            style={{ transition: "y 600ms ease, height 600ms ease" }}
          />
          {/* Battery % label */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + 22 + (HUB_H - 40) / 2 + 5}
            textAnchor="middle" fill="#F1F5F4" fontSize="18" fontWeight="800" fontFamily="monospace">
            {Math.round(soc * 100)}%
          </text>
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + 22 + (HUB_H - 40) / 2 + 20}
            textAnchor="middle" fill="#93B8BC" fontSize="10">
            20 kWh LiFePO4
          </text>

          {/* Snowflake icon (cold storage pulsing) */}
          <text
            x={HUB_X + HUB_W / 2} y={HUB_Y + HUB_H - 18}
            textAnchor="middle" fontSize="16"
            fill={last?.storageKw ? "#93C6E8" : "#264F54"}
            className={last?.storageKw ? "snowflake-pulse" : undefined}
          >
            ❄
          </text>

          {/* Inverter label */}
          <text x={HUB_X + HUB_W / 2} y={HUB_Y + HUB_H - 5}
            textAnchor="middle" fill="#516F75" fontSize="10" fontWeight="500">
            Inverter
          </text>
        </g>

        {/* ── Grid Pylon + Line ── */}
        <g opacity={sceneOpacity}>
          {/* Pylon tower */}
          <line x1={PYLON_X} y1={PYLON_GRID_Y - 30} x2={PYLON_X} y2={PYLON_GRID_Y + 60}
            stroke="#516F75" strokeWidth="4" strokeLinecap="round" />
          <line x1={PYLON_X - 18} y1={PYLON_GRID_Y - 10} x2={PYLON_X + 18} y2={PYLON_GRID_Y - 10}
            stroke="#516F75" strokeWidth="3" strokeLinecap="round" />
          <line x1={PYLON_X - 14} y1={PYLON_GRID_Y + 10} x2={PYLON_X + 14} y2={PYLON_GRID_Y + 10}
            stroke="#516F75" strokeWidth="3" strokeLinecap="round" />
          {/* Ground */}
          <line x1={PYLON_X - 14} y1={PYLON_GRID_Y + 60} x2={PYLON_X + 14} y2={PYLON_GRID_Y + 60}
            stroke="#516F75" strokeWidth="3" />
          <line x1={PYLON_X - 8} y1={PYLON_GRID_Y + 66} x2={PYLON_X + 8} y2={PYLON_GRID_Y + 66}
            stroke="#516F75" strokeWidth="2" opacity="0.5" />

          {/* Connecting line: hub → pylon */}
          <line
            x1={HUB_X + HUB_W} y1={HUB_Y + HUB_H / 2}
            x2={PYLON_X} y2={PYLON_GRID_Y}
            stroke={gridLineColor} strokeWidth="3.5" strokeLinecap="round"
            className={!gridLive ? undefined : (soldKwh > 0 || gridImportKwh > 0) ? "grid-line-anim" : undefined}
            strokeDasharray={(!gridLive || soldKwh > 0 || gridImportKwh > 0) ? "10 10" : undefined}
          />

          {/* Broken-X overlay when blackout */}
          {!gridLive && (() => {
            const midX = (HUB_X + HUB_W + PYLON_X) / 2;
            const midY = (HUB_Y + HUB_H / 2 + PYLON_GRID_Y) / 2;
            return (
              <g>
                <line x1={midX - 10} y1={midY - 10} x2={midX + 10} y2={midY + 10}
                  stroke="#D4533B" strokeWidth="4" strokeLinecap="round" />
                <line x1={midX + 10} y1={midY - 10} x2={midX - 10} y2={midY + 10}
                  stroke="#D4533B" strokeWidth="4" strokeLinecap="round" />
              </g>
            );
          })()}

          {/* Direction label */}
          <text
            x={(HUB_X + HUB_W + PYLON_X) / 2} y={HUB_Y + HUB_H / 2 + (PYLON_GRID_Y - HUB_Y - HUB_H / 2) / 2 - 10}
            textAnchor="middle" fontSize="10" fontWeight="600"
            fill={!gridLive ? "#D4533B" : soldKwh > 0 ? "#1F8A5B" : gridImportKwh > 0 ? "#D4533B" : "#516F75"}
          >
            {!gridLive ? "DISCONNECTED" : soldKwh > 0 ? "▶ Selling" : gridImportKwh > 0 ? "◀ Importing" : "Standby"}
          </text>

          {/* Pylon label */}
          <text x={PYLON_X} y={PYLON_GRID_Y + 78}
            textAnchor="middle" fill="#516F75" fontSize="11" fontWeight="500">
            Grid
          </text>
        </g>

        {/* ── Caption Chip ── */}
        <g>
          <rect
            x={VB_W / 2 - 250} y={VB_H - 38}
            width={500} height={30}
            rx="15" fill={isDark ? "rgba(10,31,35,0.92)" : "rgba(15,58,64,0.88)"}
            stroke={isDark ? "#F5A623" : "#264F54"} strokeWidth="1.5"
          />
          <text
            x={VB_W / 2} y={VB_H - 18}
            textAnchor="middle" fill={isDark ? "#F5A623" : "#F1F5F4"}
            fontSize="14" fontWeight="700"
          >
            {caption}
          </text>
        </g>

        {/* ── Clock chip top-left ── */}
        <g>
          <rect x={8} y={8} width={70} height={22} rx="11"
            fill="rgba(10,31,35,0.75)" stroke="#264F54" strokeWidth="1" />
          <text x={43} y={22} textAnchor="middle" fill="#F1F5F4"
            fontSize="13" fontWeight="700" fontFamily="monospace">
            {fmtClock(state.hour)}
          </text>
        </g>

        {/* ── Ambient temp chip ── */}
        <g>
          <rect x={86} y={8} width={88} height={22} rx="11"
            fill="rgba(10,31,35,0.75)" stroke="#264F54" strokeWidth="1" />
          <text x={130} y={22} textAnchor="middle"
            fill={last?.hot ? "#F5A623" : "#93B8BC"}
            fontSize="13" fontWeight="700">
            {last ? `${last.ambient.toFixed(0)}°C` : "--"} {last?.hot ? "🌡" : ""}
          </text>
        </g>
      </svg>
    </div>
  );
}
