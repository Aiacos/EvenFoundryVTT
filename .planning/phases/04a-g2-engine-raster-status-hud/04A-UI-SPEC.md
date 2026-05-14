---
phase: 4a
slug: g2-engine-raster-status-hud
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-14
render_target: even-realities-g2
---

# Phase 4a — UI Design Contract: G2 Engine + Raster + Status HUD

> Visual and interaction contract for Phase 4a. This is NOT a browser/web UI spec.
> The "UI" runs inside the Even Realities App WebView (phone-side) and renders
> to G2 AR glasses via EvenAppBridge envelope calls. No DOM is emitted to G2.
> Render target = `flutterBridge.callHandler('evenAppMessage', json)` envelope
> dispatching `createStartUpPageContainer`, `rebuildPageContainer`,
> `updateImageRawData`, and `textContainerUpgrade`.
>
> This spec is consumed by gsd-ui-checker, gsd-planner, gsd-executor, and
> gsd-ui-auditor as the visual source of truth. INV-1 (Layout Integrity) makes
> every ASCII mockup in this document load-bearing — they are the contract for
> Vitest snapshot fixtures in `packages/shared-render/src/fixtures/`.
>
> Source decisions pre-populated from: CONTEXT.md (4 grey areas), Specs.md
> v0.9.11/v0.9.12, ADR-0001 (amended), ADR-0005 (PROVISIONAL Branch A),
> ADR-0008, REQUIREMENTS.md, even-hub.d.ts, hub-polyfill.ts.

---

## Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | none | CLAUDE.md D-2.04: no React/Vue/Svelte; render target is EvenAppBridge calls |
| Preset | not applicable | G2 is 4-bit greyscale monochrome; no CSS/HTML emitted to glasses |
| Component library | none — plain TypeScript modules + EvenAppBridge API | CONTEXT.md Area 1 |
| Icon library | Unicode block + box-drawing (glyph dictionary §7.4a.1) | Specs.md §7.4a.1 |
| Font | G2 firmware-defined monospace ~6×12 px; 96 char × 24 row grid | Specs.md §7.3 |

**Hardware render model (non-negotiable constraints):**

- Display: 576×288 px, 4-bit greyscale phosphor green, monochrome
- Character grid (approximation, pending Phase 0 hardware verification): ~96 char × 24 row at 6×12 px mono
- Container budget per page: max 4 image containers + max 8 text/list containers + exactly 1 container with `isEventCapture: 1`
- Image container limits (verbatim SDK @evenrealities/even_hub_sdk@0.0.10): width 20-288 px, height 20-144 px
- Text container limit: 999 bytes max content
- List container limit: 20 items × 63 bytes per item
- No arbitrary pixel drawing, no audio output, no camera (verbatim Even Hub docs)
- All Phase 4a code calls `EvenAppBridge` directly (NOT the legacy `hub.*` polyfill, which is Phase 2 compatibility only)

---

## Layout Grid

The 96×24 char grid is divided into fixed zones. Column boundaries are invariant
across all states (raster mode, glyph mode, idle z=0.5 visible, overlay z=2 open).
INV-1 requires character-perfect alignment at all times.

```
       0         10        20        30        40        50        60        70     68 95
       ┌──────────────────────────────────────────────────────────────────┬──────────────────┐
   0   │ HEADER  (1 row, text container, col 0-95)                        │                  │
       ├──────────────────────────────────────────────────────────────────┤                  │
   1   │                                                                  │   STATUS HUD     │
   2   │                                                                  │   (corner card)  │
   3   │    MAP BASE LAYER  z=0  ALWAYS RENDERED                          │   col 68-95      │
       │    raster: 4 image containers 200×100 tiled 2×2 = 400×200 px     │   ~28 char wide  │
       │    glyph: text grid ~66 char × 21 row, col 0-65                 │   21 row high    │
       │                                                                  │   z=1, read-only │
       │    [ z=2 overlay mounts here when open ]                         │                  │
       │    ─────────────────────────────────────────                     │                  │
       │    z=0.5 IDLE CONTENT INFILL (rows 17-19, col 0-67)              │                  │
       │    rendered ONLY when z=2 NOT mounted                            │                  │
  21   │    auto-demolished on overlay_mounted, reborn on overlay_dismiss  │                  │
       ├──────────────────────────────────────────────────────────────────┴──────────────────┤
  22   │ FOOTER (1-2 row, chips + R1 hint, col 0-95)                                         │
  23   │                                                                                     │
       └─────────────────────────────────────────────────────────────────────────────────────┘
```

**Fixed column boundaries (INV-1 invariant):**

| Zone | Column range | Width | Container type |
|------|-------------|-------|----------------|
| Map area (raster/glyph) | col 0-67 | 68 char | image × 4 (raster) OR 1 text (glyph) |
| Status HUD | col 68-95 | 28 char | 1-2 text containers |
| Header | col 0-95 | 96 char | 1 text container |
| Footer | col 0-95 | 96 char | 1 text container |
| z=0.5 idle infill | col 0-67, rows 17-19 | 68 char | 3 text containers |

The divider between map area and Status HUD sits at col 68 in every state.
No character ever crosses this boundary in any state or locale.

