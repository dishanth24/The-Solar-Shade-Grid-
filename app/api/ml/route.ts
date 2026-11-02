import { NextResponse } from "next/server";

const ML_BACKEND_URL = process.env.ML_BACKEND_URL || "http://127.0.0.1:8000";

export async function GET() {
  try {
    const res = await fetch(`${ML_BACKEND_URL}/api/ml/compare`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ available: false, error: `Backend status ${res.status}` }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json({ available: true, data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({
      available: false,
      message: "ML Advisory Backend is offline or unreachable on localhost:8000.",
    }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const endpoint = body?.type === "demand" ? "/api/ml/forecast/demand" : "/api/ml/forecast/solar";

    const res = await fetch(`${ML_BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.telemetry),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return NextResponse.json({ available: false, error: `Backend status ${res.status}` }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json({ available: true, ...data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({
      available: false,
      message: "ML Advisory Backend offline. Deterministic twin continues unaffected.",
    }, { status: 200 });
  }
}
