# Research — Foundry-to-G2 HUD: connection simplification, view selection, D&D sheet UI, composited FPS

**Feature**: 001-foundry-g2-hud · **Date**: 2026-06-18

This plan slice is an enhancement of the existing system, not greenfield. "Research" here means
deciding HOW to realize the user's direction against the current codebase. Each decision records
what was chosen, why, and the alternatives rejected.

## D1 — Connection: one direct link (EvenHub app ⇄ bridge ⇄ Foundry/Forge)

- **Decision**: Collapse the connection into a single canonical "direct link": the EvenHub plugin
  connects to ONE configured bridge origin (the public HTTPS domain that fronts Foundry/Forge) with
  one access credential. The connection config is a single source of truth (saved profile:
  `{ bridgeUrl, token }`), entered once (install + paste, no camera/QR), with auto-reconnect.
  Dev-only branches (`VITE_EVF_NO_AUTH`, `VITE_EVF_DEV_BRIDGE_URL`, the `.env.local` override, the
  multi-step wizard detours) are demoted to clearly-gated dev escape hatches and removed from the
  default user-facing path.
- **Rationale**: Today the bridge URL/token can come from the wizard, a dev env var, a default
  `localhost:8910`, or a `.env.local` hack — four sources with subtle precedence. That ambiguity is
  exactly what caused the on-phone failure (the build defaulted to `localhost`, unreachable from the
  phone). One canonical config removes a class of bugs and matches the project's "install + paste"
  pairing model (no QR; the glasses have no camera).
- **Current seams**: `packages/g2-app/src/wizard/is-dev-no-auth.ts` (`devBridgeUrl()` / `isWizardNoAuth()`),
  `packages/g2-app/src/wizard/state.ts`, `packages/g2-app/src/internal/boot-engine-core.ts`
  (`toWsConnectUrl`, auto-connect, `opts.bridgeUrl`/`opts.token`), `packages/g2-app/src/wizard/steps/*`.
- **Alternatives rejected**: (a) keep the four-source precedence — rejected, it is the root of the
  config-ambiguity bugs; (b) bake the bridge URL at build time only — rejected, it prevents a user
  from pointing at their own bridge without a rebuild; the saved-profile path keeps it runtime.
- **Constraint honored**: the bridge remains mandatory (the app cannot speak Foundry's protocol
  directly); "direct link" means a single clean hop to the bridge origin, not bypassing it.

## D2 — View selection: "Party" becomes a roster entry, mode dropdown removed

- **Decision**: Remove the separate map-view **mode** dropdown (off / streaming / actor) from the
  EvenHub settings and fold the choice into the existing **"Personaggio / Ruolo"** selector. The
  roster gains a synthetic top entry **"Party"** (the streaming/overview view, served by the
  streaming user); selecting a real player character requests that character's own view (owner-elected
  capture, consent-gated). Selecting "Party" maps to the streaming-user/party source.