---

## Spacing Scale

This phase uses character-cell units, not CSS pixels. The monospace grid IS
the spacing system. All measurements below are in character cells (cols/rows).

| Token | Char units | Usage |
|-------|-----------|-------|
| gap-inline | 1 char | Space between label and value within a field (e.g., `HP ████`) |
| gap-col | 2 chars | Space between adjacent columns in the Status HUD |
| row-div | 1 row | Separator row using `─` or `═` glyph |
| pad-box | 1 char | Inner padding each side of a box border |
| indent | 2 chars | Content indent inside container borders |
| z05-rows | 3 rows | z=0.5 idle infill occupies rows 17-19 of map area |

Pixel exceptions (image containers only):

| Element | Value | Note |
|---------|-------|------|
| Raster tile size | 200×100 px effective per tile | Specs §7.4 — 4 tiles 2×2 = 400×200 px total |
| Effective raster resolution | 400×200 px | Maximum on G2 hardware (4 image containers × 200×100) |
| Sub-tile delta granularity | 32×32 px | 6×3 = 18 sub-tiles per tile, 72 per full frame; CONTEXT.md Area 2 |
| Portrait (future, Phase 5+) | 100×60 px | Not Phase 4a; reserved image slot swap policy §7.5.8 |

---

## Typography

G2 uses firmware-defined monospace font. No font selection is possible.
All sizing is in character rows/columns, not CSS points.

| Role | Char width budget | Weight equivalent | Usage | Width enforcement |
|------|-----------------|-------------------|-------|------------------|
| Label | 4-8 chars | Regular (firmware) | Field keys: `HP`, `AC`, `SPD`, `Act` | pad-right to budget |
| Value | 4-8 chars | Regular (firmware) | Field values: `45/68`, `18`, `30` | truncate-right with `…` |
| Glyph bar | 8 chars | Regular (firmware) | Progress: `████████░░` | fixed 8 glyph positions |
| Header line | 96 chars | Regular (firmware) | Scene name · mode · round · battery | truncate each segment |
| Footer line | 96 chars | Regular (firmware) | R1 hints · mode toggle · chips | fixed segments, no wrap |
| Section title | 16 chars | CAPS (convention) | `THORIN  F3/W5`, `Conditions` | pad to 16 or truncate |

**INV-1 width budget rule**: every string field has a `_max` character count defined
at build time. The layer engine pads or truncates deterministically; never wraps;
never best-effort. See §7.1a.2. Overflow → truncate with `…` + `i18n.overflow` telemetry.

---

## Color (Greyscale Palette)

G2 supports exactly 16 greyscale levels (4-bit, 0x0 = black through 0xF = white)
rendered as phosphor green. There is no color. The "60/30/10" split maps to
greyscale intensity bands.

| Role | 4-bit value | Visual | Usage |
|------|------------|--------|-------|
| Background / dominant (60%) | 0x0 (black) | Darkest phosphor | Base layer, map background, text container background |
| Medium surface / secondary (30%) | 0x4-0x8 | Mid-green | Floor tiles `░▒`, explored-but-unseen terrain, UI borders |
| High-intensity accent (10%) | 0xC-0xF (near-white) | Brightest phosphor | Active token `@`, PC name header, current-turn indicator, HP bar filled `█▓`, critical values |
| Destructive / warning | 0xA-0xB (medium-high) | Mid-high green | `⚠ SYNC LOST` chip, [GLY] fallback badge, error state text |

**Glyph density = greyscale proxy:**

Since no true color, density of block characters communicates state:
- `█` (full) = highest intensity (active, critical, filled slot)
- `▓` (dark shade) = high intensity (partially filled)
- `░` (light shade) = low intensity (empty, background floor)
- ` ` (space) = absent / disabled

**Dither algorithm:** Floyd-Steinberg (default), Atkinson and Bayer 8×8 selectable.
Library: `image-q@4.0.0`. 16-step greyscale custom palette. Worker-safe.

---

## Phase 4a Screen Inventory

This phase delivers 4 distinct screen states. Each has an ASCII fixture
committed under `packages/shared-render/src/fixtures/`.

### Screen 1: Boot Splash (separate page, pre-main)

Source: Specs.md §7.12. Uses a separate `createStartUpPageContainer` page.
Auto-transitions to main HUD on handshake complete. No R1 input accepted.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                           ║
║                              EVENFOUNDRYVTT  v0.9.11                                      ║
║                              ─────────────────                                            ║
║                                                                                           ║
║                              [ ✓ ] G2 display 576×288                                    ║
║                              [ ✓ ] R1 ring paired (92%)                                  ║
║                              [ ⟳ ] Bridge ws://homelab:8910                              ║
║                              [   ] Foundry sync                                           ║
║                              [   ] Character: Thorin                                      ║
║                                                                                           ║
║                              loading_                                                     ║
║                                                                                           ║
║                              protocol 1.0 · panels available: 5                           ║
║                                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Checklist item states:**

