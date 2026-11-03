/**
 * lib/vendor-registry.ts
 * Hardcoded vendor registry for the Solar Shade Grid demo.
 * In production this would be backed by Supabase. For the hackathon demo,
 * all 5 vendors use the DEMO_PHONE number from env, defaulting to a placeholder.
 */

import type { ProduceCategory } from "./produce-engine";

export interface VendorProfile {
  vendorId: string;
  stallId: string; // s1–s8
  stallName: string;
  vendorName: string;
  produceCategories: ProduceCategory[];
  /** E.164 phone number. Falls back to DEMO_PHONE env. */
  phone: string;
  preferredLanguage: "kn" | "hi";
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  voiceConsentGiven: boolean;
  optedOut: boolean;
  lastAlertSent?: string; // ISO timestamp — used for cooldown
  lastAlertId?: string;
}

// ---------------------------------------------------------------------------
// Demo registry — 5 vendors mirroring stalls in the 3D twin
// All phone fields use the DEMO_PHONE env var at runtime via getVendorPhone()
// Languages strictly configured for Kannada (kn-IN) and Hindi (hi-IN)
// ---------------------------------------------------------------------------

export const VENDOR_REGISTRY: VendorProfile[] = [
  {
    vendorId: "v-001",
    stallId: "s1",
    stallName: "Stall 1 — Tomato Corner",
    vendorName: "Priya Nair",
    produceCategories: ["tomato"],
    phone: "+910000000001", // replaced at runtime
    preferredLanguage: "kn",
    whatsappEnabled: true,
    smsEnabled: true,
    voiceConsentGiven: true,
    optedOut: false,
  },
  {
    vendorId: "v-002",
    stallId: "s2",
    stallName: "Stall 2 — Apple Bazaar",
    vendorName: "Rajan Mehta",
    produceCategories: ["apple"],
    phone: "+910000000002",
    preferredLanguage: "hi",
    whatsappEnabled: true,
    smsEnabled: true,
    voiceConsentGiven: true,
    optedOut: false,
  },
  {
    vendorId: "v-003",
    stallId: "s4",
    stallName: "Stall 4 — Greens Hub",
    vendorName: "Lakshmi Devi",
    produceCategories: ["leafy"],
    phone: "+910000000003",
    preferredLanguage: "kn",
    whatsappEnabled: false,
    smsEnabled: true,
    voiceConsentGiven: true,
    optedOut: false,
  },
  {
    vendorId: "v-004",
    stallId: "s6",
    stallName: "Stall 6 — Root Cellar",
    vendorName: "Suresh Kumar",
    produceCategories: ["potato"],
    phone: "+910000000004",
    preferredLanguage: "hi",
    whatsappEnabled: true,
    smsEnabled: true,
    voiceConsentGiven: true,
    optedOut: false,
  },
  {
    vendorId: "v-005",
    stallId: "s7",
    stallName: "Stall 7 — Mixed Produce",
    vendorName: "Anitha Rao",
    produceCategories: ["tomato", "leafy"],
    phone: "+910000000005",
    preferredLanguage: "kn",
    whatsappEnabled: true,
    smsEnabled: true,
    voiceConsentGiven: false,
    optedOut: false,
  },
];

/** Returns the effective phone number for a vendor.
 *  For demo: always uses DEMO_PHONE env if set, preserving E.164 format. */
export function getVendorPhone(vendor: VendorProfile): string {
  if (typeof process !== "undefined") {
    const demo = process.env.DEMO_PHONE;
    if (demo && demo.startsWith("+")) return demo;
  }
  return vendor.phone;
}

/** Lookup vendor by stallId + produceCategory. */
export function findVendor(
  stallId: string,
  category?: ProduceCategory
): VendorProfile | undefined {
  return VENDOR_REGISTRY.find(
    (v) =>
      v.stallId === stallId &&
      (!category || v.produceCategories.includes(category))
  );
}

/**
 * Match an incoming phone number (e.g. from WhatsApp webhook) to a VendorProfile.
 * Handles E.164, digits-only suffix matching, DEMO_PHONE environment matching,
 * and graceful fallback to the primary demo vendor so AI conversations always have context.
 */
export function matchVendorByPhone(incomingPhone: string): {
  vendor: VendorProfile;
  matchReason: string;
} {
  const clean = incomingPhone.replace(/^whatsapp:/, "").trim();
  const digits = clean.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;

  // 1. Direct match with vendor specific phone
  for (const v of VENDOR_REGISTRY) {
    const rawVPhone = v.phone.replace(/\D/g, "");
    if (v.phone === clean || (last10 && rawVPhone.endsWith(last10))) {
      return { vendor: v, matchReason: `Direct match: ${v.vendorId} (${v.vendorName})` };
    }
  }

  // 2. Match DEMO_PHONE environment variable
  const demoPhone = (process.env.DEMO_PHONE ?? "").replace(/\D/g, "");
  if (demoPhone && last10 && demoPhone.endsWith(last10)) {
    return {
      vendor: VENDOR_REGISTRY[0],
      matchReason: `Matched DEMO_PHONE (${process.env.DEMO_PHONE}): assigned to primary demo stall ${VENDOR_REGISTRY[0].stallName}`,
    };
  }

  // 3. Fallback for WhatsApp Sandbox testers (e.g. hackathon evaluators / unknown numbers)
  return {
    vendor: VENDOR_REGISTRY[0],
    matchReason: `Sandbox fallback for ${clean}: assigned to ${VENDOR_REGISTRY[0].vendorName} (${VENDOR_REGISTRY[0].stallName})`,
  };
}

/** Lookup vendor by vendorId. */
export function getVendorById(vendorId: string): VendorProfile | undefined {
  return VENDOR_REGISTRY.find((v) => v.vendorId === vendorId);
}

/** Mark alert sent — mutates in-memory registry (demo only). */
export function markAlertSent(vendorId: string, alertId: string): void {
  const v = VENDOR_REGISTRY.find((v) => v.vendorId === vendorId);
  if (v) {
    v.lastAlertSent = new Date().toISOString();
    v.lastAlertId = alertId;
  }
}

/** Update vendor preferred language (runtime demo setting). */
export function updateVendorLanguage(
  vendorId: string,
  preferredLanguage: "kn" | "hi"
): boolean {
  const v = VENDOR_REGISTRY.find((v) => v.vendorId === vendorId);
  if (v) {
    v.preferredLanguage = preferredLanguage;
    return true;
  }
  return false;
}
