"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  GridState,
  TickResult,
  createInitialState,
  tick,
  modeOf,
  fmtRuntime,
  fmtClock,
  templateLog,
  ambientTemp,
  Mode,
} from "./engine";
import {
  StoryScene,
  startStoryTimeline,
  StoryTimelineHandle,
} from "./story";

export interface SmsPreviewState {
  isOpen: boolean;
  text: string;
  sentViaTwilio: boolean;
}

export interface StoryMetrics {
  heatwaveAmbient: number;
  heatwaveAvgStallTemp: number;
  blackoutStartRuntimeH: number | null;
  blackoutLowestSoc: number;
  totalGenKwh: number;
  totalSoldKwh: number;
  totalPayoutRs: number;
}

export interface StoryState {
  isPlaying: boolean;
  currentScene: StoryScene | null;
  progress: number;
  isCompleted: boolean;
  metrics: StoryMetrics;
  start: () => void;
  stop: () => void;
  resetSummary: () => void;
}

export interface LogEntry {
  id: string;
  time: string;
  text: string;
  source: "AI" | "RULE";
  rawSource: "gemini" | "template";
}

export interface SimContextValue {
  state: GridState;
  history: TickResult[];
  mode: Mode;
  speed: number;
  playing: boolean;
  totalGenKwh: number;
  totalSoldKwh: number;
  storyMetrics: StoryMetrics;
  logs: LogEntry[];
  lastLogSource: "gemini" | "template";
  setHeatwave: (heatwave: boolean) => void;
  setBlackout: (blackout: boolean) => void;
  jumpToHour: (hour: number) => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  pause: () => void;
  play: () => void;
  setPlaying: (playing: boolean) => void;
  onGeminiScene: () => void;
  dispatchAlert: (customText?: string) => void;
  smsPreview: SmsPreviewState;
  closeSmsPreview: () => void;
  story: StoryState;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimProvider({ children }: { children: React.ReactNode }) {
  // Initialize state at 09:00, 70% SOC with an initial computed tick result
  const [state, setState] = useState<GridState>(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    return {
      ...first,
      hour: 9,
    };
  });

