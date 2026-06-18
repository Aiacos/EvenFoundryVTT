---
quick_id: 260618-d72
slug: headless-player-view-workflow-fixes
date: 2026-06-18
status: complete
---

# Summary: headless player-view workflow fixes (ADR-0015 §C)

Fixed 4 bugs found during a workflow review; root symptom "streaming headless non
resetta nella vista party". 4 atomic commits; all gates green (lint:ci 0,
typecheck 0, bridge 593 tests, foundry-module 671 tests + known teardown flake).

## Commits

- **38790fb** `fix(bridge): streaming player-view joins a configured Foundry user`
  BUG 1 — `EVF_PLAYER_VIEW_STREAM_USER`: orchestrator `EnvConfig.streamUser` →
  `HeadlessSessionConfig.streamUser` (streaming only); `tryFoundryJoin` selects by
  `/join` label, fallback to first-option when unset. `.env.example` +
  docker-compose + ADR-0015 + ORC-09/09b tests.
- **b8cf387** `fix(bridge): assert headless joins the requested Foundry user`
  BUG 3 — post-`canvas.ready` assert `game.user.name` matches the requested user
  (actor→userName, streaming→streamUser); mismatch throws secret-free → orchestrator
  reports error. Extracted+exported `requestedUserFor()` + unit tests.
- **d297f6c** `fix(foundry-module): roster heartbeat ... (v0.1.34)`
  BUG 4 — stream leader re-publishes `r1.characters.available` every 10s (mirrors
  the settings heartbeat) so the bridge cache stays warm after a restart. Module
  bumped 0.1.33 → 0.1.34 + CHANGELOG.
- **edcb8f1** `fix(bridge): replay the cached roster to late WS subscribers`
  BUG 5 — on WS subscribe, replay cached roster via `sendInitialToSession(
  R1_CHARACTERS_AVAILABLE_TYPE)` (mirrors settings.display replay). WS integration test.

## Not done here (live re-test required)

- **Bridge image rebuild** (BUG 1/3/5) + set `EVF_PLAYER_VIEW_STREAM_USER` in
  `deploy/.env` to a Foundry user whose viewport frames the party.
- **Module redeploy to Foundry** (BUG 4) — release v0.1.34, update on The Forge.
- BUG 2 (forced-leader suppression) is correct-by-design; no change.
