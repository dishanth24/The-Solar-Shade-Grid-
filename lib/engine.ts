// lib/engine.ts  --  Solar Shade Grid digital twin.
// PURE and DETERMINISTIC: no Math.random, no Date.now, no network. Same inputs -> same outputs.
// Units: power in kW, energy in kWh, dt in hours. Energy per tick = power x dt.

export type StallStatus = 'ok' | 'amber' | 'shed';
export type Mode = 'normal' | 'heatwave' | 'blackout';

export const C = {
  P_CAP: 12,            // canopy capacity, kW
  B_CAP: 20,            // battery capacity, kWh (LiFePO4)
  ETA: 0.82,            // efficiency loss factor (slide 5)
  SOC_FLOOR: 0.2,       // battery never goes below this while grid is live
  SOC_EMERGENCY: 0.05,  // blackout may use the reserve down to this
  SOC_PAYOUT: 0.8,      // surplus is sold only when battery is at least this full
  SELL_SHARE: 0.6,      // share of surplus sold once battery is above SOC_PAYOUT
  CHARGE_EFF: 0.95,
  STORAGE_BASE: 1.2,    // cold storage, kW
  STORAGE_HEAT: 1.8,    // cold storage boosted in heat, kW
  MIST: 0.8,            // misting pumps, kW
  FAN_NORMAL: 0.18,     // per stall fans + lights, kW
  FAN_HEAT: 0.28,
  SAFETY_LIGHT: 0.04,   // per stall, kept on during load shedding, kW
  TARIFF: 6,            // virtual rupees per kWh sold back
  HEAT_THRESHOLD: 42,   // deg C
} as const;

export interface Stall {
  id: string;
  name: string;
  temp: number;
  loadKw: number;
  status: StallStatus;
  wallet: number; // virtual credits, rupees
}

export interface TickResult {
  hour: number;
  hsun: number;
  ambient: number;
  genKw: number;
  eGen: number;
  eAvail: number;
  deltaE: number;
  vendorKw: number;
  storageKw: number;
  coolingKw: number;
  demandKw: number;
  shedding: boolean;
  hot: boolean;
  soldKwh: number;
  payout: number;
  gridImportKwh: number;
  runtimeH: number | null; // null = grid is live, Infinity = solar-sustained (show as 'sustained by solar')
  socAfter: number;
  stallCount: number;
}

export interface GridState {
  hour: number; // 0..24
  heatwave: boolean;
  gridLive: boolean;
  soc: number; // 0..1
  coopPool: number;
  stalls: Stall[];
  last: TickResult | null;
}

export const STALL_NAMES = [
  'Vegetables', 'Fruits', 'Flowers', 'Dairy', 'Spices', 'Snacks', 'Tea', 'Grains',
];

export function createInitialState(hour = 9, soc = 0.7): GridState {
  return {
    hour,
    heatwave: false,
    gridLive: true,
    soc,
    coopPool: 0,
    last: null,
    stalls: STALL_NAMES.map((name, i) => ({
      id: 's' + (i + 1),
      name,
      temp: 30,
      loadKw: C.FAN_NORMAL,
      status: 'ok' as StallStatus,
      wallet: 0,
    })),
  };
}

export function modeOf(s: Pick<GridState, 'heatwave' | 'gridLive'>): Mode {
  return !s.gridLive ? 'blackout' : s.heatwave ? 'heatwave' : 'normal';
}

// Sunlight factor 0..1: zero at night, peaks at noon.
export function sunFactor(hour: number): number {
  return Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
}

export function ambientTemp(hour: number, heatwave: boolean): number {
  return 26 + 10 * sunFactor(hour) + (heatwave ? 10 : 0);
}

