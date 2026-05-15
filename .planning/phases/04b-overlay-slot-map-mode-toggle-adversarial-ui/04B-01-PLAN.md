---
phase: 4b
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/g2-app/src/engine/layer-types.ts
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/engine/overlay-panel.ts
  - packages/g2-app/src/engine/panel-gesture-bus.ts
  - packages/g2-app/src/engine/__tests__/overlay-panel.test.ts
  - packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts
  - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
  - packages/g2-app/src/status-hud/i18n-budgets.ts
  - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
  - docs/architecture/0009-layer-manager-contract.md
autonomous: true
requirements: [MAP-05]
subsystem: g2-app
user_setup: []
tags: [g2-app, engine, overlay, panel-api, adr, wave-0, container-budget, foundation, i18n-budgets]
must_haves:
  truths:
    - "ZIndex enum extended with Z1_5_TOAST = 1.5 (between Z1_STATUS_HUD = 1 and Z2_OVERLAY = 2) — fractional precedent matches Z0_5_IDLE_INFILL = 0.5"
    - "OverlayPanel extends Layer interface adds onMount(): Promise<void> / onUnmount(): Promise<void> / onEvent(gesture: R1Gesture): void — Phase 5 panel contract"
    - "R1Gesture type union ships as { kind: 'tap' } | { kind: 'scroll', direction: 'up'|'down' } | { kind: 'long-press' } | { kind: 'double-tap' } — string-literal-discriminated"
    - "LayerManager.bundle() applies the DIFFERENTIAL DEMOLISH RULE: a mount of z=2 (Z2_OVERLAY) automatically inserts an implicit destroy(Z0_5_IDLE_INFILL) op when z=0.5 is currently mounted; the implicit destroy is reversed on z=2 unmount (z=0.5 re-mounts in same flush) — verified by unit test"
    - "z=1.5 (Z1_5_TOAST) is NOT demolished on z=2 mount; the Fireball + 8 saves stress case in Plan 03 depends on this behaviour"
    - "OverlayPanel instances receive onMount() AFTER LayerManager.bundle() places them in the layer map and BEFORE the rebuildPageContainer flush; onUnmount() runs BEFORE destroy()"
    - "panel-gesture-bus.ts ships an in-process publish/subscribe bus (publish(gesture) / subscribe(fn): unsubscribe) — Phase 6 R1 source provider feeds it; Phase 4b conc-modal subscribes via its onMount()"
    - "ADR-0009 Amendment 1 (status: accepted, dated 2026-05-15) records the differential demolish rule, the in-process gesture-bus routing decision, and the closed-state vs open-state container budget table (4 image + ≤8 text invariant preserved)"
    - "LayerManager._assertContainerBudget() private method validates cumulative containerTotalNum ≤ 12 at bundle flush; failure throws LayerManagerError('panel_mount_budget_exceeded') (new code added to LayerManagerErrorCode union)"
    - "i18n-budgets.ts extended with ALL Phase 4b new keys atomically in Wave 0: 2 toast keys (consumed by Plan 03) + 17 boot-error keys (consumed by Plan 04) + 6 conc-modal keys (consumed by Plan 05) + 3 death-saves keys (consumed by Plan 05) = 28 new keys. Centralising the i18n extension in Wave 0 prevents same-wave file-overlap conflicts between Plans 03 and 04 (both would otherwise modify this file in Wave 2)."
  artifacts:
    - path: "packages/g2-app/src/engine/layer-types.ts"
      provides: "Extended ZIndex enum + OverlayPanel interface + R1Gesture union + LayerManagerErrorCode adds 'panel_mount_budget_exceeded'"
      exports: ["ZIndex", "Layer", "OverlayPanel", "R1Gesture", "LayerOp", "LayerManagerError", "LayerManagerErrorCode"]
      contains: "Z1_5_TOAST = 1.5"
    - path: "packages/g2-app/src/engine/overlay-panel.ts"
      provides: "isOverlayPanel(layer) type guard for runtime detection by LayerManager — type guard pattern means panels don't need a base class, only the OverlayPanel interface"
      exports: ["isOverlayPanel"]
    - path: "packages/g2-app/src/engine/panel-gesture-bus.ts"
      provides: "PanelGestureBus class — in-process pub/sub for R1Gesture; publish(gesture) fans out to all subscribers; subscribe(fn) returns unsubscribe; no buffering (gestures fired during mount() are dropped per Open Question 2 resolution)"
      exports: ["PanelGestureBus"]
    - path: "packages/g2-app/src/engine/layer-manager.ts"
      provides: "LayerManager.bundle() extended with: (a) implicit destroy(Z0_5_IDLE_INFILL) when mounting Z2_OVERLAY; (b) implicit mount(Z0_5_IDLE_INFILL, prevInfillLayer) when destroying Z2_OVERLAY; (c) onMount()/onUnmount() lifecycle invocation for OverlayPanel; (d) _assertContainerBudget() runs after _assertCaptureInvariant"
      exports: ["LayerManager", "MapMode"]
    - path: "packages/g2-app/src/status-hud/i18n-budgets.ts"
      provides: "ALL Phase 4b new keys appended in Wave 0 atomically (28 keys total: 2 toast + 17 boot-error + 6 conc-modal + 3 death-saves). Each key copied VERBATIM from UI-SPEC §4.1-§4.4. `as const satisfies Record<string, WidthBudgetRow>` gate continues to hold."
      contains: "boot_error_title_handshake|toast_squash_badge_template|conc_modal_title|death_saves_title"
    - path: "docs/architecture/0009-layer-manager-contract.md"
      provides: "Amendment 1 filled with differential demolish rule + in-process gesture-bus rationale + container budget audit (closed + open state tables)"
      contains: "Amendment 1 — Phase 4b composition rules"
  key_links:
    - from: "packages/g2-app/src/engine/layer-manager.ts"
      to: "packages/g2-app/src/engine/layer-types.ts"
      via: "imports OverlayPanel + R1Gesture + LayerManagerErrorCode; uses isOverlayPanel guard"
      pattern: "import.*OverlayPanel|isOverlayPanel"
    - from: "packages/g2-app/src/engine/layer-manager.ts"
      to: "packages/g2-app/src/engine/overlay-panel.ts"
      via: "isOverlayPanel(layer) type guard before invoking onMount() / onUnmount()"
      pattern: "isOverlayPanel"
    - from: "packages/g2-app/src/engine/__tests__/layer-manager.test.ts"
      to: "packages/g2-app/src/engine/layer-manager.ts"
      via: "Wave-0 boundary tests: differential demolish, container budget, panel lifecycle"
      pattern: "differential.*demolish|container.*budget|onMount"
    - from: "docs/architecture/0009-layer-manager-contract.md"
      to: "packages/g2-app/src/engine/layer-manager.ts"
      via: "Amendment 1 documents the differential demolish rule that LayerManager.bundle() implements"
      pattern: "Amendment 1"
    - from: "packages/g2-app/src/status-hud/i18n-budgets.ts"
      to: "Plans 03/04/05 consumer source files"
      via: "Wave 0 lands all 28 new HUD_WIDTH_BUDGETS keys; downstream plans READ these keys (do not modify the table)"
      pattern: "HUD_WIDTH_BUDGETS"

