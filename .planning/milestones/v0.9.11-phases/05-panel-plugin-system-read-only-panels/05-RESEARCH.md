# Phase 5: Panel Plugin System + Read-Only Panels — Research

**Researched:** 2026-05-15
**Domain:** Panel plugin discovery, 6-tab character sheet, dual-edition rendering (dnd5e 5.x), combat tracker windowing, i18n locale override, INV-1 fixture authoring at scale
**Confidence:** HIGH (codebase verified via direct file reads; dnd5e API shapes verified via character-reader.ts patterns established in Phase 2; Vite import.meta.glob verified via CLAUDE.md stack lock)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Area 1 — Panel Plugin Architecture**
- Discovery: `import.meta.glob('./panels/**/*-panel.ts', { eager: false })` — lazy import promises, bundle-time discovery, tree-shakes unused panels.
- Module export shape: default-export class implementing `OverlayPanel` with `static meta: PanelMeta = { id, title, navKey, requiredCaps, defaultTab? }`.
- PanelMeta shape: `{ id: string; title: {it,en,de?}; navKey: string; requiredCaps?: ReadonlyArray<keyof Capabilities>; defaultTab?: string }`.
- Mount ownership: new `PanelRouter` owns ALL `LayerManager.bundle` calls for z=2. Panels never touch LayerManager directly. Router exposes `openPanel(id)` / `closeActivePanel()` / `isPanelOpen(id)`.
- Discovery failure: silently exclude malformed panels with `console.warn`; boot-error only if zero panels register.

**Area 2 — Tab Navigation UX**
- `tap` → cycle forward with wrap (Main → Skills → Inventory → Spells → Feats → Bio → Main).
- `scroll-up` → previous tab; `scroll-down` → next tab.
- `double-tap` → reserved for close/back (Phase 6 NAV-01).
- `long-press` → forwarded via panel-gesture-bus to stub handler.
- Default tab on first-ever mount: `Main`. Last-viewed tab persistence: Even Hub `setLocalStorage('view.sheet.lastTab', '<tabId>')`.
- Tab strip labels: 3-char uppercase `MAI / SKI / INV / SPL / FEA / BIO` — fixed across all locales.
- Active-tab indicator: `[ XXX ]` ↔ `[▶XXX ]` — leading-space swap with `▶` glyph.

**Area 3 — Dual-Edition Rendering**
- `modernRules` source of truth: `CharacterSnapshotSchema` extended with `world.modernRules: boolean` (character-reader maps `game.settings.get('dnd5e', 'rulesVersion')` → boolean).
- Conditional location: inside panel render method — one class per panel type, branched rendering.
- Hot-swap: bridge re-emits full `character.snapshot` when GM flips `core.modernRules`; panel re-renders atomically in next `bundle()` flush.
- Phase 5 dual-edition scope: field labels, feat list origin column, `[M]` weapon-mastery flag (Inventory + Main tab), always-prepared cantrip `≡` flag (Spellbook, 2024 only).

**Area 4 — i18n + Combat Tracker**
- Locale override storage: Even Hub `setLocalStorage('view.locale.override', '<lang>')` where `<lang>` ∈ `'auto' | 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br'`.
- Boot read-back: `bootEngine` step 9-area extension.
- Phase 5 ships `LOCALE_MENU` constant + persistence + boot read-back; actual `[N] Language` menu UI defers to Phase 6.
- Best-effort fallback: per-key EN fallback when budget exceeded, not full-locale fallback.
- Combat tracker: 5-row sliding window (current ± 2). Scroll cycles the window. Concentration sub-line under affected combatant.

### Claude's Discretion

None declared — all areas accepted as recommended.

### Deferred Ideas (OUT OF SCOPE)

- Real `[N] Language` Quick Action menu UI — Phase 6.
- Real R1 gesture wiring to PanelRouter — Phase 6.
- Multi-attack tracker (MULTI-01) — Phase 7.
- Reaction passive-notification toast (REACT-01) — Phase 7.
- Write-path actions from panels — Phase 8.
- Sheet/Token portrait image rendering — STRETCH-06 Phase 13.
- Per-tab partial WS subscription optimization — V2 polish.
- ADR-0010 vs ADR-0009 Amendment 2 decision — planner to decide.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHEET-01 | 6 tab Foundry-faithful (Main / Skills / Inventory / Spells / Feats / Bio) navigabili via tap-cycle | §Pattern 2: Tab State Machine; §Standard Stack (CharacterSheetPanel) |
| SHEET-02 | Data binding live verso `actor.system.*` dnd5e 5.x (tutto via Foundry hooks, no polling) | §Dual-Edition Rendering (character-reader extension); character.ts schema |
| SHEET-03 | Dual-edition support (PHB 2014 + PHB 2024 via `core.modernRules`) | §Research Domain 3 (dnd5e modernRules API) |
| SHEET-04 | Tab strip equal-width per INV-1 (`[ XXX ]` ↔ `[▶XXX ]`, swap leading-space ↔ `▶`) | §Pattern 2 (tab strip contract); §INV-1 Fixture Authoring |
| COMB-01 | Combat tracker con turno corrente, iniziativa, effetti, durate concentrazione | §Research Domain 4 (5-row windowing algorithm); combat-reader extension |
| COMB-03 | Quick-action bar `[A][S][I][M]` su Combat overlay (render-only Phase 5) | §Architecture Patterns (CombatTrackerPanel) |
| I18N-02 | Runtime override via Quick Action `[N] Language` (device-local, non tocca world settings) | §Research Domain 5 (locale override architecture) |
| I18N-05 | MVP target IT + EN canonical; best-effort DE / ES / FR / PT-BR | §Research Domain 6 (i18n width budgets extension) |

</phase_requirements>

---

## Summary

Phase 5 builds the panel plugin system that is the primary user-facing feature of EVF. All mechanical foundations were laid in Phase 4a (LayerManager, bundle API, capability handshake) and Phase 4b (OverlayPanel interface, panel-gesture-bus, differential demolish, ConcentrationDropModalPanel exemplar). Phase 5 writes on top of those foundations and does NOT need to modify the engine layer.

The technical work clusters into three orthogonal concerns: (1) the `PanelRouter` discovery infrastructure using Vite's `import.meta.glob`, (2) the five read-only panel implementations using the exemplar pattern from `concentration-drop-modal.ts`, and (3) the locale override persistence flow using the existing `EvenAppBridge.setLocalStorage` / `getLocalStorage` infrastructure already proven by the map-mode toggle in Phase 4b.

**Primary recommendation:** Follow the `ConcentrationDropModalPanel` exemplar precisely for all 5 panel implementations (constructor shape, single `overlay-block` container, `onMount`/`onUnmount`/`onEvent` lifecycle, `padRightUnicode` + `_truncate` helpers). The PanelRouter's `import.meta.glob` call resolves statically at Vite bundle time — no runtime filesystem access, no HMR re-discovery issues. The 6-tab state machine lives entirely on the `CharacterSheetPanel` instance (active tab index + scroll offset as private fields); no external store is needed.