| Symbol | Meaning |
|--------|---------|
| `[ ✓ ]` | Step complete |
| `[ ⟳ ]` | Step in progress (rotating indicator — rendered as static `⟳` in text container) |
| `[   ]` | Step pending |
| `[ ✕ ]` | Step failed (capability handshake error — transitions to error screen, Phase 4b) |

**Capability handshake output line:** `protocol 1.0 · panels available: 5`
(5 = sheet / combat / log / spellbook / inventory — Phase 5 panels; Phase 4a only
verifies capability negotiation succeeds and renders this count.)

**INV-1 fixture:** `glyph-scene.boot.txt` — character-perfect including `[ ✓ ]` alignment.

### Screen 2: Default View — Raster Mode (MVP default)

Source: Specs.md §7.4. Main page. Map capture container active (z=0).

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster                ROUND 3 · TURN 2/5                ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║                                                                      ║ THORIN  F3/W5    ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐         ║ ──────────────── ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │         ║ HP ████████░░    ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │         ║    45/68  +10t   ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │         ║ AC 18  SPD 30    ║
║   │                           │                           │         ║                  ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │         ║ Act ░  Bns ░  R░ ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │         ║ Move 30/30       ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤         ║                  ║
║   │ Foundry canvas — lower L  │                           │         ║ Slots            ║
║   │                           │                           │         ║   1° ▓▓░░ 2/4    ║
║   │                           │                           │         ║   2° ▓░░  1/3    ║
║   │                           │                           │         ║   3° ░░   0/2    ║
║   │                           │                           │         ║                  ║
║   │                           │                           │         ║ Conditions       ║
║   └───────────────────────────┴───────────────────────────┘         ║  ▶ Bless (7r)    ║
║   ─── z=0.5 idle infill ──────────────────────────────────────────── ║    Concentr.     ║
║   ⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing              ║                  ║
║   raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick       ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   mode: ▶RASTER (toggle GLYPH)   [sheet] [combat]…  ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**INV-1 fixture:** `glyph-scene.raster-idle.txt` (with z=0.5 visible)

### Screen 3: Default View — Glyph Mode (fallback)

Source: Specs.md §7.4b.7. Active when BLE throughput < 100 kbps sustained OR
user manually selects via `[M] Map ctrl`. `[GLY]` badge visible in HUD
bottom-right corner (col 68+, locked 3-char width). MAP capture container active.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · glyph                 ROUND 3 · TURN 2/5                ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║      N                                                               ║ THORIN  F3/W5    ║
║   ┌────────────────────────────────────────────────────────────┐     ║ ──────────────── ║
║   │ ░░░░▒▒▒▒░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ │     ║ HP ████████░░    ║
║   │ ░░░░░░░░░░░g1░░░░░░░▓                          ▓░░░░░░░ │     ║    45/68  +10t   ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓   barile                 ▓░░░░░░░ │     ║ AC 18  SPD 30    ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓                          ▓░░g2░░░ │     ║                  ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓   tavolo                 ▓░░░░░░░ │     ║ Act ░  Bns ░  R░ ║
║   │ ░░░░L░░░░░░░░@▶░░░░░▓                          ▓░░░░░░░ │     ║ Move 30/30       ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓                          ▓░░░░░░░ │     ║                  ║
║   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │     ║ Slots            ║
║   └────────────────────────────────────────────────────────────┘     ║   1° ▓▓░░ 2/4    ║
║                                                                      ║   2° ▓░░  1/3    ║
║   @ YOU ▶ E   L Lyra   g1 Goblin Archer   g2 Goblin Brute            ║   3° ░░   0/2    ║
║   ░ floor  ▒ rough  ▓ wall      1 cell = 5 ft        Zoom 1×         ║                  ║
║                                                                      ║ Conditions [GLY] ║
║                                                                      ║  ▶ Bless (7r)    ║
║                                                                      ║    Concentr.     ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   mode: ▶GLYPH (toggle RASTER)   [sheet] [combat]…  ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**[GLY] badge rule:** 3 chars wide, locked at col 93-95 of the Status HUD region,
visible ONLY in glyph mode. Absent in raster mode (space-padded). INV-1: col 93-95
always 3 chars regardless of badge state. Source: CONTEXT.md Area 4.

**INV-1 fixture:** `glyph-scene.glyph-idle.txt`

### Screen 4: Loading / Missing-Data Placeholder State

Active during first boot before first delta arrives from WS. Status HUD fields
not yet populated. Source: CONTEXT.md Area 3 (missing data fallback policy).

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · —                                      — · —                            ⌁ R1 —     ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║                                                                      ║ —                ║
║                                                                      ║ ──────────────── ║
║                          …                                           ║ HP …             ║
║                                                                      ║    —/—           ║
║                          (connecting to Foundry)                     ║ AC —   SPD —     ║
║                                                                      ║                  ║
║                                                                      ║ Act —  Bns —  R— ║
║                                                                      ║ Move —/—         ║
║                                                                      ║                  ║
║                                                                      ║ Slots            ║
║                                                                      ║                  ║
║                                                                      ║                  ║
║                                                                      ║                  ║
║                                                                      ║                  ║
║                                                                      ║ Conditions       ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: —                                                                                    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Placeholder rules (INV-1 preserving):**
- `—` (em-dash U+2014): missing scalar field. Preserves column width exactly. Never collapses layout.
- `…` (ellipsis U+2026): loading state, first render only, before first WS delta arrives. Replaces map area content only.
- After first delta arrives, `…` is replaced by real content. `—` stays until that specific field is populated.
- HP bar in loading state: all `░░░░░░░░` (8 light-shade), value `—/—`. Width identical to populated state.

