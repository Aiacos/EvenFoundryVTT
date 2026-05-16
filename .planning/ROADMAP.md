# Roadmap: EvenFoundryVTT (EVF)

## Overview

EVF projects a D&D 5e FoundryVTT session onto Even Realities G2 AR glasses (576×288 4-bit phosphor green) controlled by an R1 ring, so the player never looks away from the physical table. The journey is a **13-phase MVP** (Phase 0 → 10, target ~14 weeks with Phase 4 split into 4a/4b per research) followed by an **OPZIONALE V2** (Phase 11 → 13: foundry-mcp server, voice/AI tuning, stretch features). Roadmap mirrors `Specs.md` v0.9.11 §10 — the canonical 13-phase plan validated across 5 cross-check rounds — with research-SUMMARY adjustments: Phase 0 scope expansion (multi-environment BLE, sustained DLE 30 min, queue-depth table, palette calibration, format probe, MidiQOL config gate); Phase 4 split into 4a (raster + status HUD, weeks 4-5) and 4b (overlay slot + map mode toggle + adversarial gaps, weeks 6-7) for clean Phase 5 dependency; CONN-01..05 pulled forward into Phase 2 (pairing UI doesn't depend on writers); INV-5 "Gesture Determinism" ratified in Phase 6; Phase 7 single-workflow-origin discipline option A; Phase 10 field test extended for fatigue + microwave RF test + NASA-TLX.

Specs.md is the canonical SoT; this roadmap is the GSD-shaped projection. Drift policy: Specs.md wins (§11.5 + INV-3 doc coherence).

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, …): Planned MVP work (mirrored from Specs.md §10)
- Decimal phases (4a, 4b): Phase 4 split per research SUMMARY architecture critique
- Phases 11-13: V2 OPZIONALE (post-MVP, not gating)

MVP = Phase 0 → 10. V2 OPZIONALE = Phase 11 → 13.

- [x] **Phase 0: Validation Gates** - Hardware/SDK GO/NO-GO tests (R1 events · `updateImageRawData` format · BLE bandwidth multi-env · DLE 30-min sustained · queue depth · palette calibration · MidiQOL config check) → ADR-0005 decision document *(3/3 plans complete — ADR-0005 PROVISIONAL-ACCEPTED Branch A via INV-2 lit-review; OQ-INV2-1.a/4 resolved via Even Realities simulator probe + SDK polyfill — see STATE.md Quick Tasks 2026-05-14)*
- [x] **Phase 1: Foundation** - Monorepo skeleton + shared protocol + CI + first 5 ADRs + versioned config schema + INV-1/2/3/4 binding *(3/3 plans complete — Wave 0+1+2 ✅; INV-3 atomic doc-coherence verified via single commit 671a22d)*
- [x] **Phase 2: Foundry Module Core + Pairing UI** - `module.json` + versioned `dnd5e@5.x` adapter + readers (character/combat/scene/log) + WS handshake + locale auto-detect + phone-side bootstrap wizard + QR pairing flow *(5/5 plans complete)*
- [x] **Phase 3: Bridge Service Skeleton** - Fastify + ws + bearer auth + Tool Registry + REST + healthz/readyz/metrics + idempotency keys + seq envelope + replay buffer + Docker Compose *(5/5 plans complete)*
- [x] **Phase 4a: G2 Engine + Raster + Status HUD** - Layer manager + persistent Status HUD + raster pipeline (image-q + upng-js + xxhash-wasm + OffscreenCanvas) + 6-layer optimization stack + glyph fallback + boot splash + capability handshake *(6/6 plans complete 2026-05-15; hardware-pending SC deferred to `human_needed` per ADR-0005 Branch A; ADR-0009 ACCEPTED)*
- [x] **Phase 4b: Overlay Slot + Map Mode Toggle + Adversarial UI** - Stable layer-manager API for Phase 5 + map mode toggle + toast queue + boot error states + death-saves HUD + concentration-drop modal primitive *(6/6 plans complete 2026-05-15; hardware-pending SC deferred to `human_needed` per ADR-0005 Branch A; ADR-0009 Amendment 1 ACCEPTED documenting differential demolish + container budget audit + in-process gesture-bus)*
- [x] **Phase 5: Panel Plugin System + Read-Only Panels** - Panel API contract + 6-tab Sheet + Combat tracker + Log + Inventory + Spellbook + i18n width budget + dual-edition support (completed 2026-05-15)
- [x] **Phase 6: R1 Integration + Quick Action + INV-5** - R1 event source provider + event routing to top layer + Quick Action menu on long-press + cross-overlay reachability verification + ratify INV-5 Gesture Determinism
- [ ] **Phase 7: Foundry Module Write Path** - `activity.use()` wrapper + targets + AoE templates + socketlib executeAsGM (single-workflow-origin option A) + MidiQOL workflow + multi-attack tracker + reaction passive-notification toast + concentration-drop trigger
- [ ] **Phase 8: Manual Action UX** - Spellbook tap-to-cast + inventory tap-to-use + combat overlay quick actions [A][S][I][M] + action-result toast banners
- [ ] **Phase 9: Action Economy & Edge Cases** - Action/Bonus/Reaction enforcement widget + spell slot consumption + concentration drop handling end-to-end + multi-attack flow
- [ ] **Phase 10: Polish & Field Test MVP** - Error recovery (bridge disconnect/Foundry restart/network blip) + offline mode + latency profiling (<400 ms p50) + **multi-session field test** with fatigue measurement + microwave RF test + NASA-TLX score + docs + runbook
- [ ] **Phase 11: V2 `foundry-mcp` Server** *(OPZIONALE)* - MCP TS SDK 1.29.0 + tools mirror of Tool Registry + resources + stdio + Streamable HTTP + Claude Desktop verification
- [ ] **Phase 12: V2 Voice UX Tuning** *(OPZIONALE)* - System prompt + worked examples A/B/C end-to-end + IT↔EN STT spell-name lookup
- [ ] **Phase 13: V2 Stretch** *(OPZIONALE)* - Reaction *execution* (ACT-04) + biometric narrative cues + multi-player sync + dnd5e v6.x adapter + PF2e + Sheet/Token portrait + DSN raster stream + bridge-side headless Foundry + advanced dither

