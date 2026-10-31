# The Solar Shade Grid - Build Guide for Google Antigravity (free plan)

Goal: a judge-ready web dashboard that shows the whole idea live: solar canopies, the micro-utility hub, the digital twin math, a heatwave, a blackout, an AI log and an SMS alert, all in a 3-minute auto-playing story.

Definition of done: press **Play 3-minute story** and it runs the 5 scenes from slide 7 without you touching anything, on the laptop you will present with, with the internet switched off.

---

## 1. Antigravity on the free plan: how not to run out

- Free plan = weekly rate limit. Google meters **agent work done**, not number of prompts, so a long agent run that loops costs more than five small prompts. Exact numbers are not published; the model picker in your account is the source of truth.
- The free tier lists Claude models only until **2 Nov 2026**. Plan for **Gemini only**.
- Tab completion and inline command requests (Cmd/Ctrl+I) are unlimited on free. Use them for small edits, colours, text, one-line fixes. Do not summon the agent for those.
- Default model: a **Gemini Flash** model (cheaper per token, so you get many more runs). Use **Gemini Pro** only for prompt P3 (the map) and for a bug Flash failed twice.
- Mode: **Planning** for multi-file features (read the plan, fix it, then approve; that catches mistakes before they cost quota). **Fast** for small changes.
- One prompt = one feature = one new conversation. Long chats carry more context and burn more.
- Never let the agent test in the browser. You run `npm run dev` and look yourself.
- When you hit an error, paste only the first 15 lines of it.
- Commit to Git after every prompt that works. If the agent breaks something: `git checkout .` and re-prompt smaller.
- Each teammate uses their own Google account and builds their own part, so you have 4 quotas, not 1.
- Quota runs out? Section 13.

(Menu names may differ slightly in your Antigravity version. Use what you see.)

---

## 2. Do this by hand first (zero quota)

Accounts: Google (Antigravity, AI Studio key), GitHub, Supabase, Twilio (trial), Vercel.
Install: Node.js LTS, Git, Antigravity.

```
npx create-next-app@latest solar-shade-grid --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
cd solar-shade-grid
npx shadcn@latest init
npx shadcn@latest add button card tabs badge slider sonner tooltip
npm i recharts framer-motion lucide-react @supabase/supabase-js twilio @google/genai
mkdir lib supabase components
```

Copy the three files from this pack:
- `engine.ts` -> `lib/engine.ts` (finished, tested: deterministic, heatwave, blackout runtime all verified)
- `GEMINI.md` -> project root (Antigravity reads it as project rules; if yours does not, paste its text at the start of the first chat)
- `BUILD_GUIDE.md` -> project root

Then: `git init`, push to GitHub, import the repo in Vercel (deploy day 1 so deployment problems show up early). Open the folder in Antigravity.

