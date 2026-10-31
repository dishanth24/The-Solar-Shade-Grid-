"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useSim } from "@/lib/sim-context";
import { fmtClock } from "@/lib/engine";

export function PowerChart() {
  const { history, state } = useSim();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(() => {
    if (!history || history.length === 0) {
      if (state.last) {
        return [
          {
            hour: state.last.hour,
            time: fmtClock(state.last.hour),
            genKw: Number(state.last.genKw.toFixed(2)),
            demandKw: Number(state.last.demandKw.toFixed(2)),
          },
        ];
      }
      return [];
    }

    return history.map((item) => ({
      hour: item.hour,
      time: fmtClock(item.hour),
      genKw: Number(item.genKw.toFixed(2)),
      demandKw: Number(item.demandKw.toFixed(2)),
    }));
  }, [history, state.last]);

  if (!mounted) {
    return <div className="w-full h-full min-h-0" />;
  }

  return (
    <div className="w-full h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 10, left: -22, bottom: 0 }}
        >
          <defs>
            <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--amber)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--amber)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--teal)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            opacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="time"
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={25}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={[0, "auto"]}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: "8px",
              fontSize: "11px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              color: "var(--foreground)",
            }}
            itemStyle={{ padding: 0 }}
            formatter={(value: any, name: any) => [
              `${Number(value).toFixed(2)} kW`,
              name === "genKw" ? "Solar Gen" : "Total Demand",
            ]}
            labelFormatter={(label) => `Time: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="genKw"
            stroke="var(--amber)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#genGrad)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="demandKw"
            stroke="var(--teal)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#demandGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
