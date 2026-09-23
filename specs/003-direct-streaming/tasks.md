# Tasks: Direct Foundry → G2 Streaming (port onto `develop`, v0.12.0)

**Feature**: 003-direct-streaming · **Plan**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md)

## Phase 1: Merge

- [X] T001 Renumber our ADR-0012/0013/0014 → 0016/0017/0018 on the source branch (`ff883b1`).
- [X] T002 Merge onto `origin/develop`; delete `packages/bridge`, `packages/foundry-mcp`, `deploy/`, bridge-only docs and changesets (`98fa1a5`).
- [X] T003 Keep remote foundry-module fixes (`184f172`, `448a56c`, `079e6d6`, `0ce4322`, `5486ff8`, `fbb9f83`, `skill-check`, combatant `ac`, feats/bio readers).

## Phase 2: Code ports

- [ ] T010 g2-app sheet page on the 2×2 288×144 grid (top band split at x = 288, sheet tile (0,144)); ids images-first; rejected-rebuild probe + fallback.
- [ ] T011 ABNORMAL_EXIT handling; `sysEvent.eventSource` gate.
- [ ] T012 `app.json` version = package version, `description`, `icon`, `min_app_version`, `min_sdk_version` 0.0.15.
- [ ] T013 Skill/save roll from the request view via `skill-check`; consumable targets through the target view.
- [ ] T014 Spell `prepared` numeric correction; `details.classLabel?`; live `userOwnsActor` check with audit on deny.
- [ ] T015 `shared-render` `./testing` subpath; `TOOL_ID_SCHEMA` adds `end-turn`.
- [ ] T016 Release workflow: esmodule stamp, graceful notes, `.ehpk` upload; `release.yml` `actions: write`; TODO gate optional space.
- [ ] T017 Hardware regression tests (ids, capture `' '`, no text under image, grid anchors, sync-replay subscribe, bundle without `node:fs`).

## Phase 3: Docs (INV-3, one commit)

- [ ] T020 `Specs.md` v0.12.0 (§2.0, §7.0 with tile geometry, SUPERSEDED banners, changelog), `README.md`, showcase, `CLAUDE.md`.
- [X] T021 ADR status notes (0002–0005, 0011–0015) + Relates/Supersedes in 0016–0018 + ADR-0018 Amendment 1 (tile geometry) + index.
- [X] T022 Constitution 1.1.0 (principle XI icons, V debug loop, IX gate rule).
- [ ] T023 Wiki v0.12.0 (fold `Testing-and-Distribution`), guides (`setup-guide`, `runbook`, `release/*`, `firmware-compatibility`).

## Phase 4: Verify & release

- [ ] T030 `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status`.
- [ ] T031 Hardware GO/NO-GO: `validate:direct-sideload` + sheet tile geometry on real G2 + R1 (defer-hardware).
- [ ] T032 Close PR #39 unmerged; release foundry-module `v0.2.0` with migration note (remove the bridge container, re-pair glasses).