## Phase Details

### Phase 0: Validation Gates
**Goal**: Convert hardware/SDK speculation into binary GO/NO-GO + measured metrics so Phase 1+ design is empirical, not speculative. Output: ADR-0005 with §10.0.5 Branch A/B/C decision documented + Specs §10.0.10 P2 gates triaged.
**Depends on**: Nothing (first phase — gating gate for everything downstream)
**Requirements**: MIDIQ-01
**Success Criteria** (what must be TRUE):
  1. ADR-0005 exists and documents Branch A/B/C decision for raster vs glyph default (Specs §10.0.5)
  2. R1 gesture timing windows (tap/double-tap/long-press/scroll) are measured and locked, enabling INV-5 Gesture Determinism design in Phase 6 (Specs §10.0.1)
  3. `updateImageRawData` byte format is identified (PNG indexed vs raw 4-bit nibble order) and a Phase 4 raster vs glyph default is selected based on Specs §10.0.2 + palette calibration sub-step (pitfall 15 linearize-before-dither)
  4. BLE bandwidth measured in 3 environments (clean / 5GHz-loaded / 2.4GHz+microwave) with p50/p95/p99 documented; sustained 30-min DLE test confirms (or rejects) 15 fps stretch feasibility; queue-depth → behavior table {1,2,3,≥4} populated for raster scheduler (Specs §10.0.3 + §10.0.7 + §10.0.8 extended per research)
  5. MidiQOL `autoFastForward` config probe runs at boot and surfaces a clear remediation toast if mode is wrong; `relationships.requires` declaration plan locked for Phase 2 `module.json`
**Plans:** 4 plans
Plans:
**Wave 1**
- [x] 00-01-PLAN.md — Test infrastructure scaffolding: package.json + tsconfig + _shared utilities (output, schemas, stats, branch-decision, hub) + ADR-0005/0006 template stubs + evidence dir placeholders (Wave 0) — complete 2026-05-10 (commits 40732fe + f301aaf + 96f4c85)
- [x] 00-02-PLAN.md — MidiQOL config probe (REQ MIDIQ-01) + Foundry-side mini-module + run-all.ts orchestrator with --skip-hardware flag (Wave 1, software-only) — code complete 2026-05-10 (commits 15e9922 + c1c82e5); evidence emission pending Plan 04 operational step
- [x] 00-03-PLAN.md — 6 hardware test scripts (10-0-1 R1 timing, 10-0-2 image format, 10-0-3 BLE multi-env, 10-0-7 DLE sustained, 10-0-8 queue depth, 10-0-9 palette calibration) — type-check green, execution gated on Even Hub access (Wave 1) — code complete 2026-05-10 (commits 15e9922 absorbed Task 1 + 3b2578d Task 2 + 8670b0c fix-up); Pattern 3 capability-negotiation skip verified across all 6 scripts; T-00-03 zero network introspection verified; upng-js@2.1.0 added with ambient .d.ts

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 00-04-PLAN.md — Phase closure: execute tests, populate ADR-0005 with Branch verdict, resolve ADR-0006 conditional content, INV-3 doc coherence + atomic commit (Wave 2, NOT autonomous — requires hardware + researcher manual steps)

### Phase 1: Foundation
**Goal**: Stand up the empty monorepo so every later phase has a stable scaffold (lint/test/build/CI + ADR framework + versioned config schema + binding invariants).
**Depends on**: Phase 0 (Branch decision must be in ADR-0005 before applicative code starts)
**Requirements**: *(structural — no direct v1 REQ-IDs land here; foundation for all subsequent phases)*
**Success Criteria** (what must be TRUE):
  1. `pnpm install && pnpm test && pnpm build` succeeds on a clean clone for all 5 packages (`foundry-module`, `bridge`, `g2-app`, `shared-protocol`, `shared-render`)
  2. CI fails the build on `// TODO` without issue-link, on Biome diagnostics, on Vitest coverage <80% core / <90% boundary, and on cross-package type drift (INV-4 enforced)
  3. ADRs 0001 (layered-ui-model), 0002 (protocol-versioning), 0003 (tool-registry-pattern), 0004 (voice-via-mcp-not-internal), 0008 (code-quality-config) exist and are referenced from `docs/architecture/README.md`
  4. Versioned config schema `config/schema.json` + migration `0001_init` round-trips a fixture; telemetry event schema is locked (avoid thousand-paper-cut renames)
  5. Snapshot-test framework (ASCII layout fixtures, INV-1 layout integrity) is wired in `shared-render` and consumed by `g2-app` Vitest suite
