/**
 * app/api/produce/assess/route.ts
 * POST — Runs the freshness assessment engine for one produce category.
 * Body: { category, stallId, sensors[] }
 * Returns: FreshnessAssessment
 */
import { NextResponse } from "next/server";
import {
  assessFreshness,
  type ProduceCategory,
  type SensorReading,
} from "@/lib/produce-engine";

const VALID_CATEGORIES: ProduceCategory[] = ["apple", "tomato", "potato", "leafy"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const category = body?.category as ProduceCategory;
    const stallId = typeof body?.stallId === "string" ? body.stallId : "s1";
    const sensors = Array.isArray(body?.sensors) ? (body.sensors as SensorReading[]) : [];

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { ok: false, error: `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const assessment = assessFreshness(category, stallId, sensors);
    return NextResponse.json({ ok: true, assessment });
  } catch (err) {
    console.error("[produce/assess]", err);
    return NextResponse.json(
      { ok: false, error: "Assessment failed." },
      { status: 500 }
    );
  }
}
