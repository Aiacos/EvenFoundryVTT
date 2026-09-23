---
title: "EVF Project Invariants (INV-1..6)"
status: ratified
date: 2026-05-16
updated: 2026-09-23
binds: "Phase 7+ — applies to every commit in the EvenFoundryVTT repository"
---

# EVF Project Invariants (INV-1..6)

This document consolidates the six non-negotiable project invariants for EvenFoundryVTT.
INV-1 through INV-4 were set at project inception and live in `CLAUDE.md` §Project Invariants.
INV-5 (Gesture Determinism) was ratified in Phase 6 Plan 01 (2026-05-16).
INV-6 (GM Authority Preservation) was ratified in Phase 7 Plan 01 (2026-05-16).

**v0.12.0 update (2026-09-23):** [ADR-0016](./0016-direct-foundry-streaming.md) removed the
Node bridge, `foundry-mcp` and socketlib. The invariants themselves are unchanged. The
enforcement paths below now point at the direct-streaming code (D&D-sheet HUD
[ADR-0018](./0018-dnd-sheet-hud-pixel-renderer.md), elected projector
[ADR-0017](./0017-player-owned-glasses-hybrid-projector.md)). ADR-0016…0018 were
numbered 0012…0014 before the v0.12.0 port onto `develop`; the gesture model referenced by
INV-5 is [ADR-0012](./0012-r1-gesture-model-overscroll-exit-lifecycle.md) (R1 gestures,
Amendment 2: tap opens the menu from the base view).

**Cross-cutting note:** any new invariant MUST be added here and indexed from
`docs/architecture/README.md`. Invariants are permanent. They change only when a new ADR
supersedes them with explicit rationale.

---

## 🛡️ 1. INV-1 — Layout Integrity

Every ASCII mockup and runtime layout must align character-perfect across all states,
contents, and locales. Verifiable via Specs.md §7.0 / §7.1a (8 sub-rules) and the
screen set in [`docs/design/g2-sheet-ux.html`](../design/g2-sheet-ux.html) (S1–S12; pairing
mocks P01–P03 remain in the superseded [`g2-thirds-layout.md`](../design/g2-thirds-layout.md)).

Zone boundaries (portrait 144² · header 288×144 · map 144² on top; sheet 288×144 · context
288×144 below), frames and icons stay in the same place in every state. Containers sit on
the hardware-proven 2 × 2 grid of 288 × 144 image tiles from (0, 0): the top band 576 × 144
(portrait · header · map) is one framebuffer split at x = 288, the sheet is the tile at
(0, 144), zone E is firmware text at (288, 144). The real G2 host rejects off-grid image
tiles (finding `d97b12e`, 2026-07-07), so the grid is part of the layout contract. Variable content (HP `7` vs `700`, name length, condition overflow, IT vs EN)
is width-budgeted at build time, never best-effort.

**Pixel-budget gate (zone E, firmware text):** strings are measured in pixels with
`@evenrealities/pretext` (`packages/g2-app/src/hud/text/measure.ts`). Only firmware-font
glyphs may be emitted. `packages/g2-app/src/hud/__tests__/context.test.ts` checks lines ≤
region capacity and width ≤ budget for S1–S12 × IT/EN × min/max content.

**Golden gate (zones A–D, pixel renderer):** `packages/g2-app/src/hud/__tests__/golden.test.ts`
renders every image zone of every screen and matches it pixel-for-pixel against
`packages/shared-render/src/fixtures/sheet.<zone>.<screen>.<locale>.<variant>.txt` through
`matchPixelFixture` (`@evf/shared-render`); the same states assert that zone frames never move.

---

## 🛡️ 2. INV-2 — Online Cross-Validation

Every technical claim cites a canonical upstream source. Sources allowed:
`hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses,smart-ring}`,
`support.evenrealities.com/specs`, `foundryvtt.com/api/*` and `foundryvtt.com/article/*`,
`github.com/foundryvtt/dnd5e`, `gitlab.com/tposney/midi-qol`, the npm registry
(`npm view`) for version pins.

**Aggregator, blog and AI-summary sources are not authoritative.** Re-verify before each
bump. Classify drift as CRITICAL / IMPORTANT / NICE-TO-HAVE and log it. Pattern: ≥ 4
parallel WebFetch on independent domains.

**Enforcement:** pre-bump checklist in `CLAUDE.md` §Pre-bump checklist, plus
`pnpm --filter @evf/validation-harness inv:all`.

---

## 🛡️ 3. INV-3 — Documentation Coherence

`Specs.md` + `README.md` + `docs/showcase/index.html` update **in the same commit** for any
cross-cutting change (version, fps target, phase count, hardware spec, library version,
locale set, ADR list). No half-updated states. Cross-reference integrity is a hard gate.

**Enforcement:** manual review on every PR that touches version numbers, phase counts,
hardware specs or library pins. INV-3 violations are CRITICAL: revert or fix forward
right away.

---

## 🛡️ 4. INV-4 — Code Quality

Clean, optimised, documented, **zero dead/unreachable code**. Biome + TypeScript strict +
Vitest coverage gate enforce it in CI. `// TODO` requires `(#issue)` or `(ADR-NNNN)`.
TSDoc on every public API. Hot-path benchmarks gate regressions.

**Tooling enforced:** `biome ci .` · `tsc --noEmit` strict (`noUnusedLocals`,
`noUnusedParameters`) · `vitest --coverage` v8 ≥ 80 % · TODO discipline (`git grep -P`).

**ADR:** [ADR-0008](./0008-code-quality-configuration.md).

