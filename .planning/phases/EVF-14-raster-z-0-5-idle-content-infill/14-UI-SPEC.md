---
phase: 14
slug: raster-z-0-5-idle-content-infill
status: draft
shadcn_initialized: false
preset: not-applicable-hardware-AR
created: 2026-05-17
target_hardware: Even Realities G2 (576×288 4-bit phosphor green)
binds: Specs.md §7.2 §7.3 §7.4 §7.4c §7.5 §11.5.7 §11.5.8 · ADR-0001 Amendment 1
---

# Phase 14 — UI Design Contract: z=0.5 Idle Content Infill

> **Visual + interaction contract for the Even Realities G2 layered HUD.** This phase has **no web/mobile/desktop UI** — the "design system" is the Even Hub envelope API (`createStartUpPageContainer` / `rebuildPageContainer` / `textContainerUpgrade` / `updateImageRawData`) + canonical ASCII mockups in `Specs.md` + INV-1 character-precision snapshot fixtures in `@evf/shared-render`. Standard web sections (spacing scale, typography sizes, color palette, responsive breakpoints, browser compatibility) are **structurally not applicable** and are documented as N/A below to satisfy the gsd-ui-checker template.

---

## 0. Phase Scope (one paragraph)

Lock and ratify the **z=0.5 Idle Content Infill** layer as a first-class member of the layered render model (z=0 map / z=0.5 idle infill / z=1 status HUD / z=2 overlay). The implementation already exists (`packages/g2-app/src/status-hud/idle-infill-layer.ts` from Phase 4a, differential demolish from Phase 4b Amendment 1, `Specs.md` §7.4c from 2026-05-14 quick task). Phase 14's contract is: (a) freeze the canonical ASCII mockups for the 3 layered states, (b) lock width budgets per locale, (c) lock the container budget table per state, (d) lock the demolish/remount timing semantics so no regression can erode them, (e) emit the INV-3 atomic v0.9.11 → v0.9.12 spec bump (Specs.md + README.md + showcase + ADR-0001 in one commit — note: Specs.md / README / showcase have *already* been pre-bumped during the 2026-05-14 quick task; Phase 14 reconciles ADR-0001 status + STATE.md + ROADMAP.md + any drift in one final atomic commit).

---

## 1. Design System (hardware-AR substitute)

| Property | Value |
|----------|-------|
| Tool | none (shadcn N/A — no DOM emitted by `g2-app`) |
| Preset | not-applicable (Even Realities G2 hardware target; render output is `EvenAppBridge.rebuildPageContainer` envelope calls) |
| Component library | `@evenrealities/even_hub_sdk@0.0.10` — `RebuildPageContainer` + `TextContainerUpgrade` payload schemas |
| Render surface | Even Realities G2 glasses, 576×288 px, 4-bit greyscale phosphor green (16 shades), font firmware-defined |
| Approximate text grid | 96 cols × 24 rows @ 6×12 px monospace (Specs.md §7.3) — load-bearing for all mockups in this document |
| Image library | `image-q@4.0.0` (Floyd-Steinberg dither) + `upng-js@2.1.0` (4-bit indexed PNG encode) — owned by z=0 raster pipeline, **z=0.5 never consumes image budget** |
| Icon library | Unicode box-drawing + dingbats (`⚔ ▶ ─ │ ┌ ┐ └ ┘ ╔ ╗ ╚ ╝ ║ ═ ╠ ╣ ╦ ╩ ▓ ▒ ░ ⌁`) — INV-1 width-budgeted code-points |
| Font | firmware-defined monospace (no font control per `hub.evenrealities.com/docs/guides/device-apis` *"no font control, no text alignment"*) |
| Color | 4-bit greyscale phosphor green — see §3 Color |

**Why no shadcn:** `packages/g2-app` emits zero DOM (CLAUDE.md "no DOM in g2-app"). The "components" are `TextContainerUpgrade` payloads pushed into hardware-allocated slots. Registry safety gate is **not applicable**.

---

## 2. Spacing Scale (hardware-AR substitute — character grid)

The G2 has no CSS pixel spacing model. The "spacing scale" is **character cells** on the firmware-defined monospace grid.

