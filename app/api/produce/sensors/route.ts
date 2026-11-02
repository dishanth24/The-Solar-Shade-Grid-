/**
 * app/api/produce/sensors/route.ts
 * GET — Returns simulated sensor readings derived from current simulation state.
 * Client sends simulation telemetry in query params or body; server returns sensor array.
 * Designed to accept real ESP32 POST payloads in future without breaking existing callers.
 */
import { NextResponse } from "next/server";
import {
  simulateSensors,
  type SimulatorInputs,
} from "@/lib/produce-engine";

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<SimulatorInputs>;

    const inputs: SimulatorInputs = {
      hour: typeof body.hour === "number" ? body.hour : 12,
      ambientTemp: typeof body.ambientTemp === "number" ? body.ambientTemp : 32,
      heatwave: body.heatwave === true,
      gridLive: body.gridLive !== false,
      stallTemps: Array.isArray(body.stallTemps) ? body.stallTemps : Array(8).fill(30),
      coolingKw: typeof body.coolingKw === "number" ? body.coolingKw : 0,
      hsun: typeof body.hsun === "number" ? body.hsun : 0.5,
    };

    const sensors = simulateSensors(inputs);

    return NextResponse.json({
      ok: true,
      source: "simulated",
      count: sensors.length,
      sensors,
      note: "All readings are derived from the digital twin simulation. No hardware sensors are physically connected.",
    });
  } catch (err) {
    console.error("[produce/sensors]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate sensor readings." },
      { status: 500 }
    );
  }
}
