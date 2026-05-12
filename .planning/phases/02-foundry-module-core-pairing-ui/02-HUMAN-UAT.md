---
status: partial
phase: 02-foundry-module-core-pairing-ui
source: [02-VERIFICATION.md]
started: 2026-05-12T10:00:00.000Z
updated: 2026-05-12T10:00:00.000Z
---

## Current Test

[awaiting human testing — requires real Foundry VTT v13.347+ + Even Realities G2 hardware + Even App WebView access]

## Tests

### 1. QR SVG renders inline in Foundry DM settings panel
expected: Open Foundry world, navigate to Settings → EvenFoundryVTT → "Pair a new device" → modal appears with valid QR SVG embedded inline (no broken image, no `<img src=>` external fetch). Refresh button regenerates the QR. Revoke button invalidates the bearer.
file: packages/foundry-module/src/pair/PairModal.ts:288
result: [pending]

### 2. Phone wizard 3-step flow completes end-to-end in Even Realities App WebView
expected: Even App loads the plugin, wizard.html opens, Step 1 accepts bridge URL, Step 2 accepts bearer paste (or QR scan in V2), Step 3 lists characters from `/v1/characters`, Completion screen shows. All Italian + English copy is correct (44 i18n keys across UI-A 24 + UI-B 20).
file: packages/g2-app/src/wizard/wizard.ts
result: [pending]

### 3. Tier 3 storage persists across app kill/restart
expected: After completing the wizard, kill the Even App fully, reopen — saved session is restored via `hub.getItem('evf:session')`. Bearer is restored. Verify bearer is NOT persisted in clear text — only `tokenObfuscated: null` invariant.
file: packages/g2-app/src/wizard/tier3-storage.ts (saveSession/loadSession)
result: [pending]

### 4. `g2.wear` event fires and triggers auto-connect
expected: Wear the G2 glasses while the Even App is running the plugin (post-wizard). `hub.eventBus.on('g2.wear', ...)` fires; `handleWear()` executes; WS connects automatically without manual user action.
file: packages/g2-app/src/wizard/auto-connect.ts:85
result: [pending]

### 5. WS handshake completes with live bridge + Foundry socketlib roundtrip
expected: Bridge running, Foundry world running with EvenFoundryVTT installed + socketlib + midi-qol. WS connect to `wss://<bridge>/ws` succeeds; handshake exchanges `client_hello` → `server_hello` with `caps: SERVER_CAPS_V1`; bridge calls `socketlib.executeAsGM("validateBearer", token)` via the Foundry socket and the token validates. Token cache hits on 2nd connection within 5 min.
file: packages/bridge/src/ws/handshake.ts:51, packages/bridge/src/auth/token-cache.ts
result: [pending]

### 6. Delta push pipeline fires live (Foundry hook → bridge POST → WS fanout)
expected: A character HP change in Foundry triggers `Hooks.on('updateActor')` → `characterReader` produces snapshot → `bridgeDeltaEmitter` POSTs to `/internal/delta` with `internal_secret` → bridge validates timing-safely → `DeltaEmitter` fans out to subscribed WS sessions → the wizard's WS receives the delta envelope.
file: packages/foundry-module/src/module.ts:111-137, packages/bridge/src/routes/internal-delta.ts
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 6  # all blocked on real G2 hardware + Foundry + Even Hub access

## Gaps

### GAP-01: pnpm test:coverage exits 1 (CI gate)
Severity: Medium. See 02-VERIFICATION.md "Gaps" for details.
Status: open

### GAP-02: `evf.internalSecrets` setting key name mismatch (doc inconsistency)
Severity: Low. See 02-VERIFICATION.md "Gaps" for details.
Status: open
