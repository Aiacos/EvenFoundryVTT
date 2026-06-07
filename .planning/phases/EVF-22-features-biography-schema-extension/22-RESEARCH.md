# Phase 22: Features + Biography Schema Extension — Research

**Researched:** 2026-06-08
**Domain:** dnd5e 5.x feat item shape + actor biography fields + canvas tab scroll plumbing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-22.1** — `feats?` and `biography?` are OPTIONAL fields on `CharacterSnapshotSchema` — downstream ~26 CharacterSnapshot literals compile without mass updates; renderers fall back gracefully (empty array / empty-string).
- **D-22.2** — `FeatEntry = { category: string, name: string, isOrigin: boolean, description: string }`, validated by Zod.
- **D-22.3** — `extractFeats()` reads `actor.items` filtered to `type === 'feat'`; determines `category` from `system.type.value` when present (dnd5e 2024 path); determines `isOrigin` via `system.type.subtype === 'origin'` or `system.type.value === 'origin'`; **graceful fallback** for dnd5e 2014 feats (no `system.type.value`): `category = 'general'`, `isOrigin = false`. Never throw on missing structure — mirror null-safety of `extractClass`/`extractWalkSpeed`.
- **D-22.4** — `biography` carries `personality`, `ideal`, `bond`, `flaw`, `backstory` from `system.details.*`; omitted/empty → empty-string fallback.
- **D-22.5** — Bio tab implements **gesture-driven within-tab scroll** so the full backstory is readable (~10 rows × ~50 char). Labeled fields (personality/ideal/bond/flaw) render as static header lines above the scrollable backstory region. Reuse existing gesture/scroll plumbing (panel-gesture-bus, over-scroll conventions from ADR-0012).

### Claude's Discretion

- n/a (all major decisions locked)

### Deferred Ideas (OUT OF SCOPE)

- Combat-related tabs and Phase 23 features.
- Truncate-only Bio rendering (rejected in favour of D-22.5 scroll).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RDATA-03 | `CharacterSnapshotSchema` carries `feats[]` + reader `extractFeats()` — Features tab shows real feats instead of `DEFAULT_FEATS` fixture | §Standard Stack, §Architecture Patterns §Pattern 1–3, §Code Examples §1–3 |
| RDATA-04 | `CharacterSnapshotSchema` carries `biography` + reader `extractBiography()` — Biography tab shows real data + gesture-driven scroll | §Architecture Patterns §Pattern 4–5, §Code Examples §4–5, §Validation Architecture |
</phase_requirements>

---

## Summary

Phase 22 is the data-extension twin of Phase 21-01: it adds optional `feats?` and `biography?` fields to `CharacterSnapshotSchema` in `@evf/shared-protocol`, adds `extractFeats()` and `extractBiography()` readers in `foundry-module`, and wires real data into the canvas `paintFeatsTab` / `paintBioTab` methods (which currently render from `DEFAULT_FEATS` / hardcoded text fixtures).

The dnd5e 5.x feat item shape is well-understood: `actor.items` items with `type === 'feat'` carry `item.system.type.value` (a string key from `CONFIG.DND5E.featureTypes`: `'background'`, `'class'`, `'race'`, `'feat'`, `'monster'`, `'supernaturalGift'`, `'enchantment'`, `'vehicle'`) and `item.system.type.subtype` for sub-categorization (e.g. `'origin'` under the `'feat'` category). For dnd5e 2024 (PHB 2024), origin feats have `system.type.subtype === 'origin'`; for dnd5e 2014 items, `system.type.value` is typically absent/empty — the reader's graceful fallback path treats those as `category: 'general', isOrigin: false`. Biography data lives in `actor.system.details`: `biography.value` (HTML backstory), `trait` (personality traits), `ideal`, `bond`, and `flaw` (all plain strings on `system.details`).

Bio scroll is already structurally supported: `CanvasCharacterSheetPanel` has `_scrollOffset: number` (used for within-tab content scrolling, reset on tab change) but currently passes it only to glyph renderers via `renderTabContent`. The canvas path's `paintBioTab` already accepts a `scrollOffset`-equivalent via `renderBioTab(snapshot, locale, 0)` — the fix is to (a) pass `_scrollOffset` into `paintBioTab`/`renderBioTab`, and (b) intercept `scroll-down`/`scroll-up` when `activeTab === 'bio'` to increment/decrement `_scrollOffset` instead of switching tabs. The `isAtTopBoundary()` boundary gate (`_scrollOffset === 0`) already exists and integrates with ADR-0012 over-scroll.

**Primary recommendation:** Follow the Phase 21-01 atomic pattern exactly — schema + reader + renderer + tests in one commit sequence, optional fields, no downstream literal mass-update.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `FeatEntry` + `BiographySnapshot` Zod schema | `shared-protocol` | — | Single source of truth for all packages |
| `extractFeats()` reader | `foundry-module` | — | Only the Foundry module runs inside Foundry's Lua/JS runtime with `game.actors` access |
| `extractBiography()` reader | `foundry-module` | — | Same — `actor.system.details.*` lives in Foundry |
| `paintFeatsTab` data wiring | `g2-app` | — | Renderer is a pure canvas function; snapshot already arrives via WS |
| `paintBioTab` + scroll state | `g2-app` (panel) | `g2-app` (renderer) | Scroll offset lives in `CanvasCharacterSheetPanel`; `paintBioTab` / `renderBioTab` are the rendering functions it calls |
| `foundry-globals.d.ts` extension | `foundry-module` | — | Ambient type declarations for Foundry/dnd5e runtime shapes |

---

