# Hudi Controller — Rive Integration Docs (Next.js)

Live state-machine demo + integration documentation for the Hudi
character rig, covering Milestone 2 · Part 1 (eye tracking + the four
emotion reaction animations).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Status — real `.riv` is in place

`public/hudi.riv` is now `hudi_rig_v2_final.riv` — the finished rig,
including eye tracking (`eye_x`/`eye_y`), blink, lipsync, the four
emotion triggers (`playJoy`, `playSadness`, `playSurprise`,
`playThinking`), and all four gestures (`greet`/`celebrate`/`point`/`wave`)
with the complete state machine wiring. No inputs are placeholders
anymore — every button in the live demo should light up.

## Structure

- `app/layout.js` — fonts (Space Grotesk + JetBrains Mono) and metadata
- `app/page.js` — the live demo + full documentation page
- `app/globals.css` — the black documentation theme, `#4719EA` stage background
- `public/hudi.riv` — placeholder rig file (see above)
- `public/audio/hope-great-day.mp3` — sample clip for the lipsync demo

## Deploy

Works as-is on Vercel: `vercel deploy`, or connect the repo in the
Vercel dashboard.
