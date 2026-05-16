---
title: "EVF Project Invariants (INV-1..5)"
status: ratified
date: 2026-05-16
binds: "Phase 6+ — applies to every commit in the EvenFoundryVTT repository"
---

# EVF Project Invariants (INV-1..5)

This document consolidates the five non-negotiable project invariants for EvenFoundryVTT.
INV-1 through INV-4 were established at project inception and are codified in `CLAUDE.md §Project Invariants`.
INV-5 (Gesture Determinism) was ratified in Phase 6 Plan 01 (2026-05-16).

**Cross-cutting note:** Any new invariant in future phases MUST be added here and indexed from `docs/architecture/README.md`. Invariants are permanent; they are not revised unless superseded by a new ADR with explicit rationale.

---

## 1. INV-1 — Layout Integrity

Every ASCII mockup and (future) runtime layout must align character-perfect across all states, contents, and locales. Verifiable via Specs.md §7.1a (8 sub-rules) and §7.14.4 ck 11–15.

Frame corners, dividers, columns: same column from top to bottom, always. Variable content (HP=`7` vs `700`, name length, conditions overflow, IT vs EN i18n) gets width-budgeted at build time, never best-effort.

**Build-time gate:** `packages/g2-app/src/status-hud/i18n-budgets.ts` — the `as const satisfies Record<string, WidthBudgetRow>` clause fails `pnpm typecheck` on any budget violation.

**Runtime gate:** `assertWithinBudget(value, field)` in `i18n-budgets.ts` — `console.warn` telemetry on overflow before truncation.

**Snapshot gate:** `matchAsciiFixture` in `packages/shared-render` — every panel state vs ASCII fixtures in `packages/shared-render/src/fixtures/`.

**Scope:** Specs.md §7.1a + §7.14.4 ck 11–15. Enforced on every commit touching any layout code or ASCII mockup.

---

## 2. INV-2 — Online Cross-Validation

Every technical claim cites a canonical upstream source. Sources allowed:
`hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses,smart-ring}`, `support.evenrealities.com/specs`, `foundryvtt.com/api/*`, `github.com/foundryvtt/dnd5e`, `modelcontextprotocol.io/specification/*`, `github.com/farling42/foundryvtt-socketlib`, `gitlab.com/tposney/midi-qol`, vendor pricing pages (Deepgram, AssemblyAI).

**Aggregator/blog/AI-summary sources are not authoritative.** Re-verify before each bump. Drift is classified CRITICAL / IMPORTANT / NICE-TO-HAVE and logged. Pattern: ≥4 parallel WebFetch on independent domains.

**Enforcement:** Pre-bump checklist in `CLAUDE.md §Pre-bump checklist`. Manual until INV-2 CI tooling lands.

---

## 3. INV-3 — Documentation Coherence

`Specs.md` + `README.md` + `docs/showcase/index.html` update **in the same commit** for any cross-cutting change (version, fps target, phase count, hardware spec, library version, locale set, ADR list). No half-updated states. Cross-reference integrity is a hard gate.

**Enforcement:** Manual review on every PR that touches version numbers, phase counts, hardware specs, or library pins. INV-3 violations are CRITICAL — revert or fix forward immediately.

---

## 4. INV-4 — Code Quality

Clean, optimised, documented, **zero dead/unreachable code** tolerated. Biome + TypeScript strict + Vitest coverage gate enforce in CI. `// TODO` requires `(#issue)` or `(ADR-NNNN)`. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions.

**Tooling enforced (Phase 1+):**
- `biome ci .` — lint + format gate (no warnings)
- `tsc --noEmit` strict + `noUnusedLocals` + `noUnusedParameters`
- `vitest --coverage` v8 provider — coverage ≥80%

**ADR:** ADR-0008 `docs/architecture/0008-code-quality-configuration.md`.

---

## 5. INV-5 — Gesture Determinism (Phase 6 ratification)

**Ratified:** 2026-05-16 (Phase 6 Plan 01).

> Every R1 gesture (tap, double-tap, scroll-up, scroll-down, long-press) maps to **exactly one** panel handler call. The receiver is the layer returned by `LayerManager.getTopLayer()` (highest z among mounted layers exposing `onEvent`). Modal panels block fall-through (the menu over a panel blocks the panel's gestures while open). Zero-handler edge cases (empty stack, boot-error active) are explicit no-ops with telemetry; never silent drops or multi-handler broadcasts.

### Architectural enforcement

**Runtime authority:** `LayerManager.getTopLayer()` (`packages/g2-app/src/engine/layer-manager.ts`) is the sole determiner of which layer receives each gesture. It:

1. Sorts `[...this.layers.entries()].sort(([a],[b]) => b - a)` — explicit descending-z sort (NOT insertion order, see RESEARCH §Pitfall 2).
2. Returns the first layer where `isOverlayPanel(layer) === true` (has `onMount + onUnmount + onEvent`).
3. Returns `null` if no such layer is mounted.

**Zero-handler case:** When `getTopLayer()` returns `null`:
- `attachR1EventSource` emits: `console.warn('[r1-event-source] no top layer — gesture dropped (INV-5 no-op)', ...)`
- Gesture is explicitly discarded. **Never a silent drop.**
- Trigger conditions: boot splash active, boot error active, no panel yet pushed.

**Multi-handler ban:** `PanelGestureBus.publish` fans out to ALL subscribers (snapshot iteration). The architectural constraint ensuring single-handler routing is enforced by the panel lifecycle: panels MUST call `PanelGestureBus.subscribe` in `onMount` and the returned unsubscribe closure in `onUnmount` (T-4b-01-03). By construction, only the currently-mounted top panel is subscribed at any time.

### Visible enforcement (SC-4)

The status-HUD footer context chip (Plan 06-03) renders:
```
R1: tap=<tap-action>  scroll=<nav-action>  long=quick[<active-overlay-id>]
```
This chip names the live long-press target by calling `layerManager.getTopLayer()?.getR1Hints?.()`, making INV-5 auditable by the player at a glance.

### Verification

- `packages/g2-app/src/engine/__tests__/r1-event-source.test.ts` — R1E-08 (INV-5 zero-handler no-op) + R1E-04..07 (single-publish contract).
- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — LMT-TOP-01..04 (getTopLayer correctness including sort-order regression guard).
- `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` — 15 cases mapping 1:1 to Specs §7.14.4 ck 1-15 (ships in Plan 06-04).
- `packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts` — PGB-3 (fan-out), PGB-5 (unsubscribe), PGB-7 (zero-subscriber silent drop).

### Hardware-pending carry-forwards (ADR-0005 Branch A)

- **SC-06-01** — `DEFAULT_R1_TIMINGS` values validated against real R1 ring per Phase 0 §10.0.1 (close via `pnpm --filter @evf/validation-harness validate:all` when Even Hub access is available).
- **SC-06-02** — Long-press has no false-triggers on accidental finger rest (real R1 hardware test).
- **SC-06-03** — Menu-open latency p50 ≤ 200 ms on real G2 + R1 hardware.
