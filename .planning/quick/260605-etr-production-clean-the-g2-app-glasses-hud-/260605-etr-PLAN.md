---
phase: quick-260605-etr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/engine/hud-chrome.ts
  - packages/g2-app/src/engine/__tests__/hud-chrome.test.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
autonomous: true
requirements:
  - HUD-CHROME-01
  - HUD-CHROME-02
must_haves:
  truths:
    - "After boot, the header container (id4) shows spec-aligned frame-top content, never a stale boot checklist and never the SDK 'Text' default."
    - "After boot, the footer container (id5) shows the spec-aligned gesture-hint + mode + nav-chips line, never the SDK 'Text' default."
    - "The z=0.5 idle-infill strings render exactly as the canonical Specs §7.4 mockup (KEPT, unchanged) — no dev-debug string introduced or removed."
    - "No production-display text container is left showing the SDK 'Text' default."
  artifacts:
    - path: "packages/g2-app/src/engine/hud-chrome.ts"
      provides: "writeHeaderChrome + writeFooterChrome — spec-aligned header(id4) + footer(id5) writers"
      min_lines: 60
    - path: "packages/g2-app/src/engine/__tests__/hud-chrome.test.ts"
      provides: "asserts header + footer are written at boot with the canonical content (regression guard against 'Text')"
  key_links:
    - from: "packages/g2-app/src/internal/boot-engine-core.ts"
      to: "packages/g2-app/src/engine/hud-chrome.ts"
      via: "writeHeaderChrome + writeFooterChrome invoked after the step-12 bundle flush"
      pattern: "write(Header|Footer)Chrome"
    - from: "packages/g2-app/src/engine/hud-chrome.ts"
      to: "engine/container-registry.ts"
      via: "resolveContainerIdField('header') / resolveContainerIdField('footer')"
      pattern: "resolveContainerIdField\\('(header|footer)'\\)"
---

<objective>
Production-clean the g2-app glasses HUD so the final display shows NO SDK "Text"
placeholder and no dev-looking junk. Two base text containers are currently never
given intentional final content:

- `header` (id4, 576×12): the boot-splash repurposes it for the 5-step checklist
  + protocol line, then NOTHING repaints it → the glasses keep showing a stale
  boot line (or "Text" if the splash race lost).
- `footer` (id5, 576×24): NO layer ever writes it → permanent SDK "Text" default.

This plan adds a single `hud-chrome` module with two writers (`writeHeaderChrome`,
`writeFooterChrome`) that paint the canonical Specs §7.4 frame-top + footer content
into id4 + id5, and invokes them once at boot AFTER the layer bundle flush (step 12).

The right-column Status HUD (id6) already renders real data (Artemis · PF · CA) —
LEAVE IT. The z=0.5 idle-infill strings (id8/id9/id10) ARE the spec's designed idle
content (verbatim in the §7.4 mockup + the frozen INV-1 fixture) — KEEP THEM,
do not touch IdleInfillLayer.

Purpose: kill the "scattered characters + literal Text" the user sees on-glass.
Output: clean, finished-looking HUD frame chrome that matches the canonical mockup.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The canonical HUD contract (READ — these are load-bearing)
@Specs.md   # §7.2 layered model · §7.4 RASTER default-view mockup (lines ~1377-1410) · §7.4c z=0.5

# Frozen INV-1 full-frame fixture — THE source of truth for header(row2)/footer(row23)/z05(rows19-21)
@packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt

# Geometry + numeric ids (single source of truth)
@packages/g2-app/src/engine/container-registry.ts

# The ONLY current header writer (stops after the protocol line — header left stale)
@packages/g2-app/src/engine/boot-splash.ts

# Mirror these write patterns (resolveContainerIdField spread + TextContainerUpgrade)
@packages/g2-app/src/status-hud/status-hud-layer.ts
@packages/g2-app/src/status-hud/idle-infill-layer.ts

# Boot orchestration — the step-12 bundle flush is the insertion point
@packages/g2-app/src/internal/boot-engine-core.ts

# i18n width-budget catalog — reuse existing keys where the strings already exist
@packages/g2-app/src/status-hud/i18n-budgets.ts
</context>