**Plans:** 3 plans
Plans:
**Wave 0**
- [x] 01-01-PLAN.md — Tooling foundation: package.json + pnpm-workspace + tsconfig.base + biome.jsonc + vitest.config + .changeset/ + commitlint + husky + .nvmrc/.gitattributes/.editorconfig/.gitignore (Wave 0) — ✅ 2026-05-11 (16 files, 3 commits, all 6 gates G1-G6 green)
**Wave 1** *(blocked on Wave 0)*
- [x] 01-02-PLAN.md — Workspace packages + validation-harness fold-in: scaffold 5 new packages (g2-app, bridge, foundry-module, shared-protocol, shared-render) + promote tests/phase-0/ → packages/validation-harness/ with repo-root path-resolution (Pitfall 8 mitigation) (Wave 1) — ✅ 2026-05-11 (25 files created + 11 modified + 16 git-mv + 6 deleted, 3 commits, all 5 gates G1-G5 green; tests/phase-0/ entirely removed)
**Wave 2** *(blocked on Wave 1)*
- [ ] 01-03-PLAN.md — ADRs + snapshot framework + CI + INV-3 closure: 5 MADR ADRs (0001/0002/0003/0004/0008) + shared-render AsciiGrid + matchAsciiFixture + example wire-up test (D-1.16) + .github/workflows/ci.yml 7-gate + CONTRIBUTING.md + atomic INV-3 commit (CLAUDE.md + STACK.md drift correction) (Wave 2, NOT autonomous — human-verify checkpoint for INV-3 doc coherence)

### Phase 2: Foundry Module Core + Pairing UI
**Goal**: Players can pair a G2 to Foundry, the module reads character/combat/scene/log state over a versioned WS, and a phone-side wizard onboards the device — without writing anything yet.
**Depends on**: Phase 1
**Requirements**: FOUN-01, FOUN-04, I18N-01, I18N-03, CONN-01, CONN-02, CONN-03, CONN-04, CONN-05
**Success Criteria** (what must be TRUE):
  1. DM clicks "Pair a G2 device" in Foundry module settings → 24-hour bearer + QR payload `{bridge_url, token, world, expires}` is generated and persisted in the revoke registry (CONN-03 + CONN-05)
  2. Player scans the QR in the Even Realities App phone wizard (3-step: profile/URL → token → character), the wizard persists to Tier 3 storage and survives kill/restart/reboot (CONN-01 + CONN-02); on G2 wear, auto-connect fires without re-pairing (CONN-04)
  3. WS handshake completes with capability negotiation and the locale is auto-detected from `game.i18n.lang` (I18N-01 + I18N-03 — catalogs ship from Foundry+module, G2 ships no strings)
  4. `getCharacterState`, `getCombatState`, `getSceneViewport`, `getEventLog`, `subscribeUpdates` return live `actor.system.*` data via Foundry hooks (no polling); fixtures replay deterministically in Vitest contract tests (FOUN-01)
  5. `TokenLayer.setTargets()` v13 multi-target read works for the player's current targets (singular `Token` API confirmed, FOUN-04)
**Plans**: TBD

### Phase 3: Bridge Service Skeleton
**Goal**: Stand up the Fastify+ws bridge as a CORS-friendly reverse-proxy with bearer auth, a Tool Registry dispatch table, idempotency, sequence envelopes, and ops endpoints — so Phase 4 can wire G2 to real bearer tokens, not mocks.
**Depends on**: Phase 2 (needs bearer issuance flow)
**Requirements**: FOUN-02
**Success Criteria** (what must be TRUE):
  1. Bridge boots via Docker Compose, exposes `/healthz`+`/readyz`+`/metrics` (Prometheus), and rejects requests without a valid 24-hour bearer token (FOUN-02)
  2. `POST /v1/actor/*`, `GET /v1/scene`, `GET /v1/combat` round-trip against the Phase 2 module with WS frame envelope `{proto, seq, ts, type, path?, value?, prev_seq?}` (research cross-cutting concern)
  3. Idempotency keys deduplicate retried POSTs within a 60 s LRU window (research recommendation; prevents R1-tap → POST → WS-replay double-`activity.use()`)
  4. Tool Registry (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets) is callable via REST and listed in `/v1/tools`
  5. Replay buffer holds last 60 s of deltas; on G2 reconnect within window the client resumes from last confirmed seq, otherwise receives a full snapshot via `GET /v1/actor` (no new full-state-dump message invented)
**Plans**: TBD

### Phase 4a: G2 Engine + Raster + Status HUD
**Goal**: G2 boots, completes capability handshake, paints a persistent layered HUD with always-visible Status card, and renders the Foundry scene as a 4-bit dithered raster (or glyph fallback). End of Phase 4a: stable layer-manager API and a working scene pixel pipeline.
**Depends on**: Phase 3
**Requirements**: DISP-01, DISP-02, DISP-03, MAP-01, MAP-02, MAP-03, MAP-04, NAV-04, I18N-04
**Success Criteria** (what must be TRUE):
  1. After QR-paired boot, G2 displays splash → handshake → main HUD with capability negotiation, and the layered HUD invariant holds: exactly 1 capture container at z=2, status HUD always visible at z=1, map base at z=0 (DISP-01 + DISP-02 + NAV-04, INV-1)
  2. The Foundry scene is rendered onto G2 as a 4-bit greyscale dithered raster (4 image container 2×2 = 400×200 px effective) using image-q + upng-js + xxhash-wasm + OffscreenCanvas; xxhash delta encoding, static caching, custom RLE, and adaptive frame rate are active (MAP-01 + MAP-03)
  3. With Branch A inputs, raster sustains ≥5 fps standard with measured BLE p50 latency in Phase 0's measured envelope; Branch B/C path automatically degrades to glyph mode without operator intervention (MAP-02 + MAP-04, Specs §11.5.8.2)
  4. INV-1 snapshot fixtures ck 11-15 pass for default raster view, glyph view, status HUD width-budget under IT (longest-string), EN, and DE strings (DISP-03 + I18N-04)
  5. PIXI canvas extract via OffscreenCanvas hand-off does NOT block the player's own Foundry desktop UI (research pitfall 11 internal performance test passes)