- **Rationale**: The user explicitly asked for this ("forse si può rimuovere il settings su EvenHub
  app e selezionare come user 'Party'"). One selector instead of selector + mode dropdown is simpler
  and removes the actor/streaming/off conceptual overhead for the player. It also resolves the earlier
  confusion where "streaming with a PC" and "actor" had converged in behavior.
- **Current seams**: `packages/g2-app/src/phone/settings-panel.ts` (`buildPlayerViewSelect` to be
  removed; `buildCharacterSelector` to host the "Party" entry + drive `onPlayerViewMode`),
  `packages/g2-app/src/internal/boot-engine-core.ts` (`onPlayerViewMode`, `onSelectActor` wiring),
  `shared-protocol/src/payloads/player-view.ts` (`mode` derived from selection: "Party" → `streaming`,
  a PC → `actor`/owner-capture), the bridge handler + orchestrator (already accept actorId).
- **Alternatives rejected**: (a) keep both controls — rejected per the user's explicit simplification;
  (b) a separate "Party" toggle — rejected, the roster selector already exists and is the natural home.
- **Open detail (resolved by default)**: "off / GM live" is reachable by selecting "Party" when no
  streaming/PC capture is configured (falls back to the GM/default election); a dedicated "off" entry
  is dropped from the user-facing list to keep the selector minimal.

## D3 — D&D-styled card UI for Spell / Inventory / Bio / Skills (+ icons), via the canvas path

- **Decision**: Build the refined sheet UI on the **canvas/compositor path** (not the glyph text
  path), styling each tab (Main, Skills, Inventory, Spellbook, Feats, Bio) to resemble a D&D sheet
  with a shared visual chrome and a small **icon set** (composited, drawn into the canvas — not raster
  image-container icons, which are too few/limited). Icons come from a single `icon-dictionary` module
  so the glyph and canvas paths stay consistent.
- **Rationale**: The canvas compositor (`engine/canvas-compositor.ts` + `layer-manager.ts`) already
  composes z=0 map + z=1 status HUD + z=2 overlay panels and is the default boot path (Phase 20+). The
  agent map confirms `CanvasCharacterSheetPanel.paint()` and the `paint*Tab(ctx, snapshot, bounds,
  font, locale)` signatures are the right seam. Icons drawn into the canvas avoid the 4-image-container
  hard limit (which the map already consumes) and keep INV-1 alignment under our control.
- **Current seams**: `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`,
  `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` (`paintMainTab`/`paintSkillsTab`/…),
  `packages/g2-app/src/panels/inventory-panel.ts`, `spellbook-panel.ts`; new
  `packages/g2-app/src/panels/icon-dictionary.ts`.
- **Alternatives rejected**: (a) image-container icons — rejected, only 4 image containers exist and
  the map uses them; (b) restyle the glyph text path — rejected, the canvas path is the default and the
  only one that can render real D&D-sheet chrome + icons; the glyph path stays as the low-bandwidth
  fallback with its existing Unicode glyphs.
- **INV-1 obligation**: every restyled tab MUST keep character-/pixel-perfect alignment across states,
  content extremes, and IT/EN — snapshot tests gate it.

## D4 — Composited FPS indicator: smaller font, corner-configurable via env var

- **Decision**: Render the FPS readout as a small composited badge (smaller font than the current
  status card), default **bottom-right**, with the corner chosen by a single environment variable
  `EVF_FPS_CORNER ∈ { top-left, top-right, bottom-left, bottom-right }` (g2-app build-time
  `VITE_EVF_FPS_CORNER`, surfaced through the existing settings/kv so it can also be a runtime
  override). The badge is drawn into the z=1 status layer (it is already composited there).
- **Rationale**: The agent map confirms the FPS value is already composited into the z=1
  `CanvasStatusHudLayer` corner card (currently top-right, `CARD_*` constants). The change is: separate
  the FPS into its own small badge, parameterize its corner, shrink the font. A single enum env var
  matches the user's ask ("crea una variabile d'ambiente per … i 4 angoli").
- **Current seams**: `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`
  (`_composeCardLines`, `_drawCornerCard`, `CARD_W/CARD_MARGIN/CARD_PAD/CARD_LINE_H`, `getFps`),
  the env plumbing in `vite`/`import.meta.env` + the settings kv.
- **Alternatives rejected**: (a) keep FPS inside the PF/CA/LV card fixed top-right — rejected, the user
  wants it small and corner-placeable; (b) a free-pixel position — rejected, four named corners is
  simpler and avoids overlapping the status card / map content unpredictably.

## D5 — Code cleanup & optimization

- **Decision**: Treat cleanup as a first-class, test-guarded workstream, not incidental: remove dead
  code surfaced by the above (the removed mode-dropdown path, redundant connection branches, any
  now-unused glyph/raster scaffolding), de-duplicate the icon/glyph lookups behind `icon-dictionary`,
  and keep hot paths within their performance budgets (Constitution IV). Every removal is covered by
  the existing/added tests; nothing is deleted "blind".
- **Rationale**: The recent pivots (browser-capture, owner-election, view-selection) leave seams and
  dead branches; the Constitution (I, VIII) forbids dead code and mandates hygiene.
- **Alternatives rejected**: defer cleanup — rejected; it compounds and the user explicitly asked for it.

## D6 — Documentation update/rewrite

- **Decision**: Update the user-facing and technical docs in the SAME changes (INV-3): the pairing /
  install runbook (`docs/release/evenhub.md`), ADR-0015 (view-selection + connection model),
  `Specs.md` + `README.md` + showcase for any cross-cutting change (version, fps corner var, view-model),
  and the new env var (`EVF_FPS_CORNER`) in `deploy/.env.example` + the g2-app config docs.
- **Rationale**: Constitution VII / INV-3 — a feature is not done until its docs are; the pairing UX
  changed (direct link, "Party" entry) and must be re-documented to match.

## Cross-cutting: testing & validation approach

- Unit-test pure logic (selection→mode mapping, fps-corner geometry, icon lookup) in isolation
  (Constitution II). Integration-test the connection profile + view-selection over the real WS handler
  and the bridge orchestrator. INV-1 snapshot tests gate every restyled tab and the fps badge across
  states/locales. Provide/extend a diagnostic to drive and observe the view selection end-to-end
  (Constitution V — extend `tools/pv-doctor.mjs`).
