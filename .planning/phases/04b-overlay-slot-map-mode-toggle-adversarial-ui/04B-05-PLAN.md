---
phase: 4b
plan: 05
type: execute
wave: 3
depends_on: ["04b-01", "04b-02", "04b-03", "04b-04"]
files_modified:
  - packages/shared-protocol/src/payloads/character.ts
  - packages/shared-protocol/src/payloads/concentration.ts
  - packages/shared-protocol/src/index.ts
  - packages/shared-protocol/src/payloads/character.test.ts
  - packages/shared-protocol/src/payloads/concentration.test.ts
  - packages/foundry-module/src/readers/character-reader.ts
  - packages/foundry-module/src/readers/readers.test.ts
  - packages/g2-app/src/status-hud/status-hud-renderer.ts
  - packages/g2-app/src/status-hud/status-hud-layer.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
  - packages/g2-app/src/panels/concentration-drop-modal.ts
  - packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts
  - packages/g2-app/src/__tests__/04b-integration-smoke.test.ts
  - packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt
  - packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt
  - packages/shared-render/src/fixtures/conc-modal.open.it.txt
  - packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt
autonomous: true
requirements: [DEATH-01, CONC-01]
subsystem: g2-app
user_setup: []
tags: [g2-app, shared-protocol, foundry-module, status-hud, panels, death-saves, conc-modal, integration-smoke, wave-3, inv-1, fixtures, schema-extension]
must_haves:
  truths:
    - "CharacterSnapshotSchema.death = z.strictObject({ success: z.number().int().min(0).max(3), failure: z.number().int().min(0).max(3) }) — REQUIRED field (not .optional()). Field added via ATOMIC COMMIT alongside character-reader.ts producer extension (Pitfall 3 — no window of drift). Phase 2 reader extension reads actor.system.attributes.death.{success,failure} from dnd5e v5.x actor data."
    - "StatusHudRenderer constructor opts gain a `mode?: 'standard' | 'death-saves'` field. New method `setMode(mode): void` switches renderer output; new method `renderDeathSaves(snapshot): AsciiGrid` produces the 28×21 pivot card per UI-SPEC §3.4."
    - "StatusHudLayer._onDelta detects pivot trigger: `parsed.data.hp === 0 && parsed.data.death.failure < 3` → latch ON (this.pivotLatched = true, renderer.setMode('death-saves')); transition back to standard when `parsed.data.hp > 0` (latch OFF). Death (failure === 3) keeps the pivot rendered until a future revive event (Phase 7+)."
    - "INV-1 fixtures (2 NEW for death-saves): status-hud.death-saves-initial.it.txt (HP=0, 0 passes, 0 fails — initial pivot entry) + status-hud.death-saves-mid.it.txt (HP=0, 1 pass, 2 fails — mid-saves stress). Both are 28×21 inside the StatusHudLayer card; the card border `║` at cols 0 + 27 preserved."
    - "shared-protocol/src/payloads/concentration.ts (NEW file) ships ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema + envelope type constants CONC_CONFLICT_TYPE = 'conc.conflict' + CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed'. Re-exported via shared-protocol/src/index.ts."
    - "ConcentrationDropModalPanel implements OverlayPanel (extends Layer from Plan 01). z=2 mount via layerManager.bundle. onMount() subscribes to panel-gesture-bus; onUnmount() unsubscribes (T-4b-01-03 mitigation). onEvent(gesture): tap → emit conc.drop.confirmed envelope via ws.send; double-tap → cancel (no envelope, modal closes); other gestures ignored."
    - "Modal mount uses LayerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: modal }]) — Plan 01's differential demolish rule auto-demolishes z=0.5 idle infill; LMT-DD-04 confirms z=1.5 toast survives modal open"
    - "2 NEW INV-1 fixtures for conc modal: conc-modal.open.it.txt (96×24 — modal open over raster scene with Status HUD preserved) + conc-modal-on-death-saves.it.txt (96×24 — modal open WHILE Status HUD pivoted to death-saves; verifies CONTEXT Area 8 edge case)"
    - "Integration smoke test 04b-integration-smoke.test.ts (NEW file) covers: overlay slot mount/unmount + toast survives overlay (ST-2) + death-saves pivot trigger end-to-end + conc-modal Y emits bridge envelope + conc-modal + death-saves co-presence (ST-3) + locale stress IT longest names on conc modal (ST-4)"
    - "Phase 4b does NOT call effect.delete() — the conc.drop.confirmed envelope is emitted to bridge; Phase 7 wires the actual write path via socketlib.executeAsGM"
  artifacts:
    - path: "packages/shared-protocol/src/payloads/character.ts"
      provides: "CharacterSnapshotSchema EXTENDED with DeathSavesSchema field; DeathSaves type + DeathSavesSchema export"
      exports: ["CharacterSnapshotSchema", "CharacterSnapshot", "DeathSavesSchema", "DeathSaves", "CHARACTER_DELTA_TYPE"]
    - path: "packages/shared-protocol/src/payloads/concentration.ts"
      provides: "ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema + envelope type constants"
      exports: ["ConcConflictPayloadSchema", "ConcConflictPayload", "ConcDropConfirmedPayloadSchema", "ConcDropConfirmedPayload", "CONC_CONFLICT_TYPE", "CONC_DROP_CONFIRMED_TYPE"]
    - path: "packages/foundry-module/src/readers/character-reader.ts"
      provides: "Extended to read actor.system.attributes.death.{success,failure} + emit in CharacterSnapshot payload (ATOMIC with schema extension)"
      contains: "death.success|death.failure"
    - path: "packages/g2-app/src/status-hud/status-hud-renderer.ts"
      provides: "Extended with mode: 'standard' | 'death-saves'; renderDeathSaves(snapshot) method; setMode(mode) method"
      contains: "renderDeathSaves|setMode"
    - path: "packages/g2-app/src/status-hud/status-hud-layer.ts"
      provides: "Extended _onDelta with pivotLatched private field + trigger logic for hp===0 && death.failure<3"
      contains: "pivotLatched|death.failure"
    - path: "packages/g2-app/src/panels/concentration-drop-modal.ts"
      provides: "ConcentrationDropModalPanel class implementing OverlayPanel; subscribes to panel-gesture-bus; emits conc.drop.confirmed on [Y]"
      exports: ["ConcentrationDropModalPanel"]
    - path: "packages/g2-app/src/__tests__/04b-integration-smoke.test.ts"
      provides: "Phase 4b integration smoke covering overlay slot mount + toast survives + death-saves pivot + conc-modal + co-presence + locale stress"
      contains: "04b integration smoke"
    - path: "packages/shared-render/src/fixtures/status-hud.death-saves-{initial,mid}.it.txt"
      provides: "2 NEW INV-1 fixtures for death-saves pivot (28×21)"
      contains: "DEATH SAVES"
    - path: "packages/shared-render/src/fixtures/conc-modal.open.it.txt + conc-modal-on-death-saves.it.txt"
      provides: "2 NEW INV-1 fixtures for conc-drop modal (96×24)"
      contains: "CONCENTRATION CONFLICT"
  key_links:
    - from: "packages/shared-protocol/src/payloads/character.ts (schema extension)"
      to: "packages/foundry-module/src/readers/character-reader.ts (producer extension)"
      via: "ATOMIC COMMIT — both files land in Task 1's single git commit; no .optional() window of drift (Pitfall 3)"
      pattern: "death.*success|death.*failure"
    - from: "packages/g2-app/src/status-hud/status-hud-layer.ts (_onDelta pivot trigger)"
      to: "packages/shared-protocol CharacterSnapshotSchema.death"
      via: "parsed.data.death.failure < 3 → latch death-saves mode"
      pattern: "parsed\\.data\\.death|pivotLatched"
    - from: "packages/g2-app/src/panels/concentration-drop-modal.ts"
      to: "packages/g2-app/src/engine/layer-types.ts (OverlayPanel interface) + panel-gesture-bus.ts"
      via: "implements OverlayPanel from Plan 01; subscribes to PanelGestureBus from Plan 01"
      pattern: "OverlayPanel|PanelGestureBus"
    - from: "packages/g2-app/src/panels/concentration-drop-modal.ts"
      to: "packages/shared-protocol/src/payloads/concentration.ts"
      via: "imports ConcDropConfirmedPayloadSchema + CONC_DROP_CONFIRMED_TYPE; sends envelope on [Y]"
      pattern: "CONC_DROP_CONFIRMED_TYPE|conc.drop.confirmed"
    - from: "packages/g2-app/src/__tests__/04b-integration-smoke.test.ts"
      to: "packages/g2-app/src/engine/layer-manager.ts + packages/g2-app/src/status-hud/toast-queue-layer.ts + packages/g2-app/src/panels/concentration-drop-modal.ts"
      via: "End-to-end coverage of Phase 4b layer composition (overlay + toast + death-saves + conc-modal)"
      pattern: "LayerManager|ToastQueueLayer|ConcentrationDropModalPanel"

