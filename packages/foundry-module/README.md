# @evf/foundry-module (`evenfoundryvtt`)

EVF Foundry VTT module — runs in Foundry game world, exposes read API + write path via socketlib.

**Status:** Phase 2 placeholder. Real implementation lands in Phase 2 (Foundry Module Core + Pairing UI).

## Compatibility (Phase 2 module.json)

- Foundry VTT: minimum 13.347, verified 14
- dnd5e system: ≥ 5.3.3
- socketlib: required (Foundry sibling module, NOT npm — `relationships.requires`)
- MidiQOL: required for MVP write path (Phase 0 MIDIQ-01 evidence) — `relationships.requires.midi-qol`

## Read API (Phase 2)

`getCharacterState`, `getCombatState`, `getSceneViewport`, `getEventLog`, `subscribeUpdates`.

## Write Path (Phase 7)

`socketlib.executeAsGM` → `activity.use({configure: false, event: null})` → MidiQOL workflow.
Single-workflow-origin discipline option A (player client NEVER directly invokes activity).

## See also

- `Specs.md` §3.4, §4.4, §5.6
- `docs/architecture/0003-tool-registry-pattern.md`
