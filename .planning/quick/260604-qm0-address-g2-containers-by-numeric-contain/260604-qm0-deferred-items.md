# Deferred items — Quick Task 260604-qm0

Out-of-scope discoveries found during execution (NOT fixed — pre-existing, unrelated to the container-id/geometry fix).

## Pre-existing biome warning

- `packages/g2-app/src/panels/reaction-prompt-panel.ts:273` — `lint/style/noNonNullAssertion`
  ("Forbidden non-null assertion" on `this.playerActorId!`). Pre-existing; not in this
  task's diff. Biome `check` exits 0 on warnings, so it does not gate. Left untouched per
  the executor SCOPE BOUNDARY.

## Persisting panel lazy-load failures (noted in PLAN, separate cycle)

- 5 dev panels fail lazy-load in the simulator dev server:
  `[PanelRouter] panel ../panels/{quick-action-menu,reaction-prompt,slot-picker,target-picker,template-placement}-panel.ts excluded: load error`.
  Lower-priority, separate from the container-id/geometry render fix. The base
  boot-splash + StatusHUD render does not depend on these panels.
