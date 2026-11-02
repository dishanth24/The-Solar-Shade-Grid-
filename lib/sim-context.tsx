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

// Metrics start empty. They are only filled by real values recorded while the story runs.
const EMPTY_METRICS: StoryMetrics = {
  heatwaveAmbient: 0,
  heatwaveAvgStallTemp: 0,
  blackoutStartRuntimeH: null,
  blackoutLowestSoc: 1,
  totalGenKwh: 0,
  totalSoldKwh: 0,
  totalPayoutRs: 0,
};

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

  // FIX: the latest state lives in a ref too. Timers and the story timeline read the ref,
  // so they always see the CURRENT battery / grid status (not the values from when they started),
  // and side effects no longer run inside a React state updater (which React runs twice in dev).
  const stateRef = useRef<GridState>(state);
  const commit = useCallback((next: GridState) => {
    stateRef.current = next;
    setState(next);
  }, []);

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
        text: templateLog(first.last!, true).replace(/^\[\d{1,2}:\d{2}\]\s*/, ""),
        source: "RULE",
        rawSource: "template",
      },
    ];
  });
  const [lastLogSource, setLastLogSource] = useState<"gemini" | "template">("template");
  const lastApiCallRef = useRef<number>(0);
  const hadFirstPayoutRef = useRef<boolean>(false);
  // FIX: remember the previous heatwave / grid flags so "heatwave starts" and "blackout starts" events really fire.
  const heatSeenRef = useRef<boolean>(false);
  const gridSeenRef = useRef<boolean>(true);

  const appendLog = useCallback((entry: LogEntry) => {
    // FIX: templateLog() already starts with "[HH:MM] " and the terminal prints the time itself,
    // so strip that prefix to avoid showing the time twice.
    const cleaned: LogEntry = {
      ...entry,
      text: entry.text.replace(/^\[\d{1,2}:\d{2}\]\s*/, ""),
    };
    setLogs((prev) => {
      const next = [...prev, cleaned];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
    setLastLogSource(cleaned.rawSource);
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
  const storyPlayingRef = useRef<boolean>(false);
  const [currentScene, setCurrentScene] = useState<StoryScene | null>(null);
  const [storyProgress, setStoryProgress] = useState<number>(0);
  const [storyCompleted, setStoryCompleted] = useState<boolean>(false);
  const storyHandleRef = useRef<StoryTimelineHandle | null>(null);

  const [storyMetrics, setStoryMetrics] = useState<StoryMetrics>(EMPTY_METRICS);
  const storyMetricsRef = useRef<StoryMetrics>({ ...EMPTY_METRICS });
  const hwStallSumRef = useRef<number>(0);
  const hwStallCountRef = useRef<number>(0);

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
      const prev = stateRef.current;
      const prevShedding = prev.last?.shedding ?? false;

      const next = tick(prev, 0.25);
      commit(next);

      const r = next.last;
      if (!r) return;

      setTotalGenKwh((t) => t + r.eGen);
      setTotalSoldKwh((t) => t + r.soldKwh);

      // Log events: heatwave starts, blackout starts, shedding starts, first payout (one log line per tick at most)
      let fire = false;
      if (next.heatwave && !heatSeenRef.current) fire = true;
      if (!next.gridLive && gridSeenRef.current) fire = true;
      if (!prevShedding && r.shedding) fire = true;
      if (!hadFirstPayoutRef.current && r.payout > 0) {
        hadFirstPayoutRef.current = true;
        fire = true;
      }
      heatSeenRef.current = next.heatwave;
      gridSeenRef.current = next.gridLive;
      if (fire) triggerLogEvent(r, next.gridLive, modeOf(next));

      // Record real story metrics while the story is playing
      if (storyPlayingRef.current) {
        const m = storyMetricsRef.current;
        m.totalGenKwh += r.eGen;
        m.totalSoldKwh += r.soldKwh;
        m.totalPayoutRs += r.payout;

        // Heatwave scene: peak ambient and the average stall temperature across the scene
        if (next.heatwave && next.gridLive) {
          m.heatwaveAmbient = Math.max(m.heatwaveAmbient, r.ambient);
          const avgStall =
            next.stalls.reduce((acc, s) => acc + s.temp, 0) / next.stalls.length;
          hwStallSumRef.current += avgStall;
          hwStallCountRef.current += 1;
          m.heatwaveAvgStallTemp = hwStallSumRef.current / hwStallCountRef.current;
        }

        // Blackout scene: runtime at the start and lowest battery reached
        if (!next.gridLive) {
          if (m.blackoutStartRuntimeH === null && r.runtimeH !== null) {
            m.blackoutStartRuntimeH = r.runtimeH;
          }
          m.blackoutLowestSoc = Math.min(m.blackoutLowestSoc, next.soc);
        }
      }

      setHistory((prevHistory) => {
        const updated = [...prevHistory, r];
        return updated.length > 48 ? updated.slice(updated.length - 48) : updated;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playing, speed, triggerLogEvent, commit]);

  const setHeatwave = useCallback(
    (heatwave: boolean) => {
      commit({ ...stateRef.current, heatwave });
    },
    [commit]
  );

  const setBlackout = useCallback(
    (blackout: boolean) => {
      commit({ ...stateRef.current, gridLive: !blackout });
    },
    [commit]
  );

  const jumpToHour = useCallback(
    (hour: number) => {
      commit({ ...stateRef.current, hour: ((hour % 24) + 24) % 24 });
    },
    [commit]
  );

  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => setPlaying(true), []);

  const reset = useCallback(() => {
    const init = createInitialState(9, 0.7);
    const first = tick(init, 0.25);
    const starting = { ...first, hour: 9 };
    hadFirstPayoutRef.current = false;
    heatSeenRef.current = false;
    gridSeenRef.current = true;
    lastApiCallRef.current = 0;
    commit(starting);
    setHistory(starting.last ? [starting.last] : []);
    setTotalGenKwh(starting.last ? starting.last.eGen : 0);
    setTotalSoldKwh(starting.last ? starting.last.soldKwh : 0);
    setSpeed(1);
    setPlaying(true);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, [commit]);

  // Hook for Gemini scene (Scene 4) in the story. Reads the CURRENT state from the ref.
  const onGeminiScene = useCallback(() => {
    const s = stateRef.current;
    if (s.last) {
      triggerLogEvent(s.last, s.gridLive, modeOf(s), true);
    }
  }, [triggerLogEvent]);

  // Dispatch alert implementation: POST /api/sms. Reads the CURRENT state from the ref.
  const dispatchAlert = useCallback(async (customText?: string) => {
    const s = stateRef.current;
    const socPct = Math.round(s.soc * 100);
    const gridLive = s.gridLive;
    const runtimeStr = fmtRuntime(s.last?.runtimeH ?? null);
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
  }, []);

  const closeSmsPreview = useCallback(() => {
    setSmsPreview((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Story controls
  const stopStory = useCallback(() => {
    if (storyHandleRef.current) {
      storyHandleRef.current.stop();
      storyHandleRef.current = null;
    }
    storyPlayingRef.current = false;
    setStoryPlaying(false);
    setCurrentScene(null);
  }, []);

  const startStory = useCallback(() => {
    if (storyHandleRef.current) {
      storyHandleRef.current.stop();
    }
    setStoryCompleted(false);
    storyPlayingRef.current = true;
    setStoryPlaying(true);
    setStoryProgress(0);

    // Initialize fresh metric tracking for this run (no hard-coded numbers)
    hwStallSumRef.current = 0;
    hwStallCountRef.current = 0;
    storyMetricsRef.current = { ...EMPTY_METRICS };
    setStoryMetrics({ ...storyMetricsRef.current });

    storyHandleRef.current = startStoryTimeline({
      onSceneChange: (scene) => {
        setCurrentScene(scene);
      },
      onProgress: (percent) => {
        setStoryProgress(percent);
      },
      onEnd: () => {
        storyPlayingRef.current = false;
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

  const mode = useMemo(() => modeOf(state), [state]);

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
