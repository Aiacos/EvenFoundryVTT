---
status: incomplete
quick_id: 260614-r81
slug: code-review-fixes-batch
date: 2026-06-14
branch: feat/hud-raster-rendering
---

# Quick Task SUMMARY — code-review-fixes-batch

Applied fixes from a full-codebase code review. 13 atomic commits. `pnpm typecheck` + `pnpm lint:ci` green; per-package test suites green (full `pnpm test` exits 1 only on the pre-existing `module.test.ts` bearer-rotation teardown flake — known, unrelated).

## Completed

| Task | Commit | Result |
|------|--------|--------|
| T1 fix CI INV-4 TODO gate (ERE→PCRE) | `e1b2409` | done — gate now actually fires; scoped to first-party src |
| T2 gitignore scratch/build dirs | `c34df6c` | done — `_*.ts`, `release/`, `release-artifacts/` |
| T3 ADR index (0012/0013, fix 0005) | `79c2906` | done — INV-3 coherence |
| T4 normalize TODO tags | `74eac82` | done — no invented issue numbers; placeholders → truthful NOTE/Deferred |
| T5 PairModal no-arg construction (CRITICAL) | `86e6dd8` | done — reads settings/world.id at render; +2 regression tests |
| T6 WS handshake idle timeout | `5359d58` | done — 10s → close 4400; +4 tests |
| T7 WS maxPayload + connection cap | `f682bb0` | done — 256KB / 64 conns; +2 tests |
| T9 reconnect wsEventBus rebind | `24227d2` | done — canvas-mode consumers rebound; +5 tests |
| T10 live [N] locale to panels | `7c79ca9` | done — mutable locale ref; +2 tests |
| T11 frame queue `.finally` un-wedge | `bb4d040` | done — +1 test |
| T12 canvas-extractor `Hooks.off` leak | `d4b458f` | done — +2 tests |
| T14 settings-display tests + strict schema | `46dc09c` | done — strictObject + 28 tests; full suite 3544 pass |
| T13 delete dead rle-encoder (NARROWED) | `a16cb9c` | done — only rle-encoder deleted; legacy raster pipeline kept (live BLE fallback) |

## NOT done — needs a design decision

- **T8 — bridge REST actor-ownership leak (HIGH security).** HALTED, not committed. Root cause: bearer tokens are **world-scoped, not actor-scoped** — there is no token→actor ownership model anywhere (`BearerRegistryEntrySchema = {alias, token, expiresAt, worldId}`). The WS `selectedActorId` is **client-supplied targeting, not authorization** (a client freely pins itself to any actorId), and the Foundry-side `handleGetCharacterSnapshot` also returns any actorId for any valid token. A correct fix requires binding actors to bearers at pairing time (Foundry side, where real `Actor`/`User` ownership lives) → `BearerRegistryEntrySchema` migration → enforce on **both** WS handshake-pin and REST paths. This is an ADR-level cross-package change, not an atomic quick fix. **Recommend: new ADR + dedicated phase.**

## Deferred (logged, not blocking)
- Pre-existing Biome `useLiteralKeys` infos in `bridge/src/server.ts` (env access) — see `deferred-items.md`.
- Reviewer MEDIUM/LOW findings (rate-limit key, internal-delta fan-out allowlist, portrait SSRF hardening, hot-path buffer copies, doc 400×200 drift, duplicate raster-hash golden, etc.) — not in this batch's scope.
