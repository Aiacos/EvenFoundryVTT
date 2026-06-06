---
type: quick
slug: condense-claude-md
created: 2026-06-06
---

# Quick Task: Condense CLAUDE.md

**Request (IT):** "CLAUDE.md è troppo grande, condensalo mantenendo le specifiche che abbiamo dato."

## Problem

CLAUDE.md was 419 lines / ~42.7 KB. The bulk (~213 lines, the `<!-- GSD:stack -->`
block) was a verbatim copy of the `.planning/research/STACK.md` research dump:
per-package version tables with full "why" prose, Alternatives Considered, What
NOT to Use, Version Compatibility Matrix, Confidence Assessment, and the entire
`npm view` / WebFetch verification-provenance log. That research already lives in
`.planning/research/STACK.md` (315 lines).

## Approach

Condense ONLY the Technology Stack block; preserve every load-bearing
specification verbatim:
- Project Invariants INV-1..4, Pre-bump checklist
- Architecture mental model (4-boundary diagram + crucial constraints)
- Even Hub canonical developer docs (INV-2 source of truth)
- Project description + Core Value + Constraints
- Working-in-repo guidance, Repository state, build/test commands
- All GSD-managed marker sections (project/stack/conventions/architecture/skills/workflow/profile)

Technology Stack → a "Key pins by package" summary + the full "Hard do NOT use"
list (load-bearing decisions kept intact) + a pointer to `.planning/research/STACK.md`
for the verbose rationale and INV-2 provenance.

## Acceptance

- CLAUDE.md materially smaller, no load-bearing spec lost.
- All 7 GSD `<!-- GSD:*-start/-end -->` markers intact and paired.
- Drift-corrected pins (TS 5.8.3, pnpm 10.33.4) retained.
- The "do NOT use" decisions retained verbatim in substance.
