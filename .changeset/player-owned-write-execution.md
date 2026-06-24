---
"@evf/foundry-module": minor
"@evf/bridge": minor
---

Player-owned write execution (ADR-0011 Amendment 2): write tools (skill-check,
attack, spell, use-item) now execute on the OWNING user's client — a player rolls
their own actor's actions without a GM online. The bridge tags each queued
invocation with the bearer's bound Foundry user and serves `GET
/internal/tool-requests?userId=<id>`; each client's poller drains only its own
user's invocations. The per-actor write authz (dispatchToolAuthorized, ADR-0014)
is unchanged. Removes the previous GM-only gate on the poller.
