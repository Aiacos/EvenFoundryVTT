---
phase: 06
slug: r1-integration-quick-action-inv-5
status: approved
design_system: none
target_runtime: G2 hardware text-container WebView (576×288 4-bit greyscale, 96×24 char grid)
locked_at: 2026-05-16
---

# Phase 6 UI Design Contract — R1 Integration + Quick Action + INV-5

> Streamlined UI-SPEC derived from `06-CONTEXT.md` (3 grey areas accepted). Phase 6's UI surface is small: **QuickActionMenuPanel** (new OverlayPanel) + **context chip in StatusHudRenderer footer** + **`[N] Language` sub-menu rendering `LOCALE_MENU` from Phase 5**.
>
> Phase 5 UI-SPEC remains canonical for the 5 panels. Phase 4b ConcentrationDropModalPanel remains the canonical OverlayPanel exemplar.

## 0. Pre-Conditions

- **Hardware target:** Even G2, 576×288 4-bit phosphor green. 96 chars × 24 rows monospace LTR text grid.
- **Container budget:** Strategy A — single `'overlay-block'` text container per panel; 4 image + 8 text containers per page.
- **No DOM, no React/Vue/Svelte.** Plain TypeScript output via `bridge.textContainerUpgrade`.
- **No CSS color.** Severity / state via prefix glyphs and width.

## 1. Layout — QuickActionMenuPanel (z=2)

96 × 24 grid. Strategy A — single text container, newline-joined.

### 1.1 Layout regions (inner content width 66 chars within `║ │ … │   ║`):

| Region | Rows | Width | Notes |
|--------|------|-------|-------|
| Border top | 1 | 70 | `┌`...`┐` |
| Title row | 1 | 70 | `│ AZIONE RAPIDA` + padding + `│` |
| Spacer | 1 | 70 | empty inner |
| Item rows | 9 | 70 | one row per nav-key |
| Border bottom | 1 | 70 | `└`...`┘` |
| Footer hint | 3 | 70 | scroll/tap/long-press hint lines below border |

### 1.2 Item row format (per row):

```
 ▶ [X]  <label-it-22-chars-trunc-pad>
   ▲     ▲
   |     `── localized label, padded to 22 chars (truncate with … if budget exceeded)
   `──── nav-key letter in brackets (always 4 chars total: `[X] `)
```

- Cell layout: `[2-space indent][active-marker][nav-key 4 chars][2-space gap][label 22 chars][padding to 66]`
- Active item: `▶ ` prefix at indent (replaces the `  ` prefix).
- Equal-width invariant: every row is exactly 66 inner chars; trailing space-padded.

### 1.3 Width budgets (label cell, 22 chars max):

| Nav | IT (canonical) | EN (canonical) | DE (canonical) | ES (best-effort) | FR (best-effort) | PT-BR (best-effort) |
|-----|----------------|----------------|----------------|------------------|------------------|---------------------|
| `[S]` Sheet | `Scheda` | `Sheet` | `Blatt` | `Hoja` | `Feuille` | `Ficha` |
| `[C]` Combat | `Combatt` | `Combat` | `Kampf` | `Combate` | `Combat` | `Combate` |
| `[L]` Log | `Log` | `Log` | `Log` | `Registro` | `Journal` | `Log` |
| `[B]` Book | `Libro` | `Book` | `Buch` | `Libro` | `Livre` | `Livro` |
| `[I]` Inventory | `Inventario` | `Inventory` | `Inventar` | `Inventario` | `Inventaire` | `Inventário` |
| `[A]` Action | `Azione` | `Action` | `Aktion` | `Acción` | `Action` | `Ação` |
| `[M]` Map | `Mappa` | `Map mode` | `Karte` | `Mapa` | `Carte` | `Mapa` |
| `[N]` Language | `Lingua` | `Language` | `Sprache` | `Idioma` | `Langue` | `Idioma` |
| `[X]` Close | `Chiudi` | `Close` | `Schließen` | `Cerrar` | `Fermer` | `Fechar` |

**Longest cell:** `Schließen` (9 chars) + `[X] ` (4) + `▶ ` (2) = 15 chars rendered. Budget 22 with comfortable slack. No truncation expected for any locale.

### 1.4 Footer hint rows (3 lines, below border):

```
  → scroll = cambia voce attiva     | EN: scroll = change selected item    | DE: scroll = Eintrag wählen
  → tap = apri voce                 | EN: tap = open item                  | DE: tap = öffnen
  → long-press = annulla            | EN: long-press = cancel              | DE: long-press = abbrechen
```

Each line ≤66 chars. Locale-aware via `getLabel('quick.hint.scroll' | 'quick.hint.tap' | 'quick.hint.long', locale)`.