| Token | Value | Usage |
|-------|-------|-------|
| char | 1 cell (~6×12 px) | atomic unit; all alignment is char-aligned |
| col-gap | 1 cell | between adjacent inline items (`a · b`) — separator is the middle dot, not whitespace alone |
| row-gap | 0 cells | layered text containers stack with no inter-row blank — empty rows are explicit cells of `' '` |
| frame | 1 char | box-drawing border on every side (left/right `║`, top/bottom `═`) |
| left-margin (z=0.5) | 3 chars | `║   ` — left frame + 3 spaces, matching z=0 raster-tiles indent (Specs.md §7.4 row 5 `║   ┌─[ tile 1 …`) |
| right-stop (z=0.5) | col 70 | the right edge of all z=0.5 content; col 71 is the central frame `║` separating map-area from Status HUD |
| content-width (z=0.5 strip) | **66 cells** (col 4 → col 69 inclusive) | the usable interior of one z=0.5 strip after frame + left-margin + right-stop |

**Spacing exceptions:** none. Every char position is load-bearing per INV-1 (Specs.md §7.1a sub-rules 1-8). Frame corners at col 0, col 71, col 95 must align across all states (raster-idle / overlay-open / glyph-idle).

---

## 3. Typography (hardware-AR substitute — text characteristics)

The G2 firmware defines the font — we cannot pick sizes, weights, or line-heights. The "typography contract" specifies character semantics + width budgets per row.

| Role | Glyph set | Width budget | Semantics |
|------|-----------|--------------|-----------|
| Combat-log strip (row 17) | ASCII + `⚔ →` + middle-dot `·` | **≤ 66 cells** (col 4 → 69), single line | `⚔ {actor} → {target} · {outcome} · {numbers}{padding}` — overflow truncates with no ellipsis (INV-1 width-budget §7.16) |
| Label-separator (row 18) | box-drawing `─` + ASCII | **= 40 cells** literal | constant: `─── z=0.5 idle infill ──────────────────` — never variable, never localized |
| Stats strip (row 19) | ASCII + middle-dot `·` + brackets `[]` | **= 60 cells** literal (computed; see `STATS_STRIP_WIDTH` in idle-infill-layer.ts) | format: `{mode} {res} · {pipeline} · BLE {N}k · {N} fps · [Q] Quick` — missing scalars render as em-dash `—`, width preserved |

**Two character classes (the "weight" equivalent):**

| Class | Visual | Used for |
|-------|--------|----------|
| Body | regular ASCII (`A-Za-z0-9` + punctuation) | data values (HP, fps, numbers, names) |
| Symbol | box-drawing + dingbats (`╔ ╗ ║ ═ ┌ ┐ ─ │ ▓ ▒ ░ ⚔ ▶ ⌁ →`) | frame, dividers, indicators — **never mixed inside a numeric run** |

Line-height: hardware-fixed 1 char (no inter-row leading control). All multi-row layouts must stack on integer char-cell rows.

---

## 4. Color (hardware-AR substitute — phosphor palette)

The G2 is **4-bit greyscale phosphor green** (16 shades, 0 = off, 15 = full bright). There is no RGB, no theming, no per-element color control on text containers — text is rendered in the same phosphor shade as the surrounding chrome. Raster image containers (z=0) are the only z-band that touches the 16-shade greyscale via Floyd-Steinberg dither.

| Role | Phosphor shade | Usage |
|------|---------------|-------|
| Dominant (60%) | shade 12-15 (bright text on dark) | All z=0.5 text body — combat-log, label, stats strip |
| Secondary (30%) | shade 8-12 (mid-bright) | Box-drawing frame around z=0 raster tiles + the right Status HUD column |
| Accent (10%) | reserved at shade 15 (full bright) | **Only used by:** the `⚔` indicator at start of combat-log row, the `▶` cursor in Status HUD (column right, owned by z=1 — z=0.5 must NOT introduce new `▶`), the `─── z=0.5 idle infill ───` separator row (visual scope marker), the `[Q]` quick-action chip in stats strip |
| Destructive (semantic) | not applicable | z=0.5 has zero destructive actions — read-only by contract (Specs.md §7.4c.2 row "Capture: never") |

