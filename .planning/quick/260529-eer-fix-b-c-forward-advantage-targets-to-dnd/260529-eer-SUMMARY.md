---
quick_id: 260529-eer
phase: quick
plan: 01
status: complete
type: execute
branch: develop
requirements: [FIX-B-advantage-forward, FIX-C-targets-forward]
subsystem: foundry-module/write-path
tags: [midi-qol, advantage, targets, capability-split, tdd, dnd5e]
provides:
  - "weapon-attack: MidiQOL-vs-vanilla capability split for advantage + targets"
  - "cast-spell: MidiQOL-vs-vanilla targets forward (slot override preserved)"
  - "foundry-globals: game.modules.get + possibly-undefined MidiQOL type surface"
requires:
  - "MidiQOL (optional Foundry module) — only the present branch auto-applies advantage/targets"
affects:
  - packages/foundry-module/src/write-path/handlers/weapon-attack.ts
  - packages/foundry-module/src/write-path/handlers/cast-spell.ts
  - packages/foundry-module/src/types/foundry-globals.d.ts
key-files:
  created:
    - .changeset/260529-eer-forward-advantage-targets.md
  modified:
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/foundry-module/src/write-path/handlers/weapon-attack.ts
    - packages/foundry-module/src/write-path/handlers/cast-spell.ts
    - packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts
    - packages/foundry-module/src/write-path/handlers/cast-spell.test.ts
decisions:
  - "Vanilla (MidiQOL-absent) branch never rolls — advantage forwarded ONLY under MidiQOL to avoid the double-execution hazard (unclicked card + loose rollAttack)"
  - "Never mutate game.user.targets (documented v13 per-user pitfall); WARN once instead"
  - "Changeset = PATCH (wires already-public schema fields into the workflow; no new public API)"
metrics:
  duration: ~12m
  completed: 2026-05-29
  tasks: 4
  files_changed: 6
  tests_added: 10
  test_total: 2723
---

# Quick Task 260529-eer: Forward advantage + targets to dnd5e (FIX-B + FIX-C) Summary

Wired the already-Zod-validated `advantage` and `targets` protocol fields into the
dnd5e workflow via a MidiQOL capability split. Before this change both fields passed
validation but reached a dead end — neither write-path handler read them, so they had
zero effect on the actual roll. Now they drive `MidiQOL.completeActivityUse` when the
automation layer is present, and surface an honest single `console.warn` (with zero
behavior regression and zero double-roll risk) when MidiQOL is absent.

## What changed

- **`weapon-attack.ts`** — added module-local `isMidiQolActive()` guard
  (`typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active === true`).
  Computed `useMidi` once before the multi-attack loop.
  - MidiQOL present: each iteration calls `MidiQOL.completeActivityUse(activity,
    { midiOptions: { targetUuids, advantage, disadvantage }, consume: { action: i===0 } },
    { configure:false }, { create:true })`. Multi-attack progress emit + attackId
    accumulation + `isNoGmError` normalization unchanged.
  - MidiQOL absent: EXACTLY today's `activity.use({ configure:false, consume:{action:i===0} })`.
    NO `rollAttack`, NO roll hook, NO `game.user.targets` mutation. A single
    loop-guarded `console.warn` fires when `advantage !== 'normal'` OR `targets.length > 0`.
- **`cast-spell.ts`** — same `isMidiQolActive()` guard. Concentration-conflict
  pre-check and `slotOverride` computation unchanged and still run first.
  - MidiQOL present: `MidiQOL.completeActivityUse(activity, { midiOptions: { targetUuids,
    ...slotOverride } }, { configure:false }, { create:true })`. cast-spell has no
    advantage field — only targets forwarded.
  - MidiQOL absent: EXACTLY today's `activity.use({ configure:false, ...slotOverride })`,
    single `console.warn` when targets requested, never mutate `game.user.targets`.