## Standard Stack

### Core (no new packages — all existing)

| Library | Version (verified) | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `zod` | 4.4.3 (workspace pin) | Schema validation for `FeatEntry`, `BiographySnapshot` | All schemas in the project use Zod; `shared-protocol` is the Zod-only package |
| `@evf/shared-protocol` | workspace | Houses `CharacterSnapshotSchema` | Established pattern (Phases 5, 16, 17, 21) |
| `@evf/foundry-module` | workspace | Houses all Foundry-side readers | Established pattern |
| `@evf/g2-app` | workspace | Canvas renderers | Established pattern |
| Vitest 4.1.5 | workspace pin | Test runner | Project standard (INV-4) |

### No New Packages

Phase 22 installs **no new npm packages**. All capabilities are served by existing workspace dependencies. The Package Legitimacy Audit is therefore empty.

---

## Package Legitimacy Audit

**No new packages installed in this phase.** Existing packages (`zod`, Vitest, TypeScript) were verified during Phase 1 and earlier phases.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
actor.items (type='feat')
  └─ extractFeats()  ──────────────────────────► FeatEntry[] (optional)
                                                        │
actor.system.details.{trait,ideal,bond,flaw,biography}  │
  └─ extractBiography() ──────────────────────► BiographySnapshot (optional)
                                                        │
  getCharacterSnapshot()  ◄─── wired into ─────────────┘
          │
          │ character.delta (WS envelope)
          ▼
  CanvasCharacterSheetPanel.onSnapshot()
          │
          ├─ tab === 'feats' ──► paintFeatsTab(ctx, snapshot, bounds, font, locale)
          │                           └─► renderFeatsTab(snapshot, locale, scrollOffset)
          │                                   └─► snapshot.feats ?? [] → categorised lines
          │
          └─ tab === 'bio'   ──► paintBioTab(ctx, snapshot, bounds, font, locale, _scrollOffset)
                                      └─► renderBioTab(snapshot, locale, scrollOffset)
                                              └─► biography fields → flat line list → window slice
```

**Bio scroll data flow:**
```
R1 gesture (scroll-down/up) ──► CanvasCharacterSheetPanel.onEvent()
    activeTab === 'bio' ?
      YES → _scrollOffset ±1 (clamped) → _dirty = true
      NO  → tab cycle (existing behaviour)
isAtTopBoundary() → _scrollOffset === 0 (same gate, existing ADR-0012 contract)
```

### Recommended Project Structure (additive — no new files except test files)

```
packages/shared-protocol/src/payloads/
└── character.ts          ← add FeatEntrySchema, BiographySnapshotSchema, wire into CharacterSnapshotSchema

packages/foundry-module/src/
├── readers/
│   └── character-reader.ts    ← add extractFeats(), extractBiography(), wire into getCharacterSnapshot()
└── types/
    └── foundry-globals.d.ts   ← extend FoundryItem.system with type: {value?,subtype?}, extend Dnd5eDetails with {trait,ideal,bond,flaw,biography}

packages/g2-app/src/panels/
├── character-sheet-tab-renderers.ts   ← renderFeatsTab: use snapshot.feats?? []; renderBioTab: use snapshot.biography fields; paintBioTab: accept scrollOffset param
└── canvas-character-sheet-panel.ts   ← onEvent: when bio tab, increment/decrement _scrollOffset instead of tab-cycling; pass _scrollOffset into paintBioTab
```

### Pattern 1: Optional Schema Fields (CONTEXT D-22.1)

**What:** Use `.optional()` on `CharacterSnapshotSchema` for the new fields so downstream ~26 CharacterSnapshot literals compile without changes.

**When to use:** When a new field is being wired atomically (schema + reader + renderer in one commit sequence) but does not need to break ALL existing test literals.

**Example:**
```typescript
// Source: character.ts (shared-protocol) — pattern verified in codebase
// Phase 21 REQUIRED pattern (for reference):
class: z.string(),           // REQUIRED — all ~26 literals needed updating