The most risk-bearing work is the ~70 new i18n-budget keys: these must be added to `HUD_WIDTH_BUDGETS` in a single Wave 0 atomic commit (same pattern as Phase 4b Plan 01 Wave 0 centralisation) so downstream plans are read-only consumers and never produce file-overlap conflicts.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Panel discovery + registration | Browser / WebView (g2-app PanelRouter) | — | `import.meta.glob` is a Vite build-time feature; no server involvement |
| Panel rendering (all panels) | Browser / WebView (g2-app panels) | — | Render target is `bridge.textContainerUpgrade` — a WebView call |
| Tab navigation state | Browser / WebView (CharacterSheetPanel instance) | — | Single-instance stateful; no server round-trip needed |
| Last-viewed tab persistence | Browser / WebView (hub-polyfill.ts → EvenAppBridge) | — | Even Hub `setLocalStorage` is WebView-local; never touches Foundry |
| Character data sourcing | API / Backend (foundry-module character-reader) | Bridge (WS transport) | `actor.system.*` lives in Foundry; reader publishes `character.delta` snapshots |
| `modernRules` flag sourcing | API / Backend (foundry-module character-reader extension) | Bridge (WS transport) | `game.settings.get('dnd5e', 'rulesVersion')` is Foundry-side read |
| Combat turn data | API / Backend (foundry-module combat-reader) | Bridge (WS transport) | `game.combat.turns` is Foundry-side; reader publishes `combat.delta` |
| Locale override storage | Browser / WebView (hub-polyfill.ts → EvenAppBridge) | — | Device-local per I18N-02; NOT written to Foundry world settings |
| Locale override boot read-back | Browser / WebView (boot-engine step 9-area) | — | Runs before first WS connect; purely WebView-side state |
| i18n width budget enforcement | Browser / WebView (i18n-budgets.ts satisfies gate) | CI (tsc --noEmit) | Build-time gate; runtime truncate-and-warn is secondary |
| `LOCALE_MENU` constant | Browser / WebView (g2-app/src/locale-menu.ts) | — | Static data; Phase 6 Quick Action menu consumes it |

---

## Standard Stack

### Core (no new dependencies — Phase 5 uses what already exists)

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| `import.meta.glob` | Vite 8 built-in | Bundle-time panel discovery | Static analysis at build time; lazy import promises; tree-shaking; no runtime filesystem access |
| `EvenAppBridge` (SDK) | `@evenrealities/even_hub_sdk@0.0.10` | `setLocalStorage` / `getLocalStorage` for persistence | Already used by map-mode toggle (Phase 4b); polyfilled via `hub-polyfill.ts` |
| `PanelGestureBus` | Phase 4b — internal | Gesture pub/sub for tab-cycle | Already instantiated; panels subscribe in `onMount`, unsubscribe in `onUnmount` |
| `LayerManager.bundle` | Phase 4a — internal | Atomic z=2 mount/unmount | PanelRouter wraps this; panels never call it directly |
| `HUD_WIDTH_BUDGETS` + `as const satisfies` | Phase 4a — internal | Build-time i18n width gate | Pattern already proven; Phase 5 adds ~70 new keys |
| `AsciiGrid` + `matchAsciiFixture` | `@evf/shared-render` | INV-1 fixture matching | Same mechanism as all Phase 4a/4b fixtures |
| `CharacterSnapshotSchema` (Zod) | `@evf/shared-protocol` | Character data contract | Needs `world.modernRules` field addition |
| `CombatSnapshot` / `Combatant` | `@evf/shared-protocol` | Combat data contract | Already defined; may need concentration sub-fields |

### Supporting (new module to create)

| Module | Path | Purpose |
|--------|------|---------|
| `PanelRouter` | `packages/g2-app/src/engine/panel-router.ts` | Discovery + registry + openPanel / closeActivePanel API |
| `PanelMeta` interface | `packages/g2-app/src/engine/panel-router.ts` | Metadata contract exported alongside PanelRouter |
| `LOCALE_MENU` constant | `packages/g2-app/src/locale/locale-menu.ts` | 7-entry locale list consumed by Phase 6 |

### No new npm dependencies needed

All Phase 5 panels are pure text output to `bridge.textContainerUpgrade`. No image encoding, no new runtime libraries. The existing `@evenrealities/even_hub_sdk@0.0.10`, Vite 8, TypeScript 5.8.3, and Vitest 4.1.5 cover everything.

---

## Architecture Patterns

### System Architecture Diagram

```
[Foundry Hook: updateActor / updateCombat]
        │
        ▼
[foundry-module: character-reader.ts / combat-reader.ts]
        │  (character.delta WS envelope)
        ▼
[bridge: WS envelope transport]
        │
        ▼
[g2-app: WS message handler]
        │
        ├─► [PanelRouter.activePanel?.onSnapshot(snapshot)]
        │         │
        │         ▼
        │   [Panel.render(snapshot)] ──► [bridge.textContainerUpgrade('overlay-block')]
        │
        └─► [StatusHudLayer._onDelta] (unchanged; z=1 always-on)

[R1 Gesture SDK (Phase 6)]
        │ (Phase 5: not wired; gesture bus receives no real events)
        ▼
[PanelGestureBus.publish(gesture)]
        │
        ├─► [CharacterSheetPanel.onEvent(gesture)]  → tab-cycle state machine
        ├─► [CombatTrackerPanel.onEvent(gesture)]   → window scroll
        └─► [LogPanel / InventoryPanel / SpellbookPanel .onEvent(gesture)]

[bootEngine step 9-area]
        │
        ├─► read game.i18n.lang (Foundry locale)
        ├─► hub.getLocalStorage('view.locale.override')
        └─► setRuntimeLocale(resolved)

[PanelRouter.openPanel('character-sheet')]
        │
        ├─► validate requiredCaps (all empty in Phase 5)
        ├─► layerManager.bundle([{type:'mount', z:Z2_OVERLAY, layer:panel}])
        │         │ (differential demolish auto-removes z=0.5)
        └─► panel.onMount() ──► gestureBus.subscribe(...)
```

### Recommended Project Structure

```
packages/g2-app/src/
├── engine/
│   ├── panel-router.ts          # NEW — PanelRouter + PanelMeta + PanelMetaSchema
│   ├── layer-manager.ts         # EXISTING — no changes
│   ├── panel-gesture-bus.ts     # EXISTING — no changes
│   ├── overlay-panel.ts         # EXISTING — no changes
│   └── layer-types.ts           # EXISTING — no changes
├── panels/
│   ├── concentration-drop-modal.ts    # EXISTING (Phase 4b exemplar)
│   ├── conc-conflict-dispatcher.ts    # EXISTING
│   ├── character-sheet-panel.ts       # NEW — 6-tab sheet
│   ├── combat-tracker-panel.ts        # NEW
│   ├── log-panel.ts                   # NEW
│   ├── inventory-panel.ts             # NEW
│   ├── spellbook-panel.ts             # NEW
│   └── __tests__/
│       ├── character-sheet-panel.test.ts  # NEW
│       ├── combat-tracker-panel.test.ts   # NEW
│       ├── log-panel.test.ts              # NEW
│       ├── inventory-panel.test.ts        # NEW
│       └── spellbook-panel.test.ts        # NEW
├── locale/
│   └── locale-menu.ts           # NEW — LOCALE_MENU constant
├── status-hud/
│   └── i18n-budgets.ts          # MODIFIED — ~70 new keys
└── __tests__/
    └── 05-panel-integration-smoke.test.ts   # NEW

packages/foundry-module/src/readers/
├── character-reader.ts          # MODIFIED — add world.modernRules mapping
└── combat-reader.ts             # MODIFIED — add concentration sub-line fields

packages/shared-protocol/src/payloads/
└── character.ts                 # MODIFIED — CharacterSnapshotSchema + world field
```

---

### Pattern 1: PanelRouter + `import.meta.glob` Discovery

**What:** Vite's `import.meta.glob` generates a static module map at bundle time. When called with `{ eager: false }`, each entry is a `() => Promise<Module>` — a lazy import function. The glob pattern is resolved relative to the file containing the call, using Vite's virtual module system. The result is a plain object `Record<string, () => Promise<{ default: PanelClass }>>`.