threat_model:
  trust_boundaries:
    - description: "External callers invoke LayerManager.bundle() with arbitrary LayerOp arrays — bundle must enforce capability gate + capture invariant + container budget BEFORE flushing to bridge"
    - description: "OverlayPanel implementations (Phase 5+) provide their own onMount/onUnmount/onEvent — LayerManager treats them as untrusted (must not deadlock the bundle if onMount rejects)"
    - description: "i18n-budgets.ts table is the canonical width-budget contract — values are static `as const`, no runtime mutation, no external strings"
  threats:
    - id: "T-4b-01-01"
      category: "T"
      component: "LayerManager.bundle() applying user-supplied LayerOp array"
      disposition: "mitigate"
      mitigation_plan: "Capability gate, capture invariant, AND new container budget assertion run before rebuildPageContainer flush; on any throw the bridge is never called (no partial flush)"
    - id: "T-4b-01-02"
      category: "D"
      component: "OverlayPanel.onMount() Promise rejection"
      disposition: "mitigate"
      mitigation_plan: "bundle() awaits onMount() with a try/catch; rejection logged + bundle aborted (panel left in layers map; caller must destroy + retry); no rebuildPageContainer call on rejection. Verified by unit test."
    - id: "T-4b-01-03"
      category: "D"
      component: "PanelGestureBus subscriber leak"
      disposition: "mitigate"
      mitigation_plan: "subscribe() returns an unsubscribe function; OverlayPanel.onUnmount() MUST call it (documented in OverlayPanel JSDoc + asserted in conc-modal test in Plan 05). Bus exposes a size() for tests to verify zero subscribers post-teardown."
    - id: "T-4b-01-04"
      category: "T"
      component: "Differential demolish rule incorrectly demolishes z=1.5 toast on z=2 mount"
      disposition: "mitigate"
      mitigation_plan: "Explicit unit test (LMT-DD-04): bundle [mount z=1.5, mount z=2] then [destroy z=2] proves z=1.5 layer instance is the SAME object pre/post (not re-mounted, not lost). Plan 03 integration smoke ratifies."
    - id: "T-4b-01-05"
      category: "T"
      component: "i18n-budgets table content (28 new keys land in Wave 0)"
      disposition: "mitigate"
      mitigation_plan: "All values copied VERBATIM from UI-SPEC §4.1-§4.4 (UI-SPEC is the design contract). `as const satisfies Record<string, WidthBudgetRow>` gate fails the build if any key violates the structural shape. assertWithinBudget runtime guard warns on actual content overflow at render time (downstream plans test their own render paths)."
---

<objective>
Wave-0 foundation for Phase 4b: extend Phase 4a's LayerManager + Layer machinery with the **Panel API contract** (OverlayPanel extends Layer + 3 lifecycle methods + R1Gesture union), the **z=1.5 fractional zindex** (Z1_5_TOAST), the **differential demolish rule** (z=2 mount auto-demolishes z=0.5 but preserves z=1.5), the **in-process panel-gesture-bus**, and the **container budget assertion** that closes the no-demolish-z=0.5 overflow (Q1 audit). Fill ADR-0009 Amendment 1 with the rationale + budget tables. Land ALL Phase 4b i18n-budgets keys (28 keys total) in this Wave 0 commit so Plans 03/04/05 are READ-ONLY consumers of the budget table (no same-wave file conflicts).

Purpose: This plan is the contract Plan 02 (map mode toggle) + Plan 03 (toast queue) + Plan 04 (boot error) + Plan 05 (death-saves + conc modal) all build on. The differential demolish rule + container budget assertion are the SINGLE non-negotiable architectural decision of Phase 4b — encoded in code (LayerManager) and in documentation (ADR-0009 Amendment 1) in the same atomic commit boundary. The i18n-budgets extension centralisation prevents Wave-2 parallel-execution file conflicts between Plans 03 and 04.

Output: 1 source module extended (layer-types.ts) + 1 module modified (layer-manager.ts) + 2 new source modules (overlay-panel.ts + panel-gesture-bus.ts) + 1 module extended with 28 new keys (i18n-budgets.ts) + 4 test files (overlay-panel.test.ts new, panel-gesture-bus.test.ts new, layer-manager.test.ts extended, i18n-budgets.test.ts extended) + 1 ADR amendment (0009 Amendment 1). All exports JSDoc'd. `pnpm typecheck && pnpm lint:ci && pnpm --filter @evf/g2-app test --run` exit 0.
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
@.planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-04-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-05-SUMMARY.md
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/engine/layer-manager.ts
@packages/g2-app/src/engine/__tests__/layer-manager.test.ts
@packages/g2-app/src/status-hud/idle-infill-layer.ts
@packages/g2-app/src/status-hud/i18n-budgets.ts
@packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
@docs/architecture/0001-layered-ui-model.md
@docs/architecture/0009-layer-manager-contract.md

<interfaces>
<!-- Key types this plan extends and exposes. Downstream plans (02-05) import these. -->

From packages/g2-app/src/engine/layer-types.ts (BEFORE Plan 01):
- enum ZIndex { Z0_MAP = 0, Z0_5_IDLE_INFILL = 0.5, Z1_STATUS_HUD = 1, Z2_OVERLAY = 2 }
- interface Layer { readonly id: string; draw(): Promise<void>; destroy(): void; getCaptureContainer?(): string }
- type LayerOp = { type: 'mount', z: ZIndex, layer: Layer, requiredCaps?: ReadonlyArray<ServerCap> } | { type: 'destroy', z: ZIndex }
- type LayerManagerErrorCode = 'capture_invariant_violated' | 'capability_gate_denied' | 'z_already_occupied' | 'z_not_mounted'
- class LayerManagerError extends Error

From packages/g2-app/src/engine/layer-manager.ts (BEFORE Plan 01):
- class LayerManager (constructor(bridge: EvenAppBridge); setNegotiatedCaps; mount(z, layer, requiredCaps); destroy(z); async bundle(ops); setMapMode; getMapMode; getCaptureContainerCount; private _assertCaptureInvariant; private async _flushPage)

From packages/g2-app/src/status-hud/i18n-budgets.ts (BEFORE Plan 01):
- export interface WidthBudgetRow { it: string; en: string; de: string; max: number }
- export const HUD_WIDTH_BUDGETS = { ... } as const satisfies Record<string, WidthBudgetRow>   // 9 Phase 4a keys
- export function assertWithinBudget(value: string, field: keyof typeof HUD_WIDTH_BUDGETS): void
- export function getLabel(field: keyof typeof HUD_WIDTH_BUDGETS, locale: 'it'|'en'|'de'): string

AFTER Plan 01 (new exports / contracts that Plans 02-05 import):
- enum ZIndex { Z0_MAP = 0, Z0_5_IDLE_INFILL = 0.5, Z1_STATUS_HUD = 1, Z1_5_TOAST = 1.5, Z2_OVERLAY = 2 }   // Z1_5_TOAST ADDED
- type R1Gesture =
    | { readonly kind: 'tap' }
    | { readonly kind: 'scroll'; readonly direction: 'up' | 'down' }
    | { readonly kind: 'long-press' }
    | { readonly kind: 'double-tap' }
- interface Layer with optional getContainerCount?(): { image: number; text: number }   // Strategy A from <decisions>
- interface OverlayPanel extends Layer { onMount(): Promise<void>; onUnmount(): Promise<void>; onEvent(gesture: R1Gesture): void }
- function isOverlayPanel(layer: Layer): layer is OverlayPanel   // runtime type guard (from overlay-panel.ts)
- class PanelGestureBus { publish(gesture: R1Gesture): void; subscribe(fn: (gesture: R1Gesture) => void): () => void; size(): number }   // (from panel-gesture-bus.ts)
- type LayerManagerErrorCode adds 'panel_mount_budget_exceeded'
- HUD_WIDTH_BUDGETS extended with 28 new keys (Plans 03/04/05 are READ-ONLY consumers)

LayerManager.bundle() new behaviour (Plan 01 spec):
  1. For each LayerOp in input order: if op.type === 'mount' && op.z === Z2_OVERLAY && this.layers.has(Z0_5_IDLE_INFILL): prepend an IMPLICIT { type: 'destroy', z: Z0_5_IDLE_INFILL } op to the effective op list. Stash the demolished layer instance in this._suspendedZ05 so a future destroy(z=2) can re-mount it.
  2. For each LayerOp in input order: if op.type === 'destroy' && op.z === Z2_OVERLAY && this._suspendedZ05 !== null: append an IMPLICIT { type: 'mount', z: Z0_5_IDLE_INFILL, layer: this._suspendedZ05 } op. Clear the stash.
  3. After all ops applied: invoke onUnmount() for OverlayPanel instances being destroyed; invoke onMount() for OverlayPanel instances being mounted; await both in op-order.
  4. Run _assertCaptureInvariant() then _assertContainerBudget() then await _flushPage().

Container budget audit (verbatim from 04B-RESEARCH.md §Q1 — Plan 01 ratifies these tables in ADR-0009 Amendment 1):
  CLOSED STATE (no overlay):
    z=0 MapBaseLayer raster = 4 image + 1 capture text = 5; glyph = 0 image + 2 text = 2
    z=0.5 IdleInfillLayer raster = 3 text; glyph = 2 text
    z=1 StatusHudLayer = 1 text
    z=1.5 ToastQueueLayer (Plan 03) = 1 text (newline-separated 2-row block per UI-SPEC §3.2 + §7)
    Page total raster: 4 image + 6 text = 10 (≤ 4+8 cap, 2 text slots free)
    Page total glyph: 0 image + 6 text = 6 (well under cap)
  OPEN STATE (z=2 overlay mounted, z=0.5 demolished per differential rule):
    z=0 MapBaseLayer (unchanged from closed state)
    z=1 StatusHudLayer = 1 text
    z=1.5 ToastQueueLayer = 1 text
    z=2 OverlayPanel = ≤ 3 text/list (per UI-SPEC §7 ConcDropModalPanel budget; Phase 5 panels MUST respect this cap)
    Page total raster: 4 image + 1 + 1 + 1 + 3 = 4 image + 6 text = 10 (at most 12; 2 text slots free)
    Page total glyph: 0 image + 2 + 1 + 1 + 3 = 7 (well under cap)
  Verdict: differential demolish rule keeps the page within budget in every scenario. Documented in ADR-0009 Amendment 1.