`.env.local` (never commit; add the same keys in Vercel project settings):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=          # copy the current Flash model id from aistudio.google.com
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
DEMO_PHONE=+91XXXXXXXXXX   # a number you verified in the Twilio console
```

Test Twilio **today**: verify your number and a teammate's number, send one test SMS from the Twilio console. Trial accounts only text verified numbers and prefix a trial message. If India delivery fails, the on-screen SMS preview is your demo path (section 8).

---

## 3. Architecture (simple on purpose)

```
Browser
 |- lib/engine.ts            pure math: tick(state, dt) -> new state   (the Twin Engine)
 |- lib/sim-context.tsx      setInterval loop, controls, history, one shared state
 |- components/*             map, cards, charts, terminal, sidebar
 |- lib/supabase.ts          write-through every ~2 s + Realtime subscription (Live Ledger)
 |
 |- POST /api/log  -> Gemini -> one plain-English sentence  (fallback: templateLog)
 |- POST /api/sms  -> Twilio -> SMS to DEMO_PHONE           (fallback: on-screen preview)
```

Why the engine runs in the browser: no network delay so animation stays smooth, trivially testable, and it still matches the slide claim "same inputs always give the same outputs". Supabase stores the stall rows and wallets, so the ledger is real and persistent.

Slide 4 says the API routes host the twin engine. Honest answer if asked: the engine is a pure module with no browser APIs, so it runs identically in a Next.js route; for the demo it runs client-side for smoothness.

---

## 4. Supabase (paste in SQL Editor, then enable Realtime)

```sql
create table grid_state (
  id int primary key default 1,
  battery_soc numeric, grid_live boolean, hour numeric,
  mode text, coop_pool numeric, updated_at timestamptz default now()
);
create table stalls (
  id text primary key, name text, temp numeric, load_kw numeric,
  status text, wallet numeric, updated_at timestamptz default now()
);
insert into grid_state (id, battery_soc, grid_live, hour, mode, coop_pool) values (1, 0.7, true, 9, 'normal', 0);

-- hackathon prototype only: open access with the anon key, virtual credits, no real money
alter table grid_state enable row level security;
alter table stalls enable row level security;
create policy "demo all" on grid_state for all using (true) with check (true);
create policy "demo all" on stalls for all using (true) with check (true);

alter publication supabase_realtime add table grid_state, stalls;
```
Supabase free projects pause after a week of inactivity: open the dashboard once on Monday morning.

---

## 5. Engine facts you need (so you can defend them)

Constants (in `C`): 12 kW canopy, 20 kWh LiFePO4 battery, efficiency 0.82, 8 stalls, cold storage 1.2 kW (1.8 kW when hot), misting 0.8 kW, stall fans+lights 0.18 kW (0.28 kW when hot), safety lights 0.04 kW per stall, tariff Rs 6 per kWh (virtual credits).

- Sunlight `Hsun = max(0, sin(pi*(hour-6)/12))`: zero at night, peak at noon.
- Ambient temperature = 26 + 10*Hsun (+10 in heatwave). Above 42 C = "hot": misting on, storage boosted, stall cards amber.
- Equations 1, 2, 3 are exactly the slide's. `dt` is a parameter: slide says 1 h per tick; the demo uses 0.25 h per tick so changes are visible in seconds. Same maths, finer step.
- Load shedding: grid dead OR delta-E < 0. Shed = fans and misting off; safety lights and cold storage stay on.
- Known flaw, already fixed: Equation 2 adds the whole battery into Eavail, so delta-E alone would show a "surplus" at night. So delta-E only decides shedding; **payouts come from the real energy flow of that tick**, and only when the battery is at least 80%.
- Blackout runtime = usable battery energy / net draw. Shows "sustained by solar" if generation covers the critical load.
- Infinity cannot be sent as JSON: use `fmtRuntime()` for display.

Simulation defaults: start 09:00, SOC 70%, one tick every 1500 ms, dt 0.25. Speed slider 1x / 2x / 4x changes the interval.

---

## 6. File map

```
app/layout.tsx, globals.css, page.tsx
app/api/log/route.ts       Gemini + fallback
app/api/sms/route.ts       Twilio + fallback
components/TopBar.tsx  Sidebar.tsx  MarketMap.tsx  StallCard.tsx  StallGrid.tsx
components/PowerChart.tsx  LogTerminal.tsx  LedgerPanel.tsx  BatteryRing.tsx
components/AnimatedNumber.tsx  StoryOverlay.tsx  SmsPreview.tsx
components/InstallTab.tsx  LiveMathTab.tsx
lib/engine.ts (done)  sim-context.tsx  story.ts  supabase.ts  format.ts
supabase/schema.sql (section 4)
```

---

## 7. UI / UX spec

### 7.1 Look
Same identity as the slides. Headings: a serif (Lora or Source Serif 4). Body: Lato. Both via `next/font`. Light theme: paper background, white cards, soft shadows, 12 px radius. Dark (blackout) theme: background #0A1F23, cards #11343A, amber accents, red for alerts. Big readable numbers, because judges stand 2 m away.

### 7.2 Layout (desktop, no scroll)
- **Top bar (64 px):** logo + title, clock `HH:MM` with sun/moon icon, grid badge (LIVE green pulse / BLACKOUT red), battery ring %, co-op pool Rs, runtime chip (only in blackout).
- **Left sidebar (260 px):** buttons Normal, Heatwave Peak, Simulate Blackout, Dispatch Alert; speed slider; Reset; big **Play 3-minute story** button with a progress bar.
- **Centre top:** MarketMap SVG. **Centre bottom:** generation vs demand area chart (last 48 ticks).
- **Right column (340 px):** Live Ledger header (synced dot) + 8 stall cards in a 2x4 grid.
- **Bottom strip (150 px):** log terminal.
- **Tabs above the content:** Dashboard | How it's installed | Live Math.

### 7.3 Components
- **MarketMap** (SVG, viewBox 960x420): sky with a sun that moves along an arc by hour (moon at night); PV canopy bar across the top whose panel cells brighten with Hsun; 8 stalls below it (colour = status, name, temperature); mist nozzle dots under the canopy that emit falling droplets when cooling is on; a **DC bus** path from canopy to hub with moving dashes, speed proportional to generation, stopped when generation is 0; hub box with battery fill bar, snowflake pulsing for cold storage, inverter label; a grid pylon on the far right with a line that flows green outward when selling, red inward when importing, and shows a broken X in blackout. Shed stalls turn grey with a small safety-light glow. In dark theme the scene dims and only the hub and safety lights glow. A caption chip over the map shows the current scene in large type.
- **StallCard:** name, status pill (OK / HOT / SHED), animated temperature, load kW, wallet Rs with count-up.
- **PowerChart:** Recharts AreaChart, two series (generation amber, demand teal), no animation on live data, subtle grid.
- **LogTerminal:** always dark, monospace, new lines type out at ~12 ms per character, tag `[AI]` or `[RULE]`, max 50 lines, auto-scroll.
- **LiveMathTab:** the three equations with the **current numbers substituted** live, and a green/red banner for surplus vs shedding.
- **InstallTab:** the 5 install steps from slide 3 as a stepper; clicking next highlights that part of a small diagram (frame, canopy, DC bus, hub, stall plugs).
- **SmsPreview:** phone-shaped popup showing the exact SMS text. Label it "Sent via Twilio" or "Preview (Twilio unavailable)" truthfully.

### 7.4 The only animations (do these well, skip the rest)
1. Light-to-dark theme transition on blackout (700 ms).
2. Energy-flow dashes on the DC bus and grid line.
3. Animated numbers (count up / down) for temperature, wallet, pool, SOC.
4. Battery ring stroke with spring easing.
5. Stall card colour/status change with a short layout transition.
6. Terminal typing + the scene caption chip sliding in.

---

## 8. API routes

**POST /api/log**: body `{ result: TickResult, gridLive: boolean, mode: string }`. Calls Gemini (`GEMINI_MODEL`) with: "You are the assistant of a vendors' solar co-op. In ONE plain sentence of at most 25 words, explain to a market vendor why the grid is doing this. No jargon, no markdown." plus the numbers. 4-second timeout. Any error returns `{ text: templateLog(...), source: 'template' }`, success returns `source: 'gemini'`. Never call it every tick: only on events (heatwave starts, blackout starts, shedding starts, first payout) and at most once per 8 s; other lines use `templateLog` directly.

**POST /api/sms**: body `{ soc, gridLive, runtime, mode }`. Sends "Solar Shade Grid: battery 64%, grid BLACKOUT, runtime 3 h 34 min." with Twilio to `DEMO_PHONE`. Returns `{ ok: true }` or `{ ok: false, error }`; the UI then shows the SmsPreview labelled as a preview.

---

## 9. The 3-minute story (`lib/story.ts`)

A list of `{ at: seconds, caption, run }` timers, cancelable, with progress.

| At | Scene | Action |
|---|---|---|
| 0:00 | 1 Normal | reset, hour 9, SOC 70%, grid live, speed 1x. Caption "A normal day: generation and load balanced" |
| 0:40 | 2 Heatwave | heatwave on, jump to 12:00. Caption "Heatwave: 46 C. Misting on, cold storage boosted" |
| 1:20 | 3 Blackout | grid off, jump to 18:00, dark theme. Caption "Blackout: battery feeds safety lights and cold storage" |
| 2:00 | 4 Gemini log | force one /api/log call; glow the terminal. Caption "The AI explains the shortfall" |
| 2:30 | 5 Twilio SMS | call /api/sms; show SmsPreview. Caption "Alert sent to a phone" |
| 3:00 | End | summary overlay: Cooler markets / Safer produce / Shared income with real totals (Rs paid out, kWh generated, runtime left) |

Verified in testing with these exact settings: blackout at 18:00 starts with about 10 h of runtime, and the runtime counts down while the battery drops from 82% to about 32% over the scene.

---

## 10. Prompts for Antigravity (paste one at a time, new conversation each)

**P1 - Foundation** (Fast, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md sections 7.1 and 7.2.
Edit only: app/layout.tsx, app/globals.css, app/page.tsx, components/TopBar.tsx, components/Sidebar.tsx.
Set up fonts (Lora + Lato via next/font), the palette as CSS variables with a .dark variant, body background transition 700ms, and the app shell: top bar, left sidebar, tabs (Dashboard / How it's installed / Live Math), empty placeholder panels with the right sizes. Use fake static props for now.
```

**P2 - Simulation state** (Fast, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md sections 5 and 7.2.
Create lib/sim-context.tsx exporting SimProvider and useSim(). It holds GridState from lib/engine.ts, runs tick() with setInterval (1500ms / speed, dt 0.25), keeps the last 48 TickResults as history, and exposes: setHeatwave(bool), setBlackout(bool), jumpToHour(h), reset(), speed/setSpeed, playing/pause. Blackout also toggles the `dark` class on <html>.
Edit app/layout.tsx to wrap the app in SimProvider, and wire TopBar (clock, grid badge, battery %, co-op pool, runtime chip) and the Sidebar buttons to it. Add components/AnimatedNumber.tsx (framer-motion count-up).
```

**P3 - Market map** (Planning, Pro)
```
Read GEMINI.md and BUILD_GUIDE.md section 7.3 (MarketMap) and 7.4.
Create components/MarketMap.tsx: an SVG (viewBox 960x420) driven by useSim(). Implement exactly the elements listed: moving sun/moon, PV canopy cells brightness by hsun, 8 stalls coloured by status, mist droplets when coolingKw > 0, animated DC bus dashes with speed proportional to genKw, hub with battery fill and pulsing snowflake, grid pylon line (green out when soldKwh>0, red in when gridImportKwh>0, broken X when !gridLive), grey shed stalls with a small amber safety-light glow, dim scene in dark theme. Use CSS keyframes for dashes and droplets, not JS timers. Show it on the Dashboard tab.
```

**P4 - Cards, chart, ledger** (Fast, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md sections 7.2 and 7.3 (StallCard, PowerChart).
Create components/StallCard.tsx, StallGrid.tsx (2x4 grid), PowerChart.tsx (Recharts area chart of history: genKw amber vs demandKw teal, isAnimationActive false) and LedgerPanel.tsx (co-op pool + "synced" dot, local data for now). Place them in the Dashboard layout. Cards use animated numbers and a short layout transition on status change.
```

**P5 - Controls + story** (Planning, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md sections 7.2 (Sidebar) and 9.
Create lib/story.ts with the scene timeline and components/StoryOverlay.tsx (scene caption chip over the map, progress bar, end summary overlay with real totals from sim state). Wire the "Play 3-minute story" button, a Stop button, and the Heatwave Peak (heatwave on, jump 12:00) and Simulate Blackout (grid off, jump 18:00) buttons. Dispatch Alert will call a function dispatchAlert() that I will implement later: for now it just opens SmsPreview with text built from the state.
```

**P6 - Gemini, SMS, terminal** (Fast, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md sections 8 and 7.3 (LogTerminal, SmsPreview).
Create app/api/log/route.ts and app/api/sms/route.ts exactly as specified, using @google/genai and twilio and the env var names in section 2. Create components/LogTerminal.tsx with typing effect and the event-based log rules (only call /api/log on events, max once per 8s, otherwise templateLog), and components/SmsPreview.tsx. Implement dispatchAlert() in lib/sim-context.tsx.
```

**P7 - Supabase ledger** (Planning, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md sections 3 and 4.
Create lib/supabase.ts. If the env vars are missing, export a no-op client so the app still runs. Every ~2 seconds upsert the 8 stalls and the grid_state row from sim state (one batched call). In LedgerPanel subscribe to Realtime on `stalls` and show wallets from the database with a green "synced" dot, or "local" when Supabase is unreachable. Edit only lib/supabase.ts, components/LedgerPanel.tsx and one useEffect in lib/sim-context.tsx.
```

**P8 - Install tab + Live Math tab** (Fast, Flash)
```
Read GEMINI.md and BUILD_GUIDE.md section 7.3 (InstallTab, LiveMathTab) and section 5.
Create components/InstallTab.tsx (5-step stepper from slide 3 with a small SVG diagram that highlights the current part) and components/LiveMathTab.tsx (the three equations from lib/engine.ts shown with the current numbers from state.last substituted in, plus the surplus / load-shedding banner). Mount them in the tabs.
```

**P9 - Polish** (Fast, Flash, repeat in small pieces)
```
Read GEMINI.md. Do these only: (1) make sure nothing scrolls at 1366x768 and 1920x1080 in the Dashboard tab; (2) add prefers-reduced-motion fallbacks; (3) add aria-labels to buttons; (4) make text on the map and cards at least 14px; (5) remove console errors and unused imports. Do not change behaviour.
```

---

## 11. Timeline (today is Saturday evening)

| When | Do |
|---|---|
| Sat 7-9 pm | Section 2 by hand, deploy to Vercel, verify Twilio numbers |
| Sat 9-11 pm | P1, P2 (commit after each) |
| Sun 8 am-1 pm | P3, P4, P5 |
| Sun 2-7 pm | P6, P7, P8 |
| Sun 7-10 pm | P9, fix bugs, **freeze features at 10 pm** |
| Sun 10-11 pm | Record a screen video of one perfect story run (backup) |
| Mon morning | Rehearse 3 times with a timer; deploy; test on the venue Wi-Fi and projector; also run `npm run build && npm start` locally as an offline backup |

Split: Dishanth + Ravindra on P2, P6, P7 and the engine questions. Sanika + Varshini on P1, P3, P4, P8, P9. P5 together. Work in separate files; pull before you start; commit every hour.

If you must cut scope, cut in this order: Supabase realtime, Install tab, Live Math tab, real Twilio (keep the preview). Never cut: engine, map, stall cards, chart, theme switch, story button, terminal.

---

## 12. Test checklist before Monday

- [ ] Story runs start to finish with no clicks, ~3:00
- [ ] Same story works with Wi-Fi off (Gemini lines say [RULE], SMS shows preview, ledger says local)
- [ ] Blackout switches to dark theme and back on Reset
- [ ] Heatwave turns stall cards amber and shows misting
- [ ] Runtime chip counts down in blackout
- [ ] No page scroll at 1366x768 and 1920x1080, full-screen at 100% zoom
- [ ] Keys are only in `.env.local` / Vercel, never in GitHub

---

## 13. If your Antigravity quota runs out

1. Switch to a teammate's account for the next prompt.
2. Use inline Cmd/Ctrl+I and Tab completion (unlimited on free) for small edits.
3. Paste the same prompt and the file into **Google AI Studio** (free) or a free Claude chat, copy the result into the file yourself.
4. Shrink the scope using the cut order in section 11.

---

## 14. Likely judge questions

- **Is the data real?** No: sensors are simulated behind one interface (slide 7); real IoT replaces it without changing the engine.
- **Why deterministic math, not AI?** Money and safety decisions must be explainable and repeatable; the AI only writes the plain-English log.
- **Your equation 2 includes the battery. Doesn't that fake a surplus?** Yes if used alone, so delta-E only triggers shedding; payouts come from the real energy flow and only above 80% battery.
- **Slide says 1 hour per tick, demo is faster?** Same equations with a smaller step (dt = 0.25 h) so changes are visible in seconds.
- **How do virtual credits become money?** Prototype uses virtual credits in an isolated ledger; a real version settles through the co-op's bank account or UPI after a metering agreement.
- **Cost and payback?** Do not quote numbers you have not sourced. Get one real quote for panels, LiFePO4 battery and cold storage from a vendor before Monday.
- **Why not rooftop solar per stall?** Open-air stalls have no roof; a shared canopy gives shade first, power second, and one shared battery and cold store.