**Accent reserved for** (explicit list — never "every interactive element"):

1. `⚔` at column 4 of row 17 (combat-log strip leader glyph)
2. `─── z=0.5 idle infill ───` literal of row 18 (the layer's own self-label — surfaces the layer's identity for debug + acceptance testing)
3. `[Q] Quick` literal of row 19 (the only chip in z=0.5 that references a gesture — long-press → Quick Action menu)

z=0.5 introduces no other accent glyph. Any addition is a contract change requiring this UI-SPEC to be re-versioned.

---

## 5. Copywriting Contract

### 5.1 z=0.5 Strings (IT primary, EN canonical fallback per §7.16)

| Element | IT (primary) | EN (canonical fallback) | Max cells |
|---------|--------------|-------------------------|-----------|
| Combat-log empty state | `⚔ —` | `⚔ —` | 4 |
| Combat-log standard format | `⚔ {actor} → {target} · {outcome} · {numbers}` | `⚔ {actor} → {target} · {outcome} · {numbers}` | ≤ 66 |
| Combat-log canonical sample | `⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing` | `⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing` | 53 |
| Label-separator (constant, non-localized) | `─── z=0.5 idle infill ──────────────────` | (same) | = 40 |
| Stats strip format | `{mode} {res} · {pipeline} · BLE {N}k · {N} fps · [Q] Quick` | (same — keywords ASCII) | = 60 |
| Stats strip canonical sample | `raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick` | (same) | 60 |
| Stats strip missing-field token | `—` (em-dash U+2014) per CONTEXT.md §Area 3 | `—` | 1 |

### 5.2 No CTAs, no Empty States, no Error States, no Destructive Actions

z=0.5 is **render-only** (Specs.md §7.4c.2). It does not surface any of the traditional copywriting contract elements:

| Element | Status | Reason |
|---------|--------|--------|
| Primary CTA | **not applicable** | z=0.5 captures no input; the only input-driving chip `[Q] Quick` is a passive label — the actual long-press is owned by z=0 (Map base) or z=2 (overlay) |
| Empty state heading | **not applicable** | "no data" → combat-log strip renders `⚔ —` placeholder; label + stats strips still render |
| Empty state body | **not applicable** | (see above) |
| Error state | **not applicable** | z=0.5 has no error path — malformed deltas are dropped silently by upstream `safeParse` per T-4a-04-01 pattern |
| Destructive confirmation | **not applicable** | read-only by contract |

### 5.3 Locale Behavior

- Locale follows `game.i18n.lang` per §7.16.
- On-glasses override available via Quick Action `[N] Language` per §7.16 (Phase 6) — z=0.5 must re-render on `locale.changed` event.
- Width-budget is set by the **longest-string locale** (currently IT for combat-log; EN for stats strip keywords). Both fit in ≤ 66 cells with the canonical sample above.
- Pseudo-localization (Phase 5 helper) must not break alignment — confirm with `locale-override.stress-{es,fr,pt-br}` snapshots reused.

---

## 6. Layout Contract — Three Canonical States

The contract is the **3 ASCII fixtures** (raster-idle, overlay-open, glyph-idle) + 1 transient (mid-mount). Each fixture is character-precision per INV-1 §7.1a. Frame corners (`╔ ╗ ╚ ╝ ╠ ╣`), the inner-frame separator (`║` at col 71), and the right edge (`║` at col 95) must occupy the **same column in every fixture**. Width is 96 cells; the right boundary is at col 95 (inclusive) → frame char at col 95.

### 6.1 State A — Raster idle (z=0 + z=0.5 + z=1; canonical)