// Phase 22 OPTIONAL pattern (D-22.1):
feats: z.array(FeatEntrySchema).optional(),
biography: BiographySnapshotSchema.optional(),
```

**Why optional here:** The ~26 downstream CharacterSnapshot literals in g2-app/bridge/foundry-mcp test suites are already strict — adding REQUIRED fields forces a mass update (as happened in Phase 21-01 Task 3). OPTIONAL fields let the atomic commit set (schema + reader + renderer) land without touching unrelated test files.

### Pattern 2: extractFeats() — dnd5e 5.x feat item shape

**What:** Filter `actor.items.contents` to `item.type === 'feat'`, extract category from `item.system.type.value`, determine `isOrigin` from `item.system.type.subtype === 'origin'`.

**dnd5e 5.x verified fact (CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/config.mjs):**

`CONFIG.DND5E.featureTypes` keys (valid `system.type.value` values):
- `'background'` — background feature
- `'class'` — class feature (many subtypes: channelDivinity, ki, maneuver, etc.)
- `'race'` — racial trait
- `'feat'` — general feat (subtypes: `'general'`, **`'origin'`**, `'fightingStyle'`, `'epicBoon'`)
- `'monster'` — NPC features
- `'supernaturalGift'` — blessings/charms
- `'enchantment'` — enchantment features
- `'vehicle'` — vehicle features

**Origin feat detection (D-22.3):** `item.system.type.value === 'feat' && item.system.type.subtype === 'origin'` identifies PHB 2024 origin feats. The `isOrigin` flag is `true` for these. Background feats (`system.type.value === 'background'`) are NOT `isOrigin` — they are `category: 'background'`.

**PHB 2014 fallback:** Feats from PHB 2014 actors typically have `system.type.value === ''` or `undefined` (the ItemTypeField schema allows blank values). The reader must handle this gracefully: `category = 'general'`, `isOrigin = false`.

**Example:**
```typescript
// Source: pattern derived from github.com/foundryvtt/dnd5e release-5.3.3 + existing extractClass pattern
function extractFeats(actor: ReturnType<typeof game.actors.get>): FeatEntry[] {
  if (actor === undefined) return [];
  const contents = (actor.items?.contents ?? []) as unknown as Array<Record<string, unknown>>;
  const feats: FeatEntry[] = [];
  for (const item of contents) {
    if ((item.type as string | undefined) !== 'feat') continue;
    const sys = (item.system as Record<string, unknown>) ?? {};
    const typeObj = (sys.type as Record<string, unknown> | undefined) ?? {};
    const typeValue = (typeObj.value as string | undefined) ?? '';
    const typeSubtype = (typeObj.subtype as string | undefined) ?? '';
    const description = (item.description as string | undefined) ?? '';  // NOTE: see Pattern 2a
    feats.push({
      category: typeValue.length > 0 ? typeValue : 'general',
      name: (item.name as string | undefined) ?? 'Unknown Feat',
      isOrigin: typeValue === 'feat' && typeSubtype === 'origin',
      description,
    });
  }
  return feats;
}
```

### Pattern 2a: Feat description extraction

**What:** `item.system.description.value` is the description HTML field on dnd5e items (the same field path used in extractSpellbook for `system.description.value`). It must be HTML-stripped before storage (same `stripHtml` helper already in `character-sheet-tab-renderers.ts`).

**However:** The `FeatEntry.description` is a string on the wire schema. HTML stripping should happen in the reader (not the renderer) to keep the wire payload clean. Use the same regex pattern: `html.replace(/<[^>]*>/g, '')`.

**Note on length:** Feat descriptions can be long (hundreds of words). For G2 display, the description is truncated in the renderer (not in the reader — keep full text on the wire for potential future use, renderer truncates to display budget).

### Pattern 3: extractBiography() — dnd5e 5.x biography field shape

**What:** Read `actor.system.details` for biography-related fields.

**dnd5e 5.x verified field paths (CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/*):**

| Field | Path | Type | Notes |
|-------|------|------|-------|
| Personality traits | `system.details.trait` | StringField | Labeled `"DND5E.PersonalityTraits"` — plain string |
| Ideal | `system.details.ideal` | StringField | In `DetailsFields.creature` |
| Bond | `system.details.bond` | StringField | In `DetailsFields.creature` |
| Flaw | `system.details.flaw` | StringField | In `DetailsFields.creature` |
| Backstory | `system.details.biography.value` | HTMLField | HTML — must be stripped |
| Public bio | `system.details.biography.public` | HTMLField | Not needed for Phase 22 |

**Key finding:** `personality` as a field name does NOT exist in dnd5e 5.x. The field is called `trait` (`system.details.trait`). The `BiographySnapshot` type in the schema should map `trait` → exposed as `personality` in the wire payload per D-22.4 naming convention.

**Example:**
```typescript
// Source: pattern derived from github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/character.mjs
function extractBiography(actor: ReturnType<typeof game.actors.get>): BiographySnapshot {
  const EMPTY = { personality: '', ideal: '', bond: '', flaw: '', backstory: '' };
  if (actor === undefined) return EMPTY;
  const details = (actor.system?.details as Record<string, unknown>) ?? {};
  const bioField = (details.biography as Record<string, unknown> | undefined) ?? {};
  const rawBackstory = (bioField.value as string | undefined) ?? '';
  return {
    personality: (details.trait as string | undefined) ?? '',
    ideal: (details.ideal as string | undefined) ?? '',
    bond: (details.bond as string | undefined) ?? '',
    flaw: (details.flaw as string | undefined) ?? '',
    backstory: stripHtml(rawBackstory),   // stripHtml is already in character-sheet-tab-renderers.ts; extract/duplicate in reader
  };
}
```

**Note on `stripHtml`:** The function `stripHtml` currently lives in `character-sheet-tab-renderers.ts`. For the reader in `foundry-module`, either (a) duplicate the trivial `html.replace(/<[^>]*>/g, '')` inline in `extractBiography`, or (b) extract it to a shared helper. Since the foundry-module has no dep on g2-app, option (a) (inline, documented) is the pragmatic choice.

### Pattern 4: Bio scroll within `CanvasCharacterSheetPanel`

**What:** When `activeTab === 'bio'`, `scroll-down` increments `_scrollOffset` and `scroll-up` decrements it (clamped at 0). Tab-cycling is suppressed while on Bio tab and scrollable content remains. `isAtTopBoundary()` returns `_scrollOffset === 0` regardless of tab — this is already the existing behaviour and correctly gates over-scroll.

**Existing infrastructure already in place:**
- `_scrollOffset: number` field on `CanvasCharacterSheetPanel` (line 182)
- `isAtTopBoundary()` returns `_scrollOffset === 0` (line 450)
- `_paintActiveTab` already passes `bounds`, `font`, `locale` to `paintBioTab`
- `paintBioTab` delegates to `renderBioTab(snapshot, locale, 0)` — the `0` is the hardcoded scroll offset to replace with `_scrollOffset`

**Behaviour design (Bio tab scroll):**
- `tap` → advance tab (same as other tabs) — consistent UX
- `scroll-down` when `activeTab === 'bio'` → increment `_scrollOffset` (within-tab scroll)
- `scroll-up` when `activeTab === 'bio' && _scrollOffset > 0` → decrement `_scrollOffset`
- `scroll-up` when `activeTab === 'bio' && _scrollOffset === 0` → over-scroll (no change to panel, ADR-0012 router handles Quick Action)
- `scroll-up` when `activeTab !== 'bio'` → cycle tab backward (existing behaviour)

**Note on Feats tab scroll:** `renderFeatsTab` already accepts `scrollOffset`. `paintFeatsTab` currently hardcodes `0`. Phase 22 should also wire `_scrollOffset` into `paintFeatsTab` to be consistent — the existing `renderFeatsTab` already supports it.

**Example (onEvent patch):**
```typescript
// Source: canvas-character-sheet-panel.ts — modified onEvent
case 'scroll':
  if (gesture.direction === 'up') {
    if (this._scrollOffset > 0) {
      this._scrollOffset--;        // within-tab scroll up
    } else {
      // at top boundary → tab cycle backward (or over-scroll handled by router)
      this._activeTabIndex = (this._activeTabIndex - 1 + TABS.length) % TABS.length;
      this._scrollOffset = 0;
    }
  } else {
    // scroll-down: within-tab scroll OR tab advance
    const tab = TABS[this._activeTabIndex] ?? 'main';
    if (tab === 'bio' || tab === 'feats') {
      this._scrollOffset++;      // within-tab scroll down (renderer clamps)
    } else {
      this._activeTabIndex = (this._activeTabIndex + 1) % TABS.length;
      this._scrollOffset = 0;
    }
  }
  void this._persistLastTab();
  this._dirty = true;
  break;