<design_decisions>
These decisions were made during planning by reading the canonical sources. The
executor MUST follow them; they are not open for re-litigation.

## D-1 — Header (id4) content = canonical §7.4 frame-top, with `—` fallbacks

The Specs §7.4 mockup row 0 (= INV-1 fixture row 2) is:

    MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%

Structure (3 segments, left / center / right within a 96-col / 576px row):
  - left:   `MAP · <scene> · <mode>`
  - center: `ROUND <n> · TURN <x>/<y>`   (IT fixture shows `TURNO x/y`)
  - right:  `⌁ R1 <nn>%`

At boot, the scene name, round/turn, and R1 battery are NOT yet known (no scene
pushed; no combat; battery requires a device-status read). The project's
established missing-scalar policy is the em-dash `—` (used verbatim in
IdleInfillLayer `_formatStatsStrip` and the Status HUD renderer). So the header
writer renders the SAME canonical structure with `—` in the unknown slots:

  - mode IS known at boot (`effectiveVerdict === 'glyph' ? 'glyph' : 'raster'`,
    same value used to construct IdleInfillLayer at boot-engine-core.ts) → use it.
  - scene → `—`, round/turn → `—`, battery → `—` until those sources land.

Locale: IT is canonical (CONTEXT/§7.16). The center label is `TURNO` in the IT
fixture; pick the label by `effectiveLocale` (IT `TURNO`, else `TURN`). Keep the
left `MAP` and right `⌁ R1` tokens language-neutral exactly as the fixture shows.

This is the "IMPLEMENTS the existing mockup" case for the header STRUCTURE — the
fallback `—` slots are the spec's own missing-data convention, NOT a divergence.

## D-2 — Footer (id5) content = canonical §7.4 footer line, VERBATIM token-for-token

The Specs §7.4 mockup row 22 (= INV-1 fixture row 23) is, IT locale:

    R1: scroll=pan  tap=ping  long=quick   modo: ▶RASTER (toggle GLYPH)   [scheda] [combat]

EN locale (Specs §7.4 master mockup):

    R1: scroll=pan  tap=ping  long=quick   mode: ▶RASTER (toggle GLYPH)   [sheet] [combat]…

CRITICAL — KEEP `long=quick` (do NOT rewrite to `qa=`). Rationale: the canonical
Specs §7.4 mockup AND the frozen INV-1 fixture both still carry `long=quick`.
GEST-01/ADR-0012 (long-press retirement → `qa=`/over-scroll) is design-locked but
explicitly scheduled as **Phase 20**, which will sweep `long=`→`qa=` across the
Specs mockups + ALL INV-1 fixtures + README + showcase atomically. Introducing
`qa=` HERE would (a) diverge from the canonical fixture/mockup → force an INV-3
spec/README/showcase bump in this quick task, and (b) do Phase 20's job piecemeal
with no green intermediate. Rendering `long=quick` is the "implements the existing
mockup, no spec change" case. Phase 20 owns the gesture-vocab sweep.

Footer is a 576×24 container ≈ 2 rows of 96 cols. The canonical content is ONE
logical line (the mockup wraps it visually across the 2-row height). Render it as
the single fixture string for the active locale. Mode segment uses the SAME
`raster`/`glyph` value as the header (D-1) — render `▶RASTER (toggle GLYPH)` when
mode=raster and `▶GLYPH (toggle RASTER)` when mode=glyph, matching the fixture's
`mode: ▶<ACTIVE> (toggle <OTHER>)` form. Locale: IT `modo:` + `[scheda]`,
else `mode:` + `[sheet]`.

## D-3 — z=0.5 idle infill: NO CHANGE

The three z=0.5 strings rendered by IdleInfillLayer —
  `⚔ —`  /  `─── z=0.5 idle infill ──────────────────`  /  `<mode> — · — · BLE — · — fps · [Q] Quick`
— appear VERBATIM in the canonical Specs §7.4 mockup (lines ~1396-1398) and in the
frozen INV-1 fixture (rows 19-21). They are spec-sanctioned designed idle content
(ADR-0001 Amendment 1 / §7.4c / Phase 14 INFILL-01..05). The `⚔ —` and `—`
telemetry slots are the spec's intended missing-data state, NOT dev debug strings.
DO NOT modify idle-infill-layer.ts. Leave it untouched.