**Source of truth:** `packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt` (already exists; freeze under Phase 14).

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        ROUND 3 · TURN 2/5         ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ THORIN  F3/W5            ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║ HP ████████░░            ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │       ║    45/68  +10t           ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │       ║ AC 18  SPD 30            ║
║   │                           │                           │       ║                          ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │       ║ Act ░  Bns ░  R░         ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │       ║ Mov 30/30                ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤       ║                          ║
║   │ Foundry canvas — lower L  │                           │       ║ Slots                    ║
║   │                           │                           │       ║   1° ▓▓░░ 2/4            ║
║   │                           │                           │       ║   2° ▓░░  1/3            ║
║   │                           │                           │       ║   3° ░░   0/2            ║
║   │                           │                           │       ║                          ║
║   └───────────────────────────┴───────────────────────────┘       ║ Conditions               ║
║   ─── z=0.5 idle infill ──────────────────────────────            ║  ▶ Bless (7r)            ║
║   ⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing           ║    Concentr.             ║
║   raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q]          ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   mode: ▶RASTER (toggle GLYPH)   [sheet] [combat]       ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

**z=0.5 occupies rows 18, 19, 20** (label-separator / combat-log / stats — the implementation order in `idle-infill-layer.ts:draw()` is combat-log first then label then stats; the fixture shows the visual order top-to-bottom which is label → combat-log → stats per Specs.md §7.4 mockup row order).

Row inventory inside z=0.5 strip (cols 4–69, content-width 66):

| Row | Content | Localized? | Source |
|-----|---------|-----------|--------|
| 18 | `─── z=0.5 idle infill ──────────────────────────────` | No (literal label) | `LABEL_SEPARATOR_CONTENT` in idle-infill-layer.ts |
| 19 | `⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing` | Names + numbers from `combat.recentEvents[0]`; verbs (`hit`, `dmg`) follow `game.i18n.lang` | `combat.recentEvents[0]` (Phase 7+ wire) |
| 20 | `raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q]` | No (ASCII keywords) | `render.stats` event-based (Specs.md §7.4c.8 OQ7.4c.1 default) |

### 6.2 State B — Overlay-open (z=0 + z=1 + z=2; z=0.5 demolished)

**Source of truth:** Phase 14 must add a new fixture, e.g. `packages/shared-render/src/fixtures/raster-overlay-open.txt`. The 3 z=0.5 rows are replaced by **z=2 panel content** (per §7.5 Sheet, §7.6 Combat, etc.); the empty-rows region is owned by z=2 in this state.

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster        ROUND 3 · TURN 2/5         ⌁ R1 92%                     ║
╠═══════════════════════════════════════════════════════════════════╦══════════════════════════╣
║                                                                   ║ THORIN  F3/W5            ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐       ║ ────────────────         ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │       ║ HP ████████░░            ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │       ║    45/68  +10t           ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │       ║ AC 18  SPD 30            ║
║   │                           │                           │       ║                          ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │       ║ Act ░  Bns ░  R░         ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │       ║ Mov 30/30                ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤       ║                          ║
║   │ Foundry canvas — lower L  │                           │       ║ Slots                    ║
║   │                           │                           │       ║   1° ▓▓░░ 2/4            ║
║   │                           │                           │       ║   2° ▓░░  1/3            ║
║   │                           │                           │       ║   3° ░░   0/2            ║
║   │                           │                           │       ║                          ║
║   └───────────────────────────┴───────────────────────────┘       ║ Conditions               ║
║   ┌─[ SHEET · BIO ]────────────────────────────────────┐          ║  ▶ Bless (7r)            ║
║   │ Thorin Stonebeard · F3/W5 · LG dwarf folk hero     │          ║    Concentr.             ║
║   │ Background: Folk Hero · Alignment: Lawful Good     │          ║                          ║
╠═══════════════════════════════════════════════════════════════════╩══════════════════════════╣
║ R1: scroll=naviga  tap=action  long=close   ▶SHEET active                                    ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

**Critical INV-1 cross-state invariant:**
- Cols 0, 71, 95 (frame chars `║`) occupy the **same column** as State A.
- Cols `╔ ╗ ╚ ╝ ╠ ╣` corners at rows 0, 2, 21, 23 occupy the **same column** as State A.
- The right Status HUD column (cols 71–95) is **byte-identical** to State A (z=1 is not demolished on overlay mount per Specs.md §7.4c.4 state machine; the only modal-full-screen exception is Voice/Clarify which hides z=1, not applicable in Phase 14).
- The footer row (row 22) **changes content** (chip set switches from raster-mode chips to overlay-mode chips) — this is owned by z=1, not z=0.5, and is documented in 04b-UI-SPEC.