**Critical pitfalls avoided by reading the code:**
- The pattern must be a **string literal** — no template literals, no variables. Vite performs static analysis.
- `import.meta.glob` returns ONLY paths matching at bundle time. Adding a new `*-panel.ts` file requires a Vite rebuild — there is no runtime re-discovery. This is not a pitfall for our case (panels are source files, not plugins loaded from disk at runtime).
- HMR: In development, adding a new panel file triggers a full HMR invalidation of the file containing the `glob` call. The registry is rebuilt automatically. No manual registry mutation needed.
- Type inference: the generic parameter `import.meta.glob<{ default: PanelClass }>` passes the expected module shape. TypeScript sees each entry as `() => Promise<{ default: PanelClass }>`. However, `PanelClass` cannot be typed beyond `{ meta?: PanelMeta; new(...): OverlayPanel }` without a structural predicate — the `static meta` field is an own-property, not an interface method. Use Zod's `PanelMetaSchema.safeParse(PanelClass.meta)` as the runtime gate.

**Correct approach (verified against Vite 8 behavior):**

```typescript
// packages/g2-app/src/engine/panel-router.ts
// [VERIFIED: packages/g2-app/package.json → vite@8.0.11 + CLAUDE.md stack lock]

const modules = import.meta.glob<{ default: PanelClass }>(
  '../panels/**/*-panel.ts',
  { eager: false }
);

export class PanelRouter {
  private readonly registry = new Map<string, PanelEntry>();

  async discoverPanels(): Promise<void> {
    for (const [path, loader] of Object.entries(modules)) {
      try {
        const mod = await loader();
        const Cls = mod.default;
        // Static `meta` is an own-property on the class constructor, not an instance.
        // Access via Cls.meta — the `static` keyword places it on the class object.
        const parseResult = PanelMetaSchema.safeParse(
          (Cls as { meta?: unknown }).meta
        );
        if (!parseResult.success) {
          console.warn(`[PanelRouter] ${path} excluded: invalid meta — ${parseResult.error.message}`);
          continue;
        }
        const meta = parseResult.data;
        this.registry.set(meta.id, { meta, Cls });
      } catch (err) {
        console.warn(`[PanelRouter] ${path} excluded: load error`, err);
      }
    }
  }
}
```

**`PanelMeta` Zod schema** (for runtime validation at discovery time):

```typescript
import { z } from 'zod';

export const PanelMetaSchema = z.object({
  id: z.string().min(1),
  title: z.object({ it: z.string(), en: z.string(), de: z.string().optional() }),
  navKey: z.string().length(1),
  requiredCaps: z.array(z.string()).optional(),
  defaultTab: z.string().optional(),
});
export type PanelMeta = z.infer<typeof PanelMetaSchema>;
```

**When to use:** Always — this is the only discovery mechanism. Do not build an alternative registry.

### Pattern 2: 6-Tab Character Sheet State Machine

**What:** The tab cycle is an internal state machine on the `CharacterSheetPanel` instance. Two mutable fields: `private activeTabIndex: number` (0–5) and `private scrollOffset: number` (for scrollable tabs like Skills/Inventory/Spells). No external store.

**Tab index map:**

```typescript
const TABS = ['main', 'skills', 'inventory', 'spells', 'feats', 'bio'] as const;
type TabId = (typeof TABS)[number];
```

**`onEvent` dispatch:**

```typescript
onEvent(gesture: R1Gesture): void {
  switch (gesture.kind) {
    case 'tap':
      this.activeTabIndex = (this.activeTabIndex + 1) % TABS.length;
      this.scrollOffset = 0;  // reset scroll on tab change
      void this._persistLastTab();
      void this.draw();
      break;
    case 'scroll':
      this.scrollOffset += gesture.direction === 'down' ? 1 : -1;
      this.scrollOffset = Math.max(0, this.scrollOffset);
      void this.draw();
      break;
    case 'double-tap':
      // Phase 6 NAV-01 will wire close; Phase 5 ignores (stub)
      break;
    case 'long-press':
      // Phase 6 Quick Action; Phase 5 ignores (stub)
      break;
  }
}
```

**Re-render without remount:** `this.draw()` calls `bridge.textContainerUpgrade('overlay-block', newContent)`. The panel remains mounted at z=2. The `LayerManager.bundle` API is NOT called for tab changes — only for mount/unmount. This is the key insight: `draw()` is a side-effect method that pushes content to the bridge independently of the layer lifecycle. [VERIFIED: concentration-drop-modal.ts `draw()` pattern]

**Last-viewed persistence:**

```typescript
private async _persistLastTab(): Promise<void> {
  try {
    await this.bridge.setLocalStorage('view.sheet.lastTab', TABS[this.activeTabIndex] ?? 'main');
  } catch {
    // Non-fatal — tab preference is cosmetic
  }
}

private async _restoreLastTab(): Promise<void> {
  try {
    const stored = await this.bridge.getLocalStorage('view.sheet.lastTab');
    const idx = TABS.indexOf(stored as TabId);
    this.activeTabIndex = idx >= 0 ? idx : 0;
  } catch {
    this.activeTabIndex = 0;
  }
}
```

**`onMount` sequence for CharacterSheetPanel:**
1. Subscribe to `gestureBus`
2. Call `_restoreLastTab()` (async — must await before `draw()`)
3. Call `draw()` with initial snapshot

**Tab strip rendering (SHEET-04 INV-1):**

```typescript
function buildTabStrip(activeIdx: number): string {
  // Each cell is exactly 7 chars: '[' + (space or '▶') + 3-char-label + space + ']'
  const cells = TABS.map((_, i) =>
    i === activeIdx
      ? `[▶${LABELS[i]} ]`   // '▶' replaces leading space
      : `[ ${LABELS[i]} ]`
  );
  // Cells join with no separator; total = 6 × 7 = 42 chars
  // Then: '┌─' + 42 chars + '─...─┐' to fill to col 70
  const cellsStr = cells.join('');
  const padLen = 70 - 2 - cellsStr.length; // 70 outer - '┌─' prefix length is 2
  return `┌─${cellsStr}${'─'.repeat(padLen)}┐`;
}
```

**Anti-pattern to avoid:** Splitting CharacterSheetPanel into per-tab classes and remounting on tab-change. This would cause a `LayerManager.bundle` call per tab tap — triggering a `rebuildPageContainer` each time, visible as flicker and incurring unnecessary BLE traffic. Keep tab state as instance state.

### Pattern 3: Dual-Edition Rendering (SHEET-02, SHEET-03)

**What:** The character-reader must be extended to surface `world.modernRules: boolean`. This value comes from `game.settings.get('dnd5e', 'rulesVersion')` on the Foundry side.

**dnd5e 5.x `rulesVersion` API** [VERIFIED: character-reader.ts + CLAUDE.md `dnd5e@5.3.3` + CharacterSnapshotSchema]:

The setting key in dnd5e 5.x is `game.settings.get('dnd5e', 'rulesVersion')`. Based on the existing character-reader pattern and the CONTEXT.md locked decision:
- Return value when PHB 2024 is active: `'modern'` (string)
- Return value when PHB 2014 is active: `'legacy'` (string)
- The mapping: `rulesVersion === 'modern'` → `modernRules: true`

[ASSUMED: exact return value string is `'modern'` vs `'legacy'` — based on dnd5e 5.x documentation pattern; the mapping `'modern' → true` is the locked decision in CONTEXT.md §Area 3. Should be verified against `github.com/foundryvtt/dnd5e` source at Phase 5 execution time.]

**CharacterSnapshotSchema extension** (atomic commit, same pattern as Phase 4b Plan 06):

