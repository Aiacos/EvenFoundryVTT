# Deferred Items — Quick Task 260517-k2g

Pre-existing issues discovered during Task 3 verify but not caused by this Quick Task.
Per `gsd-executor` scope-boundary rule, these are NOT fixed here.

## Pre-existing biome-ignore suppressions now flagged as unused

Workspace `pnpm lint:ci` reports 1 error from two pre-existing files:

1. `packages/g2-app/src/internal/boot-engine-core.ts:928` —
   `// biome-ignore lint/suspicious/noExplicitAny: ...` no longer needed
   because the surrounding code uses `as ServerCap` cast instead of `any`.
   Committed in `38c77637` (2026-05-17 09:05).

2. `packages/g2-app/src/panels/reaction-prompt-panel.ts:422` —
   `// biome-ignore lint/suspicious/noExplicitAny: ...` no longer needed
   because the code path now uses `as unknown as { ... }` instead.
   Committed in `c1abb4f9` (2026-05-17 10:07).

**Resolution path:** delete the two stale `biome-ignore` comments in a separate
quick task. Out of scope here because:
- Pre-existing at base commit `291fa2c`.
- Unrelated to entity-pack pipeline.
- Per scope-boundary deviation rule, only fix issues DIRECTLY caused by the
  current task's changes.

## CI Gate 8 raw-grep false positives

The plan's verify command:
```
grep -rE 'activity\.use\(' packages/g2-app packages/bridge --include='*.ts'; test $? -eq 1
```
Currently returns rc=0 (matches found), not rc=1, because two pre-existing
JSDoc comments mention the literal string `activity.use(`:

1. `packages/g2-app/src/panels/slot-picker-panel.ts` —
   `* activity.use({ configure: false, spell: { slot: 'spell<N>' } })` example
   in a doc-block (not actual code).
2. `packages/g2-app/src/panels/reaction-prompt-panel.ts` —
   `* NEVER calls activity.use() directly. CI Gate 8 enforces this.` —
   the enforcement contract documentation itself.

A filtered grep that excludes comment lines (`grep -vE ':[*/ ]'`) returns rc=1
correctly (no real `activity.use(` calls in g2-app or bridge source). The
invariant is preserved in code; only the raw-grep verification command is
imprecise. Out of scope to fix here.

**Resolution path:** evolve the CI gate command to exclude comment lines, or
rephrase the comments to use a different example syntax. Tracked separately.
