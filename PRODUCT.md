# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The glasses app is a web app running in the Even Realities phone app's WebView (Even Hub `.ehpk`,
GitHub Pages `/app/`, Vite in development). Its two faces are the **glasses HUD** — pixels and
firmware text on the G2's 576×288 4-bit green display, driven through the Even Hub SDK — and the
**phone page** (pairing, status, settings). The third surface is the Foundry VTT module window
«Collega occhiali G2» in the player's browser tab.

## Users

- **Primary: any Even Hub user who plays D&D 5e on Foundry VTT** and installs the app from the
  store without knowing us. They sit at a physical table (minis, paper maps, a human GM) wearing
  Even Realities G2 glasses and an R1 ring, and their job is to play their character without
  looking away from the table. Onboarding, copy and error recovery must work with no help from
  the authors.
- **Secondary: the GM** of such a group, who may install the module, help a player pair, or run
  the projector tab for a player without their own device.
- The maintainer's own group (The Forge, Foundry V14, sessions in Italian) is the first real
  table, not the target audience.

## Product Purpose

Project a Foundry VTT D&D 5e session onto the G2 glasses as a glanceable HUD — the player's
real character sheet, turn and action economy, the scene map, rolls and results — and let the
player act (attack, cast, use items, end the turn) from the R1 ring, with Foundry executing it.

Success: during play the player never has to look at a phone or a laptop. If a design forces
that, it is wrong (Core Value, `Specs.md`).

## Positioning

- **A real D&D sheet on the glasses**: the player's Foundry character, read live, rendered as a
  paper D&D character sheet in green pixels — the true data, readable at a glance.
- **Actions without touching the PC**: attacks, spells, items and end of turn from the ring;
  Foundry runs them through its real workflow (ADR-0011 write path), not a mirror.
- **Deterministic, no AI**: every action is an explicit gesture. Voice/AI may only ever be an
  optional extra (new ADR), never a dependency.
- **Nothing to run or log into**: no login on the phone, no GM required, works with The Forge;
  the player's own Foundry tab is the projector (ADR-0019).

## Operating Context

- A live tabletop session: dice, minis, paper, conversation; the HUD is peripheral and must be
  read in under a second.
- Input is only the R1 ring / temple touchpad: press, double-press, swipe-up, swipe-down
  (long-press only as an extra shortcut, ADR-0012). No keyboard, no text entry on the glasses.
- Feedback is visual only: the G2 has no speaker. The phone camera is used only to scan the
  pairing QR.
- Setup happens once, on the phone and in the Foundry tab (QR or 16-character code); after that
  the phone stays in a pocket and the pairing reconnects by itself.
- Foundry VTT ≥ 13.347 (v14 verified) with dnd5e ≥ 5.3.3, self-hosted or on The Forge; PHB 2014
  and 2024 rules.

## Capabilities and Constraints

- Hardware (Even Realities, non-negotiable): 576×288 4-bit greyscale shown green; at most 4 image
  tiles on the 2×2 grid of 288×144 anchored at (0,0) plus text containers; images draw over
  text; firmware text has no font, size or alignment control; one image update at a time,
  ≥ 100 ms apart, over BLE of ~10–30 KB/s; map ≤ 1 fps and only on change.
- An Even Hub store app reaches only the exact origins whitelisted in its package (no wildcards).
- Terminology is one glossary across glasses, phone page, Foundry window, docs and showcase
  (e.g. «Collega occhiali G2», «Scansiona QR», «Ingrandisci QR»).
- **Open decision — connection layer.** The maintainer asked (2026-11-01) for a single project
  tailnet (Tailscale) instead of the Cloudflare relay. That conflicts with two confirmed facts
  above — a public Even Hub audience and "nothing to run or log into": every player would need
  Tailscale on phone and laptop and to join the project's tailnet (free plan: 6 users). To be
  settled in a new ADR before any implementation; the relay (ADR-0019) stays until then.

## Brand Commitments

- Name: EvenFoundryVTT (EVF); store listing «FoundryVTT G2 HUD».
- The glasses HUD must look like a real D&D character sheet (paper / D&D Beyond conventions as
  4-bit images: portrait top-left, square scene map top-right), in the phosphor-green CRT/VFD
  look; character-perfect alignment across states and locales (INV-1). Confirmed by the
  maintainer; design contract `docs/design/g2-sheet-ux.html`.

## Evidence on Hand

- Design contract and reference renders: `docs/design/g2-sheet-ux.html`, `docs/design/img/`.
- Real simulator captures of every HUD state: `pnpm --filter @evf/g2-app sim:check`
  (16 demo scenes, Even Hub simulator 0.9.5).
- QR scanning measured on 840 simulated phone photos (`packages/g2-app/src/phone/qr-scan.ts`).
- No store reviews, user testimonials or usage figures exist yet — do not invent them.

## Product Principles

1. **Eyes stay on the table.** Anything that needs the phone or the laptop during play is a bug.
2. **Glance first.** The state that matters now (HP, turn, a reaction to take, a failure to fix)
   is legible in under a second; everything else can wait a gesture.
3. **Same gesture, same meaning.** Four canonical gestures with one grammar on every panel; no
   function reachable only by long-press.
4. **Foundry is the truth.** Show and act on the real Foundry data and workflow; never a copy
   that can drift.
5. **Recover without help.** Every failure says what happened and what to do next, on the surface
   the player is looking at, in their language.

## Accessibility & Inclusion

- Italian first, English complete: every user-facing string in both, width-budgeted at build
  time (INV-1); the locale follows Foundry with a device override.
- Phone page and Foundry window meet WCAG 2.2 AA: contrast, ≥ 44 px targets, errors linked to
  their fields, correct document language.
- Glasses: legible at a glance on the real optics (no micro-text carrying critical facts),
  visual-only feedback, nothing time-critical hidden in the periphery.