## D-4 — INV-3 disposition: NO spec/README/showcase update needed

Both header (D-1) and footer (D-2) IMPLEMENT content the canonical Specs §7.4
mockup + frozen INV-1 fixture ALREADY show. The `—` fallbacks are the spec's own
missing-scalar convention. No rendered content diverges from the existing mockups.
Therefore the INV-3 atomic-doc-coherence gate does NOT trigger for this task.
State this explicitly in the SUMMARY ("INV-3: implements-existing-mockup case;
no Specs/README/showcase change").

## D-5 — INV-1 disposition: the full-frame composite fixture is NOT regenerated

The frozen INV-1 fixtures (`glyph-scene.raster-idle*.txt`, `glyph-idle-z05*.txt`,
`raster-overlay-open*.txt`) are composed by the snapshot test harness from layer
output, NOT from these two new boot-time writers. This plan does NOT change any
layer's rendered output, so the composite fixtures stay byte-identical. The new
hud-chrome writers are asserted by a NEW dedicated unit test (content-equality
against the canonical strings), not by the composite fixtures. Run the FULL g2-app
vitest suite to PROVE no existing fixture drifts (T-etr-01 below).
</design_decisions>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| boot-time mode value → header/footer strings | mode is an internal boot var (`effectiveVerdict`), already trusted; no external input crosses into chrome content |
| chrome strings → EvenHub host (textContainerUpgrade) | host renders text only; no pixel/script surface; strings are static + `—` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-etr-01 | Tampering | INV-1 frozen fixtures (accidental drift) | mitigate | Run FULL `vitest run` for g2-app; D-5 forbids regenerating composite fixtures; new content asserted by dedicated unit test only |
| T-etr-02 | Information disclosure | header/footer rendered content | accept | No PII: scene/round/battery are `—` at boot; mode is non-secret; footer is static gesture hints (same trust class as IdleInfillLayer/StatusHud already-rendered chrome) |
| T-etr-03 | Denial of service | textContainerUpgrade rejection at boot | mitigate | Writers are awaited fire-safe at boot AFTER the bundle flush; a reject must NOT abort an already-booted engine — wrap each writer call so a rejection logs + continues (mirror boot-engine-core step-12b audio-capture try/catch pattern) |
| T-etr-SC | Tampering | npm/pip/cargo installs | n/a | No new dependencies; reuses `@evenrealities/even_hub_sdk` (already a dep) + existing engine modules |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create hud-chrome module (header + footer writers) with regression tests</name>
  <files>packages/g2-app/src/engine/hud-chrome.ts, packages/g2-app/src/engine/__tests__/hud-chrome.test.ts</files>
  <behavior>
    - HC-1: writeHeaderChrome(bridge, { mode, locale }) calls bridge.textContainerUpgrade
      exactly once with containerName 'header' AND containerID 4 (via
      resolveContainerIdField('header')), content NOT equal to the SDK 'Text'
      default and NOT a boot-checklist marker (no '[ ✓ ]'/'[ ⟳ ]'/'protocol ').
    - HC-2: header content contains the canonical §7.4 frame-top tokens:
      starts with 'MAP · ', contains the mode token ('raster' or 'glyph'),
      contains '⌁ R1', and uses '—' for the unknown scene/round-or-turn/battery
      slots (assert content includes '—'). Center label is 'TURNO' when locale='it',
      else 'TURN'.
    - HC-3: writeFooterChrome(bridge, { mode, locale }) calls bridge.textContainerUpgrade
      exactly once with containerName 'footer' AND containerID 5
      (resolveContainerIdField('footer')), content NOT 'Text'.
    - HC-4: footer content (locale='it') equals the canonical IT footer line:
      "R1: scroll=pan  tap=ping  long=quick   modo: ▶RASTER (toggle GLYPH)   [scheda] [combat]"
      — assert it CONTAINS 'long=quick' (GEST-01 deferred to Phase 20 — D-2) and
      'modo:' and '[scheda]' and '▶RASTER (toggle GLYPH)'.
    - HC-5: footer content (locale='en') contains 'mode:' and '[sheet]' and 'long=quick'.
    - HC-6: when mode='glyph', BOTH header and footer carry the glyph variant —
      header mode token is 'glyph', footer shows '▶GLYPH (toggle RASTER)'.
    - HC-7: a textContainerUpgrade rejection from either writer propagates as a
      rejected Promise from the writer itself (the boot-site wrapper in Task 2
      catches it — keep the writer honest/no-swallow, mirror boot-splash).
  </behavior>
  <action>
    Create `packages/g2-app/src/engine/hud-chrome.ts` exporting two async functions
    `writeHeaderChrome` and `writeFooterChrome`, each taking `(bridge: EvenAppBridge,
    opts: { mode: 'raster' | 'glyph'; locale: BootEngineLocale | string })`.

    Both build a `TextContainerUpgrade` exactly like boot-splash.ts / status-hud-layer.ts:
    spread `...resolveContainerIdField('header'|'footer')` (from
    `engine/container-registry.js`), set `containerName`, set `content`, then
    `await bridge.textContainerUpgrade(payload)`. NO virtual DOM, NO fenced code —
    assemble content as plain strings.

    HEADER content (D-1): build `MAP · — · <mode>` left segment + center
    `ROUND — · <TURNO|TURN> —/—` + right `⌁ R1 —`, joined with the canonical spacing
    seen in the §7.4 fixture (use single-space-padded segments; do NOT attempt
    pixel-perfect column padding — id4 is its own 576px container, the host left-
    aligns it; the goal is intentional non-'Text' content, not full-frame INV-1
    composition which the fixture harness owns per D-5). Pick 'TURNO' for IT, 'TURN'
    otherwise. Use the em-dash '—' (U+2014) for scene/round/turn/battery.

    FOOTER content (D-2): render the canonical single-line footer string for the
    locale. IT: `R1: scroll=pan  tap=ping  long=quick   modo: ▶<ACTIVE> (toggle <OTHER>)   [scheda] [combat]`.
    EN/other: `R1: scroll=pan  tap=ping  long=quick   mode: ▶<ACTIVE> (toggle <OTHER>)   [sheet] [combat]`.
    `<ACTIVE>`/`<OTHER>` derive from mode: raster→`RASTER`/`GLYPH`, glyph→`GLYPH`/`RASTER`.
    KEEP `long=quick` verbatim (D-2 — do not write `qa=`).

    Add full TSDoc on both exported functions + the module (INV-4): explain the
    boot-time chrome role, cite Specs §7.4 + the frozen fixture, cite D-1/D-2/D-3
    rationale and the GEST-01/Phase-20 `long=quick` deferral, and the `—` missing-
    scalar policy. Reference container-registry for the id source. No dead code.

    Create the colocated test `__tests__/hud-chrome.test.ts` covering HC-1..HC-7
    with a mock bridge (mirror boot-splash.test.ts `makeMockBridge`). Assert the
    `containerID` field on the upgrade payload is the numeric id (4 / 5).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app exec vitest run src/engine/__tests__/hud-chrome.test.ts</automated>
  </verify>
  <done>hud-chrome.ts exports writeHeaderChrome + writeFooterChrome; HC-1..HC-7 pass; header content carries MAP/⌁ R1/mode + '—', footer carries the canonical locale line incl. 'long=quick'; payloads set containerID 4 / 5; TSDoc present; biome clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire header + footer chrome into boot after the bundle flush</name>
  <files>packages/g2-app/src/internal/boot-engine-core.ts</files>
  <action>
    In `_bootEngineCore`, immediately AFTER the step-12 `await layerManager.bundle([...])`
    flush (the line ending the mount of mapBase/idleInfill/statusHud/toastQueue,
    ~line 1179) and BEFORE step 12b (audio capture) / step 13 (first frame), add a
    new step "12a — paint persistent frame chrome (header id4 + footer id5)".

    Compute the boot mode ONCE from the SAME expression already used to construct
    IdleInfillLayer at ~line 646: `const chromeMode = effectiveVerdict === 'glyph'
    ? 'glyph' : 'raster';` (reuse the existing `effectiveVerdict` value — do NOT
    recompute the verdict). Pass `effectiveLocale` (already in scope) as `locale`.

    Call `writeHeaderChrome(bridge, { mode: chromeMode, locale: effectiveLocale })`
    and `writeFooterChrome(bridge, { mode: chromeMode, locale: effectiveLocale })`.
    Each call MUST be wrapped so a textContainerUpgrade rejection logs (`console.warn`,
    `[boot-engine-core] header/footer chrome write failed:`) and continues — a chrome
    write failure must NOT abort an already-booted engine (T-etr-03; mirror the
    step-12b audio-capture try/catch pattern). Order: header first, then footer.

    WHY AFTER the bundle flush: the bundle's single `rebuildPageContainer` flush
    (_flushPage) re-emits the canonical page schema from the registry, which would
    overwrite any text-container content written before it. Writing chrome AFTER the
    flush guarantees id4/id5 carry final content on the production display and are
    never reset to the SDK 'Text' default by a later rebuild. (StatusHudLayer/
    IdleInfillLayer self-redraw via their own post-bundle draw()/subscription; the
    header/footer have no layer, so this explicit post-flush write is their draw.)

    Import `writeHeaderChrome, writeFooterChrome` from `../engine/hud-chrome.js`
    next to the existing `showBootSplash` import (line ~58).

    Add a one-line entry to the step list in the function's top doc-comment
    (the numbered "12. await lm.bundle(...)" block at ~line 46): "12a. paint header
    (id4) + footer (id5) frame chrome — never leaves SDK 'Text' default".
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app exec vitest run src/internal/__tests__ src/__tests__</automated>
  </verify>
  <done>boot-engine-core imports + invokes writeHeaderChrome/writeFooterChrome after step-12 bundle, each rejection-guarded; reuses existing effectiveVerdict/effectiveLocale; existing boot-engine + integration-smoke tests still green.</done>
</task>

</tasks>

<verification>
Full-suite + quality gates (toolchain: corepack pnpm, NEVER bare pnpm):

```bash
# 1. Full g2-app suite — PROVES no INV-1 fixture drift (T-etr-01 / D-5) + new tests pass
corepack pnpm --filter @evf/g2-app exec vitest run

# 2. Typecheck (strict)
corepack pnpm --filter @evf/g2-app typecheck

# 3. Lint (read-only CI style)
corepack pnpm lint:ci
```

Manual / orchestrator live-sim check (NOT a gate — orchestrator runs it):
- Hot-reload via the running vite dev server; relaunch the EvenHub simulator.
- Expect: header row shows `MAP · — · raster … ⌁ R1 —` (intentional, not 'Text'),
  footer row shows `R1: scroll=pan … long=quick … [scheda] [combat]` (not 'Text'),
  z=0.5 strips unchanged, right Status HUD still shows real character data.
- Expect ZERO containers showing the literal SDK 'Text' default.
</verification>

<success_criteria>
- [ ] `hud-chrome.ts` exists with `writeHeaderChrome` + `writeFooterChrome`, full TSDoc, no dead code.
- [ ] header (id4) + footer (id5) are written at boot AFTER the step-12 bundle flush.
- [ ] header content = canonical §7.4 frame-top structure with `—` fallbacks + boot mode.
- [ ] footer content = canonical §7.4 footer line for the locale, KEEPING `long=quick` (D-2).
- [ ] IdleInfillLayer (z=0.5) untouched (D-3); StatusHudLayer untouched.
- [ ] New unit tests assert header + footer are written with the expected content + numeric ids (regression guard against the 'Text' default).
- [ ] FULL g2-app vitest suite green — no INV-1 fixture drift (D-5 / T-etr-01).
- [ ] typecheck + lint:ci green.
- [ ] SUMMARY states INV-3 = implements-existing-mockup (no spec/README/showcase change) + INV-1 = composite fixtures unchanged.
</success_criteria>

<output>
Create `.planning/quick/260605-etr-production-clean-the-g2-app-glasses-hud-/260605-etr-SUMMARY.md` when done.
</output>