**Plans:** 6 plans
Plans:
**Wave 0**
- [x] 04A-01-PLAN.md — Scaffolding: npm deps (image-q@4.0.0, upng-js@2.1.0, xxhash-wasm@1.1.0) + ADR-0009 scaffold + layer-types.ts interface contracts (incl. `RasterControllerLike` type-only) + test dirs + worker-mock helper

**Wave 1** *(blocked on Wave 0)*
- [x] 04A-02-PLAN.md — Engine: LayerManager singleton (capture-invariant + capability gate + atomic bundle) + page-lifecycle wrappers + capability-handshake WS client + boot-splash 5-step checklist

**Wave 2** *(blocked on Wave 1; Plans 03 + 04 + 06 run in parallel — no files_modified overlap)*
- [x] 04A-03-PLAN.md — Raster pipeline: singleton Web Worker (image-q FS dither + upng-js 4-bit PNG + xxhash-wasm sub-tile delta) + RasterController (200 ms debounce + 0.3 fps heartbeat) + glyph fallback renderer + MapBaseLayer (z=0). Locked at 18 sub-tiles/container per CONTEXT.md Area 2 (6×3 floor, 32×32 px, 72 per full frame).
- [x] 04A-04-PLAN.md — Status HUD (z=1) + i18n width budgets (IT/EN/DE build-time `satisfies` gate + adversarial typecheck test) + IdleInfillLayer (z=0.5) + 9 INV-1 ASCII fixtures (ck 11-15 dedicated tests).
- [x] 04A-06-PLAN.md — Foundry PIXI canvas extraction + WS `frame_pixels` protocol (`shared-protocol/src/payloads/frame.ts` `FramePixelsSchema`) + g2-app `scene-input.ts` dispatcher (B-5 gap-closure plan).

**Wave 3** *(blocked on Wave 2; NOT autonomous — human-verify checkpoint for hardware-pending SC)*
- [x] 04A-05-PLAN.md — Integration: production `bootEngine` entry (Option B split — `internal/boot-engine-core.ts` body + thin `index.ts` wrapper + `@internal` `index.test-support.ts` for test-only DI; W-4 grep gate enforced) + end-to-end `scene-renderer-smoke.test.ts` (SR-1..SR-10) + ADR-0009 ACCEPTed + human-verify checkpoint resolved 2026-05-15 via `defer-hardware-tests` resume signal — 5 hardware-pending SC formally acknowledged on `human_needed` gate per ADR-0005 PROVISIONAL Branch A; closure pending real-G2 grant via `pnpm --filter @evf/validation-harness validate:all`.


### Phase 4b: Overlay Slot + Map Mode Toggle + Adversarial UI
**Goal**: Lock the overlay layer-manager contract so Phase 5 panels plug in cleanly, and land the four adversarial UI primitives (toast queue, boot error states, death-saves HUD, concentration-drop modal) that the spec mockups happy-path.
**Depends on**: Phase 4a
**Requirements**: MAP-05, DEATH-01, TOAST-01, BOOT-01, CONC-01
**Success Criteria** (what must be TRUE):
  1. The overlay slot (z=2) accepts any panel that conforms to the Panel API contract; panel swap-in does not break Status HUD persistence or capture container count (MAP-05 prerequisite)
  2. Quick Action `[M] Map ctrl` hot-swaps raster ↔ glyph at runtime without re-handshake; setting `view.map.mode` persists device-local (MAP-05)
  3. Toast queue holds max 2 visible FIFO 3 s; a 9th simultaneous toast (Fireball + 8 saves stress case) squashes into "+N more" without dropping any (TOAST-01, research Vector C)
  4. The five boot error states (handshake failed / version mismatch / no character / bridge unreachable / token expired) each render a distinct screen with a recovery hint and a `[X]` close gesture (BOOT-01, research Vector C)
  5. At HP=0 the Status HUD pivots to a 3-strike death-saves visual tracker; on a "cast concentration spell while already concentrated" event the overlay slot opens a confirm modal that requires explicit tap to break the previous concentration (DEATH-01 + CONC-01)
**Plans**: 5 plans (4 waves)
- [x] 04B-01-PLAN.md (wave 0) — Overlay slot machinery + Panel API contract + ZIndex.Z1_5_TOAST + panel-gesture-bus + ADR-0009 Amendment 1 + i18n-budgets 27 keys (MAP-05)
- [x] 04B-02-PLAN.md (wave 1) — Map mode toggle + Even Hub setLocalStorage persistence + boot read-back (MAP-05)
- [x] 04B-03-PLAN.md (wave 2) — Toast queue z=1.5 + FIFO + [+N] squash badge + 3 INV-1 fixtures (TOAST-01)
- [x] 04B-04-PLAN.md (wave 2, parallel with 04B-03) — Boot error UI 5 states + bootErrorFromException dispatch + bootEngineWithErrorUi wrapper + 10 INV-1 fixtures (BOOT-01)
- [x] 04B-06-PLAN.md (wave 2, parallel with 04B-03 + 04B-04) — Atomic CharacterSnapshotSchema.death + concentration.ts envelope schemas + character-reader extension + 6-file workspace fan-out in single commit (DEATH-01 schema, CONC-01 schema)
- [x] 04B-05-PLAN.md (wave 3) — Death-saves StatusHudRenderer pivot + ConcentrationDropModalPanel + conc-conflict-dispatcher (B-4) + 04b-integration-smoke ISM-01..10 + 4 INV-1 fixtures (DEATH-01, CONC-01)

