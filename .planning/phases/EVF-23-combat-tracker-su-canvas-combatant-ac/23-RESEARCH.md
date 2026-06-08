# Phase 23: Combat Tracker su Canvas + Combatant AC - Research

**Researched:** 2026-06-08
**Domain:** Canvas overlay panel (CanvasCombatTrackerPanel), CombatantSchema.ac extension, AC reader
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-23.1 — CanvasCombatTrackerPanel mirrors CanvasCharacterSheetPanel**
Nuovo pannello `CanvasCombatTrackerPanel` come secondo z=2 canvas overlay, costruito sullo stesso pattern dual-interface del character sheet panel. Riusa container-registry, font loader, dirty-gate, e le convenzioni di paint stabilite in Phase 20/21. Id pannello distinto (es. `'canvas-combat-tracker'`).

**D-23.2 — Per-combatant row content (success criterion #1)**
Ogni combattente nella finestra mostra: nome, HP corrente/max, ordine iniziativa, indicatore di concentrazione, e `ac` reale. L'AC sostituisce il placeholder `' --'` quando presente; `' --'` resta il fallback quando l'AC manca.

**D-23.3 — Scroll window: auto-follow turno corrente + scroll manuale [USER-DECIDED]**
Finestra a 5 combattenti su N totali. Su `combat.delta` la finestra si ri-centra automaticamente per mantenere visibile il combattente di turno corrente (evidenziato full-contrast). Tra i turni, il giocatore può scrollare manualmente con il R1 ring per ispezionare altri combattenti (riusa `_scrollOffset`). L'auto-follow ha precedenza all'arrivo di un nuovo `combat.delta` (ri-centra), poi lo scroll manuale è di nuovo libero fino al prossimo delta.

**D-23.4 — AC reader: system.attributes.ac.value + fallback [USER-DECIDED]**
`extractCombatantAc()` (o estensione del combatant reader) legge `actor.system.attributes.ac.value`, stabile tra dnd5e PHB 2014 e 2024. Se assente o non numerico → `ac` resta `undefined` e il renderer mostra `' --'`. Null-safe come gli altri reader (extractClass/extractWalkSpeed). NON calcolare flat+bonus+armor (fuori scope).

**D-23.5 — Gesture parity, no router changes (success criterion #3)**
La gesture di apertura/chiusura del combat tracker canvas è semanticamente identica alla versione glyph; la chiusura via double-press è preservata. `PanelGestureBus` e `panel-router.ts` NON sono modificati — il nuovo pannello si registra/instrada attraverso i meccanismi esistenti (come ha fatto il character sheet canvas panel via boot dispatch gate renderMode==='canvas').

**D-23.6 — Atomicity (success criterion #4)**
Schema `CombatantSchema.ac` + reader `foundry-module` + `CanvasCombatTrackerPanel` tutti in scope di questo phase — nessuno stato intermedio con schema esteso ma renderer non aggiornato.

### Claude's Discretion

None specified — all key implementation decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- AC flat+bonus+armor derivation (alternative to D-23.4) — not chosen.
- Delta-loop xxhash optimization — Phase 24.
- Promotion of raster to default boot — Phase 25.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RCOMB-01 | Combat tracker / turni renderizzato come pannello raster overlay z=2 (ordine iniziativa, highlight turno corrente, HP, concentrazione, quick-action bar), preservando il comportamento gesture esistente | CanvasCombatTrackerPanel dual-interface + `computeWindow` scroll + canvas paint |
| RDATA-05 | `CombatantSchema` porta `ac` (+ read path nel combat reader) — il combat tracker mostra l'AC reale invece del placeholder `' --'` | `CombatantSchema.ac?: number` optional extension + `extractCombatantAc()` in combat-reader.ts |
</phase_requirements>

---

## Summary

Phase 23 creates `CanvasCombatTrackerPanel`, the second z=2 canvas overlay panel, by mirroring the established `CanvasCharacterSheetPanel` dual-interface pattern from Phase 21. The glyph `CombatTrackerPanel` already contains all the necessary rendering logic (`computeWindow`, `renderCombatantRow`, `renderCombatTrackerContent`) — the canvas panel reuses this business logic and adds a canvas paint pipeline on top. The schema extension (`CombatantSchema.ac?: number`) follows the Phase 22 optional-field pattern to avoid downstream literal mass-updates, and the AC reader mirrors the null-safe `extractWalkSpeed` pattern from Phase 21.

The most important architectural discovery: the glyph `CombatTrackerPanel` does NOT currently receive `combat.delta` from a `wsEventBus` subscription in boot-engine-core — its `onSnapshot()` must be wired externally. For the canvas panel, the cleanest pattern (mirroring `CanvasStatusHudLayer` which subscribes to `character.delta` at construction time via `wsEvents`) is to have `CanvasCombatTrackerPanel` accept a `wsEvents`-like interface and subscribe to `combat.turn` at construction. Boot-engine-core's `setPanelInstanceHandler('canvas-combat-tracker', ...)` injects the `wsEventBus` subscription plus the `quickActionHandler` (same as the glyph tracker).

**Primary recommendation:** Build `CanvasCombatTrackerPanel` as a direct structural mirror of `CanvasCharacterSheetPanel` — dual-interface `CanvasLayer + OverlayPanel`, `_scrollOffset`, dirty-gate, chrome pre-bake — with the canvas paint layer calling adapted versions of the existing glyph renderer functions (`computeWindow`, `renderCombatantRow` content logic re-expressed on canvas). Wire `wsEventBus` subscription for `combat.turn` + `combat.state` channels in the `setPanelInstanceHandler` at boot-engine-core step 11g alongside the existing `quickActionHandler` injection.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CombatantSchema.ac field | shared-protocol | — | Single source of truth for schema; consumed by foundry-module (producer) and g2-app (renderer) |
| AC extraction reader | foundry-module | — | Reads Foundry runtime `actor.system.attributes.ac.value` — Foundry-side read-only path |
| Canvas combat tracker render | g2-app (Browser/WebView) | — | OffscreenCanvas paint pipeline runs in the Even App WebView |
| combat.delta subscription | g2-app boot-engine-core | g2-app panel | Boot-engine wires WS channel → panel instance via setPanelInstanceHandler |
| Auto-follow scroll logic | g2-app panel | — | `computeWindow` already implements centering; `_scrollOffset` reset on new delta |

---

## Standard Stack

### Core (no new packages — all existing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.4.3 (pinned) | `CombatantSchema.ac?: number` extension | Already in shared-protocol; same `.optional()` pattern used by concentration, feats, biography |
| `@evf/shared-protocol` | workspace | Schema types shared between foundry-module and g2-app | Single source of truth per CLAUDE.md |
| OffscreenCanvas / Canvas2D | Web standard | Paint pipeline in `attachCanvas` / `paint()` | Pattern established in Phase 20/21; no new dep needed |
| VT323 font via `ensureVt323Loaded` | workspace | Pixel font for canvas rendering | Already used by `CanvasCharacterSheetPanel` and `CanvasStatusHudLayer` |

### No New Packages Required

The entire Phase 23 scope is satisfied by existing workspace infrastructure. `computeWindow`, `renderCombatantRow`, and `renderCombatTrackerContent` from the glyph panel provide the semantic foundation; the canvas layer only adds the 2D paint rendering on top.

**Installation:** None needed.

---

## Package Legitimacy Audit

> No external packages are added in this phase. Audit: N/A.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
combat.turn (WS envelope)
        │
        ▼
wsEventBus.subscribe('combat.turn', …)   [boot-engine-core step 11g]
        │                              (injected via setPanelInstanceHandler)
        ▼
CanvasCombatTrackerPanel._onCombatDelta(raw)
  │  safeParse(CombatSnapshotSchema)
  │  detect turn change → reset _scrollOffset (auto-follow D-23.3)
  │  cache _snapshot → _dirty = true
        │
        ▼ [CanvasCompositor triggered by dirty flag]
CanvasCombatTrackerPanel.paint(ctx)
  │  _drawStaticChrome (pre-baked ImageBitmap or inline fallback)
  │  _drawCombatRows(ctx, computeWindow(_snapshot, currentIdx, _scrollOffset))
  │     └─ per row: name, HP bar, AC value (or ' --' fallback), conc indicator
  │  _dirty = false  ← LAST LINE
        │
        ▼
CanvasCompositor.composite() → 4 image tiles → updateImageRawData [serialized]
```

Data flow for gesture-driven scroll:

```
R1 ring swipe → PanelGestureBus → CanvasCombatTrackerPanel.onEvent(gesture)
  scroll-up / scroll-down → ±1 _scrollOffset (clamped) → _dirty = true
  double-tap → no-op (router closes at bus level per ADR-0012)
  isAtTopBoundary() → _scrollOffset === 0 (over-scroll gate for Quick Action menu)
```

### Recommended Project Structure

```
packages/
├── shared-protocol/src/payloads/
│   └── combat.ts                      ← ADD: ac?: z.number().int().nonneg().optional() to CombatantSchema
├── foundry-module/src/readers/
│   └── combat-reader.ts               ← ADD: extractCombatantAc(actor) + extend getCombatSnapshot()
├── foundry-module/src/types/
│   └── foundry-globals.d.ts           ← VERIFY: ac: { value: number } already present in Dnd5eAttributes ✓
├── g2-app/src/panels/
│   ├── canvas-combat-tracker-panel.ts ← NEW: dual-interface CanvasLayer + OverlayPanel
│   └── __tests__/
│       └── canvas-combat-tracker-panel.test.ts  ← NEW: unit tests
└── g2-app/src/internal/
    └── boot-engine-core.ts            ← MODIFY: onNavigate gate + setPanelInstanceHandler step 11g extension
```

### Pattern 1: CombatantSchema Optional Extension (ac)

**What:** Add `ac?: number` as an optional field to `CombatantSchema` (already `z.strictObject`).
**When to use:** When extending an existing strict schema with an optional field where absence = graceful fallback.
**Example:**
```typescript
// Source: packages/shared-protocol/src/payloads/combat.ts (existing CombatantSchema)
// Mirror of Phase 22 optional field pattern (feats, biography)
export const CombatantSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  actorId: z.string().nullable(),
  initiative: z.number().nullable(),
  hp: z.number().int().nullable(),
  maxHp: z.number().int().nonnegative().nullable(),
  isCurrentTurn: z.boolean(),
  concentration: ConcentrationSchema.optional(),
  // Phase 23 addition — OPTIONAL (no downstream literal mass-update required)
  ac: z.number().int().nonnegative().optional(),
});
```

**Key:** `.optional()` means existing test literals with no `ac` field continue to parse successfully through `CombatantSchema.safeParse`. This is the same strategy used for `concentration` (Phase 5) and `feats`/`biography` (Phase 22). [VERIFIED: codebase audit of combat.ts and character.ts]

### Pattern 2: AC Reader — Null-Safe extractCombatantAc

**What:** Read `actor.system.attributes.ac.value` with defensive null chain.
**When to use:** Combatant reader extension following extractWalkSpeed pattern.
**Example:**
```typescript
// Source: packages/foundry-module/src/readers/combat-reader.ts (to add)
// Mirror of extractWalkSpeed pattern from character-reader.ts Phase 21
function extractCombatantAc(actor: FoundryActor | null): number | undefined {
  const val = actor?.system.attributes.ac?.value;
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  return Math.max(0, Math.round(val));
}
```

**Key:** `Dnd5eAttributes.ac` is declared as `ac: { value: number }` (NOT optional) in `foundry-globals.d.ts` line 254. However, `actor` itself may be null (unlinked combatant), and `actor.system.attributes.ac` may be absent on freshly-created actors at runtime. The optional chain `actor?.system.attributes.ac?.value` handles both cases. [VERIFIED: codebase — foundry-globals.d.ts line 254]

### Pattern 3: CanvasCombatTrackerPanel — Dual-Interface with wsEvents Subscription

**What:** Canvas overlay panel that (a) implements CanvasLayer+OverlayPanel like CanvasCharacterSheetPanel, AND (b) subscribes to `combat.turn` / `combat.state` WS channels for live updates.
**When to use:** Any canvas overlay panel that needs to react to server-push data.

**Critical difference from CanvasCharacterSheetPanel:** The character sheet panel receives data via `onSnapshot(rawSnapshot)` called externally (by `CanvasStatusHudLayer`'s WS handler or a future mechanism). The combat tracker panel needs to subscribe to `combat.turn` + `combat.state` itself, following the `CanvasStatusHudLayer` pattern:

```typescript
// Source: packages/g2-app/src/status-hud/canvas-status-hud-layer.ts (pattern reference)
// CanvasStatusHudLayer subscribes at construction time:
this._unsubscribe = opts.wsEvents.subscribe('character.delta', (raw) => { … });

// CanvasCombatTrackerPanel will mirror this:
// The wsEventBus reference is injected via boot-engine-core setPanelInstanceHandler
// (CANNOT be passed via PanelDeps — PanelRouter.openPanel passes only bridge/gestureBus/locale)
// Pattern: inject wsEventBus reference via setPanelInstanceHandler post-construction, 
// before onMount. Panel stores it and subscribes in onMount.
```

**Injection path for wsEventBus into the canvas panel:**

Option A (constructor injection via setPanelInstanceHandler):
```typescript
panelRouter.setPanelInstanceHandler('canvas-combat-tracker', (panel) => {
  const tracker = panel as unknown as {
    setWsEventBus: (bus: typeof wsEventBus) => void;
    setQuickActionHandler: (h: ...) => void;
  };
  tracker.setWsEventBus(wsEventBus);    // for combat.turn subscription
  tracker.setQuickActionHandler(quickActionHandler);  // existing
});
```

Option B (subscribe in setPanelInstanceHandler, pass unsubscribe to panel):
```typescript
panelRouter.setPanelInstanceHandler('canvas-combat-tracker', (panel) => {
  const tracker = panel as unknown as CanvasCombatTrackerPanel;
  const unsub = wsEventBus.subscribe('combat.turn', (raw) => tracker._onCombatDelta(raw));
  const unsub2 = wsEventBus.subscribe('combat.state', (raw) => tracker._onCombatDelta(raw));
  tracker.setExternalUnsubscribes([unsub, unsub2]);
  tracker.setQuickActionHandler(quickActionHandler);
});
```

**Recommendation: Option A** — `setWsEventBus()` injection + subscribe in `onMount` / unsubscribe in `onUnmount`. This keeps subscription lifecycle tied to panel lifecycle (idempotent, no leaked subscriptions on re-open). The WsEventBus shape (`{ subscribe(ch, fn): () => void }`) is a stable interface. [ASSUMED — design choice between A and B, both valid]

### Pattern 4: computeWindow Reuse (Auto-Follow Scroll)

**What:** The existing `computeWindow()` from `combat-tracker-panel.ts` already implements the centering logic. The canvas panel reuses it directly.
**Auto-follow:** On `combat.turn` arrival, detect `currentCombatantId` change → reset `_scrollOffset = 0` BEFORE updating `_snapshot`. The `computeWindow` call with `scrollOffset=0` then centers the current turn automatically.

```typescript
// From existing CombatTrackerPanel.onSnapshot — exact pattern to copy:
if (newSnapshot.currentCombatantId !== this._lastCurrentCombatantId) {
  this._scrollOffset = 0;                        // auto-follow reset
  this._lastCurrentCombatantId = newSnapshot.currentCombatantId;
}
this._snapshot = newSnapshot;
this._dirty = true;
```

**Manual scroll between deltas:** `_scrollOffset` is only modified by scroll gestures (between deltas) or reset by turn change. Clamped per existing pattern: `maxOff = Math.max(0, (snapshot?.combatants.length ?? 0) - 3)`. [VERIFIED: codebase — combat-tracker-panel.ts lines 553-563, 720-728]

### Pattern 5: Boot Dispatch Gate for 'combat-tracker' → 'canvas-combat-tracker'

**What:** In `boot-engine-core.ts` `onNavigate` handler (inside `makeMenu`), add the canvas-mode redirect for `'combat-tracker'` alongside the existing `'character-sheet'` redirect.
**Example (in makeMenu.onNavigate):**
```typescript
// Existing (Phase 21-03):
const resolvedTarget =
  target === 'character-sheet' && layerManager.getRenderMode() === 'canvas'
    ? 'canvas-character-sheet'
    : target;

// Phase 23 addition:
const resolvedTarget =
  target === 'character-sheet' && layerManager.getRenderMode() === 'canvas'
    ? 'canvas-character-sheet'
    : target === 'combat-tracker' && layerManager.getRenderMode() === 'canvas'
      ? 'canvas-combat-tracker'
      : target;
```

[VERIFIED: codebase — boot-engine-core.ts lines 894-898]

### Pattern 6: Canvas Paint — Combat Rows

**What:** The canvas paint layer draws combatant rows using canvas `fillText`. The existing `renderCombatantRow()` returns strings (for the glyph `textContainerUpgrade` path). For the canvas panel, the content logic (initiative, name truncation, HP bar, AC value) is re-expressed as `ctx.fillText()` calls.

**Two implementation approaches:**

A. **Reuse glyph string renderers as-is** — call `renderCombatTrackerContent()` to get the string rows, then `ctx.fillText(row, x, y)` for each row at the correct pixel line height. Simple but renders fixed-width glyph-like output.

B. **Direct canvas rendering** — draw each field independently with `ctx.fillText()` at precise positions for better typography control (same approach as `paintMainTab` in character-sheet-tab-renderers.ts).

**Recommendation: Approach A for Phase 23** — lower risk, reuses all the existing INV-1-tested row formatting (initiative, HP bar, AC field, concentration sub-line, quick-action bar). Canvas rows are just the string output rendered via `ctx.fillText` at 16px line intervals. This is faster to implement and passes existing glyph behavioral tests without modification. The canvas panel can evolve to Approach B in a future phase when typography polish is needed.

**Current-turn highlight (full-contrast):** The existing `renderCombatantRow()` uses `c.isCurrentTurn ? '▶ ' : '  '` for the text marker. For the canvas panel, the current-turn row should additionally be drawn with an inverted fill (white rect + black text) to achieve "full-contrast highlight". This requires drawing a filled rectangle behind the current-turn row before `fillText`. [ASSUMED — canvas highlight implementation detail; text marker alone may suffice for v1]

### Anti-Patterns to Avoid

- **Registering CanvasCombatTrackerPanel with `id: 'combat-tracker'`:** The PanelRouter `discoverPanels()` glob would then have two panels with the same ID — the glyph panel would be silently overwritten. Use `id: 'canvas-combat-tracker'` and gate via boot dispatch. [VERIFIED: codebase — CanvasCharacterSheetPanel Pitfall 2 from 21-RESEARCH.md precedent]
- **Subscribing to `wsEventBus` before `onMount`:** The subscription should be set up in `onMount` and torn down in `onUnmount` to prevent ghost callbacks after panel close. Inject the bus reference via `setWsEventBus()` but defer actual `.subscribe()` to `onMount`.
- **Forgetting to clear multi-attack state on turn advance:** The glyph tracker clears `multiAttackState` in `onSnapshot` on turn change (WR-02 fix). The canvas panel must replicate this in `_onCombatDelta`.
- **Modifying `panel-gesture-bus.ts` or `panel-router.ts`:** D-23.5 locks this — the canvas panel uses existing mechanisms unchanged.
- **Adding `ac` as REQUIRED to CombatantSchema:** 31 existing test literals construct `Combatant` objects without `ac` — making it required would break all of them. Keep `.optional()`. [VERIFIED: codebase — counted 31 `isCurrentTurn:` instances in test files]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 5-combatant centering window | Custom windowing | `computeWindow()` from `combat-tracker-panel.ts` | Already handles all edge cases (N=0, N≤5, top/bottom anchoring, mid centering) with INV-1 tests |
| Combat row string formatting | Custom formatter | `renderCombatantRow()` from `combat-tracker-panel.ts` | INV-1 fixture-tested, handles HP ellipsis truncation, YOU-marker, concentration sub-line, multi-attack chip |
| VT323 font load | Custom font loader | `ensureVt323Loaded()` from `vt323-font-loader.ts` | Handles WKWebView fallback chain; already used by CanvasCharacterSheetPanel |
| Canvas chrome pre-bake | Custom caching | `_prebakeChrome()` pattern from `CanvasCharacterSheetPanel` | Established fallback for happy-dom (no createImageBitmap) |
| AC arithmetic | Custom AC calculator | None — read `actor.system.attributes.ac.value` directly | D-23.4 locked: no flat+bonus+armor derivation; the single field is sufficient |

---

## Runtime State Inventory

> This is a schema + reader + canvas panel addition. No rename/refactor/migration involved.
> Step 2.5: SKIPPED — not applicable.

---

## Common Pitfalls

### Pitfall 1: `z.strictObject` breaks when adding fields without `.optional()`
**What goes wrong:** `CombatantSchema` uses `z.strictObject`. Adding `ac: z.number()` as required causes all existing test literals without `ac` to fail `safeParse` (extra-key-strict + missing-required). There are 31 `isCurrentTurn:` instances in test files alone.
**Why it happens:** `strictObject` rejects both unknown keys (extra fields) and missing required fields.
**How to avoid:** Use `ac: z.number().int().nonnegative().optional()`. The optional field is silently absent in existing literals, satisfying strictObject. [VERIFIED: codebase audit of `z.strictObject` + concentration precedent]
**Warning signs:** `safeParse` failures cascading across 31+ test files immediately after the schema change.

### Pitfall 2: Two panels with the same `static meta.id = 'combat-tracker'`
**What goes wrong:** PanelRouter `discoverPanels()` iterates `../panels/**/*-panel.ts`. The last file to load wins silently — the glyph `CombatTrackerPanel` disappears from the registry.
**Why it happens:** `registry.set(meta.id, ...)` is a last-write-wins Map insert.
**How to avoid:** `static meta.id = 'canvas-combat-tracker'` (distinct). The boot dispatch gate in `onNavigate` maps `'combat-tracker'` → `'canvas-combat-tracker'` at dispatch time when `getRenderMode()==='canvas'`. [VERIFIED: codebase — CanvasCharacterSheetPanel uses 'canvas-character-sheet', boot-engine-core line 894]
**Warning signs:** `console.warn('[PanelRouter] openPanel: panel 'canvas-combat-tracker' not in registry')`.

### Pitfall 3: `paint()` called before `attachCanvas()` (null-ctx crash)
**What goes wrong:** `CanvasCompositor` calls `paint()` as soon as `isDirty()` returns true, which is set at construction. If `_ctx` is null (attachCanvas not yet called), `fillText` throws.
**Why it happens:** The compositor may fire before the async `_initAsync()` chain completes.
**How to avoid:** Null-guard at the top of `paint()`: `if (this._ctx === null) return;`. Matches existing `CanvasCharacterSheetPanel` pattern. [VERIFIED: codebase — canvas-character-sheet-panel.ts line 299]
**Warning signs:** `TypeError: Cannot read property 'fillText' of null` in tests or console.

### Pitfall 4: combat.delta subscription leaks across panel open/close cycles
**What goes wrong:** If `wsEventBus.subscribe()` is called in the `setPanelInstanceHandler` (at openPanel time) and the unsubscribe is not properly stored/called in `onUnmount`, each panel re-open adds another subscription. Multiple callbacks fire for each `combat.turn` envelope.
**Why it happens:** setPanelInstanceHandler fires at openPanel (before onMount); the panel instance has not yet mounted and will be unmounted later. If the subscription is in the handler and not in onMount/onUnmount, lifecycle tracking breaks.
**How to avoid:** Inject `wsEventBus` reference into the panel via `setWsEventBus()` in the setPanelInstanceHandler. Subscribe in `onMount` and unsubscribe in `onUnmount` (stored as `_unsubscribeCombat`). [ASSUMED — analogous to gestureBus pattern]
**Warning signs:** Panel shows stale-then-live data after re-open; multiple ghost renders per delta.

### Pitfall 5: Forgetting to add 'canvas-combat-tracker' to `setPanelInstanceHandler` step 11g
**What goes wrong:** The `quickActionHandler` ([A][S][I][M]) is never injected into `CanvasCombatTrackerPanel`. The quick-action bar renders but tapping does nothing.
**Why it happens:** The existing `setPanelInstanceHandler('combat-tracker', ...)` only targets the glyph panel; the canvas variant has a different id.
**How to avoid:** Add `setPanelInstanceHandler('canvas-combat-tracker', ...)` at boot-engine-core step 11g alongside the glyph handler. Inject both `setWsEventBus(wsEventBus)` and `setQuickActionHandler(quickActionHandler)`. [VERIFIED: codebase — boot-engine-core.ts line 1330]

### Pitfall 6: `isAtTopBoundary()` must return `_scrollOffset === 0`
**What goes wrong:** If `isAtTopBoundary()` uses a different condition (e.g., first combatant is visible), the over-scroll dispatcher opens the Quick Action menu at wrong scroll positions.
**Why it happens:** ADR-0012 D-2 gate reads `isAtTopBoundary()` — it is the overscroll detection contract.
**How to avoid:** `isAtTopBoundary(): boolean { return this._scrollOffset === 0; }` verbatim. DO NOT change this condition. [VERIFIED: codebase — Pitfall 5 from 21-RESEARCH.md and CombatTrackerPanel line 746]

---

## Code Examples

Verified patterns from the codebase:

### Existing computeWindow — reuse verbatim
```typescript
// Source: packages/g2-app/src/panels/combat-tracker-panel.ts — export function computeWindow
export function computeWindow(
  turns: Combatant[],
  currentTurnIndex: number,
  scrollOffset: number,
): Combatant[] {
  const N = turns.length;
  if (N === 0) return [];
  if (N <= 5) return turns.slice();
  const targetCenter = Math.max(2, Math.min(N - 3, currentTurnIndex + scrollOffset));
  const start = Math.max(0, targetCenter - 2);
  const end = Math.min(N, start + 5);
  const adjustedStart = Math.max(0, end - 5);
  return turns.slice(adjustedStart, end);
}
```

### Foundry-globals.d.ts — Dnd5eAttributes.ac (already present)
```typescript
// Source: packages/foundry-module/src/types/foundry-globals.d.ts line 254
// Already declared — NO changes needed to foundry-globals.d.ts
interface Dnd5eAttributes {
  hp: { value: number; max: number; temp: number; tempmax: number; };
  ac: { value: number };   // ← ALREADY PRESENT
  // ... init, movement ...
}
```

### combat-reader.ts — extend getCombatSnapshot with AC
```typescript
// Source: packages/foundry-module/src/readers/combat-reader.ts (to modify)
// Add null-safe AC extractor following extractWalkSpeed pattern:
function extractCombatantAc(actor: FoundryActor | null): number | undefined {
  const val = actor?.system.attributes.ac?.value;
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  return Math.max(0, Math.round(val));
}

// In getCombatSnapshot, extend the combatant map:
return {
  id: c.id,
  name: c.name,
  actorId: c.actorId,
  initiative: c.initiative,
  hp: hp !== undefined ? hp.value : null,
  maxHp: hp !== undefined ? hp.max : null,
  isCurrentTurn: c.id === currentCombatantId,
  ...(concentration !== undefined ? { concentration } : {}),
  ...(acVal !== undefined ? { ac: acVal } : {}),  // Phase 23 addition
};
```

### CanvasCombatTrackerPanel — skeleton structure
```typescript
// Source: mirrors packages/g2-app/src/panels/canvas-character-sheet-panel.ts
export default class CanvasCombatTrackerPanel implements CanvasLayer, OverlayPanel {
  static meta: PanelMeta = {
    id: 'canvas-combat-tracker',        // DISTINCT from 'combat-tracker'
    title: { it: 'Combat', en: 'Combat', de: 'Kampf' },
    navKey: 'C',                         // same navKey as glyph panel
    requiredCaps: [],
  };
  public readonly id = 'canvas-combat-tracker';
  public readonly z = ZIndex.Z2_OVERLAY;

  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private _snapshot: CombatSnapshot | null = null;
  private _scrollOffset = 0;
  private _lastCurrentCombatantId: string | null = null;
  private _dirty = true;
  private _fontFamily = '16px monospace';
  private _chromeBitmap: ImageBitmap | null = null;
  private _unsubscribeGesture: (() => void) | null = null;
  private _unsubscribeCombat: (() => void) | null = null;   // combat.delta subscription
  private _wsEventBus: { subscribe(ch: string, fn: (r: unknown) => void): () => void } | null = null;
  private _quickActionHandler: ((key: 'A'|'S'|'I'|'M') => void) | null = null;
  private _ownActorId: string;
  // ... multiAttackState, _lastTapAt, _lastTapIdx, qaSelectedIdx (from glyph panel) ...

  // Injected post-construction by setPanelInstanceHandler:
  setWsEventBus(bus: { subscribe(ch: string, fn: (r: unknown) => void): () => void }): void {
    this._wsEventBus = bus;
  }
  setQuickActionHandler(handler: ((key: 'A'|'S'|'I'|'M') => void) | null): void {
    this._quickActionHandler = handler;
  }

  // CanvasLayer:
  getContainerCount(): { image: 0; text: 0 } { return { image: 0, text: 0 }; }
  getCaptureContainer(): string { return 'hud-capture'; }
  isDirty(): boolean { return this._dirty; }
  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    // blit chrome bitmap or inline chrome
    // draw combat rows from computeWindow(_snapshot, currentIdx, _scrollOffset)
    // highlight current-turn row (inverted fill)
    this._dirty = false;  // LAST LINE
  }

  // OverlayPanel:
  async onMount(): Promise<void> {
    this._unsubscribeGesture = this._gestureBus.subscribe((g) => this.onEvent(g));
    // Subscribe to combat.turn + combat.state for live updates:
    if (this._wsEventBus !== null) {
      this._unsubscribeCombat = this._wsEventBus.subscribe('combat.turn', (raw) =>
        this._onCombatDelta(raw));
      // NOTE: wsEventBus last-value-replay will synchronously fire with cached
      // combat.turn if one arrived during boot before panel opened.
    }
    this._dirty = true;
  }
  async onUnmount(): Promise<void> {
    this._unsubscribeGesture?.(); this._unsubscribeGesture = null;
    this._unsubscribeCombat?.(); this._unsubscribeCombat = null;
  }
  isAtTopBoundary(): boolean { return this._scrollOffset === 0; }

  private _onCombatDelta(raw: unknown): void {
    const parsed = CombatSnapshotSchema.safeParse(raw);
    if (!parsed.success) { console.warn('canvas-combat-tracker: invalid combat.turn payload'); return; }
    if (parsed.data.currentCombatantId !== this._lastCurrentCombatantId) {
      this._scrollOffset = 0;  // auto-follow: re-center on new turn
      this._lastCurrentCombatantId = parsed.data.currentCombatantId;
      this._multiAttackState = null;  // clear stale chip (WR-02 pattern)
    }
    this._snapshot = parsed.data;
    this._dirty = true;
  }
}
```

### boot-engine-core.ts — extended onNavigate + step 11g

```typescript
// In makeMenu.onNavigate (extend existing chain, lines ~894-898):
const resolvedTarget =
  target === 'character-sheet' && layerManager.getRenderMode() === 'canvas'
    ? 'canvas-character-sheet'
    : target === 'combat-tracker' && layerManager.getRenderMode() === 'canvas'
      ? 'canvas-combat-tracker'
      : target;

