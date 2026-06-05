# Feature Research

**Domain:** Raster UI Substrate — D&D 5e HUD on 576x288 4-bit greyscale AR display (v0.10.0)
**Researched:** 2026-06-05
**Confidence:** HIGH (sourced directly from ADR-0013, existing renderer code, CharacterSnapshotSchema, and hardware constraints)

---

## Scope

This document covers **only the NEW raster-UI feature behaviors** introduced in v0.10.0.
Existing text-container functionality (already shipping in v0.9.13) is baseline context, not scope.
Every feature maps to a REQ-ID placeholder for the roadmap.

---

## Hardware Constraints (Non-Negotiable Context)

Before any feature table: the display is **576x288 pixels, 4-bit greyscale (16 shades), phosphor-green aesthetic**.
At raster density we control typography entirely -- no SDK 27px lock-in.
Practical density target: **~14-18 rows at 12px font** (vs. 10 rows at SDK 27px).
The full canvas composites to **4 tiles of 288x144**, pushed via the 4 image-container SDK slots.
Input is **press / double-press / scroll-up / scroll-down only** -- no long-press, no text, no touch.

---

## Part A -- Main Tab (Canvas Raster)

### Table Stakes

Fields users expect to see on the Main tab of a D&D 5e character sheet.
Missing any of these makes the sheet feel broken.

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Character name (prominent) | Identity anchor; first thing a player checks | LOW | `snapshot.name` -- already in schema | Truncate at ~20 chars; render in a larger font weight or bold glyph if font supports it. REQ-MAIN-01 |
| Class + level line | Core identity context ("Fighter 5") | LOW | `snapshot.level` + `snapshot.world.modernRules` -- already in schema; class string NOT yet in schema | Class label is missing from `CharacterSnapshotSchema`. Must add `class: z.string()` + reader. REQ-MAIN-02 / schema dep: REQ-SCHEMA-01 |
| HP bar (visual, proportional fill) | Instant glanceable health state; bar is more legible than numbers at glance distance | LOW | `snapshot.hp`, `snapshot.maxHp`, `snapshot.tempHp` -- already in schema | Existing 12-glyph bar logic reused as canvas rect. REQ-MAIN-03 |
| AC value | Defensive anchor; asked constantly in combat | LOW | `snapshot.ac` -- already in schema | Simple numeric, large font. REQ-MAIN-04 |
| 6 Ability scores + modifiers | Core identity; players reference constantly | MEDIUM | `snapshot.abilities.{str,dex,con,int,wis,cha}.{value,mod}` -- already in schema (Phase 16) | Grid layout 2-col (3 per row) or 3-col (2 per row). Value + parenthesized modifier. REQ-MAIN-05 |
| 6 Saving throw modifiers + prof glyphs | Referenced on every save call | MEDIUM | `snapshot.abilities.*.{save,proficient}` -- already in schema (Phase 16) | Can share space with ability grid. REQ-MAIN-06 |
| Conditions (active conditions list) | Combat-critical -- "Am I poisoned?"; zero-glance | MEDIUM | `snapshot.conditions` -- already in schema | Compact glyph-per-condition row or small label list below HP. Max ~4 conditions visible. REQ-MAIN-07 |
| Death saving throw progress | High-stakes combat state; wrong data = death | MEDIUM | `snapshot.death.{success,failure}` -- already in schema (Phase 4b) | 3 pip glyphs each, existing logic reused as canvas draw. REQ-MAIN-08 |
| Senses passives (PP / PI / INV) | Referenced ~5 times per session | LOW | `snapshot.skills.{prc,ins,inv}.passive` -- already in schema (Phase 17) | One compact line. REQ-MAIN-09 |
| Initiative bonus | Referenced at start of every combat encounter | LOW | NOT yet in schema -- `actor.system.attributes.init.total` | Must add to `CharacterSnapshotSchema`. REQ-MAIN-10 / schema dep: REQ-SCHEMA-02 |
| Speed (walk) | Referenced every combat turn | LOW | NOT yet in schema -- `actor.system.attributes.movement.walk` | Must add to `CharacterSnapshotSchema`. REQ-MAIN-11 / schema dep: REQ-SCHEMA-03 |
| Proficiency bonus | Used constantly (saves, skills, attacks) | LOW | Derivable from `snapshot.level` (already in schema) at render time | `Math.ceil(level/4) + 1` -- existing formula already in renderMainTab. REQ-MAIN-12 |
| Exhaustion level | Combat-mechanical; affects all checks | LOW | `snapshot.exhaustion` -- already in schema | Show only when > 0 to save prime real estate. REQ-MAIN-13 |

### Differentiators

