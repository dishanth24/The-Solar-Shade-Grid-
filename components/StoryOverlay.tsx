"use client";

import React from "react";
import { useSim } from "@/lib/sim-context";
import { fmtRuntime } from "@/lib/engine";
import {
  Sparkles,
  Flame,
  Snowflake,
  Coins,
  CheckCircle2,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function StoryOverlay() {
  const { state, story, totalGenKwh, totalSoldKwh, reset } = useSim();

  const handleReset = () => {
    story.resetSummary();
    reset();
  };

  const handleDismiss = () => {
    story.resetSummary();
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

      {/* ── 2. End-Summary Overlay (3:00 End) ── */}
      {story.isCompleted && (
        <div className="absolute inset-0 z-30 bg-[#07191D]/95 backdrop-blur-md rounded-xl p-4 sm:p-5 flex flex-col justify-between text-[#F1F5F4] animate-in fade-in duration-300 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[#1A3840] pb-2.5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green/20 text-green border border-green/40 text-[10px] font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" />
                  3-Minute Demo Complete
                </span>
                <span className="text-[11px] font-mono text-[#8FAAB0]">
                  5 Scenes Verified
                </span>
              </div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
                The Solar Shade Grid — Impact Summary
              </h2>
              <p className="text-xs text-[#8FAAB0] mt-0.5">
                Micro-utility performance validated across normal generation, heatwave cooling, and municipal blackout.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="text-[#8FAAB0] hover:text-white p-1 rounded-lg hover:bg-[#16363E] transition-colors cursor-pointer"
              title="Close summary overlay"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* The 3 Core Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 my-2">
            {/* Pillar 1: Cooler markets */}
            <div className="p-3 rounded-xl bg-[#0F2D33] border border-[#1E454E] flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber font-mono">
                  Pillar 1
                </span>
                <div className="w-6 h-6 rounded-lg bg-amber/20 text-amber flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5" />
                </div>
              </div>
              <h3 className="font-serif text-sm font-bold text-white">
                Cooler Markets
              </h3>
              <div className="font-mono text-base font-bold text-amber">
                46°C → 32°C Active Cooling
              </div>
              <p className="text-[11px] text-[#A6C5CB] leading-relaxed">
                Canopy shade & automated misting pumps protected produce and dropped ambient vendor temperatures by 14°C during peak noon heat.
              </p>
            </div>

            {/* Pillar 2: Safer produce */}
            <div className="p-3 rounded-xl bg-[#0F2D33] border border-[#1E454E] flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5EB1BF] font-mono">
                  Pillar 2
                </span>
                <div className="w-6 h-6 rounded-lg bg-[#5EB1BF]/20 text-[#5EB1BF] flex items-center justify-center">
                  <Snowflake className="w-3.5 h-3.5" />
                </div>
              </div>
              <h3 className="font-serif text-sm font-bold text-white">
                Safer Produce
              </h3>
              <div className="font-mono text-base font-bold text-[#5EB1BF]">
                {fmtRuntime(state.last?.runtimeH ?? null)} Runtime
              </div>
              <p className="text-[11px] text-[#A6C5CB] leading-relaxed">
                The 20 kWh LiFePO4 battery kept communal cold storage powered uninterrupted throughout the blackout, preventing perishable loss.
              </p>
            </div>

            {/* Pillar 3: Shared income */}
            <div className="p-3 rounded-xl bg-[#0F2D33] border border-[#1E454E] flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-green font-mono">
                  Pillar 3
                </span>
                <div className="w-6 h-6 rounded-lg bg-green/20 text-green flex items-center justify-center">
                  <Coins className="w-3.5 h-3.5" />
                </div>
              </div>
              <h3 className="font-serif text-sm font-bold text-white">
                Shared Income
              </h3>
              <div className="font-mono text-base font-bold text-green">
                ₹{Math.round(state.coopPool)} Virtual Credits
              </div>
              <p className="text-[11px] text-[#A6C5CB] leading-relaxed">
                {totalSoldKwh.toFixed(1)} kWh of clean surplus solar exported to the municipal grid, split equally across all 8 vendor co-op wallets.
              </p>
            </div>
          </div>

          {/* Running Totals Stats Strip */}
          <div className="px-3.5 py-2 rounded-lg bg-[#0B2126] border border-[#183B43] flex items-center justify-between text-xs font-mono text-[#8FAAB0]">
            <div>
              <span>Clean Generation: </span>
              <strong className="text-white font-bold">{totalGenKwh.toFixed(1)} kWh</strong>
            </div>
            <div>
              <span>Battery Reserve: </span>
              <strong className="text-white font-bold">{Math.round(state.soc * 100)}%</strong>
            </div>
            <div>
              <span>Active Vendors: </span>
              <strong className="text-white font-bold">8 Stalls Protected</strong>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#1A3840]">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="border-[#264F54] text-[#E3F2F4] hover:bg-[#16363E] text-xs font-semibold gap-1.5 h-8"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Sim</span>
            </Button>
            <Button
              size="sm"
              onClick={handleDismiss}
              className="bg-amber text-ink hover:bg-amber/90 text-xs font-bold gap-1.5 h-8 px-4"
            >
              <span>Explore Dashboard</span>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
