---
type: quick
slug: condense-claude-md
status: complete
completed: 2026-06-06
files_modified:
  - CLAUDE.md
---

# Summary: Condense CLAUDE.md

Condensed `CLAUDE.md` from **419 lines / 42.7 KB → 232 lines / 20.9 KB (−51%)**.

## What changed

- The `<!-- GSD:stack -->` "Technology Stack" block (~213 lines — a verbatim
  copy of `.planning/research/STACK.md`: per-package "why" tables, §2 Alternatives,
  §3 What-NOT-to-Use, §5 Version Matrix, §8 Confidence, §10 Sources/`npm view`
  provenance) was condensed to ~25 lines: a "Key pins by package" summary, the
  full "Hard do NOT use" decision list, and a pointer to `.planning/research/STACK.md`
  for the verbose rationale + INV-2 provenance.

## What was preserved verbatim (the specs we gave)

- Project Invariants INV-1..INV-4 (non-negotiable)
- Pre-bump checklist
- Architecture mental model — 4-boundary diagram + all crucial constraints
- Even Hub canonical developer docs (INV-2 source of truth) — all 6 doc anchors
- Project (EVF) description + Core Value + the Constraints list
- Working-in-repo guidance · Repository state · build/test/lint commands
- Drift-corrected pins (TypeScript 5.8.3, pnpm 10.33.4)
- All 7 GSD-managed marker sections (intact + paired)

## Verification

- `grep` confirms all 7 GSD `*-start/-end` marker pairs present.
- No load-bearing decision dropped — every "do NOT use" entry retained; full
  rationale still available in `.planning/research/STACK.md`.
