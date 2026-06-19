# Quickstart — Validate the Foundry-to-G2 HUD slice

**Feature**: 001-foundry-g2-hud · validation/run guide (no implementation code here).

## Prerequisites

- Repo bootstrapped: `pnpm install --frozen-lockfile`.
- Bridge reachable over HTTPS (homelab Docker) fronting a FoundryVTT + dnd5e world.
- A paired test device or the Even Hub simulator; `tools/pv-doctor.mjs` available.

## Gate checks (run after each change)

```bash
pnpm lint:ci
pnpm typecheck
pnpm test            # workspace; coverage ≥80% held
```

## Scenario 1 — Direct-link connection (D1)

1. Configure a single connection profile (`{ bridgeUrl, token }`) — no dev env vars.
2. Boot the plugin (simulator or device).
3. **Expect**: the plugin connects to the configured bridge and reaches a live HUD; no build defaults
   to `localhost`; dropping/restoring the bridge auto-recovers to live within ~30 s.
   - Observe with: `node tools/pv-doctor.mjs report` (bridge reachable, a live WS session).

## Scenario 2 — View selection: Party vs PC (D2)

1. In the plugin options, open the single **"Personaggio / Ruolo"** selector (the mode dropdown is gone).
2. Select **Party** → **Expect**: the glasses show the overview/streaming source.
   - `node tools/pv-doctor.mjs report` shows the streaming intent.
3. Select a **consenting PC** → **Expect**: that PC's view appears (owner-elected capture).
4. Select a **non-consenting PC** → **Expect**: a clear "source unavailable" status; the private view
   is never shown.
   - Drive directly: `node tools/pv-doctor.mjs set actor <actorId>` and `set streaming`.

## Scenario 3 — D&D-styled sheet tabs + icons (D3)

1. Open the character sheet on the glasses; cycle tabs (Main, Skills, Inventory, Spellbook, Feats, Bio)
   via ring gestures.
2. **Expect**: each tab renders the D&D-sheet chrome with icons; layout is character-/pixel-perfect and
   identical across content extremes (HP `7` vs `700`, long names, overflow) and IT/EN.
   - Gated by INV-1 snapshot tests; capture simulator screenshots for visual confirmation.

## Scenario 4 — Composited FPS badge corner (D4)

1. Build with default env → **Expect**: small FPS badge bottom-right (smaller font), part of the
   composited raster, toggled by `[F] FPS`.
2. Rebuild with `VITE_EVF_FPS_CORNER=top-left` → **Expect**: badge moves to top-left; fully on-screen;
   no overlap with the status card.
   - Gated by an INV-1 snapshot per corner.

## Scenario 5 — Cleanup & docs (D5/D6)

1. **Expect**: no dead code remains for the removed mode dropdown / redundant connection branches
   (Biome + tsc clean; coverage held).
2. **Expect**: `docs/release/evenhub.md` (direct-link install), `docs/architecture/0015-*` (view model),
   `deploy/.env.example` (`EVF_FPS_CORNER`), and `Specs.md`/`README`/showcase reflect the changes in the
   same commits (INV-3).

## Baseline (T001 — recorded 2026-06-18)

Clean-env baseline on `feat/hud-raster-rendering` (no `packages/g2-app/.env.local`):
`pnpm install --frozen-lockfile` ✓ · `pnpm lint:ci` ✓ · `pnpm typecheck` ✓ ·
`pnpm test` = **3804 passed** (278 files), gates green.

> **Coverage gate (pre-existing branch debt):** `pnpm test:coverage` FAILS the 80% global
> *branch* threshold on this feature branch — measured **76.69%** at the pre-feature base commit
> (`0f0821f`) and **76.87%** after feature 001 (a slight *improvement* — the new code is
> well-tested). The shortfall is dominated by untested WIP feature-001 never touched:
> `bridge/src/headless/*` (auth-bootstrap 0%, playwright-browser ~7%), `g2-app/src/hud/*` (~29%),
> and `boot-engine-core.ts`. Lifting it requires tests for that pre-existing headless/hud code,
> tracked separately from this slice. All other gates are green (lint:ci, typecheck,
> changeset:status, 3867/3867 tests pass).
>
> Local-only caveat: with the gitignored `packages/g2-app/.env.local`
> (`VITE_EVF_NO_AUTH=true`, set for on-phone dev testing) present, Vite loads it into the
> Vitest run and 6 wizard tests fail (the wizard skips the token step → STEP1 advances to
> STEP3). This is the dev-hack that **T014** demotes out of the default path; in CI (no
> `.env.local`) the baseline is fully green.

## US3 D&D-sheet restyle — manual visual gate (T030)

The canvas restyle (D&D double-frame chrome + corner brackets + header rules, content
inset inside the frame, AC/INI/VEL vitals drawn as shared-dictionary icons) is verified by
unit tests (`dnd-sheet-restyle.test.ts`: canvas icon path + INV-1 width invariance across
HP 7/700, long name, condition overflow, IT/EN) and the existing INV-1 fixtures (byte-identical
glyphs after consolidation). **Pending manual gate**: open the EvenHub simulator against a live
bridge+Foundry session and cycle the 6 tabs to confirm the look on a real frame, then attach the
screenshots here. (Requires the full deploy; not capturable in CI.)

## Performance note (T037)

No hot-path regression is expected from this slice: the D&D sheet chrome is pre-baked once
into an `ImageBitmap` (drawn via a single `drawImage` blit per paint), the FPS badge is a tiny
z=1 draw (one rect + one short text), and the icon-dictionary consolidation produces
byte-identical glyph output (zero render-cost change). The live compositor frame-budget
measurement (capture/encode/post + ingress/egress fps via `pv-doctor` / `frame_stats`) is a
**manual gate** requiring the full bridge+Foundry deploy and is run alongside the T030 visual gate.

## Definition of done (slice)

- All five scenarios pass; all gates green; INV-1 snapshots cover every restyled tab + the FPS badge in
  all four corners; docs updated in-commit; `pv-doctor` can drive/observe Party vs PC selection.
