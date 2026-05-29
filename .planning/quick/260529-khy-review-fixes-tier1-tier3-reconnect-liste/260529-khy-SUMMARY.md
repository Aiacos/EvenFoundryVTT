---
quick_id: 260529-khy
type: quick
branch: develop
title: "Codebase-review fixes — Tier 1 (R1/R2/R3) + Tier 3 hardening"
waves: 3
baseline_tests: 2830
final_tests: 2858
coverage_statements: 91.15
status: complete
completed: 2026-05-29
---

# Quick-task 260529-khy — Review Fixes (Tier 1 + Tier 3) Summary

One-liner: closed nine verified codebase-review correctness/robustness gaps across
five packages — R1 FULL WebSocket reconnect rewire (holder swap + repeated-reconnect
re-arm + all-inbound re-attach), raster worker fatal-error settling, combat
deleteCombat cleanup, header-aware long-press item mapping, schema bounds, spell-level
grouping, bridge-client null/return correctness, reader range-0 guard, and an INV-5
false-pass fix — all TDD, no scope reduction.

## Waves & Fixes

### Wave 1 — R1 FULL reconnect rewire (CRITICAL) — DONE IN PRIOR RUN
Committed before this session (commits 9c3b3ba, 1f0b684, 22f07fc, 32bb25a, c80d16f):
`WsSender` holder, `WsReconnectController.onReconnected` + repeated-reconnect close
re-arm, `StatusHudLayer.rebindWsEvents`, boot FULL rewire (holder swap + re-attach all
7 inbound listeners incl. reaction-prompt + portrait). Software gate green at the
Wave-1 checkpoint.

### Wave 2 — Tier 1 robustness (this session)
- **R2 — raster-controller worker.onerror** (`55bf8f3`): fatal worker error settles all
  `pending` frames + a debounced `pendingPayload` with the existing `RasterResponse.error`
  shape, clears the map, logs `console.error`; no permanent hang. WorkerLike gains optional
  `onerror`; worker-mock gains `_dispatchError`. RED (RC-10 multi-pending hang, RC-11
  pendingPayload hang) → GREEN.
- **R3 — combat-action-tracker deleteCombat** (`d58b614`): `Hooks.on('deleteCombat')`
  clears `_state` + `_attackIdSeen` (mirrors combat-movement-tracker FIX E); unsubscribe
  offs the new hook id. RED (4 tests) → GREEN. **Hooks.on, NOT a socketlib handler** —
  Gate 8 socketlib count stays 17.

### Wave 3 — Tier 3 hardening (this session)
- **R-longpress** (`99ccc16`): spellbook + inventory long-press now resolves the item
  under the cursor ROW via header-aware `buildSpellbookRowItemMap`/`buildInventoryRowItemMap`
  + `resolveSpellAtRow`/`resolveItemAtRow`, instead of indexing the flat array with the
  content-row scroll offset (wrong item after scrolling past a section header). RED
  (SBP-LPMAP-01..05, INV-LPMAP-01..05; tall lists guard the header shift) → GREEN.
- **Schema bounds** (`1940a3d`): `d20` → `int().min(1).max(20).nullable()`; debug-events
  `id .min(1)`, `ts` (+perf sample) and layer-index `z` `.int()`. RED → GREEN; ART-09
  updated (21 no longer a valid die face).
- **spell-level / bridge-client / range-0** (`960c1a8`): mass-cure-wounds relocated to an
  L5 grouping (length stays 70, SKT-02); snapshot getters pass `null` default to `_restGet`
  (network failure → null); `ws.onclose` early-returns on a pre-handshake close; reader
  `range.value === 0` non-self/touch → `--`. RED → GREEN; bridge-client case 13 updated.
- **INV-5 false-pass** (`bda33d0`): checkInv5 captures stdout and returns `skipped` (not
  green) on a no-tests-found exit-0 run. RED (IS-06-FALSE-PASS) → GREEN.

### Wave 3 exit (`32ffb5c`)
Extended `.changeset/quick-260529-khy.md` to patch all 5 touched packages with a full
multi-wave summary.