Features that elevate the raster sheet above a plain text transcription.

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Portrait inset (greyscale dithered) | Instant "which character is this" visual anchor; distinctive phosphor-green dithered art is the aesthetic centerpiece of the milestone | HIGH | `snapshot.portrait.url` optional -- already in schema (STRETCH-06, Phase 13). Requires async fetch + dither via existing `image-q` pipeline. Sized ~80-100px wide, placed top-right of Main tab. REQ-MAIN-14 |
| Graphical HP bar with temp-HP overflow segment | Temp HP as a visually distinct second bar segment (lighter shade) | LOW | `snapshot.tempHp` -- already in schema | Raster gives full control. Current text renderer already tracks tempHp. REQ-MAIN-15 |
| Ability grid with visual section separator (chrome) | Distinct section chrome (thin rule, header label) baked as static layer makes layout self-documenting at glance | LOW | Static chrome -- no data dep | Differentiates from flat text list. REQ-MAIN-16 |
| Concentration indicator on Main tab | Saves opening Combat Tracker just to check concentration | LOW | Derivable: `snapshot.spells.spells` filter `concentration && prepared` | Single glyph near HP line. REQ-MAIN-17 |
| PHB edition badge (2014 / 2024) | Players switching campaigns; immediate orientation | LOW | `snapshot.world.modernRules` -- already in schema | Tiny badge in corner. REQ-MAIN-18 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead / REQ-ID |
|--------------|---------------|--------------|------------------------------|
| Hit Dice recovery UI on Main tab | Players see it on desktop sheet | Recovery is a WRITE action; no write path for HP-regen exists yet; cramming both display and input onto the smallest tab creates false expectations | Show Hit Dice value as read-only stat (class die x level). Add write path in a later milestone. REQ-MAIN-A01 |
| XP bar | Foundry sheet has it | XP is checked maybe once per session; wastes prime real estate from HP/AC/abilities which are checked every 30 seconds in combat | Omit; at most tiny text line if space remains after all table-stakes fit. REQ-MAIN-A02 |
| Race / background text block | Foundry sheet shows it | Purely narrative; zero combat relevance; competes with mechanical data for the same 576px-wide canvas | Surface race name in a very small font near name/level line if pixel budget allows; no background text. REQ-MAIN-A03 |
| Spell attack bonus on Main tab | Casters reference it | Derived from `abilities.<k>.mod + prof`; already visible in Spells tab context; putting it on Main tab duplicates data and clutters the primary combat view for non-casters | Surface only in Spells tab header. REQ-MAIN-A04 |
| Full conditions text descriptions | Player wants to know exactly what poisoned does | Descriptions are multi-line prose; zero value at glance speed | Max 3-5 char abbreviation per condition, existing logic reused. REQ-MAIN-A05 |

---

## Part B -- Skills Tab (Canvas Raster)

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| All 18 skills with total modifier | Core identity; "What's my Stealth?" | LOW | `snapshot.skills.*.total` -- already in schema (Phase 17) | Existing renderer logic is the content model; output target changes to canvas. REQ-SKILL-01 |
| Proficiency glyph per skill (circle / filled circle / star) | Proficiency context at a glance | LOW | `snapshot.skills.*.proficient` -- already in schema | Existing 3-glyph logic preserved verbatim. REQ-SKILL-02 |
| Ability label per skill group (STR / DEX / ...) | Grouping by ability is how players scan the sheet | LOW | `snapshot.skills.*.ability` -- already in schema | Existing group-header logic preserved. REQ-SKILL-03 |
| Scrollable list (scroll-up / scroll-down) | 18 skills do not fit in one canvas view | LOW | gesture bus already wired | Existing scroll-offset windowing logic preserved. REQ-SKILL-04 |
| Scroll-position hint row | User needs to know there are more items | LOW | Static text row | Existing hint row logic preserved. REQ-SKILL-05 |
| Passive scores (PP / PI / INV) on tab | Frequently referenced; keeping them here avoids switching to Main | LOW | `snapshot.skills.{prc,ins,inv}.passive` -- already in schema | Existing senses-line logic, now on canvas. REQ-SKILL-06 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Mini proficiency legend as tab header chrome | Reduces cognitive load for new players; self-documenting | LOW | Static chrome -- no data dep | Small font at top of tab. REQ-SKILL-07 |
| Ability-group section dividers (thin rule) | Visual grouping by STR/DEX/etc. faster to scan than text group labels | LOW | Static chrome per group | Renders once as static chrome layer. REQ-SKILL-08 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Skill check dice-roll button | "Would be convenient" | Write path for skill checks (`evf.rollSkill`) is a known deferred stub (PROJECT.md); cramming UI affordance before backend exists sets false expectations | Read-only tab this milestone; skill roll is a future REQ. REQ-SKILL-A01 |
| Expertise breakdown (base + expertise split) | Bards / Rogues want to see the split | Two numbers per row vs. one; 18 x 2 = 36 data points in a 576px canvas | The star glyph already signals expertise; total modifier is the operative number at the table. REQ-SKILL-A02 |

