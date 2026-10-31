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

export interface SimContextValue {
  state: GridState;
  history: TickResult[];
  mode: Mode;
  speed: number;
  playing: boolean;
  totalGenKwh: number;
  totalSoldKwh: number;
  storyMetrics: StoryMetrics;
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

  // SMS alert preview state
  const [smsPreview, setSmsPreview] = useState<SmsPreviewState>({
    isOpen: false,
    text: "",
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
        const next = tick(prev, 0.25);
        if (next.last) {
          setTotalGenKwh((t) => t + next.last!.eGen);
          setTotalSoldKwh((t) => t + next.last!.soldKwh);

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
  }, [playing, speed, storyPlaying]);

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

  // Empty hook for Gemini scene (wired in P6)
  const onGeminiScene = useCallback(() => {
    // P6 will implement real /api/log call here; caption is updated in story scene
  }, []);

  // Dispatch alert implementation
  const dispatchAlert = useCallback(
    (customText?: string) => {
      const socPct = Math.round(state.soc * 100);
      const gridStr = state.gridLive ? "LIVE" : "BLACKOUT";
      const runtimeStr = fmtRuntime(state.last?.runtimeH ?? null);
      const text =
        customText ||
        `Solar Shade Grid: battery ${socPct}%, grid ${gridStr}, runtime ${runtimeStr}.`;
      setSmsPreview({ isOpen: true, text });
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
