"use client";

import React from "react";
import { useSim } from "@/lib/sim-context";
import { fmtRuntime } from "@/lib/engine";
import {
  Flame,
  Snowflake,
  Coins,
  CheckCircle2,
  Play,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function StoryOverlay() {
  const { state, story, storyMetrics } = useSim();

  const handleDismiss = () => {
    story.resetSummary();
  };

  const handleReplay = () => {
    story.start();
  };

  return (
    <>
      {/* ── 1. Active Scene Chip at Top of Map Card ── */}
      {story.isPlaying && story.currentScene && (
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#081C20]/90 backdrop-blur-md border border-amber/50 shadow-lg text-white">
            <span className="w-2 h-2 rounded-full bg-amber animate-ping" />
            <span className="font-serif font-bold text-xs sm:text-sm text-amber tracking-wide">
              Scene {story.currentScene.sceneNumber} of 5 — {story.currentScene.name}
            </span>
            <span className="hidden sm:inline text-xs text-[#93B8BC]">|</span>
            <span className="hidden sm:inline text-xs text-[#E3F2F4] font-medium">
              {story.currentScene.caption}
            </span>
          </div>
          {/* Mobile/small-screen caption line */}
          <div className="sm:hidden mt-1 px-3 py-0.5 rounded-full bg-[#081C20]/80 text-[11px] text-[#E3F2F4] font-medium border border-border/40">
            {story.currentScene.caption}
          </div>
        </div>
      )}

      {/* ── 2. Full-Screen Centered End-Summary Modal ── */}
      {story.isCompleted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Story Impact Summary"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
        >
          <div className="max-w-5xl w-full bg-[#07191D] border border-[#1E454E] rounded-2xl shadow-2xl p-6 sm:p-7 flex flex-col justify-between text-[#F1F5F4] animate-in zoom-in-95 duration-200 relative">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#1A3840] pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-green/20 text-green border border-green/40 text-xs font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    90-Second Demo Complete
                  </span>
                  <span className="text-xs font-mono text-[#8FAAB0]">
                    Real Simulation Telemetry
                  </span>
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">
                  The Solar Shade Grid — Impact Summary
                </h2>
                <p className="text-xs sm:text-sm text-[#8FAAB0] mt-1">
                  Empirical digital twin results verified across normal generation, heatwave cooling, and municipal blackout.
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="text-[#8FAAB0] hover:text-white p-1.5 rounded-lg hover:bg-[#16363E] transition-colors cursor-pointer"
                title="Close summary"
                aria-label="Close summary modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* The 3 Core Pillars with Live Recorded Data */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 my-4">
              {/* Pillar 1: Cooler markets */}
              <div className="p-4 rounded-xl bg-[#0F2D33] border border-[#1E454E] flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber font-mono">
                      Pillar 1
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-amber/20 text-amber flex items-center justify-center">
                      <Flame className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-serif text-base font-bold text-white mb-1">
                    Cooler Markets
                  </h3>
                  <div className="font-mono text-lg font-bold text-amber mb-2 leading-tight">
                    ambient {storyMetrics.heatwaveAmbient.toFixed(0)}°C vs stalls {storyMetrics.heatwaveAvgStallTemp.toFixed(1)}°C
                  </div>
                </div>
                <p className="text-xs text-[#A6C5CB] leading-relaxed">
                  During peak heatwave conditions, automated canopy misting and continuous shading protected vendor alleyways, reducing thermal stress.
                </p>
              </div>

              {/* Pillar 2: Safer produce */}
              <div className="p-4 rounded-xl bg-[#0F2D33] border border-[#1E454E] flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#5EB1BF] font-mono">
                      Pillar 2
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-[#5EB1BF]/20 text-[#5EB1BF] flex items-center justify-center">
                      <Snowflake className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-serif text-base font-bold text-white mb-1">
                    Safer Produce
                  </h3>
                  <div className="font-mono text-lg font-bold text-[#5EB1BF] mb-2 leading-tight">
                    Battery carried the market for {fmtRuntime(storyMetrics.blackoutStartRuntimeH)}, lowest battery {Math.round(storyMetrics.blackoutLowestSoc * 100)}%
                  </div>
                </div>
                <p className="text-xs text-[#A6C5CB] leading-relaxed">
                  Communal LiFePO4 battery sustained communal cold storage and essential safety lights uninterrupted without grid dependency.
                </p>
              </div>

              {/* Pillar 3: Shared income */}
              <div className="p-4 rounded-xl bg-[#0F2D33] border border-[#1E454E] flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-green font-mono">
                      Pillar 3
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-green/20 text-green flex items-center justify-center">
                      <Coins className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-serif text-base font-bold text-white mb-1">
                    Shared Income
                  </h3>
                  <div className="font-mono text-lg font-bold text-green mb-2 leading-tight">
                    Rs {Math.round(storyMetrics.totalPayoutRs)} paid into 8 co-op wallets from {storyMetrics.totalSoldKwh.toFixed(1)} kWh
                  </div>
                </div>
                <p className="text-xs text-[#A6C5CB] leading-relaxed">
                  Surplus clean solar power exported to the municipal grid, converting decentralized rooftop shade into communal vendor wealth.
                </p>
              </div>
            </div>

            {/* Live Recorded Totals Bar */}
            <div className="px-4 py-2.5 rounded-xl bg-[#0B2126] border border-[#183B43] flex items-center justify-between text-xs sm:text-sm font-mono text-[#8FAAB0]">
              <div>
                <span>Total Clean Generation: </span>
                <strong className="text-white font-bold">{storyMetrics.totalGenKwh.toFixed(1)} kWh</strong>
              </div>
              <div>
                <span>Surplus Sold: </span>
                <strong className="text-white font-bold">{storyMetrics.totalSoldKwh.toFixed(1)} kWh</strong>
              </div>
              <div>
                <span>Co-Op Dividend: </span>
                <strong className="text-green font-bold">₹{Math.round(storyMetrics.totalPayoutRs)}</strong>
              </div>
              <div>
                <span>Protected Vendors: </span>
                <strong className="text-white font-bold">{state.stalls.length} Stalls</strong>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1A3840] mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                className="border-[#264F54] text-[#E3F2F4] hover:bg-[#16363E] text-xs font-semibold gap-1.5 h-9 px-4"
              >
                <span>Close</span>
              </Button>
              <Button
                size="sm"
                onClick={handleReplay}
                className="bg-amber text-ink hover:bg-amber/90 text-xs font-bold gap-2 h-9 px-5 shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Replay story</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
