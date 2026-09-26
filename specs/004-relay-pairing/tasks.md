# Tasks: Relay pairing (004)

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md)
**Prerequisite**: ADR-0019 accepted by the maintainer (done 2026-09-25). Status below = implemented on branch `docs/relay-pairing-research`.
Tests are written first in every phase (Constitution II). `[P]` = parallelizable.

## Phase 1 — Relay (unblocks G1, G3)

- [x] T001 Create `packages/relay` (package.json, `wrangler.toml` with SQLite DO migration, tsconfig, vitest project) — pinned `wrangler` 4.140.0
- [x] T002 [P] Tests: route validation (404/426), one socket per role, forward only to peer, newcomer `peer-up`, replaced socket (4000) emits no `peer-down`, frame > 1 MiB → 1009, > 60 frames/s → 1008, `/health` CORS
- [x] T003 Implement Worker + `Room` DO (Hibernation API) to pass T002
- [x] T004 Integration test against `wrangler dev` (`relay.it.test.ts`) + real-session E2E (`g2-app/src/direct/relay.e2e.test.ts`) in the CI step «Relay end-to-end»
- [x] T005 Workflow `relay-deploy.yml`: `wrangler deploy` on `main` when `packages/relay/**` changes (secret `CLOUDFLARE_API_TOKEN`, maintainer one-time setup documented)

## Phase 2 — Protocol v2 (shared-protocol)

- [x] T006 [P] Tests + impl: pairing link `#c=<CODE>` (Amd 1, was payload v2 JSON) encode/read; code → HKDF room/key
- [x] T007 [P] Tests + impl: messages v2 (`hello` w/o user, `welcome.rotate {room,key}`, `asset`), relay contract (`relay.ts`)
- [x] T008 Delete `ecdh.ts`, `custody.ts` and their exports/tests

## Phase 3 — Projector (foundry-module)

- [x] T009 Tests + impl `relay-connection.ts`: `RelayConnection` (back-off, peer events, 4000 = stand by) + `withProjectorLock` (Web Lock per device)
- [x] T010 Rewrite `projector.ts` on the relay (one channel per pairing, serialised inbox/outbox); election/custody removed; `dispatchTool` kept (Gate 8 unchanged)
- [x] T011 Client-scoped `pairing-store`; unified `PairG2App` (actor picker → relay ✓/✗ → QR + code + countdown → connected → «Scollega»)
- [x] T012 `map-assets.ts`: scene pictures loaded in the tab, downsized once, sent as `asset` (phone renderer unchanged — simpler than projector-side tiles, see research D6)
- [x] T013 Delete `g2-user`, `glasses-access`, `identity-keys`, `custody-sync`, `election`, `self-pairing`, GM enablement menu (migration: old pairings are simply not read — glasses show «unpaired»; leftover "(G2)" users can be deleted by the GM, documented in the changelog)

## Phase 4 — G2 app

- [x] T014 Tests + impl `relay-client.ts` (reconnect on `FOREGROUND_ENTER`/online, `peer-down` → S12 `no-projector`); delete `foundry-client.ts`, `socket.io-client`
- [x] T015 Credentials v2 (`localStorage` + SDK mirror) + migration (old record → "re-pair")
- [x] T016 Phone page: **Scansiona QR** (`captureImageFromCamera` → `jsqr`, lazy) + code field; IT/EN strings width-budgeted
- [x] T017 Map snapshot hydrated from `asset` messages; schematic fallback kept; INV-1 fixtures green (S10/S11 regenerated for the new strings, widths ≤ 241/350 px)
- [x] T018 Regression test: no request to the Foundry origin anywhere in the bundle (F1)
- [x] T019 SDK 0.0.15 → 0.0.16 (`npm view` re-check), `app.json` whitelist = relay (`https://` + `wss://`), `camera` permission

## Phase 5 — Distribution & dev loop

- [x] T020 `vite build` → `packages/g2-app/dist`; CI Gate 10 rewritten; remove `packages/foundry-module/g2/` + `.gitignore` entry; module zip without `g2/`
- [x] T021 GitHub Pages via Actions: `docs/` + app under `/app/` (+ privacy policy page naming the relay domain)
- [x] T022 `pnpm dev:glasses` = `scripts/wizard.sh --mode live` (app on LAN, relay check, `--local-relay` = wrangler dev); module settings «Glasses app page» / «Relay» (advanced)
- [x] T023 Release workflow: `.ehpk` packed with production whitelist, attached; `docs/release/evenhub.md` rewritten (beta group → review)

## Phase 6 — Docs, gates, acceptance

- [x] T024 `validate:relay` harness (G1–G3, `--skip-hardware`)
- [x] T025 INV-3 commit: ADR-0019 accepted + index; ADR-0016/0017 status notes; Specs v0.13.0 (§ pairing, §11.5.3/4, changelog with drift F1 CRITICAL); README; showcase; wiki; setup guide; runbook; CLAUDE.md
- [x] T026 Changesets (module minor, g2-app minor, relay initial)

## Phase 7 — Hardware UAT (defer-hardware)

- [ ] T027 Beta build on iOS + Android: scan, play, lock 5 min, kill/reopen (G2)
- [ ] T028 Forge private v14 game + self-hosted v13: pairing, map, action (G1)
- [ ] T029 Measure relay requests/GB-s for one real session (G3)