export function tick(s: GridState, dt = 0.25): GridState {
  const n = s.stalls.length;
  const hsun = sunFactor(s.hour);
  const ambient = ambientTemp(s.hour, s.heatwave);
  const hot = ambient > C.HEAT_THRESHOLD;

  // Equation 1: micro-generation  Egen = Pcap x Hsun x eta
  const genKw = C.P_CAP * hsun * C.ETA;
  const eGen = genKw * dt;

  // Equation 2: battery availability  Eavail = Egen + (Bcap x SOC) - Lloss
  const lLoss = 0.04 * eGen + 0.02 * dt;
  const eAvail = eGen + C.B_CAP * s.soc - lLoss;

  // Full (un-shed) demand in kW
  const fullVendorKw = n * (hot ? C.FAN_HEAT : C.FAN_NORMAL);
  const storageKw = hot ? C.STORAGE_HEAT : C.STORAGE_BASE;
  const fullCoolingKw = hot ? C.MIST : 0;

  // Equation 3: net energy balancing delta
  const deltaE = eAvail - (fullVendorKw + storageKw + fullCoolingKw) * dt;

  // Load shedding rule: grid dead OR delta negative. Shed = fans + misting off, safety lights + cold storage stay.
  const shedding = !s.gridLive || deltaE < 0;
  const vendorKw = shedding ? n * C.SAFETY_LIGHT : fullVendorKw;
  const coolingKw = shedding ? 0 : fullCoolingKw;
  const demandKw = vendorKw + storageKw + coolingKw;

  // Real energy flow this tick (surplus payout comes from this, NOT from stored battery energy)
  let soc = s.soc;
  let soldKwh = 0;
  let gridImportKwh = 0;
  const net = eGen - lLoss - demandKw * dt;

  if (net >= 0) {
    const share = s.gridLive && soc >= C.SOC_PAYOUT ? C.SELL_SHARE : 0;
    soldKwh = net * share;
    const room = (1 - soc) * C.B_CAP;
    const toBattery = Math.min((net - soldKwh) * C.CHARGE_EFF, room);
    soc += toBattery / C.B_CAP;
    const leftover = Math.max(0, net - soldKwh - toBattery / C.CHARGE_EFF);
    if (s.gridLive) soldKwh += leftover; // battery full: sell the rest (curtailed if grid is dead)
  } else {
    const deficit = -net;
    const floor = s.gridLive ? C.SOC_FLOOR : C.SOC_EMERGENCY;
    const fromBattery = Math.min(deficit, Math.max(0, soc - floor) * C.B_CAP);
    soc -= fromBattery / C.B_CAP;
    gridImportKwh = s.gridLive ? deficit - fromBattery : 0;
  }
  soc = Math.min(1, Math.max(0, soc));

  const payout = soldKwh * C.TARIFF;

  // Battery runtime during blackout (hours until the emergency reserve is reached)
  let runtimeH: number | null = null;
  if (!s.gridLive) {
    const drawKw = demandKw + lLoss / dt - genKw;
    const usable = Math.max(0, soc - C.SOC_EMERGENCY) * C.B_CAP;
    runtimeH = drawKw <= 0 ? Infinity : usable / drawKw;
  }

  const stalls: Stall[] = s.stalls.map((st, i) => {
    const jitter = ((i * 37) % 5) * 0.3 - 0.6; // deterministic per-stall variation
    const target = ambient - 4 - (coolingKw > 0 ? 4 : 0) + jitter;
    return {
      ...st,
      temp: st.temp + (target - st.temp) * 0.35,
      loadKw: shedding ? C.SAFETY_LIGHT : hot ? C.FAN_HEAT : C.FAN_NORMAL,
      status: (shedding ? 'shed' : hot ? 'amber' : 'ok') as StallStatus,
      wallet: st.wallet + payout / n,
    };
  });

  const last: TickResult = {
    hour: s.hour, hsun, ambient, genKw, eGen, eAvail, deltaE,
    vendorKw, storageKw, coolingKw, demandKw, shedding, hot,
    soldKwh, payout, gridImportKwh, runtimeH, socAfter: soc, stallCount: n,
  };

  return {
    ...s,
    hour: (s.hour + dt) % 24,
    soc,
    coopPool: s.coopPool + payout,
    stalls,
    last,
  };
}

// ---------- text helpers ----------

export function fmtClock(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour % 1) * 60) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function fmtRuntime(h: number | null): string {
  if (h === null) return '--';
  if (!isFinite(h)) return 'sustained by solar';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return hh + ' h ' + String(mm).padStart(2, '0') + ' min';
}

// Rule-based log line. Used as the fallback whenever Gemini is slow or unavailable.
export function templateLog(r: TickResult, gridLive: boolean): string {
  const t = '[' + fmtClock(r.hour) + '] ';
  const soc = Math.round(r.socAfter * 100);
  if (!gridLive) {
    return t + 'BLACKOUT: municipal supply is down. Battery at ' + soc + '% feeds only safety lights and cold storage. Runtime: ' + fmtRuntime(r.runtimeH) + '.';
  }
  if (r.shedding) {
    return t + 'Generation ' + r.genKw.toFixed(1) + ' kW cannot cover demand, so fans and misting are paused to protect cold storage.';
  }
  if (r.hot) {
    return t + 'Ambient ' + r.ambient.toFixed(0) + ' C is above ' + C.HEAT_THRESHOLD + ' C: misting pumps on, cold storage boosted to ' + r.storageKw.toFixed(1) + ' kW.';
  }
  if (r.soldKwh > 0.01) {
    return t + 'Surplus ' + r.soldKwh.toFixed(2) + ' kWh sold back. Rs ' + r.payout.toFixed(2) + ' split equally across ' + r.stallCount + ' co-op wallets.';
  }
  return t + 'Generation ' + r.genKw.toFixed(1) + ' kW and demand ' + r.demandKw.toFixed(1) + ' kW are balanced.';
}
