# @evf/validation-harness

## 0.1.0

### Patch Changes

- c80d16f: Quick-task 260529-khy: codebase-review fixes — Tier 1 (R1/R2/R3) + Tier 3 hardening.

  **Wave 1 — R1 FULL WebSocket reconnect rewire (CRITICAL, g2-app):**
  After a WS reconnect, ALL functionality recovers (display + input + outbound
  action dispatch) AND repeated reconnects work.

  - BLOCKER 1 — repeated-reconnect close re-arm (`ws-reconnect.ts`): the controller
    tracks `currentWs` and re-arms its `'close'` listener on the new socket after each
    successful reconnect, so a second/third disconnect is detected (previously reconnect
    worked exactly once → permanent dark on the next drop). `dispose()` removes the
    listener from `currentWs`, not the original socket.
  - BLOCKER 2 — outbound + missed inbound (`ws-sender.ts`, `status-hud-layer.ts`,
    `boot-engine-core.ts`): new `WsSender` holder gives panels/probes a stable
    outbound-socket indirection (`send`/`swap`) structurally assignable to the narrow
    panel `{send}` interfaces, so a reconnect's `holder.swap(newWs)` redirects every
    outbound sender (perfProbe + SlotPicker + both ActionOptionsModal) with no panel
    churn. A new optional `onReconnected(newWs)` controller callback fires after resume
    (before chip-unmount on both resume paths); the boot handler swaps the holder +
    disposes-and-re-attaches all 7 inbound listeners against the live socket — including
    reaction-prompt + portrait (the two sources missed in the first rewire) — plus
    `StatusHudLayer.rebindWsEvents` for the 3 HUD channels.

  **Wave 2 — Tier 1 robustness:**

  - R2 (g2-app `raster-controller.ts`): a fatal worker error now settles ALL pending
    frames (and a debounced `pendingPayload`) with the existing `RasterResponse.error`
    shape, clears the map and logs — previously a worker crash left awaiting callers
    parked forever.
  - R3 (foundry-module `combat-action-tracker.ts`): subscribe `deleteCombat` (mirroring
    combat-movement-tracker FIX E) to clear `_state` + `_attackIdSeen` on combat removal;
    unsubscribe closure offs the new hook id. (Hooks.on, not a socketlib handler — CI
    Gate 8 socketlib count stays 17.)

  **Wave 3 — Tier 3 hardening:**

  - R-longpress (g2-app spellbook + inventory panels): long-press now resolves the item
    under the cursor ROW via a header-aware row→item map instead of indexing the flat
    array with the content-row scroll offset (which dispatched the wrong item after
    scrolling past a section header).
  - shared-protocol schema bounds: `d20` → `int().min(1).max(20).nullable()`; debug-events
    `id` `.min(1)`, `ts` (+ perf-sample) and layer-index `z` `.int()`.
  - foundry-mcp `spell-lookup.ts`: relocate mass-cure-wounds (level 5) into a dedicated L5
    grouping + fix block-count comments (SPELL_LOOKUP length stays 70, SKT-02 gate).
  - foundry-mcp `bridge-client.ts`: snapshot getters pass `null` default to `_restGet`
    (network failure → null, not undefined); `ws.onclose` early-returns on a pre-handshake
    close so it does not fall through to the 4001 / other-close branches.
  - foundry-module `character-reader.ts`: spell `range.value === 0` with a non-self/touch
    unit renders `--` (not `0m`).
  - validation-harness `inv-suite.ts`: INV-5 returns `skipped` (not green) when the COR-
    vitest run exits 0 with no matching tests ("no test files found").

  Backward compatible: `onReconnected` is optional; `WsSender`, `rebindWsEvents`,
  `worker.onerror`, the deleteCombat hook and the row→item maps are all additive; schema
  tightenings reject only previously-invalid values; the bridge-client null default makes
  the `… | null` return type honest.