### 6.3 State C — Glyph-mode idle (z=0 + z=0.5 + z=1; raster disabled)

**Source of truth:** `packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt` (already exists). In glyph mode the existing fixture has **no z=0.5 strip visible** (the glyph grid uses the rows). Per Specs.md §7.4c.8 OQ7.4c.2 the agreed degradation is: **glyph mode keeps z=0.5 BUT drops the combat-log strip** (redundant — the glyph grid already shows token deltas). Phase 14 must update the glyph fixture (or add a new one `glyph-scene.glyph-idle-z05.txt`) showing only the label-separator + stats strip:

```
║   ─── z=0.5 idle infill ──────────────────────────────            ║  ▶ Bless (7r)            ║
║   glyph 66×21 · token-delta · BLE 64k · 0.3 fps · [Q]             ║    Concentr.             ║
║                                                                   ║                    [GLY] ║
```

Container budget: glyph idle = 0 image + 5+2 = 7 text (Header + Status HUD + Footer + 2 z=0.5) + 1 capture. Below cap.

> **Decision (Phase 14 ratifies):** glyph mode renders **2 z=0.5 strips** (label + stats), not 3. The combat-log strip is omitted. This matches `IdleInfillLayer.draw()` raster-vs-glyph branching at lines 116-124. Locked.

### 6.4 State D — Mid-mount transition (race coverage)

**Not a visual fixture** — a behavioral assertion. The LayerManager differential demolish (Phase 4b Amendment 1, ADR-0009 Amendment 1) guarantees a single `bridge.rebuildPageContainer` flush per transition. Phase 14 adds a unit test (not a snapshot) asserting:

| Assertion | Source |
|-----------|--------|
| Calling `lm.bundle([mount(z=2, panel)])` while `Z0_5_IDLE_INFILL` is mounted produces **exactly 1** `bridge.rebuildPageContainer` call | `LayerManager.bundle()` step 6 (layer-manager.ts:271) |
| The effective op list synthesises `[destroy(z=0.5), mount(z=2)]` — verified via spy on `effective` array | layer-manager.ts:191–224 |
| The demolished `IdleInfillLayer` instance is stashed in `_suspendedZ05` and reference-equality-restored on the inverse `destroy(z=2)` bundle | layer-manager.ts:80, 200–219 |
| If an `overlay_mounted` event arrives mid-render of a z=0.5 update (race), the z=0.5 update is aborted before the bridge call | Specs.md §7.4c.4 + §11.5.8.6 |

No INV-1 fixture is needed for State D — it's a timing/atomicity property, not a visual one. The test lives in `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` (LMT-DD-01..06 already exist; Phase 14 adds the race-coverage variant LMT-DD-07).

---

## 7. Container Budget Table (per state — hardware-locked, the load-bearing contract)

The Even Hub SDK caps containers at **4 image + 8 text/list + 1 capture per page** (per `@evenrealities/even_hub_sdk@0.0.10` `index.d.ts` lines 638–640 + 674–677, INV-2 re-verified 2026-05-15). Phase 14 must not push any state over this ceiling.

| State | Image | Text/list | Capture | Total | At-cap? | Notes |
|-------|-------|-----------|---------|-------|---------|-------|
| **A. Raster idle** (z=0 + z=0.5 + z=1) | 4 (2×2 raster) | 5 + 3 z=0.5 = **8** | 1 (z=0) | 13 | ✓ **at-cap** (text/list exhausted) | Header (1) + Status HUD (1) + Footer (1) + Action Econ widget overlay rows (2) + combat-log + label + stats = 8. Container budget assertion in `LayerManager._assertContainerBudget` must pass (layer-manager.ts:337–351). |
| **B. Overlay-open panel** (z=0 + z=1 + z=2) | 4 (or 3 if portrait-tile per §7.5) | 5 + 1–3 z=2 = **6–8** | 1 (z=2) | 11–13 | depends on overlay | z=0.5 is **fully demolished** (3 text slots reclaimed → available to z=2). |
| **B'. Overlay-open modal** (z=2 only — z=0/0.5/1 hidden) | up to 4 | up to 8 | 1 (z=2) | up to 13 | modal-dependent | E.g. Voice/Clarify §7.10. z=0.5 demolished; z=1 also hidden by modal contract — z=2 owns full budget. |
| **C. Glyph idle** (z=0 + z=0.5 + z=1) | 0 | 5 + 2 z=0.5 = **7** | 1 (z=0) | 8 | below cap | Glyph mode drops combat-log strip — 1 text slot free for future features. |