  const [history, setHistory] = useState<TickResult[]>(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    return first.last ? [first.last] : [];
  });

  const [speed, setSpeed] = useState<number>(1);
  const [playing, setPlaying] = useState<boolean>(true);
  const [totalGenKwh, setTotalGenKwh] = useState<number>(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    return first.last ? first.last.eGen : 0;
  });
  const [totalSoldKwh, setTotalSoldKwh] = useState<number>(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    return first.last ? first.last.soldKwh : 0;
  });

  // Logs state (max 50 lines) and last log source for terminal footer
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    return [
      {
        id: "init",
        time: fmtClock(9),
        text: templateLog(first.last!, true),
        source: "RULE",
        rawSource: "template",
      },
    ];
  });
  const [lastLogSource, setLastLogSource] = useState<"gemini" | "template">("template");
  const lastApiCallRef = useRef<number>(0);
  const hadFirstPayoutRef = useRef<boolean>(false);

  const appendLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
    setLastLogSource(entry.rawSource);
  }, []);

  // Event-driven API log triggering with 8-second rate limit
  const triggerLogEvent = useCallback(
    async (
      result: TickResult | null,
      gridLive: boolean,
      mode: string,
      forceApi: boolean = false
    ) => {
      if (!result) return;
      const now = Date.now();
      const timeSinceLastApi = now - lastApiCallRef.current;
      const timeStr = fmtClock(result.hour);

      if (forceApi || timeSinceLastApi >= 8000) {
        lastApiCallRef.current = now;
        try {
          const res = await fetch("/api/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ result, gridLive, mode }),
          });
          if (res.ok) {
            const data = await res.json();
            const isGemini = data.source === "gemini";
            appendLog({
              id: `${now}-${Math.random()}`,
              time: timeStr,
              text: data.text || templateLog(result, gridLive),
              source: isGemini ? "AI" : "RULE",
              rawSource: isGemini ? "gemini" : "template",
            });
            return;
          }
        } catch {
          // Fall through to fallback
        }
      }

      // Fallback rule log
      appendLog({
        id: `${now}-${Math.random()}`,
        time: timeStr,
        text: templateLog(result, gridLive),
        source: "RULE",
        rawSource: "template",
      });
    },
    [appendLog]
  );

  // SMS alert preview state
  const [smsPreview, setSmsPreview] = useState<SmsPreviewState>({
    isOpen: false,
    text: "",
    sentViaTwilio: false,
  });

  // Story state & real metrics recorded across the 90-second timeline
  const [storyPlaying, setStoryPlaying] = useState<boolean>(false);
  const [currentScene, setCurrentScene] = useState<StoryScene | null>(null);
  const [storyProgress, setStoryProgress] = useState<number>(0);
  const [storyCompleted, setStoryCompleted] = useState<boolean>(false);
  const storyHandleRef = useRef<StoryTimelineHandle | null>(null);

  const initialMetrics: StoryMetrics = useMemo(() => ({
    heatwaveAmbient: ambientTemp(12, true),
    heatwaveAvgStallTemp: 32.4,
    blackoutStartRuntimeH: 10.2,
    blackoutLowestSoc: 0.32,
    totalGenKwh: 0,
    totalSoldKwh: 0,
    totalPayoutRs: 0,
  }), []);

  const [storyMetrics, setStoryMetrics] = useState<StoryMetrics>(initialMetrics);
  const storyMetricsRef = useRef<StoryMetrics>({ ...initialMetrics });

  // Blackout toggles the 'dark' class on <html> with 700ms body transition (GEMINI.md rule 6)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!state.gridLive) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [state.gridLive]);

  // Simulation tick loop: interval = 1500ms / speed, dt = 0.25
  useEffect(() => {
    if (!playing) return;

    const intervalMs = Math.max(80, Math.round(1500 / speed));
    const timer = setInterval(() => {
      setState((prev) => {
        const prevHeatwave = prev.heatwave;
        const prevGridLive = prev.gridLive;
        const prevShedding = prev.last?.shedding ?? false;

        const next = tick(prev, 0.25);
        if (next.last) {
          setTotalGenKwh((t) => t + next.last!.eGen);
          setTotalSoldKwh((t) => t + next.last!.soldKwh);

          // Check events for logging:
          // 1. Heatwave starts
          if (!prevHeatwave && next.heatwave) {
            triggerLogEvent(next.last, next.gridLive, modeOf(next));
          }
          // 2. Blackout starts
          else if (prevGridLive && !next.gridLive) {
            triggerLogEvent(next.last, next.gridLive, modeOf(next));
          }
          // 3. Shedding starts
          else if (!prevShedding && next.last.shedding) {
            triggerLogEvent(next.last, next.gridLive, modeOf(next));
          }
          // 4. First payout
          else if (!hadFirstPayoutRef.current && next.last.payout > 0) {
            hadFirstPayoutRef.current = true;
            triggerLogEvent(next.last, next.gridLive, modeOf(next));
          }

          // Track story metrics dynamically while story is playing
          if (storyPlaying) {
            const m = storyMetricsRef.current;
            m.totalGenKwh += next.last.eGen;
            m.totalSoldKwh += next.last.soldKwh;
            m.totalPayoutRs += next.last.payout;

            // Heatwave peak metrics
            if (next.heatwave && next.gridLive) {
              if (next.last.ambient >= m.heatwaveAmbient) {
                m.heatwaveAmbient = next.last.ambient;
              }
              const avgStall =
                next.stalls.reduce((acc, s) => acc + s.temp, 0) /
                next.stalls.length;
              m.heatwaveAvgStallTemp = avgStall;
            }

            // Blackout scene metrics
            if (!next.gridLive) {
              if (m.blackoutStartRuntimeH === null && next.last.runtimeH !== null) {
                m.blackoutStartRuntimeH = next.last.runtimeH;
              }
              m.blackoutLowestSoc = Math.min(m.blackoutLowestSoc, next.soc);
            }
          }

          setHistory((prevHistory) => {
            const updated = [...prevHistory, next.last!];
            return updated.length > 48 ? updated.slice(updated.length - 48) : updated;
          });
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playing, speed, storyPlaying, triggerLogEvent]);

  const setHeatwave = useCallback((heatwave: boolean) => {
    setState((prev) => ({ ...prev, heatwave }));
  }, []);

  const setBlackout = useCallback((blackout: boolean) => {
    setState((prev) => ({ ...prev, gridLive: !blackout }));
  }, []);

  const jumpToHour = useCallback((hour: number) => {
    setState((prev) => ({
      ...prev,
      hour: ((hour % 24) + 24) % 24,
    }));
  }, []);

  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => setPlaying(true), []);

  const reset = useCallback(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    const starting = { ...first, hour: 9 };
    hadFirstPayoutRef.current = false;
    lastApiCallRef.current = 0;
    setState(starting);
    setHistory(starting.last ? [starting.last] : []);
    setTotalGenKwh(starting.last ? starting.last.eGen : 0);
    setTotalSoldKwh(starting.last ? starting.last.soldKwh : 0);
    setSpeed(1);
    setPlaying(true);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Hook for Gemini scene (Scene 4) in the story
  const onGeminiScene = useCallback(() => {
    if (state.last) {
      triggerLogEvent(state.last, state.gridLive, modeOf(state), true);
    }
  }, [state, triggerLogEvent]);

  // Dispatch alert implementation: POST /api/sms
  const dispatchAlert = useCallback(
    async (customText?: string) => {
      const socPct = Math.round(state.soc * 100);
      const gridLive = state.gridLive;
      const runtimeStr = fmtRuntime(state.last?.runtimeH ?? null);
      const defaultBody =
        customText ||
        `Solar Shade Grid: battery ${socPct}%, grid ${gridLive ? "LIVE" : "BLACKOUT"}${
          gridLive ? "" : `, runtime ${runtimeStr}`
        }.`;

      try {
        const res = await fetch("/api/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            soc: socPct,
            gridLive,
            runtime: runtimeStr,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSmsPreview({
            isOpen: true,
            text: data.body || defaultBody,
            sentViaTwilio: data.ok === true,
          });
          return;
        }
      } catch {
        // Network or server error
      }

      setSmsPreview({
        isOpen: true,
        text: defaultBody,
        sentViaTwilio: false,
      });
    },
    [state.soc, state.gridLive, state.last]
  );

  const closeSmsPreview = useCallback(() => {
    setSmsPreview((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Story controls
  const stopStory = useCallback(() => {
    if (storyHandleRef.current) {
      storyHandleRef.current.stop();
      storyHandleRef.current = null;
    }
    setStoryPlaying(false);
    setCurrentScene(null);
  }, []);

  const startStory = useCallback(() => {
    if (storyHandleRef.current) {
      storyHandleRef.current.stop();
    }
    setStoryCompleted(false);
    setStoryPlaying(true);
    setStoryProgress(0);

    // Initialize fresh metric tracking for this run
    storyMetricsRef.current = {
      heatwaveAmbient: ambientTemp(12, true),
      heatwaveAvgStallTemp: 32.4,
      blackoutStartRuntimeH: null,
      blackoutLowestSoc: 1.0,
      totalGenKwh: 0,
      totalSoldKwh: 0,
      totalPayoutRs: 0,
    };
    setStoryMetrics({ ...storyMetricsRef.current });

    storyHandleRef.current = startStoryTimeline({
      onSceneChange: (scene) => {
        setCurrentScene(scene);
      },
      onProgress: (percent) => {
        setStoryProgress(percent);
      },
      onEnd: () => {
        setStoryPlaying(false);
        setStoryCompleted(true);
        setCurrentScene(null);
        storyHandleRef.current = null;
        // Snapshot final recorded metrics
        setStoryMetrics({ ...storyMetricsRef.current });
      },
      reset,
      jumpToHour,
      setHeatwave,
      setBlackout,
      setSpeed,
      onGeminiScene,
      dispatchAlert,
    });
  }, [
    reset,
    jumpToHour,
    setHeatwave,
    setBlackout,
    setSpeed,
    onGeminiScene,
    dispatchAlert,
  ]);

  const resetSummary = useCallback(() => {
    setStoryCompleted(false);
  }, []);

  // Clean up story timer on unmount
  useEffect(() => {
    return () => {
      if (storyHandleRef.current) {
        storyHandleRef.current.stop();
      }
    };
  }, []);

  const mode = useMemo(() => modeOf(state), [state.gridLive, state.heatwave]);

  const story: StoryState = useMemo(
    () => ({
      isPlaying: storyPlaying,
      currentScene,
      progress: storyProgress,
      isCompleted: storyCompleted,
      metrics: storyMetrics,
      start: startStory,
      stop: stopStory,
      resetSummary,
    }),
    [
      storyPlaying,
      currentScene,
      storyProgress,
      storyCompleted,
      storyMetrics,
      startStory,
      stopStory,
      resetSummary,
    ]
  );

  const value: SimContextValue = useMemo(
    () => ({
      state,
      history,
      mode,
      speed,
      playing,
      totalGenKwh,
      totalSoldKwh,
      storyMetrics,
      logs,
      lastLogSource,
      setHeatwave,
      setBlackout,
      jumpToHour,
      reset,
      setSpeed,
      pause,
      play,
      setPlaying,
      onGeminiScene,
      dispatchAlert,
      smsPreview,
      closeSmsPreview,
      story,
    }),
    [
      state,
      history,
      mode,
      speed,
      playing,
      totalGenKwh,
      totalSoldKwh,
      storyMetrics,
      logs,
      lastLogSource,
      setHeatwave,
      setBlackout,
      jumpToHour,
      reset,
      pause,
      play,
      onGeminiScene,
      dispatchAlert,
      smsPreview,
      closeSmsPreview,
      story,
    ]
  );

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim(): SimContextValue {
  const context = useContext(SimContext);
  if (!context) {
    throw new Error("useSim must be used within a SimProvider");
  }
  return context;
}
