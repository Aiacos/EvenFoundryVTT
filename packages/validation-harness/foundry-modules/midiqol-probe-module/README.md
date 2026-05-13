# EVF Phase 0 MidiQOL Probe — Foundry Module

**Purpose:** Read-only probe that reads MidiQOL configuration settings from a Foundry test world and POSTs them to a localhost harness endpoint. Used by REQ MIDIQ-01 validation (Phase 0).

## SAFETY

- **Install ONLY in disposable test world** `phase-0-midiqol-test`. NEVER install in production worlds.
- This module is **read-only** — it uses `game.settings.get(...)` only, never `game.settings.set(...)` or any mutation API.
- POST body contains ONLY MidiQOL configuration values (booleans, enum strings, version string). NO user IDs, session tokens, world data, or actor data.
- Endpoint URL is validated to require `127.0.0.1` or `localhost` hostname + `http:` protocol — refuses any other endpoint.

## Install (test world only)

Path was migrated from `tests/phase-0/` → `packages/validation-harness/` during Phase 1 D-1.02 fold-in. Use the current path:

```bash
# From repo root, symlink (preferred — edits sync) or copy to the Foundry
# user data modules folder.

# Linux (typical):
ln -s "$(pwd)/packages/validation-harness/foundry-modules/midiqol-probe-module" \
      ~/.local/share/FoundryVTT/Data/modules/evfoundryvtt-phase-0-probe

# OR copy:
cp -r packages/validation-harness/foundry-modules/midiqol-probe-module \
      ~/.local/share/FoundryVTT/Data/modules/evfoundryvtt-phase-0-probe
```

(Adjust the Foundry data path per your install: macOS `~/Library/Application Support/FoundryVTT/Data/modules/`, Windows `%LOCALAPPDATA%\FoundryVTT\Data\modules\`.)

## Use

1. From repo root, run the harness:
   ```bash
   pnpm --filter @evf/validation-harness exec tsx scripts/midiqol-config-probe.ts
   ```
   The script binds an ephemeral HTTP server on `127.0.0.1:<random-high-port>` and prints the harness URL. Keep this terminal open.
2. Boot Foundry VTT v13.347+ (or v14) and load test world `phase-0-midiqol-test` (must have dnd5e 5.3.3+ + midi-qol latest installed and active).
3. In the Foundry browser console (F12), run:
   ```javascript
   localStorage.setItem('evf-probe-endpoint', '<URL from step 1>')
   ```
4. Enable "EVF Phase 0 MidiQOL Probe" in **Module Settings** → **Manage Modules**. Reload the world (F5).
5. The probe fires on the `ready` hook → POSTs MidiQOL config to the harness → harness writes evidence to `docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json` and exits with code:
   - **0** (pass — MidiQOL config matches REQ MIDIQ-01 expectations)
   - **1** (fail — MidiQOL config wrong; the evidence JSON has `verdict: "fail"` + reason)
   - **2** (skipped — no POST received within 60s; verify the probe module is enabled and `localStorage` key is set)

## Uninstall (after Phase 0 closure)

Delete the symlink/copy from the Foundry modules folder. The `evfoundryvtt` production module (Phase 2) will declare MidiQOL as `relationships.requires` directly — this probe module is NOT shipped to users.

## Why a Foundry module + localhost POST instead of pure REST?

Foundry has no public REST endpoint for module settings. The canonical access path is `game.settings.get(...)` inside the in-game JS context AFTER the `'ready'` Hook fires. Our production `evfoundryvtt` module (Phase 2+) follows the same pattern — this probe is the minimal version of that architecture, deliberately constrained to read-only.

## Sources

- Foundry settings API: foundryvtt.wiki/en/development/api/settings (verified 2026-05-10)
- MidiQOL setting keys: github.com/tposney/midi-qol/blob/master/src/module/settings.ts (verified 2026-05-10)
- REQ MIDIQ-01: `.planning/REQUIREMENTS.md`
- T-00-02 read-only mitigation: `.planning/phases/00-validation-gates/00-02-PLAN.md` `<threat_model>`