**INV-1 fixture:** `status-hud.loading.txt`

---

## Status HUD Design Contract (z=1)

Source: Specs.md §7.4, §7.1a.5. Always visible. Read-only. Never captures input.
Text container, col 68-95 (~28 char), rows 1-21.

### Field Layout (char-precise, INV-1)

```
║ {NAME padded to 12}  {CLASS padded to 8} ║  row 1  — section header
║ ──────────────────────────────────────── ║  row 2  — divider: 16 × ─
║ HP {bar 8-glyph}                         ║  row 3  — HP label + bar
║    {hp_cur/hp_max padded}  {temp_label}  ║  row 4  — HP values + temp
║ AC {ac_val 2}  SPD {spd_val 2}           ║  row 5  — AC + Speed
║                                          ║  row 6  — blank
║ Act {dot}  Bns {dot}  R{dot}             ║  row 7  — action economy
║ Move {move_cur}/{move_max}               ║  row 8  — movement
║                                          ║  row 9  — blank
║ Slots                                    ║  row 10 — section header
║   {lvl}° {bar 4-glyph} {cur}/{max}       ║  row 11 — spell slot 1 (max 3 rows)
║   {lvl}° {bar 4-glyph} {cur}/{max}       ║  row 12 — spell slot 2
║   {lvl}° {bar 4-glyph} {cur}/{max}       ║  row 13 — spell slot 3
║                                          ║  row 14 — blank (or more slots)
║ Conditions                               ║  row 15 — section header
║  ▶ {cond_1 name} ({duration})            ║  row 16 — condition 1 (active)
║    {cond_2 name}                         ║  row 17 — condition 2
║    {cond_3 name}                         ║  row 18 — condition 3
║    … +{N}                                ║  row 19 — overflow (max 3 visible + count)
║                                          ║  row 20 — reserved / [GLY] badge row
╠══════════════════════════════════════════╣  row 21 — border (shared with footer)
```

### Field Width Budgets (INV-1 §7.1a.2)

All budgets are inclusive of padding. Overflow → truncate with `…` at last char.

| Field | Width budget (chars) | Format | Overflow |
|-------|---------------------|--------|----------|
| Character name | 12 | Left-aligned, pad-right | Truncate at 11 + `…` |
| Class/level tag | 8 | Right-aligned in col | Truncate at 7 + `…` |
| HP bar | 8 glyphs | `█▓░` fill + empty | Fixed 8, no overflow |
| HP current/max | `{cur}/{max}` | 4+1+4 = 9 chars max | Pad left, fixed width |
| HP temp | `+{N}t` | 5 chars max (`+999t`) | Truncate at 4 + `…` |
| AC value | 2 chars | Right-pad to 2 | None (max 99) |
| Speed value | 2 chars (in ft) | Right-pad to 2 | None (max 99) |
| Action dot | 1 char | `▓` used / `░` free | N/A |
| Move current/max | `{cur}/{max}` | 3+1+3 = 7 chars | Right-pad to 7 |
| Slot level | 1 char + `°` = 2 | Literal: `1°` ... `9°` | N/A |
| Slot bar | 4 glyphs | `▓░` fill + empty | Fixed 4, no overflow |
| Slot cur/max | `{cur}/{max}` | 1+1+1 = 3 chars | None (max 9/9) |
| Condition name | 14 chars | Left-aligned | Truncate at 13 + `…` |
| Condition duration | `({N}r)` | 5 chars max `(99r)` | Truncate |
| [GLY] badge | 3 chars fixed | `[GLY]` or `   ` | Fixed — never truncate |

### i18n Width Budget (IT/EN/DE — INV-1 ck 11-15)

Phase 4a pre-computes longest string per HUD field across IT + EN + DE at build time.
Build fails if any locale string exceeds budget. CONTEXT.md Area 3.

| Field | IT (longest) | EN | DE | Budget |
|-------|-------------|----|----|--------|
| `HP` label | `PF` (2) | `HP` (2) | `TP` (2) | 2 chars |
| `AC` label | `CA` (2) | `AC` (2) | `RK` (2) | 2 chars |
| `SPD` label | `VEL` (3) | `SPD` (3) | `GES` (3) | 3 chars |
| `Conditions` section | `Condizioni` (10) | `Conditions` (10) | `Zustände` (8) | 10 chars |
| `Concentr.` (abbrev) | `Concentr.` (10) | `Concentr.` (10) | `Konzentr.` (10) | 10 chars |
| `Slots` section | `Slot` (4) | `Slots` (5) | `Slots` (5) | 5 chars |
| `Move` label | `Mov` (3) | `Mov` (3) | `Bew` (3) | 3 chars |
| `Act` label | `Azione` → abbrev `Az.` (3) | `Act` (3) | `Akt` (3) | 3 chars |
| `Bns` label | `Bonus` → abbrev `Bns` (3) | `Bns` (3) | `Bns` (3) | 3 chars |

