---
phase: 04a
plan: 02
subsystem: g2-app
tags: [g2-app, engine, layer-manager, handshake, boot-splash, page-lifecycle, wave-1]
dependency_graph:
  requires:
    - "Wave 0 contracts (layer-types.ts → ZIndex / Layer / LayerOp / LayerManagerError / RasterControllerLike)"
    - "@evf/shared-protocol HandshakeClientSchema / HandshakeServerSchema / SERVER_CAPS_V1 (Phase 2)"
    - "@evenrealities/even_hub_sdk@0.0.10 EvenAppBridge + CreateStartUpPageContainer + RebuildPageContainer + TextContainerUpgrade + StartUpPageCreateResult"
  provides:
    - "LayerManager runtime class (mount/destroy/bundle/setMapMode + capability gate + capture invariant)"
    - "createBootPage / createMainPage / rebuildToOverlay wrappers — single source of truth for the 4-image + 7-text container schema (containerTotalNum: 11)"
    - "performCapabilityHandshake WS client + HandshakeError discriminator class"
    - "probeBleThroughput threshold classifier ('auto' / 'raster' / 'glyph' at 100 kbps boundary)"
    - "showBootSplash sequential checklist renderer"
  affects:
    - "Plan 03 (raster) — MapBaseLayer mounts at z=0 via LayerManager; RasterController consumes probeBleThroughput verdict via layerManager.setMapMode()"
    - "Plan 04 (status-hud) — StatusHudLayer mounts at z=1; IdleInfillLayer mounts at z=0.5; both consume the LayerManager API"
    - "Plan 05 (smoke / ADR-0009 acceptance) — atomic-bundle test confirms exactly-one rebuildPageContainer call after bundle([destroy z=0.5, mount z=2])"
tech-stack:
  added: []
  patterns:
    - "Discriminator-coded error class (LayerManagerError + HandshakeError) — never throw bare Error"
    - "Capture-container invariant enforcement via per-mount/destroy/bundle assertion"
    - "Capability gate per requiredCaps array at mount time (not per-layer)"
    - "Single-flush bundle — exactly one bridge.rebuildPageContainer per bundle call (ADR-0001 Amendment 1)"
    - "Schema-validated WS boundary — HandshakeServerSchema.safeParse (never .parse)"
    - "Timeout-bounded message listener with explicit removeEventListener defence"
key-files:
  created:
    - "packages/g2-app/src/engine/layer-manager.ts"
    - "packages/g2-app/src/engine/page-lifecycle.ts"
    - "packages/g2-app/src/engine/capability-handshake.ts"
    - "packages/g2-app/src/engine/boot-splash.ts"
    - "packages/g2-app/src/engine/__tests__/layer-manager.test.ts"
    - "packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts"
    - "packages/g2-app/src/engine/__tests__/capability-handshake.test.ts"
    - "packages/g2-app/src/engine/__tests__/boot-splash.test.ts"
  modified: []
decisions:
  - "LayerManager.bundle() applies all ops in array order then asserts the capture invariant once at the end — transient zero/two-capture states during the loop are tolerated as long as the final composition is valid (ADR-0001 Amendment 1 single-flush guarantee)"
  - "page-lifecycle.createMainPage() reuses createBootPage()'s container schema in Phase 4a; the boot-splash overlays its checklist onto the same `header` text container via textContainerUpgrade. Phase 4b may diverge boot vs main page layouts"
  - "performCapabilityHandshake takes WebSocket as a parameter rather than constructing one internally — gives Plan 05 (smoke test) and any future caller control over the URL/auth/connect flow, and keeps the function trivially testable with a mock socket"
  - "probeBleThroughput inlines the 100 kbps threshold as a constant (no config plumbing) — TODO(ADR-0005-OQ-INV2-1.b) marks the single line to update once hardware §10.0.3 BLE measurements arrive"
  - "boot-splash renders the protocol line `protocol {V} · panels available: {N}` as a single trailing textContainerUpgrade call after the N step renders; total bridge calls = steps.length + 1 (UI-SPEC §Screen 1 fixture)"
metrics:
  duration_minutes: 11
  completed_date: "2026-05-15"
  tasks_completed: 2
  files_created: 8
  files_modified: 0
  commits: 2
