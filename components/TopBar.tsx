"use client";

import React from "react";
import { Sun, Moon, Zap, Clock, Coins, SunMedium } from "lucide-react";

export interface TopBarProps {
  clock?: string;
  isDay?: boolean;
  gridLive?: boolean;
  batterySoc?: number; // 0..1, e.g. 0.70
  coopPool?: number; // rupees
  runtime?: string | null;
}

export function TopBar({
  clock = "09:00",
  isDay = true,
  gridLive = true,
  batterySoc = 0.7,
  coopPool = 0,
  runtime = null,
}: TopBarProps) {
  const socPercent = Math.round(batterySoc * 100);
  // SVG circle calculations for 28x28 ring: r=11, circumference = 2 * PI * 11 ≈ 69.1
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (socPercent / 100) * circumference;

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card/90 backdrop-blur px-4 flex items-center justify-between z-20 transition-colors duration-700">
      {/* Brand / Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal text-paper shadow-xs">
          <SunMedium className="w-5 h-5 text-amber" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-lg font-bold tracking-tight text-foreground leading-none">
              The Solar Shade Grid
            </h1>
            <span className="text-[10px] font-sans font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
              Digital Twin
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-none mt-1">
            Urban Canopy Micro-Utility & Virtual Ledger
          </p>
        </div>
      </div>

      {/* Status metrics & indicators */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Clock with Sun / Moon */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/70 border border-border">
          {isDay ? (
            <Sun className="w-4 h-4 text-amber" />
          ) : (
            <Moon className="w-4 h-4 text-blue" />
          )}
          <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
            {clock}
          </span>
        </div>

        {/* Grid Status Badge */}
        {gridLive ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-green/10 text-green border border-green/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green"></span>
            </span>
            <span>LIVE</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-red/15 text-red border border-red/40 animate-pulse">
            <span className="inline-flex rounded-full h-2 w-2 bg-red"></span>
            <span>BLACKOUT</span>
          </div>
        )}

        {/* Battery Ring % */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-secondary/70 border border-border">
          <div className="relative w-7 h-7 flex items-center justify-center">
            <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
              <circle
                cx="14"
                cy="14"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                className="text-muted"
              />
              <circle
                cx="14"
                cy="14"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={batterySoc > 0.25 ? "text-green" : "text-amber"}
              />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
              Battery
            </span>
            <span className="font-mono text-xs font-bold text-foreground leading-tight">
              {socPercent}%
            </span>
          </div>
        </div>

        {/* Co-op Pool */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/70 border border-border">
          <Coins className="w-4 h-4 text-amber" />
          <div className="flex flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
              Co-Op Pool
            </span>
            <span className="font-mono text-xs font-bold text-foreground leading-tight">
              ₹{coopPool.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Runtime Chip (only in blackout) */}
        {!gridLive && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber/15 text-amber border border-amber/30">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Runtime:{" "}
              <strong className="font-mono">{runtime || "sustained by solar"}</strong>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