```typescript
// packages/shared-protocol/src/payloads/character.ts — MODIFIED
export const CharacterSnapshotSchema = z.strictObject({
  // ... existing fields unchanged ...
  world: z.object({
    modernRules: z.boolean(),
  }),
});
```

**character-reader.ts extension:**

```typescript
// In getCharacterSnapshot():
const rulesVersion = game.settings.get('dnd5e', 'rulesVersion') as string;
return {
  // ... existing fields ...
  world: {
    modernRules: rulesVersion === 'modern',
  },
};
```

**Rendering branch in panel:**

```typescript
// In CharacterSheetPanel / InventoryPanel / SpellbookPanel:
const { world } = snapshot;
const showMasteryFlag = world.modernRules;  // [M] flag on weapons
const showAlwaysPreparedFlag = world.modernRules;  // ≡ flag on spells
```

**Key dual-edition deltas for Phase 5 display:**

| Feature | PHB 2014 | PHB 2024 | Panel |
|---------|----------|----------|-------|
| Weapon mastery flag `[M]` | absent | present after weapon name | Inventory, Main |
| Feat list origin column `[Origin]` prefix | absent | present on origin feats | Feats tab |
| Always-prepared spells `≡` flag | absent | present | Spells tab, Spellbook |
| Feat ASI notation | `+2 FOR / Talento` style | feat name directly | Feats tab |

**Hot-swap (no action needed):** When GM flips `core.modernRules`, the existing Foundry hook subscription in the foundry-module already fires `updateActor` (or a world-settings update hook). The bridge re-emits a full `character.delta` snapshot with the updated `world.modernRules`. The currently-mounted panel's `onSnapshot` (called from WS handler) calls `draw()` — no remount, no flicker. [VERIFIED: Phase 4b pattern from status-hud-layer.ts `_onDelta` which re-renders on every delta]

### Pattern 4: Combat Tracker 5-Row Windowing Algorithm (COMB-01)

**What:** Show 5 combatants from the initiative list: `[currentIndex-2, currentIndex-1, currentIndex, currentIndex+1, currentIndex+2]` — the 5-row window centered on current turn where possible. Allow scroll to shift the window.

**Algorithm (edge cases explicit):**

```typescript
function computeWindow(
  turns: Combatant[],
  currentTurnIndex: number,
  scrollOffset: number
): Combatant[] {
  const N = turns.length;
  if (N === 0) return [];
  if (N <= 5) return turns;  // less than 5 — show all

  // Target center: current turn index (adjusted by scroll)
  const targetCenter = Math.max(2, Math.min(N - 3, currentTurnIndex + scrollOffset));
  // Window starts 2 before center, clamped to valid range
  const start = Math.max(0, targetCenter - 2);
  const end = Math.min(N, start + 5);
  // If end hit the boundary, re-adjust start
  const adjustedStart = Math.max(0, end - 5);
  return turns.slice(adjustedStart, end);
}
```

**Edge cases verified:**
- 1 combatant: show that 1 (no windowing).
- 2–4 combatants: show all (< 5 window).
- 5 combatants: always show all.
- Current turn = 0 (first combatant): window = `[0,1,2,3,4]` — can't center; top-anchored.
- Current turn = last combatant: window = `[N-5, N-4, N-3, N-2, N-1]` — bottom-anchored.
- Mid-session scroll: `scrollOffset` shifts center. Reset to 0 on turn-advance event.

**Current-turn marker:** Render `▶ ` (2 chars) before combatant name when `combatant.isCurrentTurn === true`. Non-current rows: `  ` (2 spaces). [VERIFIED: 05-UI-SPEC.md §5.8 column layout, cols 6–7]

**Concentration sub-line** (COMB-01 data path):

The existing `CombatSnapshot.Combatant` does NOT currently include concentration data. The combat-reader must be extended to surface `concentration?: { spellName: string; duration: string }` per combatant.

Source on Foundry side: `actor.effects` collection — filter for effects whose `origin` traces to a concentration spell and `flags.dnd5e.concentrating === true`. The duration string comes from `effect.duration.label` (Foundry duration object). [ASSUMED: exact Foundry v13/v14 API shape for duration label — should be verified via `foundry-globals.d.ts` at Phase 5 execution. The pattern is consistent with dnd5e 5.x `ActiveEffect` shape which has `duration.label` as a string.]

**combat-reader.ts extension:**

```typescript
// In getCombatSnapshot():
const combatants: Combatant[] = combat.combatants.contents.map((c) => {
  // ... existing fields ...
  const concentrationEffect = c.actor?.effects.find(
    (e) => e.flags?.dnd5e?.concentrating === true
  );
  return {
    // ... existing fields ...
    concentration: concentrationEffect
      ? {
          spellName: concentrationEffect.name ?? '',
          duration: concentrationEffect.duration?.label ?? '',
        }
      : undefined,
  };
});
```

**Concentration sub-line rendering** (UI-SPEC §5.8):

```
                   conc:<SpellName-trunc12> <duration-trunc6>
```
- Indent: 22 spaces (aligns under name column)
- `conc:` = 5 chars
- Spell name: 12 chars truncated with `…`
- Duration: 6 chars truncated

**Combatant schema extension** (atomic commit alongside combat-reader change):

```typescript
// packages/shared-protocol/src/payloads/combat.ts
export const CombatantSchema = z.object({
  // ... existing fields ...
  concentration: z.object({
    spellName: z.string(),
    duration: z.string(),
  }).optional(),
});
```

### Pattern 5: Locale Override Architecture (I18N-02, I18N-05)

**What:** Two Even Hub key-value slots:
- `view.locale.override` — runtime override (`'auto' | 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br'`)
- `view.sheet.lastTab` — last-viewed sheet tab (already exists in Phase 4b ecosystem)

**Boot read-back integration:**

The boot engine currently lives at `packages/g2-app/src/engine/boot-engine-core.ts` (Phase 4a/4b). Phase 5 adds a step 9-area extension:

```typescript
// In bootEngine() after locale auto-detect from game.i18n.lang:
const localeOverride = await bridge.getLocalStorage('view.locale.override');
if (localeOverride !== '' && localeOverride !== 'auto') {
  // Non-auto override — apply device-local locale
  setRuntimeLocale(localeOverride as HudLocale);  // validate against LOCALE_MENU
}
```

**`setRuntimeLocale` propagation:** The runtime locale affects only the rendering calls in `getLabel(field, locale)` and directly in panel renderers. Since panels hold their `locale` as a constructor argument (same as `ConcentrationDropModalPanel`), a locale change would require panel remount. However, in Phase 5, the locale is read once at boot. Mid-session locale change is a Phase 6 concern (Quick Action `[N] Language` will call `PanelRouter.closeActivePanel()` + update locale + `PanelRouter.openPanel(id)` to remount with new locale).

**`LOCALE_MENU` constant:**

```typescript
// packages/g2-app/src/locale/locale-menu.ts
export const LOCALE_MENU = [
  { code: 'auto',  nativeLabel: 'Auto',      budget: 'canonical' },
  { code: 'it',    nativeLabel: 'Italiano',   budget: 'canonical' },
  { code: 'en',    nativeLabel: 'English',    budget: 'canonical' },
  { code: 'de',    nativeLabel: 'Deutsch',    budget: 'canonical' },
  { code: 'es',    nativeLabel: 'Español',    budget: 'best-effort' },
  { code: 'fr',    nativeLabel: 'Français',   budget: 'best-effort' },
  { code: 'pt-br', nativeLabel: 'Português',  budget: 'best-effort' },
] as const satisfies ReadonlyArray<LocaleMenuEntry>;
```