**Container naming (locked, must match `idle-infill-layer.ts`):**

| z=0.5 slot | Container name | Type | Width | Source row |
|------------|----------------|------|-------|-----------|
| Combat-log strip | `z05-combat-log` | text | ≤ 66 cells | row 19 of mockup |
| Label-separator | `z05-label` | text | = 40 cells | row 18 of mockup |
| Stats strip | `z05-stats` | text | = 60 cells | row 20 of mockup |

---

## 8. Demolish / Remount Timing Contract

### 8.1 Trigger transitions

| From state | Trigger | To state | Layer ops (effective) | Bridge flushes |
|------------|---------|----------|----------------------|----------------|
| A (idle) | `overlay_mounted` (panel/modal) | B (overlay-open) | `[destroy(z=0.5), mount(z=2, panel)]` | 1 |
| B (overlay-open) | `overlay_dismissed` (close) | A (idle) | `[destroy(z=2), mount(z=0.5, _suspendedZ05)]` | 1 |
| A (raster idle) | `map.mode = glyph` Quick Action | C (glyph idle) | `[destroy(z=0), destroy(z=0.5), mount(z=0, glyphMap), mount(z=0.5, idleLayer-glyph)]` | 1 |
| C (glyph idle) | `map.mode = raster` Quick Action | A (raster idle) | inverse of above | 1 |

**Atomicity guarantee:** every transition issues **exactly 1** `bridge.rebuildPageContainer` call (Specs.md §7.4c.4 + ADR-0001 Amendment 1). The `LayerManager.bundle()` flush is the single observable hardware boundary.

### 8.2 INV-1 invariants across transitions (Phase 14 lock)

1. Frame chars `╔ ╗ ╚ ╝ ║ ═ ╠ ╣ ╦ ╩` at cols 0, 71, 95 and rows 0, 2, 21, 23 occupy the **same column** in A, B, B', and C.
2. The right Status HUD column (cols 71–95) is **byte-identical** in A and B (z=1 is not affected by z=0.5 lifecycle).
3. No transient frame exists where both z=0.5 and z=2 are visible (single-flush guarantee).
4. The footer row (row 22) is owned by z=1; its content may change between A and B per chip-set rules, but its column positions are identical.
5. In State A → State B, the cell content at cols 4–69 of rows 18, 19, 20 changes from z=0.5 content → z=2 panel content; the **rows themselves remain 3 rows tall, same col-width** (z=2 panels must respect col 4–69 left/right stops).

### 8.3 Cadence

| Behavior | Rate | Mechanism |
|----------|------|-----------|
| z=0.5 strip refresh (combat-log, stats) | **1 Hz** (decoupled from raster 5 fps) | `StatusHud.tick()` 1 Hz pattern reused (Specs.md §7.4c.8 OQ7.4c.1 default = event-based; Phase 14 ratifies 1 Hz tick as the upper bound for non-event-driven repaints) |
| Label-separator | static (never re-rendered after initial mount) | constant in `idle-infill-layer.ts:68` |
| Demolish/remount | event-driven (`overlay_mounted` / `overlay_dismissed`) | single bundle flush |
| Heartbeat re-render | every 30 s (inherited from z=1) | recovery-only |

---

## 9. INV-1 Snapshot Fixtures (Phase 14 deliverable)

Phase 14 locks the following fixtures under `packages/shared-render/src/fixtures/`. Existing fixtures stay; new fixtures are added.

