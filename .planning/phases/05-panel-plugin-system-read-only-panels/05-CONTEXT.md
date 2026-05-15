# Phase 5: Panel Plugin System + Read-Only Panels — Context

**Gathered:** 2026-05-15
**Status:** Ready for research + planning
**Source:** smart-discuss (autonomous workflow batch table — operator-accepted 2026-05-15, 4/4 areas "Accept all")

<domain>
## Phase Boundary

Auto-discovered panel plugins render a 6-tab Foundry-faithful character sheet, a combat tracker, log, inventory, and spellbook — all **read-only**, **dual-edition aware** (PHB 2014 ↔ 2024 via `core.modernRules`), and **i18n-correct** (IT/EN canonical + DE/ES/FR/PT-BR best-effort).

**Phase 4b delivered:** `OverlayPanel` interface at `packages/g2-app/src/engine/overlay-panel.ts` (Layer + `onMount/onUnmount/onEvent`), `panel-gesture-bus.ts` (in-process pub/sub), `ZIndex.Z2_OVERLAY` with differential demolish (z=0.5 auto-removed, z=1.5 toast survives), `ConcentrationDropModalPanel` as working exemplar at `packages/g2-app/src/panels/concentration-drop-modal.ts`.

**Phase 5 ships:**

1. **Panel Plugin System** — `PanelRouter` + `import.meta.glob` auto-discovery + static-meta registration contract + boot-error state for malformed panels.
2. **CharacterSheetPanel** — 6 tabs (Main / Skills / Inventory / Spells / Feats / Bio) with tap-cycle + scroll-prev/next + last-viewed persistence + dual-edition rendering.
3. **CombatTrackerPanel** — current turn highlighted + ±2 visible (5-row window) + concentration source/duration + `[A][S][I][M]` quick-action bar.
4. **LogPanel** — read-only Foundry chat log tail.
5. **InventoryPanel** — actor.system.items rendered as list with weapon-mastery flag (2024 modernRules).
6. **SpellbookPanel** — actor.system.spells by level, slot indicators, concentration flag on spells.
7. **Locale override flow** — Even Hub `setLocalStorage('view.locale.override', '<lang>')` + Phase 6 wires `[N] Language` Quick Action; Phase 5 ships the persistence + 6-locale menu data model.

**NOT in scope:**

- R1 event source provider, Quick Action menu UI, INV-5 ratification (Phase 6).
- Any write path — `activity.use()`, multi-attack tracker, reaction notification, conc-drop write (all Phase 7+).
- Real-time partial updates to panels via WS — Phase 5 panels re-render from full `character.snapshot` per Foundry-hook event; delta-binding optimization is V2 polish.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Panel Plugin Architecture

- **Discovery mechanism:** `import.meta.glob('./panels/**/*-panel.ts', { eager: false })` returning lazy import promises. Vite-native, bundle-time discovery, no runtime registry mutation. Tree-shakes unused panels.
- **Module export shape:** Default-export class implementing `OverlayPanel` with `static meta: PanelMeta = { id, title, navKey, requiredCaps, defaultTab? }`. Type-safe metadata co-located with implementation (no parallel-file drift).
- **`PanelMeta` shape (proposed for planner refinement):**
  ```ts
  export interface PanelMeta {
    readonly id: string;              // stable kebab-case ID, used in routing
    readonly title: { it: string; en: string; de?: string };  // localized panel title
    readonly navKey: string;          // Quick Action menu key e.g. 'S' for Sheet
    readonly requiredCaps?: ReadonlyArray<keyof Capabilities>;  // capability gate
    readonly defaultTab?: string;     // for tabbed panels
  }
  ```