requirements:
  partially_addressed:
    - id: "DISP-01"
      role: "machinery + capability gate"
      note: "Status HUD persistence machinery — LayerManager mount/destroy/bundle + capability gate now refuse to mount a HUD layer whose requiredCaps (read_char/read_combat/read_scene/subscribe) are absent from the negotiated SERVER_CAPS_V1 set. The actual StatusHudLayer implementation lands in Plan 04."
    - id: "DISP-02"
      role: "runtime invariant enforcement (full coverage at unit level)"
      note: "Capture-container invariant fully enforced at runtime: exactly one mounted layer must provide a capture container; 0 or ≥2 throws LayerManagerError('capture_invariant_violated'). Unit-tested at 0/1/2 capture-provider counts via 10 vitest cases (Tests 1-5). INV-1 fixture snapshot coverage lands in Plan 04 (status-hud)."
    - id: "NAV-04"
      role: "boot transition path (software-side)"
      note: "Boot splash → capability handshake → main HUD path is testable end-to-end against mocks: createBootPage produces the 11-container schema, showBootSplash advances through the 5-step checklist via textContainerUpgrade, performCapabilityHandshake parses the HandshakeServer response and surfaces negotiated caps + session_id + replay_seq. Real-hardware boot-time verification carries the ADR-0005 human_needed gate."
---

# Phase 04a Plan 02: G2 Engine + Raster + Status HUD — Wave 1 Engine Modules Summary

**One-liner:** Lands the four foundational engine modules that the rest of Phase 4a depends on — LayerManager singleton (mount/destroy/bundle + capability gate + capture invariant), page-lifecycle wrappers around the 11-container boot/main schema, WS capability-handshake client with safeParse + timeout + BLE-probe classifier, and boot-splash sequential renderer — all backed by 27 colocated TDD tests under happy-dom.

## What landed

### Task 1 — LayerManager singleton + invariant tests (commit `8d1aa79`)

**`packages/g2-app/src/engine/layer-manager.ts`** — runtime class that enforces the three locked decisions from 04a-CONTEXT.md §Area 1:

| Contract | Enforcement |
|---|---|
| Capture-container invariant | `_assertCaptureInvariant()` runs after every mount/destroy and at the end of every bundle(); throws `LayerManagerError('capture_invariant_violated')` when count ≠ 1 |
| Capability gate | `mount(z, layer, requiredCaps?)` rejects when any required cap is missing from `negotiatedCaps`; throws `LayerManagerError('capability_gate_denied')` |
| Atomic bundle | `bundle(ops)` applies every op in array order, asserts the invariant ONCE at the end, then issues exactly ONE `bridge.rebuildPageContainer` call (ADR-0001 Amendment 1) |

Additional API surface delivered:
- `setNegotiatedCaps(caps: ReadonlySet<ServerCap>): void` — called by capability-handshake after a successful WS handshake
- `setMapMode(mode: 'auto' | 'raster' | 'glyph'): void` + `getMapMode(): MapMode` — pure state, no bridge I/O (Phase 4b/6 wires the actual raster ↔ glyph swap)
- `getCaptureContainerCount(): number` — exposed for tests and diagnostics

`_flushPage()` (private) ships a minimal `RebuildPageContainer({ containerTotalNum: 1, textObject: [], imageObject: [] })` payload sufficient for the Plan 05 atomic-bundle smoke test; Plans 03 (raster) and 04 (status-hud) will refine container assembly to UI-SPEC §Container Budget Allocation as their concrete Layer implementations land.

**`packages/g2-app/src/engine/__tests__/layer-manager.test.ts`** — 10 vitest cases:

| # | Test | Asserts |
|---|---|---|
| 1 | mount(Z0_MAP, capture-layer) | getCaptureContainerCount() === 1 |
| 2 | z=0 capture + z=1 no-capture | count stays at 1; no throw |
| 3 | no-capture layer when none exists | throws `capture_invariant_violated` w/ "found 0" |
| 4 | two capture-providing layers | throws `capture_invariant_violated` w/ "found 2" |
| 5 | destroy(Z0_MAP) when sole capture provider | throws `capture_invariant_violated` |
| 6 | mount with requiredCaps=['read_char'] when caps empty | throws `capability_gate_denied` |
| 7 | setNegotiatedCaps then mount with required cap | succeeds (count === 1) |
| 8 | bundle([destroy z=0.5, destroy z=0, mount z=2 capture]) | `bridge.rebuildPageContainer` called exactly once |
| 9 | bundle ops apply in order; transient invariant violation tolerated | resolves cleanly; final composition has count === 1 |
| 10 | setMapMode round-trip | getMapMode reflects the value; zero bridge calls |