---

## Part C -- Inventory Tab (Canvas Raster)

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Item list with type glyph (weapon / armor / consumable) | Instant item-type recognition | LOW | `snapshot.inventory` -- already in schema (Phase 5) | Existing glyph map preserved. REQ-INV-01 |
| Item name column (truncated) | Name is the primary identifier | LOW | `snapshot.inventory[].name` -- already in schema | REQ-INV-02 |
| Damage formula column (weapons) | Most commonly referenced attribute | LOW | `snapshot.inventory[].damage` -- already in schema | REQ-INV-03 |
| Quantity column | Consumables / ammo tracking | LOW | `snapshot.inventory[].quantity` -- already in schema | REQ-INV-04 |
| Scrollable list | More items than one screen | LOW | gesture bus wired | Existing scroll logic. REQ-INV-05 |
| PHB 2024 `[M]` mastery flag on weapons | Edition-correct rendering | LOW | `snapshot.world.modernRules` -- already in schema | Existing `[M]` logic preserved. REQ-INV-06 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Section dividers by item type (Weapons / Armor / Consumables) | Faster scan at table -- player knows where to look | LOW | Static chrome per type group | Renders as a thin rule + section label. REQ-INV-07 |
| Weight total footer line | Quick encumbrance check | LOW | `snapshot.inventory[].weight` -- already in schema (optional) | Sum only items with `weight` defined. REQ-INV-08 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Currency summary | Visible on Foundry sheet | Currency tracking at the table is DM/player negotiation, not a glance-speed concern; clutters the limited line budget | Skip. Currency items already have a type slot in the schema but no detail needed on the G2. REQ-INV-A01 |
| Item description panel inline | Players want to know what a potion does | Descriptions are paragraphs; G2 is a glance device not a reference manual | The Action Options modal (already built) can surface a truncated description on interaction. REQ-INV-A02 |

---

## Part D -- Spells Tab (Canvas Raster)

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Spell slot bars per level | Most-referenced caster resource in combat | LOW | `snapshot.spells.slots` -- already in schema (Phase 5) | Existing filled/empty bar logic preserved. REQ-SPELL-01 |
| Prepared spell list per level section | What can I cast right now? | LOW | `snapshot.spells.spells[].{name,level,prepared}` -- already in schema | Existing group-by-level logic preserved. REQ-SPELL-02 |
| Activation abbreviation column (action / bonus / reaction / ritual) | Cast time is combat-critical | LOW | `snapshot.spells.spells[].activation` -- already in schema | Existing abbreviation map preserved. REQ-SPELL-03 |
| Range column | Tactical positioning | LOW | `snapshot.spells.spells[].range` -- already in schema | REQ-SPELL-04 |
| Concentration glyph | Knowing you are concentrating before casting another spell | LOW | `snapshot.spells.spells[].concentration` -- already in schema | REQ-SPELL-05 |
| PHB 2024 always-prepared glyph | Edition-correct rendering | LOW | `snapshot.spells.spells[].alwaysPrepared` + `snapshot.world.modernRules` -- already in schema | REQ-SPELL-06 |
| Scrollable list | Many spells per caster | LOW | gesture bus wired | Existing scroll logic. REQ-SPELL-07 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Spell save DC displayed in tab header per ability | Casters reference DC constantly | LOW | `snapshot.abilities.{wis,int,cha,etc.}.dc` -- already in schema (Phase 16, deferred binding per PROJECT.md) | One line: "DC WIS 16". Schema primed; just bind the value. REQ-SPELL-08 |
| Slot exhaustion visual state (dimmed section when 0 remaining) | Immediate awareness that a level is spent | LOW | `snapshot.spells.slots[].value` -- already in schema | Raster gives pixel control: render section header at lower brightness when value == 0. REQ-SPELL-09 |
| Cantrip section always at top | Cantrips are always available; most-used spells for many classes | LOW | Level-0 filter on `spells[].level` | Existing level-sort logic already handles this. REQ-SPELL-10 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Spell description inline | "Would save flipping pages" | Multi-paragraph text on a 576px canvas is unreadable at AR glance distance | Action Options modal can surface a truncated effect line on interaction. REQ-SPELL-A01 |
| Unprepared spell list | "I want to see everything I know" | Doubles the list length; the operative question at the table is "what can I cast NOW?" | Filtered to prepared-only; Foundry sheet is the reference for full list. REQ-SPELL-A02 |

---

## Part E -- Features Tab (Canvas Raster)