// In step 11g (extend existing setPanelInstanceHandler('combat-tracker')):
panelRouter.setPanelInstanceHandler('canvas-combat-tracker', (panel) => {
  const tracker = panel as unknown as {
    setWsEventBus: (bus: typeof wsEventBus) => void;
    setQuickActionHandler: (h: ((key: 'A'|'S'|'I'|'M') => void) | null) => void;
  };
  tracker.setWsEventBus(wsEventBus);
  tracker.setQuickActionHandler(quickActionHandler);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Glyph-only `CombatTrackerPanel` (`textContainerUpgrade` text output) | Canvas `CanvasCombatTrackerPanel` (`paint()` → OffscreenCanvas → image tiles) | Phase 23 | Full typography control; no SDK 27px font constraint |
| AC placeholder `' --'` in `renderCombatantRow()` | Real AC from `CombatantSchema.ac` → `ac?.toString()` or `' --'` fallback | Phase 23 | Players see real AC values without manual lookup |
| Character sheet only as canvas panel | Second canvas overlay panel (combat tracker) | Phase 23 | Establishes the reusable dual-interface canvas overlay pattern |

**Deprecated/outdated:**
- `const acValue = ' --';` comment *"AC is not in the CombatantSchema (Phase 5 scope)"* — Phase 23 closes this; glyph panel comment must be updated atomically with the schema change.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `setWsEventBus()` injection via `setPanelInstanceHandler` is preferred over subscribing in the handler directly (Option A vs Option B) | Pattern 3 | Low — both options work; Option B avoids needing `setWsEventBus()` method, but subscription lifecycle is harder to track |
| A2 | Canvas rendering approach: Approach A (reuse glyph strings + `ctx.fillText` per row) is preferred over Approach B (direct per-field canvas draw) | Pattern 6 | Low — Approach A is simpler for Phase 23; Approach B gives better typography but is not needed now |
| A3 | Current-turn highlight: white fill rect behind the current-turn row (inverted) for "full-contrast" | Pattern 6 | Low — text marker `▶` alone may be sufficient; planner can decide |
| A4 | `combat.state` channel should also be subscribed (not only `combat.turn`) to handle combat start | Pattern 3 / Code examples | Low — `combat.state` uses the same `CombatSnapshotSchema`; omitting it means panel doesn't update on combat start until turn 1 |

**If this table is complete:** A1-A4 are low-risk design choices. All core architectural claims are VERIFIED from the codebase.

---

## Open Questions

1. **Should `CanvasCombatTrackerPanel` also subscribe to `combat.state` (combat start) in addition to `combat.turn` (turn advance)?**
   - What we know: `COMBAT_STATE_DELTA_TYPE = 'combat.state'` exists in `combat.ts`; the glyph `CombatTrackerPanel.onSnapshot()` handles any `CombatSnapshot` regardless of delta type.
   - What's unclear: Whether the bridge emits `combat.state` at encounter start (and thus whether the canvas panel should subscribe to both).
   - Recommendation: Subscribe to both `combat.turn` and `combat.state` in `onMount` (same handler, same `CombatSnapshotSchema.safeParse`). Belt-and-suspenders, zero extra cost.

2. **Does `CanvasCombatTrackerPanel.paint()` need to render the quick-action bar?**
   - What we know: The glyph panel renders `renderQuickActionBar()` at the bottom. The canvas panel must preserve RCOMB-01 behavioral parity.
   - What's unclear: Whether the canvas HUD has vertical space for both the 5-combatant window and the quick-action bar within the 200px height.
   - Recommendation: Include a quick-action bar row in the canvas paint. Use `renderQuickActionBar(locale, qaSelectedIdx)` string output drawn via `ctx.fillText` at the bottom row, same as other rows. If space is tight, this can be a condensed single line.

---

## Environment Availability

> This phase makes no use of external tools or services beyond the existing workspace.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | pnpm test | ✓ | v26.0.0 (runtime) / v22.22.2 (pnpm path) | — |
| pnpm | workspace | ✓ | at `~/.nvm/versions/node/v22.22.2/bin/pnpm` | — |
| Vitest 4 | pnpm test | ✓ | 4.1.5 (pinned) | — |
| TypeScript 5.8.3 | pnpm typecheck | ✓ | pinned | — |
| OffscreenCanvas | canvas paint | ✓ (happy-dom fallback in tests) | browser + happy-dom mock | inline `_drawChrome` fallback (same as CanvasCharacterSheetPanel) |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RCOMB-01 | `CanvasCombatTrackerPanel` implements CanvasLayer + OverlayPanel interfaces | unit | `pnpm --filter @evf/g2-app test -- --run` | ❌ Wave 0: create `canvas-combat-tracker-panel.test.ts` |
| RCOMB-01 | `computeWindow` scroll window with auto-follow on new combat.turn delta (`_scrollOffset` resets) | unit | `pnpm --filter @evf/g2-app test -- --run` | ❌ Wave 0: `canvas-combat-tracker-panel.test.ts` |
| RCOMB-01 | Current-turn combatant highlighted; `_dirty=true` after delta | unit | `pnpm --filter @evf/g2-app test -- --run` | ❌ Wave 0 |
| RCOMB-01 | Manual scroll changes `_scrollOffset`; `isAtTopBoundary()` returns true at 0 | unit | `pnpm --filter @evf/g2-app test -- --run` | ❌ Wave 0 |
| RCOMB-01 | `getContainerCount()={image:0,text:0}`, `getCaptureContainer()='hud-capture'` | unit | `pnpm --filter @evf/g2-app test -- --run` | ❌ Wave 0 |
| RCOMB-01 | Missing `ac` renders `' --'` fallback in paint (or string output) | unit | `pnpm --filter @evf/g2-app test -- --run` | ❌ Wave 0 |
| RDATA-05 | `CombatantSchema.ac` optional: existing literals without `ac` still parse | unit | `pnpm --filter @evf/shared-protocol test -- --run` | ❌ Wave 0: extend `combat.test.ts` |
| RDATA-05 | `CombatantSchema.ac` validates: `{…, ac: 18}` parses correctly | unit | `pnpm --filter @evf/shared-protocol test -- --run` | ❌ Wave 0 |
| RDATA-05 | `getCombatSnapshot()` populates `ac` from `actor.system.attributes.ac.value` | unit | `pnpm --filter @evf/foundry-module test -- --run` | ❌ Wave 0: extend `readers.test.ts` or create `combat-reader-ac.test.ts` |
| RDATA-05 | `getCombatSnapshot()` sets `ac: undefined` when `actor` is null | unit | `pnpm --filter @evf/foundry-module test -- --run` | ❌ Wave 0 |
| RDATA-05 | `getCombatSnapshot()` sets `ac: undefined` when `ac.value` is not a number | unit | `pnpm --filter @evf/foundry-module test -- --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run && pnpm --filter @evf/shared-protocol test -- --run && pnpm --filter @evf/foundry-module test -- --run`
- **Per wave merge:** `pnpm test` (full workspace)
- **Phase gate:** `pnpm test && pnpm typecheck && pnpm lint:ci` all green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts` — covers RCOMB-01 (all sub-behaviors above)
- [ ] `packages/shared-protocol/src/payloads/combat.test.ts` — extend with `ac` optional field tests (RDATA-05)
- [ ] `packages/foundry-module/src/readers/__tests__/combat-reader-ac.test.ts` (or extend `readers.test.ts`) — covers RDATA-05 reader behaviors

---

## Security Domain

> `security_enforcement` not explicitly set to false in config.json — include section.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `CombatSnapshotSchema.safeParse` in `_onCombatDelta` (T-23-01 mitigation) |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `combat.turn` WS payload | Tampering | `CombatSnapshotSchema.safeParse` gate — drop and warn on failure; `_snapshot` and `_dirty` unchanged |
| Unbounded `_scrollOffset` | DoS (UI) | Clamp: `maxOff = Math.max(0, combatants.length - 3)` — same as glyph tracker WR-02 fix |
| Stale `ac.value` from NPC actor | Information Disclosure | Not a concern — `ac.value` is world-visible in Foundry; rendered read-only |

---

## Sources

### Primary (HIGH confidence)
- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — dual-interface pattern reference (CanvasLayer + OverlayPanel, dirty-gate, chrome pre-bake, gestureBus subscription lifecycle, `_scrollOffset`)
- `packages/g2-app/src/panels/combat-tracker-panel.ts` — semantic reference (computeWindow, renderCombatantRow, renderCombatTrackerContent, onSnapshot auto-follow, gesture dispatch, isAtTopBoundary)
- `packages/shared-protocol/src/payloads/combat.ts` — CombatantSchema current shape (strictObject, concentration optional precedent)
- `packages/foundry-module/src/readers/combat-reader.ts` — current AC absence, extension point
- `packages/foundry-module/src/types/foundry-globals.d.ts` — `Dnd5eAttributes.ac: { value: number }` already declared (line 254); `FoundryCombatant.actor: FoundryActor | null` (line 767)
- `packages/g2-app/src/internal/boot-engine-core.ts` — onNavigate gate pattern (lines 894-898), setPanelInstanceHandler('combat-tracker') (line 1330), setPanelInstanceHandler('canvas-character-sheet') (line 1020)
- `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — wsEventBus.subscribe at construction pattern (CHARACTER_DELTA_CHANNEL)
- `.planning/phases/EVF-23-combat-tracker-su-canvas-combatant-ac/23-CONTEXT.md` — locked decisions D-23.1..D-23.6

### Secondary (MEDIUM confidence)
- `.planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/21-03-SUMMARY.md` — documents key decisions from Phase 21 (Pitfall 2, getContainerCount={0,0}, renderMode gate)
- `.planning/REQUIREMENTS.md` — RCOMB-01, RDATA-05 requirement text

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing infrastructure verified in codebase
- Architecture (dual-interface panel): HIGH — direct mirror of CanvasCharacterSheetPanel, fully implemented and working
- AC reader pattern: HIGH — Dnd5eAttributes.ac already declared; combat-reader.ts extension point is clear
- wsEventBus wiring for combat.delta: HIGH — verified in canvas-status-hud-layer.ts and boot-engine-core.ts
- Canvas paint approach (Approach A vs B): MEDIUM — A recommended but either is valid

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (stable stack — 30 days)