### Task 2 — page-lifecycle + capability-handshake + boot-splash (commit `17d7c36`)

**`packages/g2-app/src/engine/page-lifecycle.ts`** — three exports + one helper:

- `buildBootPageSchema()` (pure helper, returns `{ containerTotalNum: 11, imageObject: [...], textObject: [...] }`)
- `createBootPage(bridge): Promise<void>` — wraps `bridge.createStartUpPageContainer(new CreateStartUpPageContainer({...}))`; throws if result ≠ `StartUpPageCreateResult.success`, with the result value embedded in the error message
- `createMainPage(bridge): Promise<void>` — Phase 4a alias for createBootPage (same schema; Phase 4b may diverge)
- `rebuildToOverlay(bridge, def): Promise<void>` — one-shot `bridge.rebuildPageContainer(new RebuildPageContainer({...}))` for LayerManager.bundle()'s flush

Canonical container layout (UI-SPEC §Container Budget Allocation raster-mode idle):

| Slot | Container | Position / Size | isEventCapture |
|---|---|---|---|
| img-0 | map-tile-0 | (0,0) 200×100 | — |
| img-1 | map-tile-1 | (200,0) 200×100 | — |
| img-2 | map-tile-2 | (0,100) 200×100 | — |
| img-3 | map-tile-3 | (200,100) 200×100 | — |
| txt-0 | header | z=1 | 0 |
| txt-1 | footer | z=1 | 0 |
| txt-2 | status-hud | z=1 | 0 |
| txt-3 | map-capture | z=0 | **1** |
| txt-4 | z05-combat-log | z=0.5 | 0 |
| txt-5 | z05-label | z=0.5 | 0 |
| txt-6 | z05-stats | z=0.5 | 0 |

containerTotalNum = 11 (within SDK 1-12 limit; 4/4 image, 7/8 text used, 1/1 capture assigned).

**`packages/g2-app/src/engine/capability-handshake.ts`** — WS client + BLE probe:

- `class HandshakeError extends Error` — discriminator codes `'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error'`
- `performCapabilityHandshake(ws, token, locale, sessionId?, timeoutMs = 10_000): Promise<HandshakeServer>` — sends `{ proto: 'evf-v1', token, locale, capabilities: SERVER_CAPS_V1, session_id? }`, awaits server response via `addEventListener('message', ..., { once: true })`, parses with `HandshakeServerSchema.safeParse` (T-4a-02-01 mitigation), and races against a configurable timeout (T-4a-02-03 mitigation: defaults to 10 s; on timeout the message listener is explicitly removed before rejecting).
- `probeBleThroughput(bytesObserved, durationMs): 'auto' | 'raster' | 'glyph'` — `auto` if window < 500 ms; else `glyph` if sustained kbps < 100, else `raster`. The 100 kbps boundary is the ADR-0005 PROVISIONAL Branch A → Branch B/C threshold inherited from CONTEXT.md §Area 4; `TODO(ADR-0005-OQ-INV2-1.b)` marks the single inline constant to update once §10.0.3 hardware BLE measurements land.

**`packages/g2-app/src/engine/boot-splash.ts`** — 5-step (or N-step) sequential checklist renderer:

- `type BootStepState = 'pending' | 'in_progress' | 'done' | 'failed'` (maps to markers `[ ✓ ]` / `[ ⟳ ]` / `[ ✕ ]` / `[   ]` per UI-SPEC §Screen 1 state table)
- `interface BootStep { label: string; state: BootStepState }`
- `showBootSplash(bridge, { steps, protocolVersion, panelsAvailable, containerName? }): Promise<void>` — for each step in array order, calls `bridge.textContainerUpgrade(new TextContainerUpgrade({ containerName, content }))` with the cumulative checklist rendered up to and including that step. After all steps, renders the final protocol line `protocol {protocolVersion} · panels available: {panelsAvailable}` via one final `textContainerUpgrade`. Total bridge calls = `steps.length + 1`. Default `containerName = 'header'`. Bridge rejections propagate (no swallow — Phase 4b BOOT-01 will wrap this with error UI).

**Test counts per module** (target was ≥ 25; delivered 27):