**Critical dependency:** Today `renderFeatsTab` uses `DEFAULT_FEATS` hardcoded fixtures.
This milestone adds `feats[]` to `CharacterSnapshotSchema` and the foundry-module reader.
REQ-SCHEMA-04 must land before the Features tab can show real data.

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Class features list with name | "What does Second Wind do again?" -- players reference class features several times per session | MEDIUM | NOT yet in schema -- must extend with `feats: z.array(FeatSchema)` | REQ-FEAT-01 / schema dep: REQ-SCHEMA-04 |
| Category grouping (Class / Race / Background / General Feat) | Standard Foundry sheet organization | LOW | `feats[].category` field on each feat | Existing `DEFAULT_FEATS.category` model confirmed -- needs real data. REQ-FEAT-02 |
| Feat name (truncated) | Identity | LOW | `feats[].name` | REQ-FEAT-03 |
| Short description (1 line) | "What does it do at the table?" | MEDIUM | NOT yet in schema -- `feats[].shortDesc` strip/truncate from `actor.items.system.description.value` | Existing `DEFAULT_FEATS[].desc` field is the model; reader extracts from Foundry item description (strip HTML, take first sentence). REQ-FEAT-04 |
| PHB 2024 `[Origine]` annotation for origin feats | Edition-correct | LOW | `feats[].isOrigin` + `snapshot.world.modernRules` -- matches existing `DEFAULT_FEATS[].isOrigin` model | REQ-FEAT-05 |
| Scrollable list | Many feats per high-level character | LOW | gesture bus wired | Existing scroll logic preserved. REQ-FEAT-06 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Passive vs. active feat indicator | Passive = always on; Active = must spend an action. Useful orientation during turn planning | MEDIUM | Requires `feats[].activation` field (new schema field) -- whether the feat has an activation type | REQ-FEAT-07 |
| Section divider chrome per category | Same scan-speed benefit as Inventory type sections | LOW | Static chrome | REQ-FEAT-08 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Full feat description text | "I don't remember War Caster" | Multi-paragraph reference text; this is a glance surface, not a rulebook | Short description (first sentence) is the right answer; Foundry desktop for full text. REQ-FEAT-A01 |
| Feat prerequisite details | Completeness | Character-creation-time info; zero table relevance during combat | Omit entirely. REQ-FEAT-A02 |

---

## Part F -- Biography Tab (Canvas Raster)

**Critical dependency:** Today `renderBioTab` uses hardcoded placeholder text.
This milestone adds `biography` to `CharacterSnapshotSchema` and the foundry-module reader.
REQ-SCHEMA-05 must land before the Biography tab shows real data.

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Personality trait | Roleplay orientation -- players reference it for RP decisions | LOW | NOT yet in schema -- must extend with `biography: {personality, ideal, bond, flaw, backstory}` | REQ-BIO-01 / schema dep: REQ-SCHEMA-05 |
| Ideal | Moral/motivational compass for RP moments | LOW | Same schema dep | REQ-BIO-02 |
| Bond | "Who do I care about?" -- plot-relevant | LOW | Same schema dep | REQ-BIO-03 |
| Flaw | Roleplay tension | LOW | Same schema dep | REQ-BIO-04 |
| Scrollable backstory text (word-wrapped) | Background context for roleplay | MEDIUM | Same schema dep + HTML strip already implemented in `stripHtml` + `wordWrap` | Existing helper functions preserved. REQ-BIO-05 |
| Section headers (Personality / Ideal / Bond / Flaw / Backstory) | Navigation orientation within the scrollable tab | LOW | Existing i18n keys `sheet.bio.*` -- already in i18n-budgets | REQ-BIO-06 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Backstory summary (first 3-4 lines) with scroll-to-more | Most use is "remind me who I am" at the table, not reading the full backstory | LOW | Word-wrap at 3-4 lines then show scroll hint | REQ-BIO-07 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Full backstory prose (multiple screens) | Completeness | Biography is 1-2 paragraphs minimum; scrolling through prose text on a combat-session display defeats the glanceable Core Value | First 3-4 lines visible immediately; scroll to more if desired. REQ-BIO-A01 |
| Character appearance (height/weight/eye color) | Foundry sheet has it | Appearance stats are session-zero information with zero table relevance during play | Omit. No schema slot exists and no use case exists at play time. REQ-BIO-A02 |

---