| Fixture | Status | Locale | Purpose |
|---------|--------|--------|---------|
| `glyph-scene.raster-idle.txt` | **exists** — freeze | EN (canonical) | State A locked baseline |
| `glyph-scene.raster-idle-it.txt` | **exists** — freeze | IT | State A IT-locale variant |
| `glyph-scene.raster-idle-en.txt` | **exists** — freeze | EN | State A EN variant |
| `glyph-scene.raster-idle-de.txt` | **exists** — freeze | DE | State A DE variant (locale stress per §7.16) |
| **`raster-overlay-open.it.txt`** | **NEW Phase 14** | IT | State B canonical (overlay-open, z=0.5 absent) |
| **`raster-overlay-open.en.txt`** | **NEW Phase 14** | EN | State B EN variant |
| `glyph-scene.glyph-idle.txt` | **exists** — must be updated OR new variant added | EN | State C — current fixture has empty rows; Phase 14 either updates this or adds `glyph-scene.glyph-idle-z05.txt` showing the 2-strip degraded z=0.5 |
| **`glyph-scene.glyph-idle-z05.it.txt`** | **NEW Phase 14** | IT | State C with z=0.5 enabled (label + stats only, no combat-log per §6.3) |

**Snapshot matcher:** `matchAsciiFixture` from `@evf/shared-render` (Phase 1 Plan 03). Already used by 80+ fixtures.

**Width:** every fixture is **96 cols wide**, **24 rows tall** (including frame). AsciiGrid constructor validates this at parse time.

**Acceptance per fixture:** all column-position invariants from §8.2 above pass `AsciiGrid.at(col, row)` cross-state equality assertions.

---

## 10. Locale Width-Budget Lock

Per §7.16 width-budget table, Phase 14 locks:

| String | IT width | EN width | DE width (stress) | Budget cap | Pass? |
|--------|----------|----------|-------------------|-----------|-------|
| Combat-log canonical sample | 53 cells | 53 cells | 56 cells (est.) | ≤ 66 | ✓ |
| Label-separator (constant) | 40 cells | 40 cells | 40 cells | = 40 | ✓ |
| Stats strip canonical sample | 60 cells | 60 cells | 60 cells (ASCII keywords) | = 60 | ✓ |
| Stats strip with `—` missing fields | varies | varies | varies | = 60 (padded) | ✓ — `_formatStatsStrip()` pads to STATS_STRIP_WIDTH |
| `─── z=0.5 idle infill ───` (literal — non-localized) | 40 | 40 | 40 | = 40 | ✓ — literal in code |

**The keyword `idle infill` is intentionally EN even in IT locale** — it surfaces the layer's z-band identifier for debug + acceptance testing and avoids translating a code term. This is a Phase 14 decision; document in Specs.md changelog if challenged.

---

## 11. Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | **not applicable — no DOM, no React, no web framework in g2-app** |
| Third-party | none | not applicable |
| Hardware SDK | `@evenrealities/even_hub_sdk@0.0.10` (MIT, by Whiskee Chen @ Even Realities) | already vetted in `oq-inv2-4-hub-polyfill-via-evenrealities-sdk` (2026-05-14 STATE.md) — Path A polyfill in `packages/g2-app/src/hub-polyfill.ts` |

No new dependencies are introduced by Phase 14. The polyfill + SDK are already on the package manifest.

---

## 12. Checker Sign-Off

Standard 6 dimensions adapted to hardware-AR context:

- [ ] **Dimension 1 Copywriting:** 7 strings + 3 missing-field tokens declared; combat-log + stats strip width budgets locked; label-separator is constant non-localized literal. → **PASS** (Phase 14 freeze)
- [ ] **Dimension 2 Visuals:** 3 canonical ASCII mockups + 1 race-behavior assertion locked. Phase 14 deliverable adds 3 new fixtures, freezes 5 existing. → **pending fixture commit**
- [ ] **Dimension 3 Color:** N/A in CSS sense — 4-bit phosphor green palette declared; accent reserved-for list = 3 specific glyphs (`⚔`, `─── z=0.5 idle infill ───`, `[Q] Quick`). → **PASS**
- [ ] **Dimension 4 Typography:** N/A in CSS sense — character semantics declared per row; 2 character classes (body, symbol). → **PASS**
- [ ] **Dimension 5 Spacing:** N/A in CSS sense — char-cell grid declared; content-width 66 cells, left-margin 3 chars, right-stop col 70. → **PASS**
- [ ] **Dimension 6 Registry Safety:** N/A — no shadcn, no third-party blocks. Hardware SDK pre-vetted. → **PASS**

