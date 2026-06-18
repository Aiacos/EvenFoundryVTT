---
quick_id: 260618-d72
slug: headless-player-view-workflow-fixes
date: 2026-06-18
status: in-progress
---

# Quick Task: headless player-view workflow fixes (ADR-0015 §C)

Fix 4 bugs found during a workflow review of the headless player-view pipeline.
Root symptom: "streaming headless non resetta nella vista party". Atomic commit
per fix, in order. After each: `pnpm lint:ci` + `pnpm typecheck` + affected tests.

## BUG 1 (bridge + deploy + docs) — streaming joins an arbitrary Foundry user
`playwright-browser.ts tryFoundryJoin` streaming branch picks the first non-empty
`<option>` of `select[name="userid"]` → often a fogged player, not the streamer.
- `orchestrator.ts`: `EnvConfig.streamUser` from `EVF_PLAYER_VIEW_STREAM_USER`; into cfg.
- `headless-browser.ts`: `HeadlessSessionConfig.streamUser`.
- `playwright-browser.ts`: streaming selects by label when `cfg.streamUser` set; else first-option.
- `deploy/.env.example`, `deploy/docker-compose.yml` pass-through, ADR-0015 doc.
- Tests: orchestrator (cfg build) + playwright join branch.

## BUG 3 (bridge) — Foundry auto-entry can bypass /join
After world-ready, assert `game.user.name` matches the requested user
(actor→`cfg.userName`, streaming→`cfg.streamUser` when set). Mismatch → secret-free
throw → orchestrator reports error/unavailable. Skip when no specific user requested.

## BUG 4 (foundry-module) — roster has no heartbeat (settings does)
`module.ts` ready: add a periodic re-publish of `r1.characters.available` (mirror
`setInterval(emitDisplaySettings, SETTINGS_HEARTBEAT_MS)`) so the bridge
CharacterListCache stays warm after a bridge restart / leadership migration.
Bump module version + CHANGELOG.

## BUG 5 (bridge) — roster not replayed to late WS subscribers
On WS subscribe (`server.ts`, mirror SETTINGS_DISPLAY_TYPE replay ~:858): if
`characterListCache.get()` non-null, `sendInitialToSession(sessionId,
R1_CHARACTERS_AVAILABLE_TYPE, snapshot)`. Test in server/initial-snapshot.

## Out of scope / follow-up
- Live re-test: bridge image rebuild (BUG 1/3/5), module redeploy to Foundry (BUG 4).
- BUG 2 (forced-leader suppression) is correct-by-design; no change.