## Part G -- Combat Tracker (Canvas Raster Overlay, z=2)

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Initiative order (5-row sliding window) | Core combat orientation | LOW | `snapshot.combatants[].{initiative,name,isCurrentTurn}` -- already in `CombatSnapshot` | Existing `computeWindow` logic preserved verbatim. REQ-COMB-01 |
| Current-turn highlight (arrow marker) | Instant "who's turn is it?" | LOW | `combatants[].isCurrentTurn` -- already in schema | Existing arrow marker logic preserved. REQ-COMB-02 |
| HP bar per combatant | Tactical health state | LOW | `combatants[].{hp,maxHp}` -- already in schema | Existing `_hpBar` logic preserved. REQ-COMB-03 |
| HP numeric (current/max) | Exact value when bar is ambiguous | LOW | Same | Existing `_formatHpField` logic. REQ-COMB-04 |
| AC per combatant | Tactical attack-roll context | MEDIUM | KNOWN GAP: `CombatantSchema` has `acValue = ' --'` placeholder (combat-tracker-panel.ts line 292) -- AC not yet in snapshot | Must add `ac` to `CombatantSchema` and foundry-module reader. REQ-COMB-05 / schema dep: REQ-SCHEMA-06 |
| "YOU" marker on player's own combatant | Self-identification in multi-combatant list | LOW | `ownActorId` + `combatants[].actorId` -- already wired | Existing logic preserved. REQ-COMB-06 |
| Concentration sub-line per concentrating combatant | "Is my Bless still up?" | LOW | `combatants[].concentration.{spellName,duration}` -- already in schema | Existing sub-line logic preserved. REQ-COMB-07 |
| Quick-action bar footer (A / S / I / M) | Combat action dispatch anchored to tracker | LOW | gesture bus already wired (Phase 8) | Existing `renderQuickActionBar` logic preserved. REQ-COMB-08 |
| Multi-attack chip `[Atk N/M]` | Mid-turn feedback | LOW | `MultiAttackState` -- already wired (Phase 7) | Existing chip logic preserved. REQ-COMB-09 |
| Turn-advance auto-resets scroll | Prevents window drifting off the active combatant | LOW | `onSnapshot` turn-change detection -- already wired | Existing behavior preserved. REQ-COMB-10 |
| Party-vs-enemy faction glyph | Tactical orientation | LOW | `isParty` flag -- already wired | Existing glyph logic preserved. REQ-COMB-11 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Current-turn row rendered at full contrast (brighter area or heavier glyph) | Instant focus vs. reading an arrow marker | LOW | Raster gives pixel-level brightness control; inactive rows at lower shade | REQ-COMB-12 |
| HP bar fill uses greyscale intensity gradient (not just filled/empty blocks) | Richer visual: full = bright, near-dead = dim | LOW | Only possible in raster -- 4-bit palette gives 16 shades | REQ-COMB-13 |
| Scrollable effects section (active status effects per combatant) | Players forget what effects are active | MEDIUM | Effects data not currently in `CombatantSchema` -- needs extension or derivation from `conditions` | Current effects section is a placeholder. REQ-COMB-14 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Full combat log on tracker overlay | "I want to see damage history" | Log is a stream of events; displaying it alongside initiative order creates visual competition for the same 576px canvas | Toast messages (already built) cover the immediate feedback need. REQ-COMB-A01 |
| Real token-position distance/direction column | Tactical positioning | Token position requires Scene API read per turn, adds latency, is always approximate | Current `--` placeholder is correct; real distance is a STRETCH feature for a future milestone. REQ-COMB-A02 |
| Spell detail pop-up from tracker | "I want to see what Bless does" | Combat tracker is a tactical summary surface; sub-panels create a nested navigation model exceeding the 4-gesture vocabulary | The Action Options modal handles spell detail when accessible from Spellbook. REQ-COMB-A03 |

---

## Part H -- Gesture Navigation (Raster Context)

The raster substrate does not change the gesture vocabulary -- it changes what those gestures render.
The new canvas model introduces NEW navigation requirements vs. text-container behavior.

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Press = forward-tab cycle (Main -> Skills -> Inventory -> Spells -> Features -> Bio -> wraps) | Standard single-action cycle; the R1 ring is operated without looking | LOW | Existing gesture bus + tab state machine | Same as text-container; output target changes to canvas. REQ-NAV-01 |
| Scroll-up / scroll-down within tabs that have scrollable lists | Long lists require scroll | LOW | Existing scroll-offset per tab | Same as text-container. REQ-NAV-02 |
| Double-press = close overlay (return to map+HUD) | Escape hatch from overlay to primary view | LOW | Existing double-tap -> close route via ADR-0012 | Same as text-container. REQ-NAV-03 |
| Over-scroll at top boundary = open Quick Action menu | Navigation between overlays | LOW | Existing over-scroll dispatcher (ADR-0012) | Same as text-container. REQ-NAV-04 |
| Press on Main tab (no scrollable content) = forward-tab immediately | Main tab has no scrollable list; press should cycle tabs, not fake-scroll | LOW | Conditional: if current tab has no scrollable content, press = tab advance | REQ-NAV-05 |
| Tab strip visible on all tabs showing active tab | User must know where they are without looking at their hand | LOW | Static chrome per tab -- rendered once as part of canvas | Raster: tab labels rendered as small-font row at top of overlay canvas. REQ-NAV-06 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Active tab rendered as filled/inverted block (not just underline) | Higher contrast at AR glance distance | LOW | Raster control: invert the active tab label bg/fg | REQ-NAV-07 |
| Scroll-position indicator (thin 1-pixel rightmost column progress bar) | Tells user "you are 40% down the skills list" without text | LOW | `scrollOffset / maxOffset` ratio -> height of filled bar | REQ-NAV-08 |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Tap-and-hold to access a secondary action layer | "Would allow more gestures" | Long-press is retired by ADR-0012 / GEST-01. No duration-based input exists. | Use double-press + press sequence within Quick Action menu instead. REQ-NAV-A01 |
| Swipe-to-close (horizontal swipe) | Natural for mobile users | G2 R1 has no horizontal axis -- only scroll-up/scroll-down. There is no horizontal gesture. | Double-press is the close gesture. REQ-NAV-A02 |