R1Gesture stub semantics for Phase 4b (Phase 6 refines):
  - kind: 'tap'         → maps to SDK CLICK_EVENT             (Plan 05 conc-modal: [Y] confirm button)
  - kind: 'double-tap'  → maps to SDK DOUBLE_CLICK_EVENT      (Plan 05 conc-modal: [N] cancel button)
  - kind: 'scroll'      → maps to SDK SCROLL_TOP/BOTTOM_EVENT (Phase 6 ratifies)
  - kind: 'long-press'  → NOT in canonical SDK enum; Phase 6 derives from CLICK_EVENT timing (Phase 4b stubs the literal for forward compat)

i18n-budgets extension table (28 new keys appended atomically in Wave 0 per UI-SPEC §4):

  §4.1 Death-saves pivot (3 keys, consumed by Plan 05):
    | death_saves_title         | 'DEATH SAVES' | 'DEATH SAVES' | 'RETTUNG GG. TOD' | 16 |
    | death_saves_passes_label  | 'Riusciti'    | 'Passes'      | 'Erfolge'         | 8  |
    | death_saves_fails_label   | 'Falliti'     | 'Fails'       | 'Misserfolge'     | 11 |

  §4.2 Toast queue (2 keys, consumed by Plan 03):
    | toast_squash_badge_template | '[+{n}]' | '[+{n}]' | '[+{n}]' | 5  |
    | toast_row_padding_target    | ''       | ''       | ''       | 42 |

  §4.3 Boot error UI (17 keys, consumed by Plan 04 — verbatim from UI-SPEC §4.3):
    | boot_error_title_handshake  | 'HANDSHAKE FALLITO'        | 'HANDSHAKE FAILED'   | 'HANDSHAKE FEHLGESCHLAGEN'    | 24 |
    | boot_error_title_version    | 'VERSIONE INCOMPATIBILE'   | 'VERSION MISMATCH'   | 'VERSION INKOMPATIBEL'        | 24 |
    | boot_error_title_no_char    | 'NESSUN PERSONAGGIO'       | 'NO CHARACTER'       | 'KEIN CHARAKTER'              | 24 |
    | boot_error_title_bridge     | 'BRIDGE NON RAGGIUNGIBILE' | 'BRIDGE UNREACHABLE' | 'BRIDGE NICHT ERREICHBAR'     | 24 |
    | boot_error_title_token      | 'TOKEN SCADUTO'            | 'TOKEN EXPIRED'      | 'TOKEN ABGELAUFEN'            | 24 |
    | boot_error_hint_handshake_1 | 'Risposta del bridge non valida.'           | 'Bridge response was invalid.'         | 'Bridge-Antwort ungültig.'          | 50 |
    | boot_error_hint_handshake_2 | 'Verifica versione del modulo.'             | 'Check module version.'                 | 'Modulversion prüfen.'              | 50 |
    | boot_error_hint_version_1   | 'Il bridge parla un protocollo diverso.'    | 'Bridge speaks a different protocol.'   | 'Bridge nutzt anderes Protokoll.'   | 50 |
    | boot_error_hint_version_2   | 'Aggiorna il modulo Foundry.'               | 'Update the Foundry module.'            | 'Foundry-Modul aktualisieren.'      | 50 |
    | boot_error_hint_no_char_1   | 'Nessun PG assegnato a questo player.'      | 'No PC assigned to this player.'        | 'Kein SC zugewiesen.'               | 50 |
    | boot_error_hint_no_char_2   | 'Assegna un PG da Foundry.'                 | 'Assign one from Foundry.'              | 'Einen SC in Foundry zuweisen.'     | 50 |
    | boot_error_hint_bridge_1    | 'Connessione al bridge fallita.'            | 'Connection to bridge failed.'          | 'Bridge-Verbindung fehlgeschlagen.' | 50 |
    | boot_error_hint_bridge_2    | 'Verifica URL e rete LAN.'                  | 'Check URL and LAN.'                    | 'URL und LAN prüfen.'               | 50 |
    | boot_error_hint_token_1     | 'La sessione è scaduta (24h).'              | 'Session expired (24h).'                | 'Sitzung abgelaufen (24h).'         | 50 |
    | boot_error_hint_token_2     | 'Riaccoppia con un nuovo QR.'               | 'Re-pair via the QR.'                   | 'Neu pairen via QR.'                | 50 |
    | boot_error_close_label      | '[X] Chiudi'                                | '[X] Close'                             | '[X] Schließen'                     | 14 |

  §4.4 Conc-modal (6 keys, consumed by Plan 05):
    | conc_modal_title              | 'CONCENTRATION CONFLICT'        | 'CONCENTRATION CONFLICT'    | 'KONZENTRATIONSKONFLIKT'      | 26 |
    | conc_modal_active_label       | 'Spell attivo:'                 | 'Active spell:'             | 'Aktiver Zauber:'             | 16 |
    | conc_modal_casting_template   | 'Castando {name} verrà rimosso.'| 'Casting {name} will drop it.' | '{name} wirken lässt ihn fallen.' | 50 |
    | conc_modal_confirm_question   | 'Continuare?'                   | 'Continue?'                 | 'Fortfahren?'                 | 12 |
    | conc_modal_y_button_template  | '[Y] Drop & cast {name}'        | '[Y] Drop & cast {name}'    | '[Y] Ablegen & wirken {name}' | 30 |
    | conc_modal_n_button           | '[N] Cancel'                    | '[N] Cancel'                | '[N] Abbrechen'               | 14 |

  Total: 3 + 2 + 17 + 6 = 28 new keys. All appended to HUD_WIDTH_BUDGETS object literal atomically. `as const satisfies Record<string, WidthBudgetRow>` typecheck must pass.