**Rule:** IT strings are canonical for width budget sizing. EN/DE must fit within IT budget.
If EN or DE exceeds IT budget, fallback EN abbreviation is used.

---

## z=0.5 Idle Content Infill Design Contract

Source: Specs.md §7.4c, ADR-0001 Amendment 1. Three text containers in rows 17-19
of the map area. Active ONLY when no z=2 overlay is mounted. Auto-demolished on
`overlay_mounted` event, auto-reborn on `overlay_dismissed`. Never captures input.
Reuses 3 of the 8 text/list container budget slots.

| Row | Container | Content | Data source |
|-----|-----------|---------|-------------|
| 17 | `#1 Combat log strip` | `⚔ {actor} → {target} · {outcome} · {nums}` | `combat.recentEvents[0]` |
| 18 | `#2 Label separator` | `─── z=0.5 idle infill ──────────────────` | Static divider |
| 19 | `#3 Stats strip` | `{mode} {res} · {pipeline} · {ble_throughput} · {fps_observed} · [Q] Quick` | `render.stats` (pipeline frame events) |

**Atomic lifecycle rule (INV-1 §7.4c):** The layer-manager serializes
`[unmount #1, unmount #2, unmount #3] + [mount z=2 overlay]` as a single
`rebuildPageContainer` call. No intermediate frame where both z=0.5 and z=2 are visible.

**In glyph mode:** z=0.5 degrades to 2 containers (stats strip + label only);
combat-log strip is omitted (glyph grid already shows token deltas). Source: CONTEXT.md Area 2.

**Stats strip format (row 19):**

```
raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick
```

| Segment | Max width | Fallback |
|---------|-----------|---------|
| `{mode}` | `raster` (6) / `glyph` (5) | N/A |
| `{res}` | `400×200` (7) | `—` |
| `{pipeline}` | `FS+RLE+delta` (13) | `FS+delta` |
| `{ble_throughput}` | `BLE 999k` (8) | `BLE —` |
| `{fps_observed}` | `15 fps` (6) | `— fps` |
| `[Q] Quick` | 10 chars fixed | static |

---

## Glyph Dictionary (INV-1 canonical list)

All glyphs must be width-1 in monospace. No emoji, no CJK, no combining marks.
Source: Specs.md §7.4a.1, §7.5.2.

| Category | Glyph | Usage |
|----------|-------|-------|
| Terrain — floor | `░` | Normal walkable floor |
| Terrain — rough | `▒` | Difficult terrain |
| Terrain — wall | `▓` | Solid wall |
| Terrain — water | `~` | Water terrain |
| Terrain — door | `≡` | Door (closed) |
| Terrain — FoW unseen | `·` | Explored but not visible |
| Terrain — empty | ` ` | Unknown / void |
| Player token | `@` | Always this glyph for player character |
| Facing arrows | `▶◀▲▼` | Token facing direction (adiacente al token) |
| Party ally | `A-Z` uppercase initial | Unique per ally name |
| Enemy | `a-z` lowercase + digit | `g1`, `g2`, etc. |
| NPC neutral | `N` | NPC / neutral creature |
| Object | `o` | Destructible object, prop |
| AoE sphere | `✦` | Fireball, Globe of Invulnerability |
| AoE cone | `▒` | Burning Hands (reuses rough glyph) |
| AoE line | `═` | Lightning Bolt |
| AoE outline | `◯` | Area perimeter |
| AoE epicenter | `*` | Spell center |
| HP bar full | `█` | Filled HP increment |
| HP bar partial | `▓` | Partial HP increment |
| HP bar empty | `░` | Empty HP/slot increment |
| Progress bar | `▰▱` | XP bar, other progress |
| Action used | `▓` | Action economy: used |
| Action free | `░` | Action economy: available |
| Active condition | `▶` | Marker for first/active condition |
| Divider horizontal | `─` | Section separator in HUD |
| Box top-left | `┌` | Box border (inner overlays) |
| Box top-right | `┐` | Box border |
| Box bottom-left | `└` | Box border |
| Box bottom-right | `┘` | Box border |
| Box vertical | `│` | Box border |
| Box horizontal | `─` | Box border |
| Double box | `╔╗╚╝║═╠╣╦╩╬` | Outer page frame |
| Section cross | `╦╩╬` | Header/footer divider junction |
| Sync lost | `⚠` | `⚠ SYNC LOST` chip |
| BLE indicator | `⌁` | R1 battery/signal in header |
| Mode indicator | `▶` | Active mode in footer (e.g., `▶RASTER`) |

---

## Raster Pipeline Visual Contract

Source: Specs.md §7.4b.4, CONTEXT.md Area 2. Phase 4a delivers the complete
branch-A raster pipeline. All pipeline stages run in a singleton Web Worker.

**Pipeline stages (in order):**

