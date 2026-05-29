---
"@evf/g2-app": patch
---

Quick-task 260529-khy Wave 1: R1 FULL WebSocket reconnect rewire (CRITICAL).

After a WS reconnect, ALL functionality now recovers (display + input + outbound
action dispatch) AND repeated reconnects work.

- **BLOCKER 1 — repeated-reconnect close re-arm** (`ws-reconnect.ts`): the controller
  now tracks `currentWs` and re-arms its `'close'` listener on the new socket after
  each successful reconnect, so a second/third disconnect is detected (previously
  reconnect worked exactly once → permanent dark on the next drop). `dispose()` removes
  the listener from `currentWs`, not the original socket.
- **BLOCKER 2 — outbound + missed inbound** (`ws-sender.ts`, `status-hud-layer.ts`,
  `boot-engine-core.ts`): new `WsSender` holder gives panels/probes a stable
  outbound-socket indirection (`send`/`swap`) structurally assignable to the narrow
  panel `{send}` interfaces, so a reconnect's `holder.swap(newWs)` redirects every
  outbound sender (perfProbe + SlotPicker + both ActionOptionsModal) with no panel
  churn. A new optional `onReconnected(newWs)` controller callback fires after resume
  (before chip-unmount on both resume paths) and the boot handler swaps the holder +
  disposes-and-re-attaches all 7 inbound listeners against the live socket — including
  reaction-prompt + portrait (the two sources missed in the first rewire) — plus
  `StatusHudLayer.rebindWsEvents` for the 3 HUD channels.

Backward compatible: `onReconnected` is optional, `WsSender` is additive, and
`rebindWsEvents` is additive — existing controller/panel/HUD/boot callers are unchanged.