---

## Part I -- Static vs. Dynamic Split (Raster Canvas)

This is an implementation-shaping feature boundary -- it determines what gets pre-baked once vs. what redraws on data change.
The milestone brief specifies "render mix statico + dinamico" as a core target.

### Table Stakes

| Feature | Why Expected | Complexity | Depends On | Notes / REQ-ID |
|---------|--------------|------------|------------|----------------|
| Static chrome layer (borders, labels, tab strip, section dividers) pre-baked once per panel open | Without this, every HP tick forces a full re-draw of all chrome, wasting CPU and BLE bandwidth | MEDIUM | `LayerManager` static-chrome caching mechanism (new) | Chrome pixels never change within a panel session. Draw once -> cache canvas. Delta hash skips unchanged tiles. REQ-PERF-01 |
| Dynamic data layer redraws only affected regions on `character.delta` | HP bar update should NOT redraw the abilities grid | MEDIUM | `hud-live-render.ts` loop (already exists) + region-dirty tracking | Existing delta-change loop reused; raster version adds per-region dirty flag. REQ-PERF-02 |
| Portrait fetch + dither executed once at panel open, cached as pre-dithered tile | Portrait never changes mid-session; re-dithering on every frame is wasted compute | MEDIUM | Portrait URL from snapshot + existing `image-q` pipeline | Fetch -> dither -> store as 4-bit bitmap in memory; re-composite on frame. REQ-PERF-03 |
| Tab switch replaces content region only (chrome shared or reused) | Tab outer frame does not change between tabs; only content area differs | MEDIUM | Compositor separation of chrome layer vs. content layer | REQ-PERF-04 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / REQ-ID |
|---------|-------------------|------------|----------------|
| Sub-tile xxhash delta so only tiles with changed pixels get re-encoded | Already designed in ADR-0013 and PROJECT.md TODO-hud-raster #2 -- the main bandwidth optimization | HIGH | `xxhash-wasm` already in pipeline; tile-hash compare before encode | Path to ~5 fps budget being achievable in practice. REQ-PERF-05 (PROJECT.md marks this out-of-scope for v0.10.0 itself; flag for v0.10.1) |

### Anti-Features

| Anti-Feature | Why Requested | Why It Hurts | What to Do Instead |
|--------------|---------------|--------------|---------------------|
| Full 576x288 canvas re-encode on every data change | Simplicity | At 5 fps, a full frame is ~82 KB raw -> 4 PNG encode operations per frame -> CPU-bound in the worker; BLE bandwidth may not sustain it | Static/dynamic split + tile delta is the designed mitigation. REQ-PERF-A01 |
| Double-buffered canvas (two canvases, swap on frame) | Prevents tearing | G2 display does not tear -- it is a frame-push display where the SDK atomically replaces image tiles; double-buffering adds memory overhead with zero visual benefit | Single OffscreenCanvas composite, single push per delta cycle. REQ-PERF-A02 |

---

## Part J -- Schema Extensions Required (v0.10.0 Milestone)

These are not UI features per se but are blocking dependencies for the features above.
Every extension must ship in the same atomic commit as the renderer that consumes it (Phase 4b / 16 atomic-commit pattern).

