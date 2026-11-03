"use client";

import React, { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { MarketMap } from "@/components/MarketMap";
import { Market3DCanvas } from "@/components/digital-twin/Market3DCanvas";
import { ComponentInspector, SelectedComponent } from "@/components/ComponentInspector";
import { PowerChart } from "@/components/PowerChart";
import { StoryOverlay } from "@/components/StoryOverlay";
import { SmsPreview } from "@/components/SmsPreview";
import { LogTerminal } from "@/components/LogTerminal";
import { WeatherIntelligence } from "@/components/WeatherIntelligence";
import { ProduceFreshness } from "@/components/ProduceFreshness";
import { AiEnergyAnalyst } from "@/components/AiEnergyAnalyst";
import { VoiceNotificationCenter } from "@/components/VoiceNotificationCenter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSim } from "@/lib/sim-context";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  Activity,
  ShieldCheck,
  TrendingUp,
  CloudSun,
  Leaf,
  Bot,
  Box,
  MapPin,
  Mic,
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [selectedComponent, setSelectedComponent] = useState<SelectedComponent | null>(null);
  const { state } = useSim();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground transition-colors duration-700">
      {/* Top Bar (64 px) wired to useSim */}
      <TopBar />

      {/* Main Body: Left Sidebar (260 px) + Content Area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar />

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
                  <Activity className="w-3.5 h-3.5 mr-1.5 text-teal dark:text-cyan-400" />
                  3D Digital Twin
                </TabsTrigger>
                <TabsTrigger
                  value="produce"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <Leaf className="w-3.5 h-3.5 mr-1.5 text-green" />
                  Produce Freshness
                </TabsTrigger>
                <TabsTrigger
                  value="weather"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <CloudSun className="w-3.5 h-3.5 mr-1.5 text-teal dark:text-cyan-400" />
                  Weather Intelligence
                </TabsTrigger>
                <TabsTrigger
                  value="ai-analyst"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <Bot className="w-3.5 h-3.5 mr-1.5 text-teal dark:text-cyan-400" />
                  AI Energy Analyst
                </TabsTrigger>
                <TabsTrigger
                  value="voice"
                  className="text-xs font-semibold px-3 py-1 data-active:bg-card data-active:shadow-xs"
                >
                  <Mic className="w-3.5 h-3.5 mr-1.5 text-purple" />
                  Voice AI
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

            {/* TAB 1: 3D DIGITAL TWIN DASHBOARD */}
            <TabsContent
              value="dashboard"
              className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden mt-0 data-[state=inactive]:hidden"
            >
              {/* Upper Section: Centre Column + Right Column */}
              <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
                {/* Centre Column: Hero Twin Canvas + PowerChart */}
                <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
                  {/* Hero Canvas Card */}
                  <div className="relative flex-1 min-h-[300px] rounded-xl border border-border bg-card overflow-hidden shadow-xs transition-colors duration-700">
                    <StoryOverlay />

                    {/* View Switcher Pill */}
                    <div className="absolute top-3 right-3 z-20 flex items-center p-0.5 rounded-lg bg-card/85 backdrop-blur-md border border-border shadow-md">
                      <button
                        onClick={() => setViewMode("3d")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          viewMode === "3d"
                            ? "bg-teal text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Box className="w-3.5 h-3.5" />
                        <span>3D Twin</span>
                      </button>
                      <button
                        onClick={() => setViewMode("2d")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          viewMode === "2d"
                            ? "bg-teal text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>2D Map</span>
                      </button>
                    </div>

                    {/* 3D Canvas or 2D Schematic */}
                    {viewMode === "3d" ? (
                      <Market3DCanvas
                        onSelectComponent={setSelectedComponent}
                        selectedComponent={selectedComponent}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 bg-[#081C20]/20">
                        <MarketMap />
                      </div>
                    )}

                    {/* Component Inspector Dock */}
                    <ComponentInspector
                      selected={selectedComponent}
                      onClose={() => setSelectedComponent(null)}
                    />
                  </div>

                  {/* Centre Bottom: PowerChart */}
                  <div className="h-44 shrink-0 rounded-xl border border-border bg-card p-3 flex flex-col justify-between shadow-xs transition-colors duration-700">
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-teal dark:text-cyan-400" />
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
                          <span className="w-2.5 h-2.5 rounded-full bg-teal dark:bg-cyan-400 inline-block"></span>
                          Total Demand: {(state.last?.demandKw ?? 0).toFixed(1)} kW
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 w-full my-1">
                      <PowerChart />
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground shrink-0">
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
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                        <span className="inline-flex rounded-full h-1.5 w-1.5 bg-muted-foreground/60"></span>
                        <span>local</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-secondary text-foreground">
                        Pool: ₹<AnimatedNumber value={Math.round(state.coopPool)} />
                      </span>
                    </div>
                  </div>

                  {/* 8 Stall Cards in 2x4 Grid driven by useSim */}
                  <div className="flex-1 grid grid-cols-2 grid-rows-4 gap-1.5 min-h-0">
                    {state.stalls.map((stall, idx) => {
                      const statusColor =
                        stall.status === "ok"
                          ? "bg-green/10 text-green border-green/30"
                          : stall.status === "amber"
                          ? "bg-amber/15 text-amber border-amber/40"
                          : "bg-red/10 text-red border-red/40";

                      return (
                        <div
                          key={stall.id}
                          onClick={() =>
                            setSelectedComponent({
                              type: "stall",
                              id: `stall_${idx}`,
                              name: stall.name,
                              stallIndex: idx,
                            })
                          }
                          className="rounded-lg border border-border bg-card p-2 flex flex-col justify-between shadow-xs hover:border-teal/40 cursor-pointer transition-all min-h-0"
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

              {/* Lower Section: Bottom Strip Log Terminal */}
              <LogTerminal />
            </TabsContent>

            {/* TAB 2: PRODUCE FRESHNESS INTELLIGENCE */}
            <TabsContent
              value="produce"
              className="flex-1 min-h-0 overflow-hidden flex flex-col mt-0 data-[state=inactive]:hidden"
            >
              <ProduceFreshness />
            </TabsContent>

            {/* TAB 3: WEATHER INTELLIGENCE */}
            <TabsContent
              value="weather"
              className="flex-1 min-h-0 overflow-hidden flex flex-col mt-0 data-[state=inactive]:hidden"
            >
              <WeatherIntelligence />
            </TabsContent>

            {/* TAB 4: AI ENERGY ANALYST */}
            <TabsContent
              value="ai-analyst"
              className="flex-1 min-h-0 overflow-hidden flex flex-col mt-0 data-[state=inactive]:hidden"
            >
              <AiEnergyAnalyst />
            </TabsContent>

            {/* TAB: VOICE AI */}
            <TabsContent
              value="voice"
              className="flex-1 overflow-y-auto min-h-0 mt-0 data-[state=inactive]:hidden p-1"
            >
              <VoiceNotificationCenter />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Twilio SMS Preview Popup Modal */}
      <SmsPreview />
    </div>
  );
}
