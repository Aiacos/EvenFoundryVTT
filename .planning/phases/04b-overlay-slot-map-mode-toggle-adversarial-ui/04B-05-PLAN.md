---
phase: 4b
plan: 05
type: execute
wave: 3
depends_on: ["04b-01", "04b-02", "04b-03", "04b-04", "04b-06"]
files_modified:
  - packages/g2-app/src/status-hud/status-hud-renderer.ts
  - packages/g2-app/src/status-hud/status-hud-layer.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
  - packages/g2-app/src/panels/concentration-drop-modal.ts
  - packages/g2-app/src/panels/conc-conflict-dispatcher.ts
  - packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts
  - packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts
  - packages/g2-app/src/__tests__/04b-integration-smoke.test.ts
  - packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt
  - packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt
  - packages/shared-render/src/fixtures/conc-modal.open.it.txt
  - packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt
autonomous: true
requirements: [DEATH-01, CONC-01]
subsystem: g2-app
user_setup: []
tags: [g2-app, status-hud, panels, death-saves, conc-modal, integration-smoke, wave-3, inv-1, fixtures, dispatcher]
must_haves:
  truths:
    - "StatusHudRenderer constructor opts gain a `mode?: 'standard' | 'death-saves'` field. New method `setMode(mode): void` switches renderer output; new method `renderDeathSaves(snapshot): AsciiGrid` produces the 28×21 pivot card per UI-SPEC §3.4."
    - "StatusHudLayer._onDelta detects pivot trigger: `parsed.data.hp === 0 && parsed.data.death.failure < 3` → latch ON (this.pivotLatched = true, renderer.setMode('death-saves')); transition back to standard when `parsed.data.hp > 0` (latch OFF). Death (failure === 3) keeps the pivot rendered until a future revive event (Phase 7+). Schema field `death` comes from Plan 06's atomic extension — Plan 05 imports CharacterSnapshotSchema unchanged."
    - "INV-1 fixtures (2 NEW for death-saves): status-hud.death-saves-initial.it.txt (HP=0, 0 passes, 0 fails — initial pivot entry) + status-hud.death-saves-mid.it.txt (HP=0, 1 pass, 2 fails — mid-saves stress). Both are 28×21 inside the StatusHudLayer card; the card border `║` at cols 0 + 27 preserved."
    - "ConcentrationDropModalPanel implements OverlayPanel (extends Layer from Plan 01). z=2 mount via layerManager.bundle. onMount() subscribes to panel-gesture-bus; onUnmount() unsubscribes (T-4b-01-03 mitigation). onEvent(gesture): tap → emit conc.drop.confirmed envelope via ws.send (using canonical EnvelopeSchema shape with `payload` field and valid UUID v4 session_id); double-tap → cancel (no envelope, modal closes); other gestures ignored."
    - "Modal mount uses LayerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: modal }]) — Plan 01's differential demolish rule auto-demolishes z=0.5 idle infill; LMT-DD-04 confirms z=1.5 toast survives modal open"
    - "B-4 closure: conc-conflict-dispatcher.ts (NEW FILE) exports `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, locale): () => void` — production code path that subscribes to WS messages, parses envelopes via canonical EnvelopeSchema, narrows on `envelope.type === 'conc.conflict'`, runs `ConcConflictPayloadSchema.safeParse(envelope.payload)` at the WS-receive trust boundary, and on success mounts `ConcentrationDropModalPanel` at z=2 via `layerManager.bundle([{type:'mount', z:Z2_OVERLAY, layer:modal}])` (differential demolish rule). Returns unsubscribe function for teardown."
    - "Phase 4b does NOT modify boot-engine-core.ts to wire `attachConcConflictHandler` into the production boot — Phase 6 will land that wiring. Plan 05 ships the dispatcher + integration test proving it works end-to-end from a synthetic ws.fireMessage."
    - "2 NEW INV-1 fixtures for conc modal: conc-modal.open.it.txt (96×24 — modal open over raster scene with Status HUD preserved) + conc-modal-on-death-saves.it.txt (96×24 — modal open WHILE Status HUD pivoted to death-saves; verifies CONTEXT Area 8 edge case)"
    - "Integration smoke test 04b-integration-smoke.test.ts (NEW file) covers: overlay slot mount/unmount + toast survives overlay (ST-2) + death-saves pivot trigger end-to-end + conc-modal Y emits bridge envelope (with EnvelopeSchema round-trip — W-4 closure) + conc-modal + death-saves co-presence (ST-3) + locale stress IT longest names on conc modal (ST-4) + production dispatcher attaches to ws and mounts modal on conc.conflict (B-4 closure)"
    - "Phase 4b does NOT call effect.delete() — the conc.drop.confirmed envelope is emitted to bridge; Phase 7 wires the actual write path via socketlib.executeAsGM"
  artifacts:
    - path: "packages/g2-app/src/status-hud/status-hud-renderer.ts"
      provides: "Extended with mode: 'standard' | 'death-saves'; renderDeathSaves(snapshot) method; setMode(mode) method"
      contains: "renderDeathSaves|setMode"
    - path: "packages/g2-app/src/status-hud/status-hud-layer.ts"
      provides: "Extended _onDelta with pivotLatched private field + trigger logic for hp===0 && death.failure<3"
      contains: "pivotLatched|death.failure"
    - path: "packages/g2-app/src/panels/concentration-drop-modal.ts"
      provides: "ConcentrationDropModalPanel class implementing OverlayPanel; subscribes to panel-gesture-bus; emits conc.drop.confirmed envelope (canonical EnvelopeSchema shape) on [Y]"
      exports: ["ConcentrationDropModalPanel"]
    - path: "packages/g2-app/src/panels/conc-conflict-dispatcher.ts"
      provides: "NEW FILE — attachConcConflictHandler(ws, bridge, gestureBus, layerManager, locale): () => void — production code path mounting ConcentrationDropModalPanel on bridge-emitted conc.conflict envelope (B-4 closure)"
      exports: ["attachConcConflictHandler"]
    - path: "packages/g2-app/src/__tests__/04b-integration-smoke.test.ts"
      provides: "Phase 4b integration smoke covering overlay slot mount + toast survives + death-saves pivot + conc-modal + co-presence + locale stress + conc-conflict-dispatcher end-to-end (B-4) + EnvelopeSchema.safeParse round-trip on emitted Y envelope (W-4)"
      contains: "04b integration smoke"
    - path: "packages/shared-render/src/fixtures/status-hud.death-saves-{initial,mid}.it.txt"
      provides: "2 NEW INV-1 fixtures for death-saves pivot (28×21)"
      contains: "DEATH SAVES"
    - path: "packages/shared-render/src/fixtures/conc-modal.open.it.txt + conc-modal-on-death-saves.it.txt"
      provides: "2 NEW INV-1 fixtures for conc-drop modal (96×24)"
      contains: "CONCENTRATION CONFLICT"
  key_links:
    - from: "packages/g2-app/src/status-hud/status-hud-layer.ts (_onDelta pivot trigger)"
      to: "packages/shared-protocol CharacterSnapshotSchema.death (provided by Plan 06)"
      via: "parsed.data.death.failure < 3 → latch death-saves mode"
      pattern: "parsed\\.data\\.death|pivotLatched"
    - from: "packages/g2-app/src/panels/concentration-drop-modal.ts"
      to: "packages/g2-app/src/engine/layer-types.ts (OverlayPanel interface) + panel-gesture-bus.ts"
      via: "implements OverlayPanel from Plan 01; subscribes to PanelGestureBus from Plan 01"
      pattern: "OverlayPanel|PanelGestureBus"
    - from: "packages/g2-app/src/panels/concentration-drop-modal.ts"
      to: "packages/shared-protocol/src/payloads/concentration.ts (provided by Plan 06)"
      via: "imports ConcDropConfirmedPayloadSchema + CONC_DROP_CONFIRMED_TYPE; sends envelope on [Y] using canonical EnvelopeSchema shape (proto/seq/ts/type/session_id/payload)"
      pattern: "CONC_DROP_CONFIRMED_TYPE|conc.drop.confirmed"
    - from: "packages/g2-app/src/panels/conc-conflict-dispatcher.ts"
      to: "packages/g2-app/src/panels/concentration-drop-modal.ts + packages/g2-app/src/engine/layer-manager.ts"
      via: "subscribes to ws.message; on EnvelopeSchema.safeParse + envelope.type==='conc.conflict' + ConcConflictPayloadSchema.safeParse(envelope.payload) → layerManager.bundle([mount z=2 ConcDropModal]) (B-4 production code path; T-4b-05-02 mitigation)"
      pattern: "attachConcConflictHandler|EnvelopeSchema|ConcConflictPayloadSchema"
    - from: "packages/g2-app/src/__tests__/04b-integration-smoke.test.ts"
      to: "packages/g2-app/src/engine/layer-manager.ts + packages/g2-app/src/status-hud/toast-queue-layer.ts + packages/g2-app/src/panels/concentration-drop-modal.ts + packages/g2-app/src/panels/conc-conflict-dispatcher.ts"
      via: "End-to-end coverage of Phase 4b layer composition (overlay + toast + death-saves + conc-modal + dispatcher)"
      pattern: "LayerManager|ToastQueueLayer|ConcentrationDropModalPanel|attachConcConflictHandler"

