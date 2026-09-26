# @evf/validation-harness

## 0.3.0

### Minor Changes

- 65ada3a: Relay pairing (ADR-0019): connect the glasses alone, with one QR, without a GM and without any Foundry login on the phone.

  - «Collega occhiali G2» / «Connect G2 glasses» (right-click your name in the Players list, Alt+G, or Settings): opening the window shows the QR and a 16-character code at once; the glasses reconnect by themselves whenever that browser has Foundry open. «Scollega» to forget them.
  - Your Foundry tab streams the sheet, the map (scene pictures now work on The Forge CDN too) and your actions through an end-to-end encrypted relay (`packages/relay`, Cloudflare Worker); Foundry no longer needs public HTTPS.
  - The glasses app ships on Even Hub (FoundryVTT G2 HUD: «Scansiona QR» with the phone camera, or the code) and on GitHub Pages `/app/`; it is no longer inside the module zip (Foundry ≥ 14.361 serves module HTML as text).
  - Migration: pair the glasses again once. The "(G2)" users of the previous version are no longer used — the GM may delete them.

### Patch Changes

- Updated dependencies [65ada3a]
  - @evf/shared-protocol@0.4.0

## 0.2.0

### Minor Changes

- ff883b1: Add `validate:direct-sideload` (ADR-0016 GO/NO-GO): with `FOUNDRY_URL` set it checks HTTPS,
  TLS reachability, that `/modules/evenfoundryvtt/g2/index.html` is served 200 `text/html`,
  reads `/api/status` when exposed, prints the pairing-QR URL form, and runs (or, with
  `--skip-hardware`, prints) the manual hardware checklist: QR load in the Even App, SDK bridge
  injection, cookie persistence across foreground exit/enter, socket reconnect.

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