| Stage | Operation | Library | Output |
|-------|-----------|---------|--------|
| 1 | Foundry canvas extract `canvas.app.renderer.extract.pixels()` | Foundry API (player client topology) | Raw RGBA pixel buffer |
| 2 | GPU resize via `OffscreenCanvas` `imageSmoothingQuality:'high'` to 400×200 | Platform (Web Worker) | 400×200 RGBA |
| 3 | Greyscale conversion (luminance formula) | Worker inline | 400×200 grey |
| 4 | Floyd-Steinberg dither to 16-level palette (default; Atkinson/Bayer selectable) | `image-q@4.0.0` | 400×200 4-bit indexed |
| 5 | Split into 4× 200×100 tiles | Worker inline | 4× tile buffers |
| 6 | xxhash per-tile + per-sub-tile (32×32 px, 6×3 = 18 sub-tiles/tile) | `xxhash-wasm@1.1.0` | hash arrays |
| 7 | Delta: compare hashes vs previous frame; identify changed tiles/sub-tiles | Worker inline | changed tile set |
| 8 | Custom RLE encode 4-bit regions in changed tiles | Worker inline | compressed payload |
| 9 | PNG 4-bit indexed encode of changed tiles | `upng-js@2.1.0` | PNG bytes |
| 10 | `updateImageRawData` dispatch via EvenAppBridge envelope | EvenAppBridge SDK | G2 display update |

**Frame rate state machine (Layer 6 adaptive):**

| State | Trigger | Target FPS | Heartbeat |
|-------|---------|-----------|-----------|
| idle | No canvas events, no combat | 0.3 fps | 3.3 s |
| slow | Scene update, token move | 3-5 fps | — |
| active | Combat turn active | ≥5 fps (std) | — |
| burst | Single-token-move scenario | ≥8 fps | — |
| stretch goal | BLE ≥1 Mbps + Layer 2+5 unlocked | 15 fps | — |
| storm | Canvas update flood | 0.5-2 fps (throttle) | — |

Frame trigger: event-driven on Foundry canvas `update` hook + 200 ms debounce.
Source: CONTEXT.md Area 2.

**Hardware-pending dimensions (PROVISIONAL per ADR-0005):**

The following metrics are target commitments whose verification requires real
G2 hardware + BLE measurements (§10.0.3-9 human_needed gates):

- ≥5 fps standard: software-verifiable via Vitest bench; hardware-pending for BLE p50
- BLE p50 latency envelope: hardware-pending (not in VERIFICATION.md as auto-green)
- Branch B/C fallback thresholds: PROVISIONAL per ADR-0005 until §10.0.3 measured

---

## Copywriting Contract

All UI strings target IT (MVP canonical), EN (canonical fallback), DE (best-effort INV-1).
No strings are embedded in G2 firmware. All strings flow from Foundry catalog via bridge.
Source: Specs.md §7.16.5.

| Element | IT (primary) | EN (fallback) | Max chars |
|---------|-------------|---------------|-----------|
| Boot status: G2 connected | `[ ✓ ] G2 display 576×288` | `[ ✓ ] G2 display 576×288` | 30 |
| Boot status: connecting bridge | `[ ⟳ ] Bridge ws://...` | `[ ⟳ ] Bridge ws://...` | 30 |
| Boot status: pending | `[   ] Sincronizzazione Foundry` | `[   ] Foundry sync` | 30 |
| Boot protocol line | `protocol 1.0 · pannelli: 5` | `protocol 1.0 · panels: 5` | 38 |
| Boot loading indicator | `caricamento_` | `loading_` | 14 |
| Map header: scene name | (from Foundry `scene.name`, passthrough) | — | 24 (truncate) |
| Map header: mode indicator | `raster` / `glyph` | `raster` / `glyph` | 6 |
| Map header: round/turn | `ROUND {N} · TURNO {n}/{max}` | `ROUND {N} · TURN {n}/{max}` | 26 |
| Footer: R1 hint | `R1: scroll=pana  tap=ping  long=quick` | `R1: scroll=pan  tap=ping  long=quick` | 38 |
| Footer: mode toggle active | `modo: ▶RASTER (toggle GLYPH)` | `mode: ▶RASTER (toggle GLYPH)` | 30 |
| Footer: mode toggle active glyph | `modo: ▶GLYPH (toggle RASTER)` | `mode: ▶GLYPH (toggle RASTER)` | 30 |
| HUD: HP label | `PF` | `HP` | 2 |
| HUD: AC label | `CA` | `AC` | 2 |
| HUD: Speed label | `VEL` | `SPD` | 3 |
| HUD: Action label | `Az.` | `Act` | 3 |
| HUD: Bonus label | `Bns` | `Bns` | 3 |
| HUD: Move label | `Mov` | `Mov` | 3 |
| HUD: Slots section | `Slot` | `Slots` | 5 |
| HUD: Conditions section | `Condizioni` | `Conditions` | 10 |
| HUD: Concentration (abbrev) | `Concentr.` | `Concentr.` | 10 |
| HUD: loading placeholder | `…` | `…` | 1 |
| HUD: missing value | `—` | `—` | 1 |
| z=0.5 label separator | `─── z=0.5 idle infill ──────────────────` | same | 40 (col 0-67) |
| [GLY] mode badge | `[GLY]` | `[GLY]` | 5 (fixed 3 in bracket) |

**Empty state (no character selected):**