threat_model:
  trust_boundaries:
    - description: "shared-protocol/src/payloads/character.ts schema change is a BREAKING CHANGE for any consumer — atomic commit with producer extension prevents runtime safeParse failures"
    - description: "ConcConflictPayloadSchema receives untrusted bridge WS payload (Phase 7 server emits) — Zod safeParse before passing to modal"
    - description: "panel-gesture-bus subscriber lifecycle — modal MUST unsubscribe on onUnmount to prevent leak (T-4b-01-03)"
    - description: "Conc-modal mount on death-saves pivot — different z-strata, no layer conflict, but the integration smoke verifies the StatusHudLayer's death-saves mode is preserved underneath"
  threats:
    - id: "T-4b-05-01"
      category: "T"
      component: "CharacterSnapshotSchema.death = REQUIRED field (not optional) atomic commit"
      disposition: "mitigate"
      mitigation_plan: "ATOMIC COMMIT: schema + reader land in same git commit (Pitfall 3). Plan 05 Task 1 commits both files together. If reader is committed without schema, Zod safeParse FAILS at runtime (death missing from payload). If schema is committed without reader, Zod safeParse FAILS at runtime (death required but absent). Atomic commit closes the window."
    - id: "T-4b-05-02"
      category: "T"
      component: "ConcConflictPayloadSchema receiving untrusted bridge WS payload"
      disposition: "mitigate"
      mitigation_plan: "ConcConflictPayloadSchema.safeParse() at WS receive boundary in attachConcConflictHandler (scene-input.ts or boot-engine wiring); failure → log + ignore, no modal mount. The scene-input dispatcher gate is the single trust boundary."
    - id: "T-4b-05-03"
      category: "D"
      component: "panel-gesture-bus subscriber leak from conc-modal"
      disposition: "mitigate"
      mitigation_plan: "ConcentrationDropModalPanel.onUnmount() MUST call the unsubscribe fn returned by panel-gesture-bus.subscribe(). Integration smoke test asserts post-unmount bus.size() === 0."
    - id: "T-4b-05-04"
      category: "T"
      component: "Conc-modal Y-gesture spoofing (an attacker fires synthetic tap to confirm drop)"
      disposition: "accept"
      mitigation_plan: "Phase 4b assumes the in-process panel-gesture-bus is trusted (gestures only originate from bridge.onEvenHubEvent via Phase 6 source provider). Phase 7+ write path will validate the conc.drop.confirmed envelope server-side (effect ownership + session_id) before calling effect.delete()."
    - id: "T-4b-05-05"
      category: "I"
      component: "Death-saves HUD displays PC HP=0 state"
      disposition: "accept"
      mitigation_plan: "Player's own character data; same disclosure surface as Status HUD. Not a new leak."
    - id: "T-4b-05-06"
      category: "T"
      component: "Conc-modal opens with malformed conflict payload (e.g., effectId missing or empty)"
      disposition: "mitigate"
      mitigation_plan: "ConcConflictPayloadSchema enforces effectId.min(1), currentConcentrationName.min(1), newSpellName.min(1) via Zod. safeParse failure → log + ignore. Modal never mounts on invalid input."
---

<objective>
Ship the final Phase 4b layer (Wave 3): **death-saves HUD pivot** (DEATH-01) + **concentration-drop modal** (CONC-01) + **CharacterSnapshotSchema.death atomic extension** + **integration smoke** that ratifies Phase 4b's layer composition end-to-end. The atomic schema extension is the Plan-05-defining constraint: schema + reader land in the SAME COMMIT to prevent the window of drift.

Purpose: Close DEATH-01 (HP=0 → 3-strike tracker pivot inside StatusHudLayer; latched until recovery) + CONC-01 (modal mounts at z=2 via Panel API; user Y/N gesture captured; conc.drop.confirmed envelope emitted to bridge — Phase 7 wires the write path). The integration smoke is the single source-of-truth proving Phase 4b's layer composition works under real conditions: overlay mount/unmount, toast survives modal open, death-saves co-existence with conc-modal at z=2.

Output: 1 schema extension (CharacterSnapshotSchema.death) + 1 new schema module (concentration.ts) + 1 producer extension (character-reader.ts atomic with schema) + StatusHudRenderer + StatusHudLayer extensions for the pivot + 1 new panel (ConcentrationDropModalPanel) + 4 new INV-1 fixtures + 1 new integration smoke test file. Depends on Plans 01/02/03/04 (Wave 3, runs after Waves 0/1/2 are green).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-VALIDATION.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-02-SUMMARY.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-03-SUMMARY.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-04-SUMMARY.md
@packages/shared-protocol/src/payloads/character.ts
@packages/shared-protocol/src/index.ts
@packages/foundry-module/src/readers/character-reader.ts
@packages/foundry-module/src/readers/readers.test.ts
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/engine/layer-manager.ts
@packages/g2-app/src/engine/overlay-panel.ts
@packages/g2-app/src/engine/panel-gesture-bus.ts
@packages/g2-app/src/status-hud/status-hud-renderer.ts
@packages/g2-app/src/status-hud/status-hud-layer.ts
@packages/g2-app/src/status-hud/toast-queue-layer.ts
@packages/g2-app/src/status-hud/i18n-budgets.ts
@packages/shared-render/src/ascii-grid.ts

<interfaces>
<!-- Key types this plan exposes and consumes (post-Plans-01/02/03/04). -->

From packages/shared-protocol/src/payloads/character.ts (BEFORE Plan 05):
```
export const CharacterSnapshotSchema = z.strictObject({
  actorId: z.string().min(1),
  name: z.string().min(1),
  hp: z.number().int(),
  maxHp: z.number().int().nonnegative(),
  tempHp: z.number().int().nonnegative(),
  ac: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(20),
  conditions: z.array(z.string()),
  exhaustion: z.number().int().min(0).max(6),
});
```

AFTER Plan 05 (Task 1 — atomic extension):
```
export const DeathSavesSchema = z.strictObject({
  success: z.number().int().min(0).max(3),
  failure: z.number().int().min(0).max(3),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;

export const CharacterSnapshotSchema = z.strictObject({
  ... existing fields ...,
  death: DeathSavesSchema,   // NEW Phase 4b — REQUIRED field (not .optional())
});
```

From packages/foundry-module/src/readers/character-reader.ts (BEFORE Plan 05 — line 44-58 area, per readers grep):
```
const hp = actor.system.attributes.hp;
const conditions = Array.from(actor.statuses);
return { hp: hp.value, maxHp: hp.max, tempHp: hp.temp, ..., conditions, ... };
```

AFTER Plan 05 (Task 1 — atomic extension):
```
const hp = actor.system.attributes.hp;
const death = {
  success: actor.system.attributes.death?.success ?? 0,
  failure: actor.system.attributes.death?.failure ?? 0,
};
const conditions = Array.from(actor.statuses);
return { hp: hp.value, maxHp: hp.max, tempHp: hp.temp, ..., conditions, ..., death };
```

NEW packages/shared-protocol/src/payloads/concentration.ts (Plan 05 Task 2):
```
export const ConcConflictPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
  currentConcentrationName: z.string().min(1),
  newSpellName: z.string().min(1),
});
export type ConcConflictPayload = z.infer<typeof ConcConflictPayloadSchema>;
export const CONC_CONFLICT_TYPE = 'conc.conflict' as const;

export const ConcDropConfirmedPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
});
export type ConcDropConfirmedPayload = z.infer<typeof ConcDropConfirmedPayloadSchema>;
export const CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' as const;
```

Re-exported via packages/shared-protocol/src/index.ts.

StatusHudRenderer extensions (Plan 05 Task 3):
- Constructor opts: `mode?: 'standard' | 'death-saves'` (default 'standard')
- New method: `setMode(mode: 'standard' | 'death-saves'): void` — updates internal mode field
- New method: `renderDeathSaves(snapshot: CharacterSnapshot): AsciiGrid` — produces 28×21 pivot card per UI-SPEC §3.4
- Existing `render(snapshot)` dispatches to either standard or death-saves based on current mode

Death-saves layout (UI-SPEC §3.4):
```
row 1: ║ <NAME ≤12>               ║   header (preserved from standard mode)
row 2: ║ ────────────────         ║   divider (preserved)
row 3: ║                          ║   blank
row 4: ║ DEATH SAVES              ║   title (from i18n-budgets.death_saves_title)
row 5: ║                          ║   blank
row 6: ║ Riusciti  [ ◯ ◯ ◯ ]      ║   pass tracker — `Riusciti` from i18n-budgets.death_saves_passes_label
row 7: ║ Falliti   [ ◯ ◯ ◯ ]      ║   fail tracker — `Falliti` from i18n-budgets.death_saves_fails_label
row 8: ║                          ║
row 9: ║ PF  0/<max>              ║   HP=0 with maxHp from snapshot
row 10: ║ CA <ac>                  ║   AC preserved
rows 11-19: blank
row 20: ║                  [GLY]   ║   [GLY] badge if glyph mode (preserved orthogonal — UI-SPEC §9.7)
row 21: ╠══════════════════════════╣   bottom border (preserved)
```

