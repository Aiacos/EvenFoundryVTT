---
"@evf/foundry-module": minor
"@evf/bridge": minor
"@evf/g2-app": minor
"@evf/shared-protocol": minor
---

Phase-8 write channel + skill-check tool, end-to-end.

The bridge could receive `tool.invoke` envelopes but had no way to execute write
tools in Foundry (it cannot use socketlib; the only bridge↔Foundry channel was the
one-way module → `/internal/delta` POST). This adds a poll-based REVERSE channel that
mirrors the player-view stream-request pattern:

- **bridge**: a new in-memory `ToolInvocationQueue` (`enqueue`/`drainPending`/`resolveResult`
  with a 10s `foundry_timeout`) and two internal-secret-guarded, rate-limit-exempt
  routes — `GET /internal/tool-requests` (drain pending) and `POST /internal/tool-result`
  (resolve the awaiting promise). The production WS dispatch now enqueues on this queue
  (the test override is preserved).
- **foundry-module**: a GM-gated `tool-invocation-poller` (≈1s cadence, fault-tolerant)
  polls the bridge, dispatches each write, and POSTs the result back. The ADR-0014
  per-actor write authorization was extracted into a single shared
  `dispatchToolAuthorized` used by BOTH the socketlib adapter and the new poller, so
  both channels enforce identical authorization. No new socketlib handler is added
  (the `socket.register` count stays 17).
- **skill-check tool**: new `skill-check` write tool — `actor.rollSkill({ skill,
  advantage, disadvantage })` (dnd5e 5.x config-object API). Added to the shared
  `TOOL_ID_SCHEMA`, the module `ToolId`/`TOOL_HANDLER_IDS`, and a new handler.
- **g2-app**: a new interactive canvas Skills panel (Quick Action `[K]`) that, on tap,
  dispatches a `skill-check` `tool.invoke` directly (no ActionOptions modal), plus the
  `[K]` menu item, icon, and `quick_item_skills` i18n key (IT/EN/DE).