```

**Note:** This design change means `scroll-up` when AT the top of Bio/Feats content cycles tab backward (same as before for non-scrollable tabs). The over-scroll (ADR-0012) triggers only when the panel reports `isAtTopBoundary()` AND the router receives a `scroll-up` — since `isAtTopBoundary()` checks `_scrollOffset === 0`, the behaviour is correct: if you scroll-up past the top of Bio content, the router opens the Quick Action menu.

### Pattern 5: `paintBioTab` / `paintFeatsTab` signature extension

**What:** Both `paintBioTab` and `paintFeatsTab` currently hardcode `scrollOffset = 0` when calling `renderBioTab` / `renderFeatsTab`. They need to accept an optional `scrollOffset` parameter.

**Current signature (paintBioTab):**
```typescript
export function paintBioTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
): void
```

**New signature (additive — optional param):**
```typescript
export function paintBioTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
  scrollOffset = 0,           // ← new optional param with default 0
): void
```

Same for `paintFeatsTab`. This is backward compatible — all existing callers that pass no `scrollOffset` continue to work with the hardcoded `0` default.

### Anti-Patterns to Avoid

- **Do NOT strip HTML in the Zod schema** — HTML stripping is a rendering concern, not a schema concern. The reader does it before putting data on the wire; the schema stores plain strings.
- **Do NOT make `feats` REQUIRED** — doing so would force ~26 downstream test literal updates (Phase 21-01 Task 3 pain point; CONTEXT D-22.1 explicitly prevents this).
- **Do NOT re-use the glyph-path `DEFAULT_FEATS` fixture** — the canvas renderers should fall back to an empty array (`snapshot.feats ?? []`), not the hardcoded test data.
- **Do NOT add a separate scroll state for Bio/Feats** — `_scrollOffset` on `CanvasCharacterSheetPanel` is the single scroll cursor; it resets on tab change (existing behaviour). No per-tab independent scroll position needed at this phase.
- **Do NOT implement within-tab scroll for the glyph path** — the glyph `CharacterSheetPanel` uses `renderTabContent` / `renderBioTab` with `scrollOffset`; its gesture handler currently resets `scrollOffset = 0` on every tab action. The glyph panel is out of scope for Phase 22.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML stripping from biography.value | Custom parser | `html.replace(/<[^>]*>/g, '')` (existing `stripHtml` in renderers; inline in reader) | The output is plain text for G2 display; full HTML parser is overkill and a new dep |
| Feat categorisation taxonomy | Custom category mapping | Read `item.system.type.value` verbatim from dnd5e (fallback to `'general'`) | dnd5e already owns the taxonomy via `CONFIG.DND5E.featureTypes`; mapping it ourselves would drift |
| Text word-wrap for Bio | Custom algorithm | `wordWrap()` already in `character-sheet-tab-renderers.ts` | Existing, tested, handles Unicode + hard-wrap edge cases |
| Scroll offset clamping | Custom clamping | The renderer's existing `Math.max(0, Math.min(scrollOffset, ...))` pattern | Already in `renderBioTab` / `renderFeatsTab`; renderer handles over-scroll gracefully |

**Key insight:** Phase 22 is pure data plumbing — no new algorithms needed. The hardest parts (HTML stripping, word-wrap, scroll offset, Zod validation, canvas rendering) all have existing implementations to wire up.

---

## Common Pitfalls

### Pitfall 1: `system.type.value` absent on PHB 2014 feats

**What goes wrong:** `extractFeats()` crashes or emits `undefined` category when the feat's `system.type` object is absent (common on PHB 2014 imported content or older compendium items).

**Why it happens:** `ItemTypeField.value` allows blank values (`required: true, blank: true`). PHB 2014 feats were created before the type categorisation system was added and commonly have `system.type.value === ''` or `system.type` undefined entirely.

**How to avoid:** Mirror the `extractWalkSpeed` null-safety pattern — `const typeValue = (typeObj.value as string | undefined) ?? ''` then `category = typeValue.length > 0 ? typeValue : 'general'`.

**Warning signs:** Test with a mock actor whose feat item has no `system.type` property and confirm it produces `{category: 'general', isOrigin: false, ...}`.

### Pitfall 2: `system.details.trait` vs `system.details.personality`

**What goes wrong:** The biography reader uses `system.details.personality` which does NOT exist in dnd5e 5.x — it returns `undefined` silently, the biography field lands empty even for characters with rich personality trait text.

**Why it happens:** The D&D rulebook calls them "Personality Traits" but the dnd5e Foundry field is named `trait` (StringField labeled `"DND5E.PersonalityTraits"`). The schema naming convention uses the FVTT field key, not the rulebook name.

**How to avoid:** Always read `system.details.trait` (NOT `system.details.personality`). The wire schema uses `personality` as the external key (D-22.4 naming) — the mapping is `details.trait → biography.personality`.

### Pitfall 3: Biography backstory is HTML — must strip before storage

**What goes wrong:** `system.details.biography.value` is a `HTMLField` — Foundry stores it as rich HTML (headings, bold, paragraphs). If passed to `renderBioTab` unstripped, `<p>`, `<em>`, and `</strong>` etc. appear verbatim on the G2 display.

**Why it happens:** Foundry's `HTMLField` stores full HTML for the editor pane. The strip only happens in the existing `renderBioTab` glyph renderer — but the canvas path's `paintBioTab` eventually calls `renderBioTab` which DOES strip, so technically it works either way. However, stripping in the **reader** (before storing on the wire) is cleaner and matches the security model (validated upstream by CharacterSnapshotSchema).

**How to avoid:** Strip in `extractBiography()` using `html.replace(/<[^>]*>/g, '')`. Mark in a JSDoc comment: `// T-05-03-02 mirror: biography.value is HTML; stripped before wire payload`.