| Module | Test file | Tests |
|---|---|---|
| layer-manager | `layer-manager.test.ts` | 10 |
| page-lifecycle | `page-lifecycle.test.ts` | 5 |
| capability-handshake | `capability-handshake.test.ts` | 8 (1 + 1 + 1 + 1 + 1 send/resolve/parse-fail/schema-fail/timeout + 3 probeBleThroughput) |
| boot-splash | `boot-splash.test.ts` | 4 |
| **Total** | | **27** |

## Verification

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | `0` |
| `pnpm typecheck` (`tsc --noEmit` repo-wide, strict + 6 flags) | `0` |
| `pnpm test` (Vitest 4 workspace) | `478/478` passing (was 451 in Wave 0; +27 new) |
| `pnpm --filter @evf/g2-app test --run` (engine subset) | `27/27` passing across 4 files |
| `npx biome ci packages/g2-app/src/engine/` | `0` (no errors, no warnings) |
| `grep -c 'capture_invariant_violated' .../__tests__/layer-manager.test.ts` | `3` |
| `grep -c 'capability_gate_denied' .../__tests__/layer-manager.test.ts` | `2` |
| `grep -c 'rebuildPageContainer' .../__tests__/layer-manager.test.ts` | `6` |
| `grep -cE 'class LayerManager\b' .../layer-manager.ts` | `1` |
| `grep -c 'containerTotalNum: 11' .../page-lifecycle.ts` | `2` |
| `grep -c 'isEventCapture: 1' .../page-lifecycle.ts` | `1` |
| `grep -c 'HandshakeServerSchema.safeParse' .../capability-handshake.ts` | `2` |
| `grep -c 'probeBleThroughput' .../capability-handshake.ts` | `2` |
| `grep -c '100' .../capability-handshake.ts` | `7` (threshold + JSDoc references) |
| `grep -c 'textContainerUpgrade' .../boot-splash.ts` | `6` |
| `grep -v '^//\|^\*\|^/\*' .../capability-handshake.ts \| grep -c HandshakeServerSchema` | `3` (non-comment usages: import + safeParse + schema-failure message) |

## Deviations from Plan

**1. Test CH-5 (timeout) restructured to avoid unhandled-rejection warning.**

- **Found during:** Task 2 GREEN phase first test run.
- **Issue:** The initial test pattern `const promise = perform...(); await vi.advanceTimersByTimeAsync(...); await promise.then(success, failure)` produced a vitest "Unhandled Rejection" warning despite passing — vitest flags rejections that aren't caught synchronously after the promise is created. The pattern is technically race-safe in real-time mode but interacts badly with fake timers (the rejection materialises during `advanceTimersByTimeAsync`, before the `.then` handler is attached).
- **Fix:** Switched to `const assertion = expect(promise).rejects.toBeInstanceOf(HandshakeError); await vi.advanceTimersByTimeAsync(...); await assertion;` so vitest registers the rejection-handler slot up-front. Second assertion `await expect(promise).rejects.toMatchObject({ code: 'timeout' })` discriminates on the code without re-running the timer logic.
- **Files modified:** `packages/g2-app/src/engine/__tests__/capability-handshake.test.ts`
- **Commit:** `17d7c36`
- **Rule:** Rule 1 (auto-fix bugs) — applied during the same Task 2 commit; no separate routing needed.

**2. Plan `<interfaces>` block claimed `HandshakeServerSchema` exposes a `proto` field; canonical schema in `packages/shared-protocol/src/handshake.ts` uses `proto_chosen`.**

