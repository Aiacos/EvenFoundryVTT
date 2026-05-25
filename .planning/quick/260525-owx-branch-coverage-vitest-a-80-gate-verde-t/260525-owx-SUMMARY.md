---
phase: quick-260525-owx
plan: 01
status: complete
date: 2026-05-25
branch: feature/coverage-80pct
---

# Quick Task 260525-owx — Summary

## Objective

Raise global Vitest **branch** coverage from 78.11% to ≥80% so CI gate 4 ("Vitest with coverage") goes green on `main` and `develop`. Only `branches` failed the 80% threshold (statements/functions/lines already passed).

## Result

| Metric | Before | After | Gate |
|--------|--------|-------|------|
| Branches | **78.11%** (2814/3603) | **80.72%** (2906/3600) | ✅ GREEN |
| Statements | 87.64% | 90.86% | ✅ |
| Functions | 86.73% | 89.4% | ✅ |
| Lines | 88.51% | 91.7% | ✅ |
| `pnpm test:coverage` | exit 1 | **exit 0** | ✅ |
| `pnpm typecheck` | pass | pass | ✅ |
| `pnpm lint:ci` | pass | pass | ✅ |

Verified by the orchestrator on the merged integration branch (`9917b81`): `pnpm test:coverage` → exit 0, `All files … 80.72` branches.

## What changed

**Task 1 — Security-preserving extraction** (`refactor(foundry-mcp): extract bearerEquals to tested security helper`, `212163d`)
- Extracted `bearerEquals` (constant-time bearer-token compare, mitigation T-11-02) out of the to-be-excluded boot file `http.ts` into `packages/foundry-mcp/src/security/bearer-equals.ts`.
- Added `bearer-equals.test.ts` (6 cases: equal, unequal, length-mismatch, empty, timing-safe property). `http.ts` rewired to import it. Keeps the security primitive under coverage even though the boot file is excluded.

**Task 2 — Justified exclusions** (`test(*): exclude un-instrumentable boot/worker files from coverage`, `4284a19`)
- Added 3 inline-justified entries to `vitest.config.ts` `exclude[]`, each mirroring the existing `bridge/src/index.ts` migration-rule comment:
  - `packages/g2-app/src/raster/raster-worker.ts` — body runs in a `new Worker(new URL(...))` thread; v8 cannot instrument it; not imported by any test.
  - `packages/foundry-mcp/src/http.ts` — top-level async-IIFE server-boot entry that self-listens on import (sibling of already-excluded `bridge/src/index.ts`).
  - `packages/foundry-mcp/src/index.ts` — boot entry stub.
- Thresholds left untouched (80/80/80).

**Task 3 — Real branch tests** (`test(*): cover branch arms to lift global coverage >=80%`, `69d14b3`)
- `foundry-mcp/src/tools/bridge-client.ts` — REST/WS guard + error + default branches via mocked `fetch` and mock-WS helpers.
- `foundry-mcp/src/logger.ts` — exported factory + T-11-01 redact-list branch.
- `bridge/src/routes/{scene,character,combat}.ts` — guard arms via Fastify `.inject()` (pattern from `portrait.test.ts`).
- Optional `tool-invoke.ts` tests were **not needed** — 80.72% reached without them.

## Deviations (all legitimate test/typing fixes, not metric-gaming)

1. Test case 13 asserted `toBeNull()` but `_restGet` without `defaultValue` returns `undefined` → corrected to `toBeUndefined()`.
2. Biome flagged duplicate imports from `./character.js` → merged type+value import.
3. TS2347 on `res.json<T>()` when typed `ReturnType<typeof Fastify>` → switched route test files to `Awaited<ReturnType<typeof makeApp>>`.
4. Character/combat happy-path fixtures failed Zod `safeParse` (missing required fields) → rebuilt fixtures to full schema shape.

## INV-4 compliance

Real assertions only (no empty/skipped tests to inflate); every coverage exclusion carries an inline justification; thresholds not lowered; the only product-logic change is the `bearerEquals` import-swap.

## Orchestrator follow-up

On branch `feature/coverage-80pct`. Orchestrator opens a PR → `develop`. Once merged and CI is green on `develop`, add `quality-gates` as a **required status check** on `main` + `develop` to complete the "CI green to merge" intent.

> Note: the original worktree-authored SUMMARY was lost when the orchestrator force-removed the worktree without the docs-rescue step; this file was reconstructed from the executor's verified results.