threat_model:
  trust_boundaries:
    - description: "ConcConflictPayloadSchema receives untrusted bridge WS payload (Phase 7 server emits) — Zod safeParse at the conc-conflict-dispatcher WS-receive boundary BEFORE modal mount. EnvelopeSchema.safeParse runs FIRST to verify the outer envelope shape (canonical: proto/seq/ts/type/session_id/payload)."
    - description: "panel-gesture-bus subscriber lifecycle — modal MUST unsubscribe on onUnmount to prevent leak (T-4b-01-03)"
    - description: "Conc-modal Y envelope construction — uses canonical EnvelopeSchema fields (`payload`, NOT `value`; session_id must be valid UUID v4). The EnvelopeSchema.safeParse round-trip test (W-4 closure) verifies the emitted envelope structurally."
    - description: "Conc-modal mount on death-saves pivot — different z-strata, no layer conflict, but the integration smoke verifies the StatusHudLayer's death-saves mode is preserved underneath"
  threats:
    - id: "T-4b-05-01"
      category: "T"
      component: "ConcConflictPayloadSchema receiving untrusted bridge WS payload"
      disposition: "mitigate"
      mitigation_plan: "conc-conflict-dispatcher.ts performs `EnvelopeSchema.safeParse(rawMessage)` FIRST (outer envelope), then narrows on `envelope.type === 'conc.conflict'`, then `ConcConflictPayloadSchema.safeParse(envelope.payload)` (inner payload). Either failure → log + ignore, no modal mount. The dispatcher is the single trust boundary for the conc.conflict event source."
    - id: "T-4b-05-02"
      category: "D"
      component: "panel-gesture-bus subscriber leak from conc-modal"
      disposition: "mitigate"
      mitigation_plan: "ConcentrationDropModalPanel.onUnmount() MUST call the unsubscribe fn returned by panel-gesture-bus.subscribe(). Integration smoke test ISM-07 asserts post-unmount bus.size() === 0."
    - id: "T-4b-05-03"
      category: "T"
      component: "Conc-modal Y-gesture spoofing (an attacker fires synthetic tap to confirm drop)"
      disposition: "accept"
      mitigation_plan: "Phase 4b assumes the in-process panel-gesture-bus is trusted (gestures only originate from bridge.onEvenHubEvent via Phase 6 source provider). Phase 7+ write path will validate the conc.drop.confirmed envelope server-side (effect ownership + session_id) before calling effect.delete()."
    - id: "T-4b-05-04"
      category: "I"
      component: "Death-saves HUD displays PC HP=0 state"
      disposition: "accept"
      mitigation_plan: "Player's own character data; same disclosure surface as Status HUD. Not a new leak."
    - id: "T-4b-05-05"
      category: "T"
      component: "Conc-modal opens with malformed conflict payload (e.g., effectId missing or empty)"
      disposition: "mitigate"
      mitigation_plan: "ConcConflictPayloadSchema enforces effectId.min(1), currentConcentrationName.min(1), newSpellName.min(1) via Zod. dispatcher safeParse failure → log + ignore. Modal never mounts on invalid input."
    - id: "T-4b-05-06"
      category: "T"
      component: "Conc-modal Y envelope construction regression (NF-1 class — invented WireEnvelopeSchema or envelope.value)"
      disposition: "mitigate"
      mitigation_plan: "ISM-05 round-trip test: extract the JSON-stringified ws.send argument, parse, call `EnvelopeSchema.safeParse(parsed)`, assert .success === true. Additionally: a NEGATIVE test constructs an envelope WITHOUT session_id and asserts EnvelopeSchema.safeParse rejects (W-4 NF-1 regression guard). Plan 06's CN-9 + CN-10 provide the canonical envelope shape; Plan 05 consumes it verbatim."
---

<objective>
Ship the final Phase 4b consumer layers (Wave 3): **death-saves HUD pivot** (DEATH-01) + **concentration-drop modal** (CONC-01) + **conc-conflict production dispatcher** (B-4 closure) + **integration smoke** that ratifies Phase 4b's layer composition end-to-end. The schema atomic extension already landed in Plan 06 (Wave 2); Plan 05 is now a pure consumer — no schema work, no schema commits.

Purpose: Close DEATH-01 (HP=0 → 3-strike tracker pivot inside StatusHudLayer; latched until recovery) + CONC-01 (modal mounts at z=2 via OverlayPanel API; user Y/N gesture captured; conc.drop.confirmed envelope emitted to bridge — Phase 7 wires the write path) + B-4 production dispatcher (conc-conflict-dispatcher.ts mounts the modal on bridge-emitted `conc.conflict` envelope via EnvelopeSchema + ConcConflictPayloadSchema double-safeParse). The integration smoke is the single source-of-truth proving Phase 4b's layer composition works under real conditions: overlay mount/unmount, toast survives modal open, death-saves co-existence with conc-modal at z=2, dispatcher end-to-end from synthetic ws.fireMessage, and EnvelopeSchema.safeParse round-trip on the emitted Y envelope (W-4 closure).

Output: StatusHudRenderer + StatusHudLayer extensions for the pivot + 1 new panel (ConcentrationDropModalPanel) + 1 new dispatcher (conc-conflict-dispatcher.ts) + 4 new INV-1 fixtures + 1 new integration smoke test file. Depends on Plans 01/02/03/04/06 (Wave 3, runs after Waves 0/1/2 are green).

