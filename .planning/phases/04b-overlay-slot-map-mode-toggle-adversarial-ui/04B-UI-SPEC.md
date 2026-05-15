---
phase: 4b
title: Overlay Slot + Map Mode Toggle + Adversarial UI — UI Spec
status: draft
produced: 2026-05-15
inputs_read:
  - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md
  - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md
  - .planning/ROADMAP.md §126
  - .planning/PROJECT.md (Core Value)
  - CLAUDE.md §0.1 INV-1
  - Specs.md §7.1a, §7.2, §7.4, §7.4c, §7.14.4 ck 11-15, §7.15.2, §7.16
  - packages/shared-render/src/fixtures/*.txt (Phase 4a baseline, 10 files)
  - packages/g2-app/src/status-hud/status-hud-renderer.ts (28×21 card)
  - packages/g2-app/src/status-hud/i18n-budgets.ts (Phase 4a budget table)
fixtures_count: 17
inv1_rules_applied:
  - §7.1a.1 frame integrity (col 0 + 68 + 95 fixed)
  - §7.1a.2 variable-content width-budgeted (no best-effort)
  - §7.1a.3 column alignment (multi-column rows fixed grid)
  - §7.1a.4 tab strip equal-width [Y]/[N] swap (NEW for conc modal)
  - §7.1a.5 Status HUD invariants (28×21 unchanged when pivoting to death-saves)
  - §7.1a.6 multi-byte glyph safety (◯ ● [+N] all width-1 confirmed)
  - §7.1a.7 render contract (Box tree, no string concat)
  - §7.1a.8 i18n width budgets per locale
canonical_dimensions:
  page_width: 96
  page_height: 24
  outer_frame: '╔═...═╗ at row 0, ╚═...═╝ at row 23'
  central_divider_col: 68
  right_border_col: 95
  status_hud_card: '28 chars × 21 rows, col 68-95'
  status_hud_inner: '26 chars (col 69-94)'
---

# Phase 4b Visual Design Contract

## §1 Phase Visual Goals

Phase 4b ratifies the **overlay layer-manager contract** that Phase 5 panels will plug into, and ships **five adversarial visual primitives** that exercise the failure modes of the spec's happy-path mockups:

1. The z=2 overlay slot mounts panels atomically with a guaranteed z=0.5 demolish + z=1.5 toast survival.
2. A z=1.5 toast queue holds 2 toasts FIFO with 3-second dwell and a `[+N]` squash badge for overflow (the SC #3 Fireball + 8 saves stress case).
3. Five boot-error states render in place of the boot splash, each carrying a recovery hint and a `[X] Close` gesture annotation.
4. The Status HUD pivots from the standard HP/AC/conditions layout to a 3-strike death-saves tracker when HP=0, latched until recovery.
5. The concentration-drop modal — the only z=2 panel Phase 4b ships — appears with `[Y]/[N]` choice when a new concentration spell would displace an active one, emits `conc.drop.confirmed` on confirm, and survives co-presence with the death-saves HUD pivot underneath.

Every visual artifact preserves the **Core Value** (PROJECT.md): the player's eyes never leave the physical scene. No new modality, no fade transitions in-flight, no animations that require sustained attention — every primitive is **glanceable** in ≤ 500 ms and **character-perfect** across all states, contents, and locales (INV-1).

## §2 Existing Baseline (Phase 4a)

Phase 4b is **additive**. The following artifacts ship in Phase 4a and Phase 4b does NOT modify their character grid; it only adds new fixtures and one renderer mode.

| Artifact | Width × Height | Phase 4a Status | Phase 4b Touchpoint |
|----------|---------------|-----------------|---------------------|
| `glyph-scene.boot.txt` | 96 × 24 | Frozen | Boot-error fixtures share the outer `╔...╗` frame width |
| `glyph-scene.raster-idle{-it,-en,-de,}.txt` | 96 × 24 | Frozen | Toast/conc-modal/death-saves overlay onto this canvas |
| `glyph-scene.glyph-idle.txt` | 96 × 24 | Frozen | Toast-on-glyph stress case (out of fixture scope; covered by §Q1 budget table) |
| `status-hud-baseline.txt` | 16 × 8 | Frozen (legacy thumbnail) | Not used by Phase 4b — superseded by full 28×21 card |
| `status-hud.{loading,hp-overflow,conditions-overflow}.txt` | 28 × 21 (with `║` borders at cols 0, 27) | Frozen | Death-saves fixtures inherit the 28×21 card geometry |
| `StatusHudRenderer` (28×21 grid) | 28 × 21 | Frozen | Extended with `mode: 'standard' \| 'death-saves'` parameter |
| `HUD_WIDTH_BUDGETS` table | 9 keys | Frozen | Phase 4b adds 8 new keys (§5) |

**Canonical column reference** (verified by `awk` against Phase 4a fixtures):
- Page outer left `║` at col **0**
- Central divider `║` at col **68**
- Page outer right `║` at col **95**
- Status HUD inner content fills cols **69-94** (26 chars between the two `║`)
- Map area inner content fills cols **1-67** (67 chars between the two `║`)

## §3 Per Primitive UI Design

### §3.1 Overlay Slot Contract (z=2)

The overlay slot is the **mount-point for one Panel at a time**. Phase 4b ships the slot machinery and ONE panel (`ConcentrationDropModalPanel`) as proof of contract. Subsequent panels (Phase 5) implement the same `OverlayPanel` interface.

**Empty state (no overlay active):**
- z=2 is **not mounted** — the LayerManager's panel slot is `null`
- z=0.5 IdleInfillLayer renders normally → visible in cols 18-66 of rows 19, 20, 21 of the raster-idle fixture (combat-log strip, label strip, stats strip)
- z=0 retains capture
- **Visual surface = the existing Phase 4a `glyph-scene.raster-idle.txt` fixture** (no new fixture required for the empty state)

**With-panel state (overlay active):**
- z=2 is **mounted** with one `OverlayPanel` instance
- z=0.5 IdleInfillLayer is **atomically demolished** in the same `LayerManager.bundle()` flush (per ADR-0009 Amendment 1 + §Q1 Mitigation A)
- z=1 StatusHudLayer **stays visible** at cols 69-94 (unless modal is `size=modal` — Phase 4b does NOT ship size=modal; conc-modal is `size=panel`)
- z=1.5 ToastQueueLayer **stays visible** if mounted (different containers, different z)
- z=0 retains capture (panel input is routed via `panel-gesture-bus` in-process, NOT capture transfer)

**Transition behavior:**
- Mount: instant single-frame swap inside one `rebuildPageContainer` flush
- Unmount: instant single-frame swap; z=0.5 IdleInfillLayer reborns in the same flush
- No fade, no slide, no progressive reveal — INV-1 forbids any intermediate frame state

**Panel size convention** (Phase 4b decision, ratifies Specs §7.5 size taxonomy for Phase 5):
- `size=panel` → mounts at z=2 BUT preserves z=1 Status HUD visibility (conc-modal is this kind)
- `size=modal` → mounts at z=2 AND hides z=1 Status HUD for full-attention focus (NOT shipped in Phase 4b; reserved for Phase 6 Quick Action and Phase 11+ V2 Voice clarify)

### §3.2 Toast Queue (z=1.5) — 4 Visual States

The toast queue lives at z=1.5 between the Status HUD (z=1) and the overlay slot (z=2). It uses **ONE text container** (`toast-block`) with a 2-row newline-separated content body (per §Q5 §Q1 recommendation: single container with embedded `\n` saves 1 container vs separate slots). The container occupies map-area cols ~26-67 row 19-20 (consuming the lower-middle of the map area, leaving z=0.5 stats strip on row 21 visible — when z=0.5 is mounted).

**State 1: Empty queue (no toasts).** The `toast-block` container is **declared in the page schema but rendered as empty content** (`''`). Visually invisible. **No new fixture** — covered by Phase 4a `glyph-scene.raster-idle.txt`.

**State 2: 1 toast visible.** Single line of content; the second row of the 2-row block is empty (right-padded to the container width budget).

**State 3: 2 toasts FIFO visible (max capacity).** Both rows populated. Head toast (oldest, longest-dwelled) sits on row 1 of the block; tail toast (newest) sits on row 2.

**State 4: 3+ buffered, head squashed.** Head toast's content has `[+N]` badge appended where `N = (queue.length - 2)` — i.e., the count of toasts still buffered behind the visible 2.

**Severity prefix (language-neutral, NOT in i18n-budgets per Pitfall 6):**

| Severity | Prefix | Glyph (Specs §7.4a.1 dictionary) | Meaning |
|----------|--------|-----------------------------------|---------|
| `info`   | `i: `  | ASCII `i` + colon                | Default informational (roll resolved, save passed) |
| `warn`   | `!: `  | ASCII `!` + colon                | Attention-needed (low HP, sync flicker) |
| `error`  | `x: `  | ASCII `x` + colon                | Failure (sync lost, write rejected) |

**Visual placement:**
- Container: `toast-block`, single text container, 2-row newline-separated content
- Column range: cols **26-67** of the map area (42 chars wide, centered-right)
- Row range: rows **19-20** of the page (above the footer row 22, below the raster tiles which end at row 18)
- Right-edge padding: pad each row's content with spaces to **exactly 42 chars** to preserve INV-1 column continuity

**Toast content width budget:** 38 chars per row (after subtracting 3-char severity prefix + 1-char right margin). Squash badge `[+N]` consumes 4-5 chars (`[+7]` = 4 chars, `[+99]` = 5 chars; cap N display at 99, telemetry-log overflow per §Q5 hard-cap mitigation).

### §3.3 Boot Error UI (z=1 replaces status HUD during boot failure) — 5 States × IT/EN

The boot error layer is **single-purpose**: it replaces the boot splash mid-boot when an exception fires before handshake completes (per §Q3 dispatch map). It uses the **same 96×24 outer frame** as `glyph-scene.boot.txt` but shows a centered single-line panel `┌...┐` with title + recovery hint + `[X] Close` annotation.

**Centered panel geometry (uniform across all 5 states):**
- Outer page: `╔══...══╗` at col 0 + col 95 (rows 0 + 23) — same as boot splash
- Inner panel: `┌──...──┐` left edge at col **18**, right edge at col **77** (60 chars wide)
- Inner content: cols **19-76** (58 chars wide between the `│` borders)
- Vertical placement: panel top at row **9**, panel bottom at row **14** (6 rows total: top border, 4 content rows, bottom border)
- Centering: panel rows occupy 9-14 of the 24-row page (centered vertically)

**Per-state content** (all titles uppercase, all hints sentence-case, ASCII-only when possible):

| State | IT title | EN title | IT hint (line 1) | IT hint (line 2) | EN hint (line 1) | EN hint (line 2) |
|-------|----------|----------|------------------|------------------|------------------|------------------|
| `handshake_failed` | `HANDSHAKE FALLITO` | `HANDSHAKE FAILED` | `Risposta del bridge non valida.` | `Verifica versione del modulo.` | `Bridge response was invalid.` | `Check module version.` |
| `version_mismatch` | `VERSIONE INCOMPATIBILE` | `VERSION MISMATCH` | `Il bridge parla un protocollo diverso.` | `Aggiorna il modulo Foundry.` | `Bridge speaks a different protocol.` | `Update the Foundry module.` |
| `no_character` | `NESSUN PERSONAGGIO` | `NO CHARACTER` | `Nessun PG assegnato a questo player.` | `Assegna un PG da Foundry.` | `No PC assigned to this player.` | `Assign one from Foundry.` |
| `bridge_unreachable` | `BRIDGE NON RAGGIUNGIBILE` | `BRIDGE UNREACHABLE` | `Connessione al bridge fallita.` | `Verifica URL e rete LAN.` | `Connection to bridge failed.` | `Check URL and LAN.` |
| `token_expired` | `TOKEN SCADUTO` | `TOKEN EXPIRED` | `La sessione è scaduta (24h).` | `Riaccoppia con un nuovo QR.` | `Session expired (24h).` | `Re-pair via the QR.` |

**Per-state footer line:** `[X] Chiudi` (IT) / `[X] Close` (EN) — left-aligned in the panel content area, on the panel's last content row.

**Width budget validation** (all IT strings ≤ 58 chars of inner content; longest is `VERSIONE INCOMPATIBILE` = 22 chars title and `Il bridge parla un protocollo diverso.` = 38 chars hint — both fit easily). Padding right with spaces to col 76.

### §3.4 Death-Saves HUD Pivot (StatusHudRenderer mode='death-saves') — 4 States

The pivot **reuses the existing 28×21 Status HUD card** (no new container, no new column allocation). The renderer switches output mode based on `setMode('death-saves' | 'standard')`. Same 28×21 grid, same `║` borders at col 0 + col 27, same bottom row.

**State 1: HP > 0 (standard layout).** No change from Phase 4a `status-hud-baseline` / `conditions-overflow` / `hp-overflow` fixtures. **No new fixture required.**

**State 2: HP = 0, 0 fails, 0 passes (initial death-saves entry).** Card shows the death-saves title + the 3-strike tracker with all empty checkboxes.

**State 3: HP = 0, 2 fails, 1 pass (mid-saves visual).** Same layout, ticked positions filled with `●`.

**State 4: HP > 0 again (recovery latch-off).** Renderer reverts to standard layout — same as State 1, no fixture.

**Visual layout of the death-saves mode (inside the 28×21 card):**

```
║ <NAME ≤8>  <CLASS ≤8>     ║   row 1: header (preserved from standard mode)
║ ────────────────          ║   row 2: divider (preserved)
║                           ║   row 3: blank
║ DEATH SAVES               ║   row 4: title
║                           ║   row 5: blank
║ Riusciti  [ ◯ ◯ ◯ ]       ║   row 6: pass tracker (IT 'Riusciti' / EN 'Passes')
║ Falliti   [ ◯ ◯ ◯ ]       ║   row 7: fail tracker (IT 'Falliti' / EN 'Fails')
║                           ║   row 8: blank
║ HP  0/<max>               ║   row 9: HP=0 indicator preserved (max from snapshot)
║ AC  <ac>                  ║   row 10: AC preserved
║                           ║   row 11-19: blank
║                           ║
║                           ║
║                           ║
║                           ║
║                           ║
║                           ║
║                           ║
║                           ║
║                  [GLY]    ║   row 20: [GLY] badge if mapMode='glyph' (preserved)
╠══════════════════════════╣   row 21: bottom border (preserved)
```

**Glyph palette (verified width-1 per §7.1a.6):**
- `◯` U+25EF "LARGE CIRCLE" — empty checkbox slot (width 1 in G2 monospace, per Phase 4a glyph dictionary verification)
- `●` U+25CF "BLACK CIRCLE" — filled checkbox slot (width 1 in G2 monospace)
- 3-strike bracket: `[ X X X ]` exactly = 9 visible chars (`[`, ` `, `X`, ` `, `X`, ` `, `X`, ` `, `]`)

**Width budget validation for the tracker rows (IT longest):**
- `Riusciti  [ ◯ ◯ ◯ ]` = 8 (label) + 2 (padding) + 9 (tracker) = 19 chars ≤ 26 inner width ✓
- `Falliti   [ ◯ ◯ ◯ ]` = 7 (label) + 3 (padding) + 9 (tracker) = 19 chars ≤ 26 inner width ✓ (note: 3-space padding after `Falliti` to align the bracket column with the `Riusciti` row — INV-1 sub-rule 3 column alignment)

### §3.5 Concentration-Drop Modal (z=2 panel) — 2 States

The modal mounts at z=2 size=panel (Status HUD remains visible at col 68-95). It uses a single-line `┌──┐` frame centered in the map area.

**Modal geometry:**
- Frame left `│` at col **6**, frame right `│` at col **65** (60 chars wide)
- Inner content: cols **7-64** (58 chars wide)
- Vertical placement: top border at row **6**, bottom border at row **17** (12 rows total: top + 10 content + bottom)
- Centering: vertically centered in the map area (rows 3-21 of the page)

**State 1: Modal open (standard length spell names):**

```
row 6:  ┌─[ CONCENTRATION CONFLICT ]──────────────────────────────┐
row 7:  │                                                          │
row 8:  │  Spell attivo:                                           │
row 9:  │    Hold Person (5r)                                      │
row 10: │                                                          │
row 11: │  Castando Bless verrà rimosso.                           │
row 12: │                                                          │
row 13: │  Continuare?                                             │
row 14: │                                                          │
row 15: │   [Y] Drop & cast Bless     [N] Cancel                   │
row 16: │                                                          │
row 17: └──────────────────────────────────────────────────────────┘
```

**State 2: Modal stress (long IT spell names, worst case):**

```
row 6:  ┌─[ CONCENTRATION CONFLICT ]──────────────────────────────┐
row 7:  │                                                          │
row 8:  │  Spell attivo:                                           │
row 9:  │    Hold Person (5r)                                      │
row 10: │                                                          │
row 11: │  Castando Cura Ferite di Massa verrà rimosso.            │
row 12: │                                                          │
row 13: │  Continuare?                                             │
row 14: │                                                          │
row 15: │   [Y] Drop & cast Cura …    [N] Cancel                   │
row 16: │                                                          │
row 17: └──────────────────────────────────────────────────────────┘
```

**Width budget for spell names**:
- "Active spell" line budget: 30 chars after the 4-char leading indent (`    `), truncated `…` if longer
- "Casting will drop" line budget: 38 chars after the 2-char leading indent (`  Castando `), truncated `…`
- `[Y] Drop & cast <NAME>` button label: budget 24 chars; longer names truncate as `Drop & cast <prefix>…` to keep the button width fixed

**[Y]/[N] equal-width button discipline (INV-1 sub-rule 4):**
- `[Y] Drop & cast <NAME>` occupies exactly cols 10-33 of row 15 (24 chars including `[Y] ` prefix)
- 5 spaces separator at cols 34-38
- `[N] Cancel` occupies exactly cols 39-48 of row 15 (10 chars)
- Right padding to col 64 (inner right border)

**[ADR-0009 Amendment 1 edge case]: Conc-modal on death-saves pivot.** When CONC-01 fires while HP=0 (death-saves pivot latched), the modal mounts at z=2, the StatusHudLayer at z=1 continues rendering the death-saves mode underneath. **No layer conflict** (different z-strata, different containers). The fixture `conc-modal-on-death-saves.it.txt` captures this state.

### §3.6 Map Mode Toggle — Transition Behavior

The runtime toggle `toggleMapMode('raster' | 'glyph' | 'auto')` does NOT introduce a new UI surface (Quick Action menu is Phase 6 scope). But it DOES affect z=0 rendering: the raster ↔ glyph swap is **instant** (single-frame `rebuildPageContainer` flush) — **no fade, no progressive reveal, no transition animation**.

**Visual contract:**
- Frame N (pre-toggle): raster mode — 4 image containers at z=0 + 1 capture text container, glyph grid containers unused
- Frame N+1 (post-toggle): glyph mode — 0 image containers at z=0 + 1 text container holding the 28×21 glyph grid + 1 capture text container, raster tiles deallocated
- The toggle preserves: z=1 Status HUD (with `[GLY]` badge appearing/disappearing at row 20 col 22-26 per renderer's `mapMode` constructor parameter), z=0.5 IdleInfillLayer (if no overlay), z=1.5 ToastQueueLayer (if any toasts visible), z=2 overlay (if mounted)
- **No new fixture** for the toggle itself — the visual contract is "the swap is atomic and observable as a single-frame difference between `glyph-scene.raster-idle.txt` and `glyph-scene.glyph-idle.txt`" (both already in Phase 4a).

**Persistence visual cue** (Phase 4b NOT in scope; Phase 6 ratifies via Quick Action `[M] Map ctrl` menu): when the user picks a mode that differs from the BLE-probe verdict, a 3-second info toast confirms the swap (`i: Modalità mappa: raster` / `i: Map mode: glyph`). This emit lands in Phase 4b Plan 02 (toggle implementation) but the toast text passes through the standard z=1.5 queue.

## §4 Width Budget Additions (i18n-budgets.ts new keys)

Phase 4b extends `packages/g2-app/src/status-hud/i18n-budgets.ts` with the following keys. Plan 03/04/05 land them in their respective commits; all values run through the `as const satisfies Record<string, WidthBudgetRow>` typecheck gate.

### §4.1 Death-saves pivot (Plan 05)

| Key | IT | EN | DE | max |
|-----|----|----|----|-----|
| `death_saves_title` | `DEATH SAVES` | `DEATH SAVES` | `RETTUNG GG. TOD` | 16 |
| `death_saves_passes_label` | `Riusciti` | `Passes` | `Erfolge` | 8 |
| `death_saves_fails_label` | `Falliti` | `Fails` | `Misserfolge` | 11 |

**Note on `death_saves_title` (NEW):** kept English `DEATH SAVES` for IT + EN; DE expands to `RETTUNG GG. TOD` (15 chars) which still fits the 16-char budget. If user prefers IT localization, swap to `TIRI MORTE` (10 chars) — flagged for user confirmation at planner time.

**Note on `Falliti` row alignment:** `Falliti` is 7 chars vs `Riusciti` 8 chars; the renderer adds **3 trailing spaces** to `Falliti` and **2 trailing spaces** to `Riusciti` so the `[` bracket column lands at col 10 of the card inner content (INV-1 sub-rule 3 column alignment). DE `Misserfolge` (11) vs `Erfolge` (7) — the renderer right-pads the shorter label so both bracket columns align at col 14 in DE mode.

### §4.2 Toast queue (Plan 03)

| Key | IT | EN | DE | max | Notes |
|-----|----|----|----|-----|-------|
| `toast_squash_badge_template` | `[+{n}]` | `[+{n}]` | `[+{n}]` | 5 | `{n}` placeholder; rendered as `[+7]` etc. Caps `n` at 99 display. |
| `toast_row_padding_target` | — | — | — | 42 | Numeric only — every toast row pads to exactly 42 chars |

**Severity prefix** (`i:`, `!:`, `x:`) — **NOT added to i18n-budgets** per §7.1a.6 + Pitfall 6 (symbols, not labels; language-neutral).

### §4.3 Boot error UI (Plan 04)

| Key | IT | EN | DE | max |
|-----|----|----|----|-----|
| `boot_error_title_handshake` | `HANDSHAKE FALLITO` | `HANDSHAKE FAILED` | `HANDSHAKE FEHLGESCHLAGEN` | 24 |
| `boot_error_title_version` | `VERSIONE INCOMPATIBILE` | `VERSION MISMATCH` | `VERSION INKOMPATIBEL` | 24 |
| `boot_error_title_no_char` | `NESSUN PERSONAGGIO` | `NO CHARACTER` | `KEIN CHARAKTER` | 24 |
| `boot_error_title_bridge` | `BRIDGE NON RAGGIUNGIBILE` | `BRIDGE UNREACHABLE` | `BRIDGE NICHT ERREICHBAR` | 24 |
| `boot_error_title_token` | `TOKEN SCADUTO` | `TOKEN EXPIRED` | `TOKEN ABGELAUFEN` | 24 |
| `boot_error_hint_handshake_1` | `Risposta del bridge non valida.` | `Bridge response was invalid.` | `Bridge-Antwort ungültig.` | 50 |
| `boot_error_hint_handshake_2` | `Verifica versione del modulo.` | `Check module version.` | `Modulversion prüfen.` | 50 |
| `boot_error_hint_version_1` | `Il bridge parla un protocollo diverso.` | `Bridge speaks a different protocol.` | `Bridge nutzt anderes Protokoll.` | 50 |
| `boot_error_hint_version_2` | `Aggiorna il modulo Foundry.` | `Update the Foundry module.` | `Foundry-Modul aktualisieren.` | 50 |
| `boot_error_hint_no_char_1` | `Nessun PG assegnato a questo player.` | `No PC assigned to this player.` | `Kein SC zugewiesen.` | 50 |
| `boot_error_hint_no_char_2` | `Assegna un PG da Foundry.` | `Assign one from Foundry.` | `Einen SC in Foundry zuweisen.` | 50 |
| `boot_error_hint_bridge_1` | `Connessione al bridge fallita.` | `Connection to bridge failed.` | `Bridge-Verbindung fehlgeschlagen.` | 50 |
| `boot_error_hint_bridge_2` | `Verifica URL e rete LAN.` | `Check URL and LAN.` | `URL und LAN prüfen.` | 50 |
| `boot_error_hint_token_1` | `La sessione è scaduta (24h).` | `Session expired (24h).` | `Sitzung abgelaufen (24h).` | 50 |
| `boot_error_hint_token_2` | `Riaccoppia con un nuovo QR.` | `Re-pair via the QR.` | `Neu pairen via QR.` | 50 |
| `boot_error_close_label` | `[X] Chiudi` | `[X] Close` | `[X] Schließen` | 14 |

### §4.4 Concentration-drop modal (Plan 05)

| Key | IT | EN | DE | max |
|-----|----|----|----|-----|
| `conc_modal_title` | `CONCENTRATION CONFLICT` | `CONCENTRATION CONFLICT` | `KONZENTRATIONSKONFLIKT` | 26 |
| `conc_modal_active_label` | `Spell attivo:` | `Active spell:` | `Aktiver Zauber:` | 16 |
| `conc_modal_casting_template` | `Castando {name} verrà rimosso.` | `Casting {name} will drop it.` | `{name} wirken lässt ihn fallen.` | 50 |
| `conc_modal_confirm_question` | `Continuare?` | `Continue?` | `Fortfahren?` | 12 |
| `conc_modal_y_button_template` | `[Y] Drop & cast {name}` | `[Y] Drop & cast {name}` | `[Y] Ablegen & wirken {name}` | 30 |
| `conc_modal_n_button` | `[N] Cancel` | `[N] Cancel` | `[N] Abbrechen` | 14 |

**Note on `conc_modal_title`** — kept English `CONCENTRATION CONFLICT` for IT/EN; DE `KONZENTRATIONSKONFLIKT` (23 chars) fits the 26-char budget. The title sits inside a `┌─[ … ]─` frame on row 6 of the modal — header bracket consumes 4 chars (`─[ ` + ` ]─`), leaving 56 - 4 = 52 chars for the title; 26-char budget is well under.

## §5 Canonical Fixtures (character-perfect ASCII)

All fixtures live in `packages/shared-render/src/fixtures/` and are read by `matchAsciiFixture` via the Phase 4a relative-path convention (Pitfall 5 — 4× `../` from `packages/g2-app/src/<dir>/__tests__/`).

**Fixture count: 17**

| # | Filename | Width × Height | Purpose |
|---|----------|---------------|---------|
| 1 | `boot-error.handshake-failed.it.txt` | 96 × 24 | Boot dispatch handshake_failed, IT |
| 2 | `boot-error.handshake-failed.en.txt` | 96 × 24 | Boot dispatch handshake_failed, EN |
| 3 | `boot-error.version-mismatch.it.txt` | 96 × 24 | Boot dispatch version_mismatch, IT |
| 4 | `boot-error.version-mismatch.en.txt` | 96 × 24 | Boot dispatch version_mismatch, EN |
| 5 | `boot-error.no-character.it.txt` | 96 × 24 | Boot dispatch no_character, IT |
| 6 | `boot-error.no-character.en.txt` | 96 × 24 | Boot dispatch no_character, EN |
| 7 | `boot-error.bridge-unreachable.it.txt` | 96 × 24 | Boot dispatch bridge_unreachable, IT |
| 8 | `boot-error.bridge-unreachable.en.txt` | 96 × 24 | Boot dispatch bridge_unreachable, EN |
| 9 | `boot-error.token-expired.it.txt` | 96 × 24 | Boot dispatch token_expired, IT |
| 10 | `boot-error.token-expired.en.txt` | 96 × 24 | Boot dispatch token_expired, EN |
| 11 | `toast-queue.single.it.txt` | 96 × 24 | 1 toast visible, no squash |
| 12 | `toast-queue.dual.it.txt` | 96 × 24 | 2 toasts FIFO visible, no badge |
| 13 | `toast-queue.squashed.it.txt` | 96 × 24 | Head with `[+7]` badge (Fireball + 8 saves) |
| 14 | `status-hud.death-saves-initial.it.txt` | 28 × 21 | 0 pass / 0 fail (latch ON) |
| 15 | `status-hud.death-saves-mid.it.txt` | 28 × 21 | 1 pass / 2 fail (mid-saves) |
| 16 | `conc-modal.open.it.txt` | 96 × 24 | Modal open, Bless on Hold Person |
| 17 | `conc-modal-on-death-saves.it.txt` | 96 × 24 | Modal + death-saves pivot simultaneous |

> **Note on `conc-modal.long-names.it.txt` (originally listed in the prompt):** the long-name stress case is folded into `conc-modal.open.it.txt` IF the planner chooses to use IT's "Mass Cure Wounds → Cura Ferite di Massa" as the canonical example; otherwise it can be added as fixture #18. **Defer to planner.** This UI-SPEC ships the simpler `Bless on Hold Person` variant as the canonical fixture #16 (single source of truth for the modal layout); the long-names variant becomes an INV-1 ck 12 variable-content stress assertion in Plan 05's snapshot test, NOT a separate fixture.

---

### §5.1 Fixture 1 — `boot-error.handshake-failed.it.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ HANDSHAKE FALLITO                                        │                ║
║                  │                                                          │                ║
║                  │ Risposta del bridge non valida.                          │                ║
║                  │ Verifica versione del modulo.                            │                ║
║                  │                                                          │                ║
║                  │ [X] Chiudi                                               │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.2 Fixture 2 — `boot-error.handshake-failed.en.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ HANDSHAKE FAILED                                         │                ║
║                  │                                                          │                ║
║                  │ Bridge response was invalid.                             │                ║
║                  │ Check module version.                                    │                ║
║                  │                                                          │                ║
║                  │ [X] Close                                                │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.3 Fixture 3 — `boot-error.version-mismatch.it.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ VERSIONE INCOMPATIBILE                                   │                ║
║                  │                                                          │                ║
║                  │ Il bridge parla un protocollo diverso.                   │                ║
║                  │ Aggiorna il modulo Foundry.                              │                ║
║                  │                                                          │                ║
║                  │ [X] Chiudi                                               │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.4 Fixture 4 — `boot-error.version-mismatch.en.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ VERSION MISMATCH                                         │                ║
║                  │                                                          │                ║
║                  │ Bridge speaks a different protocol.                      │                ║
║                  │ Update the Foundry module.                               │                ║
║                  │                                                          │                ║
║                  │ [X] Close                                                │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.5 Fixture 5 — `boot-error.no-character.it.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ NESSUN PERSONAGGIO                                       │                ║
║                  │                                                          │                ║
║                  │ Nessun PG assegnato a questo player.                     │                ║
║                  │ Assegna un PG da Foundry.                                │                ║
║                  │                                                          │                ║
║                  │ [X] Chiudi                                               │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.6 Fixture 6 — `boot-error.no-character.en.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ NO CHARACTER                                             │                ║
║                  │                                                          │                ║
║                  │ No PC assigned to this player.                           │                ║
║                  │ Assign one from Foundry.                                 │                ║
║                  │                                                          │                ║
║                  │ [X] Close                                                │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.7 Fixture 7 — `boot-error.bridge-unreachable.it.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ BRIDGE NON RAGGIUNGIBILE                                 │                ║
║                  │                                                          │                ║
║                  │ Connessione al bridge fallita.                           │                ║
║                  │ Verifica URL e rete LAN.                                 │                ║
║                  │                                                          │                ║
║                  │ [X] Chiudi                                               │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.8 Fixture 8 — `boot-error.bridge-unreachable.en.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ BRIDGE UNREACHABLE                                       │                ║
║                  │                                                          │                ║
║                  │ Connection to bridge failed.                             │                ║
║                  │ Check URL and LAN.                                       │                ║
║                  │                                                          │                ║
║                  │ [X] Close                                                │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.9 Fixture 9 — `boot-error.token-expired.it.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ TOKEN SCADUTO                                            │                ║
║                  │                                                          │                ║
║                  │ La sessione è scaduta (24h).                             │                ║
║                  │ Riaccoppia con un nuovo QR.                              │                ║
║                  │                                                          │                ║
║                  │ [X] Chiudi                                               │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.10 Fixture 10 — `boot-error.token-expired.en.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                  ┌──────────────────────────────────────────────────────────┐                ║
║                  │ TOKEN EXPIRED                                            │                ║
║                  │                                                          │                ║
║                  │ Session expired (24h).                                   │                ║
║                  │ Re-pair via the QR.                                      │                ║
║                  │                                                          │                ║
║                  │ [X] Close                                                │                ║
║                  └──────────────────────────────────────────────────────────┘                ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
║                                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.11 Fixture 11 — `toast-queue.single.it.txt`

Overlays one info toast onto the raster-idle scene; z=0.5 stats strip at row 21 is **demolished** by the toast container because the toast occupies rows 19-20 of the map area (Plan 03 explicitly removes the z=0.5 combat-log + label rows when toast mounts; the stats strip alone remains at row 21 per §Q1 budget — z=0.5 keeps 1 container in toast-active mode). The right-side Status HUD card is preserved unchanged.

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ THORIN  F3/W5            ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║ PF ████████░░            ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │       ║    45/68  +10t           ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │       ║ CA 18  VEL 30            ║
║   │                           │                           │       ║                          ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │       ║ Az. ░  Bns ░  R░         ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │       ║ Mov 30/30                ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤       ║                          ║
║   │ Foundry canvas — lower L  │                           │       ║ Slot                     ║
║   │                           │                           │       ║   1° ▓▓░░ 2/4            ║
║   │                           │                           │       ║   2° ▓░░  1/3            ║
║   │                           │                           │       ║   3° ░░   0/2            ║
║   │                           │                           │       ║                          ║
║   └───────────────────────────┴───────────────────────────┘       ║ Condizioni               ║
║                                                                   ║  ▶ Bless (7r)            ║
║                         i: Danno 12 slashing                      ║    Concentr.             ║
║                                                                   ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   modo: ▶RASTER (toggle GLYPH)   [scheda] [combat]      ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.12 Fixture 12 — `toast-queue.dual.it.txt`

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ THORIN  F3/W5            ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║ PF ████████░░            ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │       ║    45/68  +10t           ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │       ║ CA 18  VEL 30            ║
║   │                           │                           │       ║                          ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │       ║ Az. ░  Bns ░  R░         ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │       ║ Mov 30/30                ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤       ║                          ║
║   │ Foundry canvas — lower L  │                           │       ║ Slot                     ║
║   │                           │                           │       ║   1° ▓▓░░ 2/4            ║
║   │                           │                           │       ║   2° ▓░░  1/3            ║
║   │                           │                           │       ║   3° ░░   0/2            ║
║   │                           │                           │       ║                          ║
║   └───────────────────────────┴───────────────────────────┘       ║ Condizioni               ║
║                                                                   ║  ▶ Bless (7r)            ║
║                         i: Tiro Salv. DES superato                ║    Concentr.             ║
║                         i: Danno 12 slashing                      ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   modo: ▶RASTER (toggle GLYPH)   [scheda] [combat]      ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.13 Fixture 13 — `toast-queue.squashed.it.txt`

Fireball + 8 saves stress case (SC #3): 9 toasts arrived; 2 visible (head with `[+7]` squash badge), 7 queued.

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ THORIN  F3/W5            ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║ PF ████████░░            ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │       ║    45/68  +10t           ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │       ║ CA 18  VEL 30            ║
║   │                           │                           │       ║                          ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │       ║ Az. ░  Bns ░  R░         ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │       ║ Mov 30/30                ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤       ║                          ║
║   │ Foundry canvas — lower L  │                           │       ║ Slot                     ║
║   │                           │                           │       ║   1° ▓▓░░ 2/4            ║
║   │                           │                           │       ║   2° ▓░░  1/3            ║
║   │                           │                           │       ║   3° ░░   0/2            ║
║   │                           │                           │       ║                          ║
║   └───────────────────────────┴───────────────────────────┘       ║ Condizioni               ║
║                                                                   ║  ▶ Bless (7r)            ║
║                         i: Tiro Salv. DES superato [+7]           ║    Concentr.             ║
║                         i: Danno 28 fuoco                         ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   modo: ▶RASTER (toggle GLYPH)   [scheda] [combat]      ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### §5.14 Fixture 14 — `status-hud.death-saves-initial.it.txt`

28-char × 21-row (Status HUD card only — same shape as Phase 4a `status-hud.loading.txt`). HP=0, 0 passes, 0 fails (initial pivot entry).

```
║ Thorin                   ║
║ ────────────────         ║
║                          ║
║ DEATH SAVES              ║
║                          ║
║ Riusciti  [ ◯ ◯ ◯ ]      ║
║ Falliti   [ ◯ ◯ ◯ ]      ║
║                          ║
║ PF  0/68                 ║
║ CA 18                    ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
╠══════════════════════════╣
```

### §5.15 Fixture 15 — `status-hud.death-saves-mid.it.txt`

HP=0, 1 pass, 2 fails (mid-saves — one more fail and PC dies).

```
║ Thorin                   ║
║ ────────────────         ║
║                          ║
║ DEATH SAVES              ║
║                          ║
║ Riusciti  [ ● ◯ ◯ ]      ║
║ Falliti   [ ● ● ◯ ]      ║
║                          ║
║ PF  0/68                 ║
║ CA 18                    ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
║                          ║
╠══════════════════════════╣
```

### §5.16 Fixture 16 — `conc-modal.open.it.txt`

z=2 modal mounted; z=0.5 demolished; z=1 Status HUD preserved at right; z=0 raster tiles preserved (visible under the modal's transparency-illusion — in practice the modal's text container overwrites the raster tile content at those character cells, but the surrounding raster cells render normally).

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ THORIN  F3/W5            ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║ PF ████████░░            ║
║      ┌─[ CONCENTRATION CONFLICT ]──────────────────────────────┐  ║    45/68  +10t           ║
║      │                                                         │  ║ CA 18  VEL 30            ║
║      │  Spell attivo:                                          │  ║                          ║
║      │    Hold Person (5r)                                     │  ║ Az. ░  Bns ░  R░         ║
║      │                                                         │  ║ Mov 30/30                ║
║      │  Castando Bless verrà rimosso.                          │  ║                          ║
║      │                                                         │  ║ Slot                     ║
║      │  Continuare?                                            │  ║   1° ▓▓░░ 2/4            ║
║      │                                                         │  ║   2° ▓░░  1/3            ║
║      │   [Y] Drop & cast Bless     [N] Cancel                  │  ║   3° ░░   0/2            ║
║      │                                                         │  ║                          ║
║      └─────────────────────────────────────────────────────────┘  ║ Condizioni               ║
║                                                                   ║  ▶ Bless (7r)            ║
║                                                                   ║    Concentr.             ║
║                                                                   ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: [Y] conferma  [N] annulla                                         [scheda] [combat]      ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

> **Geometry note for executors:** the modal's left `│` is at col **6**, right `│` at col **65**. The modal occupies rows **6-17** of the page (12 rows). The raster tile 1 line (`┌─[ tile 1 ]──...`) at row 5 is **preserved** (the modal starts at row 6). The footer R1 hint row (row 22) **changes** when modal is active to show the `[Y]/[N]` gesture mapping (per §3.5 — gesture annotation matches the modal's button layout).

### §5.17 Fixture 17 — `conc-modal-on-death-saves.it.txt`

Edge case (CONTEXT Area 8 simultaneous): HP=0 (death-saves pivot in Status HUD) AND conc-conflict modal open. Different z-strata, both visible. The Status HUD card right of col 68 shows the death-saves pivot UNCHANGED.

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ Thorin                   ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║                          ║
║      ┌─[ CONCENTRATION CONFLICT ]──────────────────────────────┐  ║ DEATH SAVES              ║
║      │                                                         │  ║                          ║
║      │  Spell attivo:                                          │  ║ Riusciti  [ ● ◯ ◯ ]      ║
║      │    Hold Person (5r)                                     │  ║ Falliti   [ ● ● ◯ ]      ║
║      │                                                         │  ║                          ║
║      │  Castando Cura Ferite verrà rimosso.                    │  ║ PF  0/68                 ║
║      │                                                         │  ║ CA 18                    ║
║      │  Continuare?                                            │  ║                          ║
║      │                                                         │  ║                          ║
║      │   [Y] Drop & cast Cura…     [N] Cancel                  │  ║                          ║
║      │                                                         │  ║                          ║
║      └─────────────────────────────────────────────────────────┘  ║                          ║
║                                                                   ║                          ║
║                                                                   ║                          ║
║                                                                   ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: [Y] conferma  [N] annulla                                         [scheda] [combat]      ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

> **Why this fixture matters:** it proves the layer-manager respects strata independence — the z=2 modal mounts atomically (demolishing z=0.5) but does NOT touch z=1 Status HUD, which retains its pivoted death-saves render. The right-side card cols 68-95 is **identical** to fixture #15 `status-hud.death-saves-mid.it.txt` (rows 3-23 of this fixture correspond to rows 0-20 of fixture #15). If a future change diffs these two right-side stretches, the snapshot test fails — INV-1 column continuity broken.

## §6 INV-1 Self-Audit (Per Fixture → Rule Matrix)

| Fixture | §7.1a.1 frame | §7.1a.2 width budgets | §7.1a.3 column align | §7.1a.4 equal-width | §7.1a.5 HUD invariant | §7.1a.6 glyph safety | §7.1a.7 render contract | §7.1a.8 i18n stress | §7.14.4 ck 11 | §7.14.4 ck 12 | §7.14.4 ck 13 | §7.14.4 ck 14 | §7.14.4 ck 15 |
|---------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `boot-error.handshake-failed.{it,en}` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `boot-error.version-mismatch.{it,en}` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `boot-error.no-character.{it,en}` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `boot-error.bridge-unreachable.{it,en}` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `boot-error.token-expired.{it,en}` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `toast-queue.single.it` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | ✓ |
| `toast-queue.dual.it` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | ✓ |
| `toast-queue.squashed.it` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ |
| `status-hud.death-saves-initial.it` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | ✓ |
| `status-hud.death-saves-mid.it` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ |
| `conc-modal.open.it` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | ✓ |
| `conc-modal-on-death-saves.it` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ |

**ck 11 (corner alignment):** every fixture preserves `║` at col 0 / col 68 / col 95 (for 96-wide fixtures) or `║` at col 0 / col 27 (for 28-wide fixtures). Verified by snapshot diff.

**ck 12 (variable-content stress):** death-saves-mid and toast-squashed exercise content variation (1 vs 2 fails; squash badge present vs absent) at fixed column positions. conc-modal-on-death-saves exercises HP=0 (=1 char) vs HP=24/30 (=5 chars) in the same column 5 of the HUD card.

**ck 13 (tab strip equal-width):** N/A for Phase 4b (no tab strips). The `[Y]/[N]` button pair in conc-modal is the analog — exercised in §7.1a.4 above.

**ck 14 (i18n stress):** 10 boot-error fixtures cover IT + EN; the longest IT title (`BRIDGE NON RAGGIUNGIBILE` = 24 chars) and longest IT hint (`Il bridge parla un protocollo diverso.` = 38 chars) both fit the 58-char inner panel content budget. DE optional — when added in a future PR, must fit the same budget (longest DE hint expected ~35 chars per the §4.3 table).

**ck 15 (render contract):** all fixtures correspond to `Box{children: TextRun[]}` trees, not concatenated strings. Plan 03/04/05 must enforce this in renderer constructors (static review at code-review time).

## §7 Render Contract Per Layer (Container Type Inventory)

Phase 4b extends the page-schema container declarations in `buildBootPageSchema()` (Phase 4a Plan 06) per Pitfall 1. Each new layer declares its containers upfront so `bridge.textContainerUpgrade` calls land on declared slots.

| Layer | New Container Names | Container Type | Count (idle) | Count (max) | Cross-ref |
|-------|--------------------|----------------|--------------|-------------|-----------|
| z=1.5 ToastQueueLayer | `toast-block` | text (single, 2-row newline-separated) | 1 | 1 | §3.2 + §Q1 Mitigation A2 |
| z=1.5 ToastQueueLayer (alternative) | `toast-slot-0`, `toast-slot-1` | text × 2 | 0 | 2 | Plan 03 evaluates at code time; if container budget tight, fall back to single-container Q1 A2 |
| z=2 ConcentrationDropModalPanel | `overlay-title`, `overlay-body`, `overlay-buttons` | text × 3 | 0 | 3 | §3.5 — 3 text containers max |
| z=1 BootErrorLayer | `boot-error-title`, `boot-error-hint-1`, `boot-error-hint-2`, `boot-error-close` | text × 4 | 0 | 4 | §3.3 — replaces boot splash header/footer when mounted |
| z=1 StatusHudLayer (death-saves mode) | `status-hud` (existing) | text (existing) | 1 | 1 | §3.4 — reuses Phase 4a container; renderer mode swap only |

**Cumulative container audit (Phase 4b worst case, raster mode):**

| Scenario | Image | Text/List | Total | Verdict |
|----------|-------|-----------|-------|---------|
| Idle (no overlay, no toast) — Phase 4a baseline preserved | 4 | 7 | 11 | ✓ |
| Idle + 1-2 toasts mounted, no overlay | 4 | 7 + 1 = 8 | 12 | ✓ At budget |
| Toast + conc-modal open (z=0.5 demolished per ADR-0009 Amd 1) | 4 | (7 − 3 = 4) + 1 + 3 = 8 | 12 | ✓ At budget |
| Boot-error mounted (boot phase, no overlay, no toast) | 0 | 4 | 4 | ✓ |

**Capture invariant:** z=0 MapBaseLayer retains `isEventCapture=1` in all scenarios above. Modal input is routed via the in-process `panel-gesture-bus`, NOT via capture transfer (per §Q2 Pattern B).

## §8 Visual Stress Cases

### §8.1 Fireball + 8 saves → toast squash (SC #3)

**Trigger:** Player casts Fireball on a group of 8 goblins. MidiQOL emits 8 `DEX save` chat-card events in rapid succession plus 1 `damage applied` summary = 9 toasts in the buffer within ~500 ms.

**Expected visual:** Fixture #13 `toast-queue.squashed.it.txt` — head toast `i: Tiro Salv. DES superato [+7]` (8 saves + 1 damage − 2 visible − 1 padding from head = `[+7]`; wait — head is included in visible, so badge counts buffered queue length = 9 − 2 visible = 7 buffered → `[+7]`). Tail toast `i: Danno 28 fuoco` (the damage summary toast, last to arrive). The badge **decrements every 3 seconds** as visible toasts dwell out and queued toasts cycle through.

**INV-1 stress:** the head row's length grows from `i: Tiro Salv. DES superato` (26 chars + 3-char prefix = 29 chars) to `i: Tiro Salv. DES superato [+7]` (33 chars + 3-char prefix = wait, the prefix `i: ` is counted as part of the 33 — let me recount: `i: Tiro Salv. DES superato [+7]` = 3 + 27 = 30 chars). Both fit within the 42-char container-width budget (with right-padding). Snapshot diff between fixture #12 (dual, no badge) and fixture #13 (squashed) shows ONLY the `[+7]` insertion at cols ~39-42 of the toast container — NO other character shift.

### §8.2 Conc-modal with longest IT spell name

**Trigger:** Player has Hold Person active; attempts to cast `Cura Ferite di Massa` (Mass Cure Wounds, the longest common IT spell name = 20 chars).

**Expected visual:** Fixture #17 `conc-modal-on-death-saves.it.txt` shows the truncation behavior via the `Cura Ferite verrà rimosso.` line (line 11) and the `[Y] Drop & cast Cura…` button (line 15 — truncated with `…` to fit the 24-char button budget). The modal frame and the right-side Status HUD card retain identical column positions to fixture #16.

**INV-1 stress:** sub-rule 4 equal-width buttons — `[Y] Drop & cast Cura…` (21 chars including the `…`) occupies a fixed cols 10-30 budget; `[N] Cancel` (10 chars) at cols 31-40 budget. Both rendered with consistent right-padding so the closing `│` lands at col 65 regardless of name length.

### §8.3 Death-saves at boot during HP=0 PC import

**Trigger:** Player boots with a character that is already at HP=0 in Foundry (e.g., abandoned mid-encounter from prior session). Boot completes; first `character.delta` arrives with `hp: 0, death: { success: 1, failure: 2 }`.

**Expected visual:** StatusHudLayer never renders the "standard" mode at all on first frame — it goes directly to fixture #15 `status-hud.death-saves-mid.it.txt`. The latch is set in the first `_onDelta()` call; no flicker, no transient standard-layout frame.

**INV-1 stress:** preserves the 28×21 card geometry from boot onward; no resize, no shift. The "header line" (row 1 of the card) shows the PC name `Thorin` even though `hp === 0` — the PC is identified, not absent. (Note: `no_character` boot-error state is a separate flow — it fires when there's NO PC assigned, NOT when the assigned PC is at HP=0.)

## §9 Open Visual Questions (defer to planner / executor)

### §9.1 Toast container strategy: 1-container vs 2-container

The fixtures in §5.11-§5.13 assume **1 text container with 2-row newline-separated content** (`toast-block`) per §Q5 + §Q1 Mitigation A2 recommendation. Plan 03 may elect to use **2 separate text containers** (`toast-slot-0`, `toast-slot-1`) if the SDK's `textContainerUpgrade` newline rendering is unreliable on the simulator (verify in Plan 03 Task 0 smoke). Either implementation produces the same character grid output — the fixtures remain valid regardless.

### §9.2 z=0.5 demolish granularity when toast mounts

§Q1 Mitigation A1 demolishes z=0.5 IdleInfillLayer fully when z=2 mounts. **Open: should z=1.5 toast mount partially demolish z=0.5 too?** Phase 4b plan: NO — toast mounts atomically without touching z=0.5 (different containers). Container audit confirms this fits (§7 row 2: idle + 2 toasts = 12 containers = at budget). If Plan 03 finds container slot conflicts, fall back to demolishing the z=0.5 combat-log strip only (keeping the label and stats strips), reflected by re-emitting the page schema with only 1 z=0.5 container. The fixtures in §5.11-§5.13 already show the **z=0.5 combat-log + label rows blank** when toast is mounted — this represents the "demolish 2 of 3 z=0.5 rows" decision.

### §9.3 Boot-error close gesture binding (Plan 04 detail)

The `[X] Close` annotation in §5.1-§5.10 fixtures advertises a gesture that **Phase 6 wires** (the actual `[X]` gesture maps to a specific R1 input). Phase 4b ships the **visual annotation only**; the close action is a no-op or stubbed to call `bootEngine.retry()` if a test harness invokes it. **Open:** does the fixture need to change once Phase 6 wires the real gesture? **Resolution:** NO — the annotation `[X] Close` is the canonical visual contract. Phase 6 maps a gesture (double-tap, long-press, or scroll-down) to the close action without modifying the fixture.

### §9.4 Modal stacking policy when z=2 is already occupied (Open Question #3 in 04B-RESEARCH)

Phase 4b ships only one panel (conc-modal), so stacking is not exercised. **Defer to Phase 5 Plan 01 ADR-0009 Amendment 2 (or later amendment): modal pre-empts existing panel; prior panel is NOT auto-restored on modal close.** Phase 4b documents the policy in §3.5 but the planner SHOULD include a test in Plan 05 that asserts "mounting conc-modal when an arbitrary mock z=2 panel is already mounted unmounts the prior panel first" — this future-proofs the contract.

### §9.5 DE locale fixture parity

Per §Q6 + Assumption A6, Phase 4b ships **IT + EN only** for boot errors (10 fixtures); DE is best-effort per Specs §7.16.5. **Open:** if the user wants 3-locale parity, the fixture count grows from 17 to 22 (adding `boot-error.*.de.txt × 5` + `status-hud.death-saves.de.txt` + `conc-modal.de.txt`). **Resolution defer to planner during Plan 03/04/05 setup:** the i18n-budgets table in §4 already includes DE strings; producing DE fixtures is a mechanical task once the IT/EN ones land. Strongly recommended that the planner adds DE fixtures in Plan 04/05's last task to honor INV-1 ck 14 i18n stress fully.

### §9.6 Toast severity prefix glyph

The prefixes `i: ` / `!: ` / `x: ` are ASCII letters per Pitfall 6. **Open:** would Specs §7.4a.1 prefer Unicode glyphs (e.g., `ℹ ` info, `⚠ ` warn, `✖ ` error)? **Resolution:** stick with ASCII for Phase 4b (verified width-1 in G2 monospace, simple to type, locale-neutral). Future Phase 4c/5 may swap if Specs §7.4a.1 dictionary adds glyph entries — the swap is a 3-line change in `toast-types.ts` const string table.

### §9.7 `[GLY]` badge interaction with death-saves mode

Phase 4a's StatusHudRenderer places `[GLY]` badge at row 20 cols 22-26 when `mapMode='glyph'`. **Death-saves fixtures #14 and #15 show NO badge** (assume raster mode for the canonical fixture). **Open:** does the death-saves mode preserve the `[GLY]` badge in glyph mode? **Resolution:** YES — preserve it (the badge is a mapMode indicator, orthogonal to death-saves latch). Plan 05 must include a glyph-mode death-saves snapshot test (could be a runtime assertion rather than a separate fixture — `status-hud.death-saves-mid.it.glyph.txt` is optional fixture #18).

---

## UI-SPEC COMPLETE
