"use client";

import React from "react";
import {
  Sun,
  Flame,
  ZapOff,
  Bell,
  Play,
  Square,
  Pause,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSim } from "@/lib/sim-context";

export interface SidebarProps {
  currentMode?: "normal" | "heatwave" | "blackout";
  speed?: number; // 1, 2, or 4
  storyProgress?: number; // 0..100
  isPlayingStory?: boolean;
  onModeSelect?: (mode: "normal" | "heatwave" | "blackout") => void;
  onDispatchAlert?: () => void;
  onSpeedChange?: (speed: number) => void;
  onReset?: () => void;
  onToggleStory?: () => void;
}

export function Sidebar(props: SidebarProps) {
  const sim = useSim();

  const currentMode = props.currentMode ?? sim.mode;
  const speed = props.speed ?? sim.speed;
  const storyProgress = props.storyProgress ?? sim.story.progress;
  const isPlayingStory = props.isPlayingStory ?? sim.story.isPlaying;

  const handleNormal = () => {
    if (props.onModeSelect) {
      props.onModeSelect("normal");
    } else {
      sim.setBlackout(false);
      sim.setHeatwave(false);
      sim.jumpToHour(9);
    }
  };

  const handleHeatwave = () => {
    if (props.onModeSelect) {
      props.onModeSelect("heatwave");
    } else {
      sim.setBlackout(false);
      sim.setHeatwave(true);
      sim.jumpToHour(12);
    }
  };

  const handleBlackout = () => {
    if (props.onModeSelect) {
      props.onModeSelect("blackout");
    } else {
      sim.setBlackout(true);
      sim.jumpToHour(18);
    }
  };

  const handleSpeed = (s: number) => {
    if (props.onSpeedChange) {
      props.onSpeedChange(s);
    } else {
      sim.setSpeed(s);
    }
  };

  const handleReset = () => {
    if (props.onReset) {
      props.onReset();
    } else {
      sim.reset();
    }
  };

  const handleDispatchAlert = () => {
    if (props.onDispatchAlert) {
      props.onDispatchAlert();
    } else {
      sim.dispatchAlert();
    }
  };

  const handleToggleStory = () => {
    if (props.onToggleStory) {
      props.onToggleStory();
    } else {
      if (isPlayingStory) {
        sim.story.stop();
      } else {
        sim.story.start();
      }
    }
  };

  return (
    <aside className="w-[260px] shrink-0 border-r border-border bg-card/60 backdrop-blur flex flex-col justify-between p-3.5 select-none transition-colors duration-700 overflow-y-auto">
      <div className="flex flex-col gap-5">
        {/* Scenario Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Scenarios
            </span>
            <span className="text-[10px] text-muted-foreground">Presets</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Button
              variant={currentMode === "normal" ? "default" : "outline"}
              className={`w-full justify-start gap-2 h-9 text-xs font-semibold ${
                currentMode === "normal"
                  ? "bg-teal text-paper hover:bg-teal/90"
                  : ""
              }`}
              onClick={handleNormal}
            >
              <Sun className="w-3.5 h-3.5 text-amber" />
              <span>Normal Grid</span>
            </Button>

            <Button
              variant={currentMode === "heatwave" ? "default" : "outline"}
              className={`w-full justify-start gap-2 h-9 text-xs font-semibold ${
                currentMode === "heatwave"
                  ? "bg-amber text-ink hover:bg-amber/90"
                  : ""
              }`}
              onClick={handleHeatwave}
            >
              <Flame className="w-3.5 h-3.5 text-amber" />
              <span>Heatwave Peak (46°C)</span>
            </Button>

            <Button
              variant={currentMode === "blackout" ? "default" : "outline"}
              className={`w-full justify-start gap-2 h-9 text-xs font-semibold ${
                currentMode === "blackout"
                  ? "bg-red text-white hover:bg-red/90"
                  : ""
              }`}
              onClick={handleBlackout}
            >
              <ZapOff className="w-3.5 h-3.5 text-red" />
              <span>Simulate Blackout</span>
            </Button>
          </div>
        </div>

        {/* Dispatch Alert */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Emergency Dispatch
          </span>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-9 text-xs font-semibold border-blue/40 text-blue hover:bg-blue/10 dark:text-blue dark:border-blue/50"
            onClick={handleDispatchAlert}
          >
            <Bell className="w-3.5 h-3.5 text-blue" />
            <span>Dispatch SMS Alert</span>
          </Button>
        </div>

        {/* Speed Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Sim Speed
            </span>
            <span className="font-mono text-xs font-bold text-foreground">
              {speed}x
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-secondary/80 border border-border">
            {([1, 2, 4] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSpeed(s)}
                className={`py-1 text-xs font-bold rounded-md transition-all ${
                  speed === s
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => (sim.playing ? sim.pause() : sim.play())}
            >
              {sim.playing ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Play</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Story Mode Playback (Bottom of Sidebar) */}
      <div className="mt-4 pt-3.5 border-t border-border flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              Judge Story
            </span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">
            3:00 Demo
          </span>
        </div>

        {/* Big Play/Stop 3-minute story button */}
        {isPlayingStory ? (
          <Button
            onClick={handleToggleStory}
            className="w-full h-11 bg-red text-white hover:bg-red/90 font-bold text-xs tracking-wide shadow-sm flex items-center justify-center gap-2 rounded-xl transition-transform active:scale-[0.98]"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Stop Story</span>
          </Button>
        ) : (
          <Button
            onClick={handleToggleStory}
            className="w-full h-11 bg-amber text-ink hover:bg-amber/90 font-bold text-xs tracking-wide shadow-sm flex items-center justify-center gap-2 rounded-xl transition-transform active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Play 3-Minute Story</span>
          </Button>
        )}

        {/* Progress Bar */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>Timeline</span>
            <span>{Math.round(storyProgress)}%</span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-amber transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, storyProgress))}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
