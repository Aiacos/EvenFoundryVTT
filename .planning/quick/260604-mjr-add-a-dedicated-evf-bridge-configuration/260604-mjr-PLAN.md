---
phase: quick-260604-mjr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/foundry-module/src/pair/BridgeConfigModal.ts
  - packages/foundry-module/templates/bridge-config.hbs
  - packages/foundry-module/src/pair/BridgeConfigModal.test.ts
  - packages/foundry-module/src/settings.ts
  - packages/foundry-module/src/module.test.ts
  - packages/foundry-module/lang/en.json
  - packages/foundry-module/lang/it.json
  - packages/foundry-module/module.json
  - packages/foundry-module/package.json
  - .changeset/bridge-config-modal.md
autonomous: true
requirements: [MJR-BRIDGECFG]

must_haves:
  truths:
    - "DM opens a dedicated 'EVF — Bridge Configuration' dialog from Module Settings (registerMenu)."
    - "On open, the dialog pre-loads and DISPLAYS the currently-saved bridgeUrl and bridgeInternalSecret (secret masked, Reveal toggle)."
    - "Save validates a non-empty https(s) URL and writes BOTH settings via game.settings.set, shows ui.notifications.info, then closes."
    - "Cancel closes without writing."
    - "bridgeUrl + bridgeInternalSecret are config:false (no longer loose fields in the generic Configure Settings panel)."
    - "getBridgeUrl()/getInternalSecret() in module.ts keep reading the same two setting keys unchanged."
    - "The internal secret value is never passed to console.* anywhere in the new code."
  artifacts:
    - path: "packages/foundry-module/src/pair/BridgeConfigModal.ts"
      provides: "ApplicationV2 + HandlebarsApplicationMixin config dialog (mirrors PairModal)"
      contains: "class BridgeConfigModal"
    - path: "packages/foundry-module/templates/bridge-config.hbs"
      provides: "Dialog template; {{#if flag}} only, no eq helper"
    - path: "packages/foundry-module/src/pair/BridgeConfigModal.test.ts"
      provides: "Tests for menu registration, pre-load context, save writes, config:false"
  key_links:
    - from: "packages/foundry-module/src/settings.ts"
      to: "BridgeConfigModal"
      via: "game.settings.registerMenu(MODULE_ID, 'bridgeConfig', { type: BridgeConfigModal })"
      pattern: "registerMenu.*bridgeConfig"
    - from: "packages/foundry-module/src/pair/BridgeConfigModal.ts"
      to: "game.settings.get/set(MODULE_ID, 'bridgeUrl'|'bridgeInternalSecret')"
      via: "_prepareContext pre-load + Save action"
      pattern: "game\\.settings\\.(get|set)"
---

<objective>
Add a dedicated, foolproof "EVF — Bridge Configuration" settings-menu dialog so the bridge URL + internal secret reliably persist AND visibly display their saved values on reopen. The generic Foundry "Configure Settings" panel was confusing — the DM filled the two loose fields but the global "Save Changes" was easy to miss, so the values came back empty and had to be set via the dev console.

This plan mirrors the existing PairModal ApplicationV2 pattern exactly (no new UI framework), pre-loads current values into the dialog, writes both settings atomically on an explicit Save with success feedback, and demotes the two settings to `config:false` so they are managed solely through this reliable dialog.

Purpose: Satisfy the user's request — "fai in modo che dopo essersi salvate si vedano nelle impostazioni... fai le cose nella maniera giusta e appropriata."
Output: New BridgeConfigModal.ts + bridge-config.hbs + tests; settings.ts demotes the two keys to config:false and registers the new menu; i18n keys (en+it); version bump to 0.1.8 + patch changeset.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# THE pattern to mirror exactly (ApplicationV2 + HandlebarsApplicationMixin, DEFAULT_OPTIONS, PARTS, _prepareContext, _onRender handlers, close()):
@packages/foundry-module/src/pair/PairModal.ts
@packages/foundry-module/templates/pair-modal.hbs
@packages/foundry-module/src/pair/PairModal.test.ts

# Settings registration + the two settings to demote + existing registerMenu wiring:
@packages/foundry-module/src/settings.ts

# Consumers that MUST keep working unchanged (read the same two setting keys):
@packages/foundry-module/src/module.ts

# i18n catalogs (add new keys):
@packages/foundry-module/lang/en.json
@packages/foundry-module/lang/it.json

