"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { useSim, LogEntry } from "@/lib/sim-context";

export function LogTerminal() {
  const { logs, lastLogSource } = useSim();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Typing effect state for the latest log entry
  const [typedChars, setTypedChars] = useState<number>(0);
  const activeLogIdRef = useRef<string | null>(null);

  const latestLog: LogEntry | undefined = logs[logs.length - 1];

  // Reset or run typewriter effect whenever a new log entry arrives
  useEffect(() => {
    if (!latestLog) return;

    if (activeLogIdRef.current !== latestLog.id) {
      activeLogIdRef.current = latestLog.id;
      setTypedChars(0);
    }

    const fullLength = latestLog.text.length;
    if (typedChars >= fullLength) return;

    const timer = setTimeout(() => {
      setTypedChars((prev) => Math.min(fullLength, prev + 1));
    }, 12); // ~12ms per character typing effect

    return () => clearTimeout(timer);
  }, [latestLog, typedChars]);

  // Auto-scroll to bottom whenever logs change or new characters are typed
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, typedChars]);

  return (
    <div className="h-[150px] shrink-0 rounded-xl border border-border bg-[#0B1719] text-[#93B8BC] p-2.5 flex flex-col justify-between shadow-xs overflow-hidden font-mono">
      {/* Terminal Header */}
      <div className="flex items-center justify-between border-b border-[#1A3035] pb-1.5 mb-1 text-[11px] shrink-0">
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

      {/* Terminal Body: Max 50 lines, auto-scroll */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 text-xs pr-1">
        {logs.map((entry, index) => {
          const isLatest = index === logs.length - 1;
          const isTyping = isLatest && typedChars < entry.text.length;
          const visibleText = isTyping ? entry.text.slice(0, typedChars) : entry.text;

          return (
            <div key={entry.id} className="flex items-start gap-2 leading-relaxed">
              {/* Tag: [AI] only if source is gemini, else [RULE] */}
              {entry.source === "AI" ? (
                <span className="text-amber font-bold shrink-0">[AI]</span>
              ) : (
                <span className="text-green font-bold shrink-0">[RULE]</span>
              )}
              <span className="text-muted-foreground shrink-0">{entry.time}</span>
              <span className={entry.source === "AI" ? "text-[#E3F2F4]" : "text-paper"}>
                {visibleText}
                {isTyping && <span className="inline-block w-1.5 h-3 bg-amber ml-0.5 animate-pulse" />}
              </span>
            </div>
          );
        })}
      </div>

      {/* Terminal Footer: Real source of the last log line */}
      <div className="pt-1 border-t border-[#1A3035] flex items-center justify-between text-[10px] shrink-0">
        <span
          className={
            lastLogSource === "gemini"
              ? "text-amber font-medium"
              : "text-muted-foreground"
          }
        >
          {lastLogSource === "gemini"
            ? "Gemini Assistant Active (source: gemini)"
            : "Deterministic Fallback Active (source: template)"}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
          Terminal Listening
        </span>
      </div>
    </div>
  );
}
