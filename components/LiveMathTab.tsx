"use client";

import React from "react";
import { useSim } from "@/lib/sim-context";
import { C, fmtClock, fmtRuntime } from "@/lib/engine";

// The simulation steps 0.25 h per tick (demo speed). The slide's equations use the same maths with a 1 h step.
const DT = 0.25;

function Card(props: {
  label: string;
  title: string;
  formula: string;
  substituted: string;
  result: string;
  note: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-border bg-secondary/30 flex flex-col gap-2">
      <span className="text-[11px] font-mono uppercase text-muted-foreground font-bold">{props.label}</span>
      <h3 className="font-serif text-base font-bold text-foreground">{props.title}</h3>
      <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-sm text-teal dark:text-amber">
        {props.formula}
      </div>
      <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-sm text-foreground break-words">
        {props.substituted}
      </div>
      <div className="font-mono text-2xl font-extrabold text-teal dark:text-amber">{props.result}</div>
      <p className="text-xs text-muted-foreground leading-snug">{props.note}</p>
    </div>
  );
}

export function LiveMathTab() {
  const { state } = useSim();
  const r = state.last;

  if (!r) {
    return <div className="text-sm text-muted-foreground">Waiting for the first simulation tick...</div>;
  }

  // Rebuild every term of the three equations from the real tick result
  const lLoss = 0.04 * r.eGen + 0.02 * DT;
  const socBefore = (r.eAvail - r.eGen + lLoss) / C.B_CAP;
  const fullVendorKw = r.stallCount * (r.hot ? C.FAN_HEAT : C.FAN_NORMAL);
  const fullCoolingKw = r.hot ? C.MIST : 0;

  const gridLive = state.gridLive;
  const payout = r.payout;

  let bannerClass = "bg-green/10 border-green/40 text-green";
  let bannerTitle = "ΔE > 0: all loads are served";
  let bannerText = "Generation and battery cover every load. Any surplus charges the battery first.";

  if (!gridLive) {
    bannerClass = "bg-red/10 border-red/40 text-red";
    bannerTitle = "Grid is down: load shedding";
    bannerText =
      "Fans and misting are switched off. Only safety lights and cold storage run on the battery. Runtime: " +
      fmtRuntime(r.runtimeH) + ".";
  } else if (r.shedding) {
    bannerClass = "bg-red/10 border-red/40 text-red";
    bannerTitle = "ΔE < 0: load shedding";
    bannerText = "Available energy is below demand, so fans and misting are paused to protect cold storage.";
  } else if (r.soldKwh > 0.01) {
    bannerClass = "bg-green/10 border-green/40 text-green";
    bannerTitle = "ΔE > 0 and battery at least 80%: surplus payout";
    bannerText =
      r.soldKwh.toFixed(2) + " kWh sold back = Rs " + payout.toFixed(2) +
      ", split equally across " + r.stallCount + " co-op wallets.";
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-2xl font-bold text-foreground">
          Twin Engine: Live Mathematical Validation
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          The same inputs always give the same outputs. These are the real numbers from the current simulation tick.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {[
          "Time " + fmtClock(r.hour),
          "Sun factor " + r.hsun.toFixed(2),
          "Ambient " + r.ambient.toFixed(0) + " °C",
          "Grid " + (gridLive ? "LIVE" : "BLACKOUT"),
          "Δt " + DT + " h per tick",
        ].map((chip) => (
          <span key={chip} className="px-2.5 py-1 rounded-full border border-border bg-secondary/40 text-foreground">
            {chip}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          label="Equation 1"
          title="Micro-Generation"
          formula="E_gen = P_cap × H_sun × η_eff"
          substituted={
            C.P_CAP + " × " + r.hsun.toFixed(2) + " × " + C.ETA + " = " + r.genKw.toFixed(2) +
            " kW, × " + DT + " h = " + r.eGen.toFixed(2) + " kWh"
          }
          result={r.eGen.toFixed(2) + " kWh"}
          note="P_cap is the 12 kW canopy, H_sun is the sunlight factor (0 to 1), η_eff is the 0.82 efficiency loss."
        />
        <Card
          label="Equation 2"
          title="Battery Availability"
          formula="E_avail = E_gen + (B_cap × SOC) − L_loss"
          substituted={
            r.eGen.toFixed(2) + " + (" + C.B_CAP + " × " + socBefore.toFixed(2) + ") − " +
            lLoss.toFixed(2) + " = " + r.eAvail.toFixed(2) + " kWh"
          }
          result={r.eAvail.toFixed(2) + " kWh"}
          note="B_cap is the 20 kWh battery, SOC its state of charge before this tick, L_loss the inverter and wiring loss."
        />
        <Card
          label="Equation 3"
          title="Net Energy Balancing Delta"
          formula="ΔE = E_avail − ΣD_vendor − D_storage − D_cooling"
          substituted={
            r.eAvail.toFixed(2) + " − " + (fullVendorKw * DT).toFixed(2) + " − " +
            (r.storageKw * DT).toFixed(2) + " − " + (fullCoolingKw * DT).toFixed(2) +
            " = " + r.deltaE.toFixed(2) + " kWh"
          }
          result={(r.deltaE >= 0 ? "+" : "") + r.deltaE.toFixed(2) + " kWh"}
          note="Vendor fans and lights, the cold-storage baseline and the misting pumps, each × Δt."
        />
      </div>

      <div className={"p-4 rounded-xl border flex flex-col gap-1 " + bannerClass}>
        <span className="text-base font-bold">{bannerTitle}</span>
        <span className="text-sm text-foreground">{bannerText}</span>
      </div>

      <p className="text-xs text-muted-foreground leading-snug">
        ΔE decides load shedding. Payouts come from the real energy flow of the tick (generation minus losses minus
        demand) and only when the battery is at least 80% full, so energy already stored in the battery is never
        counted as profit.
      </p>
    </div>
  );
}