### Phase 5: Panel Plugin System + Read-Only Panels
**Goal**: Auto-discovered panel plugins render a 6-tab Foundry-faithful character sheet, a combat tracker, log, inventory, and spellbook — all read-only, all dual-edition aware, all i18n-correct.
**Depends on**: Phase 4b (needs stable overlay slot)
**Requirements**: SHEET-01, SHEET-02, SHEET-03, SHEET-04, COMB-01, COMB-03, I18N-02, I18N-05
**Success Criteria** (what must be TRUE):
  1. Player cycles 6 sheet tabs (Main / Skills / Inventory / Spells / Feats / Bio) via R1 tap with equal-width tab strip swapping `[ XXX ]` ↔ `[▶XXX ]` (SHEET-01 + SHEET-04, INV-1 ck 14)
  2. All sheet data binds live to `actor.system.*` via Foundry hooks with zero polling; `core.modernRules` setting toggles PHB 2014 ↔ PHB 2024 rendering at runtime (SHEET-02 + SHEET-03)
  3. Combat tracker shows current turn, initiative order, effects, and concentration source+duration; quick-action bar `[A][S][I][M]` is visible on Combat overlay (COMB-01 + COMB-03)
  4. Quick Action `[N] Language` overrides locale device-local without touching Foundry world settings; with IT + EN canonical strings all sheet panels render within the width budget; DE/ES/FR/PT-BR best-effort renders without layout break (I18N-02 + I18N-05)
  5. Adding a new mock panel takes ≤5 minutes via `import.meta.glob` auto-discovery without touching core (Panel API contract verified)
**Plans:** 6/6 plans complete
Plans:
**Wave 0**
- [x] 05-01-PLAN.md — PanelRouter + import.meta.glob discovery + PanelMetaSchema + LOCALE_MENU + HUD_WIDTH_BUDGETS Phase 5 extension (~82 keys) + widened HudLocale + per-key EN fallback + CharacterSnapshotSchema.world.modernRules + CombatantSchema.concentration + character/combat reader extensions + ADR-0010 (architecture + atomic foundation)

**Wave 1** *(blocked on Wave 0)*
- [x] 05-02-PLAN.md — CharacterSheetPanel skeleton: 6-tab state machine + buildTabStrip + view.sheet.lastTab persistence + 6 INV-1 tab-strip fixtures (SHEET-01, SHEET-04)

**Wave 2** *(blocked on Wave 1)*
- [x] 05-03-PLAN.md — CharacterSheet tab renderers: Main/Skills/Feats/Bio per-tab pure functions + dispatcher + dual-edition branches + 6 INV-1 fixtures (SHEET-02, SHEET-03)

**Wave 3** *(blocked on Wave 2; Plans 04 + 05 run in parallel — zero files_modified overlap)*
- [x] 05-04-PLAN.md — InventoryPanel + SpellbookPanel + sheet-tab renderer dispatcher swap + CharacterSnapshotSchema inventory + spells extensions + 7 INV-1 fixtures (SHEET-01, SHEET-02, SHEET-03)
- [x] 05-05-PLAN.md — CombatTrackerPanel + LogPanel + 5-row windowing + concentration sub-line + quick-action bar render-only + LogEventSchema + log-reader + 6 INV-1 fixtures (COMB-01, COMB-03)

**Wave 4** *(blocked on Wave 3)*
- [x] 05-06-PLAN.md — Locale override locale-override.ts + boot-engine step 9c read-back + 05-panel-integration-smoke harness + 8 INV-1 stress + canonical fixtures (I18N-02, I18N-05)

### Phase 6: R1 Integration + Quick Action + INV-5
**Goal**: R1 ring events flow to the top layer with deterministic semantics; Quick Action menu is reachable from every overlay; INV-5 Gesture Determinism is ratified as project invariant.
**Depends on**: Phase 5 (panels exist to receive routed events)
**Requirements**: NAV-01, NAV-02, NAV-03
**Success Criteria** (what must be TRUE):
  1. R1 gestures route to the top-of-stack layer: tap=cycle, double-tap=back, scroll=navigate, long-press=Quick Action — with the timing windows locked in Phase 0 §10.0.1 (NAV-01)
  2. Long-press from any of the 8 reachable screens opens the Quick Action menu `[S][C][L][B][I][A][M][N][X]` as a list-modal full-screen; scroll=select, tap=open, long=cancel (NAV-02)
  3. Cross-overlay reachability + closability checklist §7.14.4 ck 1-15 passes: every overlay is reachable from every other overlay in ≤2 gestures, and `[X]` closes from every overlay (NAV-03)
  4. Status HUD footer displays a context chip `R1: tap=cycle scroll=nav long=quick[combat]` that names the menu long-press will open *right now* (INV-5 visible enforcement, research Pitfall 5)
  5. INV-5 "Gesture Determinism" is ratified in `docs/architecture/INVARIANTS.md` and binds for the rest of the project (research recommendation, addresses Pitfall 5)
**Plans:** 4/4 plans executed (PHASE CLOSED)

Plans:

**Wave 0**
- [x] 06-01-PLAN.md — R1 wire schema + DEFAULT_R1_TIMINGS + attachR1EventSource + LayerManager.getTopLayer + Layer.getR1Hints? + LocaleEventEmitter + INVARIANTS.md (atomic Wave 0)

**Wave 1** *(blocked on Wave 0)*
- [x] 06-02-PLAN.md — QuickActionMenuPanel + PanelRouter.pushOverlay/popOverlay overlay stack + [N] Language sub-menu wired to persistLocaleOverride + LocaleEventEmitter + 4 INV-1 fixtures + 20 i18n keys (1244 tests; `1d929db` + `6408fd4`)