## 2. Layout — `[N] Language` Sub-Menu

Mounted in place of the parent Quick Action menu when `[N]` is tapped. Same panel class (state-based variant), same Strategy A container.

### 2.1 Item rows (7 items from `LOCALE_MENU` constant):

```
 ▶ [A]  Auto                        (← restores game.i18n.lang default)
   [I]  Italiano                    canonical · width-budgeted
   [E]  English                     canonical · width-budgeted
   [D]  Deutsch                     canonical · width-budgeted
   [S]  Español                     best-effort · per-key EN fallback
   [F]  Français                    best-effort · per-key EN fallback
   [P]  Português                   best-effort · per-key EN fallback
```

- Active item indicator (currently-set locale): `▶ ` prefix on the row matching the saved override (or `Auto` if no override).
- Tap → `persistLocaleOverride(bridge, code)` + `gestureBus.publish({ kind: 'locale.changed', locale: code })` → return to parent menu.

### 2.2 Nav-keys disambiguated:

The 7 sub-menu nav-keys (`A I E D S F P`) are distinct from the parent menu's 9 nav-keys (`S C L B I A M N X`) — no collision when both menus are on the stack (parent suspended, sub-menu top). On sub-menu close, parent menu restored with its own nav-key set.

## 3. Layout — StatusHudRenderer Footer Context Chip

Replaces the static `R1: tap/scroll/long` footer row from Phase 4a's StatusHudRenderer with a context-aware chip.

### 3.1 Format:

```
║ R1: tap=<top-tap-action>  scroll=<top-scroll-action>  long=quick[<active-overlay-id>]   <chip-bar>     ║
```

- Width budget: **38 chars for the `R1:` segment**, right side reserved for the existing `[scheda] [▶combat] …` chip bar.
- Per-panel `getR1Hints()` overrides:
  - Main HUD (no panel active): `R1: tap=cycle  scroll=nav  long=quick`
  - Character Sheet active: `R1: tap=cycle-tab  scroll=tab-content  long=quick[sheet]`
  - Combat Tracker active: `R1: scroll=iniziativa  tap=rapida  long=quick[combat]`
  - Quick Action menu active: `R1: scroll=voce  tap=apri  long=annulla`
  - Boot splash active: `R1: —`
  - Boot error active: `R1: long=retry`

### 3.2 Width-budget per chip variant (canonical IT widths):

| State | Chip content | Char count |
|-------|--------------|-----------|
| Main HUD | `tap=cycle  scroll=nav  long=quick` | 33 |
| Sheet | `tap=cycle-tab  scroll=tab-content  long=quick[sheet]` | 51 → truncated to 38 → `tap=cycle-tab  scroll=cont…  long=q[…]` |
| Combat | `scroll=iniziativa  tap=rapida  long=quick[combat]` | 48 → truncated to 38 → `scroll=iniz…  tap=rapida  long=q[combat]` |
| Quick Menu | `scroll=voce  tap=apri  long=annulla` | 34 |
| Boot | `—` | 1 |

Width budget enforced via `assertWithinBudget('hud.r1.<state>', locale, 38)`.

## 4. INV-1 Fixtures (Phase 6 inventory)

| Fixture path | State | Source |
|--------------|-------|--------|
| `quick-action.base.it.txt` | Menu open, `[S]` active | UI-SPEC §1 |
| `quick-action.combat-suspended.it.txt` | Menu open over Combat panel | §1 + suspension state |
| `quick-action.language-submenu.it.txt` | `[N]` tapped, sub-menu showing 7 locales | §2 |
| `quick-action.base.de.txt` | DE locale stress (longest labels) | §1.3 |
| `status-hud.chip.main.it.txt` | Footer chip when no overlay active | §3.1 |
| `status-hud.chip.sheet.it.txt` | Footer chip when Sheet active | §3.1 |
| `status-hud.chip.combat.it.txt` | Footer chip when Combat active | §3.1 |
| `status-hud.chip.menu.it.txt` | Footer chip when Quick Action menu active | §3.1 |
| `status-hud.chip.boot-error.it.txt` | Footer chip when boot error active | §3.1 |

Total: **9 new INV-1 fixtures**.

## 5. Component Model

### 5.1 QuickActionMenuPanel

