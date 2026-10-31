// app/api/sms/route.ts
// POST { soc: number (0-100), gridLive: boolean, runtime: string }
// Sends one SMS to DEMO_PHONE with Twilio. Returns { ok: true, body } or { ok: false, error, body }.
// The UI shows 'Sent via Twilio' only when ok is true, otherwise a clearly labelled preview.
import twilio from 'twilio';

export async function POST(req: Request) {
  let soc = 0;
  let gridLive = true;
  let runtime = '--';
  try {
    const b = await req.json();
    soc = Math.min(100, Math.max(0, Math.round(Number(b?.soc) || 0)));
    gridLive = b?.gridLive !== false;
    runtime = typeof b?.runtime === 'string' ? b.runtime.slice(0, 40) : '--';
  } catch {
    return Response.json({ ok: false, error: 'Bad request', body: '' });
  }

  const body =
    'Solar Shade Grid: battery ' + soc + '%, grid ' + (gridLive ? 'LIVE' : 'BLACKOUT') +
    (gridLive ? '' : ', runtime ' + runtime) + '.';

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.DEMO_PHONE;
  if (!sid || !token || !from || !to) {
    return Response.json({ ok: false, error: 'Twilio is not configured', body });
  }

  try {
    const client = twilio(sid, token);
    await client.messages.create({ from, to, body });
    return Response.json({ ok: true, body });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 120) : 'Twilio error';
    return Response.json({ ok: false, error: message, body });
  }
}