**Wave 2** *(blocked on Wave 1; files_modified overlap on i18n-budgets.ts gates this wave)*
- [x] 06-03-PLAN.md — StatusHudRenderer.renderContextChip + per-panel getR1Hints on 5 Phase 5 panels + parseR1HintString helper + 5 INV-1 chip fixtures + 12 hud_r1_* i18n keys (NAV-01 visible enforcement)

**Wave 3** *(blocked on Wave 2; NOT autonomous — Phase 6 closure)*
- [x] 06-04-PLAN.md — 06-cross-overlay-reachability COR-01..COR-15 harness (Specs §7.14.4 ck 1-15 1:1) + panel-gesture-bus single-receiver invariant (PGB-SR-01..05) + attachQuickActionLongPress dispatcher + boot-engine R1/long-press/conc-conflict wiring (Phase 6 closure)

### Phase 7: Foundry Module Write Path
**Goal**: GM-side `activity.use()` execution via `socketlib.executeAsGM` only (single-workflow-origin option A) wires up cast/attack/use end-to-end; multi-attack tracker and reaction passive-notification join MVP; concentration-drop modal trigger and chat-message audit log close the loop.
**Depends on**: Phase 6 (R1 events drive writes)
**Requirements**: FOUN-03, ACT-02, ACT-03, MULTI-01, REACT-01
**Success Criteria** (what must be TRUE):
  1. A Shortsword attack issued from G2 → bridge POST → Foundry module → `socketlib.executeAsGM` → `activity.use({configure: false, event: null})` produces a chat card and damage in the test world; the player client never directly invokes the activity (FOUN-03 + ACT-03, research Pitfall 1 + 6 — single-workflow-origin option A)
  2. AoE template placement works for spells with multiple templates via `AbilityTemplate.fromActivity()` array iteration; template position confirms via R1 tap (ACT-02)
  3. A Fighter L5+ Action shows `Atk 1/2` → `Atk 2/2` tracker; the second attack consumes correctly via the chosen route (`activity.use({count: 2})` or client-side loop — Phase 0 §10.0.10 P2 row resolved) (MULTI-01)
  4. When the player is targeted by a Shield/Counterspell/Opportunity Attack trigger, a passive-notification toast surfaces on G2 (display-only, no execution — execution stays V2 ACT-04) (REACT-01)
  5. Bearer rotation runs every 24 h with a 60 s grace window; every `executeAsGM` handler re-validates permissions; chat-message audit log records each GM-side action (research cross-cutting)
**Plans:** 6 plans
Plans:
**Wave 0**
- [ ] 07-01-PLAN.md — Tool Registry + IdempotencyStore (bearer-bound SHA256 keys) + audit-log writer + foundry-globals.d.ts (game.users + ChatMessage + dnd5e namespace) + ADR-0011 ACCEPTED + CI Gate 8 single-workflow-origin guard

**Wave 1** *(blocked on Wave 0)*
- [ ] 07-02-PLAN.md — Replace 4 of 7 socketlib stubs in-place: cast-spell + weapon-attack (single attack) + use-item + move-token handlers calling activity.use({configure:false}) via dispatchTool; registerComplexHandler count stays 14 (Pitfall 7 closure) — FOUN-03, ACT-03

**Wave 2** *(blocked on Wave 1; Plans 03 + 04 run sequentially — both touch shared-protocol/src/index.ts merge surface per RESEARCH §Wave 2 parallelism note)*
- [ ] 07-03-PLAN.md — AoE template placement: AbilityTemplate.fromActivity (sync, bypasses drawPreview) + per-template R1 confirm flow + TemplatePlacementPanel (z=2 overlay) + createEmbeddedDocuments commit + skillCheck stub renamed → confirmTemplatePlacement in-place (count stays 14) — ACT-02
- [ ] 07-04-PLAN.md — Multi-attack Path B (RESEARCH §Q1 — count NOT supported by dnd5e 5.3.3 ActivityUseConfiguration): client-side loop in weapon-attack handler with count arg + r1.multiattack.progress envelope via bridgeDeltaEmitter + CombatTrackerPanel [Atk N/M] chip extension + INV-1 fixture — MULTI-01

**Wave 3** *(blocked on Wave 2)*
- [ ] 07-05-PLAN.md — Reaction watcher (dnd5e.preUseActivity — CORRECT hook name per RESEARCH §Q3, NOT preActivityUse) + r1.reaction.available envelope + reaction-toast-dispatcher into Phase 4b toast queue + drop-concentration handler (effect.delete via executeAsGM) + ConcentrationDropModalPanel dual-emit (tool.invoke + legacy conc.drop.confirmed) + setTargets stub renamed → dropConcentration in-place (count stays 14) — REACT-01, CONC-01 closure

**Wave 4** *(blocked on Wave 3; NOT autonomous — Phase 7 closure with hardware-pending SC carry)*
- [ ] 07-06-PLAN.md — Bearer rotation scheduleBearerRotation() reusing generateBearer(refresh=true) infra (RESEARCH §Q6) + bearer.rotated envelope + 07-write-path-integration-smoke ISM-W7-01..08 + STATE.md PHASE_7_CLOSED + ROADMAP flip + INV-3 atomic commit