Phase 4a SUMMARYs that informed this plan:
  - 04a-02-SUMMARY: LayerManager.bundle() pattern + capture invariant assertion + atomic flush via single rebuildPageContainer call
  - 04a-04-SUMMARY: i18n-budgets.ts `as const satisfies` gate; the B-1 adversarial typecheck pattern is available for future use if Plan 04 boot-error width budgets need an enforce-at-CI gate; Plan 01 does NOT extend the adversarial test (Plan 04 can add a new adversarial fixture if needed)
  - 04a-05-SUMMARY: ADR-0009 ACCEPTED with Amendment 1 placeholder reserved at line 53 — Plan 01 fills it now
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend layer-types.ts + ship overlay-panel.ts type guard + panel-gesture-bus.ts (Wave-0 type contract foundation)</name>
  <read_first>
    - packages/g2-app/src/engine/layer-types.ts (full file — existing ZIndex enum, Layer interface, LayerOp union, LayerManagerError class; THIS plan extends in place without removing anything)
    - packages/g2-app/src/engine/layer-manager.ts (lines 1-232 — existing bundle() semantics; lifecycle hook injection point is in the for-of loop inside bundle())
    - packages/g2-app/src/status-hud/idle-infill-layer.ts (full file — Plan 01 references this for the z=0.5 layer instance that the differential demolish rule must stash + restore)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 1 + §Q1 (container budget audit + Mitigation A — full text, including the recommendation that LayerManager auto-demolishes z=0.5 on z=2 mount); §Q2 (in-process panel-gesture-bus Pattern B — no WS round-trip in Phase 4b); §Q7 (ADR-0009 Amendment 1 draft text — verbatim recommended Markdown)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 1 (revised differential demolish rule) + §Area 2 (Panel API surface verbatim)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.1 (overlay slot contract) + §7 (container type inventory + cumulative audit)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md (LayerManager.bundle() Phase 4a contract; Plan 01 EXTENDS, does not break)
    - docs/architecture/0001-layered-ui-model.md §Amendment 1 (the rule Phase 4b's Area 1 originally diverged from; differential rule re-converges with z=0.5 demolish only on z=2 mount)
    - docs/architecture/0009-layer-manager-contract.md (full file — Amendment 1 placeholder reserved at line ~53; Task 4 fills it)
  </read_first>
  <files>packages/g2-app/src/engine/layer-types.ts, packages/g2-app/src/engine/overlay-panel.ts, packages/g2-app/src/engine/panel-gesture-bus.ts, packages/g2-app/src/engine/__tests__/overlay-panel.test.ts, packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts</files>
  <behavior>
    layer-types.ts extensions:
    - Test LT-1: ZIndex.Z1_5_TOAST is exactly 1.5 (Number.isFinite + strict equality)
    - Test LT-2: ZIndex value ordering: Z0_MAP < Z0_5_IDLE_INFILL < Z1_STATUS_HUD < Z1_5_TOAST < Z2_OVERLAY (numeric monotonicity)
    - Test LT-3: `LayerManagerErrorCode` union includes the literal 'panel_mount_budget_exceeded' (runtime via `new LayerManagerError('panel_mount_budget_exceeded', 'msg').code === 'panel_mount_budget_exceeded'`)
    - Test LT-4: R1Gesture type is structurally narrow — write a runtime helper `getKind(g: R1Gesture): string` that switches on `g.kind` exhaustively and TS proves exhaustiveness (no default branch needed). Test passes by importing and calling against each variant.
    - Test LT-5: Layer interface now has optional getContainerCount?(): { image: number; text: number }. Test by creating two stub Layer doubles: one with the method returning {image:0,text:1}, one without. Both satisfy `implements Layer` (the second uses interface optionality).

    overlay-panel.ts (runtime type guard):
    - Test OP-1: `isOverlayPanel(layer)` returns true when the object has all of: `id` (string), `draw` (function), `destroy` (function), `onMount` (function), `onUnmount` (function), `onEvent` (function)
    - Test OP-2: `isOverlayPanel(layer)` returns false when ANY of onMount/onUnmount/onEvent is missing (test 3 separate cases: missing onMount, missing onUnmount, missing onEvent)
    - Test OP-3: `isOverlayPanel` narrows the type — `if (isOverlayPanel(layer)) { layer.onMount() }` compiles without `(layer as OverlayPanel)` cast

    panel-gesture-bus.ts:
    - Test PGB-1: `new PanelGestureBus().size() === 0` initially
    - Test PGB-2: `bus.subscribe(fn)` returns a function (the unsubscribe); after subscribe, `bus.size() === 1`
    - Test PGB-3: `bus.publish({ kind: 'tap' })` calls every active subscriber with that gesture exactly once
    - Test PGB-4: Multiple subscribers — publish fans out in subscription order; if a subscriber throws, OTHER subscribers still run (catch + console.warn per-subscriber error isolation)
    - Test PGB-5: Calling the returned unsubscribe fn removes the subscriber; subsequent publish does not call it; `bus.size()` decrements
    - Test PGB-6: Unsubscribe is idempotent — calling it twice does not throw and does not decrement past 0
    - Test PGB-7: Gestures published while no subscribers exist are dropped (no buffering — Open Question 2 resolution from 04B-RESEARCH.md)
  </behavior>
  <action>
    Implement three modules atomically (one commit).

    **1. Extend `packages/g2-app/src/engine/layer-types.ts`:**

    Preserve all existing exports verbatim. Add the following AFTER the existing `Layer` interface (line ~62):

    Append to the `ZIndex` enum: `Z1_5_TOAST = 1.5,` between `Z1_STATUS_HUD = 1,` and `Z2_OVERLAY = 2,`. Update the enum's JSDoc to describe Z1_5_TOAST: "toast queue between Status HUD and overlay slot — survives z=2 overlay open per ADR-0009 Amendment 1".

    Extend the `Layer` interface with `getContainerCount?(): { image: number; text: number }` (optional, like `getCaptureContainer`). JSDoc explains Strategy A from ADR-0009 Amendment 1: layers report their container footprint so LayerManager._assertContainerBudget can sum them; absent method defaults to `{ image: 0, text: 1 }`.

    Add a new `R1Gesture` type union immediately after the `Layer` interface. JSDoc must cite 04B-RESEARCH.md §Q2 and explain the Phase 6 stub status. Use four discriminated variants with `kind` as the discriminator. Mark every field `readonly` (matches Phase 4a `LayerOp` pattern).

    Add a new `OverlayPanel` interface that extends `Layer` and adds `onMount(): Promise<void>`, `onUnmount(): Promise<void>`, `onEvent(gesture: R1Gesture): void`. JSDoc must cite 04b-CONTEXT.md §Area 2 + 04B-RESEARCH.md §Approach 1 and state the Phase 5 contract intent (Phase 5 panels implement verbatim).

    Extend the existing `LayerManagerErrorCode` union: append `| 'panel_mount_budget_exceeded'`. Update the union's JSDoc with a new bullet point explaining the new code (cumulative containerTotalNum > 12 at bundle flush per ADR-0009 Amendment 1).

    INV-4 JSDoc on every new export. No `// TODO` without `(#issue)` or `(ADR-NNNN)` — Phase 6 long-press derivation gets `// TODO(ADR-0009): Phase 6 long-press source channel — derive from CLICK_EVENT timing or use a separate SDK channel (see 04B-RESEARCH §Q2)`.

    **2. New file `packages/g2-app/src/engine/overlay-panel.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 2 + 04B-RESEARCH.md §Approach 1.

    Exports a single function: `isOverlayPanel(layer: Layer): layer is OverlayPanel`. Implementation is a duck-type guard: returns `true` iff `typeof (layer as Partial<OverlayPanel>).onMount === 'function' && typeof (layer as Partial<OverlayPanel>).onUnmount === 'function' && typeof (layer as Partial<OverlayPanel>).onEvent === 'function'`. The type predicate `layer is OverlayPanel` is the load-bearing return.

    Rationale (in JSDoc): No abstract base class. Panels implement the interface directly; LayerManager uses this guard to invoke lifecycle hooks. Matches Phase 4a Layer/getCaptureContainer optionality pattern.

    **3. New file `packages/g2-app/src/engine/panel-gesture-bus.ts`:**

    Module JSDoc cites 04B-RESEARCH.md §Q2 Pattern B (in-process bus, no WS round-trip) and notes the Phase 6 source provider will feed it from `bridge.onEvenHubEvent`.

    Exports `class PanelGestureBus`:
    - private `subscribers: Set<(gesture: R1Gesture) => void> = new Set()`
    - `publish(gesture: R1Gesture): void` — iterate subscribers and invoke each in subscription order; wrap each call in try/catch with `console.warn('[panel-gesture-bus] subscriber threw', err)` so a faulty subscriber does not block others (PGB-4)
    - `subscribe(fn: (gesture: R1Gesture) => void): () => void` — add to set; return an unsubscribe closure that calls `this.subscribers.delete(fn)` (idempotent)
    - `size(): number` — return `this.subscribers.size` (test diagnostic)

    Drop-on-no-subscriber semantics: gestures with `size() === 0` simply iterate an empty set; nothing buffered (per RESEARCH Open Question 2 resolution). Document in JSDoc with a `// TODO(Phase-6): if buffered replay is required for late-mounting panels, refactor to ring buffer; defer until R1 source provider lands` follow-up note.

    **4. Test files:**

    `packages/g2-app/src/engine/__tests__/overlay-panel.test.ts` — 3 tests (OP-1..OP-3). Use ad-hoc minimal `Layer` test doubles. The OP-3 type-narrowing test compiles to a no-op runtime; the proof is `pnpm typecheck` passing.

    `packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts` — 7 tests (PGB-1..PGB-7). Use `vi.fn()` for subscribers. PGB-4 throws inside the first subscriber and asserts the second still got called.

    Layer-types tests can be folded into `layer-manager.test.ts` (Task 2) since they are tightly coupled to the bundle() extension, OR into a new dedicated `layer-types.test.ts`. **Recommendation:** put LT-1..LT-5 into `layer-manager.test.ts` next to the differential-demolish tests (single file, single concern: the engine contract). Document this choice in 04b-01-SUMMARY.md.

    Constraints:
    - INV-4 JSDoc on every public export.
    - No new dependencies (`@evf/shared-protocol` ServerCap import already in layer-types.ts via Phase 4a).
    - `pnpm typecheck && pnpm lint:ci` must exit 0 after this task.
    - Wave-0 boundary discipline: layer-types.ts MUST NOT import from layer-manager.ts (circular). overlay-panel.ts and panel-gesture-bus.ts MUST NOT import from layer-manager.ts either — they are leaf modules.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/overlay-panel.test.ts src/engine/__tests__/panel-gesture-bus.test.ts && grep -c 'Z1_5_TOAST = 1.5' packages/g2-app/src/engine/layer-types.ts && grep -c 'panel_mount_budget_exceeded' packages/g2-app/src/engine/layer-types.ts && grep -c 'interface OverlayPanel extends Layer' packages/g2-app/src/engine/layer-types.ts && grep -c 'getContainerCount' packages/g2-app/src/engine/layer-types.ts && grep -c "kind: 'tap'" packages/g2-app/src/engine/layer-types.ts && grep -c 'isOverlayPanel' packages/g2-app/src/engine/overlay-panel.ts && grep -c 'class PanelGestureBus' packages/g2-app/src/engine/panel-gesture-bus.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Two test files green (10 tests minimum: 3 OP + 7 PGB); layer-types.ts contains `Z1_5_TOAST = 1.5`, `panel_mount_budget_exceeded`, `interface OverlayPanel extends Layer`, `getContainerCount` (optional Layer method), and the `'tap'` R1Gesture variant; overlay-panel.ts exports `isOverlayPanel`; panel-gesture-bus.ts exports `class PanelGestureBus`; `pnpm typecheck` exits 0; `pnpm lint:ci` exits 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend LayerManager.bundle() with differential demolish rule + container budget assertion + OverlayPanel lifecycle invocation</name>
  <read_first>
    - packages/g2-app/src/engine/layer-manager.ts (full file as it stands after Task 1 — note that Task 1 only touched layer-types.ts; Task 2 modifies layer-manager.ts to consume the new types)
    - packages/g2-app/src/engine/overlay-panel.ts (Task 1 output — `isOverlayPanel` guard is the gatekeeper for onMount/onUnmount invocation)
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts (Phase 4a existing tests — Task 2 EXTENDS, must not regress; verify all existing tests still pass after the bundle() extension)
    - packages/g2-app/src/status-hud/idle-infill-layer.ts (full file — Task 2 references this layer in the integration test that proves the differential demolish: stash + restore the same instance)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 1 + §Q1 Mitigation A1 (the exact rule LayerManager.bundle() now implements) + §Q7 (ADR Amendment 1 text — Task 4 will reuse the body)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-VALIDATION.md §Per-Task Verification Map row for Plan 01 (Wave 0 boundary tests + container budget verify gate)
  </read_first>
  <files>packages/g2-app/src/engine/layer-manager.ts, packages/g2-app/src/engine/__tests__/layer-manager.test.ts</files>
  <behavior>
    Differential demolish rule:
    - Test LMT-DD-01: `bundle([{ type: 'mount', z: Z2_OVERLAY, layer: panelDouble }])` when z=0.5 is currently mounted → after flush, `layerManager.layers` has Z2_OVERLAY mounted AND Z0_5_IDLE_INFILL is NOT mounted (it was implicitly demolished). The original z=0.5 layer instance was destroyed (its `.destroy` mock called).
    - Test LMT-DD-02: After LMT-DD-01 state, `bundle([{ type: 'destroy', z: Z2_OVERLAY }])` → after flush, z=2 is removed AND z=0.5 IS RE-MOUNTED (the layer instance from LMT-DD-01's stash is now in the layers map). Verify same instance via reference equality (`expect(layerManager.getLayer(Z0_5_IDLE_INFILL)).toBe(originalIdleInfillRef)`).
    - Test LMT-DD-03: Mount + destroy z=2 with NO z=0.5 ever mounted → the implicit demolish/restore are no-ops. No errors, no spurious destroy calls.
    - Test LMT-DD-04 (z=1.5 toast preservation): Mount z=1.5 ToastQueueLayer double + mount z=2 OverlayPanel double in one bundle → z=1.5 is STILL mounted after the bundle. Then destroy z=2 → z=1.5 still mounted. Reference equality: `layerManager.getLayer(Z1_5_TOAST)` is unchanged across both bundles.
    - Test LMT-DD-05 (single rebuildPageContainer flush): The implicit demolish + explicit mount of z=2 results in EXACTLY ONE `bridge.rebuildPageContainer` call (verified via `vi.spyOn(bridge, 'rebuildPageContainer')`). No transient flush.
    - Test LMT-DD-06 (idle-infill instance round-trip integration): Mount a real `IdleInfillLayer` (from status-hud module) at z=0.5 + a stub capture layer at z=0 + then bundle-mount a panel-double at z=2. Destroy z=2. Verify the IdleInfillLayer instance survived: `layer.id === 'idle-infill'` AND it's the same object reference.

    OverlayPanel lifecycle:
    - Test LMT-OP-01: A mock OverlayPanel (satisfies `isOverlayPanel`) being mounted via `bundle()` has its `onMount()` called exactly once AFTER `layers.set` but BEFORE `_flushPage()`. Use `vi.fn` invocationCallOrder assertions.
    - Test LMT-OP-02: A mock OverlayPanel being destroyed has its `onUnmount()` called exactly once BEFORE `_flushPage`. Verify via call order.
    - Test LMT-OP-03: A regular `Layer` (NOT an OverlayPanel — no onMount/onUnmount) being mounted does NOT receive any lifecycle calls. The `isOverlayPanel` guard short-circuits.
    - Test LMT-OP-04 (rejection handling — T-4b-01-02): A panel whose `onMount()` rejects with an Error → `bundle()` rejects with that Error (or wraps it); the bridge.rebuildPageContainer is NEVER called (no partial flush). The layer remains in the `layers` map (caller's responsibility to destroy + retry per the threat model).

    Container budget assertion:
    - Test LMT-CB-01: Set up stub layers via Strategy A (each declares getContainerCount). Configure totals that hit exactly 12 → bundle succeeds. Configure 13 → bundle rejects with `LayerManagerError('panel_mount_budget_exceeded')` BEFORE rebuildPageContainer is called.
    - Test LMT-CB-02: Differential demolish rule SUBTRACTS z=0.5's containers from the cumulative count when z=2 mounts. Configure z=0(5) + z=0.5(3) + z=1(1) + z=1.5(1) + z=2(3) — totals 13 WITHOUT demolish but 10 WITH demolish; bundle succeeds at 10.
    - Test LMT-CB-03: `_assertContainerBudget` runs AFTER `_assertCaptureInvariant` (capture invariant violation throws first).

    Existing Phase 4a tests:
    - Test LMT-REG-01..N: every existing test in layer-manager.test.ts still passes (NO regressions).
  </behavior>
  <action>
    Modify `packages/g2-app/src/engine/layer-manager.ts` and EXTEND the existing `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`. Do NOT rewrite either file — make targeted insertions.

    **1. LayerManager state additions:**

    Add a private field `private _suspendedZ05: Layer | null = null` next to the existing `layers` map. JSDoc: "Idle infill layer stashed while z=2 overlay is mounted, per ADR-0009 Amendment 1 differential demolish rule. Null when no overlay is active or no z=0.5 was mounted when z=2 mount occurred."

    **2. Container count helper (Strategy A from <interfaces>):**

    Implement `private _assertContainerBudget(): void`:
    ```
    private _assertContainerBudget(): void {
      let img = 0, txt = 0;
      for (const layer of this.layers.values()) {
        const cnt = layer.getContainerCount?.() ?? { image: 0, text: 1 };
        img += cnt.image;
        txt += cnt.text;
      }
      if (img > 4 || txt > 8) {
        throw new LayerManagerError(
          'panel_mount_budget_exceeded',
          `container budget exceeded: ${img} image (max 4) + ${txt} text (max 8); see ADR-0009 Amendment 1`,
        );
      }
    }
    ```

    **3. Extend `bundle()`:**

    Wrap the existing for-of loop with the differential demolish preprocessing AND the OverlayPanel lifecycle invocation. Reference pseudocode:

    ```
    async bundle(ops: ReadonlyArray<LayerOp>): Promise<void> {
      // STEP 1 — Compute effective op list.
      const effective: LayerOp[] = [];
      for (const op of ops) {
        if (op.type === 'mount' && op.z === ZIndex.Z2_OVERLAY && this.layers.has(ZIndex.Z0_5_IDLE_INFILL)) {
          const z05Layer = this.layers.get(ZIndex.Z0_5_IDLE_INFILL)!;
          this._suspendedZ05 = z05Layer;
          effective.push({ type: 'destroy', z: ZIndex.Z0_5_IDLE_INFILL });
          effective.push(op);
        } else if (op.type === 'destroy' && op.z === ZIndex.Z2_OVERLAY && this._suspendedZ05 !== null) {
          effective.push(op);
          effective.push({ type: 'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: this._suspendedZ05, requiredCaps: [] });
          this._suspendedZ05 = null;
        } else {
          effective.push(op);
        }
      }

      // STEP 2 — Apply effective ops AND track OverlayPanel lifecycle.
      const mountedPanels: OverlayPanel[] = [];
      const unmountedPanels: OverlayPanel[] = [];
      for (const op of effective) {
        if (op.type === 'mount') {
          for (const cap of op.requiredCaps ?? []) {
            if (!this.negotiatedCaps.has(cap)) {
              throw new LayerManagerError('capability_gate_denied', `bundle: mount(z=${op.z}, ${op.layer.id}): required capability '${cap}' not in negotiated set`);
            }
          }
          if (isOverlayPanel(op.layer)) mountedPanels.push(op.layer);
          this.layers.set(op.z, op.layer);
        } else {
          const existing = this.layers.get(op.z);
          if (existing && isOverlayPanel(existing)) unmountedPanels.push(existing);
          this.layers.delete(op.z);
        }
      }

      // STEP 3 — Invariants AND budget assertion BEFORE bridge call.
      this._assertCaptureInvariant();
      this._assertContainerBudget();

      // STEP 4 — Unmount lifecycle hooks (await sequentially).
      for (const p of unmountedPanels) {
        await p.onUnmount();
      }

      // STEP 5 — Mount lifecycle hooks (await sequentially). Rejection bubbles up; bridge call SKIPPED on rejection.
      for (const p of mountedPanels) {
        await p.onMount();
      }

      // STEP 6 — Single bridge flush.
      await this._flushPage();
    }
    ```

    Preserve the existing JSDoc on bundle(); APPEND new JSDoc paragraphs describing the differential demolish rule, the lifecycle invocation order, and the container budget assertion, with `@see ADR-0009 Amendment 1` references.

    Add a private accessor for tests: `getLayer(z: ZIndex): Layer | undefined { return this.layers.get(z); }` — JSDoc marks it as test-only diagnostic.

    **4. Extend layer-manager.test.ts:**

    Add a new `describe('Phase 4b differential demolish + container budget + OverlayPanel lifecycle', () => { ... })` block. Tests LMT-DD-01..LMT-DD-06, LMT-OP-01..LMT-OP-04, LMT-CB-01..LMT-CB-03, LT-1..LT-5 land here (LT tests fold into this file per Task 1 decision).

    Use `vi.spyOn` on the bridge mock to intercept `rebuildPageContainer` calls and assert call order via invocationCallOrder.

    Stub layers MUST implement the minimal `Layer` shape with `getContainerCount` per Strategy A. The capture layer (z=0) stub returns `{ image: 4, text: 1 }` and `getCaptureContainer: () => 'map-capture'`. The z=0.5 idle stub returns `{ image: 0, text: 3 }`. The z=1 status stub returns `{ image: 0, text: 1 }`. The z=1.5 toast stub returns `{ image: 0, text: 1 }`. The z=2 panel stub implements OverlayPanel with `onMount: vi.fn().mockResolvedValue(undefined)` etc., `getContainerCount: () => ({ image: 0, text: 3 })`.

    Constraints:
    - ALL existing tests in layer-manager.test.ts MUST still pass.
    - `_assertContainerBudget` runs AFTER `_assertCaptureInvariant` (LMT-CB-03 enforces order).
    - `onMount()` rejection does NOT call rebuildPageContainer (LMT-OP-04).
    - INV-4 JSDoc on the new private methods + the public `getLayer` accessor.
    - No `// TODO` without `(#issue)` or `(ADR-NNNN)`.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/engine/__tests__/layer-manager.test.ts && grep -c '_suspendedZ05' packages/g2-app/src/engine/layer-manager.ts && grep -c '_assertContainerBudget' packages/g2-app/src/engine/layer-manager.ts && grep -c 'isOverlayPanel' packages/g2-app/src/engine/layer-manager.ts && grep -cE 'differential demolish|differential-demolish' packages/g2-app/src/engine/layer-manager.ts && grep -cE 'panel_mount_budget_exceeded' packages/g2-app/src/engine/layer-manager.ts && grep -cE 'LMT-DD-0[1-6]|LMT-OP-0[1-4]|LMT-CB-0[1-3]' packages/g2-app/src/engine/__tests__/layer-manager.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    layer-manager.test.ts green for all extended tests (13+ new + all Phase 4a existing); layer-manager.ts contains `_suspendedZ05`, `_assertContainerBudget`, `isOverlayPanel`, and the `differential demolish` phrase in JSDoc; the new error code `panel_mount_budget_exceeded` is referenced; test discriminator markers (LMT-DD-01..LMT-CB-03) grep-match; `pnpm typecheck` exits 0; `pnpm lint:ci` exits 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend i18n-budgets.ts with all 28 Phase 4b new keys (atomic Wave-0 budget table foundation)</name>
  <read_first>
    - packages/g2-app/src/status-hud/i18n-budgets.ts (full file — Phase 4a 9-key table; Plan 01 APPENDS 28 new keys; preserve all existing keys verbatim)
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts (Phase 4a test file — Plan 01 extends with coverage for the new 28 keys)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §4.1 (death-saves 3 keys) + §4.2 (toast 2 keys) + §4.3 (boot-error 17 keys) + §4.4 (conc-modal 6 keys) — all values VERBATIM
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-04-SUMMARY.md (`as const satisfies Record<string, WidthBudgetRow>` gate pattern; B-1 adversarial test pattern in i18n-budgets-adversarial.test.ts — Plan 01 does NOT extend the adversarial test; Plan 04 MAY add boot-error-specific adversarial cases if width-budget enforcement at CI proves needed)
  </read_first>
  <files>packages/g2-app/src/status-hud/i18n-budgets.ts, packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts</files>
  <behavior>
    i18n-budgets extension tests:
    - Test IB-DS-1: HUD_WIDTH_BUDGETS.death_saves_title.it === 'DEATH SAVES' && .max === 16
    - Test IB-DS-2: HUD_WIDTH_BUDGETS.death_saves_passes_label.de === 'Erfolge'
    - Test IB-DS-3: HUD_WIDTH_BUDGETS.death_saves_fails_label.it === 'Falliti' && .max === 11
    - Test IB-TQ-1: HUD_WIDTH_BUDGETS.toast_squash_badge_template.it === '[+{n}]' && .max === 5
    - Test IB-TQ-2: HUD_WIDTH_BUDGETS.toast_row_padding_target.max === 42
    - Test IB-BE-1: HUD_WIDTH_BUDGETS.boot_error_title_handshake.it === 'HANDSHAKE FALLITO' && .max === 24
    - Test IB-BE-2: HUD_WIDTH_BUDGETS.boot_error_hint_handshake_1.it === 'Risposta del bridge non valida.' && .max === 50
    - Test IB-BE-3: HUD_WIDTH_BUDGETS.boot_error_close_label.it === '[X] Chiudi' && .max === 14
    - Test IB-BE-4: All 17 boot-error keys exist in HUD_WIDTH_BUDGETS (parametric loop)
    - Test IB-CM-1: HUD_WIDTH_BUDGETS.conc_modal_title.it === 'CONCENTRATION CONFLICT' && .max === 26
    - Test IB-CM-2: HUD_WIDTH_BUDGETS.conc_modal_n_button.de === '[N] Abbrechen' && .max === 14
    - Test IB-CM-3: HUD_WIDTH_BUDGETS.conc_modal_y_button_template.it === '[Y] Drop & cast {name}' && .max === 30
    - Test IB-ALL-1: HUD_WIDTH_BUDGETS contains 9 Phase 4a keys + 28 Phase 4b new keys = 37 total (Object.keys length check)
    - Test IB-ALL-2: `as const satisfies Record<string, WidthBudgetRow>` gate still passes (pnpm typecheck — pure compile-time check)
    - Test IB-ALL-3: Every value in HUD_WIDTH_BUDGETS has IT + EN + DE + max fields (parametric loop over Object.entries)
  </behavior>
  <action>
    **1. Extend `packages/g2-app/src/status-hud/i18n-budgets.ts`:**

    APPEND 28 new key entries to the existing HUD_WIDTH_BUDGETS object literal. Preserve all 9 Phase 4a keys verbatim (hp_label, ac_label, speed_label, conditions_section, concentration, slots_section, move_label, act_label, bns_label).

    Order convention: group by feature (death-saves, toast, boot-error, conc-modal) with section comments. Within each section, keep alphabetical OR UI-SPEC table order — implementer chooses; document. RECOMMENDED: match UI-SPEC §4.1-§4.4 order so future audits can cross-reference easily.

    Use the verbatim values from the <interfaces> block at the top of this plan. Every IT/EN/DE string copied character-for-character including non-ASCII (`Zustände`, `è`, `Schließen`, `ungültig`, `verrà`).

    After appending, the trailing line of the object literal MUST still read `} as const satisfies Record<string, WidthBudgetRow>;` (the gate preserved).

    Update the module-level JSDoc to mention Phase 4b additions (TOAST-01 Plan 03 + BOOT-01 Plan 04 + DEATH-01/CONC-01 Plan 05) and to note that the table is the canonical width-budget contract for all Phase 4a + Phase 4b rendering.

    **2. Extend `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`:**

    Add a new `describe('Phase 4b i18n-budgets extension (28 new keys)', () => { ... })` block. Implement tests IB-DS-1..IB-CM-3 + IB-ALL-1..IB-ALL-3 (15 tests minimum).

    Use parametric loops where possible:
    ```
    const PHASE_4B_KEYS = [
      'death_saves_title', 'death_saves_passes_label', 'death_saves_fails_label',
      'toast_squash_badge_template', 'toast_row_padding_target',
      'boot_error_title_handshake', 'boot_error_title_version', 'boot_error_title_no_char', 'boot_error_title_bridge', 'boot_error_title_token',
      'boot_error_hint_handshake_1', 'boot_error_hint_handshake_2',
      'boot_error_hint_version_1', 'boot_error_hint_version_2',
      'boot_error_hint_no_char_1', 'boot_error_hint_no_char_2',
      'boot_error_hint_bridge_1', 'boot_error_hint_bridge_2',
      'boot_error_hint_token_1', 'boot_error_hint_token_2',
      'boot_error_close_label',
      'conc_modal_title', 'conc_modal_active_label', 'conc_modal_casting_template', 'conc_modal_confirm_question', 'conc_modal_y_button_template', 'conc_modal_n_button',
    ] as const;

    it('IB-ALL-1: HUD_WIDTH_BUDGETS contains 9 Phase 4a + 28 Phase 4b = 37 keys', () => {
      expect(Object.keys(HUD_WIDTH_BUDGETS).length).toBe(37);
    });

    for (const key of PHASE_4B_KEYS) {
      it(`IB-ALL-3: ${key} has it/en/de/max fields`, () => {
        const row = HUD_WIDTH_BUDGETS[key];
        expect(typeof row.it).toBe('string');
        expect(typeof row.en).toBe('string');
        expect(typeof row.de).toBe('string');
        expect(typeof row.max).toBe('number');
      });
    }
    ```

    Specific value-check tests (IB-DS-1, IB-TQ-1, etc.) verify the exact strings from UI-SPEC.

    Constraints:
    - PRESERVE Phase 4a 9 keys verbatim — NO renames, NO max changes.
    - `as const satisfies Record<string, WidthBudgetRow>` gate preserved — typecheck pass is the implicit assertion.
    - Plan 04's adversarial typecheck pattern (from Phase 4a Plan 04 B-1) is NOT extended here. If boot-error width-budget violations need a CI gate at the type level, Plan 04 may add an `i18n-budgets-adversarial-boot-error.test.ts` with a budget-bust fixture. Plan 01 just lands the values; runtime assertWithinBudget guards downstream content overflow.
    - INV-4 JSDoc maintained.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/i18n-budgets.test.ts && grep -c "death_saves_title" packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c "toast_squash_badge_template" packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c "boot_error_title_handshake" packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c "conc_modal_title" packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c "'HANDSHAKE FALLITO'" packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c "'CONCENTRATION CONFLICT'" packages/g2-app/src/status-hud/i18n-budgets.ts && grep -cE 'boot_error_(title|hint|close)' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -cE 'conc_modal_' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c 'as const satisfies Record<string, WidthBudgetRow>' packages/g2-app/src/status-hud/i18n-budgets.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    i18n-budgets.test.ts green with all Phase 4a tests + new Phase 4b extension tests (15+); i18n-budgets.ts contains all 28 new keys verbatim (death-saves 3 + toast 2 + boot-error 17 + conc-modal 6); the `as const satisfies` gate is preserved (typecheck passes); grep gates above all return ≥1 (and the structured grep `boot_error_(title|hint|close)` returns ≥17, `conc_modal_` returns ≥6); test discriminator markers IB-DS-*, IB-TQ-*, IB-BE-*, IB-CM-*, IB-ALL-* grep-match.
  </done>
</task>

<task type="auto">
  <name>Task 4: Fill ADR-0009 Amendment 1 with the differential demolish rule + container budget audit + in-process gesture-bus rationale</name>
  <read_first>
    - docs/architecture/0009-layer-manager-contract.md (full file — Amendment 1 placeholder reserved by Phase 4a Plan 05 at line ~53)
    - docs/architecture/0001-layered-ui-model.md (Amendment 1 — original z=0.5 atomic rule that Phase 4b's differential rule refines)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q1 (container budget audit tables) + §Q2 (in-process gesture-bus Pattern B) + §Q7 (recommended Amendment 1 verbatim text — Plan 01 refines)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §7 (container type inventory + cumulative audit — used as supporting evidence)
    - packages/g2-app/src/engine/layer-manager.ts (post-Task 2 — Amendment 1 cites the actual code that implements the rule)
  </read_first>
  <files>docs/architecture/0009-layer-manager-contract.md</files>
  <behavior>
    No test (documentation-only). Verification is by grep + visual review:
    - File contains a fully-filled `### Amendment 1 — Phase 4b composition rules` section dated 2026-05-15.
    - File contains the closed-state container budget table (4 image + ≤8 text, with verdict ✓).
    - File contains the open-state container budget table (4 image + ≤8 text with z=0.5 demolished, with verdict ✓).
    - File contains the rule statement: "z=0.5 IS demolished on z=2 mount; z=1.5 toast IS NOT demolished on z=2 mount" (or equivalent prose).
    - File contains the in-process gesture-bus rationale citing 04B-RESEARCH §Q2 Pattern B.
    - The Amendment frontmatter `status` line (if present at top of the ADR) reflects `accepted + amended 2026-05-15` OR a status note inside Amendment 1 says "Status: ACCEPTED — extends Option A without overturning it".
  </behavior>
  <action>
    Modify `docs/architecture/0009-layer-manager-contract.md`. Locate the Amendment 1 placeholder reserved by Phase 4a Plan 05 (at or near line 53 — search for "Amendment 1 (reserved)" or similar marker). Replace the placeholder with the filled Amendment 1.

    Use 04B-RESEARCH §Q7 "Recommended Amendment 1 Text" as the starting point. Refine the prose during this task to:
    1. Reference the EXACT code path implementing the rule: `LayerManager.bundle()` in `packages/g2-app/src/engine/layer-manager.ts` (cite specifically the `_suspendedZ05` stash mechanism + the `_assertContainerBudget` private method introduced in Plan 01 Task 2).
    2. Include both container budget tables verbatim from the `<interfaces>` block of this plan (closed state + open state).
    3. State the three composition rules in numbered form:
       - Rule 1: Overlay z=2 mount auto-demolishes z=0.5 idle infill (atomic in same bundle flush).
       - Rule 2: Overlay z=2 mount does NOT demolish z=1.5 toast queue (toast survives overlay open).
       - Rule 3: z=0 MapBaseLayer retains `isEventCapture=1` when z=2 is mounted; panel input routes via `panel-gesture-bus.ts` in-process (NOT via WS round-trip, NOT via capture transfer).
    4. Document the conc-modal special case (CONC-01 modal on death-saves pivot — different strata, no conflict; Plan 05 ships the integration test).
    5. Document the consistency check vs original ADR-0001 Amendment 1: the differential rule PRESERVES z=0.5 atomic-with-z=2 for the z=2 case (re-converges); only adds the z=1.5 carve-out.
    6. Add `INV-2 status:` line stating "containerTotalNum: 1-12 re-verified against @evenrealities/even_hub_sdk@0.0.10 index.d.ts line 659-661 on 2026-05-15".
    7. Add `Why amend instead of new ADR:` justification (additive changes; no architectural inversion).
    8. Cross-reference 04B-RESEARCH.md §Q1 + §Q2 + §Q7 in the See Also block.

    Update the ADR's top-of-file status line (or frontmatter `status:` field) to reflect "accepted + amended 2026-05-15".

    Constraints:
    - INV-3 (Specs/README/showcase coherence): this Amendment does NOT change Specs.md §3.1 (container budget remains 4+8) and does NOT change the showcase. NO INV-3 atomic update needed in this plan. If a future planner determines Specs §7.4c needs an amendment noting the differential rule, that lands in a separate documentation commit.
    - Cite verbatim where possible — INV-2 demands the SDK signature cite is exact (line 659-661 of index.d.ts).
    - Markdown lint friendly: ATX headings (`###`), fenced code blocks for tables, blank line before/after each heading.
  </action>
  <verify>
    <automated>grep -cE '^### Amendment 1' docs/architecture/0009-layer-manager-contract.md && grep -cE 'differential demolish|differential-demolish' docs/architecture/0009-layer-manager-contract.md && grep -cE '2026-05-15' docs/architecture/0009-layer-manager-contract.md && grep -cE 'z=1\.5|Z1_5_TOAST' docs/architecture/0009-layer-manager-contract.md && grep -cE 'panel-gesture-bus' docs/architecture/0009-layer-manager-contract.md && grep -cE 'containerTotalNum.*1-12|4 image.*8 text|image.*max 4' docs/architecture/0009-layer-manager-contract.md && grep -cE 'accepted.*amended|status.*accepted' docs/architecture/0009-layer-manager-contract.md</automated>
  </verify>
  <done>
    ADR-0009 contains a fully-filled `### Amendment 1` section dated 2026-05-15, mentioning the differential demolish rule, z=1.5 carve-out, panel-gesture-bus, the 4-image-8-text container cap, and an "accepted + amended" status line. All grep gates above return ≥1.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| External caller → LayerManager.bundle() | Untrusted LayerOp arrays; bundle MUST gate (capability + capture + container budget) before flushing to bridge |
| OverlayPanel impl → LayerManager (onMount/onUnmount Promises) | Panels are responsible for their own resource cleanup; LayerManager treats their Promises as untrusted (must not deadlock on rejection) |
| PanelGestureBus subscribers (panel impls + Phase 6 R1 source) → bus.publish() | Faulty subscribers must not block other subscribers; per-call try/catch isolation in publish() |
| HUD_WIDTH_BUDGETS contents | Static `as const` table; no runtime mutation; values copied verbatim from UI-SPEC at build time |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-01-01 | T | LayerManager.bundle() applying user-supplied LayerOp array | mitigate | Capability gate, capture invariant, AND new container budget assertion run before rebuildPageContainer flush; on any throw the bridge is never called (no partial flush). |
| T-4b-01-02 | D | OverlayPanel.onMount() Promise rejection | mitigate | bundle() awaits onMount(); rejection bubbles up; bundle aborts BEFORE _flushPage; no rebuildPageContainer call on rejection. Verified by LMT-OP-04. |
| T-4b-01-03 | D | PanelGestureBus subscriber leak (panel forgets to unsubscribe on onUnmount) | mitigate | subscribe() returns unsubscribe fn; OverlayPanel JSDoc documents the contract; conc-modal test in Plan 05 asserts post-unmount bus.size() === 0. Bus.size() exposed for diagnostics. |
| T-4b-01-04 | T | Differential demolish rule accidentally demolishes z=1.5 toast | mitigate | LMT-DD-04 unit test pins the z=1.5 preservation behavior; integration smoke in Plan 05 ratifies under real layer composition. |
| T-4b-01-05 | I | Container budget assertion bypassed by a panel that lies about getContainerCount | accept | Phase 4b implementations are internal (no third-party panels). Phase 5+ plans can introduce schema-validation of declared count vs runtime bridge call inspection; defer to Phase 5 ADR. |
| T-4b-01-06 | T | i18n-budgets table content drift between Plan 01 commit + UI-SPEC | mitigate | Values copied VERBATIM from UI-SPEC §4.1-§4.4 (the design contract). `as const satisfies Record<string, WidthBudgetRow>` gate fails the build if any key violates the structural shape. assertWithinBudget runtime guard warns on content overflow at render time. |
---
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with the 4 new/extended test files (overlay-panel.test.ts, panel-gesture-bus.test.ts, layer-manager.test.ts extended, i18n-budgets.test.ts extended) all green
- `pnpm typecheck && pnpm lint:ci` exit 0
- `grep -c 'Z1_5_TOAST = 1.5' packages/g2-app/src/engine/layer-types.ts` returns 1
- `grep -c 'interface OverlayPanel extends Layer' packages/g2-app/src/engine/layer-types.ts` returns 1
- `grep -c '_suspendedZ05' packages/g2-app/src/engine/layer-manager.ts` returns ≥2 (declaration + usage)
- `grep -c 'panel-gesture-bus' docs/architecture/0009-layer-manager-contract.md` returns ≥1
- `grep -c '### Amendment 1' docs/architecture/0009-layer-manager-contract.md` returns 1
- Existing Phase 4a tests in layer-manager.test.ts AND i18n-budgets.test.ts still pass (no regression)
- HUD_WIDTH_BUDGETS contains all 28 new Phase 4b keys (death-saves 3 + toast 2 + boot-error 17 + conc-modal 6)
</verification>

<success_criteria>
Plan 01 closes when:
- MAP-05 overlay-portion partially addressed: OverlayPanel interface ships + LayerManager.bundle() enforces the differential demolish rule + panel-gesture-bus.ts is the routing primitive. The MAP-05 toggle-portion lands in Plan 02; the full MAP-05 success criterion verified end-to-end in Plan 05 integration smoke.
- ADR-0009 Amendment 1 is filled with the differential demolish rule + container budget audit tables + in-process gesture-bus rationale, dated 2026-05-15.
- The container budget assertion `_assertContainerBudget` is the single enforcement point for the 4+8 SDK cap (per Specs §3.1 + SDK index.d.ts line 659-661).
- All Wave 0 dependencies for Plans 02-05 are satisfied: Z1_5_TOAST enum value (Plan 03 consumes), OverlayPanel interface (Plan 05 conc-modal implements), PanelGestureBus (Plan 05 conc-modal subscribes), differential demolish rule (Plan 05 integration smoke + Plan 03 toast-survives-overlay stress test rely), HUD_WIDTH_BUDGETS 28 new keys (Plans 03/04/05 read-only consumers — NO downstream-plan modifications to i18n-budgets.ts).
- Wave-2 plans (03 + 04) and Wave-3 plan (05) have zero files_modified overlap with each other because all i18n-budgets.ts additions were centralised in this Wave 0 plan.
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md` capturing:
- Final ZIndex enum table (5 values: Z0_MAP, Z0_5_IDLE_INFILL, Z1_STATUS_HUD, Z1_5_TOAST, Z2_OVERLAY)
- Container budget audit table from ADR-0009 Amendment 1 (closed + open state)
- Test count per file (target: 3 OP + 7 PGB + 13+ LMT-* new + N Phase 4a existing in layer-manager.test.ts + 15+ IB-* extension in i18n-budgets.test.ts + N Phase 4a existing)
- Whether `getLayer(z)` test-diagnostic accessor was added (recommended yes)
- The exact prose of ADR-0009 Amendment 1's Rule 1 / Rule 2 / Rule 3 statements
- Any deviations from 04B-RESEARCH §Q7 recommended Amendment text (with rationale)
- Phase 6 follow-up note: `// TODO(ADR-0009): Phase 6 long-press source channel` location count (target: 1 in layer-types.ts R1Gesture JSDoc)
- HUD_WIDTH_BUDGETS final key count (target: 37 = 9 Phase 4a + 28 Phase 4b new)
- Phase 5 readiness signal: Plans 02-05 can now import OverlayPanel, R1Gesture, Z1_5_TOAST, PanelGestureBus, isOverlayPanel from Plan 01's deliverables AND read HUD_WIDTH_BUDGETS keys without modifying i18n-budgets.ts (Wave-0 centralisation)
- Wave-2 file-overlap confirmation: Plans 03 + 04 will NOT modify i18n-budgets.ts (Plan 01 absorbed all extensions)
</output>