# Tests that assert registerMenu call count (MUST be updated when adding a 2nd menu):
@packages/foundry-module/src/module.test.ts

# Prior context (what made the two settings exist):
@.planning/quick/260604-hs5-wire-foundry-module-bridge-url-internal-/260604-hs5-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: BridgeConfigModal ApplicationV2 dialog + template + Save/Cancel/Reveal logic</name>
  <files>packages/foundry-module/src/pair/BridgeConfigModal.ts, packages/foundry-module/templates/bridge-config.hbs, packages/foundry-module/src/pair/BridgeConfigModal.test.ts</files>
  <behavior>
    - _prepareContext returns context with current setting values pre-loaded: bridgeUrl = game.settings.get(MODULE_ID,'bridgeUrl') coerced to string (''), internalSecret = game.settings.get(MODULE_ID,'bridgeInternalSecret') coerced to string (''), plus precomputed boolean hasSecret (= internalSecret !== '') and a pre-localised i18n map.
    - Save handler: reads URL + secret from the form inputs; validates URL against the shared shape rule; on invalid URL → ui.notifications?.error and DO NOT write; on valid → await game.settings.set for BOTH keys, then ui.notifications?.info success, then close().
    - Cancel handler: close() with no game.settings.set call.
    - Reveal handler: toggles the secret input type between 'password' and 'text' and swaps the button label between i18n reveal/hide.
    - SECURITY: the secret value is NEVER passed to console.* anywhere.
  </behavior>
  <action>
    Create BridgeConfigModal.ts mirroring PairModal.ts structure:
    - Import MODULE_ID from '../module.js'. Destructure `const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;` exactly as PairModal does.
    - Define a `BridgeConfigData extends Record&lt;string, unknown&gt;` interface with: bridgeUrl (string), internalSecret (string), hasSecret (boolean), i18n (Record&lt;string,string&gt;).
    - Add a module-local BRIDGE_URL_REGEX constant equal to the literal /^https?:\/\/[^/]+:\d{1,5}(\/.*)?$/ used by the wizard, with a JSDoc note that it is copied from packages/g2-app/src/wizard/steps/step1-profile.ts (the single source of truth lives there; copied verbatim to avoid a cross-package import into the Foundry bundle). This reuses the SAME shape rule the wizard uses (task requirement 3).
    - Add a buildI18n() helper resolving these keys via game.i18n.localize, returning pre-resolved strings (mirror PairModal.buildI18n): title, urlLabel, urlHint, secretLabel, secretHint, reveal, hide, save, cancel, saved, invalidUrl — mapped from keys evf.bridgecfg.title, evf.bridgecfg.url.label, evf.bridgecfg.url.hint, evf.bridgecfg.secret.label, evf.bridgecfg.secret.hint, evf.bridgecfg.reveal, evf.bridgecfg.hide, evf.bridgecfg.save, evf.bridgecfg.cancel, evf.bridgecfg.saved, evf.bridgecfg.invalid_url.
    - class BridgeConfigModal extends HandlebarsApplicationMixin(ApplicationV2): static DEFAULT_OPTIONS { id:'evf-bridge-config', classes:['evf-bridge-config'], position:{width:540,height:'auto'}, window:{ title:'evf.bridgecfg.title', resizable:false } }; static PARTS { main:{ template:'modules/evenfoundryvtt/templates/bridge-config.hbs' } }. registerMenu calls `new type()` no-arg, so omit a custom constructor (or provide a no-arg constructor calling super({})).
    - override async _prepareContext(_options): read both settings with a safe string coercion (non-string → ''), compute hasSecret = internalSecret !== '', return BridgeConfigData with i18n = buildI18n().
    - override _onRender(context, options): call super, then bind click handlers via this.element.querySelector for [data-action="save"], [data-action="cancel"], [data-action="reveal-secret"] (mirror PairModal._onRender addEventListener binding style, not a static action map).
    - _onClickSave(event) — async: preventDefault; url = input[name="bridgeUrl"].value.trim(); secret = input[name="bridgeInternalSecret"].value (do NOT trim the secret — preserve exact value); if !BRIDGE_URL_REGEX.test(url) → ui.notifications?.error(buildI18n().invalidUrl) and return (no write); else await game.settings.set(MODULE_ID,'bridgeUrl',url); await game.settings.set(MODULE_ID,'bridgeInternalSecret',secret); ui.notifications?.info(buildI18n().saved); await this.close(). NEVER console.* the secret.
    - _onClickCancel(event): preventDefault; void this.close().
    - _onClickReveal(event): preventDefault; query input[name="bridgeInternalSecret"] and the reveal button; toggle input.type between 'password' and 'text'; swap btn.textContent between i18n.reveal and i18n.hide (mirror PairModal._onClickReveal label-swap shape).
    Create bridge-config.hbs mirroring pair-modal.hbs conventions:
    - Header comment block (like pair-modal.hbs): strings come from {{i18n.*}} pre-resolved; no `eq` helper (Foundry does not register it); booleans precomputed in _prepareContext; secret rendered into a masked input pre-filled with the current value, revealed only on explicit Reveal; secret value never logged.
    - A &lt;form&gt; with: a text input name="bridgeUrl" value="{{bridgeUrl}}" + label {{i18n.urlLabel}} + hint {{i18n.urlHint}}; a password input name="bridgeInternalSecret" type="password" value="{{internalSecret}}" + label {{i18n.secretLabel}} + hint {{i18n.secretHint}} + a button [data-action="reveal-secret"] showing {{i18n.reveal}}.
    - A footer with a primary button [data-action="save"] {{i18n.save}} and a button [data-action="cancel"] {{i18n.cancel}}.
    - Use {{#if hasSecret}} only if a conditional is needed; otherwise no conditionals required. NO {{eq}}; render the secret via {{internalSecret}} (escaped) in the value attribute — never triple-mustache.
    Create BridgeConfigModal.test.ts mirroring PairModal.test.ts stub harness: ApplicationV2Stub, vi.stubGlobal('foundry',{applications:{api:{ApplicationV2:ApplicationV2Stub, HandlebarsApplicationMixin:(B)=>B}}}), makeGameMock with Map-backed settings.get/set, vi.stubGlobal('ui',{notifications:{info:vi.fn(),error:vi.fn()}}). Tests:
      1. BridgeConfigModal class is exported and defined.
      2. _prepareContext returns the saved values (seed settings store with bridgeUrl + bridgeInternalSecret; assert context.bridgeUrl and context.internalSecret equal the seeded values; assert hasSecret === true).
      3. _prepareContext returns '' for both when unset (assert hasSecret === false).
      4. _onClickSave with a valid https URL calls game.settings.set for BOTH keys with the form values and calls ui.notifications.info (build a fake form/inputs and stub this.element.querySelector to return them).
      5. _onClickSave with an invalid URL calls ui.notifications.error and does NOT call game.settings.set.
    Drive _onClick* in tests the way PairModal.test.ts does — stub this.element / querySelector to return fake input objects exposing a `.value` (and `.type` for the reveal test if covered). happy-dom is the test environment, so document.createElement is also available.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module exec vitest run src/pair/BridgeConfigModal.test.ts</automated>
  </verify>
  <done>BridgeConfigModal.test.ts passes: class exported; _prepareContext pre-loads saved values (and '' when unset); valid-URL Save writes BOTH settings + info notification; invalid-URL Save writes nothing + error notification. `grep -n "console" packages/foundry-module/src/pair/BridgeConfigModal.ts` returns no line referencing the secret.</done>
</task>

<task type="auto">
  <name>Task 2: Wire menu + demote settings to config:false + i18n + fix module.test registerMenu count</name>
  <files>packages/foundry-module/src/settings.ts, packages/foundry-module/src/module.test.ts, packages/foundry-module/lang/en.json, packages/foundry-module/lang/it.json</files>
  <action>
    In settings.ts:
    - Import BridgeConfigModal: `import { BridgeConfigModal } from './pair/BridgeConfigModal.js';`.
    - Change the `bridgeUrl` registration from `config: true` to `config: false`. Keep scope:'world', restricted:true, type:String, default:''. Keep the existing name/hint keys (still descriptive). Update the inline comment to say it is now managed via the BridgeConfigModal dialog (config:false), no longer a loose generic-panel field.
    - Change the `bridgeInternalSecret` registration from `config: true` to `config: false`. Same scope/restricted/type/default. Update its comment likewise. The value is still never logged.
    - Add a new registerMenu AFTER the existing pairDevice menu: game.settings.registerMenu(MODULE_ID, 'bridgeConfig', { name: 'evf.settings.bridge_config_button', label: 'evf.settings.bridge_config_button', hint: 'evf.settings.bridge_config_hint', icon: 'fas fa-sliders-h', type: BridgeConfigModal as unknown as new (...args: unknown[]) =&gt; object, restricted: true }) — mirror the pairDevice cast pattern.
    - Update file-level + function-level JSDoc to note the two settings are now config:false and managed via the new "EVF — Bridge Configuration" dialog (Quick Task 260604-mjr).
    In module.test.ts:
    - The suite currently asserts registerMenu was called exactly once (toHaveBeenCalledTimes(1)). Adding bridgeConfig makes it 2 — update that assertion to toHaveBeenCalledTimes(2). Reconcile every registerMenu-tied assertion: before init → not called; after init → called twice.
    - The pairDevice/PairModal type assertion must keep pointing at the pairDevice call (it is registered first). If the test grabs a call by index, pin it to the call whose key === 'pairDevice' (or index 0). Do NOT weaken the existing pairDevice PairModal-type assertion.
    - Leave game.settings.register() call-count assertions unchanged — we only flipped config flags (the mock ignores the config value) and added register() for nothing; only the registerMenu count changes.
    In lang/en.json add keys (place evf.settings.* near the other evf.settings.* keys; add an evf.bridgecfg.* grouped block):
      "evf.settings.bridge_config_button": "EVF — Bridge Configuration",
      "evf.settings.bridge_config_hint": "Set and review the bridge URL and internal secret for this world.",
      "evf.bridgecfg.title": "EvenFoundryVTT — Bridge Configuration",
      "evf.bridgecfg.url.label": "Bridge URL",
      "evf.bridgecfg.url.hint": "Full origin of the EvenFoundryVTT bridge (e.g. https://bridge.example.com:8910). Must match your bridge deployment.",
      "evf.bridgecfg.secret.label": "Bridge internal secret",
      "evf.bridgecfg.secret.hint": "The bridge's EVF_INTERNAL_SECRET value. Authenticates this world's pushes to the bridge. Keep this secret.",
      "evf.bridgecfg.reveal": "Reveal",
      "evf.bridgecfg.hide": "Hide",
      "evf.bridgecfg.save": "Save",
      "evf.bridgecfg.cancel": "Cancel",
      "evf.bridgecfg.saved": "Bridge configuration saved.",
      "evf.bridgecfg.invalid_url": "Enter a valid URL including scheme and port (e.g. https://bridge.example.com:8910)."
    In lang/it.json add the Italian equivalents (same keys):
      "evf.settings.bridge_config_button": "EVF — Configurazione bridge",
      "evf.settings.bridge_config_hint": "Imposta e verifica l'URL del bridge e il segreto interno per questo mondo.",
      "evf.bridgecfg.title": "EvenFoundryVTT — Configurazione bridge",
      "evf.bridgecfg.url.label": "URL del bridge",
      "evf.bridgecfg.url.hint": "Origine completa del bridge EvenFoundryVTT (es. https://bridge.example.com:8910). Deve corrispondere al tuo deployment del bridge.",
      "evf.bridgecfg.secret.label": "Segreto interno del bridge",
      "evf.bridgecfg.secret.hint": "Il valore EVF_INTERNAL_SECRET del bridge. Autentica i push di questo mondo verso il bridge. Mantienilo segreto.",
      "evf.bridgecfg.reveal": "Mostra",
      "evf.bridgecfg.hide": "Nascondi",
      "evf.bridgecfg.save": "Salva",
      "evf.bridgecfg.cancel": "Annulla",
      "evf.bridgecfg.saved": "Configurazione del bridge salvata.",
      "evf.bridgecfg.invalid_url": "Inserisci un URL valido con schema e porta (es. https://bridge.example.com:8910)."
    Keep both catalogs key-for-key identical (same key set) and match the existing formatting/ordering style.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module exec vitest run src/module.test.ts src/pair/BridgeConfigModal.test.ts</automated>
  </verify>
  <done>settings.ts registers the bridgeConfig menu (registerMenu called with 'bridgeConfig' key) and both bridgeUrl + bridgeInternalSecret are config:false; module.test.ts passes with registerMenu asserted twice and the pairDevice/PairModal assertion intact; en.json and it.json have identical key sets including all new evf.settings.bridge_config_* and evf.bridgecfg.* keys.</done>
</task>

<task type="auto">
  <name>Task 3: Version bump to 0.1.8 + changeset + full INV-4 gate</name>
  <files>packages/foundry-module/module.json, packages/foundry-module/package.json, .changeset/bridge-config-modal.md</files>
  <action>
    - module.json: bump "version" from "0.1.7" to "0.1.8" and update the "download" URL from .../releases/download/v0.1.7/evenfoundryvtt.zip to .../releases/download/v0.1.8/evenfoundryvtt.zip. Leave "manifest" (latest/download) unchanged.
    - package.json: bump "version" from "0.1.7" to "0.1.8".
    - Create .changeset/bridge-config-modal.md with front matter `"@evf/foundry-module": patch` and a one-line summary: "Add a dedicated EVF — Bridge Configuration dialog that pre-loads, displays, validates and reliably persists the bridge URL + internal secret; demote the two settings to config:false (managed solely via the dialog)." (mirror .changeset/wire-foundry-bridge-settings.md format.)
    - Run the package INV-4 gate (tsc, biome on touched files, vitest) and fix any issues.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module exec tsc --noEmit && pnpm exec biome check packages/foundry-module/src/pair/BridgeConfigModal.ts packages/foundry-module/src/pair/BridgeConfigModal.test.ts packages/foundry-module/src/settings.ts packages/foundry-module/src/module.test.ts && pnpm --filter @evf/foundry-module exec vitest run && node -e "const m=require('./packages/foundry-module/module.json'),p=require('./packages/foundry-module/package.json');if(m.version!=='0.1.8'){console.error('module.json version',m.version);process.exit(1)}if(p.version!=='0.1.8'){console.error('package.json version',p.version);process.exit(1)}if(!m.download.includes('v0.1.8')){console.error('download url not bumped:',m.download);process.exit(1)}console.log('version OK 0.1.8')"</automated>
  </verify>
  <done>tsc --noEmit clean; biome check passes on all touched source files; full foundry-module vitest suite passes (including the 17-socketlib-handler invariant tests, untouched); module.json + package.json are 0.1.8 and the download URL points at v0.1.8; .changeset/bridge-config-modal.md exists with a patch bump for @evf/foundry-module.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DM browser form → game.settings (world scope) | DM-entered bridge URL + internal secret cross into persisted world settings via the dialog. |
| game.settings → outbound /internal/delta | The stored secret authenticates outbound pushes (read by module.ts, unchanged by this plan). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mjr-01 | Information Disclosure | bridgeInternalSecret in dialog/template/logs | mitigate | Secret rendered only into a masked password input; never passed to console.* (verified by grep in Task 1 done-criteria); not trimmed/transformed; written only via game.settings.set. |
| T-mjr-02 | Tampering | Bridge URL input | mitigate | Save validates the URL against the same BRIDGE_URL_REGEX shape the wizard enforces; invalid input is rejected with a notification and never written. |
| T-mjr-03 | Elevation of Privilege | Settings menu / settings access | mitigate | registerMenu restricted:true and both settings scope:'world' restricted:true — GM-only, unchanged from prior task. |
| T-mjr-SC | Tampering | npm/pip/cargo installs | accept | No new package installs; reuses existing ApplicationV2 + vitest + biome toolchain only. |
</threat_model>

<verification>
- `pnpm --filter @evf/foundry-module exec tsc --noEmit` — clean.
- `pnpm exec biome check` on all touched source files — clean.
- `pnpm --filter @evf/foundry-module exec vitest run` — full suite green, including the existing module.test.ts socketlib-handler-count invariant (untouched).
- en.json and it.json have identical key sets; all new evf.settings.bridge_config_* and evf.bridgecfg.* keys present in both.
- module.json + package.json both 0.1.8; download URL → v0.1.8; changeset present.
- `grep -n console packages/foundry-module/src/pair/BridgeConfigModal.ts` — no line references the secret.
</verification>

<success_criteria>
- A GM opens "EVF — Bridge Configuration" from Module Settings and sees the currently-saved bridge URL and (masked) internal secret pre-loaded.
- Editing + Save validates the URL, persists BOTH settings via game.settings.set, shows a success notification, and closes; reopening the dialog shows the saved values (the user's core request).
- Cancel closes without writing.
- The two settings no longer appear as loose fields in the generic Configure Settings panel (config:false); getBridgeUrl()/getInternalSecret() keep reading them unchanged.
- Version is 0.1.8 with a patch changeset; INV-4 gates green; socketlib 17-handler invariant untouched.
</success_criteria>

<output>
Create `.planning/quick/260604-mjr-add-a-dedicated-evf-bridge-configuration/260604-mjr-SUMMARY.md` when done.
</output>