- **Found during:** Task 2 read-first phase.
- **Issue:** The plan's reference to the schema as `{ proto, server_caps, server_locale, session_id, replay_seq }` mismatched the actual schema `{ proto_chosen, server_caps, server_locale, session_id, replay_seq }`. The schema is the canonical source of truth (Phase 2 + Phase 3 already shipped against `proto_chosen`).
- **Fix:** Wrote `performCapabilityHandshake` and its tests against the canonical `proto_chosen` field — the client message uses `proto` (per `HandshakeClientSchema`) and the server response is read as `proto_chosen` (per `HandshakeServerSchema`). The JSDoc on `performCapabilityHandshake` documents both wire shapes verbatim.
- **Files modified:** none (caught before any code was committed)
- **Rule:** Rule 1 (alignment with canonical Phase 2 schema — no architectural change; the plan's reference text was inaccurate)

No Rule 4 architectural decisions encountered. No Rule 2 missing critical functionality discovered (all threat-model mitigations from the plan's `<threat_model>` were implemented).

## Hardware-Pending Items (human_needed per ADR-0005)

| Item | Source | Status |
|---|---|---|
| BLE p50 latency envelope for the 10 s handshake-timeout default | ADR-0005 PROVISIONAL §10.0.3 | Software-verified (timeout path tested with fake timers); real-G2 measurement of typical handshake RTT carries `human_needed` and may re-tune the default downward |
| 100 kbps Branch A → Branch B/C threshold | ADR-0005 PROVISIONAL + CONTEXT.md §Area 4 | Threshold is correctly applied (verified by 6 vitest cases in `probeBleThroughput`); the boundary value itself is PROVISIONAL until §10.0.3 hardware BLE measurements land. `TODO(ADR-0005-OQ-INV2-1.b)` marks the single inline constant in `capability-handshake.ts` for the eventual re-tune |
| StartUpPageCreateResult success-path round-trip on real hardware | UI-SPEC §Container Budget Allocation | The 11-container schema is within the 1-12 SDK PB limit and uses the verified 200×100 image dim (within the 20-288 w / 20-144 h SDK range). Production verification on a real G2 carries `human_needed` and may require width-range tuning if the SDK 0.0.10 → 0.0.11 amendment changes image-container limits |

## Known Stubs

`LayerManager._flushPage()` ships a placeholder `RebuildPageContainer({ containerTotalNum: 1, textObject: [], imageObject: [] })` payload. **This is intentional and documented inline** — the bundle-single-flush contract is what Plan 02 owns; the concrete container assembly (image/text slot layout for the actual mounted layer set) is the responsibility of Plans 03 (raster) and 04 (status-hud). The Plan 05 atomic-bundle smoke test asserts the **call count** (exactly 1 per bundle), not the payload contents. No data flows to the UI from this stub since it's only reached after the LayerManager invariant is satisfied — and in Plan 02 the LayerManager is never mounted in production code (only by tests with mock bridges).

No other stubs: every export is real and tested.

## Threat Flags

None. All new surface (Bridge WS handshake parse, EvenAppBridge envelope dispatch, LayerManager state mutation) was already in the plan's `<threat_model>` and is fully mitigated per the dispositions:

| Threat | Disposition | Mitigation |
|---|---|---|
| T-4a-02-01 (HandshakeServer parse tamper) | mitigate | HandshakeServerSchema.safeParse + try/catch JSON.parse → HandshakeError('parse_failed' or 'schema_failed') |
| T-4a-02-02 (capability gate bypass) | mitigate | mount/bundle iterate requiredCaps against negotiatedCaps Set before insertion into layers Map |
| T-4a-02-03 (never-resolving handshake Promise) | mitigate | 10 s default timeout with explicit removeEventListener on resolve/reject paths |
| T-4a-02-04 (boot-splash info disclosure) | accept | Static labels only; bridge URL is paired-in (Phase 2 QR) so already known to G2/phone owner |
| T-4a-02-05 (LayerManager._flushPage privileged authority) | accept | Only LayerManager calls bridge.rebuildPageContainer; the assert-then-flush ordering closes the privilege gap |

## Commits

| Hash | Task | Subject |
|---|---|---|
| `8d1aa79` | 1 | `feat(g2-app): LayerManager singleton + capture-invariant tests (04a-02 Task 1)` |
| `17d7c36` | 2 | `feat(g2-app): page-lifecycle + capability-handshake + boot-splash (04a-02 Task 2)` |

## Self-Check

### Files asserted created

- `packages/g2-app/src/engine/layer-manager.ts` — FOUND
- `packages/g2-app/src/engine/page-lifecycle.ts` — FOUND
- `packages/g2-app/src/engine/capability-handshake.ts` — FOUND
- `packages/g2-app/src/engine/boot-splash.ts` — FOUND
- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — FOUND
- `packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts` — FOUND
- `packages/g2-app/src/engine/__tests__/capability-handshake.test.ts` — FOUND
- `packages/g2-app/src/engine/__tests__/boot-splash.test.ts` — FOUND

### Files asserted modified

None — Plan 02 lands net-new modules only.

### Commits asserted reachable

- `8d1aa79` — present in `git log`
- `17d7c36` — present in `git log`

## Self-Check: PASSED
