"use client";

import React, { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { MarketMap } from "@/components/MarketMap";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSim } from "@/lib/sim-context";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  Activity,
  Terminal,
  Layers,
  Calculator,
  ShieldCheck,
  SunMedium,
  TrendingUp,
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { state } = useSim();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground transition-colors duration-700">
      {/* Top Bar (64 px) wired to useSim */}
      <TopBar />

      {/* Main Body: Left Sidebar (260 px) + Content Area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          onDispatchAlert={() => alert("Dispatch Alert triggered (Twilio preview modal in P6)")}
          onToggleStory={() => alert("3-minute story mode will be activated in P5")}
        />

        {/* Tabbed Content Area */}
        <main className="flex-1 flex flex-col p-2.5 overflow-hidden min-w-0 min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full flex flex-col min-h-0 overflow-hidden"
          >
            {/* Tabs Row */}
            <div className="shrink-0 flex items-center justify-between pb-1.5">
              <TabsList className="bg-secondary/70 p-0.5 h-8">
                <TabsTrigger
                  value="dashboard"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <Activity className="w-3.5 h-3.5 mr-1.5 text-teal dark:text-amber" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger
                  value="install"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <Layers className="w-3.5 h-3.5 mr-1.5 text-teal dark:text-amber" />
                  How it&apos;s installed
                </TabsTrigger>
                <TabsTrigger
                  value="math"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <Calculator className="w-3.5 h-3.5 mr-1.5 text-teal dark:text-amber" />
                  Live Math
                </TabsTrigger>
              </TabsList>

              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green inline-block animate-pulse"></span>
                <span>
                  Simulation Active • Hour {Math.floor(state.hour)}:
                  {String(Math.round((state.hour % 1) * 60)).padStart(2, "0")}
                </span>
              </div>
            </div>

            {/* TAB 1: DASHBOARD */}
            <TabsContent
              value="dashboard"
              className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden mt-0 data-[state=inactive]:hidden"
            >
              {/* Upper Section: Centre Column + Right Column */}
              <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
                {/* Centre Column: Top (MarketMap) + Bottom (PowerChart) */}
                <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
                  {/* Centre Top: MarketMap SVG (P3) — card shrinks to SVG aspect ratio */}
                  <div className="w-full rounded-xl border border-border bg-card overflow-hidden shadow-xs transition-colors duration-700 shrink-0">
                    <MarketMap />
                  </div>

                  {/* Centre Bottom: PowerChart Placeholder (flex-[2]) */}
                  <div className="flex-[2] min-h-0 rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-xs transition-colors duration-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-teal dark:text-amber" />
                        <h2 className="font-serif text-sm font-bold text-foreground">
                          Power Flow: Generation vs Demand
                        </h2>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Last 48 Ticks
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-medium">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber inline-block"></span>
                          Solar Gen: {(state.last?.genKw ?? 0).toFixed(1)} kW
                        </span>
                        <span className="flex items-center gap-1.5 text-foreground">
                          <span className="w-2.5 h-2.5 rounded-full bg-teal inline-block"></span>
                          Total Demand: {(state.last?.demandKw ?? 0).toFixed(1)} kW
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center border border-dashed border-border/80 rounded-lg bg-background/50 my-1 text-center">
                      <p className="text-xs text-muted-foreground font-mono">
                        Recharts AreaChart Placeholder (P4)
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                      <span>06:00 Sunrise</span>
                      <span>12:00 Peak Sun</span>
                      <span>18:00 Sunset</span>
                    </div>
                  </div>
                </div>

                {/* Right Column (340 px): Live Ledger Header + 8 Stall Cards (2x4 Grid) */}
                <div className="w-[340px] shrink-0 flex flex-col gap-1.5 min-h-0">
                  {/* Live Ledger Header */}
                  <div className="h-9 shrink-0 px-3 rounded-lg border border-border bg-card flex items-center justify-between shadow-xs transition-colors duration-700">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green" />
                      <h2 className="font-serif text-xs font-bold text-foreground tracking-tight">
                        Live Ledger
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-green">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green"></span>
                        </span>
                        <span>synced</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-secondary text-foreground">
                        Pool: ₹<AnimatedNumber value={Math.round(state.coopPool)} />
                      </span>
                    </div>
                  </div>

                  {/* 8 Stall Cards in 2x4 Grid driven by useSim */}
                  <div className="flex-1 grid grid-cols-2 grid-rows-4 gap-1.5 min-h-0">
                    {state.stalls.map((stall) => {
                      const statusColor =
                        stall.status === "ok"
                          ? "bg-green/10 text-green border-green/30"
                          : stall.status === "amber"
                          ? "bg-amber/15 text-amber border-amber/40"
                          : "bg-red/10 text-red border-red/40";

                      return (
                        <div
                          key={stall.id}
                          className="rounded-lg border border-border bg-card p-2 flex flex-col justify-between shadow-xs hover:border-teal/40 transition-all min-h-0"
                        >
                          <div className="flex items-center justify-between leading-none">
                            <span className="text-xs font-bold text-foreground truncate">
                              {stall.name}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase ${statusColor}`}
                            >
                              {stall.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[11px] font-mono leading-tight my-0.5">
                            <div>
                              <span className="text-[9px] text-muted-foreground block">Temp</span>
                              <span className="font-semibold text-foreground">
                                <AnimatedNumber
                                  value={stall.temp}
                                  decimals={1}
                                  suffix="°C"
                                />
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] text-muted-foreground block">Load</span>
                              <span className="font-semibold text-foreground">
                                {stall.loadKw.toFixed(2)} kW
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] border-t border-border/60 pt-0.5">
                            <span className="text-muted-foreground text-[9px]">Wallet</span>
                            <span className="font-mono font-bold text-teal dark:text-amber">
                              ₹<AnimatedNumber value={Math.round(stall.wallet)} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Lower Section: Bottom Strip (150 px) Log Terminal */}
              <div className="h-[150px] shrink-0 rounded-xl border border-border bg-[#0B1719] text-[#93B8BC] p-2.5 flex flex-col justify-between shadow-xs overflow-hidden font-mono">
                <div className="flex items-center justify-between border-b border-[#1A3035] pb-1.5 mb-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-amber" />
                    <span className="font-bold text-paper tracking-wider">
                      CO-OP TWIN TERMINAL LOGS
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#173B41] text-amber border border-amber/30">
                      [AI] + [RULE]
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Auto-scrolling • 12 ms typewriter effect
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 text-xs pr-1">
                  <div className="flex items-start gap-2">
                    <span className="text-green font-bold shrink-0">[RULE]</span>
                    <span className="text-muted-foreground shrink-0">
                      {Math.floor(state.hour)}:00
                    </span>
                    <span className="text-paper">
                      {state.gridLive
                        ? `Grid live. Canopy generating ${(state.last?.genKw ?? 0).toFixed(1)} kW. Cold storage active.`
                        : `BLACKOUT: Municipal grid disconnected. Battery supplying emergency loads.`}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber font-bold shrink-0">[AI]</span>
                    <span className="text-muted-foreground shrink-0">
                      {Math.floor(state.hour)}:00
                    </span>
                    <span className="text-[#D1E6E8]">
                      {state.heatwave
                        ? `Heatwave condition detected. Misting pumps engaged and cold storage boosted.`
                        : state.gridLive
                        ? `Normal morning balance: canopy covers vendor load and charges battery reserve.`
                        : `Emergency power conservation active. Safety lighting and produce preservation prioritized.`}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="text-blue font-bold shrink-0">[RULE]</span>
                    <span className="shrink-0">
                      {Math.floor(state.hour)}:15
                    </span>
                    <span>
                      Vendor tariffs synchronized across 8 stalls. Virtual credits ledger ready.
                    </span>
                  </div>
                </div>

                <div className="pt-1 border-t border-[#1A3035] flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Gemini Assistant + Deterministic Fallback Active</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse"></span>
                    Terminal Listening
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: HOW IT'S INSTALLED */}
            <TabsContent
              value="install"
              className="flex-1 rounded-xl border border-border bg-card p-6 shadow-xs min-h-0 overflow-y-auto data-[state=inactive]:hidden"
            >
              <div className="max-w-3xl mx-auto flex flex-col gap-6">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-foreground">
                    How The Solar Shade Grid Is Installed
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Five-step rapid deployment over existing market alleyways with zero ground disruption.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {[
                    { step: "1", title: "Frame Anchor", desc: "Modular lightweight steel canopy frame clamped to market stanchions" },
                    { step: "2", title: "Solar Canopy", desc: "12 kW bifacial solar panels creating continuous cooling shade" },
                    { step: "3", title: "DC Micro-Bus", desc: "Overhead DC trunk cable routing solar output directly to central hub" },
                    { step: "4", title: "Central Hub", desc: "20 kWh LiFePO4 battery, hybrid inverter, and communal cold storage unit" },
                    { step: "5", title: "Stall Plugs", desc: "Weatherproof smart metered vendor drops for misters, fans and lighting" },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="p-3.5 rounded-xl border border-border bg-secondary/30 flex flex-col gap-2"
                    >
                      <div className="w-6 h-6 rounded-full bg-teal text-paper font-mono text-xs font-bold flex items-center justify-center">
                        {item.step}
                      </div>
                      <h3 className="font-serif text-sm font-bold text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="p-6 rounded-xl border border-dashed border-border bg-secondary/20 flex flex-col items-center justify-center text-center">
                  <p className="text-xs font-mono text-muted-foreground">
                    Interactive SVG Stepper & Component Highlight Diagram (Implemented in P8)
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: LIVE MATH */}
            <TabsContent
              value="math"
              className="flex-1 rounded-xl border border-border bg-card p-6 shadow-xs min-h-0 overflow-y-auto data-[state=inactive]:hidden"
            >
              <div className="max-w-3xl mx-auto flex flex-col gap-6">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-foreground">
                    Twin Engine: Live Mathematical Validation
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pure, deterministic calculations driving every simulation tick.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-border bg-secondary/30 flex flex-col gap-2">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold">
                      Equation 1
                    </span>
                    <h3 className="font-serif text-sm font-bold text-foreground">
                      Solar Generation
                    </h3>
                    <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-xs text-teal dark:text-amber">
                      P_gen = P_cap × H_sun × η
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sun factor H_sun peaks at noon; η = 0.82 system efficiency factor.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-secondary/30 flex flex-col gap-2">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold">
                      Equation 2
                    </span>
                    <h3 className="font-serif text-sm font-bold text-foreground">
                      Energy Balance & Delta-E
                    </h3>
                    <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-xs text-teal dark:text-amber">
                      ΔE = E_avail - E_demand
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Governs load shedding: if ΔE &lt; 0 or grid is dead, non-critical loads shed.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-secondary/30 flex flex-col gap-2">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold">
                      Equation 3
                    </span>
                    <h3 className="font-serif text-sm font-bold text-foreground">
                      Battery State & Surplus
                    </h3>
                    <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-xs text-teal dark:text-amber">
                      Payout = E_sold × Tariff
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Surplus sold back only when battery SOC ≥ 80%. Virtual rupees split to vendors.
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-xl border border-dashed border-border bg-secondary/20 flex flex-col items-center justify-center text-center">
                  <p className="text-xs font-mono text-muted-foreground">
                    Live parameter substitution banner from state.last (Implemented in P8)
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