Glyph palette (UI-SPEC §3.4):
- `◯` U+25EF — empty checkbox slot
- `●` U+25CF — filled checkbox slot
- 3-strike bracket `[ X X X ]` = 9 visible chars

StatusHudLayer extensions (Plan 05 Task 4 — _onDelta pivot trigger):
```
private pivotLatched = false;

private _onDelta(raw: unknown): void {
  const parsed = CharacterSnapshotSchema.safeParse(raw);
  if (!parsed.success) { /* log + return */ return; }
  this.snapshot = parsed.data;

  // Phase 4b: pivot latch
  const inDeathSaves = parsed.data.hp === 0 && parsed.data.death.failure < 3;
  if (inDeathSaves !== this.pivotLatched) {
    this.pivotLatched = inDeathSaves;
    this.renderer.setMode(inDeathSaves ? 'death-saves' : 'standard');
  }

  this._scheduleDebouncedRender();
}
```

Latch semantics:
- Transition OFF when HP > 0 (recovery)
- Stays ON when failure === 3 (PC dead — until a future revive event)

ConcentrationDropModalPanel (Plan 05 Task 5):
```
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { CONC_DROP_CONFIRMED_TYPE, type ConcConflictPayload } from '@evf/shared-protocol';
import { HUD_WIDTH_BUDGETS } from '../status-hud/i18n-budgets.js';

export class ConcentrationDropModalPanel implements OverlayPanel {
  readonly id = 'conc-drop-modal';
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly ws: WebSocket,
    private readonly gestureBus: PanelGestureBus,
    private readonly conflict: ConcConflictPayload,
    private readonly locale: 'it' | 'en' | 'de',
    private readonly onClose: () => void,
  ) {}

  getContainerCount(): { image: 0; text: 3 } {
    return { image: 0, text: 3 };
  }

  async draw(): Promise<void> {
    // Builds 12-row centered panel content per UI-SPEC §3.5 + i18n-budgets.conc_modal_* keys
    // Uses 3 text containers: overlay-title, overlay-body, overlay-buttons
    // (or 1 container with newline-separated content — implementer chooses; document)
    // Title: conc_modal_title[locale]
    // Body line 1: conc_modal_active_label[locale]
    // Body line 2: indented spell name (conflict.currentConcentrationName, truncated to 30 chars)
    // Body line 3: blank
    // Body line 4: conc_modal_casting_template[locale] with {name} replaced by conflict.newSpellName (truncated)
    // Body line 5: blank
    // Body line 6: conc_modal_confirm_question[locale]
    // Body line 7: blank
    // Buttons row: conc_modal_y_button_template[locale] with {name} replaced (24-char budget) + spaces + conc_modal_n_button[locale]
  }

  destroy(): void {
    // No-op; cleanup happens in onUnmount before destroy
  }

  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  async onUnmount(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'tap') {
      // [Y] Drop & cast
      const envelope = {
        proto: 'evf-v1' as const,
        seq: 0,  // bridge assigns sequence
        ts: Date.now(),
        type: CONC_DROP_CONFIRMED_TYPE,
        session_id: '00000000-0000-0000-0000-000000000000',  // TODO(ADR-0009): thread real session_id from boot engine
        payload: { effectId: this.conflict.effectId },
      };
      this.ws.send(JSON.stringify(envelope));
      this.onClose();
    } else if (gesture.kind === 'double-tap') {
      // [N] Cancel
      this.onClose();
    }
    // Other gestures ignored
  }
}
```

INV-1 fixtures (4 NEW):
- status-hud.death-saves-initial.it.txt: 28×21 — HP=0 0p/0f
- status-hud.death-saves-mid.it.txt: 28×21 — HP=0 1p/2f (filled glyphs)
- conc-modal.open.it.txt: 96×24 — modal open over raster scene + Status HUD preserved at right
- conc-modal-on-death-saves.it.txt: 96×24 — modal + death-saves pivot underneath (CONTEXT Area 8 edge case)