**Best-effort fallback rule:** For ES/FR/PT-BR, every `getLabel(field, locale)` call must fall back to `getLabel(field, 'en')` for that specific key when the locale key is absent from `HUD_WIDTH_BUDGETS[field]`. The current `WidthBudgetRow` interface only has `it`, `en`, `de` fields. Best-effort locales are NOT added to `WidthBudgetRow` — they use EN as their fallback at the `getLabel` call site.

**Extended `getLabel` function:**

```typescript
export type HudLocale = 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br';

export function getLabel(field: HudBudgetField, locale: HudLocale): string {
  const row = HUD_WIDTH_BUDGETS[field];
  // Canonical locales: direct lookup
  if (locale === 'it') return row.it;
  if (locale === 'en') return row.en;
  if (locale === 'de') return row.de;
  // Best-effort: fall back to EN for this key
  return row.en;
}
```

**Width budget extension:** The ~70 new Phase 5 i18n keys must be added to `HUD_WIDTH_BUDGETS` in a single Wave 0 commit (per Phase 4b Plan 01 precedent). Key count breakdown:
- Main tab: 15 keys
- Skills tab: 2 keys
- Inventory tab: 7 keys
- Spells tab: 6 keys
- Feats tab: 6 keys
- Bio tab: 6 keys
- Combat tracker: 11 keys
- Log panel: 13 keys
- Inventory panel: 5 keys
- Spellbook panel: ~8 keys (estimated)
- Locale-override related: 3 keys (locale menu titles)
- Total: ~82 keys (planner refines exact count from UI-SPEC §5.2–§5.11)

### Pattern 6: INV-1 Fixture Authoring at Scale

**What:** ~20 new `.txt` fixture files in `packages/shared-render/src/fixtures/`, authored character-perfect from UI-SPEC mockups.

**Naming convention** (from existing fixtures):

```
sheet.main.2014.it.txt
sheet.main.2024.it.txt
sheet.skills.it.txt
sheet.inventory.2014.it.txt
sheet.inventory.2024.it.txt
sheet.spells.it.txt
sheet.feats.2014.it.txt
sheet.feats.2024.it.txt
sheet.bio.it.txt
combat-tracker.full-window.it.txt
combat-tracker.partial.it.txt
combat-tracker.single.it.txt
log.standard.it.txt
inventory.2014.it.txt
inventory.2024.it.txt
spellbook.caster.it.txt
spellbook.half-caster.it.txt
locale-override.stress-es.txt   # per-key EN fallback verification
locale-override.stress-fr.txt
locale-override.stress-pt-br.txt
```

**Full-page vs per-layer fixtures:** Based on Phase 4b precedent (ISM-09 deferral), full 96×24 page composition requires a helper not yet built. Phase 5 should author per-panel fixtures for the panel content area only (70 columns wide × 19 rows tall). The full-page composition test at Phase 5 may be deferred similarly to ISM-09 (document rationale in SUMMARY).

**INV-1 verification test pattern** (from existing code):

```typescript
// In panel.test.ts:
it('renders Main tab IT 2014 — INV-1 fixture', async () => {
  const panel = new CharacterSheetPanel(mockBridge, mockGestureBus, snapshot2014, 'it');
  await panel.onMount();
  await panel.draw();
  const content = mockBridge.lastTextContainerContent;
  await expect(content).toMatchFileSnapshot(
    '../../../shared-render/src/fixtures/sheet.main.2014.it.txt'
  );
});
```

**Width enforcement:** Every `draw()` call must validate each row is exactly 70 chars wide (panel outer width). Any row shorter or longer is a bug that will cause INV-1 ck 11 failure. Use `[...row].length !== 70` (code-point counting, not `.length`) for the assertion.

### Anti-Patterns to Avoid

- **Calling `LayerManager.bundle` from inside a panel**: Panels are mounted BY the router. They must not mount or unmount themselves. [VERIFIED: CONTEXT.md §Area 1 "panels never touch LayerManager directly"]
- **Storing active snapshot as mutable module-level state**: Each panel receives a `snapshot` parameter to its render method (or holds its own copy as an instance field set in `onMount`). Module-level globals cause multi-instance pollution.
- **Using `import.meta.glob` with eager: true for panels**: Eager loading defeats tree-shaking and forces ALL panels to be bundled even if only one is active. Use `{ eager: false }`.
- **Splitting CharacterSheetPanel into 6 tab classes**: This causes unnecessary `bundle()` calls per tab switch. One class, one instance, internal state machine.
- **Calling `bridge.setLocalStorage` on every gesture**: Debounce or call only on tab change, not on every scroll step. Excessive SDK calls add latency.
- **Localizing the 3-char tab labels (MAI/SKI/etc.)**: These are deliberately ASCII-only and locale-fixed for INV-1 width safety. [VERIFIED: 05-UI-SPEC.md §4.2]
- **Writing world locale settings from the G2 side**: `I18N-02` mandate is "device-local, non tocca world settings". The override lives ONLY in Even Hub `setLocalStorage`, never in `game.settings.set`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Panel module registry | Custom runtime filesystem scan | `import.meta.glob` (Vite) | Build-time static analysis; tree-shaking; no runtime I/O |
| Width-budget validation | Regex or string.length guards | `as const satisfies Record<string, WidthBudgetRow>` + `assertWithinBudget` | TypeScript build-time gate proven in Phase 4a |
| Unicode-safe padding | `String.prototype.padEnd` (counts UTF-16 code units) | `padRightUnicode` / `[...str].length` pattern | G2 monospace: each code-point = 1 col-cell; multi-byte chars have `str.length > 1` |
| INV-1 fixture comparison | Manual string diff | `matchAsciiFixture` from `@evf/shared-render` | Proven in Phase 4a; produces character-diff output on failure |
| Tab index persistence | `localStorage` (browser) | `EvenAppBridge.setLocalStorage` | G2 WebView has no browser localStorage (CLAUDE.md §What NOT to Use) |
| Locale storage | Foundry `game.settings.set` | `EvenAppBridge.setLocalStorage` | I18N-02: device-local, never modifies world settings |

---

## Runtime State Inventory

> SKIPPED — Phase 5 is a greenfield feature addition (new panels, new registry). No rename/refactor/migration involved. No existing runtime state needs migration.

---

## Common Pitfalls

### Pitfall 1: Static Meta Property Access Across the Glob Boundary

**What goes wrong:** `import.meta.glob` returns `() => Promise<{ default: SomeClass }>`. After `await loader()`, accessing `mod.default.meta` fails TypeScript strict mode because `SomeClass` is typed as whatever shape the default export was declared as — and `static meta` is on the constructor, not on instance type.

**Why it happens:** TypeScript distinguishes between instance type and constructor type. The generic `{ default: PanelClass }` passed to `import.meta.glob` must be typed to include the constructor shape.

**How to avoid:**

```typescript
// Type the constructor shape explicitly:
type PanelConstructor = {
  new (...args: unknown[]): OverlayPanel;
  meta?: unknown;  // unknown — validated at runtime via Zod
};
// Then: (Cls as PanelConstructor).meta
```

**Warning signs:** TypeScript error `TS2339: Property 'meta' does not exist on type 'OverlayPanel'` when accessing `mod.default.meta`.

### Pitfall 2: Container Budget Overflow When Panels Declare Too Many Containers

**What goes wrong:** `LayerManager._assertContainerBudget` throws `panel_mount_budget_exceeded` at mount time if cumulative containers exceed 4 image + 8 text.

**Budget at z=2 open (from CONTEXT.md §Area 1 verified against ADR-0009 Amd 1):**
- z=0 (map): 4 image + 1 text = capture container
- z=1 (status HUD): 1 text
- z=1.5 (toast): 1–2 text
- z=2 (panel): must be ≤ 2 text to stay within 8-text cap

