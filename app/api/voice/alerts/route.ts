/**
 * app/api/voice/alerts/route.ts
 * GET — Returns the in-memory alert history (most recent first).
 */

import { getAlerts } from "@/lib/alert-engine";

export async function GET() {
  return Response.json({ ok: true, alerts: getAlerts() });
}
