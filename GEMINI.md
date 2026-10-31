# GEMINI.md - project rules for The Solar Shade Grid

You are helping 4 students build a hackathon demo: a live dashboard (digital twin) for a solar-canopy market micro-grid. Full spec is in BUILD_GUIDE.md. Read only the section the prompt names.

## Stack (do not add other packages without asking)
Next.js App Router + TypeScript, Tailwind, shadcn/ui, Recharts, framer-motion, lucide-react, @supabase/supabase-js, @google/genai, twilio.

## Hard rules
1. `lib/engine.ts` is finished and tested. NEVER edit it. Import from it: `tick`, `createInitialState`, `modeOf`, `fmtClock`, `fmtRuntime`, `templateLog`, `C`, types.
2. The simulation runs in the browser. UI reads one shared state from `lib/sim-context.tsx`.
3. Every outside service needs a fallback: Gemini -> `templateLog`, Twilio -> on-screen SMS preview, Supabase -> local state. The app must work with no internet and no env vars.
4. Never put API keys in client code. Gemini and Twilio are called only from `app/api/*/route.ts`.
5. Palette (use CSS variables, never hard-code colours in components):
   teal #0F3A40, teal-card #264F54, amber #F5A623, green #1F8A5B, red #D4533B, blue #2B7BB9, purple #6F4FC1, paper #F1F5F4, ink #12313A.
6. Dark theme = blackout. Put class `dark` on `<html>` when `gridLive` is false. Body background transitions over 700 ms.
7. Animation: only the key motions listed in BUILD_GUIDE section 7.4. Respect `prefers-reduced-motion`. Recharts: `isAnimationActive={false}` for live data.
8. Target screens: 1366x768 and 1920x1080, no page scroll in dashboard view.

## Working style (saves my free-plan quota)
- Edit only the files the prompt lists. Do not refactor other files.
- Do NOT open the browser, run the dev server, or run `npm run build`. I test myself. At the end run `npx tsc --noEmit` once and fix only errors in files you touched.
- Do not install packages unless the prompt says so.
- Finish with at most 5 lines: files changed, and anything I must do by hand (env vars, SQL).
- If something in the prompt is ambiguous, pick the simplest option and say which in one line. Do not ask questions.