```ts
export default class QuickActionMenuPanel implements OverlayPanel {
  static meta: PanelMeta = {
    id: 'quick-action-menu',
    title: { it: 'Azione Rapida', en: 'Quick Action', de: 'Schnellaktion' },
    navKey: '',  // not in main menu — opened by long-press, not by nav-key
    requiredCaps: [],
  };

  readonly id = 'quick-action-menu';
  readonly z = ZIndex.Z2_OVERLAY;

  private mode: 'main' | 'language' = 'main';
  private activeIndex = 0;

  // OverlayPanel lifecycle:
  async onMount(): Promise<void> { /* subscribe to gesture bus */ }
  async onUnmount(): Promise<void> { /* unsubscribe + emit suspend/restore signal */ }
  onEvent(gesture: R1Gesture): void {
    // tap → open active item (or apply locale + return to main)
    // scroll-up/scroll-down → cycle activeIndex within current mode
    // long-press → close menu (popOverlay restores suspended panel)
  }
  getContainerCount(): ContainerCount { return { image: 0, text: 1 }; }
  getR1Hints(): R1Hints { return { tap: 'apri', scroll: 'voce', longPressLabel: 'annulla' }; }
}
```

### 5.2 Layer.getR1Hints() extension (Phase 6 adds to Layer interface):

```ts
export interface Layer {
  // ...existing fields...
  getR1Hints?(): { tap: string; scroll: string; longPressLabel: string };
}
```

Optional method — layers that don't implement it inherit the default from StatusHudRenderer (`{ tap: 'cycle', scroll: 'nav', longPressLabel: 'quick' }`).

### 5.3 PanelRouter overlay stack extension (Phase 6 adds):

```ts
class PanelRouter {
  // ...existing fields...
  private overlayStack: OverlayPanel[] = [];

  pushOverlay(panel: OverlayPanel): void {
    // - If overlayStack.top exists: call top.onUnmount() but PRESERVE state (suspend, not destroy)
    // - Push panel onto stack
    // - layerManager.bundle([{type:'mount', z:Z2_OVERLAY, layer:panel}])
  }

  popOverlay(): void {
    // - Pop top panel
    // - layerManager.bundle([{type:'destroy', z:Z2_OVERLAY}])
    // - If stack still non-empty: call onMount() on new top, restoring it
    // - Else: differential demolish restores z=0.5 IdleInfillLayer
  }
}
```

## 6. Copywriting / i18n

All strings go through `getLabel(key, locale) + assertWithinBudget(key, locale, budget)`. New i18n keys for Phase 6:

| Key | IT | EN | DE | Budget |
|-----|----|----|----|--------|
| `quick.title` | AZIONE RAPIDA | QUICK ACTION | SCHNELLAKTION | 22 |
| `quick.item.<nav>` | per row §1.3 | — | — | 22 |
| `quick.hint.scroll` | scroll = cambia voce | scroll = change item | scroll = wählen | 38 |
| `quick.hint.tap` | tap = apri voce | tap = open item | tap = öffnen | 38 |
| `quick.hint.long` | long = annulla | long = cancel | long = abbrechen | 38 |
| `hud.r1.main` | tap=cycle scroll=nav long=quick | (canonical) | tap=Wechsel scroll=Nav long=Schnell | 38 |
| `hud.r1.sheet` | tap=cambia-tab scroll=cont long=q[sheet] | tap=cycle-tab scroll=cont long=q[sheet] | tap=Tab scroll=Inhalt long=q[Blatt] | 38 |
| `hud.r1.combat` | scroll=iniz tap=rapida long=q[combat] | scroll=init tap=quick long=q[combat] | scroll=Init tap=Schnell long=q[Kampf] | 38 |
| `hud.r1.menu` | scroll=voce tap=apri long=annulla | scroll=item tap=open long=cancel | scroll=Eintrag tap=öffnen long=Abbruch | 38 |
| `hud.r1.boot_error` | long=riprova | long=retry | long=erneut | 38 |

Approximate Phase 6 i18n key count: **~18 new keys** appended to `HUD_WIDTH_BUDGETS`.

## 7. Pre-Conditions Compliance

- ✅ INV-1 layout integrity — every row exactly 66 inner chars, equal-width preserved.
- ✅ Container budget — Strategy A single 'overlay-block'; QuickActionMenuPanel adds 0 image + 1 text. Combined with z=0 map (4 img + 1 text) + z=1 HUD (1-3 text) + z=1.5 toast (1-2 text) = 4 img + 7-9 text ≤ 4+8 SDK cap. Quick Action menu suspends parent panel so total text containers stay bounded.
- ✅ Color — no CSS color.
- ✅ Typography — monospace only.
- ✅ Spacing — character-grid units only.
- ✅ Registry safety — no third-party UI registries; shadcn N/A.

---

**Sign-off:** UI design contract approved; planner can use this + CONTEXT.md mockups directly. No formal UI-checker round required for Phase 6 — surface area is small enough to verify inline during execution.
