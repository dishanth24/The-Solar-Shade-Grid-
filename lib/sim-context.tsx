"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  GridState,
  TickResult,
  createInitialState,
  tick,
  modeOf,
  Mode,
} from "./engine";

export interface SimContextValue {
  state: GridState;
  history: TickResult[];
  mode: Mode;
  speed: number;
  playing: boolean;
  setHeatwave: (heatwave: boolean) => void;
  setBlackout: (blackout: boolean) => void;
  jumpToHour: (hour: number) => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  pause: () => void;
  play: () => void;
  setPlaying: (playing: boolean) => void;
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
          setHistory((prevHistory) => {
            const updated = [...prevHistory, next.last!];
            return updated.length > 48 ? updated.slice(updated.length - 48) : updated;
          });
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playing, speed]);

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
    setSpeed(1);
    setPlaying(true);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const mode = useMemo(() => modeOf(state), [state.gridLive, state.heatwave]);

  const value: SimContextValue = useMemo(
    () => ({
      state,
      history,
      mode,
      speed,
      playing,
      setHeatwave,
      setBlackout,
      jumpToHour,
      reset,
      setSpeed,
      pause,
      play,
      setPlaying,
    }),
    [
      state,
      history,
      mode,
      speed,
      playing,
      setHeatwave,
      setBlackout,
      jumpToHour,
      reset,
      pause,
      play,
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
