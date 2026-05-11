---
"@evf/foundry-module": minor
"@evf/shared-protocol": patch
---

Phase 2 Wave 0: module skeleton, module.json, settings panel, locale catalogs (EN + IT).

Bootstraps `packages/foundry-module` from placeholder to a buildable Foundry module:
- `module.json` with relationships.requires (socketlib, midi-qol, dnd5e), socket:true
- tsup ESM build pipeline → `dist/module.js`
- `src/module.ts`: MODULE_ID export, Hooks.once("init") bootstrap
- `src/settings.ts`: registerSettings(), PairModalStub, detectedLocale (I18N-01)
- `lang/en.json` + `lang/it.json`: 24 UI-A i18n keys (evf.pair.* + evf.settings.*)
- 10 unit tests, coverage ≥80%