| Element | IT | EN |
|---------|----|----|
| HUD character name | `— nessun PG —` | `— no character —` |
| HUD HP | `—/—` | `—/—` |
| Map area | `(in attesa…)` | `(waiting…)` |

**Error state copy (loading failure before bridge connected):**

| Scenario | IT | EN |
|----------|----|----|
| Bridge unreachable (shown in boot splash) | `✕ Bridge non raggiungibile — verificare URL` | `✕ Bridge unreachable — check URL` |
| Capability handshake failed | `✕ Handshake fallito — protocollo incompatibile` | `✕ Handshake failed — protocol mismatch` |
| No character assigned | `Nessun PG assegnato — vai a Foundry` | `No character assigned — go to Foundry` |

Note: Boot error states (BOOT-01) are fully specified in Phase 4b. Phase 4a
delivers only the boot splash screen that transitions HAPPY PATH to main HUD.
The five error branches (bridge unreachable / version mismatch / no character /
token expired) reserve their screen slots here but are wired in Phase 4b.

---

## Interaction Contract

Source: Specs.md §7.14, ADR-0001. Phase 4a's interaction surface is minimal —
the map capture container is the only active R1 target in default view.

**R1 gesture model (Phase 4a scope):**

| State | Gesture | Action | Note |
|-------|---------|--------|------|
| Boot splash | any | ignored | Boot splash accepts no input; auto-transitions |
| Default view (raster/glyph) | scroll | pan map viewport | z=0 capture container handles |
| Default view | tap | ping/place waypoint on map | z=0 capture container handles |
| Default view | long-press | open Quick Action menu | Phase 4a reserves API; wiring in Phase 6 |
| Default view | double-tap | back (no-op in main view, main IS home) | — |

**Capture container invariant (CONTEXT.md Area 1):**

- Exactly 1 container with `isEventCapture: 1` at every mount/unmount cycle.
- Layer manager asserts this invariant via unit test after every `mount()` and `destroy()` call.
- z=0 map holds capture in default view.
- z=0.5 NEVER holds capture (render-only).
- z=1 Status HUD NEVER holds capture (render-only).
- z=2 overlay holds capture when mounted (Phase 4b/5 concern; layer manager reserves the API).

**Layer manager API surface (Phase 4a delivers):**

```typescript
// CONTEXT.md Area 1 — exact signatures
mount(z: ZIndex, layer: Layer): void
destroy(z: ZIndex): void
bundle(ops: LayerOp[]): void          // atomic: unmount-z=0.5 + mount-z=2 in one frame
setMapMode(mode: 'auto' | 'raster' | 'glyph'): void   // API reserved; wiring Phase 6
```

```typescript
interface Layer {
  id: string;
  draw(): Promise<void>;
  destroy(): void;
  getCaptureContainer?(): ContainerId;   // undefined = layer is render-only
}
```

---

## Container Budget Allocation

Source: Specs.md §3.1, ADR-0001. Budget per page: 4 image + 8 text/list + 1 capture.

### Raster mode, idle (z=0.5 visible, z=2 not mounted)

| Slot | Type | Z-layer | Content | isEventCapture |
|------|------|---------|---------|----------------|
| img-1 | image 200×100 | z=0 | Foundry canvas upper-left tile | 1 (map capture) |
| img-2 | image 200×100 | z=0 | Foundry canvas upper-right tile | 0 |
| img-3 | image 200×100 | z=0 | Foundry canvas lower-left tile | 0 |
| img-4 | image 200×100 | z=0 | Foundry canvas lower-right tile | 0 |
| txt-1 | text | z=1 | Status HUD (HP/AC/slots/conditions) | 0 |
| txt-2 | text | z=1 | Header row | 0 |
| txt-3 | text | z=1 | Footer row | 0 |
| txt-4 | text | z=0.5 | z=0.5 #1 Combat log strip | 0 |
| txt-5 | text | z=0.5 | z=0.5 #2 Label separator | 0 |
| txt-6 | text | z=0.5 | z=0.5 #3 Stats strip | 0 |
| txt-7 | — | — | FREE (polish margin) | — |
| txt-8 | — | — | FREE (polish margin) | — |

Total: 4/4 image used, 6/8 text used, 1/1 capture assigned. 2 text free for future polish.

### Raster mode, overlay open (z=2 mounted, z=0.5 demolished)

| Slot | Type | Z-layer | Content |
|------|------|---------|---------|
| img-1..4 | image | z=0 | Raster tiles (maintained, may reduce to 3+1 portrait in Phase 5+) |
| txt-1 | text | z=1 | Status HUD |
| txt-2 | text | z=1 | Header |
| txt-3 | text | z=1 | Footer |
| txt-4..8 | text | z=2 | Overlay panel content (Phase 5 panels; budget reserved here) |

Note: z=0.5 containers (txt-4..6 in idle) are demolished before z=2 mounts.
The txt-4..6 slots are then occupied by z=2 overlay content.

### Glyph mode, idle (z=0.5 visible, z=2 not mounted)

