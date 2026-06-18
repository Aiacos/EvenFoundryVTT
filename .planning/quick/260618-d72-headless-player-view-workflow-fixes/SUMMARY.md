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

- **d762987** `feat(*): streaming map-view joins the PC chosen in the EvenHub app`
  Follow-up (user request): the streaming user is chosen FROM THE APP by reusing the
  "Personaggio / Ruolo" selector — app sends `actorId` in streaming, bridge resolves
  it to the PC's owning user (opt-in gated), headless joins as that user;
  `EVF_PLAYER_VIEW_STREAM_USER` is the fallback. App value wins (intent-over-env).
  Spans shared-protocol (doc) + bridge (handler/orchestrator) + g2-app
  (settings-panel re-drive, boot actorId) + tests (CPV-07/07b, ORC-09c, panel).

- **ff0ae17** `fix(bridge): headless re-selects the requested user when Foundry auto-enters`
  BUG-3 follow-on. Live test then proved The Forge BINDS the streaming account to its
  own user and refuses a cross-user /join → headless cross-user join is impossible on
  Forge. Kept for self-hosted Foundry.
- **66d5018 + 27a0b8e** `feat: browser-capture (headless off by default) + owner-elected leader (module v0.1.35)`
  Pivot (user decision): capture the player's REAL view from their already-open
  browser. Bridge: `EVF_PLAYER_VIEW_HEADLESS` gates the headless OFF by default
  (browser-capture → `{live,'browser capture'}`); new `GET /internal/stream-request`.
  Module: polls it + `ownerElection()` elects the requested actor's active+consenting+
  non-GM owner as stream leader. Tests ORC-BC1/2/3, SR-REQ-01/02, OE-1..6. Bridge image
  rebuilt + container recreated (endpoint live); module **v0.1.35** released (Latest).

## Not done here (live re-test required)

- **Bridge image rebuild** (BUG 1/3/5) + set `EVF_PLAYER_VIEW_STREAM_USER` in
  `deploy/.env` to a Foundry user whose viewport frames the party.
- **Module redeploy to Foundry** (BUG 4) — release v0.1.34, update on The Forge.
- BUG 2 (forced-leader suppression) is correct-by-design; no change.