- **`foundry-globals.d.ts`** — added `game.modules.get(id): { active: boolean } | undefined`
  and a module-scoped possibly-undefined `MidiQOL` global exposing `completeActivityUse`.
  No `FoundryActivity.rollAttack` declaration (dropped in the plan revision — vanilla
  never rolls).
- **Tests** — extended both handler test files (RED-first). `makeGameGlobal` gained a
  `midiActive` option; the weapon activity factory gained a `rollAttack: vi.fn()` spy.

## TDD: RED → GREEN

- **RED** (commit `04789ec`): 7 new cases failed for the right reason (fields not yet
  forwarded; no warn; no `completeActivityUse`):
  - weapon-attack: M1, M2, M3 (MidiQOL `completeActivityUse` forwarding), V1, V2
    (vanilla warn + assertions).
  - cast-spell: CM1 (MidiQOL targets+slot), CV1 (vanilla warn).
  - Backward-compat cases (B1, CB1, CM-CONC) passed in RED (no behavior change), and all
    33 pre-existing cases stayed green.
- **rollAttack-never-called assertion (V1/V2)**: the activity factory exposes a
  `rollAttack` spy; both vanilla-branch tests assert `activity.rollAttack` is NEVER
  invoked and `activity.use` is called exactly once with `{ configure:false,
  consume:{ action:true } }`. V1 also asserts no `dnd5e.preRollAttackV2` hook is
  registered (`Hooks.on` not called with that event). Both go GREEN with the
  no-roll vanilla implementation and would go RED against any double-roll impl.
- **GREEN** (commit `b516ab6`): all 40 cases in the two files pass (30 baseline + 10 new).

## Exit gates (all green)

| Gate | Result |
|------|--------|
| `pnpm typecheck` | exit 0 |
| `pnpm lint:ci` | exit 0 (2 `noNonNullAssertion` warnings on the plan-mandated `MidiQOL!` inside the guarded branch — non-blocking; `console.warn` is allowed by biome `noConsole.allow`) |
| `pnpm test` | exit 0 — **2723 passed** (baseline 2713 post Fix A → net **+10**) |
| Gate 8 single-workflow-origin | EMPTY — no real `activity.use(` / `completeActivityUse` / `rollAttack` in g2-app or bridge (post comment-filter) |
| Gate 8 socketlib handler count | **17** unchanged (no socketlib handler touched) |
| `pnpm changeset:status` | `@evf/foundry-module` patch declared |

Test delta breakdown: weapon-attack +6 (M1, M2, M3, V1, V2, B1); cast-spell +4
(CM1, CV1, CB1, CM-CONC).

## Deviations from Plan

None — plan executed exactly as written. The `MidiQOL!` non-null assertion warning is
the plan-mandated pattern ("Use non-null `MidiQOL!` only inside the branch already
guarded by `isMidiQolActive()`"); it is a non-blocking Biome warning (CI `biome ci`
exits 0) and not an INV-4 violation.

## Hardware-deferred carry-forward (NEVER blocks autonomous)

The REAL MidiQOL full attack→damage→save→apply workflow resolution against live tokens
— INCLUDING whether MidiQOL honors the top-level `consume:{action}` Extra-Attack
action-economy field (research §5, NOT INV-2-verified) — is **hardware-deferred**
(carry-forward of SC-07-01/02/03, already deferred). Software tests MOCK
`MidiQOL.completeActivityUse` and assert ONLY the INV-2-verified
`midiOptions.targetUuids` + `advantage`/`disadvantage` fields; they do NOT exercise a
live MidiQOL/Foundry session and do NOT over-assert the unverified per-iteration
action-economy field. Per the established defer-hardware pattern, this verification gap
is carried forward and does not block this task's completion.

## Commits

- `04789ec` — `test(foundry-module): RED — capability-split advantage+targets forwarding`
- `b516ab6` — `feat(foundry-module): forward advantage+targets to dnd5e via MidiQOL completeActivityUse`

## Self-Check: PASSED