- **Mount ownership:** New `PanelRouter` module owns ALL `LayerManager.bundle` calls for z=2 mounts/unmounts. Panel classes never touch LayerManager directly. Router exposes `openPanel(id)` / `closeActivePanel()` / `isPanelOpen(id)` API.
- **Discovery failure handling:** If a `*-panel.ts` module fails to import or its `static meta` doesn't satisfy `PanelMeta`, the panel is **silently excluded** from the registry with a `console.warn('panel <path> excluded: <reason>')`. Boot does NOT fail — surviving panels still mount. Boot-error UI gets a new `'panel_load_failed'` state ONLY if zero panels register (catastrophic failure).

### Area 2: Tab Navigation UX (6-tab Character Sheet)

- **Tab cycle behavior:**
  - `tap` → cycle forward with wrap: Main → Skills → Inventory → Spells → Feats → Bio → Main.
  - `scroll-up` → previous tab (Main ← Bio wraps).
  - `scroll-down` → next tab (same as tap, but distinct gesture for clarity).
  - `double-tap` → reserved for close/back (consumed by Phase 6 NAV-01).
  - `long-press` → opens Quick Action menu (Phase 6 binding; from Phase 5's perspective the gesture is forwarded via panel-gesture-bus to a stub handler).
- **Default tab on first-ever mount:** `Main`.
- **Last-viewed tab persistence:** Even Hub `setLocalStorage('view.sheet.lastTab', '<tabId>')`. Restored on subsequent mounts; first-ever boot defaults to `Main`. Same pattern as `view.map.mode`.
- **Tab strip labels:** 3-char uppercase tags `MAI / SKI / INV / SPL / FEA / BIO` — uniform across all locales (no localization of tab tags). Rationale: 6 tabs × `[ XXX ]` = `[ MAI ][ SKI ][ INV ][ SPL ][ FEA ][ BIO ]` = ~42 chars of bracket + label content, fits 96-char width with leading/trailing space; localized full names risk INV-1 break in DE.
- **Active-tab indicator:** Per SHEET-04, `[ XXX ]` ↔ `[▶XXX ]` — leading-space swap with `▶` glyph. Equal-width preserved.

### Area 3: Dual-Edition Rendering (PHB 2014 ↔ 2024)

- **`modernRules` source of truth:** Extended into `CharacterSnapshotSchema` as `world.modernRules: boolean` (Phase 2 character-reader extended to map `game.settings.get('dnd5e', 'rulesVersion')` → boolean — `true` for 2024, `false` for 2014). Live-bound via Foundry hooks per SHEET-02 (zero polling).
- **Conditional location:** **Inside panel render method** — single panel class per panel type (no `Sheet2014Panel`/`Sheet2024Panel` split). Branched field rendering off `snapshot.world.modernRules`. Keeps INV-1 fixture count manageable (one fixture per edition variant, not 2× the panel surface).
- **Hot-swap behavior:** When GM flips `core.modernRules` mid-session, bridge re-emits full `character.snapshot` (NOT a delta) via existing Foundry hook subscriptions. Current panel re-renders from the new snapshot atomically inside the next `bundle()` flush. No layer remount, no flicker.
- **Phase 5 dual-edition scope (display-only deltas):**
  - **Field name labels:** "Proficiency Bonus" (2014) vs same label per Foundry localization for 2024; verify via dnd5e system canonical strings.
  - **Feat list:** 2024 origin feats column (vs 2014 ASI/Feat trade-off table) in Feats tab.
  - **Weapon-mastery flag:** 2024 weapons surface a `[M]` mastery indicator next to weapon name in Inventory + Main tab attack list; 2014 omits.
  - **Spell preparation rules:** 2024 always-prepared cantrips visual flag; 2014 standard rules.
- **Out of Phase 5:** No mechanical enforcement of edition rules (e.g., 2024 weapon mastery effect application, 2024 feat slot consumption). Those land in Phase 7 (write path) + Phase 9 (action economy).

### Area 4: i18n Locale Override + Combat Tracker Density

- **Locale override storage:** Even Hub `setLocalStorage('view.locale.override', '<lang>')` where `<lang>` ∈ `'auto' | 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br'`. `'auto'` means "follow `game.i18n.lang`". Same persistence tier as `view.map.mode`.
- **Boot read-back:** `bootEngine` step 9-area extension — after locale auto-detect from `game.i18n.lang`, check `hub.getLocalStorage('view.locale.override')`. If non-`'auto'`, override the runtime locale. Device-local; NEVER writes to Foundry world settings (I18N-02).
- **Locale menu data model:** Phase 5 ships the locale list + UI-spec for the menu, but the actual `[N] Language` menu UI mounts in Phase 6 (Quick Action). Phase 5 exports a `LOCALE_MENU` constant:
  ```ts
  export const LOCALE_MENU: ReadonlyArray<{ code: string; nativeLabel: string; budget: 'canonical' | 'best-effort' }> = [
    { code: 'auto', nativeLabel: 'Auto', budget: 'canonical' },
    { code: 'it',   nativeLabel: 'Italiano',  budget: 'canonical' },
    { code: 'en',   nativeLabel: 'English',   budget: 'canonical' },
    { code: 'de',   nativeLabel: 'Deutsch',   budget: 'canonical' },
    { code: 'es',   nativeLabel: 'Español',   budget: 'best-effort' },
    { code: 'fr',   nativeLabel: 'Français',  budget: 'best-effort' },
    { code: 'pt-br',nativeLabel: 'Português', budget: 'best-effort' },
  ];
  ```
- **Best-effort fallback rule:** For best-effort locales, when a string key would exceed its `i18n-budget` width (the canonical IT/EN/DE-verified width), the renderer falls back to **the EN string for that key only** — per-key fallback, not full-locale fallback. INV-1 width budget is sacred (I18N-04).
- **Combat tracker visible-combatant density:**
  - Window size: **5 visible** (current turn highlighted + ±2 around).
  - Initiative order: from `CombatSnapshotSchema.turns` (Phase 2 combat-reader).
  - Scroll within panel: `scroll-up` / `scroll-down` cycles the 5-row window through the full initiative list. Current-turn highlight stays fixed at center where possible.
  - Concentration source + duration: rendered as a sub-line under the affected combatant's name (e.g., `Aragorn  conc:Bless 1m`).
  - Quick-action bar `[A][S][I][M]` (COMB-03): rendered as a footer row in the Combat overlay. Phase 5 renders the bar; Phase 6 wires the gestures.

### Area 5: Plan Decomposition (anticipated — research/planner will refine)

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 05-01 | PanelRouter + import.meta.glob discovery + PanelMeta contract + panel registry tests | (architecture) |
| 1 | 05-02 | CharacterSheetPanel — 6-tab strip + tab cycle + last-viewed persistence + SHEET-04 INV-1 fixtures | SHEET-01, SHEET-04 |
| 1 | 05-03 | CharacterSheetPanel — dual-edition rendering (modernRules branching) + per-tab content for Main / Skills / Bio | SHEET-02, SHEET-03 |
| 2 | 05-04 | InventoryPanel + SpellbookPanel — list rendering + weapon-mastery flag + spell-prep flag + slot indicators | SHEET-01 (Inv/Spl tabs) |
| 2 | 05-05 | CombatTrackerPanel + LogPanel — 5-combatant window + concentration sub-line + quick-action bar footer + log tail | COMB-01, COMB-03 |
| 3 | 05-06 | Locale override (`LOCALE_MENU` const + Hub setLocalStorage + boot read-back) + INV-1 stress fixtures across 6 locales | I18N-02, I18N-05 |

**Wave 1 + Wave 2 parallelism eligibility:** Plans 05-02 / 05-03 / 05-04 / 05-05 each touch distinct file sets in `packages/g2-app/src/panels/` — runnable in parallel once Plan 05-01's `PanelRouter` + `PanelMeta` contract is in. Planner will validate `files_modified` overlap via `gsd-pattern-mapper` per Phase 4b's playbook.

### Area 6: Test Discipline (carry-forward from Phase 4b)

- **Tests colocated** with source (`packages/g2-app/src/panels/<panel>/__tests__/<panel>.test.ts`) per Phase 4b convention.
- **INV-1 ASCII fixtures** in `packages/shared-render/src/fixtures/` — one per panel + state combo:
  - `sheet.<tab>.<edition>.<locale>.txt` — 6 tabs × 2 editions × IT primary = 12 minimum.
  - `combat-tracker.<scenario>.it.txt` — 3 scenarios (full window / partial / single combatant) = 3.
  - `inventory.<edition>.it.txt` × 2 = 2.
  - `spellbook.<class>.it.txt` × 2 (caster vs half-caster) = 2.
  - Estimated total new fixtures: ~20 (planner refines).
- **Per-locale stress fixtures:** Per I18N-05 best-effort policy, at least ONE fixture per non-canonical locale (ES/FR/PT-BR) verifying EN per-key fallback when budget exceeded.

### Area 7: Capability Gates

- Panels declare `requiredCaps: ReadonlyArray<keyof Capabilities>` in their static meta.
- `PanelRouter.openPanel(id)` validates `requiredCaps` against `capabilityHandshake` result (Phase 4a). If any cap missing, router refuses to mount and emits a toast (Phase 4b `ToastQueueLayer` with severity `warn`) saying "<Panel> requires <cap> — unavailable in current session".
- **Phase 5 baseline caps:** All 6 panels declare empty `requiredCaps` (they're read-only and use the existing text-container budget). Future write-path panels (Phase 7+) will declare `'midi-qol'`, `'socketlib'`, etc.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before investigating or coding.**

### Phase 4b deliverables (foundation — Phase 5 consumes these verbatim)

- `packages/g2-app/src/engine/overlay-panel.ts` — `OverlayPanel extends Layer` interface (`onMount/onUnmount/onEvent`). Phase 5 panels implement this.
- `packages/g2-app/src/engine/panel-gesture-bus.ts` — In-process pub/sub for R1 gestures. Panels subscribe via `onMount`, unsubscribe via `onUnmount`.
- `packages/g2-app/src/engine/layer-manager.ts` — `mount() / destroy() / bundle()` API. Phase 5 panels never call this directly; `PanelRouter` wraps it.
- `packages/g2-app/src/engine/layer-types.ts` — `ZIndex.Z2_OVERLAY = 2`, `Layer`, `LayerOp` types.
- `packages/g2-app/src/panels/concentration-drop-modal.ts` — **Working exemplar.** Phase 5 panels follow this implementation pattern (constructor signature shape, draw() via single text container 'overlay-block', container budget Strategy A).
- `packages/g2-app/src/hub-polyfill.ts` — Even Hub envelope-based `setLocalStorage` / `getLocalStorage` polyfill. Phase 5 uses this for `view.sheet.lastTab` + `view.locale.override` persistence.

### Phase 4a deliverables (foundation)

- `packages/g2-app/src/status-hud/status-hud-renderer.ts` — i18n width-budget pattern; Phase 5 panels reuse the `i18n-budgets.ts` width-budget gate.
- `packages/g2-app/src/engine/boot-splash.ts` + `boot-engine-error-wrapper.ts` — Boot pipeline; Phase 5 hooks `LOCALE_MENU` boot read-back into step 9-area.

### Phase 2 deliverables (data layer)

- `packages/foundry-module/src/readers/character-reader.ts` — Phase 5 extends to surface `world.modernRules` boolean + verify all 6 sheet-tab data paths exist.
- `packages/foundry-module/src/readers/combat-reader.ts` — Phase 5 consumes the `turns` array for tracker rendering.
- `packages/shared-protocol/src/payloads/character.ts` — `CharacterSnapshotSchema` — Phase 5 extends with `world.modernRules` field (atomic commit per Phase 4b Plan 06 pattern).

### Phase 3 deliverables (transport)

- `packages/bridge/` Tool Registry — Phase 5 panels never call write tools; subscriptions only.

### Architecture decisions

- `docs/architecture/0001-layered-ui-model.md` — Amendment 1 (z=0.5 atomic with z=2). Phase 4b ADR-0009 Amendment 1 supersedes the strict atomic rule with the differential demolish rule that Phase 5 panels rely on.
- `docs/architecture/0009-layer-manager-contract.md` — Amendment 1 ACCEPTED 2026-05-15. Phase 5 ships within this contract.
- **Potential ADR-0010 (proposed):** "Panel Plugin Registry — discovery, metadata contract, capability gating". Planner decides whether this warrants its own ADR or an Amendment 2 on ADR-0009.

### Specs.md sections

- **§7.5 — Character sheet ASCII mockups (6 tabs)** — INV-1 load-bearing fixtures. Phase 5 fixtures reproduce these character-perfect.
- **§7.6 — Combat tracker ASCII mockup** — INV-1 load-bearing.
- **§7.7 — Log overlay ASCII mockup.**
- **§7.8 — Inventory panel ASCII mockup.**
- **§7.9 — Spellbook panel ASCII mockup.**
- **§7.14.4 ck 11-15** — INV-1 layout integrity verification checklist.
- **§7.16 — Locale handling** — IT/EN/DE canonical + ES/FR/PT-BR best-effort; per-key EN fallback.
- **§11.5.1 — Dual-edition support setting (`core.modernRules`).**

### REQUIREMENTS.md

- SHEET-01 — 6-tab Foundry-faithful navigation.
- SHEET-02 — Live data binding to `actor.system.*` (zero polling).
- SHEET-03 — Dual-edition support via `core.modernRules`.
- SHEET-04 — Tab strip equal-width INV-1.
- COMB-01 — Combat tracker with turn / initiative / effects / concentration.
- COMB-03 — Quick-action bar `[A][S][I][M]` on Combat overlay (render-only Phase 5; gestures wire Phase 6).
- I18N-02 — Runtime locale override device-local.
- I18N-05 — IT/EN canonical + DE/ES/FR/PT-BR best-effort.

### Test colocation conventions

- `packages/g2-app/src/panels/<panel>/__tests__/` — colocated per Phase 4b convention.
- `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts` — Phase 5 integration smoke (analog of `04b-integration-smoke.test.ts`).
- `packages/shared-render/src/fixtures/*.txt` — INV-1 fixtures.

</canonical_refs>

<specifics>
## Specific Ideas (mockups + concrete examples)

### `PanelMeta` registration (Area 1)

```ts
// packages/g2-app/src/panels/character-sheet-panel.ts
import type { OverlayPanel } from '../engine/overlay-panel';
import type { PanelMeta } from '../engine/panel-router';

export default class CharacterSheetPanel implements OverlayPanel {
  static meta: PanelMeta = {
    id: 'character-sheet',
    title: { it: 'Scheda', en: 'Sheet', de: 'Blatt' },
    navKey: 'S',
    requiredCaps: [],
    defaultTab: 'main',
  };
  readonly id = 'character-sheet';
  readonly z = ZIndex.Z2_OVERLAY;
  // ...
}
```

### `PanelRouter` discovery (Area 1)

```ts
// packages/g2-app/src/engine/panel-router.ts
const modules = import.meta.glob<{ default: PanelClass }>('../panels/**/*-panel.ts', { eager: false });

export class PanelRouter {
  private registry = new Map<string, PanelMeta & { load: () => Promise<PanelClass> }>();

  async discoverPanels(): Promise<void> {
    for (const [path, loader] of Object.entries(modules)) {
      try {
        const mod = await loader();
        const PanelClass = mod.default;
        if (!PanelMetaSchema.safeParse(PanelClass.meta).success) {
          console.warn(`panel ${path} excluded: invalid meta`);
          continue;
        }
        this.registry.set(PanelClass.meta.id, {
          ...PanelClass.meta,
          load: async () => PanelClass,
        });
      } catch (err) {
        console.warn(`panel ${path} excluded: load error`, err);
      }
    }
  }

  openPanel(id: string, deps: PanelDeps): void { /* validate caps + bundle mount */ }
  closeActivePanel(): void { /* bundle destroy */ }
}
```

### Tab strip ASCII (Area 2 — SHEET-04 + INV-1)

```
Inactive tab (Main, viewing Skills):     Active tab (Main):
  [ MAI ][▶SKI ][ INV ][ SPL ][ FEA ][ BIO ]    [▶MAI ][ SKI ][ INV ][ SPL ][ FEA ][ BIO ]
       ^^^^^                                       ^^^^^
       width-preserved (5 chars per cell + brackets)
```

### Combat tracker mockup (Area 4 — COMB-01)

```
┌──────────────────────────────────────────────────────────┐
│ COMBAT  Round 3                                          │
│                                                          │
│   2.  Gimli       HP 38/45   Ini 14                      │
│   3.  Aragorn     HP 51/56   Ini 11   conc:Bless 1m      │  ← current turn (highlight pivot)
│ ▶ 4.  Goblin#1    HP 7/7     Ini 9                       │  ← current turn marker
│   5.  Legolas     HP 32/40   Ini 7    conc:Hunter's M 8h │
│   6.  Goblin#2    HP 7/7     Ini 5                       │
│                                                          │
│ [A] Attack  [S] Spell  [I] Item  [M] Move                │  ← quick-action bar (render-only)
└──────────────────────────────────────────────────────────┘
```

### Dual-edition delta example (Area 3)

```
2014 Inventory row:                 2024 Inventory row (modernRules=true):
  Longsword   1d8 sl                  Longsword [M]   1d8 sl
                                                ^^^ weapon mastery flag
```

### Locale override boot flow (Area 4)

```
bootEngine() step 9-area:
  1. locale := game.i18n.lang  // auto-detect
  2. override := hub.getLocalStorage('view.locale.override') || 'auto'
  3. if override !== 'auto': locale := override
  4. setRuntimeLocale(locale)
```

</specifics>

<deferred>
## Deferred Ideas

- **Real `[N] Language` Quick Action menu UI** — Phase 5 ships the `LOCALE_MENU` constant + persistence + boot read-back. The actual menu rendering + tap-to-select lives in Phase 6 Quick Action.
- **Real R1 gesture wiring to PanelRouter** — Phase 5 panels subscribe to `panel-gesture-bus` for their own tap/scroll handling, but the **R1 event source provider** that publishes to the bus is Phase 6.
- **Multi-attack tracker in Combat overlay (MULTI-01)** — Phase 7 (write path). Phase 5's tracker shows turn + initiative; the `Atk 1/2` counter is Phase 7.
- **Reaction passive-notification toast (REACT-01)** — Phase 7. Phase 5's combat tracker may show `react: Shield (ready)` informationally if Phase 2's combat-reader already surfaces reaction availability; full notification toast is Phase 7.
- **Real write-path actions from panels** — `tap` on a spell row in SpellbookPanel does NOT cast it in Phase 5. The cast action (`[Cast]` button revealed via long-press → option list) is Phase 8 Manual Action UX.
- **Sheet/Token portrait image rendering** — STRETCH-06 (Phase 13). Phase 5 panels are text/character-only.
- **Per-tab partial WS subscription optimization** — Phase 5 panels re-render from full `character.snapshot`. Delta-binding per tab (e.g., only re-render Inventory tab when item delta arrives) is V2 polish.
- **ADR-0010 "Panel Plugin Registry"** — Planner decides whether the discovery + metadata contract warrants a new ADR or an Amendment on ADR-0009. Captured as a research question for `gsd-phase-researcher`.

</deferred>

---

*Phase: 05-panel-plugin-system-read-only-panels*
*Context gathered: 2026-05-15 via /gsd-autonomous smart-discuss batch (4 areas accepted)*