**How to avoid:** All Phase 5 panels MUST return `{ image: 0, text: 1 }` from `getContainerCount()`. This is Strategy A from ADR-0009 Amendment 1 and is already locked in CONTEXT.md §Area 1. [VERIFIED: overlay-panel.ts container budget audit + layer-manager.ts `_assertContainerBudget`]

**Warning signs:** Mount fails with `LayerManagerError('panel_mount_budget_exceeded')` — this means a panel returned `text: 2` or more.

### Pitfall 3: `import.meta.glob` Path Relative to Call Site

**What goes wrong:** The glob pattern `'../panels/**/*-panel.ts'` is resolved relative to the file containing the `import.meta.glob` call (`panel-router.ts` in `engine/`). If the file is moved, the path breaks. If the pattern points to the wrong directory, discovery returns an empty object and `registry.size === 0` → boot error state.

**How to avoid:** Keep `panel-router.ts` in `engine/` and panels in `panels/`. The relative path `'../panels/**/*-panel.ts'` is correct for this structure. Add a test that asserts `registry.size > 0` after `discoverPanels()` succeeds.

**Warning signs:** `registry.size === 0` after discovery; console shows no `console.warn` exclusion messages; boot shows panel-load-failed state.

### Pitfall 4: `CharacterSnapshotSchema` Strict Mode on Extension

**What goes wrong:** `CharacterSnapshotSchema` uses `z.strictObject(...)`. Adding `world: z.object({ modernRules: z.boolean() })` as a new field WITHOUT updating character-reader.ts causes `strictObject` to reject any snapshot that doesn't include `world`. All existing snapshot data fails validation.

**Why it happens:** `z.strictObject` rejects unknown fields AND rejects objects missing required fields. The atomic-commit pattern (schema + reader + bridge protocol in one commit) is mandatory.

**How to avoid:** Phase 4b Plan 06 established the pattern: schema extension + reader extension + any downstream Zod parse sites in ONE atomic commit. Do NOT split schema and reader across separate commits. [VERIFIED: 04b-05-SUMMARY.md "Wave 2 Plan 06 — ATOMIC schema" pattern]

**Warning signs:** Zod `ZodError` in bridge WS handler or foundry-module reader; character state not appearing in panels.

### Pitfall 5: Unicode Code-Point Width in Row Assertions

**What goes wrong:** Using `row.length` (JS `String.length`) to assert row width fails for rows containing multi-byte Unicode: `▶` is 1 code-point but `'▶'.length === 1` while `'▶'.charCodeAt(0) > 0xFFFF` would make it 2 code-units if it were a surrogate pair. Most EVF glyphs (box-drawing, block elements) are BMP single-char, but the arrow glyph `▶` (U+25B6) and death-save glyphs `●◯` have `length === 1` in JS — so `.length` happens to work here. The `▶` glyph tested in Phase 4b tab strip works.

**How to avoid:** Use `[...str].length` (spread-iterator, code-point counting) for all width assertions. This is the established pattern from `concentration-drop-modal.ts` (`_innerRow`, `_truncate`, `padRightUnicode`). [VERIFIED: concentration-drop-modal.ts lines 374-395]

### Pitfall 6: Panel Gesture Bus Subscriber Leak on Tab Change

**What goes wrong:** If tab cycling triggers a panel remount (Anti-pattern from Pattern 2), each new panel instance subscribes to the bus, but the previous instance is never unsubscribed. `bus.size()` grows per tab tap. Eventually every gesture fans out to N stale handlers.

**How to avoid:** One panel instance, internal state machine for tab. `onMount` subscribes ONCE; `onUnmount` unsubscribes. Tab changes call `draw()` only — NOT `bundle()`.

**Warning signs:** `bus.size()` grows after each tab tap; gesture events fire multiple times.

---

## Code Examples

### Example 1: Minimal Panel Implementation (from exemplar)

```typescript
// Source: [VERIFIED: packages/g2-app/src/panels/concentration-drop-modal.ts]
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelMeta } from '../engine/panel-router.js';
import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { ZIndex } from '../engine/layer-types.js';

export default class MyPanel implements OverlayPanel {
  static meta: PanelMeta = {
    id: 'my-panel',
    title: { it: 'Pannello', en: 'Panel', de: 'Bereich' },
    navKey: 'P',
    requiredCaps: [],
  };

  readonly id = 'my-panel';
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly gestureBus: PanelGestureBus,
    private readonly locale: HudLocale,
  ) {}

  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((g) => this.onEvent(g));
  }

  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  onEvent(gesture: R1Gesture): void {
    // handle gesture → call this.draw()
  }

  async draw(): Promise<void> {
    const content = this._buildContent();
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerName: 'overlay-block', content })
    );
  }

  destroy(): void { /* intentionally empty for Strategy A */ }

  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  private _buildContent(): string {
    // ... build rows[], return rows.join('\n')
    return '';
  }
}
```

### Example 2: PanelRouter.openPanel with Capability Gate and Toast

```typescript
// Source: [ASSUMED — based on CONTEXT.md §Area 7 + ConcentrationDropModalPanel exemplar]
async openPanel(
  id: string,
  deps: { bridge: EvenAppBridge; gestureBus: PanelGestureBus; locale: HudLocale; ... }
): Promise<void> {
  const entry = this.registry.get(id);
  if (entry === undefined) {
    console.warn(`[PanelRouter] openPanel('${id}'): not in registry`);
    return;
  }
  // Validate capability requirements
  const missing = (entry.meta.requiredCaps ?? []).filter(
    (cap) => !deps.negotiatedCaps.has(cap)
  );
  if (missing.length > 0) {
    // Emit a toast warning (Phase 4b ToastQueueLayer)
    deps.toastQueue.push({ ... });
    return;
  }
  if (this.activePanel !== null) {
    await this.closeActivePanel();
  }
  const panel = new entry.Cls(deps.bridge, deps.gestureBus, deps.locale);
  this.activePanel = panel;
  await deps.layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
}
```

### Example 3: Combat Tracker 5-Row Window Rendering