---

## 🛡️ 5. INV-5 — Gesture Determinism (Phase 6 ratification)

**Ratified:** 2026-05-16 (Phase 6 Plan 01). **Enforcement re-pointed:** 2026-09-23 (v0.12.0).

> Every gesture maps to **exactly one** handler call. Zero-handler cases are explicit
> no-ops, never silent drops or multi-handler broadcasts.

### Enforcement (D&D-sheet HUD, v0.12.0)

- **Single entry point:** `toGestureEvent` (`packages/g2-app/src/hud/input/events.ts`)
  maps each Even Hub event to at most one `HudInput`: `tap`, `double`, `up`, `down`, or
  `menu` for a context-menu choice. Anything else returns `null`, an explicit no-op.
- **Single reducer:** the zone-E (context panel) state machine
  (`packages/g2-app/src/hud/input/state-machine.ts`) is a pure reducer. One input
  produces one next state. Zones A–D (portrait, header, map, sheet) never capture input.
- **Canonical gestures:** press, double-press, swipe up/down. **Long-press** is an extra
  (SDK ≥ 0.0.14, Even App ≥ 2.2.9). The OS opens the page's `menuObject` and the choice
  arrives as one `menuItemClickEvent`. Every menu entry is also reachable with a tap, so
  long-press is never the only path.
- **Gesture model:** [ADR-0012](./0012-r1-gesture-model-overscroll-exit-lifecycle.md) —
  tap at the root opens *Actions*, root double-tap → `shutDownPageContainer(1)`.
- **Tests:** `packages/g2-app/src/hud/__tests__/input.test.ts`.

The v0.9 layered-engine enforcement (`LayerManager.getTopLayer()`, `PanelGestureBus`,
status-HUD R1 chip) was removed with that engine. See Specs.md history.

---

## 🛡️ 6. INV-6 — GM Authority Preservation (Phase 7 ratification)

**Ratified:** 2026-05-16 (Phase 7 Plan 01). **Transport updated:** 2026-09-23 (ADR-0016). **Origin amended:** 2026-09-23 (ADR-0017).

> Every Foundry write-path mutation (cast spell, weapon attack, use item, move token, drop
> concentration, place template, end turn) MUST execute through `dispatchTool` on **exactly
> one Foundry client per device at a time — the elected projector**: the player's own client
> when that player is online, otherwise the active GM
> ([ADR-0011](./0011-foundry-write-path-single-workflow-origin.md) as amended by
> [ADR-0017](./0017-player-owned-glasses-hybrid-projector.md)). GM authority is preserved by
> Foundry's own permission model: a player client can only perform what that player could
> perform in Foundry; GM-only steps (e.g. damage to NPCs) go through MidiQOL's GM socket.
> No code outside `packages/foundry-module/src/write-path/` may call `activity.use()`.

The path is now: G2 gesture → g2-app sealed `invoke` on `module.evenfoundryvtt` →
Foundry relay → elected **projector** client (`packages/foundry-module/src/direct/projector.ts`;
player's client if online, else active GM) → `dispatchTool` → write-path handler →
`MidiQOL.completeActivityUse` (when active) or `activity.use()`. Non-elected clients ignore
the message and never execute `invoke`. socketlib `executeAsGM` is no longer used.

### Enforcement

- **CI Gate 8** (`.github/workflows/ci.yml`, *Single-workflow-origin guard*):
  `git grep 'activity\.use\('` over `packages/**/*.ts(x)` **excluding only**
  `packages/foundry-module/src/write-path/**`. Comment lines and quoted prose are
  filtered. Any hit fails the PR. The projector and readers are covered too.
- **CI Gate 9** (*socketlib confinement guard*, ADR-0016): no socketlib import or call
  outside `packages/foundry-module`. socketlib is removed from the module as well. The
  gate keeps it from creeping back into the phone app or the shared packages. The old
  fixed `registerComplexHandler` count (14 → 17) is retired.
- **Projector write guard:** `invoke` may act only for the paired actor (`actor_id` is
  forced, a foreign actor → `forbidden_actor`). `rid` is the idempotency key.
- **Runtime authority:** `dispatchTool` (`packages/foundry-module/src/write-path/tool-registry.ts`)
  checks the idempotency cache (key = principal `g2:<userId>` + `rid`), validates args,
  runs the handler and writes the audit entry.
- **Audit trail:** each call writes a hidden GM-only `ChatMessage` (`whisper: gmIds`,
  `flags.evf.audit`).

### Verification

- `packages/foundry-module/src/write-path/tool-registry.test.ts`, `idempotency-cache.test.ts`,
  `audit-log.test.ts`.
- `packages/foundry-module/src/direct/projector.test.ts`: request/response, actor guard,
  sealed envelopes.

### Hardware-pending carry-forwards

- **SC-07-01**: `dispatchTool` end-to-end latency (gesture → GM handler return) ≤ 800 ms
  over HTTPS with the GM projector online.
- **SC-07-02**: concurrent actions from two paired devices are serialized correctly on
  their elected projectors (player clients and/or GM).
- **ADR-0017 hand-over**: a player's client going offline mid-session hands the device to
  the GM fallback without a duplicated action.
- **ADR-0016 sideload gate**: QR load, SDK bridge injection, cookie persistence and
  socket reconnect (`pnpm --filter @evf/validation-harness validate:direct-sideload`).
- **SC-06-01 / SC-06-03**: gesture timings and menu-open latency on real G2 + R1.
  (SC-06-02, the long-press false-trigger check, is now the OS's job: long-press is
  handled by the firmware menu.)