**Approval:** pending (Phase 14 plan-phase + execute-phase must commit fixtures and validate INV-1 cross-state column equality assertions before this flips to approved).

---

## 13. Phase 14 Deliverables Checklist (UI-SPEC scope only — non-binding to planner; the planner owns task-level breakdown)

The planner consumes this UI-SPEC and produces tasks; the UI deliverables visible from this contract are:

1. **Freeze** the 5 existing fixtures listed in §9 (no edits — Phase 14 ratifies as-is).
2. **Add** 3 new fixtures: `raster-overlay-open.it.txt`, `raster-overlay-open.en.txt`, `glyph-scene.glyph-idle-z05.it.txt` (or update the existing `glyph-scene.glyph-idle.txt`).
3. **Add** a unit test asserting cross-state column-position equality (frame chars, separators) between State A, B, B', C fixtures — leverages `AsciiGrid.at(col, row)` returning the same char per `(col, row)` for every load-bearing position.
4. **Add** the LMT-DD-07 race-coverage test in `layer-manager.test.ts` (§6.4 State D).
5. **Atomic INV-3 commit**: Specs.md changelog entry confirming Phase 14 ratification (the §7.4c subsection already exists from 2026-05-14) + ADR-0001 Amendment 1 status flip (if needed) + README.md + showcase + this UI-SPEC + STATE.md + ROADMAP.md in **a single commit** per CLAUDE.md INV-3.

---

## 14. Out of Scope (this UI-SPEC)

- Specs.md re-bump beyond v0.9.12 — already at v0.9.12 since the 2026-05-14 quick task.
- z=2 overlay panel content design (owned by individual panel UI-SPECs from Phase 5).
- Raster pipeline modifications (Phase 4a + 4b owned; z=0.5 must not perturb).
- Voice / Deepgram Keyterm work — Phase 15.
- Hardware validation of flicker behavior on real G2 BLE — carried under ADR-0005 Branch A.
- New ADR (e.g. ADR-0010+) — z=0.5 is an ADR-0001 amendment, not a new ADR (per CONTEXT.md §Decisions).

---

## 15. Pre-Population Provenance

| Source | Decisions used |
|--------|---------------|
| `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-CONTEXT.md` | 3 z=0.5 containers · 1 Hz cadence · glyph-mode 2-strip · 3 INV-1 fixtures · `LayerManager.bundle()` demolish · ADR-0001 amend-in-place · INV-3 atomic commit at phase close |
| `.planning/REQUIREMENTS.md` | INFILL-01..05 mapping |
| `.planning/quick/20260514-raster-dynamic-infill/PLAN.md` | Container budget table (post-change) · 3 INV-1 invariants · CORRECTED-B selection · §7.4c authorship |
| `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md` | INV-2 round verdict NEUTRO · canonical *"no arbitrary pixel drawing"* constraint |
| `Specs.md` §7.2, §7.3, §7.4, §7.4c, §7.5 | Layered model · canvas allocation · raster default view mockup · idle infill subsection · overlay panel reference |
| `docs/architecture/0001-layered-ui-model.md` (post-Amendment 1) | z=0.5 invariants verbatim |
| `packages/g2-app/src/engine/layer-manager.ts` | Differential demolish · `_suspendedZ05` stash · `_assertContainerBudget` · single `_flushPage()` |
| `packages/g2-app/src/status-hud/idle-infill-layer.ts` | Container names · width budgets · format strings · raster/glyph mode branching |
| `packages/shared-render/src/fixtures/glyph-scene.raster-idle*.txt` | State A canonical fixture (3 locales) |
| `packages/shared-render/src/ascii-grid.ts` | INV-1 snapshot matcher API |
| `CLAUDE.md` | INV-1..5 + ADR-0011 + INV-3 atomic commit pattern |

**User input during this session:** 0 — all decisions pre-populated from upstream (CONTEXT.md + carry-forward PLAN + existing code).
