---
phase: quick-260604-mjr
plan: 01
subsystem: foundry-module
tags: [settings, applicationv2, pairing, bridge-config, i18n]
requires:
  - "@evf/foundry-module settings.ts + PairModal ApplicationV2 pattern"
  - "BRIDGE_URL_REGEX shape rule (g2-app wizard step1-profile.ts)"
provides:
  - "BridgeConfigModal — dedicated EVF Bridge Configuration dialog (pre-load + validate + persist)"
  - "bridgeConfig settings menu (game.settings.registerMenu)"
affects:
  - "bridgeUrl + bridgeInternalSecret world settings (now config:false, managed via the dialog)"
tech-stack:
  added: []
  patterns:
    - "ApplicationV2 + HandlebarsApplicationMixin dialog mirroring PairModal"
    - "Precomputed boolean flags in _prepareContext (no eq helper — Foundry does not register one)"
    - "Masked password input + Reveal toggle for secret; secret never console-logged"
key-files:
  created:
    - packages/foundry-module/src/pair/BridgeConfigModal.ts
    - packages/foundry-module/templates/bridge-config.hbs
    - packages/foundry-module/src/pair/BridgeConfigModal.test.ts
    - .changeset/bridge-config-modal.md
  modified:
    - packages/foundry-module/src/settings.ts
    - packages/foundry-module/src/module.test.ts
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/foundry-module/lang/en.json
    - packages/foundry-module/lang/it.json
    - packages/foundry-module/module.json
    - packages/foundry-module/package.json
decisions:
  - "Demote bridgeUrl + bridgeInternalSecret to config:false; manage solely via BridgeConfigModal dialog (removes the easy-to-miss generic-panel Save footgun)."
  - "Copy BRIDGE_URL_REGEX verbatim into BridgeConfigModal (no cross-package import from g2-app into the Foundry bundle); same shape rule the wizard enforces."
  - "Add ui.notifications + optional registerMenu hint to foundry-globals.d.ts (Rule 3 — first non-test consumer of ui.notifications + registerMenu hint)."
metrics:
  duration: ~10 min
  completed: 2026-06-04
---

# Quick Task 260604-mjr: Dedicated EVF — Bridge Configuration dialog Summary

Added a dedicated `BridgeConfigModal` ApplicationV2 dialog that pre-loads, displays, validates and reliably persists the bridge URL + internal secret on an explicit Save with success feedback; the two settings are demoted to `config:false` (managed solely through this dialog) so the easy-to-miss generic "Configure Settings" panel Save can no longer leave them looking empty.

## What was built

- **`BridgeConfigModal.ts`** — ApplicationV2 + HandlebarsApplicationMixin dialog mirroring PairModal exactly. `_prepareContext` pre-loads the saved `bridgeUrl` + `internalSecret` (string-coerced, `''` when unset) plus a precomputed `hasSecret` boolean and a pre-localised i18n map. `_onClickSave` validates the URL against the shared `BRIDGE_URL_REGEX`, writes BOTH settings via `game.settings.set`, shows `ui.notifications.info`, then closes; an invalid URL triggers `ui.notifications.error` and writes nothing. `_onClickCancel` closes without writing. `_onClickReveal` toggles the masked secret input between `password`/`text` and swaps the button label. The secret is never trimmed and never passed to `console.*`.
- **`bridge-config.hbs`** — form with a text `bridgeUrl` input (pre-filled), a masked `bridgeInternalSecret` input (pre-filled, escaped `{{internalSecret}}` value attribute, Reveal button), Save (primary) + Cancel footer buttons. Uses only `{{i18n.*}}` pre-resolved strings; no `eq` helper.
- **`settings.ts`** — both settings flipped to `config:false` (same keys/scope/type/default/restricted); new `registerMenu(MODULE_ID, 'bridgeConfig', { type: BridgeConfigModal, ... })` after the existing `pairDevice` menu. JSDoc updated to document the demotion + dialog.
- **i18n** — `evf.settings.bridge_config_*` + `evf.bridgecfg.*` keys added to both `en.json` and `it.json` (key sets identical, verified: 48 keys each).
- **Version** — `module.json` + `package.json` bumped 0.1.7 → 0.1.8; `module.json` download URL → v0.1.8; patch changeset added.