### Pitfall 4: Optional Zod fields with `z.strictObject`

**What goes wrong:** `CharacterSnapshotSchema` uses `z.strictObject` — adding new optional fields to a `z.strictObject` still requires those fields to be present in the parent object type if callers spread literals. However, optional fields on a `z.strictObject` work correctly for `safeParse` — a payload WITHOUT the field passes, a payload WITH the field passes, but a payload with an UNKNOWN field fails.

**Why it happens:** `z.strictObject` + `.optional()` = the field may be absent from the object entirely (valid) OR present with its declared type (valid). This is the correct behaviour for D-22.1.

**How to avoid:** Use `z.array(FeatEntrySchema).optional()` and `BiographySnapshotSchema.optional()`. Test with both a snapshot that omits the field and one that includes it.

### Pitfall 5: `CanvasCharacterSheetPanel` scroll — `isAtTopBoundary()` interaction with router

**What goes wrong:** If `isAtTopBoundary()` is changed to return `_scrollOffset === 0 && activeTab !== 'bio'`, the over-scroll Quick Action trigger breaks for non-Bio tabs (they're always "at top" since they don't scroll within-tab).

**Why it happens:** Over-thinking the boundary. The correct behaviour is: `isAtTopBoundary()` returns `_scrollOffset === 0` regardless of active tab. When `activeTab === 'bio'` and `_scrollOffset > 0`, the panel decrements it on `scroll-up` (handled in `onEvent`) and does NOT call the router's over-scroll. When `_scrollOffset === 0` AND `scroll-up` fires AND `activeTab === 'bio'`, `isAtTopBoundary()` returns `true` → the router opens Quick Action. This is the same as all other tabs.

**How to avoid:** Do NOT change `isAtTopBoundary()` — leave it as `return this._scrollOffset === 0;`. The per-tab scroll logic lives entirely in `onEvent`.

### Pitfall 6: `foundry-globals.d.ts` is an ambient file — no module imports

**What goes wrong:** Adding `import type { FeatEntry } from '@evf/shared-protocol'` inside `foundry-globals.d.ts` breaks the file — ambient `.d.ts` files with module imports become module declarations and lose their global scope.

**Why it happens:** TypeScript ambient declaration files must be "script-mode" (no top-level imports) to declare globals. Adding an import turns them into "module-mode" and the global declarations stop working.

**How to avoid:** Extend `FoundryItem.system` with inline type declarations (no imports). Duplicate string-literal types as needed — mirrors the `Dnd5eSkillRaw.ability` pattern already in the file (`'str' | 'dex' | ...` repeated, not imported from shared-protocol).

---

## Code Examples

Verified patterns from official sources and codebase:

### 1. FeatEntrySchema and BiographySnapshotSchema (new Zod schemas)

```typescript
// Source: pattern from character.ts + CONTEXT D-22.2/D-22.4
// Place in packages/shared-protocol/src/payloads/character.ts

export const FeatEntrySchema = z.object({
  /** Category from dnd5e featureTypes: 'background'|'class'|'race'|'feat'|'general'|etc. */
  category: z.string(),
  /** Display name of the feat/feature. */
  name: z.string().min(1),
  /** True for PHB 2024 origin feats (system.type.subtype === 'origin'). */
  isOrigin: z.boolean(),
  /** Short description (HTML-stripped, reader-side). */
  description: z.string(),
});
export type FeatEntry = z.infer<typeof FeatEntrySchema>;

export const BiographySnapshotSchema = z.object({
  /** From actor.system.details.trait (maps to PHB "Personality Traits"). */
  personality: z.string(),
  ideal: z.string(),
  bond: z.string(),
  flaw: z.string(),
  /** From actor.system.details.biography.value (HTML-stripped). */
  backstory: z.string(),
});
export type BiographySnapshot = z.infer<typeof BiographySnapshotSchema>;
```