| Extension | Blocks | Complexity | Notes / REQ-ID |
|-----------|--------|------------|----------------|
| `class: z.string()` in `CharacterSnapshotSchema` + foundry-module reader | REQ-MAIN-02 (class/level line) | LOW | Reader: `actor.items.find(type=class)?.name`. REQ-SCHEMA-01 |
| `initiative: z.number().int()` in `CharacterSnapshotSchema` + reader | REQ-MAIN-10 (initiative display) | LOW | Reader: `actor.system.attributes.init.total`. REQ-SCHEMA-02 |
| `speed: z.number().int()` in `CharacterSnapshotSchema` + reader | REQ-MAIN-11 (speed display) | LOW | Reader: `actor.system.attributes.movement.walk`. REQ-SCHEMA-03 |
| `feats: z.array(FeatSchema)` in `CharacterSnapshotSchema` + foundry-module reader | REQ-FEAT-01..06 (Features tab real data) | MEDIUM | `FeatSchema` needs `{id, name, category, isOrigin, shortDesc, activation?}`. Reader: `actor.items.filter(type in feat/class/race)` + HTML-strip first sentence. REQ-SCHEMA-04 |
| `biography: BiographySchema` in `CharacterSnapshotSchema` + foundry-module reader | REQ-BIO-01..05 (Biography tab real data) | LOW | `BiographySchema = {personality, ideal, bond, flaw, backstory}` as strings. Reader: `actor.system.details.biography.{value,personality,ideals,bonds,flaws}` + HTML-strip. REQ-SCHEMA-05 |
| `ac: z.number().int()` in `CombatantSchema` + foundry-module combat reader | REQ-COMB-05 (AC per combatant) | MEDIUM | Reader: `actor.system.attributes.ac.value` per combatant. REQ-SCHEMA-06 |

---

## Feature Dependencies

```
REQ-MAIN-14 (portrait inset)
    requires --> snapshot.portrait.url (optional in schema since Phase 13, STRETCH-06)
                 requires --> image-q dither pipeline (already in raster worker)

REQ-FEAT-01..08 (Features tab real data)
    requires --> REQ-SCHEMA-04 (feats[] schema + reader)

REQ-BIO-01..07 (Biography tab real data)
    requires --> REQ-SCHEMA-05 (biography schema + reader)

REQ-MAIN-02 (class/level line)
    requires --> REQ-SCHEMA-01 (class field in snapshot)

REQ-MAIN-10 (initiative display)
    requires --> REQ-SCHEMA-02 (initiative field in snapshot)

REQ-MAIN-11 (speed display)
    requires --> REQ-SCHEMA-03 (speed field in snapshot)

REQ-COMB-05 (AC per combatant)
    requires --> REQ-SCHEMA-06 (ac in CombatantSchema)

REQ-PERF-01..04 (static/dynamic split)
    requires --> compositor canvas architecture (LayerManager evolution -- ADR-0013 core)

REQ-PERF-05 (sub-tile delta loop)
    requires --> REQ-PERF-01..04
    NOTE --> PROJECT.md marks out-of-scope for v0.10.0 (TODO-hud-raster #2)

REQ-SPELL-08 (spell save DC binding)
    requires --> snapshot.abilities.*.dc (already in schema since Phase 16) -- data-bind only
    NOTE --> PROJECT.md notes this as a "carry" from v0.9.13

All raster renderers
    require --> canvas compositor (LayerManager -> single 576x288 OffscreenCanvas, ADR-0013)
    require --> 4-tile push mechanism (288x144 tiles via updateImageRawData)
```

### Dependency Notes

- Schema extensions before renderers: Every REQ-SCHEMA-* must land (shared-protocol + foundry-module reader) before the corresponding renderer can bind real data. Use the Phase 16 / Phase 17 atomic-commit pattern.
- Features/Bio tab has hardcoded fixtures today: `DEFAULT_FEATS` and hardcoded bio strings in `renderFeatsTab` / `renderBioTab` are explicitly stub code. REQ-SCHEMA-04 and REQ-SCHEMA-05 are the unlock.
- Combat tracker AC is a known placeholder: `acValue = ' --'` at line 292 of `combat-tracker-panel.ts` is a documented stub. REQ-SCHEMA-06 closes it.
- Portrait fetch is async + once: Portrait must be fetched from Foundry origin URL, dithered, and cached at panel-open time, not per-frame. The existing `MapBaseLayer` portrait-override infrastructure is the model.
- Static/dynamic compositor is the architectural foundation: Every feature above depends on `LayerManager` evolving to composite onto a single 576x288 canvas. All other features are content layered on top of that foundation. REQ-PERF-01 is the root dependency.

---

## MVP Definition

### Launch With (v0.10.0 must-haves)

Minimum viable product -- what is needed to close the milestone.

- [ ] REQ-PERF-01..04 -- Static/dynamic compositor architecture (foundation for all raster panels)
- [ ] REQ-MAIN-01..13 -- All Main tab table-stakes fields (name, class/level, HP bar, AC, abilities+mods, saves+glyphs, conditions, death saves, senses passives, initiative, speed, proficiency, exhaustion)
- [ ] REQ-MAIN-14 -- Portrait inset (schema already has `portrait.url`)
- [ ] REQ-SKILL-01..06 -- Skills tab table-stakes (all 18 skills, prof glyphs, ability groups, scroll, hint, passives)
- [ ] REQ-INV-01..06 -- Inventory tab table-stakes (item list, glyphs, name, damage, quantity, scroll, mastery flag)
- [ ] REQ-SPELL-01..08 -- Spells tab table-stakes + DC binding (schema primed, just needs wiring)
- [ ] REQ-FEAT-01..06 -- Features tab with real data (REQ-SCHEMA-04 must ship in same atomic commit)
- [ ] REQ-BIO-01..06 -- Biography tab with real data (REQ-SCHEMA-05 must ship in same atomic commit)
- [ ] REQ-COMB-01..13 -- Combat tracker: all existing table-stakes ported to raster + brightness differentiators
- [ ] REQ-NAV-01..08 -- Gesture navigation (tab cycle, scroll, close, over-scroll, tab strip chrome, progress bar)
- [ ] REQ-SCHEMA-01..06 -- All schema extensions (class, initiative, speed, feats, biography, combatant AC)