`getBridgeUrl()` / `getInternalSecret()` in `module.ts` were not touched — they still read the same two setting keys (scope/type/default unchanged), so they keep working.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | BridgeConfigModal dialog + template + TDD tests | `71685a6` | BridgeConfigModal.ts, bridge-config.hbs, BridgeConfigModal.test.ts |
| 2 | Wire bridgeConfig menu + demote settings to config:false + i18n + module.test fixes | `ae29724` | settings.ts, module.test.ts, en.json, it.json |
| 3 | Version bump 0.1.8 + changeset + ui/registerMenu type surface | `d2e6df4` | module.json, package.json, foundry-globals.d.ts, .changeset/bridge-config-modal.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] foundry-globals.d.ts lacked `ui` global + `registerMenu` `hint` field**
- **Found during:** Task 3 (tsc gate)
- **Issue:** `tsc` failed: `Cannot find name 'ui'` (BridgeConfigModal is the first non-test consumer of `ui.notifications`) and `'hint' does not exist` on the `registerMenu` data type.
- **Fix:** Added a `declare const ui: { notifications?: { info/warn/error } }` ambient global and an optional `hint?: string` field on `FoundrySettings.registerMenu`'s data parameter, both with JSDoc.
- **Files modified:** packages/foundry-module/src/types/foundry-globals.d.ts
- **Commit:** `d2e6df4`

**2. [Rule 3 - Blocking] BridgeConfigModal.test.ts import of `../module.js` threw `ReferenceError: Hooks is not defined`**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `BridgeConfigModal.ts` imports `MODULE_ID` from `../module.js`, which registers `Hooks.once('init', ...)` at module-load. The test's stubs initially omitted `Hooks`.
- **Fix:** Added `vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() })` to the test `beforeEach` (same approach PairModal.test.ts uses).
- **Files modified:** packages/foundry-module/src/pair/BridgeConfigModal.test.ts
- **Commit:** `71685a6`

### Environment substitution (pre-approved)

Per the dispatch environment note, the repo-wide husky `biome ci .` pre-commit hook surfaces ~300 pre-existing dev-harness warnings unrelated to this task, so commits used `git commit --no-verify` and the file-scoped gates were run manually instead:
- `corepack pnpm exec biome ci <changed files>` — passed (1 non-blocking `info`: the empty test-stub constructor suggestion, identical to the existing PairModal.test.ts stub).
- `corepack pnpm --filter @evf/foundry-module exec tsc --noEmit` — clean.
- `corepack pnpm --filter @evf/foundry-module exec vitest run` — 536/536 pass.

## Verification

- `tsc --noEmit` (foundry-module): clean.
- `biome ci` on all 5 touched source files: passed (1 non-blocking info, matches existing PairModal.test.ts pattern).
- `vitest run` (full foundry-module suite): **536/536 pass** (was 528; +7 BridgeConfigModal tests +1 bridgeConfig menu test). The socketlib 17-handler invariant test passed untouched.
- en.json + it.json key sets identical (48 keys each).
- module.json + package.json = 0.1.8; download URL → v0.1.8; changeset present.
- `grep -n console packages/foundry-module/src/pair/BridgeConfigModal.ts` → only two JSDoc comment references ("dev console", "console.*"); no code passes the secret to `console.*`.

## Known Stubs

None — the dialog wires real `game.settings.get/set` for both keys; no placeholder/mock data sources remain.

## Self-Check: PASSED

- Created files exist: BridgeConfigModal.ts, bridge-config.hbs, BridgeConfigModal.test.ts, .changeset/bridge-config-modal.md — all FOUND.
- Commits exist: `71685a6`, `ae29724`, `d2e6df4` — all FOUND.