### 2. Adding optional fields to CharacterSnapshotSchema

```typescript
// Source: CharacterSnapshotSchema in character.ts — optional pattern per D-22.1
// Add inside z.strictObject({...}):

/**
 * Character feats/features (Phase 22 Plan 22-01 atomic extension; RDATA-03).
 * OPTIONAL — absent for actors not yet synced; renderers fall back to empty array.
 * FeatEntry[] from actor.items filtered to type==='feat'.
 */
feats: z.array(FeatEntrySchema).optional(),

/**
 * Character biography (Phase 22 Plan 22-01 atomic extension; RDATA-04).
 * OPTIONAL — absent when biography fields are all empty; renderer falls back gracefully.
 */
biography: BiographySnapshotSchema.optional(),
```

### 3. foundry-globals.d.ts extension for FoundryItem

```typescript
// Source: foundry-globals.d.ts extension pattern (Phases 16, 17, 21)
// Extend FoundryItem.system to add type and description:

interface FoundryItem {
  // ... existing fields ...
  system: {
    // ... existing fields ...
    /**
     * Feature type classification (Phase 22 Plan 22-01).
     * Present on feat items; may be absent on pre-categorisation legacy items.
     * value: dnd5e featureType key ('background'|'class'|'race'|'feat'|etc.)
     * subtype: sub-category ('origin'|'general'|'ki'|etc.)
     * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/item/feat.mjs
     */
    type?: {
      value?: string;
      subtype?: string;
    };
    /**
     * Item description (HTML). Present on most items.
     * Phase 22: used by extractFeats to populate FeatEntry.description (stripped).
     */
    description?: {
      value?: string;
    };
  };
}
```

And extend `Dnd5eDetails` for biography fields:

```typescript
// Extend Dnd5eDetails interface
interface Dnd5eDetails {
  level: number;
  /**
   * Personality traits (Phase 22).
   * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/character.mjs
   * Field key is 'trait' (NOT 'personality') — labeled "DND5E.PersonalityTraits".
   */
  trait?: string;
  /** Character ideals. CITED: details.mjs DetailsFields.creature.ideal */
  ideal?: string;
  /** Character bonds. */
  bond?: string;
  /** Character flaws. */
  flaw?: string;
  /** Character biography (HTML). */
  biography?: {
    value?: string;
    public?: string;
  };
}
```

### 4. renderFeatsTab update — replace DEFAULT_FEATS with snapshot data

```typescript
// Source: character-sheet-tab-renderers.ts — renderFeatsTab
// Replace the DEFAULT_FEATS reference with:

const featSource: ReadonlyArray<FeatDef> =
  snapshot.feats !== undefined && snapshot.feats.length > 0
    ? snapshot.feats.map(f => ({
        category: f.category as FeatDef['category'],  // cast to existing FeatDef union
        name: f.name,
        isOrigin: f.isOrigin,
        desc: truncateUnicode(f.description, 40),
      }))
    : [];  // empty feats → "no feats" state (renderer handles empty gracefully)
```

Note: `FeatDef.category` in the existing renderer is typed as `'class' | 'race' | 'background' | 'feat'`. Since dnd5e has additional categories (`monster`, `supernaturalGift`, etc.), the category cast might fail for unknown types. Two options: (a) widen `FeatDef.category` to `string`, or (b) map unknown categories to `'feat'` (general bucket). Option (a) is simpler and consistent with `FeatEntrySchema.category: z.string()`.

### 5. renderBioTab update — replace hardcoded text with snapshot data

