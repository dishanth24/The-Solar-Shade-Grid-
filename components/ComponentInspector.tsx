"use client";

import React from "react";
import { useSim } from "@/lib/sim-context";
import { fmtRuntime, C } from "@/lib/engine";
import {
  SunMedium,
  BatteryCharging,
  Zap,
  Building2,
  Store,
  X,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  Wifi,
  Leaf,
  Thermometer,
  Droplets,
  Wind,
  Sun,
  CloudRain,
  ShieldAlert,
} from "lucide-react";

export type ComponentType = "canopy" | "battery" | "inverter" | "grid" | "stall" | "sensor";

export interface SelectedComponent {
  type: ComponentType;
  id: string;
  name: string;
  stallIndex?: number;
  sensorData?: {
    sensorType: string;
    model: string;
    value: number | string;
    unit: string;
    status: string;
    source: string;
    timestamp: string;
    location: string;
    calibrationStatus?: string;
  };
}

interface ComponentInspectorProps {
  selected: SelectedComponent | null;
  onClose: () => void;
  onFocus?: (id: string) => void;
}

export function ComponentInspector({ selected, onClose, onFocus }: ComponentInspectorProps) {
  const { state, mode, totalSoldKwh } = useSim();

  if (!selected) return null;

  const last = state.last;
  const genKw = last?.genKw ?? 0;
  const demandKw = last?.demandKw ?? 0;
  const socPercent = Math.round(state.soc * 100);

  // Render specific metrics depending on component type
  let title = selected.name;
  let category = "Microgrid Asset";
  let statusBadge = { label: "Operational", color: "bg-green/10 text-green border-green/30" };
  let icon = <Zap className="w-5 h-5 text-teal dark:text-cyan-400" />;
  let metrics: Array<{ label: string; value: string; hint?: string }> = [];
  let aiAdvisory = "";
  let produceSection: {
    produceName: string;
    emoji: string;
    riskLevel: string;
    riskColor: string;
    rec: string;
    guideline: string;
  } | null = null;

  if (selected.type === "canopy") {
    category = "Generation Infrastructure";
    icon = <SunMedium className="w-5 h-5 text-amber" />;
    statusBadge =
      genKw > 0
        ? { label: "Generating", color: "bg-amber/15 text-amber border-amber/40" }
        : { label: "Idle (Night)", color: "bg-muted text-muted-foreground border-border" };
    metrics = [
      { label: "Rated Capacity", value: `${C.P_CAP} kW`, hint: "Bifacial Monocrystalline" },
      { label: "Current Generation", value: `${genKw.toFixed(2)} kW`, hint: `Eff: ${(C.ETA * 100).toFixed(0)}%` },
      { label: "Sun Irradiance Factor", value: `${((last?.hsun ?? 0) * 100).toFixed(0)}%`, hint: "Peak geometry" },
      { label: "Today's Energy Harvest", value: `${(state.coopPool * 0.18 + genKw * 1.5).toFixed(1)} kWh`, hint: "Cumulative" },
      { label: "Array Area & Shade", value: "85 m²", hint: "Lowers stall temps 4-6°C" },
      { label: "Tilt & Azimuth", value: "15° South", hint: "Optimized for Bengaluru (12.97°N)" },
    ];
    aiAdvisory =
      genKw > 6
        ? "Solar canopy is generating at peak efficiency. Surplus generation is actively charging BESS and feeding communal cold storage."
        : genKw > 0
        ? "Moderate solar generation during transition hours. Supporting baseline market lighting and ventilation."
        : "Solar generation inactive due to low solar angle. Microgrid relying on BESS reserves and grid interconnect.";
  } else if (selected.type === "battery") {
    category = "Storage Infrastructure (BESS)";
    icon = <BatteryCharging className="w-5 h-5 text-green" />;
    const isLow = state.soc < 0.2;
    statusBadge = isLow
      ? { label: "Reserve Warning", color: "bg-red/15 text-red border-red/40" }
      : { label: "Healthy", color: "bg-green/10 text-green border-green/30" };
    const runtimeStr = state.gridLive ? "Interconnected" : fmtRuntime(last?.runtimeH ?? null);
    metrics = [
      { label: "Nominal Capacity", value: `${C.B_CAP} kWh`, hint: "LiFePO4 Chemistry" },
      { label: "State of Charge (SOC)", value: `${socPercent}%`, hint: `Floor: ${(C.SOC_FLOOR * 100).toFixed(0)}%` },
      { label: "Battery Energy Stored", value: `${(state.soc * C.B_CAP).toFixed(2)} kWh`, hint: "Available energy" },
      { label: "Estimated Autonomous Runtime", value: runtimeStr, hint: state.gridLive ? "Grid Active" : "Emergency Island" },
      { label: "Payout Export Threshold", value: `${(C.SOC_PAYOUT * 100).toFixed(0)}%`, hint: "Surplus monetization" },
      { label: "Round-trip Efficiency", value: `${(C.CHARGE_EFF * 100).toFixed(0)}%`, hint: "Low thermal losses" },
    ];
    aiAdvisory =
      state.soc >= C.SOC_PAYOUT
        ? "Battery is above the 80% payout threshold. 60% of surplus solar is actively monetized to the vendor cooperative pool."
        : !state.gridLive
        ? "Municipal grid blackout in effect! BESS is serving critical cold-storage and safety illumination in islanded microgrid mode."
        : "Battery is safely buffered between reserve floor (20%) and monetization ceiling (80%).";
  } else if (selected.type === "inverter") {
    category = "Power Conversion & Hub";
    icon = <Cpu className="w-5 h-5 text-teal dark:text-cyan-400" />;
    statusBadge = { label: "MPPT Locked", color: "bg-teal/15 text-teal border-teal/40" };
    metrics = [
      { label: "Inverter Rating", value: "15 kVA", hint: "Bi-directional Hybrid" },
      { label: "Conversion Efficiency", value: "97.4%", hint: "Silicon Carbide Topology" },
      { label: "DC Bus Voltage", value: "380 V DC", hint: "Canopy & BESS Bus" },
      { label: "AC Microgrid Bus", value: "230 V / 50 Hz", hint: "Pure Sine Wave" },
      { label: "Cold Storage Load", value: `${(last?.storageKw ?? C.STORAGE_BASE).toFixed(2)} kW`, hint: "Perishable produce" },
      { label: "Misting Pumps", value: `${(last?.coolingKw ?? 0).toFixed(2)} kW`, hint: state.heatwave ? "Active (High-Pressure)" : "Standby" },
    ];
    aiAdvisory =
      "Hybrid Inverter dynamically balances DC solar inputs with battery charge controllers and AC vendor distribution. MPPT tracking efficiency is nominal.";
  } else if (selected.type === "grid") {
    category = "Grid Interconnection";
    icon = <Building2 className="w-5 h-5 text-blue" />;
    statusBadge = state.gridLive
      ? { label: "Online (Interconnected)", color: "bg-green/10 text-green border-green/30" }
      : { label: "OFFLINE (BLACKOUT)", color: "bg-red/20 text-red border-red/40 animate-pulse" };
    metrics = [
      { label: "Grid Status", value: state.gridLive ? "Synchronized" : "ISLANDED", hint: "Utility Interconnect" },
      { label: "Substation Voltage", value: state.gridLive ? "11 kV / 415 V" : "0 V", hint: "Bescom Feeder" },
      { label: "Feed-in Tariff", value: `₹${C.TARIFF}/kWh`, hint: "BESCOM Co-op Payout" },
      { label: "Net Energy Sold Today", value: `${(totalSoldKwh ?? 0).toFixed(2)} kWh`, hint: "Surplus exported" },
      { label: "Community Pool Value", value: `₹${Math.round(state.coopPool)}`, hint: "Vendor dividends" },
      { label: "Islanding Transfer Time", value: "< 16 ms", hint: "Seamless zero-flicker" },
    ];
    aiAdvisory = state.gridLive
      ? "Municipal grid connection is live. Microgrid exports excess solar when battery >80%, and provides peak-shaving when local market loads spike."
      : "GRID BLACKOUT DETECTED: Anti-islanding switch instantly isolated the local market grid. Solar canopy and BESS are keeping market vendors fully illuminated and refrigerated.";
  } else if (selected.type === "stall") {
    category = "Vendor Stall & IoT Node";
    icon = <Store className="w-5 h-5 text-teal dark:text-cyan-400" />;
    const stallIndex = selected.stallIndex ?? 0;
    const stall = state.stalls[stallIndex] || state.stalls[0];
    const isShed = stall?.status === "shed";

    statusBadge =
      stall?.status === "ok"
        ? { label: "Powered (Normal)", color: "bg-green/10 text-green border-green/30" }
        : stall?.status === "amber"
        ? { label: "Warning (Heat Stress)", color: "bg-amber/15 text-amber border-amber/40" }
        : { label: "LOAD SHED (Safety Only)", color: "bg-red/20 text-red border-red/40" };

    // Produce profiling per stall
    if (stallIndex === 0) {
      produceSection = {
        produceName: "Green Leafy Vegetables (Spinach, Coriander, Mint)",
        emoji: "🥬",
        riskLevel: stall.temp > 30 ? "HIGH RISK" : stall.temp > 25 ? "MODERATE RISK" : "LOW RISK",
        riskColor: stall.temp > 30 ? "text-red border-red/40 bg-red/10" : stall.temp > 25 ? "text-amber border-amber/40 bg-amber/10" : "text-green border-green/40 bg-green/10",
        rec: "Keep leafy greens shielded from direct solar rays. Activate misting to suppress transpiration and wilting.",
        guideline: "Optimal: 10–22°C, 65–95% RH (USDA AH-66 / FAO)",
      };
    } else if (stallIndex === 1) {
      produceSection = {
        produceName: "Apples & Citrus Fruits",
        emoji: "🍎",
        riskLevel: stall.temp > 32 ? "CRITICAL RISK" : stall.temp > 26 ? "MODERATE RISK" : "LOW RISK",
        riskColor: stall.temp > 32 ? "text-red border-red/40 bg-red/10" : stall.temp > 26 ? "text-amber border-amber/40 bg-amber/10" : "text-green border-green/40 bg-green/10",
        rec: "Move display away from thermal perimeter. Minimise temperature fluctuations to prevent texture breakdown.",
        guideline: "Optimal: 10–22°C display, 60–85% RH (USDA AH-66)",
      };
    } else if (stallIndex === 7) {
      produceSection = {
        produceName: "Potatoes & Root Vegetables",
        emoji: "🥔",
        riskLevel: (last?.hsun ?? 0) > 0.6 ? "HIGH RISK (LIGHT EXPOSURE)" : stall.temp > 26 ? "MODERATE RISK" : "LOW RISK",
        riskColor: (last?.hsun ?? 0) > 0.6 ? "text-amber border-amber/40 bg-amber/10" : "text-green border-green/40 bg-green/10",
        rec: "Keep storage shaded under opaque coverings to prevent light-induced solanine greening. Ensure airflow.",
        guideline: "Optimal: 10–20°C, <5,000 lux (ICAR Standards)",
      };
    }

    metrics = [
      { label: "Stall Vendor", value: stall?.name ?? "Market Vendor", hint: `Stall #${stallIndex + 1}` },
      { label: "Stall Temperature", value: `${(stall?.temp ?? 28).toFixed(1)}°C`, hint: state.heatwave ? "Shaded (vs +6°C unshaded)" : "Comfort Range" },
      { label: "Current Electric Load", value: `${(stall?.loadKw ?? 0.2).toFixed(2)} kW`, hint: isShed ? "Safety LED only (40W)" : "Fans + Display Cold" },
      { label: "Vendor Credit Wallet", value: `₹${Math.round(stall?.wallet ?? 0)}`, hint: "Virtual Solar Dividends" },
      { label: "Cooling Misters", value: last?.coolingKw ? "Active (Evaporative)" : "Standby", hint: "Produce thermal comfort" },
      { label: "IoT Sensor Drop", value: `ESP32-NODE-${stallIndex + 1}`, hint: "SHT31 + DS18B20 active" },
    ];

    aiAdvisory = produceSection
      ? `Environmental assessment: ${produceSection.rec} Solar canopy shading reduces heat accumulation by 4–6°C.`
      : isShed
      ? "Non-critical loads shed to protect communal battery reserve during blackout. Stall safety lighting maintained via micro-bus."
      : "Stall is fully powered by clean solar electricity. Ambient conditions continuously monitored by stall IoT node.";
  } else if (selected.type === "sensor") {
    category = "IoT Environmental Sensor";
    icon = <Wifi className="w-5 h-5 text-blue" />;
    const sd = selected.sensorData;
    statusBadge = { label: sd?.status ? sd.status.toUpperCase() : "SIMULATED", color: "bg-blue/15 text-blue border-blue/40" };
    metrics = [
      { label: "Sensor Model", value: sd?.model ?? "SHT31 / ESP32", hint: sd?.sensorType ?? "Environmental" },
      { label: "Live Reading", value: `${sd?.value ?? "--"} ${sd?.unit ?? ""}`, hint: "Validated value" },
      { label: "Location", value: sd?.location ?? "Solar Canopy Mast", hint: "Deployment mount" },
      { label: "Communication", value: "MQTT / Wi-Fi", hint: "ESP32 Controller Node" },
      { label: "Data Source", value: sd?.source ? sd.source.toUpperCase() : "SIMULATED", hint: "No hardware connected" },
      { label: "Last Reading", value: sd?.timestamp ? new Date(sd.timestamp).toLocaleTimeString() : "Just now", hint: "Timestamped" },
    ];
    aiAdvisory =
      "This sensor reading feeds directly into the Produce Freshness Intelligence engine to determine commodity-specific risk levels (Apples, Tomatoes, Potatoes, Leafy Greens).";
  }

  return (
    <div className="absolute right-3 top-3 bottom-3 w-88 z-30 flex flex-col rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="p-3.5 border-b border-border flex items-start justify-between bg-secondary/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-background border border-border shadow-xs">
            {icon}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {category}
            </div>
            <h3 className="font-serif text-sm font-bold text-foreground leading-tight">
              {title}
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status Bar */}
      <div className="px-3.5 py-2 border-b border-border/60 bg-background/50 flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">Operational Status</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.color}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Produce Risk Warning Banner (if stall has produce) */}
      {produceSection && (
        <div className={`px-3.5 py-2 border-b border-border/80 flex flex-col gap-1 ${produceSection.riskColor}`}>
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <span>{produceSection.emoji}</span>
              <span>{produceSection.produceName}</span>
            </span>
            <span className="text-[9px] font-mono uppercase">{produceSection.riskLevel}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-medium">
            {produceSection.guideline}
          </div>
        </div>
      )}

      {/* Telemetry Metrics List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
          Live Telemetry & Telematics
        </div>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m, idx) => (
            <div
              key={idx}
              className="p-2 rounded-lg border border-border bg-secondary/20 flex flex-col justify-between"
            >
              <span className="text-[10px] text-muted-foreground leading-tight truncate">
                {m.label}
              </span>
              <span className="font-mono text-xs font-bold text-foreground mt-0.5">
                {m.value}
              </span>
              {m.hint && (
                <span className="text-[9px] text-muted-foreground/80 mt-0.5 truncate">
                  {m.hint}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* AI Advisory Box */}
        <div className="mt-3 p-3 rounded-lg border border-teal/30 dark:border-cyan-500/30 bg-teal/5 dark:bg-cyan-950/20 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-teal dark:text-cyan-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Twin & Agricultural Advisory</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {aiAdvisory}
          </p>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-3 border-t border-border bg-secondary/40 flex items-center justify-between">
        {onFocus && (
          <button
            onClick={() => onFocus(selected.id)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg bg-teal hover:bg-teal/90 text-white shadow-xs transition-colors"
          >
            <Cpu className="w-3.5 h-3.5" />
            Focus In 3D Viewport
          </button>
        )}
      </div>
    </div>
  );
}