**B-5 resolution (scope-sanity split):** Iteration 1 plan-check flagged Plan 05 at 5 tasks (blocker threshold). Resolution: Tasks 1+2 (schema atomic + concentration envelopes) moved to NEW Plan 06 (Wave 2, parallel with Plans 03+04). Plan 05 reduces to 3 tasks: (Task 1) StatusHudRenderer pivot + death-saves fixtures, (Task 2) ConcentrationDropModalPanel + conc-conflict-dispatcher + 2 conc-modal fixtures, (Task 3) integration smoke covering DEATH-01 + CONC-01 + B-4 dispatcher + W-4 envelope round-trip + ST-2/ST-3/ST-4 stress cases. Plan 05 task count is now 3 (within scope-sanity target).
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
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-06-SUMMARY.md
@packages/shared-protocol/src/payloads/character.ts
@packages/shared-protocol/src/payloads/concentration.ts
@packages/shared-protocol/src/envelope.ts
@packages/shared-protocol/src/index.ts
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
<!-- Key types this plan consumes (post-Plans-01/02/03/04/06) and exposes. -->

From packages/shared-protocol/src/payloads/character.ts (post-Plan-06 — Plan 05 IMPORTS, does NOT modify):
```
export const DeathSavesSchema = z.strictObject({
  success: z.number().int().min(0).max(3),
  failure: z.number().int().min(0).max(3),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;

export const CharacterSnapshotSchema = z.strictObject({
  ... existing fields ...,
  death: DeathSavesSchema,   // Plan 06 atomic extension
});
```

From packages/shared-protocol/src/payloads/concentration.ts (post-Plan-06 — NEW FILE; Plan 05 IMPORTS, does NOT modify):
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

From packages/shared-protocol/src/envelope.ts (CANONICAL — verified 2026-05-15):
```
export const EnvelopeSchema = z.object({
  proto: z.literal('evf-v1'),
  seq: z.number().int().nonnegative(),
  ts: z.number().int(),
  type: z.string(),
  session_id: z.string().uuid(),       // REQUIRED — UUID v4
  payload: z.unknown(),                 // carrier field is `payload` NOT `value`
});
export type Envelope = z.infer<typeof EnvelopeSchema>;
```

**W-4 regression guard:** the canonical schema name is `EnvelopeSchema` (NOT `WireEnvelopeSchema`). The carrier field is `envelope.payload` (NOT `envelope.value`). `session_id` is REQUIRED and must be a valid UUID v4. Plan 05's envelope construction uses these verbatim — the integration smoke ISM-05 round-trip test asserts `EnvelopeSchema.safeParse(parsedSentEnvelope).success === true` and a complementary negative test asserts rejection when session_id is omitted. This is the Phase 4a NF-1 regression-class guard.

StatusHudRenderer extensions (Plan 05 Task 1):
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

StatusHudLayer extensions (Plan 05 Task 1 — _onDelta pivot trigger):
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