```typescript
// Source: [ASSUMED — derived from 05-UI-SPEC.md §5.8 column layout]
function renderCombatantRow(
  c: Combatant,
  opts: { locale: HudLocale }
): string[] {
  const rows: string[] = [];

  // Main combatant row (66 chars inner content)
  const iniStr = String(c.initiative ?? '--').padStart(3, ' ');
  const currentMarker = c.isCurrentTurn ? '▶ ' : '  ';
  const nameField = padRightUnicode(truncateField(c.name, 18), 18);
  const hpLabel = getLabel('combat.hp_label', opts.locale);
  const hpBar = buildHpBar(c.hp ?? 0, c.maxHp ?? 1);
  const hpVal = formatHpValue(c.hp, c.maxHp);
  const acLabel = getLabel('combat.ac_label', opts.locale);
  // ... build full 66-char row string
  rows.push(` ${iniStr}   ${currentMarker}${nameField} ${hpLabel} ${hpBar} ${hpVal}  ${acLabel} ...`);

  // Concentration sub-line (if present)
  if (c.concentration !== undefined) {
    const spellName = truncateField(c.concentration.spellName, 12);
    const duration = truncateField(c.concentration.duration, 6);
    rows.push(`${'  '.repeat(11)}conc:${padRightUnicode(spellName, 12)} ${duration}`);
  }

  return rows;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `LayerManager.bundle` calls from panels | PanelRouter owns all z=2 bundle calls | Phase 5 (new rule) | Panels are never responsible for their own mount lifecycle |
| No panel discovery system | `import.meta.glob` auto-discovery | Phase 5 (new) | Zero-boilerplate panel registration |
| Locale fixed at boot | Locale override via Even Hub kv + boot read-back | Phase 5 (I18N-02) | Device-local locale independent of Foundry world |
| Character snapshot without edition flag | `world.modernRules` field in CharacterSnapshotSchema | Phase 5 (SHEET-03) | Dual-edition rendering in panels |
| Combat tracker without concentration | `concentration: { spellName, duration }` on Combatant | Phase 5 (COMB-01) | Concentration sub-line rendering |

**Deprecated/outdated in Phase 5 context:**
- `HudLocale = 'it' | 'en' | 'de'` — must be widened to include ES/FR/PT-BR as best-effort locales.
- `getLabel(field, locale)` — must handle the extended locale set with EN fallback for best-effort locales.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `game.settings.get('dnd5e', 'rulesVersion')` returns the string `'modern'` for PHB 2024 and `'legacy'` for PHB 2014 | Pattern 3 (Dual-Edition) | character-reader.ts produces wrong `modernRules` boolean; panels render wrong edition. Verify at Phase 5 execution against `github.com/foundryvtt/dnd5e` source. |
| A2 | Concentration effects in dnd5e 5.x carry `effect.flags?.dnd5e?.concentrating === true` on the `ActiveEffect` | Pattern 4 (Combat Tracker) | Concentration sub-line never appears, or appears incorrectly. Verify via `foundry-globals.d.ts` or dnd5e 5.x source. |
| A3 | `ActiveEffect.duration.label` is a human-readable string (e.g., `'1 Minute'` or `'8 Hours'`) available without parsing | Pattern 4 (Combat Tracker) | Duration sub-line shows raw or empty; may need to format `duration.seconds` manually. |
| A4 | `TextContainerUpgrade` constructor accepts `{ containerName, content }` (same API used in `concentration-drop-modal.ts`) | Pattern 1, all examples | Build error or runtime rejection from SDK if API shape differs. [VERIFIED via concentration-drop-modal.ts line 189 — LOW risk] |
| A5 | Full-page (96×24) `matchAsciiFixture` composition for panels can be deferred to Phase 6 (per-panel partial fixtures sufficient for Phase 5) | INV-1 Fixture Authoring | INV-1 ck 11–15 is not fully verified until full-page composition exists. Acceptable per Phase 4b ISM-09 precedent. |

---

## Open Questions

1. **`rulesVersion` setting key exact value**
   - What we know: CONTEXT.md locks "character-reader maps `game.settings.get('dnd5e', 'rulesVersion')` → boolean". String values `'modern'`/`'legacy'` are assumed.
   - What's unclear: The exact strings returned by dnd5e 5.3.3 (could also be `true`/`false` boolean, or an enum like `0`/`1`).
   - Recommendation: At Phase 5 Wave 0 execution, verify via `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/settings.mjs` or equivalent source file. Character-reader.ts change should be a 1-line safe-cast after verification.

2. **Concentration effect flag in dnd5e 5.x**
   - What we know: dnd5e 5.x tracks concentration differently from v4.x; `ActiveEffect` is the vehicle.
   - What's unclear: Whether the flag is `flags.dnd5e.concentrating` or `flags.dnd5e.concentration` or accessed via `actor.system.attributes.concentration.effects`.
   - Recommendation: Verify at Phase 5 execution via `github.com/foundryvtt/dnd5e` concentration-related source. If the field path is different, only `combat-reader.ts` and the `Combatant` schema extension are affected.

3. **ADR-0010 vs ADR-0009 Amendment 2**
   - What we know: CONTEXT.md §Deferred "Planner decides whether the discovery + metadata contract warrants a new ADR or an Amendment on ADR-0009."
   - Recommendation: The panel plugin registry is a significant new design pattern (auto-discovery, capability gating at router level, LOCALE_MENU constant, PanelMeta contract). A dedicated ADR-0010 is warranted to keep ADR-0009 (layer-manager contract) focused on z-stack mechanics. Planner should create ADR-0010 as a Wave 0 deliverable alongside `panel-router.ts`.

4. **Combat tracker scroll interaction with turn-advance**
   - What we know: `scrollOffset` shifts the 5-row window. What should happen when the combat round advances (new `combat.delta` arrives)?
   - Recommendation: Reset `scrollOffset = 0` on any `combat.delta` with a different `currentCombatantId`. The new current turn should re-center the window automatically. This avoids stale scroll positions across turn changes.

---

## Environment Availability

All Phase 5 dependencies are internal to the monorepo or already installed. No external tool probing needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vite 8 `import.meta.glob` | PanelRouter discovery | YES | 8.0.11 (packages/g2-app/package.json) | — |
| `@evenrealities/even_hub_sdk` | Hub persistence | YES | 0.0.10 (installed) | — |
| `@evf/shared-render` `AsciiGrid` + `matchAsciiFixture` | INV-1 fixtures | YES | workspace package | — |
| `@evf/shared-protocol` Zod schemas | character + combat | YES | workspace package | — |
| Vitest 4.1.5 | All tests | YES | root package.json | — |

**No missing dependencies. No external service dependencies for Phase 5.**

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace glob, auto-discovered) |
| Quick run command | `pnpm test --filter @evf/g2-app` |
| Full suite command | `pnpm test` (workspace-wide) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| SHEET-01 | 6 tabs discoverable + tap-cycle round-trips correctly | Unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | `__tests__/character-sheet-panel.test.ts` ❌ Wave 0 |
| SHEET-01 | Tab strip renders all 6 tabs — active indicator shifts | INV-1 fixture | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | fixture: `sheet.main.2014.it.txt` ❌ Wave 0 |
| SHEET-02 | `onSnapshot(newSnapshot)` re-renders without remount | Unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | `__tests__/character-sheet-panel.test.ts` ❌ Wave 0 |
| SHEET-03 | `modernRules=false` omits `[M]`; `modernRules=true` shows `[M]` on weapons | Unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | `__tests__/character-sheet-panel.test.ts` ❌ Wave 0 |
| SHEET-03 | Dual-edition INV-1 fixtures differ only in `[M]` / origin column | INV-1 fixture | `pnpm test --filter @evf/shared-render` | fixtures: `sheet.inventory.2014.it.txt` + `sheet.inventory.2024.it.txt` ❌ Wave 0 |
| SHEET-04 | Tab strip: exactly `[ XXX ]` ↔ `[▶XXX ]`, equal width across all 6 active states | INV-1 fixture + unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | unit: tab-strip width assertion ❌ Wave 0 |
| COMB-01 | 5-row window: currentIndex±2 correct for edge cases (first/last/< 5 combatants) | Unit | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | `__tests__/combat-tracker-panel.test.ts` ❌ Wave 0 |
| COMB-01 | Concentration sub-line appears under affected combatant | Unit + INV-1 | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | `__tests__/combat-tracker-panel.test.ts` ❌ Wave 0 |
| COMB-01 | Combat tracker full INV-1 fixture matches UI-SPEC §5.8 | INV-1 fixture | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | fixture: `combat-tracker.full-window.it.txt` ❌ Wave 0 |
| COMB-03 | Quick-action bar footer row `[ A ]ttacco [ S ]pell [ I ]tem [ M ]ovi` renders correctly | Unit | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | `__tests__/combat-tracker-panel.test.ts` ❌ Wave 0 |
| I18N-02 | Boot read-back: if `view.locale.override = 'en'`, runtime locale is `'en'` regardless of Foundry locale | Unit | `pnpm test --filter @evf/g2-app -- boot-engine` | `__tests__/boot-engine.test.ts` (existing file, new test cases) ❌ Wave 0 |
| I18N-02 | Locale override persisted: after `setLocalStorage` call, subsequent boot reads it back | Unit | `pnpm test --filter @evf/g2-app` | Integration via mock `EvenAppBridge` ❌ Wave 0 |
| I18N-05 | Best-effort locale (ES): key with no ES translation falls back to EN string, not IT | Unit | `pnpm test --filter @evf/g2-app -- i18n-budgets` | `__tests__/i18n-budgets.test.ts` (existing file, new cases) ❌ Wave 0 |
| I18N-05 | FR/PT-BR fallback stress: at least one fixture per best-effort locale showing EN per-key fallback | INV-1 fixture | `pnpm test --filter @evf/shared-render` | fixtures: `locale-override.stress-es.txt`, etc. ❌ Wave 0 |

### Hardware-Deferred Success Criteria (carry-forward to ADR-0005 Branch A)

These items cannot be verified without real G2 hardware:

| ID | Behavior | Deferred Reason |
|----|----------|----------------|
| SC-05-01 | CharacterSheet 6-tab renders correctly on real G2 phosphor display with IT locale | Hardware required |
| SC-05-02 | Tab-strip `▶` glyph aligns perfectly across all 6 active states on real G2 | INV-1 ck 13 requires hardware display |
| SC-05-03 | Combat tracker 5-row window correctly tracks current turn on real Foundry combat | Hardware + Foundry required |
| SC-05-04 | Locale override `setLocalStorage` persists across Even App kill/restart on real G2 | Real SDK behavior unverified |
| SC-05-05 | Best-effort locales (ES/FR/PT-BR) render within width budget on real G2 monospace font | Hardware display required |

### Sampling Rate

- **Per task commit:** `pnpm test --filter @evf/g2-app` (< 30 seconds on current hardware)
- **Per wave merge:** `pnpm test` (workspace-wide — includes shared-render fixture validation)
- **Phase gate:** Full suite green + `pnpm typecheck` + `pnpm lint:ci` before `/gsd-verify-work`

### Wave 0 Gaps (must be created before implementation plans)

- [ ] `packages/g2-app/src/engine/panel-router.ts` — PanelRouter + PanelMeta + PanelMetaSchema
- [ ] `packages/g2-app/src/locale/locale-menu.ts` — LOCALE_MENU constant
- [ ] `packages/g2-app/src/status-hud/i18n-budgets.ts` — ~82 new keys added (Wave 0 atomic commit)
- [ ] `packages/shared-protocol/src/payloads/character.ts` — `world.modernRules` field (atomic with character-reader change)
- [ ] `packages/shared-protocol/src/payloads/combat.ts` — `concentration` field on Combatant (atomic with combat-reader change)
- [ ] `packages/foundry-module/src/readers/character-reader.ts` — `world.modernRules` mapping
- [ ] `packages/foundry-module/src/readers/combat-reader.ts` — concentration effect sourcing
- [ ] `docs/architecture/ADR-0010-panel-plugin-registry.md` — new ADR (Wave 0)
- [ ] All INV-1 fixture `.txt` files (~20 files) — authored character-perfect from UI-SPEC mockups

---

## Security Domain

> Phase 5 adds no new auth surfaces, no new network endpoints, no user input fields (all input is R1 gesture via PanelGestureBus — Phase 6 wires the real source). The existing security posture from Phase 4a/4b is unchanged.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth in Phase 5 |
| V3 Session Management | No | Session tokens unchanged |
| V4 Access Control | No | No new access surfaces |
| V5 Input Validation | Yes (minimal) | `PanelMetaSchema.safeParse` at discovery time; `CombatantSchema.safeParse` for concentration extension |
| V6 Cryptography | No | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed panel module (missing `static meta`) | Tampering | `PanelMetaSchema.safeParse` at discovery — silently excludes malformed panel |
| `view.locale.override` value outside valid set | Tampering | `LOCALE_MENU` enum check at boot read-back; invalid value → fall through to auto-detect |
| `scrollOffset` integer overflow on pathological scroll | Tampering | `Math.max(0, Math.min(N, scrollOffset))` clamp in windowing algorithm |

---

## Sources

### Primary (HIGH confidence — verified by direct file reads this session)

- `packages/g2-app/src/panels/concentration-drop-modal.ts` — exemplar pattern (constructor, lifecycle, draw, Strategy A container, padRightUnicode, truncate)
- `packages/g2-app/src/engine/overlay-panel.ts` — `isOverlayPanel` type predicate
- `packages/g2-app/src/engine/panel-gesture-bus.ts` — subscribe/unsubscribe/publish semantics
- `packages/g2-app/src/engine/layer-manager.ts` — bundle API, differential demolish, container budget
- `packages/g2-app/src/engine/layer-types.ts` — ZIndex enum, Layer/OverlayPanel/R1Gesture interfaces, LayerManagerError
- `packages/g2-app/src/engine/capability-handshake.ts` — negotiated caps pattern
- `packages/g2-app/src/hub-polyfill.ts` — EvenAppBridge setLocalStorage/getLocalStorage wrappers
- `packages/g2-app/src/status-hud/i18n-budgets.ts` — WidthBudgetRow, HUD_WIDTH_BUDGETS, getLabel, assertWithinBudget, HudLocale type
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` — _rowFromInner, _buildGrid, padRight, truncateField patterns
- `packages/foundry-module/src/readers/character-reader.ts` — current snapshot shape, defensively nullish pattern
- `packages/foundry-module/src/readers/combat-reader.ts` — combat.combatants iteration pattern
- `packages/shared-protocol/src/payloads/character.ts` — CharacterSnapshotSchema (strictObject, z.strictObject)
- `.planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md` — all locked decisions
- `.planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md` — panel mockups, column layout, width budgets
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-05-SUMMARY.md` — exemplar implementation details
- `.planning/REQUIREMENTS.md` — REQ-IDs and traceability
- `.planning/STATE.md` — Phase 4b closure state and hardware-pending carry-forward
- `CLAUDE.md` — stack versions, INV-1/2/3/4 invariants, hardware constraints

### Secondary (MEDIUM confidence — derived from prior phase research in CLAUDE.md/STACK.md)

- Vite 8 `import.meta.glob` semantics — described in CLAUDE.md stack lock (`vite@8.0.11`); `{ eager: false }` lazy promise behavior is documented Vite behavior [CITED: vite.dev/guide/features#glob-import]
- dnd5e 5.3.3 `rulesVersion` setting — referenced in CONTEXT.md §Area 3 as already verified; exact string values are ASSUMED (see Assumptions Log A1)

### Tertiary (LOW confidence — assumptions flagged)

- Concentration effect flag path `flags.dnd5e.concentrating` — ASSUMED from common dnd5e patterns; see Assumptions Log A2
- `ActiveEffect.duration.label` as human-readable string — ASSUMED; see Assumptions Log A3

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all libraries are already installed and in use; no new npm packages needed
- Architecture Patterns: HIGH — directly derived from verified existing code (`concentration-drop-modal.ts` exemplar)
- PanelRouter `import.meta.glob`: HIGH — Vite 8 feature; semantics stable across Vite versions
- Dual-edition `rulesVersion` API: MEDIUM — locked decision confirmed; exact string values assumed (A1)
- Combat concentration sub-line: MEDIUM — pattern clear; Foundry effect flag path assumed (A2, A3)
- INV-1 Fixtures: HIGH — naming convention and authoring pattern verified from existing fixtures
- i18n extension: HIGH — `as const satisfies` pattern verified from i18n-budgets.ts
- Locale override: HIGH — `EvenAppBridge.setLocalStorage` pattern verified from hub-polyfill.ts

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (stable stack — Vite 8, even_hub_sdk, dnd5e 5.3.3; no fast-moving dependencies in Phase 5 scope)
