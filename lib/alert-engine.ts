/**
 * lib/alert-engine.ts
 * In-memory alert deduplication, cooldown, and state management.
 * No database required — resets on server restart. Fine for demo.
 */

import type { ProduceCategory, RiskLevel } from "./produce-engine";

export type AlertSeverity = "info" | "caution" | "warning" | "critical";
export type AlertStatus =
  | "generated"
  | "sending"
  | "delivered"
  | "failed"
  | "acknowledged";
export type DeliveryChannel = "whatsapp" | "sms" | "preview" | "none";

export interface AlertRecord {
  alertId: string;
  vendorId: string;
  stallId: string;
  stallName: string;
  vendorName: string;
  category: ProduceCategory;
  riskLevel: RiskLevel;
  severity: AlertSeverity;
  message: string; // Human-readable alert text
  language: "en" | "kn" | "hi";
  channel: DeliveryChannel;
  status: AlertStatus;
  twilioSid?: string;
  errorMessage?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ─── Cooldown ─────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per vendor per category

/** key = `${vendorId}:${category}` → timestamp of last alert */
const lastAlertMap = new Map<string, number>();

/** In-memory store of all alert records (most recent first). */
const alertStore: AlertRecord[] = [];

// ─── Risk → severity mapping ───────────────────────────────────────────────────

export function riskToSeverity(risk: RiskLevel): AlertSeverity {
  switch (risk) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "warning";
    case "MODERATE":
      return "caution";
    default:
      return "info";
  }
}

// ─── Cooldown check ───────────────────────────────────────────────────────────

export function shouldSendAlert(
  vendorId: string,
  category: ProduceCategory
): boolean {
  const key = `${vendorId}:${category}`;
  const last = lastAlertMap.get(key);
  if (!last) return true;
  return Date.now() - last > COOLDOWN_MS;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function createAlert(
  params: Omit<AlertRecord, "alertId" | "createdAt" | "updatedAt" | "status">
): AlertRecord {
  const alert: AlertRecord = {
    ...params,
    alertId: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: "generated",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  alertStore.unshift(alert); // newest first
  if (alertStore.length > 200) alertStore.splice(200); // cap at 200 records
  lastAlertMap.set(`${params.vendorId}:${params.category}`, Date.now());
  return alert;
}

export function markDelivered(
  alertId: string,
  channel: DeliveryChannel,
  twilioSid?: string
): AlertRecord | undefined {
  const r = alertStore.find((a) => a.alertId === alertId);
  if (!r) return undefined;
  r.status = "delivered";
  r.channel = channel;
  r.twilioSid = twilioSid;
  r.updatedAt = new Date().toISOString();
  return r;
}

export function markFailed(
  alertId: string,
  errorMessage: string
): AlertRecord | undefined {
  const r = alertStore.find((a) => a.alertId === alertId);
  if (!r) return undefined;
  r.status = "failed";
  r.errorMessage = errorMessage;
  r.updatedAt = new Date().toISOString();
  return r;
}

export function markSending(alertId: string): AlertRecord | undefined {
  const r = alertStore.find((a) => a.alertId === alertId);
  if (!r) return undefined;
  r.status = "sending";
  r.updatedAt = new Date().toISOString();
  return r;
}

export function getAlerts(): AlertRecord[] {
  return [...alertStore];
}

export function getAlertById(alertId: string): AlertRecord | undefined {
  return alertStore.find((a) => a.alertId === alertId);
}

/** Force-reset cooldown for a vendor+category (used by "Send Test Alert"). */
export function resetCooldown(vendorId: string, category: ProduceCategory): void {
  lastAlertMap.delete(`${vendorId}:${category}`);
}
