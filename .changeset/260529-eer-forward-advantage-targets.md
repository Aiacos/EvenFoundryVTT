---
"@evf/foundry-module": patch
---

Forward weapon-attack `advantage` + weapon/spell `targets` to the dnd5e workflow via `MidiQOL.completeActivityUse` when present; honest single `console.warn` (no behavior change, no double-roll) when MidiQOL is absent.

FIX-B + FIX-C: both protocol fields previously passed Zod validation but reached a dead end — neither write-path handler read them, so they had zero effect on the actual roll. This wires them through a MidiQOL capability split:

- **MidiQOL present** (`typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active`): `weapon-attack` forwards `midiOptions.targetUuids` + `advantage`/`disadvantage` (preserving the `i===0` Extra-Attack action economy and multi-attack progress emit); `cast-spell` forwards `midiOptions.targetUuids` merged with the spell slot override (concentration-conflict pre-check still runs first).
- **MidiQOL absent**: behavior is byte-identical to today's `activity.use` — NO `rollAttack`, NO roll hook, NO `game.user.targets` mutation, no double-execution. A single honest `console.warn` surfaces that advantage/target auto-application requires MidiQOL.

Backward-compat: `advantage='normal'` + empty `targets` is unchanged. No new public API surface — schema fields were already public; this only wires them into the workflow.