| Slot | Type | Z-layer | Content |
|------|------|---------|---------|
| img-1..4 | image | — | NOT USED (all image slots free) |
| txt-1 | text | z=0 | Glyph grid (~66×21 char map) |
| txt-2 | text | z=1 | Status HUD |
| txt-3 | text | z=1 | Header |
| txt-4 | text | z=1 | Footer |
| txt-5 | text | z=0.5 | z=0.5 #3 Stats strip (combat-log omitted in glyph mode) |
| txt-6 | text | z=0.5 | z=0.5 #2 Label separator |
| txt-7..8 | — | — | FREE |

Glyph mode advantage: 4 image containers completely free for Phase 5+ portrait images.

---

## Fixture File Map

Phase 4a commits the following ASCII fixture files to `packages/shared-render/src/fixtures/`:

| File | Screen | State | INV-1 check |
|------|--------|-------|-------------|
| `glyph-scene.boot.txt` | Boot splash | all checklist items ✓ | ck 11 |
| `glyph-scene.raster-idle.txt` | Default raster + z=0.5 | normal content | ck 12 |
| `glyph-scene.raster-idle-it.txt` | Default raster + z=0.5 | IT longest strings | ck 14 |
| `glyph-scene.raster-idle-en.txt` | Default raster + z=0.5 | EN strings | ck 14 |
| `glyph-scene.raster-idle-de.txt` | Default raster + z=0.5 | DE strings | ck 14 |
| `glyph-scene.glyph-idle.txt` | Glyph mode + [GLY] badge | normal content | ck 13 |
| `status-hud.loading.txt` | Loading placeholder | all `—` and `…` | ck 15 |
| `status-hud.hp-overflow.txt` | Status HUD | HP=700, name=16 chars | ck 11 |
| `status-hud.conditions-overflow.txt` | Status HUD | 7 conditions → 3+`+4` | ck 11 |

Each fixture is a verbatim character dump of the rendered state. CI fails on any
diff between fixture and runtime render (Vitest `matchAsciiFixture` from `@evf/shared-render`).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none — plain TypeScript modules |
| Icon library | Unicode glyph dictionary (see Glyph Dictionary section) |
| Font | G2 firmware monospace ~6×12 px per char (hardware-defined, no selection) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| npm (image-q@4.0.0) | raster dither pipeline | Worker-safe verified; no DOM dep; Specs §11.5.7 |
| npm (upng-js@2.1.0) | 4-bit PNG encode | Worker-safe verified; no DOM dep; Specs §11.5.7 |
| npm (xxhash-wasm@1.1.0) | sub-tile hash delta | WASM ~1 GB/s; no DOM dep; Specs §11.5.7 |
| @evenrealities/even_hub_sdk@0.0.10 | EvenAppBridge API | MIT, by Whiskee Chen @ Even Realities; verified 2026-05-14 |
| shadcn official | none | not applicable — no browser DOM UI |
| third-party shadcn registries | none | not applicable |

No third-party shadcn blocks or shadcn registry components are used. This phase
outputs EvenAppBridge container calls, not browser DOM nodes.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — IT/EN/DE strings defined, max-char budgets set per field
- [ ] Dimension 2 Visuals: PASS — ASCII mockups character-precise; glyph dictionary canonical
- [ ] Dimension 3 Color: PASS — 4-bit greyscale palette defined; no color possible on G2
- [ ] Dimension 4 Typography: PASS — char-cell units, firmware font, width budgets per field
- [ ] Dimension 5 Spacing: PASS — char-cell spacing scale; image container pixel rules declared
- [ ] Dimension 6 Registry Safety: PASS — 4 npm packages reviewed; no shadcn; no third-party blocks

**Approval:** pending

---

## Pre-Population Sources

| Source | Decisions Used |
|--------|---------------|
| CONTEXT.md | 4 grey areas: Layer Manager API, Worker topology + sub-tile delta, Status HUD MVP fields + i18n budget, Branch B/C fallback trigger + [GLY] badge |
| Specs.md §3.1, §7.2, §7.3, §7.4, §7.4a, §7.4a.1, §7.4b.4, §7.4b.6.1, §7.4b.7, §7.4c, §7.12, §7.16 | Hardware constraints, canvas allocation, all ASCII mockups, glyph dictionary, raster pipeline, i18n architecture |
| ADR-0001 (+ Amendment 1 2026-05-14) | z=0/0.5/1/2 layer model, container budget, capture-container invariant, z=0.5 atomic lifecycle |
| ADR-0005 (PROVISIONAL Branch A) | BLE threshold for auto-fallback, human_needed gate on hardware FPS |
| even-hub.d.ts + hub-polyfill.ts | EvenAppBridge canonical method list, image/text container limits, SDK version 0.0.10 |
| REQUIREMENTS.md | DISP-01/02/03, MAP-01/02/03/04, NAV-04, I18N-04 success criteria |
| User input | 0 (all decisions pre-populated from upstream artifacts) |

---

*UI-SPEC created: 2026-05-14 by gsd-ui-researcher (Claude Sonnet 4.6)*
*Render target: Even Realities G2 AR glasses via EvenAppBridge envelope calls*
*Consumed by: gsd-ui-checker · gsd-planner · gsd-executor · gsd-ui-auditor*