### Phase 8: Manual Action UX
**Goal**: Player can cast a spell, use an item, attack, or move entirely via R1 from the G2 overlays; every action surfaces a result toast.
**Depends on**: Phase 7 (write path online)
**Requirements**: ACT-01
**Success Criteria** (what must be TRUE):
  1. Spellbook tap-to-cast: scroll spell → tap → target picker via R1 scroll on Combat overlay → confirm tap → chat card on Foundry (ACT-01 cast variant)
  2. Inventory tap-to-use: scroll item → tap → automatic effect → chat card (ACT-01 use variant)
  3. Combat overlay quick actions `[A]ttack [S]pell [I]tem [M]ove` each launch the matching flow with target selection (ACT-01 attack variant)
  4. Every completed action shows a result toast (§7.10 State 3 reused without voice) — d20 + outcome + damage; failures show an error toast that names the cause
  5. Target picker handles the empty-target edge case gracefully (no crash, "no targets" hint)
**Plans**: TBD

### Phase 9: Action Economy & Edge Cases
**Goal**: Action / Bonus / Reaction enforcement is visible and binding; concentration drop, multi-attack, and slot consumption all behave correctly under real combat sequencing.
**Depends on**: Phase 8
**Requirements**: COMB-02
**Success Criteria** (what must be TRUE):
  1. Action economy widget renders Action / Bonus / Reaction / Move slots used vs available; client-side precondition tool blocks a second Action in the same turn (COMB-02)
  2. Concentration drop flow (started in Phase 4b modal + Phase 7 trigger) end-to-end: casting a new concentration spell while concentrating opens modal → on confirm previous concentration drops in Foundry, on cancel the cast is aborted
  3. Multi-attack flow (started in Phase 7) completes: Fighter L5 burns Action once for both attacks; widget reflects single Action consumption
  4. Spell slot consumption auto-suggests the highest available slot for upcast; downcast is selectable via R1 scroll before confirm
  5. Reaction-prompt UI fires when the player becomes a Shield/Counterspell candidate; passive-notification (REACT-01) is the *display* mechanism but reaction-slot accounting in the widget is wired here
**Plans**: TBD

### Phase 10: Polish & Field Test MVP
**Goal**: Harden recovery paths, profile latency, run a real 4-hour D&D session (extended per research to multi-session for fatigue measurement + microwave RF test + NASA-TLX self-report) with a consenting DM, and ship the docs.
**Depends on**: Phase 9
**Requirements**: *(no new v1 REQ-IDs land — Phase 10 verifies cross-cutting behavior across all prior phases)*
**Success Criteria** (what must be TRUE):
  1. Bridge disconnect / Foundry restart / 30-second network blip each recover with `⚠ SYNC LOST` chip + buffered events + automatic reconnect + replay-buffer resume from last confirmed seq (Specs §11.5.8.1)
  2. Latency profile p50 manual-action <400 ms end-to-end (R1 gesture → chat card on Foundry); profile recorded in `docs/perf/phase-10-latency.md`
  3. **Multi-session field test** completed across ≥2 real D&D sessions with a consenting DM (research extension: not just one 4 h session); NASA-TLX or Borg CR-10 eye-fatigue self-report score recorded; mid-session DM-setting-change broadcast verified (research Pitfall 8)
  4. **Microwave / 2.4 GHz worst-case RF test** completed in-session; G2 either sustains raster or degrades cleanly to glyph (Specs §11.5.8.2) without losing session state (research Pitfall 2)
  5. README, setup guide, video demo, runbook, firmware compatibility matrix (research Pitfall 7) all shipped under `docs/`; INV-1..5 verification suite is green
**Plans**: TBD

### Phase 11: V2 `foundry-mcp` Server (OPZIONALE)
**Goal**: V2 enabler — expose the same Tool Registry over MCP so Claude Desktop / any MCP client can drive Foundry actions through natural language. MVP is unaffected; this is plug-and-play.
**Depends on**: Phase 10 (MVP shipped)
**Requirements**: VOICE-02, VOICE-03 *(v2 — tracked in REQUIREMENTS.md v2 section, not in MVP coverage)*
**Success Criteria** (what must be TRUE):
  1. `foundry-mcp` package uses `@modelcontextprotocol/sdk@1.29.0` with stdio + Streamable HTTP transports only (HTTP+SSE deprecated 2025-03-26)
  2. MCP tools mirror Tool Registry §5.3 with full JSON Schema; resources `actor://current`, `scene://current`, `combat://current`, `log://recent` are exposed
  3. Claude Desktop drives "cast Fireball at the goblins" end-to-end through the same bridge bearer auth as MVP
  4. MCP Inspector returns clean tool listing; npm publish + Docker container for Streamable HTTP remote works
**Plans**: TBD

### Phase 12: V2 Voice UX Tuning (OPZIONALE)
**Goal**: Tune the voice path: GM-Agent system prompt + 3 worked examples + IT↔EN STT spell-name lookup robust against accent and code-switching.
**Depends on**: Phase 11
**Requirements**: VOICE-01, VOICE-04, VOICE-05 *(v2 — tracked in REQUIREMENTS.md v2 section, not in MVP coverage)*
**Success Criteria** (what must be TRUE):
  1. Examples A (Fireball gruppo), B (dual-wield Action+Bonus), C (clarify ambiguity) each pass end-to-end through Claude Desktop
  2. Italian "palla di fuoco" maps to `spell.fireball` via the fuzzy lookup table; EN slang "scorch 'em" surfaces a clarify prompt instead of executing
  3. PCM 16 kHz s16le mono capture via `bridge.audioControl()` flows to external STT (Deepgram Nova-3 / AssemblyAI / self-hosted Whisper); G2 has zero audio output (visual toast only)
**Plans**: TBD