```typescript
// Source: character-sheet-tab-renderers.ts — renderBioTab
// Replace the hardcoded representative text with:

const personalityText = snapshot.biography?.personality ?? '';
const idealText       = snapshot.biography?.ideal ?? '';
const bondText        = snapshot.biography?.bond ?? '';
const flawText        = snapshot.biography?.flaw ?? '';
const backstoryText   = snapshot.biography?.backstory ?? '';  // already HTML-stripped by reader

// Sections with empty text are omitted (no header, no blank separator):
const addSection = (header: string, text: string): void => {
  if (text.length === 0) return;  // skip empty fields (D-22.4: omitted → empty-string fallback)
  allLines.push(header);
  const wrapped = wordWrap(text, INNER_WIDTH);  // backstory already stripped; others are plain strings
  allLines.push(...wrapped);
  allLines.push('');
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PHB 2014 feats as plain items (no type categorisation) | PHB 2024 feats with `system.type.value/subtype` | dnd5e 3.x → 4.x transition | Reader must handle BOTH paths gracefully |
| `details.personality` field name | `details.trait` (key); labeled "DND5E.PersonalityTraits" | Pre-5.x | Wrong field name = silent empty biography |
| Canvas tabs use hardcoded `0` for `scrollOffset` | Phase 22: pass `_scrollOffset` to Bio/Feats tabs | Phase 22 | Full scrollable content on G2 |

**Deprecated/outdated in this codebase:**
- `DEFAULT_FEATS` fixture array: replaced by `snapshot.feats ?? []` — kept for reference until Phase 22 lands but then dead code (INV-4: must be removed).
- Hardcoded `personalityText`/`idealText` etc. in `renderBioTab`: replaced by `snapshot.biography` fields.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `item.system.description.value` is the path for feat description text on dnd5e 5.x items (mirrors spell `system.description.value` seen in `extractSpellbook`) | Pattern 2a | Description column renders blank on Feats tab; LOW risk since description is display-only and empty is graceful |
| A2 | For PHB 2024 origin feats, `system.type.subtype === 'origin'` (not `system.type.value === 'origin'`). `system.type.value === 'feat'` AND `system.type.subtype === 'origin'` together identify origin feats | Pattern 2, Code Example 3 | `isOrigin` flag wrong → `[Origine]` annotation shown/hidden incorrectly; LOW risk since annotation is cosmetic |
| A3 | `system.details.biography.value` contains the full backstory HTML (not `system.details.biography.public`) | Pattern 3 | Backstory shows blank; MEDIUM risk — easily caught in reader tests with mock actor |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.
→ Not empty; 3 low/medium risk assumptions documented above.

---

## Open Questions

1. **FeatDef.category union widening in the renderer**
   - What we know: `FeatDef.category` in `renderFeatsTab` is typed as `'class' | 'race' | 'background' | 'feat'`. dnd5e featureTypes includes `'monster'`, `'supernaturalGift'`, `'enchantment'`, `'vehicle'` which are outside this union.
   - What's unclear: Will characters ever have feats with those exotic categories? Unlikely but possible for GMs using custom items.
   - Recommendation: Widen `FeatDef.category` to `string` in the renderer (or use a section called `'other'` for unknown types). This is a renderer-internal change, not a schema change.

2. **Feats tab scroll — should tap advance tab or open Action Options?**
   - What we know: `paintFeatsTab`/`renderFeatsTab` currently don't have an action cursor. The spellbook panel intercepts `tap` for Action Options. The Feats tab has no action.
   - What's unclear: D-22.5 only specifies Bio scroll. Should `tap` on Feats also be scroll (advancing content) or tab-cycle?
   - Recommendation: Keep `tap` → tab-cycle for Feats tab (consistent with current behaviour for all non-spellbook tabs). Only `scroll-down/up` scrolls within-tab.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. Phase 22 is purely code/config changes within the existing monorepo (no new CLI tools, databases, or services).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root, `test.projects: ['packages/*']`) |
| Quick run command | `pnpm test -- --run` |
| Full suite command | `pnpm test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RDATA-03 | `FeatEntrySchema` validates happy path (name, category, isOrigin, description) | unit | `pnpm test -- --run --reporter=verbose -t "CS-FE"` | ❌ Wave 0 — add to `character.test.ts` |
| RDATA-03 | `CharacterSnapshotSchema` parses with `feats: [...]` present (optional field) | unit | same | ❌ Wave 0 |
| RDATA-03 | `CharacterSnapshotSchema` parses WITHOUT `feats` (optional — absent valid) | unit | same | ❌ Wave 0 |
| RDATA-03 | `extractFeats()` maps `system.type.value` → `category` (PHB 2024 path) | unit | `pnpm test -- --run --reporter=verbose -t "CR-FT"` | ❌ Wave 0 — add to `readers.test.ts` |
| RDATA-03 | `extractFeats()` falls back to `category:'general', isOrigin:false` when `system.type` absent (PHB 2014) | unit | same | ❌ Wave 0 |
| RDATA-03 | `extractFeats()` returns `[]` for actor with no feat items | unit | same | ❌ Wave 0 |
| RDATA-03 | `renderFeatsTab` uses `snapshot.feats` data instead of `DEFAULT_FEATS` | unit | `pnpm test -- --run --reporter=verbose -t "CSTR-FEAT"` | ❌ Wave 0 |
| RDATA-03 | `renderFeatsTab` renders empty state when `snapshot.feats === []` | unit | same | ❌ Wave 0 |
| RDATA-04 | `BiographySnapshotSchema` validates personality/ideal/bond/flaw/backstory | unit | `pnpm test -- --run --reporter=verbose -t "CS-BIO"` | ❌ Wave 0 — add to `character.test.ts` |
| RDATA-04 | `CharacterSnapshotSchema` parses WITHOUT `biography` (optional — absent valid) | unit | same | ❌ Wave 0 |
| RDATA-04 | `extractBiography()` reads `details.trait` as `personality` (NOT `details.personality`) | unit | `pnpm test -- --run --reporter=verbose -t "CR-BIO"` | ❌ Wave 0 — add to `readers.test.ts` |
| RDATA-04 | `extractBiography()` strips HTML from `biography.value` | unit | same | ❌ Wave 0 |
| RDATA-04 | `extractBiography()` returns empty strings for all fields when actor has no details | unit | same | ❌ Wave 0 |
| RDATA-04 | `renderBioTab` uses `snapshot.biography` data instead of hardcoded text | unit | `pnpm test -- --run --reporter=verbose -t "CSTR-BIO"` | ❌ Wave 0 |
| RDATA-04 | `renderBioTab` skips empty biography sections (no header line for empty fields) | unit | same | ❌ Wave 0 |
| RDATA-04 | Bio scroll: `_scrollOffset` increments on `scroll-down` when `activeTab === 'bio'` | unit | `pnpm test -- --run --reporter=verbose -t "RCSP-BIO"` | ❌ Wave 0 — add to canvas panel test |
| RDATA-04 | Bio scroll: `isAtTopBoundary()` returns `true` when `_scrollOffset === 0` | unit | same | ❌ — existing test, verify still passes |

### Sampling Rate

- **Per task commit:** `pnpm test -- --run`
- **Per wave merge:** `pnpm test:coverage`
- **Phase gate:** Full suite green + `pnpm typecheck` + `pnpm lint:ci` before `/gsd-verify-work`

### Suggested Test IDs

Following Phase 21 conventions (`CS-CIS`, `CR-CLS`):