## Files changed (this session)
- packages/g2-app/src/raster/raster-controller.ts (+ __tests__/raster-controller.test.ts)
- packages/g2-app/src/__tests__/test-helpers/worker-mock.ts (`_dispatchError`)
- packages/foundry-module/src/write-path/combat-action-tracker.ts (+ .test.ts)
- packages/g2-app/src/panels/spellbook-panel.ts (+ __tests__/spellbook-panel.test.ts)
- packages/g2-app/src/panels/inventory-panel.ts (+ __tests__/inventory-panel.test.ts)
- packages/g2-app/src/internal/boot-engine-core.ts (removed stale biome-ignore)
- packages/g2-app/src/panels/reaction-prompt-panel.ts (removed stale biome-ignore)
- packages/shared-protocol/src/payloads/action-result.ts (+ .test.ts)
- packages/shared-protocol/src/debug/debug-events.ts (+ .test.ts)
- packages/foundry-mcp/src/voice/spell-lookup.ts (+ .test.ts)
- packages/foundry-mcp/src/tools/bridge-client.ts (+ .test.ts)
- packages/foundry-module/src/readers/character-reader.ts (+ readers.test.ts)
- packages/validation-harness/src/inv-suite.ts (+ __tests__/inv-suite.test.ts)
- .changeset/quick-260529-khy.md

## Deviations from plan
- **[Rule 3 — blocking lint]** Two stale `biome-ignore lint/suspicious/noExplicitAny`
  suppressions (boot-engine-core.ts:1061 audioCaptureHandle, reaction-prompt-panel.ts:422
  `_uuid`) were flagged as `suppressions/unused` errors by `biome ci` (neither cast uses
  `any`) and blocked the lint gate. Removed both (no behavior change). Pre-existing
  (reaction-prompt one dates to commit c1abb4f); fixed here because they blocked the
  Task-10 lint:ci gate. Folded into commit 99ccc16.
- **Test files relocated vs plan anchors**: raster-controller, spellbook, inventory tests
  live under `__tests__/` (not co-located); readers test is `readers.test.ts` (not
  `character-reader.test.ts`). Used the real paths.
- **ART-09 / bridge-client case 13 contract updates**: two existing tests asserted the
  pre-fix (incorrect) contracts (d20=21 accepted; network error → undefined). Updated to
  the corrected contracts (RED→GREEN intent preserved; tightenings reject only
  previously-invalid values).

## Gates (final)
- `pnpm typecheck` → exit 0
- `pnpm lint:ci` → exit 0
- `pnpm test:coverage` → exit 0; **2858 tests** (197 files); coverage 91.15% statements /
  92.06% lines / 81.23% branches (≥ 80% gate)
- `pnpm changeset:status` → 5 packages declared at patch (@evf/g2-app, @evf/foundry-module,
  @evf/shared-protocol, @evf/foundry-mcp, @evf/validation-harness)
- **CI Gate 8**: socketlib handler count = 17 (R3 is a Hooks.on, not a socketlib
  registration — `registers exactly 17 handlers total` test green)
- **ADR-0011**: no `activity.use(` in g2-app/bridge runtime code (the two matches are
  doc-comment mentions, ignored by the guard)

## Hardware-deferred (NOT a blocker)
- R1 LIVE end-to-end reconnect on real G2 + R1 over a flaky connection — socket drop →
  on-glasses resume of display + input + outbound ACTION dispatch without reload, AND a
  SECOND disconnect also recovering — is HARDWARE-DEFERRED per the established
  defer-hardware-tests carry pattern. Software tests use mock sockets + holder.swap; the
  unit + boot mock-socket coverage is the software-side guarantee for the rewire logic.

## Commits (this session)
- 55bf8f3 fix(g2-app): R2 raster-controller worker.onerror settles all pending frames
- d58b614 fix(foundry-module): R3 combat-action-tracker deleteCombat cleanup
- 99ccc16 fix(g2-app): R-longpress header-aware item mapping in spellbook + inventory
- 1940a3d fix(shared-protocol): tighten schema bounds — d20 [1,20] + debug-events ints
- 960c1a8 fix(foundry-mcp): spell-level grouping, bridge-client null/return, reader range-0
- bda33d0 fix(validation-harness): INV-5 returns skipped (not green) on no-tests-found
- 32ffb5c chore(*): extend patch changeset for review fixes (multi-package)

(Wave 1 commits from the prior run: 9c3b3ba, 1f0b684, 22f07fc, 32bb25a, c80d16f.)

## Self-Check: PASSED
- All touched source + test files exist and compile (typecheck exit 0).
- All 7 session commit hashes present in `git log`.
- Stays on branch `develop`; no push.