### Phase 13: V2 Stretch (OPZIONALE)
**Goal**: Whatever survives the V2 cull becomes Phase 13. Reaction execution, biometric narrative, multi-player, dnd5e v6.x, PF2e, portraits, DSN raster, headless Foundry, advanced dither.
**Depends on**: Phase 12
**Requirements**: ACT-04, STRETCH-01..STRETCH-08 *(v2 — tracked in REQUIREMENTS.md v2 section, not in MVP coverage)*
**Success Criteria** (what must be TRUE):
  1. Reaction *execution* flow (Shield consume reaction slot + +5 AC; Counterspell ability check; Opportunity Attack via Ready Action) — promoted from REACT-01 passive notification (ACT-04)
  2. At least one stretch ships behind a feature flag (e.g., Sheet portrait via §7.5 100×60 dithered image, or DSN raster stream §7.15.3 Approach B)
  3. Multi-player sync (4× G2 on one world) reaches a prototype gate with measured BLE coexistence
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4a → 4b → 5 → 6 → 7 → 8 → 9 → 10 → [MVP ship gate] → 11 → 12 → 13 (V2 OPZIONALE).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Validation Gates | 1/4 | In progress | - |
| 1. Foundation | 0/3 | Not started | - |
| 2. Foundry Module Core + Pairing UI | 2/5 | In Progress|  |
| 3. Bridge Service Skeleton | 0/TBD | Not started | - |
| 4a. G2 Engine + Raster + Status HUD | 6/6 | Complete (hardware tests deferred — ADR-0005 Branch A `human_needed` carry) | 2026-05-15 |
| 4b. Overlay Slot + Map Mode Toggle + Adversarial UI | 6/6  | Complete (hardware tests deferred — ADR-0005 Branch A `human_needed` carry) | 2026-05-15 |
| 5. Panel Plugin System + Read-Only Panels | 6/6 | Complete   | 2026-05-15 |
| 6. R1 Integration + Quick Action + INV-5 | 3/4 | In Progress|  |
| 7. Foundry Module Write Path | 0/6 | Not started | - |
| 8. Manual Action UX | 0/TBD | Not started | - |
| 9. Action Economy & Edge Cases | 0/TBD | Not started | - |
| 10. Polish & Field Test MVP | 0/TBD | Not started | - |
| 11. V2 `foundry-mcp` Server | 0/TBD | Deferred (V2 OPZIONALE) | - |
| 12. V2 Voice UX Tuning | 0/TBD | Deferred (V2 OPZIONALE) | - |
| 13. V2 Stretch | 0/TBD | Deferred (V2 OPZIONALE) | - |

## Coverage Summary

**v1 requirements mapped:** 48 / 48 ✓ (zero orphans, zero duplicates)

| Category | Count | Phase distribution |
|----------|-------|--------------------|
| Display & HUD | 6 | 4a (3), 4b (3) |
| Map Rendering | 5 | 4a (4), 4b (1) |
| Character Sheet | 4 | 5 (4) |
| Combat & Action | 9 | 4b (1), 5 (2), 7 (4), 8 (1), 9 (1) |
| Navigation & Input | 4 | 4a (1), 6 (3) |
| Foundry Integration | 5 | 0 (1), 2 (2), 3 (1), 7 (1) |
| i18n / Localization | 5 | 2 (2), 4a (1), 5 (2) |
| Connection Bootstrap | 5 | 2 (5) |

**Project code prefix:** `EVF` (per `.planning/config.json` `project_code: "EVF"`, `phase_naming: "sequential"`).

**Key research-SUMMARY adjustments applied:**
- Phase 0 scope expanded: MidiQOL config check, multi-environment §10.0.3 (clean / 5GHz-loaded / 2.4GHz+microwave), sustained §10.0.7 (30 min not 30 s), queue-depth table §10.0.8 {1,2,3,≥4}, palette calibration §10.0.2 sub-step, boot-time format probe
- Phase 4 split into **4a** (raster + status HUD, weeks 4-5) and **4b** (overlay slot + map mode toggle + adversarial UI, weeks 6-7) — clean Phase 5 dependency on stable layer-manager API at week 6
- CONN-01..05 pulled into **Phase 2** (originally implicit in Phase 7 writers; research recommendation — pairing UI doesn't depend on writers, lets Phase 3+4 use real bearer tokens)
- Phase 4b absorbs CONC-01 / DEATH-01 / TOAST-01 / BOOT-01 (overlay primitive layer); Phase 7 trigger wires CONC-01 to write path; Phase 9 wires CONC-01 to action economy
- Phase 6 ratifies new **INV-5 "Gesture Determinism"** invariant (long-press always opens Quick Action of current top layer; visible footer context chip; confirm-before-execute for destructive actions — addresses research Pitfall 5)
- Phase 7 adds **MIDIQ-01 / MULTI-01 / REACT-01** (write-path bedrock + adversarial gaps from research Vector A/B); MIDIQ-01's *config-check probe* lives at Phase 0 boot gate, *`relationships.requires` declaration* lands at Phase 2 module.json
- Phase 7 locked to **single-workflow-origin discipline option A** (`socketlib.executeAsGM` only; player client never invokes `activity.use()` directly — research Pitfall 6)
- Phase 10 field test extended to multi-session for fatigue, microwave RF test, NASA-TLX self-report (research Pitfall 2 + 4 + 7 + 8)

**Specs.md SoT cross-reference:** §10 Roadmap (3221-3540) · §10.0 Phase 0 validation protocol (3225-3393) · §11.5.7 raster pipeline stack (3624-3756) · §11.5.8 failure modes (3758-3796).

---

*Roadmap derived: 2026-05-10 from Specs.md v0.9.11 §10 (canonical 13-phase plan, validated 5 cross-check rounds) + research SUMMARY adjustments (Phase 0 expansion · Phase 4 split · CONN pulled forward · INV-5 ratified · Phase 10 field test extension). Specs.md is the canonical SoT — drift policy: Specs.md wins (INV-3).*