| Area | Prefix | Example |
|------|--------|---------|
| FeatEntry schema | `CS-FE-N` | `CS-FE-1`: happy path; `CS-FE-2`: optional absent; `CS-FE-3`: empty feats array |
| Biography schema | `CS-BIO-N` | `CS-BIO-1`: happy path; `CS-BIO-2`: optional absent; `CS-BIO-3`: all empty strings |
| extractFeats reader | `CR-FT-N` | `CR-FT-1`: type.value present (2024); `CR-FT-2`: type absent (2014 fallback); `CR-FT-3`: empty items |
| extractBiography reader | `CR-BIO-N` | `CR-BIO-1`: all fields present; `CR-BIO-2`: HTML stripping; `CR-BIO-3`: empty actor |
| Feats renderer | `CSTR-FEAT-N` | `CSTR-FEAT-1`: real data; `CSTR-FEAT-2`: empty feats; `CSTR-FEAT-3`: scrollOffset |
| Bio renderer | `CSTR-BIO-N` | `CSTR-BIO-1`: real data; `CSTR-BIO-2`: scroll; `CSTR-BIO-3`: empty sections omitted |
| Canvas panel scroll | `RCSP-BIO-N` | `RCSP-BIO-1`: scroll-down increments; `RCSP-BIO-2`: scroll-up decrements; `RCSP-BIO-3`: top boundary gate |

### Wave 0 Gaps

- [ ] `packages/shared-protocol/src/payloads/character.test.ts` — add `CS-FE-*` and `CS-BIO-*` tests (append to existing file)
- [ ] `packages/foundry-module/src/readers/readers.test.ts` — add `CR-FT-*` and `CR-BIO-*` tests (append to existing file)
- [ ] `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` — add `CSTR-FEAT-*` and `CSTR-BIO-*` tests (append to existing file)
- [ ] `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` (if exists) — add `RCSP-BIO-*` tests; if missing, create

*(Framework install: none needed — Vitest already present)*

---

## Security Domain

`security_enforcement` absent from config → treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no | read-only extension; no new write path |
| V5 Input Validation | yes | `FeatEntrySchema` / `BiographySnapshotSchema` via Zod; CharacterSnapshotSchema.safeParse gate in `CanvasCharacterSheetPanel.onSnapshot()` already in place |
| V6 Cryptography | no | no new crypto |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| HTML injection via `biography.value` → G2 display | Tampering | Strip HTML in `extractBiography()` (reader-side) before it enters the wire payload — `html.replace(/<[^>]*>/g, '')` |
| XSS via `feat.description` HTML | Tampering | Same — strip HTML in `extractFeats()` (`item.system.description.value` is an HTMLField) |
| DoS via extremely long backstory (millions of chars) | DoS | `renderBioTab` windowing bounds output to 18 rows × 66 chars per render call — O(n) but bounded; existing T-05-03-03 mitigation documented in codebase |
| Malformed snapshot payload | Tampering | `CharacterSnapshotSchema.safeParse` gate in `CanvasCharacterSheetPanel.onSnapshot()` — existing T-21-01 mitigation already covers new optional fields |

---

## Sources

### Primary (HIGH confidence)

- `github.com/foundryvtt/dnd5e` release-5.3.3 `module/config.mjs` — `CONFIG.DND5E.featureTypes` keys verified (background/class/race/feat/monster/supernaturalGift/enchantment/vehicle); feat subtypes verified (general/origin/fightingStyle/epicBoon)
- `github.com/foundryvtt/dnd5e` release-5.3.3 `module/data/actor/character.mjs` — `details.trait` field confirmed (StringField, label "DND5E.PersonalityTraits")
- `github.com/foundryvtt/dnd5e` release-5.3.3 `module/data/actor/templates/details.mjs` — `details.biography.value` (HTMLField), `details.ideal`, `details.bond`, `details.flaw` (StringField in DetailsFields.creature)
- `github.com/foundryvtt/dnd5e` release-5.3.3 `module/data/item/fields/item-type-field.mjs` — `ItemTypeField` schema: `value`, `subtype` (StringField, blank allowed)
- Codebase — `packages/shared-protocol/src/payloads/character.ts` — existing schema patterns (optional/required, z.strictObject)
- Codebase — `packages/foundry-module/src/readers/character-reader.ts` — `extractClass`/`extractWalkSpeed` null-safety patterns
- Codebase — `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — `_scrollOffset` field, `isAtTopBoundary()`, `onEvent` gesture dispatch
- Codebase — `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — `renderFeatsTab`/`renderBioTab`/`paintBioTab`/`paintFeatsTab` existing signatures

### Secondary (MEDIUM confidence)

- WebFetch of `https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/config.mjs` — featureTypes object listing confirmed
- WebFetch of `https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/data/actor/character.mjs` — details schema confirmed

### Tertiary (LOW confidence)

- A1: `item.system.description.value` path for feat description — inferred from `extractSpellbook` pattern in codebase; not independently verified against dnd5e feat schema
- A2: `system.type.subtype === 'origin'` for PHB 2024 origin feats — inferred from featureTypes config (feat subtypes include 'origin'); not tested against live actor

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing workspace deps
- Architecture: HIGH — field paths verified against dnd5e 5.3.3 source; patterns verified against existing codebase
- Pitfalls: HIGH — most derived from direct codebase analysis + dnd5e source verification
- feat description path: MEDIUM (A1 assumption)
- origin feat detection: MEDIUM (A2 assumption)

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (30 days — stable dnd5e 5.3.x branch; check before use if dnd5e 6.x ships)