Integration smoke test (NEW file `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts`):
- ISM-01: Mount full Phase 4a layers (z=0 capture + z=0.5 idle + z=1 status hud) + mount z=1.5 toast layer + assert capture invariant + container budget OK
- ISM-02: Open conc-modal via bundle([{mount z=2 ConcDropModal}]) — assert z=0.5 demolished, z=1 status hud preserved, z=1.5 toast preserved, bridge.rebuildPageContainer called once
- ISM-03: ST-2 stress (toast survives overlay open): enqueue 2 toasts BEFORE modal mount, mount modal, assert toast layer still mounted at z=1.5, toast container content unchanged
- ISM-04: ST-3 stress (modal + death-saves co-presence): inject character.delta with hp=0 death.failure=2 → assert status hud pivots to death-saves; THEN mount conc-modal → assert modal mounted at z=2 AND status hud still in death-saves mode (not reverted)
- ISM-05: Conc-modal Y emission: mount modal, publish 'tap' to panel-gesture-bus, assert ws.send was called with conc.drop.confirmed envelope containing the correct effectId
- ISM-06: Conc-modal N (cancel): mount modal, publish 'double-tap' to panel-gesture-bus, assert ws.send was NOT called with conc.drop.confirmed, onClose was called
- ISM-07: Conc-modal unsubscribes on onUnmount: mount modal, destroy modal via bundle, assert panel-gesture-bus.size() === 0 (T-4b-01-03 + T-4b-05-03 mitigation)
- ISM-08: ST-4 stress (locale IT longest names): mount modal with currentConcentrationName='Cura Ferite di Massa', newSpellName='Cura Ferite di Massa'; assert rendered content truncates to 24-char budget on Y button without breaking the panel frame layout
- ISM-09 (matchAsciiFixture): mount conc-modal over a death-saves-active Status HUD; matchAsciiFixture against conc-modal-on-death-saves.it.txt
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CharacterSnapshotSchema.death extension + character-reader.ts producer extension (ATOMIC COMMIT — Pitfall 3 mitigation)</name>
  <read_first>
    - packages/shared-protocol/src/payloads/character.ts (full file — Plan 05 EXTENDS the strictObject schema)
    - packages/shared-protocol/src/index.ts (full file — Plan 05 adds re-exports of DeathSavesSchema + DeathSaves type)
    - packages/foundry-module/src/readers/character-reader.ts (full file — line 44-58 contains the hp/conditions read; Plan 05 inserts death read in the SAME atomic commit)
    - packages/foundry-module/src/readers/readers.test.ts (full file — Plan 05 extends with death-field round-trip test)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q4 (death-saves event source: REQUIRED schema extension; Foundry dnd5e v5.x field path `actor.system.attributes.death.{success,failure}`)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 7 REVISED (atomic commit mandate — no .optional() window of drift)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md Pitfall 3 (atomic commit OR temporary .optional() — CONTEXT locks atomic; Plan 05 honours)
  </read_first>
  <files>packages/shared-protocol/src/payloads/character.ts, packages/shared-protocol/src/index.ts, packages/shared-protocol/src/payloads/character.test.ts, packages/foundry-module/src/readers/character-reader.ts, packages/foundry-module/src/readers/readers.test.ts</files>
  <behavior>
    Schema extension tests:
    - Test CS-DS-1: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 0, failure: 0 }}).success === true
    - Test CS-DS-2: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 3, failure: 0 }}).success === true (stabilized)
    - Test CS-DS-3: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 0, failure: 3 }}).success === true (dead)
    - Test CS-DS-4: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 4, failure: 0 }}).success === false (out of range)
    - Test CS-DS-5: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: -1, failure: 0 }}).success === false (negative)
    - Test CS-DS-6: CharacterSnapshotSchema.safeParse({...validSnapshot /* no death field */}).success === false (REQUIRED, not optional)
    - Test CS-DS-7: DeathSavesSchema exported separately; DeathSavesSchema.safeParse({success: 1, failure: 2}).success === true
    - Test CS-DS-8: DeathSaves type infers correctly (`const d: DeathSaves = {success:1, failure:2}` compiles)

    Reader extension tests:
    - Test CR-DS-1: readCharacterSnapshot(mockActor) returns snapshot with `death: { success: 0, failure: 0 }` when mockActor.system.attributes.death = {success: 0, failure: 0}
    - Test CR-DS-2: readCharacterSnapshot returns death.failure: 2 when mockActor's death.failure is 2
    - Test CR-DS-3: readCharacterSnapshot defaults death to {success: 0, failure: 0} when mockActor.system.attributes.death is undefined (Pitfall: dnd5e fresh-actor state may have death undefined; reader's nullish-coalesce protects)
    - Test CR-DS-4: The returned snapshot passes CharacterSnapshotSchema.safeParse (full round-trip)
    - Test CR-DS-5: Existing CR tests still pass (regression-safe — no rename of hp/maxHp/ac etc.)
  </behavior>
  <action>
    **ATOMIC COMMIT — both files in single git commit (Pitfall 3 mitigation):**

    **1. Modify `packages/shared-protocol/src/payloads/character.ts`:**

    Add `DeathSavesSchema` definition + type export BEFORE the `CharacterSnapshotSchema` definition:
    ```
    /**
     * Death saving throw progress per dnd5e v5.x `actor.system.attributes.death`.
     *
     * Each death save outcome increments the appropriate counter (0..3 each); 3 successes
     * = stabilized, 3 failures = dead. Counters reset on full rest or HP restoration.
     *
     * @see Specs.md §3.4 (Foundry dnd5e v5.x compatibility)
     * @see 04B-RESEARCH.md §Q4 (schema extension rationale + verified field path)
     */
    export const DeathSavesSchema = z.strictObject({
      success: z.number().int().min(0).max(3),
      failure: z.number().int().min(0).max(3),
    });
    export type DeathSaves = z.infer<typeof DeathSavesSchema>;
    ```

    Extend CharacterSnapshotSchema with the new `death` field (REQUIRED, not .optional()):
    ```
    export const CharacterSnapshotSchema = z.strictObject({
      actorId: ...,
      name: ...,
      hp: ...,
      maxHp: ...,
      tempHp: ...,
      ac: ...,
      level: ...,
      conditions: ...,
      exhaustion: ...,
      death: DeathSavesSchema,  // NEW Phase 4b
    });
    ```

    Update the schema JSDoc to add a `death` bullet point explaining the field.

    **2. Modify `packages/shared-protocol/src/index.ts`:**

    Re-export `DeathSavesSchema` + `DeathSaves` type alongside the existing `CharacterSnapshotSchema` exports.

    **3. Modify `packages/foundry-module/src/readers/character-reader.ts`:**

    Inside the `readCharacterSnapshot(actor)` function (or equivalent — read the file to find the actual function name), insert the death read AFTER the hp read and BEFORE the return statement:
    ```
    const hp = actor.system.attributes.hp;
    const death = {
      success: actor.system.attributes.death?.success ?? 0,
      failure: actor.system.attributes.death?.failure ?? 0,
    };
    const conditions = Array.from(actor.statuses);
    return { ..., death };
    ```

    Use nullish-coalescing for defensive defaults (CR-DS-3). The return object must satisfy CharacterSnapshotSchema (CR-DS-4) — the test asserts this via safeParse.

    Update the function's JSDoc to mention the death field.

    **4. Schema tests `packages/shared-protocol/src/payloads/character.test.ts`:**

    If the file does not exist, CREATE it. If it exists, extend with the CS-DS-1..CS-DS-8 tests. Use vi.fn() / structural literals for the snapshot fixtures.

    **5. Reader tests `packages/foundry-module/src/readers/readers.test.ts`:**

    Extend with CR-DS-1..CR-DS-5. The mock actor fixture should include `system.attributes.death = { success: 0, failure: 0 }` by default; the CR-DS-3 case overrides to `undefined`.

    Constraints:
    - **ATOMIC COMMIT**: schema + reader land in the same git commit. Executor MUST stage all 5 files together before committing.
    - REQUIRED field (NOT .optional()). The Pitfall 3 mitigation is the atomic commit, not the schema flexibility.
    - INV-4 JSDoc on every public export.
    - `pnpm typecheck` MUST exit 0 after this task across ALL packages (the workspace typecheck catches any consumer that still passes a snapshot WITHOUT death).
    - `pnpm --filter @evf/shared-protocol test --run && pnpm --filter @evf/foundry-module test --run` exit 0.
    - dnd5e v5.x death field path `actor.system.attributes.death` is correct per RESEARCH §Q4 [VERIFIED via foundryvtt/dnd5e source]. If the field path differs at execution time, the executor MUST verify against actual dnd5e v5.3.3 source AND document in 04b-05-SUMMARY.md.

    **Potential consumer break:** Any existing consumer of CharacterSnapshotSchema that passes a snapshot WITHOUT a `death` field will fail safeParse. Phase 4a's StatusHudLayer test fixtures probably pass partial snapshots — if so, they need to be updated to include `death: { success: 0, failure: 0 }`. The executor MUST grep for `CharacterSnapshotSchema.safeParse` or `CharacterSnapshot` literal usage across the workspace and update fixtures to include the new field. Document in 04b-05-SUMMARY.md the count of fixture updates required.
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test --run -- src/payloads/character.test.ts && pnpm --filter @evf/foundry-module test --run -- src/readers/readers.test.ts && grep -c 'death: DeathSavesSchema' packages/shared-protocol/src/payloads/character.ts && grep -c 'export const DeathSavesSchema' packages/shared-protocol/src/payloads/character.ts && grep -c 'DeathSavesSchema' packages/shared-protocol/src/index.ts && grep -c 'actor.system.attributes.death' packages/foundry-module/src/readers/character-reader.ts && grep -cE 'death\.success.*\?\?.*0|death\.failure.*\?\?.*0' packages/foundry-module/src/readers/character-reader.ts && grep -cE 'CS-DS-0[1-8]' packages/shared-protocol/src/payloads/character.test.ts && grep -cE 'CR-DS-0[1-5]' packages/foundry-module/src/readers/readers.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Both test files green (CS-DS-1..8 + CR-DS-1..5 = 13 tests minimum); schema + reader committed atomically; all consumer fixtures across workspace updated to include death field; pnpm typecheck exits 0 across the FULL workspace (workspace-wide check catches any remaining consumer omission).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: shared-protocol/src/payloads/concentration.ts (new envelope schemas) + index.ts re-exports</name>
  <read_first>
    - packages/shared-protocol/src/envelope.ts (Phase 3 envelope pattern; concentration envelopes follow the same shape)
    - packages/shared-protocol/src/index.ts (Phase 4a + Plan 05 Task 1 — re-export structure)
    - packages/shared-protocol/src/payloads/character.ts (Plan 05 Task 1 — z.strictObject + min() constraints pattern)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6 (conc-modal envelope shapes verbatim)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8 (conc-drop modal trigger + bridge event emission policy)
  </read_first>
  <files>packages/shared-protocol/src/payloads/concentration.ts, packages/shared-protocol/src/index.ts, packages/shared-protocol/src/payloads/concentration.test.ts</files>
  <behavior>
    concentration schema tests:
    - Test CN-1: ConcConflictPayloadSchema.safeParse({effectId: 'eff1', currentConcentrationName: 'Hold Person', newSpellName: 'Bless'}).success === true
    - Test CN-2: ConcConflictPayloadSchema.safeParse({effectId: '', ...}).success === false (effectId.min(1))
    - Test CN-3: ConcConflictPayloadSchema.safeParse({effectId: 'eff1', currentConcentrationName: '', newSpellName: 'Bless'}).success === false
    - Test CN-4: ConcDropConfirmedPayloadSchema.safeParse({effectId: 'eff1'}).success === true
    - Test CN-5: ConcDropConfirmedPayloadSchema.safeParse({effectId: ''}).success === false
    - Test CN-6: CONC_CONFLICT_TYPE === 'conc.conflict' (literal type)
    - Test CN-7: CONC_DROP_CONFIRMED_TYPE === 'conc.drop.confirmed' (literal type)
    - Test CN-8: Both schemas + types + constants re-exported from `@evf/shared-protocol` top-level (import { ConcConflictPayloadSchema, CONC_DROP_CONFIRMED_TYPE } from '@evf/shared-protocol' compiles)
  </behavior>
  <action>
    **1. NEW file `packages/shared-protocol/src/payloads/concentration.ts`:**

    Module JSDoc cites 04B-RESEARCH.md §Approach 6 + 04b-CONTEXT.md §Area 8.

    Imports: `import { z } from 'zod';`

    Exports (verbatim — see <interfaces> shapes):
    - `ConcConflictPayloadSchema = z.strictObject({ effectId, currentConcentrationName, newSpellName })` — all 3 fields .min(1)
    - `type ConcConflictPayload` via z.infer
    - `const CONC_CONFLICT_TYPE = 'conc.conflict' as const`
    - `ConcDropConfirmedPayloadSchema = z.strictObject({ effectId })` — effectId .min(1)
    - `type ConcDropConfirmedPayload` via z.infer
    - `const CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' as const`

    JSDoc on every export. The bridge-direction comments explain:
    - ConcConflictPayload: Bridge → g2-app (Phase 7 server-side detection emits)
    - ConcDropConfirmedPayload: g2-app → Bridge (Phase 4b emits; Phase 7 consumes for write path)

    **2. Modify `packages/shared-protocol/src/index.ts`:**

    Re-export everything from `./payloads/concentration.js` alongside existing exports. Add a comment block grouping the Phase 4b additions.

    **3. NEW file `packages/shared-protocol/src/payloads/concentration.test.ts`:**

    Vitest test file with 8 tests (CN-1..CN-8). Use shared-protocol's existing test pattern (likely node test env, NOT happy-dom).

    Constraints:
    - INV-4 JSDoc on every export.
    - z.strictObject (not z.object) — extra fields rejected.
    - Type literal constants use `as const` to satisfy the EnvelopeSchema discriminant.
    - `pnpm --filter @evf/shared-protocol test --run` exits 0.
    - No new dependencies (zod 4.4.3 already in workspace).
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test --run -- src/payloads/concentration.test.ts && grep -c "export const ConcConflictPayloadSchema" packages/shared-protocol/src/payloads/concentration.ts && grep -c "export const ConcDropConfirmedPayloadSchema" packages/shared-protocol/src/payloads/concentration.ts && grep -c "CONC_CONFLICT_TYPE = 'conc.conflict'" packages/shared-protocol/src/payloads/concentration.ts && grep -c "CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed'" packages/shared-protocol/src/payloads/concentration.ts && grep -c "concentration" packages/shared-protocol/src/index.ts && grep -cE 'CN-0[1-8]' packages/shared-protocol/src/payloads/concentration.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    concentration.test.ts green (8 tests); concentration.ts exports both schemas + types + type constants; index.ts re-exports concentration; CN-1..CN-8 grep-match; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: StatusHudRenderer death-saves mode + StatusHudLayer pivot trigger + 2 INV-1 fixtures (DEATH-01)</name>
  <read_first>
    - packages/g2-app/src/status-hud/status-hud-renderer.ts (full file — Plan 04a Plan 04 output; Plan 05 extends with renderDeathSaves + setMode)
    - packages/g2-app/src/status-hud/status-hud-layer.ts (full file — _onDelta hook; Plan 05 extends with pivotLatched + trigger)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — death_saves_title + death_saves_passes_label + death_saves_fails_label keys available; Plan 05 reads these via getLabel)
    - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts (Phase 4a tests SR-1..SR-8 — Plan 05 extends with death-saves cases SR-DS-*)
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts (Phase 4a tests SHL-1..SHL-7 — Plan 05 extends with SHL-PIVOT-* cases)
    - packages/shared-render/src/fixtures/status-hud-baseline.txt + status-hud.loading.txt (Phase 4a fixtures — geometry reference for the 28×21 card)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.4 (death-saves layout 28×21) + §5.14 (fixture #14 ASCII) + §5.15 (fixture #15 ASCII)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 5 (renderer + layer extension pattern) + §Q4 (event source / trigger condition)
  </read_first>
  <files>packages/g2-app/src/status-hud/status-hud-renderer.ts, packages/g2-app/src/status-hud/status-hud-layer.ts, packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts, packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts, packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt, packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt</files>
  <behavior>
    StatusHudRenderer death-saves tests:
    - Test SR-DS-1: `new StatusHudRenderer({locale:'it'}).setMode('death-saves')` is a void-returning method; subsequent `render(snapshot)` produces a death-saves grid
    - Test SR-DS-2: renderDeathSaves(snapshot) returns 28×21 AsciiGrid; col 0 + col 27 are `║` borders; row 21 is `╠══...══╣` (bottom border preserved from standard mode)
    - Test SR-DS-3: For locale='it' the title row contains 'DEATH SAVES' and the pass label is 'Riusciti'; for locale='en' pass label is 'Passes' (from i18n-budgets death_saves_*)
    - Test SR-DS-4: For death={success:1, failure:2} the pass tracker row contains `● ◯ ◯` (1 filled + 2 empty); the fail tracker row contains `● ● ◯` (2 filled + 1 empty)
    - Test SR-DS-5: For death={success:0, failure:0} both tracker rows contain `◯ ◯ ◯` (all empty)
    - Test SR-DS-6: HP=0 row reads `PF  0/<max>` for IT or `HP  0/<max>` for EN (uses i18n-budgets hp_label)
    - Test SR-DS-7: matchAsciiFixture against `status-hud.death-saves-initial.it.txt` for snapshot {hp:0, maxHp:68, ac:18, name:'Thorin', death:{success:0,failure:0}, conditions:[]}
    - Test SR-DS-8: matchAsciiFixture against `status-hud.death-saves-mid.it.txt` for snapshot {hp:0, maxHp:68, ac:18, name:'Thorin', death:{success:1,failure:2}, conditions:[]}

    StatusHudLayer pivot tests:
    - Test SHL-PIVOT-1: Initial state — `layer.pivotLatched === false` (private; expose via test getter OR observe via renderer.setMode call assertion)
    - Test SHL-PIVOT-2: Inject character.delta with {hp:0, death:{success:0, failure:2}} → after debounce, renderer.setMode('death-saves') called once; pivot is latched
    - Test SHL-PIVOT-3: Subsequent delta with {hp:5, death:{success:0, failure:2}} (hp > 0 recovery) → renderer.setMode('standard') called once; latch OFF
    - Test SHL-PIVOT-4: Delta with {hp:0, death:{success:0, failure:3}} (PC dead) → pivot STAYS latched (failure === 3 is the dead state; renderer stays in death-saves until revive)
    - Test SHL-PIVOT-5: Delta with {hp:0, death:{success:0, failure:0}} initial entry to death-saves: pivot triggers immediately on first delta (NOT delayed)
    - Test SHL-PIVOT-6: Two deltas in a row with same pivot state → renderer.setMode is called only ONCE (state-change-driven, not per-delta)
    - Test SHL-PIVOT-7: Malformed delta (death field missing) → CharacterSnapshotSchema.safeParse fails → log + return; pivot state unchanged
  </behavior>
  <action>
    **1. Modify `packages/g2-app/src/status-hud/status-hud-renderer.ts`:**

    Extend the constructor opts interface with `mode?: 'standard' | 'death-saves'` (default 'standard'). Store as private field.

    Add public method `setMode(mode: 'standard' | 'death-saves'): void` — updates the field.

    Add private method `_renderDeathSaves(snapshot: CharacterSnapshot): AsciiGrid` — builds the 28×21 pivot card per UI-SPEC §3.4. Implementation outline:
    - Build the same 28-char `║`-border row template as standard mode
    - Row 1: name (truncated to 12 chars)
    - Row 2: divider `────────────────` (16 dashes)
    - Row 3: blank
    - Row 4: padded title `DEATH SAVES` (from HUD_WIDTH_BUDGETS.death_saves_title[locale])
    - Row 5: blank
    - Row 6: `Riusciti  ` + `[ ` + (3 tracker glyphs based on snapshot.death.success) + ` ]`
    - Row 7: `Falliti   ` + `[ ` + (3 tracker glyphs based on snapshot.death.failure) + ` ]` (3-space trailing pad to align bracket col with row 6)
    - Row 8: blank
    - Row 9: `PF  0/${maxHp}` (preserve label per i18n-budgets hp_label)
    - Row 10: `CA ${ac}`
    - Rows 11-19: blank
    - Row 20: `[GLY]` badge at col 22-26 if mapMode==='glyph', else spaces (preserves UI-SPEC §9.7 orthogonal behavior)
    - Row 21: `╠══...══╣` bottom border

    Modify the existing public `render(snapshot)` method to dispatch:
    ```
    render(snapshot: CharacterSnapshot): AsciiGrid {
      if (this.mode === 'death-saves') return this._renderDeathSaves(snapshot);
      return this._renderStandard(snapshot);  // existing logic, renamed if needed
    }
    ```

    The renderer's existing `renderLoading()` + `renderMissing()` are unaffected (both stay in standard layout).

    Update module JSDoc to mention DEATH-01 + 04b-CONTEXT §Area 7.

    **2. Modify `packages/g2-app/src/status-hud/status-hud-layer.ts`:**

    Add private field `private pivotLatched = false`.

    Modify `_onDelta(raw)`:
    ```
    private _onDelta(raw: unknown): void {
      const parsed = CharacterSnapshotSchema.safeParse(raw);
      if (!parsed.success) { /* existing log + return */ return; }
      this.snapshot = parsed.data;

      // Phase 4b DEATH-01: pivot latch
      const inDeathSaves = parsed.data.hp === 0 && parsed.data.death.failure < 3;
      if (inDeathSaves !== this.pivotLatched) {
        this.pivotLatched = inDeathSaves;
        this.opts.renderer.setMode(inDeathSaves ? 'death-saves' : 'standard');
      }

      this._scheduleDebouncedRender();
    }
    ```

    Add a public getter for tests: `getPivotLatched(): boolean { return this.pivotLatched; }` — JSDoc test-only.

    Update module JSDoc.

    **3. Two new INV-1 fixtures in `packages/shared-render/src/fixtures/`:**

    Copy the ASCII grids from UI-SPEC §5.14 and §5.15 VERBATIM:
    - `status-hud.death-saves-initial.it.txt`: 28-char wide × 21 rows; HP=0 0p/0f; all `◯` empty checkboxes; name 'Thorin'
    - `status-hud.death-saves-mid.it.txt`: same shape, 1 pass (`●`) + 2 fails (`●`)

    Trailing newline. Uniform 28-char width. Box-drawing chars `║─╠═╣` verbatim.

    **4. Extend `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts`:**

    Add SR-DS-1..SR-DS-8 in a new `describe('Phase 4b death-saves mode', () => { ... })` block. Use matchAsciiFixture for SR-DS-7 + SR-DS-8 (path `'../../../../shared-render/src/fixtures/status-hud.death-saves-initial.it.txt'`).

    **5. Extend `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts`:**

    Add SHL-PIVOT-1..SHL-PIVOT-7 in a new `describe('Phase 4b death-saves pivot trigger', () => { ... })` block. Use vi.useFakeTimers and the existing wsEvents mock from Phase 4a's harness pattern.

    Constraints:
    - NO regressions: all Phase 4a SR-1..SR-8 + SHL-1..SHL-7 tests still pass.
    - INV-4 JSDoc on new public methods.
    - The 2 new fixtures match UI-SPEC §5.14 + §5.15 verbatim — character precision.
    - `pnpm typecheck && pnpm lint:ci` exit 0.
    - Pivot state changes only on transition (not per-delta) — SHL-PIVOT-6 enforces.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-renderer.test.ts src/status-hud/__tests__/status-hud-layer.test.ts && test -f packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt && test -f packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt && grep -c 'DEATH SAVES' packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt && grep -cE '\[ ● ●? ◯' packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt && grep -c 'setMode' packages/g2-app/src/status-hud/status-hud-renderer.ts && grep -c 'pivotLatched' packages/g2-app/src/status-hud/status-hud-layer.ts && grep -c "death.failure < 3" packages/g2-app/src/status-hud/status-hud-layer.ts && grep -cE 'SR-DS-0[1-8]' packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts && grep -cE 'SHL-PIVOT-0?[1-7]' packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Both test files green (SR-DS-1..8 + SHL-PIVOT-1..7 = 15 new tests minimum) — Phase 4a existing tests still pass; 2 new fixtures exist with correct content; renderer has setMode + _renderDeathSaves; layer has pivotLatched + trigger logic; test discriminator markers grep-match; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: ConcentrationDropModalPanel + 2 INV-1 fixtures (CONC-01)</name>
  <read_first>
    - packages/g2-app/src/engine/layer-types.ts (post-Plan-01 — OverlayPanel interface + R1Gesture union)
    - packages/g2-app/src/engine/overlay-panel.ts (post-Plan-01 — isOverlayPanel type guard)
    - packages/g2-app/src/engine/panel-gesture-bus.ts (post-Plan-01 — PanelGestureBus class; conc-modal subscribes in onMount)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — conc_modal_* keys available)
    - packages/shared-protocol/src/payloads/concentration.ts (Task 2 output — ConcConflictPayload + ConcDropConfirmedPayload + envelope type constants)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.5 (conc-modal 2 visual states + geometry: cols 6-65 inner content, rows 6-17 panel rows) + §5.16 + §5.17 (fixtures verbatim)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6 (file map + key data shapes + Y/N gesture routing)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8 (locked decisions on slot, trigger, R1 routing, Phase 4b output)
  </read_first>
  <files>packages/g2-app/src/panels/concentration-drop-modal.ts, packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts, packages/shared-render/src/fixtures/conc-modal.open.it.txt, packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt</files>
  <behavior>
    ConcentrationDropModalPanel tests:
    - Test CDM-1: `new ConcentrationDropModalPanel(bridge, ws, bus, conflict, 'en', onClose).id === 'conc-drop-modal'`
    - Test CDM-2: isOverlayPanel(panel) returns true (onMount + onUnmount + onEvent all present)
    - Test CDM-3: panel.getContainerCount() returns { image: 0, text: 3 } (or 1 if single-container strategy chosen — document choice)
    - Test CDM-4: panel.draw() calls bridge.textContainerUpgrade (count depends on container strategy: 3 for multi-container, 1 for single-container with newlines); content includes 'CONCENTRATION CONFLICT' title + currentConcentrationName + newSpellName + '[Y] Drop' + '[N] Cancel'
    - Test CDM-5: For locale='it' the title row uses HUD_WIDTH_BUDGETS.conc_modal_title.it ('CONCENTRATION CONFLICT' — same as EN for IT per UI-SPEC §4.4); body uses 'Spell attivo:' + 'Castando' phrases
    - Test CDM-6: For locale='de' title is 'KONZENTRATIONSKONFLIKT' + body uses German strings
    - Test CDM-7 (long-name truncation — ST-4 stress): conflict with newSpellName='Cura Ferite di Massa' (20 chars), Y button text uses conc_modal_y_button_template[it] = '[Y] Drop & cast {name}' with {name} substitution; if total > 24 char budget (max from i18n-budgets), name is truncated with `…` (24 - prefix length); the rendered button content fits within the 24-char budget; total button row layout unchanged
    - Test CDM-8: panel.onMount() subscribes to gestureBus (verified via gestureBus.size() === 1 after onMount call)
    - Test CDM-9: panel.onUnmount() unsubscribes (gestureBus.size() === 0 after onUnmount; T-4b-01-03 mitigation)
    - Test CDM-10 (Y emission): mount → publish('tap') to gestureBus → ws.send called with envelope where type='conc.drop.confirmed', payload.effectId === conflict.effectId; onClose was called
    - Test CDM-11 (N cancel): mount → publish('double-tap') → ws.send NOT called with 'conc.drop.confirmed'; onClose was called
    - Test CDM-12 (ignored gestures): mount → publish('scroll', 'up') → ws.send NOT called; onClose NOT called; panel stays mounted
    - Test CDM-13 (matchAsciiFixture conc-modal.open.it.txt): compose the full 96×24 page with the modal mounted + Status HUD in standard mode at right; matchAsciiFixture passes
  </behavior>
  <action>
    Implement the modal + tests + 2 fixtures atomically.

    **1. NEW file `packages/g2-app/src/panels/concentration-drop-modal.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 8 + 04B-UI-SPEC.md §3.5 + 04B-RESEARCH.md §Approach 6 + ADR-0009 Amendment 1 (panel mounts at z=2; differential demolish rule from Plan 01).

    Imports per <interfaces> shape.

    Exports `class ConcentrationDropModalPanel implements OverlayPanel`. Public surface:
    - `readonly id = 'conc-drop-modal'`
    - constructor `(bridge, ws, gestureBus, conflict, locale, onClose)`
    - `async draw(): Promise<void>` — renders modal content via bridge
    - `destroy(): void` — no-op (cleanup happens in onUnmount)
    - `async onMount(): Promise<void>` — subscribes to gestureBus
    - `async onUnmount(): Promise<void>` — unsubscribes
    - `onEvent(gesture: R1Gesture): void` — dispatches Y/N/ignored
    - `getContainerCount(): { image: 0; text: 3 }` (or 1; document)

    Implementation:
    - **Container strategy:** RECOMMEND 3 text containers (overlay-title, overlay-body, overlay-buttons) per UI-SPEC §7 + RESEARCH §Approach 6. The page-schema buildBootPageSchema MAY need extension to declare these — verify by reading page-lifecycle.ts; if needed, declare in a helper `buildOverlayPageSchema` or extend `buildBootPageSchema` to include the overlay containers OR use existing reserved container slots. ALTERNATIVE: single container with newline-separated content (simpler; document choice).
    - draw() renders the modal content with proper width-budget truncation:
      - title: HUD_WIDTH_BUDGETS.conc_modal_title[locale], padded to 22 chars
      - body line 1: HUD_WIDTH_BUDGETS.conc_modal_active_label[locale]
      - body line 2: indent + conflict.currentConcentrationName (truncated to 30 chars per UI-SPEC §3.5)
      - body line 3: HUD_WIDTH_BUDGETS.conc_modal_casting_template[locale] with {name} substituted to conflict.newSpellName (truncated to fit 38-char body width)
      - body line 4: HUD_WIDTH_BUDGETS.conc_modal_confirm_question[locale]
      - buttons row: y_button (with {name} substituted + truncated to 24-char budget per UI-SPEC §3.5) + 5 spaces + n_button (10 chars)
    - onMount subscribes the gestureBus; saves the unsubscribe fn in `this.unsubscribe`
    - onUnmount calls `this.unsubscribe?.()` then nulls the field
    - onEvent: tap → emit envelope + onClose; double-tap → onClose (no envelope); other → no-op

    Width-budget truncation helper (private method):
    ```
    private _truncate(s: string, max: number): string {
      if (s.length <= max) return s;
      return s.slice(0, max - 1) + '…';
    }
    ```

    Apply the truncation to long spell names + verify CDM-7 stress case.

    INV-4 JSDoc on every export. `// TODO(ADR-0009): thread real session_id from boot engine handle into the envelope` near the session_id placeholder.

    **2. NEW file `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts`:**

    Vitest test file with 13 tests (CDM-1..CDM-13). Use vi.fn() for bridge.textContainerUpgrade, ws.send, gestureBus methods, onClose callback.

    For CDM-10 + CDM-11 + CDM-12: invoke `gestureBus.publish(...)` directly (the panel's onMount subscribed; publish fans out).

    For CDM-13 (matchAsciiFixture): use a `buildConcModalPage(opts: { conflict, locale, statusHudMode? })` helper to compose the full 96×24 page with the panel overlay + Status HUD at right. Path `'../../../../shared-render/src/fixtures/conc-modal.open.it.txt'`.

    **3. Two new INV-1 fixtures in `packages/shared-render/src/fixtures/`:**

    Copy from UI-SPEC §5.16 and §5.17:
    - `conc-modal.open.it.txt`: 96×24 — modal open over raster scene; Status HUD card at cols 68-95 preserved in STANDARD mode
    - `conc-modal-on-death-saves.it.txt`: 96×24 — modal open WHILE Status HUD pivoted to death-saves mode (1p/2f); proves CONTEXT Area 8 edge case

    Both fixtures: trailing newline; uniform 96-char width; modal panel frame `┌─[ CONCENTRATION CONFLICT ]──┐` left edge col 6, right `│` col 65, rows 6-17. Verbatim from UI-SPEC.

    Constraints:
    - Modal implements OverlayPanel (isOverlayPanel === true).
    - Width-budgets respected via HUD_WIDTH_BUDGETS lookup (no hardcoded strings duplicated in panel code; uses getLabel or direct HUD_WIDTH_BUDGETS[key][locale] access).
    - `pnpm typecheck && pnpm lint:ci` exit 0.
    - Phase 4b does NOT call effect.delete() (CONC-01 Phase 7 boundary; Plan 05 emits envelope only).
    - The CDM-13 fixture composition helper uses a death-saves-active Status HUD for the conc-modal-on-death-saves variant (proves co-presence).
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/panels/__tests__/concentration-drop-modal.test.ts && test -f packages/shared-render/src/fixtures/conc-modal.open.it.txt && test -f packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt && awk '{ if (length($0) > 0 && length($0) != 96) { print "FAIL: " FILENAME " row " NR " width " length($0); exit 1 } } END { print "OK" }' packages/shared-render/src/fixtures/conc-modal.open.it.txt packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt && grep -c 'CONCENTRATION CONFLICT' packages/shared-render/src/fixtures/conc-modal.open.it.txt && grep -c 'DEATH SAVES' packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt && grep -c 'export class ConcentrationDropModalPanel' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'implements OverlayPanel' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'CONC_DROP_CONFIRMED_TYPE' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'gestureBus.subscribe' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -cE 'CDM-(0[1-9]|1[0-3])' packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Test file green with 13 tests (CDM-1..CDM-13); ConcentrationDropModalPanel implements OverlayPanel + subscribes to PanelGestureBus + emits conc.drop.confirmed envelope; 2 INV-1 fixtures exist with correct content + uniform 96-char width; CDM-1..CDM-13 grep-match; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: 04b-integration-smoke.test.ts — Phase 4b end-to-end smoke (overlay slot + toast survives + death-saves pivot + conc-modal + co-presence + locale stress)</name>
  <read_first>
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (Phase 4a Plan 05 + Plan 02 + Plan 04 integration harness — REFERENCE pattern for the new smoke file)
    - packages/g2-app/src/engine/layer-manager.ts (post-Plans-01 — bundle() with differential demolish + lifecycle hooks)
    - packages/g2-app/src/status-hud/toast-queue-layer.ts (Plan 03 output)
    - packages/g2-app/src/status-hud/status-hud-renderer.ts (Plan 05 Task 3 — setMode death-saves)
    - packages/g2-app/src/status-hud/status-hud-layer.ts (Plan 05 Task 3 — _onDelta pivot trigger)
    - packages/g2-app/src/panels/concentration-drop-modal.ts (Plan 05 Task 4 output)
    - packages/g2-app/src/engine/panel-gesture-bus.ts (Plan 01 output — subscribers for the modal)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-VALIDATION.md §Stress cases (ST-1..ST-5 — Plan 05 integration smoke covers ST-2/ST-3/ST-4; ST-1 is unit-tested in Plan 03 TQL-FIFO-05; ST-5 is unit-tested in Plan 04 BED-* + boot-engine-error-wrapper.test.ts)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §8 (Visual Stress Cases — informs ISM test design)
  </read_first>
  <files>packages/g2-app/src/__tests__/04b-integration-smoke.test.ts</files>
  <behavior>
    Integration smoke (NEW file — separate from Phase 4a scene-renderer-smoke):
    - Test ISM-01: mount full Phase 4a layers (z=0 capture stub + z=0.5 idle stub + z=1 StatusHudLayer) + mount z=1.5 ToastQueueLayer → bridge.rebuildPageContainer called for each bundle; layerManager.getCaptureContainerCount() === 1 (z=0 only); container budget OK (no panel_mount_budget_exceeded)
    - Test ISM-02 (overlay mount/unmount): from ISM-01 state, bundle([{mount z=2 ConcDropModal}]) → z=0.5 IS removed from layers map (differential demolish), z=1 status hud preserved, z=1.5 toast preserved, bridge.rebuildPageContainer called exactly once for this bundle; then bundle([{destroy z=2}]) → z=0.5 IS re-mounted (instance equality), bridge.rebuildPageContainer called once more
    - Test ISM-03 (ST-2 toast survives overlay open): enqueue 2 toasts BEFORE modal mount; mount modal; assert toast layer still mounted at z=1.5 (layerManager.getLayer(Z1_5_TOAST) is the same toast layer reference); toast's getVisibleCount === 2 (state preserved through the bundle)
    - Test ISM-04 (ST-3 modal + death-saves co-presence): inject character.delta with {hp:0, death:{success:0,failure:2}} via wsEvents mock → StatusHudLayer pivots to death-saves (renderer.setMode('death-saves') called); THEN mount conc-modal at z=2; assert renderer.setMode('death-saves') is STILL the current mode (NOT reverted to 'standard'); layerManager.getLayer(Z1_STATUS_HUD) is unchanged
    - Test ISM-05 (conc-modal Y emission): mount modal; publish({kind:'tap'}) via gestureBus; assert ws.send called with envelope JSON.stringify matching `{type:'conc.drop.confirmed', payload:{effectId:'<original>'}}`
    - Test ISM-06 (conc-modal N cancel): mount modal; publish({kind:'double-tap'}); assert ws.send NOT called with conc.drop.confirmed; onClose callback was invoked
    - Test ISM-07 (panel-gesture-bus subscriber cleanup): mount modal (gestureBus.size() === 1); destroy modal via bundle([{destroy z=2}]) → modal.onUnmount() called → gestureBus.size() === 0 (T-4b-01-03 + T-4b-05-03 mitigation verified end-to-end)
    - Test ISM-08 (ST-4 locale IT longest names): construct conflict with IT 'Cura Ferite di Massa' as both currentConcentrationName + newSpellName; mount modal with locale='it'; assert the rendered button content fits within the 24-char y_button budget (truncated to 'Drop & cast Cura Ferite…' or similar via the conc_modal_y_button_template[it]); panel frame still aligns at col 6 + col 65
    - Test ISM-09 (matchAsciiFixture conc-modal-on-death-saves.it.txt): set up the death-saves pivot via character.delta; mount conc-modal; compose the full 96×24 page; matchAsciiFixture passes
  </behavior>
  <action>
    NEW file `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts`.

    File starts with a comprehensive describe block: `describe('Phase 4b integration smoke (ISM-*) — overlay slot + toast + death-saves + conc-modal + co-presence', () => { ... })`.

    Test harness:
    - Mock EvenAppBridge with vi.fn() stubs for textContainerUpgrade + rebuildPageContainer + setLocalStorage + getLocalStorage
    - Mock WebSocket with vi.fn() send + simulated open
    - Mock wsEvents bus (the one StatusHudLayer subscribes to)
    - Real LayerManager (from Plan 01) + real ToastQueueLayer (from Plan 03) + real ConcentrationDropModalPanel (from Plan 05 Task 4)
    - PanelGestureBus instance shared between modal + test (test publishes to simulate R1 gestures)
    - StatusHudLayer + StatusHudRenderer (real) using the wsEvents mock as the delta source

    Test setup (beforeEach): construct layers; mount Phase 4a-equivalent set (z=0 stub-capture + z=0.5 stub-idle + z=1 real status hud); the layerManager is the system under test.

    Implement ISM-01..ISM-09 with the assertions described in <behavior>.

    For ISM-04 + ISM-09: inject the character.delta via the wsEvents mock's stashed callback (Phase 4a pattern). Snapshot must include the new `death` field per Plan 05 Task 1 atomic extension.

    For ISM-08: assert the rendered modal content does not include a button row character at col 66+ that breaks the panel frame (i.e., the right `│` border at col 65 is preserved).

    For ISM-09: helper `buildConcModalDeathSavesPage(opts)` composes the page from real layer render outputs. Path `'../../../shared-render/src/fixtures/conc-modal-on-death-saves.it.txt'` (3× `../` from `packages/g2-app/src/__tests__/`).

    Constraints:
    - Real layer instances (not just mocks) — proves integration end-to-end
    - The integration tests MUST NOT regress with Phase 4a scene-renderer-smoke SR-1..SR-18 (those are in a separate file; this is a new file)
    - INV-4 JSDoc on harness helpers + test descriptions
    - `pnpm typecheck && pnpm lint:ci` exit 0
    - The full smoke test suite (all 9 ISM cases) must complete within a Vitest default timeout (5s per test default; fake timers via vi.useFakeTimers may be needed for ISM-03 if dwell-cycle timing matters)
    - Test discriminators 'ISM-01' through 'ISM-09' must appear in it() names
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/__tests__/04b-integration-smoke.test.ts && grep -c 'Phase 4b integration smoke' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -cE 'ISM-0[1-9]' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'ConcentrationDropModalPanel' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'ToastQueueLayer' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'PanelGestureBus' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c "death" packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && pnpm typecheck && pnpm lint:ci && pnpm test</automated>
  </verify>
  <done>
    04b-integration-smoke.test.ts green with 9 ISM tests; all Phase 4b layer composition end-to-end behaviors verified (overlay mount/unmount + differential demolish + toast survives + death-saves pivot + conc-modal Y/N + gesture-bus cleanup + locale stress + matchAsciiFixture for co-presence); pnpm test (workspace-wide) exits 0 (catches any cross-package regression from the schema extension in Task 1); typecheck + lint:ci exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CharacterSnapshotSchema.death extension is a BREAKING change for consumers | Atomic commit (schema + reader together) is the load-bearing mitigation; workspace-wide typecheck catches missing-field omissions |
| ConcConflictPayloadSchema receives untrusted WS payload from bridge | safeParse at WS boundary (scene-input or attachConcConflictHandler) before modal mount; failure → log + ignore |
| panel-gesture-bus subscriber lifecycle | Modal's onUnmount MUST unsubscribe — verified end-to-end in ISM-07 |
| Conc-modal Y-gesture authorisation | Phase 4b accepts in-process gesture-bus as trusted; Phase 7 write path validates server-side |
| Death-saves data displays PC HP=0 | Player's own data; same disclosure surface as Status HUD |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-05-01 | T | CharacterSnapshotSchema.death = REQUIRED atomic commit | mitigate | ATOMIC COMMIT (Task 1): schema + reader land in same git commit; workspace-wide typecheck enforces field presence; Pitfall 3 closed. |
| T-4b-05-02 | T | ConcConflictPayloadSchema receives untrusted bridge WS payload | mitigate | ConcConflictPayloadSchema.safeParse() at WS receive boundary; failure → log + ignore, no modal mount. Single trust boundary in scene-input dispatcher. |
| T-4b-05-03 | D | panel-gesture-bus subscriber leak from conc-modal | mitigate | ConcentrationDropModalPanel.onUnmount() calls the unsubscribe; ISM-07 asserts post-unmount bus.size() === 0. |
| T-4b-05-04 | T | Conc-modal Y-gesture spoofing | accept | Phase 4b accepts in-process gesture-bus as trusted; Phase 7 write path validates server-side (effect ownership + session_id + bearer token) before effect.delete(). |
| T-4b-05-05 | I | Death-saves HUD displays PC HP=0 state | accept | Player's own data; same disclosure surface as Status HUD. Not a new leak. |
| T-4b-05-06 | T | Conc-modal opens with malformed conflict payload | mitigate | ConcConflictPayloadSchema enforces effectId.min(1), currentConcentrationName.min(1), newSpellName.min(1) via Zod. safeParse failure → log + ignore. |
| T-4b-05-07 | D | Pivot latch stuck ON when failure===3 (PC dead) | accept | SHL-PIVOT-4 documents the behavior: death-saves mode stays rendered until a future revive event (Phase 7+); not a security or availability issue; informational by design. |
</threat_model>

<verification>
- `pnpm --filter @evf/shared-protocol test --run` exits 0 (character.test.ts + concentration.test.ts)
- `pnpm --filter @evf/foundry-module test --run` exits 0 (readers.test.ts with new death tests)
- `pnpm --filter @evf/g2-app test --run` exits 0 (status-hud + panels + integration smoke green)
- `pnpm test` (workspace-wide) exits 0 — catches any cross-package break from the schema extension
- `pnpm typecheck && pnpm lint:ci` exit 0
- ATOMIC COMMIT in Task 1: schema + reader landed in same git commit (verified by git log inspection — single SHA touches both files)
- 4 new INV-1 fixtures (2 death-saves + 2 conc-modal) committed
- ConcentrationDropModalPanel passes isOverlayPanel guard
- conc.drop.confirmed envelope is the SOLE write-side bridge call from the modal (no effect.delete in Phase 4b code)
- 04b-integration-smoke.test.ts proves Phase 4b layer composition end-to-end
- All 5 phase requirements addressed: MAP-05 (Plan 01 + Plan 02), TOAST-01 (Plan 03), BOOT-01 (Plan 04), DEATH-01 (Plan 05), CONC-01 (Plan 05)
</verification>

<success_criteria>
Plan 05 closes when:
- DEATH-01 fully addressed software-side: HP=0 + death.failure<3 → status HUD pivots to 3-strike tracker per UI-SPEC §3.4; latched until HP>0 (recovery) or PC dead (Phase 7+ revive event)
- CONC-01 fully addressed software-side: ConcentrationDropModalPanel mounts at z=2 via OverlayPanel API; user [Y] gesture → conc.drop.confirmed envelope emitted via ws.send; Phase 4b does NOT call effect.delete (Phase 7 write path boundary)
- CharacterSnapshotSchema.death extension landed ATOMICALLY with character-reader.ts producer (Task 1 single commit — Pitfall 3 closed)
- Concentration envelope schemas (ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema) exported from @evf/shared-protocol
- 4 new INV-1 fixtures committed (status-hud.death-saves-initial.it.txt + status-hud.death-saves-mid.it.txt + conc-modal.open.it.txt + conc-modal-on-death-saves.it.txt)
- 04b-integration-smoke.test.ts proves Phase 4b layer composition end-to-end across overlay slot + toast + death-saves pivot + conc-modal + co-presence + locale stress
- Hardware verification (death-saves pivot triggers on real Foundry HP=0 + conc-modal renders correctly on real G2) deferred to ADR-0005 Branch A human_needed gate per VALIDATION §Manual-Only entries
- Phase 4b is COMPLETE: every of the 5 requirement IDs (MAP-05, TOAST-01, BOOT-01, DEATH-01, CONC-01) has at least one Plan delivering software-side closure; hardware-side closure carried on Phase 4a's ADR-0005 Branch A
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-05-SUMMARY.md` capturing:
- Final DeathSavesSchema shape (success/failure 0..3)
- Atomic commit confirmation (Task 1 git log — single SHA touches both shared-protocol/character.ts AND foundry-module/character-reader.ts)
- Count of fixture updates required across the workspace to satisfy the new required `death` field (Phase 4a status-hud tests, integration smoke fixtures, etc.)
- Conc envelope types (CONC_CONFLICT_TYPE + CONC_DROP_CONFIRMED_TYPE) exact wire strings
- StatusHudRenderer setMode + renderDeathSaves implementation details (28×21 grid; ◯/● glyphs; locale-aware labels)
- StatusHudLayer pivotLatched semantics (transition-driven, not per-delta)
- ConcentrationDropModalPanel container strategy (3 containers vs 1 with newlines — pick + rationale)
- Width-budget truncation strategy for long IT spell names (ST-4 stress case verified)
- Test counts: 13 in character.test.ts + 5 in readers.test.ts + 8 in concentration.test.ts + 15 new in status-hud-renderer.test.ts + status-hud-layer.test.ts + 13 in concentration-drop-modal.test.ts + 9 in 04b-integration-smoke.test.ts = ~63 new tests
- Phase 6 wiring hint: `// TODO(ADR-0009): thread real session_id from boot engine handle into the envelope` location count
- Phase 4b global closure signal: all 5 REQ-IDs (MAP-05/TOAST-01/BOOT-01/DEATH-01/CONC-01) software-side green; hardware-side carried on ADR-0005 Branch A human_needed (Phase 4a precedent)
- ROADMAP.md update: Phase 4b plans 1/N → 5/5 ready for phase-checker verification
</output>