ConcentrationDropModalPanel (Plan 05 Task 2):
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
    private readonly sessionId: string,  // UUID v4 — threaded from dispatcher / boot engine
    private readonly onClose: () => void,
  ) {}

  // ... (Layer methods + onMount + onEvent)

  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'tap') {
      // [Y] Drop & cast — emit canonical EnvelopeSchema envelope
      const envelope = {
        proto: 'evf-v1' as const,
        seq: 0,  // bridge assigns sequence
        ts: Date.now(),
        type: CONC_DROP_CONFIRMED_TYPE,
        session_id: this.sessionId,   // valid UUID v4 from constructor
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

NOTE: The modal constructor now takes `sessionId: string` (UUID v4) as a constructor arg — threaded from the dispatcher (which gets it from the WS-receive boundary, where the envelope already contains a valid session_id). The dispatcher passes the SAME session_id from the inbound conc.conflict envelope to the modal. For tests, a synthetic UUID v4 literal is used (e.g., `'11111111-1111-4111-8111-111111111111'`).

ConcConflictDispatcher (Plan 05 Task 2 — B-4 production code path):
```
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EnvelopeSchema, ConcConflictPayloadSchema, CONC_CONFLICT_TYPE } from '@evf/shared-protocol';
import type { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { ConcentrationDropModalPanel } from './concentration-drop-modal.js';

export function attachConcConflictHandler(
  ws: WebSocket,
  bridge: EvenAppBridge,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  locale: 'it' | 'en' | 'de',
): () => void {
  const handler = (ev: MessageEvent): void => {
    try {
      const rawText = typeof ev.data === 'string'
        ? ev.data
        : new TextDecoder().decode(ev.data as ArrayBuffer);
      const parsedJson = JSON.parse(rawText);
      // Trust boundary #1: outer envelope shape (canonical EnvelopeSchema).
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        console.warn('[conc-conflict-dispatcher] envelope rejected', envParse.error);
        return;
      }
      if (envParse.data.type !== CONC_CONFLICT_TYPE) {
        return;  // not for us; another dispatcher handles it
      }
      // Trust boundary #2: inner payload shape.
      const payloadParse = ConcConflictPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[conc-conflict-dispatcher] conc.conflict payload rejected', payloadParse.error);
        return;
      }
      // Mount modal at z=2 via bundle — Plan 01's differential demolish rule
      // auto-demolishes z=0.5 idle infill; z=1.5 toast survives (LMT-DD-04).
      const modal = new ConcentrationDropModalPanel(
        bridge,
        ws,
        gestureBus,
        payloadParse.data,
        locale,
        envParse.data.session_id,  // thread session_id from inbound envelope
        () => {
          // onClose: destroy the modal via bundle (differential demolish reverses)
          void layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
        },
      );
      void layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: modal }]);
    } catch (err) {
      console.warn('[conc-conflict-dispatcher] handler threw', err);
    }
  };
  ws.addEventListener('message', handler as EventListener);
  return () => {
    ws.removeEventListener('message', handler as EventListener);
  };
}
```

Plan 05 ships this dispatcher AND a unit test for it. Phase 6 will wire `attachConcConflictHandler` into boot-engine-core.ts step 11 area (after `attachSceneInputToWs`). Plan 05 does NOT modify boot-engine-core.ts.

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
- ISM-05 (W-4 closure — EnvelopeSchema.safeParse round-trip): mount modal, publish 'tap' to panel-gesture-bus, assert ws.send was called with conc.drop.confirmed envelope containing the correct effectId. THEN: extract the JSON-stringified argument, `JSON.parse()` it, call `EnvelopeSchema.safeParse(parsed)` and assert `.success === true` (positive round-trip). ADDITIONALLY: construct a synthetic malformed envelope WITHOUT session_id, call `EnvelopeSchema.safeParse(malformed)` and assert `.success === false` (W-4 NF-1 regression guard).
- ISM-06: Conc-modal N (cancel): mount modal, publish 'double-tap' to panel-gesture-bus, assert ws.send was NOT called with conc.drop.confirmed, onClose was called
- ISM-07: Conc-modal unsubscribes on onUnmount: mount modal, destroy modal via bundle, assert panel-gesture-bus.size() === 0 (T-4b-01-03 + T-4b-05-02 mitigation)
- ISM-08: ST-4 stress (locale IT longest names): mount modal with currentConcentrationName='Cura Ferite di Massa', newSpellName='Cura Ferite di Massa'; assert rendered content truncates to 24-char budget on Y button without breaking the panel frame layout
- ISM-09 (matchAsciiFixture): mount conc-modal over a death-saves-active Status HUD; matchAsciiFixture against conc-modal-on-death-saves.it.txt
- ISM-10 (B-4 closure — dispatcher end-to-end): construct a synthetic `conc.conflict` envelope `{proto:'evf-v1', seq:1, ts:Date.now(), type:'conc.conflict', session_id:'<valid uuid v4>', payload:{effectId:'eff1', currentConcentrationName:'Hold Person', newSpellName:'Bless'}}`; `JSON.stringify` it; call `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, 'it')`; `ws.fireMessage(envelope)`; assert `layerManager.getLayer(Z2_OVERLAY)` is the ConcentrationDropModalPanel instance. Negative case: synthetic malformed conc.conflict envelope (missing effectId) → safeParse rejection → modal NOT mounted; `layerManager.getLayer(Z2_OVERLAY) === undefined`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: StatusHudRenderer death-saves mode + StatusHudLayer pivot trigger + 2 INV-1 fixtures (DEATH-01)</name>
  <read_first>
    - packages/g2-app/src/status-hud/status-hud-renderer.ts (full file — Plan 04a Plan 04 output; Plan 05 extends with renderDeathSaves + setMode)
    - packages/g2-app/src/status-hud/status-hud-layer.ts (full file — _onDelta hook; Plan 05 extends with pivotLatched + trigger)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — death_saves_title + death_saves_passes_label + death_saves_fails_label keys available; Plan 05 reads these via getLabel)
    - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts (Phase 4a tests SR-1..SR-8 — Plan 05 extends with death-saves cases SR-DS-*)
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts (Phase 4a tests SHL-1..SHL-7 — Plan 05 extends with SHL-PIVOT-* cases)
    - packages/shared-protocol/src/payloads/character.ts (post-Plan-06 — Plan 05 imports CharacterSnapshotSchema + DeathSavesSchema; does NOT modify)
    - packages/shared-render/src/fixtures/status-hud-baseline.txt + status-hud.loading.txt (Phase 4a fixtures — geometry reference for the 28×21 card)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.4 (death-saves layout 28×21) + §5.14 (fixture #14 ASCII) + §5.15 (fixture #15 ASCII)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 5 (renderer + layer extension pattern) + §Q4 (event source / trigger condition)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-06-SUMMARY.md (Plan 06 atomic extension confirmation — CharacterSnapshotSchema.death REQUIRED + DeathSavesSchema export available)
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
    - DeathSavesSchema + CharacterSnapshotSchema.death already available from Plan 06; Plan 05 imports unchanged.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-renderer.test.ts src/status-hud/__tests__/status-hud-layer.test.ts && test -f packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt && test -f packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt && grep -c 'DEATH SAVES' packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt && grep -cE '\[ ● ●? ◯' packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt && grep -c 'setMode' packages/g2-app/src/status-hud/status-hud-renderer.ts && grep -c 'pivotLatched' packages/g2-app/src/status-hud/status-hud-layer.ts && grep -c "death.failure < 3" packages/g2-app/src/status-hud/status-hud-layer.ts && grep -cE 'SR-DS-0[1-8]' packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts && grep -cE 'SHL-PIVOT-0?[1-7]' packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Both test files green (SR-DS-1..8 + SHL-PIVOT-1..7 = 15 new tests minimum) — Phase 4a existing tests still pass; 2 new fixtures exist with correct content; renderer has setMode + _renderDeathSaves; layer has pivotLatched + trigger logic; test discriminator markers grep-match; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: ConcentrationDropModalPanel + conc-conflict-dispatcher (NEW dispatcher) + 2 INV-1 fixtures (CONC-01 + B-4)</name>
  <read_first>
    - packages/g2-app/src/engine/layer-types.ts (post-Plan-01 — OverlayPanel interface + R1Gesture union + ZIndex.Z2_OVERLAY)
    - packages/g2-app/src/engine/overlay-panel.ts (post-Plan-01 — isOverlayPanel type guard)
    - packages/g2-app/src/engine/panel-gesture-bus.ts (post-Plan-01 — PanelGestureBus class; conc-modal subscribes in onMount)
    - packages/g2-app/src/engine/layer-manager.ts (post-Plan-01 — bundle() with differential demolish + Z2_OVERLAY mount)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — conc_modal_* keys available)
    - packages/shared-protocol/src/payloads/concentration.ts (post-Plan-06 — Plan 05 imports schemas + type constants)
    - packages/shared-protocol/src/envelope.ts (CANONICAL EnvelopeSchema; carrier `payload` field; session_id UUID)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.5 (conc-modal 2 visual states + geometry: cols 6-65 inner content, rows 6-17 panel rows) + §5.16 + §5.17 (fixtures verbatim)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6 (file map + key data shapes + Y/N gesture routing)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8 (locked decisions on slot, trigger, R1 routing, Phase 4b output)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-PLAN-CHECK.md §B-4 (iteration 1 — dispatcher requirement)
  </read_first>
  <files>packages/g2-app/src/panels/concentration-drop-modal.ts, packages/g2-app/src/panels/conc-conflict-dispatcher.ts, packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts, packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts, packages/shared-render/src/fixtures/conc-modal.open.it.txt, packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt</files>
  <behavior>
    ConcentrationDropModalPanel tests:
    - Test CDM-1: `new ConcentrationDropModalPanel(bridge, ws, bus, conflict, 'en', '<uuid>', onClose).id === 'conc-drop-modal'`
    - Test CDM-2: isOverlayPanel(panel) returns true (onMount + onUnmount + onEvent all present)
    - Test CDM-3: panel.getContainerCount() returns { image: 0, text: 3 } (or 1 if single-container strategy chosen — document choice)
    - Test CDM-4: panel.draw() calls bridge.textContainerUpgrade (count depends on container strategy: 3 for multi-container, 1 for single-container with newlines); content includes 'CONCENTRATION CONFLICT' title + currentConcentrationName + newSpellName + '[Y] Drop' + '[N] Cancel'
    - Test CDM-5: For locale='it' the title row uses HUD_WIDTH_BUDGETS.conc_modal_title.it ('CONCENTRATION CONFLICT' — same as EN for IT per UI-SPEC §4.4); body uses 'Spell attivo:' + 'Castando' phrases
    - Test CDM-6: For locale='de' title is 'KONZENTRATIONSKONFLIKT' + body uses German strings
    - Test CDM-7 (long-name truncation — ST-4 stress): conflict with newSpellName='Cura Ferite di Massa' (20 chars), Y button text uses conc_modal_y_button_template[it] = '[Y] Drop & cast {name}' with {name} substitution; if total > 24 char budget (max from i18n-budgets), name is truncated with `…` (24 - prefix length); the rendered button content fits within the 24-char budget; total button row layout unchanged
    - Test CDM-8: panel.onMount() subscribes to gestureBus (verified via gestureBus.size() === 1 after onMount call)
    - Test CDM-9: panel.onUnmount() unsubscribes (gestureBus.size() === 0 after onUnmount; T-4b-01-03 mitigation)
    - Test CDM-10 (Y emission + W-4 envelope round-trip): mount → publish('tap') to gestureBus → ws.send called with envelope where type='conc.drop.confirmed', payload.effectId === conflict.effectId; onClose was called. Additionally: extract `ws.send.mock.calls[0][0]`, `JSON.parse` it, call `EnvelopeSchema.safeParse(parsed)`, assert `.success === true`. This is the W-4 NF-1 regression guard at the modal level.
    - Test CDM-11 (N cancel): mount → publish('double-tap') → ws.send NOT called with 'conc.drop.confirmed'; onClose was called
    - Test CDM-12 (ignored gestures): mount → publish('scroll', 'up') → ws.send NOT called; onClose NOT called; panel stays mounted
    - Test CDM-13 (matchAsciiFixture conc-modal.open.it.txt): compose the full 96×24 page with the modal mounted + Status HUD in standard mode at right; matchAsciiFixture passes

    conc-conflict-dispatcher tests:
    - Test CCD-1: `attachConcConflictHandler(ws, bridge, bus, lm, 'it')` returns an unsubscribe function (typeof === 'function')
    - Test CCD-2: After attach, calling unsubscribe removes the message listener (verified by ws._messageListenerCount() or similar mock introspection)
    - Test CCD-3: Posting a valid conc.conflict envelope via ws.fireMessage → layerManager.bundle called with [{ type:'mount', z:Z2_OVERLAY, layer:<ConcentrationDropModalPanel instance> }]
    - Test CCD-4: After CCD-3, the panel constructor received the session_id from the inbound envelope verbatim (verified via panel.sessionId getter OR by spying on the constructor)
    - Test CCD-5 (envelope rejection): post a non-envelope message (e.g., random string) → handler swallows, layerManager.bundle NOT called, console.warn called once with 'envelope rejected'
    - Test CCD-6 (wrong-type rejection): post a valid EnvelopeSchema envelope with type='other.event' → handler returns early, layerManager.bundle NOT called, NO console.warn (silent — not for us)
    - Test CCD-7 (payload rejection): post a conc.conflict envelope with malformed payload (e.g., effectId: '') → ConcConflictPayloadSchema.safeParse rejects → layerManager.bundle NOT called, console.warn called once with 'payload rejected'
    - Test CCD-8 (modal onClose triggers destroy bundle): post valid conflict → modal mounted; invoke the onClose callback (via ws.send('tap') OR direct call) → assert layerManager.bundle called with [{ type:'destroy', z:Z2_OVERLAY }]

    INV-1 fixtures (covered via CDM-13 + ISM-09 in Task 3):
    - Each fixture is 96×24 (verified by awk length check in verify step)
    - Each fixture contains 'CONCENTRATION CONFLICT' title literal
    - Each fixture has the centered panel `┌─[ CONCENTRATION CONFLICT ]──┐` left edge at col 6, right edge at col 65
    - Each fixture preserves the outer `╔═...═╗` frame
  </behavior>
  <action>
    Implement the modal + dispatcher + tests + 2 fixtures atomically.

    **1. NEW file `packages/g2-app/src/panels/concentration-drop-modal.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 8 + 04B-UI-SPEC.md §3.5 + 04B-RESEARCH.md §Approach 6 + ADR-0009 Amendment 1 (panel mounts at z=2; differential demolish rule from Plan 01).

    Imports per <interfaces> shape (including `sessionId: string` constructor param).

    Exports `class ConcentrationDropModalPanel implements OverlayPanel`. Public surface:
    - `readonly id = 'conc-drop-modal'`
    - constructor `(bridge, ws, gestureBus, conflict, locale, sessionId, onClose)` — sessionId is a UUID v4 from the inbound conc.conflict envelope
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
    - onEvent: tap → emit canonical EnvelopeSchema envelope using `this.sessionId` (UUID v4 from constructor) + onClose; double-tap → onClose (no envelope); other → no-op

    Envelope construction (canonical EnvelopeSchema shape — W-4 regression guard):
    ```
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 0,                                // bridge assigns sequence
      ts: Date.now(),
      type: CONC_DROP_CONFIRMED_TYPE,         // 'conc.drop.confirmed'
      session_id: this.sessionId,             // valid UUID v4 — threaded from constructor
      payload: { effectId: this.conflict.effectId },  // CARRIER FIELD IS `payload` NOT `value`
    };
    this.ws.send(JSON.stringify(envelope));
    ```

    The CDM-10 test ASSERTS that `EnvelopeSchema.safeParse(JSON.parse(ws.send.mock.calls[0][0])).success === true` — this is the W-4 NF-1 regression guard at the modal level.

    Width-budget truncation helper (private method):
    ```
    private _truncate(s: string, max: number): string {
      if (s.length <= max) return s;
      return s.slice(0, max - 1) + '…';
    }
    ```

    Apply the truncation to long spell names + verify CDM-7 stress case.

    INV-4 JSDoc on every export. NO `// TODO(ADR-0009): thread real session_id` comment — the sessionId is now a constructor argument (B-4 closure: dispatcher threads it from the inbound envelope).

    **2. NEW file `packages/g2-app/src/panels/conc-conflict-dispatcher.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 8 + 04B-RESEARCH.md §Approach 6 + B-4 closure rationale (Plan 05 ships the dispatcher; Phase 6 wires `attachConcConflictHandler` into boot-engine-core.ts step 11 area — Plan 05 does NOT modify boot-engine-core.ts).

    Imports + exports per <interfaces> block. Implementation per the pseudocode in the <interfaces> block:
    - Subscribes to `ws.addEventListener('message', handler)` where handler:
      1. Parses raw text (string or ArrayBuffer)
      2. `JSON.parse` → unknown
      3. `EnvelopeSchema.safeParse` — trust boundary #1 (outer envelope shape, canonical)
      4. Narrow on `envelope.type === CONC_CONFLICT_TYPE` (silent return if other)
      5. `ConcConflictPayloadSchema.safeParse(envelope.payload)` — trust boundary #2 (inner payload)
      6. Construct ConcentrationDropModalPanel with `envelope.session_id` threaded through
      7. `layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: modal }])` — differential demolish auto-removes z=0.5
    - Returns the unsubscribe fn `() => ws.removeEventListener('message', handler)`
    - The modal's onClose callback (passed to constructor) calls `layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }])` — differential demolish reverses (z=0.5 re-mounts)

    INV-4 JSDoc explaining: (a) attach point is the ws message listener; (b) double trust boundary (EnvelopeSchema then ConcConflictPayloadSchema); (c) session_id threaded from inbound envelope; (d) Phase 6 will call this from boot-engine-core.ts step 11 area.

    **3. NEW file `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts`:**

    Vitest test file with 13 tests (CDM-1..CDM-13). Use vi.fn() for bridge.textContainerUpgrade, ws.send, gestureBus methods, onClose callback.

    For CDM-10: assert `ws.send` called once; then `JSON.parse(ws.send.mock.calls[0][0])` and `expect(EnvelopeSchema.safeParse(parsed).success).toBe(true)` (W-4 round-trip).

    For CDM-13 (matchAsciiFixture): use a `buildConcModalPage(opts: { conflict, locale, statusHudMode? })` helper to compose the full 96×24 page with the panel overlay + Status HUD at right. Path `'../../../../shared-render/src/fixtures/conc-modal.open.it.txt'`.

    **4. NEW file `packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts`:**

    Vitest test file with 8 tests (CCD-1..CCD-8). Use a mock WebSocket (EventEmitter-backed with `fireMessage(payload)` helper). Mock bridge + LayerManager + PanelGestureBus per existing Phase 4a patterns.

    For CCD-3: assert `layerManager.bundle.mock.calls[0][0]` is an array containing exactly one op with `type:'mount'`, `z:ZIndex.Z2_OVERLAY`, `layer instanceof ConcentrationDropModalPanel`.

    For CCD-4: spy on the ConcentrationDropModalPanel constructor (or expose `panel.sessionId` getter for inspection) and assert sessionId matches the inbound envelope's session_id literal.

    For CCD-8: trigger the onClose path (synthesize a 'tap' via gestureBus.publish or call onClose directly via dispatcher introspection) and assert the SECOND bundle call has `type:'destroy', z:ZIndex.Z2_OVERLAY`.

    **5. Two new INV-1 fixtures in `packages/shared-render/src/fixtures/`:**

    Copy from UI-SPEC §5.16 and §5.17:
    - `conc-modal.open.it.txt`: 96×24 — modal open over raster scene; Status HUD card at cols 68-95 preserved in STANDARD mode
    - `conc-modal-on-death-saves.it.txt`: 96×24 — modal open WHILE Status HUD pivoted to death-saves mode (1p/2f); proves CONTEXT Area 8 edge case

    Both fixtures: trailing newline; uniform 96-char width; modal panel frame `┌─[ CONCENTRATION CONFLICT ]──┐` left edge col 6, right `│` col 65, rows 6-17. Verbatim from UI-SPEC.

    Constraints:
    - Modal implements OverlayPanel (isOverlayPanel === true).
    - Width-budgets respected via HUD_WIDTH_BUDGETS lookup (no hardcoded strings duplicated in panel code; uses getLabel or direct HUD_WIDTH_BUDGETS[key][locale] access).
    - `pnpm typecheck && pnpm lint:ci` exit 0.
    - Phase 4b does NOT call effect.delete() (CONC-01 Phase 7 boundary; Plan 05 emits envelope only).
    - The CDM-13 fixture composition helper uses a standard-mode Status HUD for conc-modal.open.it.txt.
    - Phase 4b does NOT modify boot-engine-core.ts to attach the dispatcher — Phase 6 lands that wiring. CCD-1..CCD-8 test the dispatcher in isolation; ISM-10 (Task 3) tests it end-to-end.
    - W-4 regression guard: CDM-10 asserts the modal-emitted envelope passes `EnvelopeSchema.safeParse`; the `EnvelopeSchema` symbol is imported from `@evf/shared-protocol` (canonical name; NOT `WireEnvelopeSchema`).
    - The modal constructor takes `sessionId: string` — the dispatcher passes the inbound envelope's session_id verbatim.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/panels/__tests__/concentration-drop-modal.test.ts src/panels/__tests__/conc-conflict-dispatcher.test.ts && test -f packages/shared-render/src/fixtures/conc-modal.open.it.txt && test -f packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt && awk '{ if (length($0) > 0 && length($0) != 96) { print "FAIL: " FILENAME " row " NR " width " length($0); exit 1 } } END { print "OK" }' packages/shared-render/src/fixtures/conc-modal.open.it.txt packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt && grep -c 'CONCENTRATION CONFLICT' packages/shared-render/src/fixtures/conc-modal.open.it.txt && grep -c 'DEATH SAVES' packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt && grep -c 'export class ConcentrationDropModalPanel' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'implements OverlayPanel' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'CONC_DROP_CONFIRMED_TYPE' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'gestureBus.subscribe' packages/g2-app/src/panels/concentration-drop-modal.ts && grep -c 'export function attachConcConflictHandler' packages/g2-app/src/panels/conc-conflict-dispatcher.ts && grep -c 'EnvelopeSchema' packages/g2-app/src/panels/conc-conflict-dispatcher.ts && grep -c 'ConcConflictPayloadSchema' packages/g2-app/src/panels/conc-conflict-dispatcher.ts && grep -c 'Z2_OVERLAY' packages/g2-app/src/panels/conc-conflict-dispatcher.ts && ! grep -E 'WireEnvelopeSchema|envelope\.value' packages/g2-app/src/panels/concentration-drop-modal.ts packages/g2-app/src/panels/conc-conflict-dispatcher.ts && grep -cE 'CDM-(0[1-9]|1[0-3])' packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts && grep -cE 'CCD-0?[1-8]' packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Two test files green (CDM-1..CDM-13 = 13 modal tests; CCD-1..CCD-8 = 8 dispatcher tests = 21 new tests); ConcentrationDropModalPanel implements OverlayPanel + subscribes to PanelGestureBus + emits conc.drop.confirmed envelope (canonical EnvelopeSchema with `payload` field and threaded sessionId UUID); conc-conflict-dispatcher.ts exports attachConcConflictHandler with double trust boundary (EnvelopeSchema + ConcConflictPayloadSchema); 2 INV-1 fixtures exist with correct content + uniform 96-char width; W-4 regression guard `! grep -E 'WireEnvelopeSchema|envelope\\.value'` succeeds; CDM-10 envelope round-trip test passes; B-4 closure verified via CCD-3 (dispatcher mounts modal on valid conflict envelope); typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 04b-integration-smoke.test.ts — Phase 4b end-to-end smoke (overlay slot + toast survives + death-saves pivot + conc-modal + co-presence + locale stress + dispatcher + W-4 round-trip)</name>
  <read_first>
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (Phase 4a Plan 05 + Plan 02 + Plan 06 integration harness — REFERENCE pattern for the new smoke file)
    - packages/g2-app/src/engine/layer-manager.ts (post-Plans-01 — bundle() with differential demolish + lifecycle hooks)
    - packages/g2-app/src/status-hud/toast-queue-layer.ts (Plan 03 output)
    - packages/g2-app/src/status-hud/status-hud-renderer.ts (Plan 05 Task 1 — setMode death-saves)
    - packages/g2-app/src/status-hud/status-hud-layer.ts (Plan 05 Task 1 — _onDelta pivot trigger)
    - packages/g2-app/src/panels/concentration-drop-modal.ts (Plan 05 Task 2 output)
    - packages/g2-app/src/panels/conc-conflict-dispatcher.ts (Plan 05 Task 2 output)
    - packages/g2-app/src/engine/panel-gesture-bus.ts (Plan 01 output — subscribers for the modal)
    - packages/shared-protocol/src/envelope.ts (CANONICAL EnvelopeSchema — Plan 05 uses for round-trip validation in ISM-05)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-VALIDATION.md §Stress cases (ST-1..ST-5)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §8 (Visual Stress Cases)
  </read_first>
  <files>packages/g2-app/src/__tests__/04b-integration-smoke.test.ts</files>
  <behavior>
    Integration smoke (NEW file — separate from Phase 4a scene-renderer-smoke):
    - Test ISM-01: mount full Phase 4a layers (z=0 capture stub + z=0.5 idle stub + z=1 StatusHudLayer) + mount z=1.5 ToastQueueLayer → bridge.rebuildPageContainer called for each bundle; layerManager.getCaptureContainerCount() === 1 (z=0 only); container budget OK (no panel_mount_budget_exceeded)
    - Test ISM-02 (overlay mount/unmount): from ISM-01 state, bundle([{mount z=2 ConcDropModal}]) → z=0.5 IS removed from layers map (differential demolish), z=1 status hud preserved, z=1.5 toast preserved, bridge.rebuildPageContainer called exactly once for this bundle; then bundle([{destroy z=2}]) → z=0.5 IS re-mounted (instance equality), bridge.rebuildPageContainer called once more
    - Test ISM-03 (ST-2 toast survives overlay open): enqueue 2 toasts BEFORE modal mount; mount modal; assert toast layer still mounted at z=1.5 (layerManager.getLayer(Z1_5_TOAST) is the same toast layer reference); toast's getVisibleCount === 2 (state preserved through the bundle)
    - Test ISM-04 (ST-3 modal + death-saves co-presence): inject character.delta with {hp:0, death:{success:0,failure:2}} via wsEvents mock → StatusHudLayer pivots to death-saves (renderer.setMode('death-saves') called); THEN mount conc-modal at z=2; assert renderer.setMode('death-saves') is STILL the current mode (NOT reverted to 'standard'); layerManager.getLayer(Z1_STATUS_HUD) is unchanged
    - Test ISM-05 (conc-modal Y emission + W-4 EnvelopeSchema round-trip closure): mount modal with valid UUID v4 sessionId; publish({kind:'tap'}) via gestureBus; assert ws.send called with envelope JSON.stringify matching `{type:'conc.drop.confirmed', payload:{effectId:'<original>'}}`. Extract `ws.send.mock.calls[0][0]`, `JSON.parse(...)`, call `EnvelopeSchema.safeParse(parsed)`, assert `.success === true` (POSITIVE round-trip — canonical envelope shape). Additionally: construct a synthetic envelope WITHOUT session_id (`const malformed = { proto:'evf-v1', seq:0, ts:Date.now(), type:'conc.conflict', payload:{} }`), call `EnvelopeSchema.safeParse(malformed)`, assert `.success === false` (NEGATIVE — W-4 NF-1 regression guard proving session_id is required).
    - Test ISM-06 (conc-modal N cancel): mount modal; publish({kind:'double-tap'}); assert ws.send NOT called with conc.drop.confirmed; onClose callback was invoked
    - Test ISM-07 (panel-gesture-bus subscriber cleanup): mount modal (gestureBus.size() === 1); destroy modal via bundle([{destroy z=2}]) → modal.onUnmount() called → gestureBus.size() === 0 (T-4b-01-03 + T-4b-05-02 mitigation verified end-to-end)
    - Test ISM-08 (ST-4 locale IT longest names): construct conflict with IT 'Cura Ferite di Massa' as both currentConcentrationName + newSpellName; mount modal with locale='it'; assert the rendered button content fits within the 24-char y_button budget (truncated to 'Drop & cast Cura Ferite…' or similar via the conc_modal_y_button_template[it]); panel frame still aligns at col 6 + col 65
    - Test ISM-09 (matchAsciiFixture conc-modal-on-death-saves.it.txt): set up the death-saves pivot via character.delta; mount conc-modal; compose the full 96×24 page; matchAsciiFixture passes
    - Test ISM-10 (B-4 closure — conc-conflict-dispatcher end-to-end): from ISM-01 state, call `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, 'it')`; `ws.fireMessage` a valid `conc.conflict` envelope `{proto:'evf-v1', seq:1, ts:Date.now(), type:'conc.conflict', session_id:'11111111-1111-4111-8111-111111111111', payload:{effectId:'eff1', currentConcentrationName:'Hold Person', newSpellName:'Bless'}}`; assert layerManager.getLayer(Z2_OVERLAY) instanceof ConcentrationDropModalPanel; assert the modal's sessionId === '11111111-1111-4111-8111-111111111111' (threaded from envelope). Negative case: ws.fireMessage a malformed conc.conflict (effectId: '') → modal NOT mounted; getLayer(Z2_OVERLAY) === undefined.
  </behavior>
  <action>
    NEW file `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts`.

    File starts with a comprehensive describe block: `describe('Phase 4b integration smoke (ISM-*) — overlay slot + toast + death-saves + conc-modal + dispatcher + W-4 round-trip', () => { ... })`.

    Test harness:
    - Mock EvenAppBridge with vi.fn() stubs for textContainerUpgrade + rebuildPageContainer + setLocalStorage + getLocalStorage
    - Mock WebSocket (EventEmitter-backed with fireMessage helper) — used by both ws.send assertions AND the dispatcher's ws.addEventListener subscription
    - Mock wsEvents bus (the one StatusHudLayer subscribes to)
    - Real LayerManager (from Plan 01) + real ToastQueueLayer (from Plan 03) + real ConcentrationDropModalPanel (from Plan 05 Task 2) + real attachConcConflictHandler (from Plan 05 Task 2)
    - PanelGestureBus instance shared between modal + test (test publishes to simulate R1 gestures)
    - StatusHudLayer + StatusHudRenderer (real) using the wsEvents mock as the delta source
    - EnvelopeSchema imported from '@evf/shared-protocol' for ISM-05 round-trip + ISM-10 negative case construction

    Test setup (beforeEach): construct layers; mount Phase 4a-equivalent set (z=0 stub-capture + z=0.5 stub-idle + z=1 real status hud); the layerManager is the system under test.

    Implement ISM-01..ISM-10 with the assertions described in <behavior>.

    For ISM-04 + ISM-09: inject the character.delta via the wsEvents mock's stashed callback (Phase 4a pattern). Snapshot must include the `death` field per Plan 06 atomic extension.

    For ISM-05: import `EnvelopeSchema` from `@evf/shared-protocol`. After `gestureBus.publish({kind:'tap'})`, get `const sent = JSON.parse(ws.send.mock.calls[0][0] as string)`; assert `EnvelopeSchema.safeParse(sent).success === true`. Then build a malformed envelope (omit session_id) and assert `EnvelopeSchema.safeParse(malformed).success === false`. This is the W-4 NF-1 regression guard at the integration level.

    For ISM-08: assert the rendered modal content does not include a button row character at col 66+ that breaks the panel frame (i.e., the right `│` border at col 65 is preserved).

    For ISM-09: helper `buildConcModalDeathSavesPage(opts)` composes the page from real layer render outputs. Path `'../../../shared-render/src/fixtures/conc-modal-on-death-saves.it.txt'` (3× `../` from `packages/g2-app/src/__tests__/`).

    For ISM-10: `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, 'it')`; `ws.fireMessage(JSON.stringify(validEnvelope))`; assert mount; `ws.fireMessage(JSON.stringify(malformedEnvelope))` (effectId empty) AFTER unmounting the first modal; assert no second mount.

    Constraints:
    - Real layer instances (not just mocks) — proves integration end-to-end
    - The integration tests MUST NOT regress with Phase 4a scene-renderer-smoke SR-1..SR-13 (those are in a separate file; this is a new file)
    - INV-4 JSDoc on harness helpers + test descriptions
    - `pnpm typecheck && pnpm lint:ci` exit 0
    - The full smoke test suite (all 10 ISM cases) must complete within a Vitest default timeout (5s per test default; fake timers via vi.useFakeTimers may be needed for ISM-03 if dwell-cycle timing matters)
    - Test discriminators 'ISM-01' through 'ISM-10' must appear in it() names
    - W-4 regression guard: ISM-05 positive + negative envelope assertions prove canonical EnvelopeSchema usage (not WireEnvelopeSchema; `payload` field; session_id required)
    - B-4 closure: ISM-10 proves the dispatcher mounts the modal end-to-end from a synthetic ws.fireMessage AND rejects malformed payloads
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/__tests__/04b-integration-smoke.test.ts && grep -c 'Phase 4b integration smoke' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -cE 'ISM-(0[1-9]|10)' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'ConcentrationDropModalPanel' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'ToastQueueLayer' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'PanelGestureBus' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'attachConcConflictHandler' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c 'EnvelopeSchema.safeParse' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && grep -c "death" packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && ! grep -E 'WireEnvelopeSchema|envelope\.value' packages/g2-app/src/__tests__/04b-integration-smoke.test.ts && pnpm typecheck && pnpm lint:ci && pnpm test</automated>
  </verify>
  <done>
    04b-integration-smoke.test.ts green with 10 ISM tests; all Phase 4b layer composition end-to-end behaviors verified (overlay mount/unmount + differential demolish + toast survives + death-saves pivot + conc-modal Y/N + gesture-bus cleanup + locale stress + matchAsciiFixture for co-presence + dispatcher B-4 closure + W-4 EnvelopeSchema round-trip); pnpm test (workspace-wide) exits 0 (catches any cross-package regression from the schema extension in Plan 06); typecheck + lint:ci exit 0; W-4 regression guard succeeds (no WireEnvelopeSchema OR envelope.value references).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ConcConflictPayloadSchema receives untrusted WS payload from bridge | safeParse at WS boundary in conc-conflict-dispatcher.ts (Plan 05 ships); double trust boundary (EnvelopeSchema outer + ConcConflictPayloadSchema inner); failure → log + ignore |
| panel-gesture-bus subscriber lifecycle | Modal's onUnmount MUST unsubscribe — verified end-to-end in ISM-07 |
| Conc-modal Y envelope construction | Uses canonical EnvelopeSchema fields (`payload`, `session_id: uuid`); CDM-10 + ISM-05 round-trip tests prove the structure |
| Conc-modal Y-gesture authorisation | Phase 4b accepts in-process gesture-bus as trusted; Phase 7 write path validates server-side |
| Death-saves data displays PC HP=0 | Player's own data; same disclosure surface as Status HUD |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-05-01 | T | ConcConflictPayloadSchema receives untrusted bridge WS payload | mitigate | conc-conflict-dispatcher.ts double safeParse: EnvelopeSchema first (outer), ConcConflictPayloadSchema second (inner). Failure → log + ignore. CCD-5/6/7 verify rejection paths. |
| T-4b-05-02 | D | panel-gesture-bus subscriber leak from conc-modal | mitigate | ConcentrationDropModalPanel.onUnmount() calls the unsubscribe; ISM-07 asserts post-unmount bus.size() === 0. |
| T-4b-05-03 | T | Conc-modal Y-gesture spoofing | accept | Phase 4b accepts in-process gesture-bus as trusted; Phase 7 write path validates server-side (effect ownership + session_id + bearer token) before effect.delete(). |
| T-4b-05-04 | I | Death-saves HUD displays PC HP=0 state | accept | Player's own data; same disclosure surface as Status HUD. Not a new leak. |
| T-4b-05-05 | T | Conc-modal opens with malformed conflict payload | mitigate | ConcConflictPayloadSchema enforces effectId.min(1), currentConcentrationName.min(1), newSpellName.min(1) via Zod. dispatcher safeParse failure → log + ignore. CCD-7 + ISM-10 negative case verify. |
| T-4b-05-06 | T | Conc-modal Y envelope construction regression (NF-1 class — invented WireEnvelopeSchema or envelope.value) | mitigate | CDM-10 + ISM-05 round-trip tests assert canonical EnvelopeSchema acceptance. Negative ISM-05 case asserts rejection on missing session_id. Grep gate `! grep -E 'WireEnvelopeSchema|envelope\\.value'` in verify steps prevents structural drift. |
| T-4b-05-07 | D | Pivot latch stuck ON when failure===3 (PC dead) | accept | SHL-PIVOT-4 documents the behavior: death-saves mode stays rendered until a future revive event (Phase 7+); not a security or availability issue; informational by design. |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 (status-hud + panels + integration smoke green)
- `pnpm --filter @evf/shared-protocol test --run` exits 0 (Plan 06 ships these; Plan 05 consumes)
- `pnpm test` (workspace-wide) exits 0 — catches any cross-package break
- `pnpm typecheck && pnpm lint:ci` exit 0
- ConcentrationDropModalPanel passes isOverlayPanel guard
- conc-conflict-dispatcher.ts is the production code path mounting the modal on bridge-emitted conc.conflict (B-4 closure)
- conc.drop.confirmed envelope is the SOLE write-side bridge call from the modal (no effect.delete in Phase 4b code) AND its structure passes `EnvelopeSchema.safeParse` (W-4 closure)
- 04b-integration-smoke.test.ts proves Phase 4b layer composition end-to-end including dispatcher + W-4 round-trip
- W-4 regression guard: `! grep -E 'WireEnvelopeSchema|envelope\.value'` succeeds across modal + dispatcher + smoke files
- All 5 phase requirements addressed across plans: MAP-05 (Plan 01 + Plan 02), TOAST-01 (Plan 03), BOOT-01 (Plan 04), DEATH-01 (Plan 05 Task 1), CONC-01 (Plan 05 Task 2 + Task 3) + schema extension (Plan 06)
</verification>

<success_criteria>
Plan 05 closes when:
- DEATH-01 fully addressed software-side: HP=0 + death.failure<3 → status HUD pivots to 3-strike tracker per UI-SPEC §3.4; latched until HP>0 (recovery) or PC dead (Phase 7+ revive event)
- CONC-01 fully addressed software-side: ConcentrationDropModalPanel mounts at z=2 via OverlayPanel API; user [Y] gesture → conc.drop.confirmed envelope emitted via ws.send (canonical EnvelopeSchema shape with `payload` field and threaded session_id UUID); Phase 4b does NOT call effect.delete (Phase 7 write path boundary)
- B-4 closure: conc-conflict-dispatcher.ts is the production code path that mounts the modal on bridge-emitted `conc.conflict` envelopes; double trust boundary (EnvelopeSchema + ConcConflictPayloadSchema); session_id threaded from inbound envelope. ISM-10 proves end-to-end via synthetic ws.fireMessage.
- W-4 closure: CDM-10 + ISM-05 round-trip tests prove the modal-emitted envelope passes `EnvelopeSchema.safeParse`; negative case proves session_id is required. Grep gate `! grep -E 'WireEnvelopeSchema|envelope\\.value'` succeeds — no regression to invented schema names.
- 4 new INV-1 fixtures committed (status-hud.death-saves-initial.it.txt + status-hud.death-saves-mid.it.txt + conc-modal.open.it.txt + conc-modal-on-death-saves.it.txt)
- 04b-integration-smoke.test.ts proves Phase 4b layer composition end-to-end across overlay slot + toast + death-saves pivot + conc-modal + co-presence + locale stress + dispatcher + envelope round-trip
- Hardware verification (death-saves pivot triggers on real Foundry HP=0 + conc-modal renders correctly on real G2 + Phase 6 wires attachConcConflictHandler into boot-engine-core.ts) deferred to Phase 6 + ADR-0005 Branch A human_needed gate per VALIDATION §Manual-Only entries
- Plan 05 task count is 3 (within scope-sanity target after B-5 split — schema work moved to Plan 06)
- Phase 4b is COMPLETE: every of the 5 requirement IDs (MAP-05, TOAST-01, BOOT-01, DEATH-01, CONC-01) has at least one Plan delivering software-side closure; hardware-side closure carried on Phase 4a's ADR-0005 Branch A
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-05-SUMMARY.md` capturing:
- StatusHudRenderer setMode + renderDeathSaves implementation details (28×21 grid; ◯/● glyphs; locale-aware labels)
- StatusHudLayer pivotLatched semantics (transition-driven, not per-delta)
- ConcentrationDropModalPanel container strategy (3 containers vs 1 with newlines — pick + rationale)
- ConcentrationDropModalPanel constructor signature including `sessionId: string` UUID — threaded from dispatcher (NOT a TODO anymore)
- conc-conflict-dispatcher.ts (NEW) double trust boundary implementation: EnvelopeSchema first, ConcConflictPayloadSchema second
- Width-budget truncation strategy for long IT spell names (ST-4 stress case verified)
- W-4 closure: CDM-10 + ISM-05 round-trip test results; grep gate `! grep -E 'WireEnvelopeSchema|envelope\\.value'` outcome
- B-4 closure: ISM-10 end-to-end dispatcher test results; Phase 6 wiring hint to call `attachConcConflictHandler` from boot-engine-core.ts step 11 area
- B-5 closure: task count 3 (within target after schema split to Plan 06)
- Test counts: 15 new in status-hud-renderer.test.ts + status-hud-layer.test.ts + 13 in concentration-drop-modal.test.ts + 8 in conc-conflict-dispatcher.test.ts + 10 in 04b-integration-smoke.test.ts = ~46 new tests
- Phase 4b global closure signal: all 5 REQ-IDs (MAP-05/TOAST-01/BOOT-01/DEATH-01/CONC-01) software-side green; hardware-side carried on ADR-0005 Branch A human_needed (Phase 4a precedent)
- ROADMAP.md update: Phase 4b plans 1/N → 6/6 ready for phase-checker verification
</output>
</content>
</invoke>