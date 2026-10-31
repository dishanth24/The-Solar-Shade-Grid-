// app/api/log/route.ts
// POST { result: TickResult, gridLive: boolean, mode: string }
// Returns { text, source: 'gemini' | 'template' }. Never throws: any problem falls back to the rule-based line.
import { GoogleGenAI } from '@google/genai';
import { templateLog, fmtRuntime, fmtClock } from '@/lib/engine';
import type { TickResult } from '@/lib/engine';

const TIMEOUT_MS = 4000;

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

export async function POST(req: Request) {
  let result: TickResult | undefined;
  let gridLive = true;
  let mode = 'normal';
  try {
    const body = await req.json();
    result = body?.result;
    gridLive = body?.gridLive !== false;
    mode = typeof body?.mode === 'string' ? body.mode.slice(0, 20) : 'normal';
  } catch {
    return Response.json({ text: 'No data received.', source: 'template' });
  }
  if (!result || typeof result.genKw !== 'number') {
    return Response.json({ text: 'No data received.', source: 'template' });
  }

  const fallback = { text: templateLog(result, gridLive), source: 'template' as const };

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return Response.json(fallback);

  try {
    const facts =
      'Time ' + fmtClock(result.hour) +
      '. Mode: ' + mode +
      '. Municipal grid: ' + (gridLive ? 'live' : 'DOWN') +
      '. Solar generation: ' + result.genKw.toFixed(1) + ' kW' +
      '. Demand: ' + result.demandKw.toFixed(1) + ' kW' +
      '. Ambient temperature: ' + result.ambient.toFixed(0) + ' C' +
      '. Battery: ' + Math.round(result.socAfter * 100) + ' percent' +
      '. Load shedding active: ' + (result.shedding ? 'yes' : 'no') +
      '. Misting pumps: ' + (result.coolingKw > 0 ? 'on' : 'off') +
      '. Energy sold back this step: ' + result.soldKwh.toFixed(2) + ' kWh' +
      (gridLive ? '' : '. Battery runtime left: ' + fmtRuntime(result.runtimeH));

    const prompt =
      "You are the assistant of a vendors' solar co-op in an Indian market. " +
      'In ONE plain sentence of at most 25 words, explain to a market vendor why the grid is doing this right now. ' +
      'No jargon, no markdown, no quotes. Facts: ' + facts;

    const ai = new GoogleGenAI({ apiKey });
    const response = await Promise.race([
      ai.models.generateContent({ model, contents: prompt }),
      timeout<never>(TIMEOUT_MS),
    ]);
    const text = (response.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return Response.json(fallback);
    return Response.json({ text: text.slice(0, 200), source: 'gemini' });
  } catch {
    return Response.json(fallback);
  }
}