### Add After Validation (v0.10.x)

Features to add once the v0.10.0 canvas compositor baseline is stable.

- [ ] REQ-PERF-05 (xxhash sub-tile delta loop) -- PROJECT.md marks as TODO-hud-raster #2; bandwidth-critical but complex; add after baseline ships
- [ ] REQ-COMB-14 (live effects section in combat tracker) -- requires effects data added to `CombatantSchema`
- [ ] REQ-MAIN-15 (temp-HP overflow segment) -- low-hanging fruit polish pass

### Future Consideration (v2+)

- [ ] Skill check dice-roll from Skills tab (write path stub exists; deferred per PROJECT.md)
- [ ] Spell description sub-panel from Spells tab
- [ ] Real distance/direction on combat tracker (requires Scene API read path)
- [ ] Full combat log surface

---

## Feature Prioritization Matrix

| Feature Group | User Value | Implementation Cost | Priority |
|---------------|------------|---------------------|----------|
| Compositor architecture (REQ-PERF-01..04) | HIGH (all raster features depend on it) | HIGH | P1 |
| Main tab table-stakes (REQ-MAIN-01..13) | HIGH | LOW (data already in schema) | P1 |
| Schema extensions (REQ-SCHEMA-01..06) | HIGH (unlocks Features+Bio real data + combatant AC) | LOW-MEDIUM | P1 |
| Combat tracker raster port (REQ-COMB-01..11) | HIGH (most session time is in combat) | LOW (logic already exists) | P1 |
| Skills tab raster port (REQ-SKILL-01..06) | HIGH | LOW | P1 |
| Inventory tab raster port (REQ-INV-01..06) | HIGH | LOW | P1 |
| Spells tab raster port (REQ-SPELL-01..07) | HIGH | LOW | P1 |
| Gesture navigation (REQ-NAV-01..08) | HIGH (usability) | LOW | P1 |
| Features tab real data (REQ-FEAT-01..06) | MEDIUM (checked occasionally) | MEDIUM (schema dep + reader) | P1 |
| Biography tab real data (REQ-BIO-01..06) | LOW (checked rarely at table) | LOW (schema dep + reader) | P2 |
| Portrait inset (REQ-MAIN-14) | MEDIUM (aesthetic centerpiece of milestone) | HIGH (async fetch + dither) | P2 |
| Spells DC binding (REQ-SPELL-08) | MEDIUM (casters only) | LOW (schema already primed) | P2 |
| Combat tracker current-turn brightness / HP gradient (REQ-COMB-12..13) | MEDIUM (aesthetic upgrade) | LOW | P2 |
| Sub-tile delta (REQ-PERF-05) | HIGH (BLE bandwidth in production) | HIGH | P3 (v0.10.1) |
| Combat tracker AC (REQ-SCHEMA-06 + REQ-COMB-05) | MEDIUM | MEDIUM | P2 |

**Priority key:**
- P1: Must have for milestone close
- P2: Should have, add within v0.10.0 if budget allows
- P3: Defer to next milestone

---

## Sources

- `/home/aiacos/workspace/EvenFoundryVTT/.planning/PROJECT.md` -- v0.10.0 milestone scope, carry items, REQ-ID history
- `/home/aiacos/workspace/EvenFoundryVTT/docs/architecture/0013-hud-raster-rendering.md` -- ADR-0013 raster decision, scope, alternatives
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/panels/character-sheet-tab-renderers.ts` -- all 6 tab renderers, existing field bindings, Phase 16/17 binding status, DEFAULT_FEATS stub, hardcoded bio stub
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/panels/combat-tracker-panel.ts` -- combat tracker layout, known AC placeholder at line 292, gesture model
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/panels/inventory-panel.ts` -- inventory column model and type glyphs
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/panels/spellbook-panel.ts` -- spells column model and slot bar logic
- `/home/aiacos/workspace/EvenFoundryVTT/packages/shared-protocol/src/payloads/character.ts` -- full `CharacterSnapshotSchema` field inventory; confirmed which fields are in schema vs. missing

---
*Feature research for: EvenFoundryVTT v0.10.0 Raster UI Substrate*
*Researched: 2026-06-05*
