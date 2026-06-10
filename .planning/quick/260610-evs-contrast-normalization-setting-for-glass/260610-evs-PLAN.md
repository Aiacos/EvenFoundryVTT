---
phase: quick-260610-evs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/foundry-module/src/canvas-extractor.ts
  - packages/foundry-module/src/canvas-extractor.test.ts
  - packages/foundry-module/src/settings.ts
  - packages/foundry-module/src/module.ts
  - packages/foundry-module/lang/en.json
  - packages/foundry-module/lang/it.json
  - .changeset/map-contrast-normalize.md
autonomous: true
requirements: [EVS-NORM-01]
must_haves:
  truths:
    - "Dark Foundry map frames are levels-stretched before dithering so the glasses show usable contrast"
    - "Already-bright and near-flat frames are left untouched (no clipping, no noise blow-up)"
    - "Letterbox bands stay pure black after normalization (normalization runs pre-padding)"
    - "A DM can toggle the normalization on/off via a client-scope Foundry setting and it applies live without re-pairing or reload"
  artifacts:
    - path: "packages/foundry-module/src/canvas-extractor.ts"
      provides: "normalize:'off'|'auto' option on extractCurrentFrame + getNormalize per-capture hook on registerCanvasExtractor"
      contains: "normalize"
    - path: "packages/foundry-module/src/settings.ts"
      provides: "mapContrastNormalize client-scope config:true Boolean setting (default true)"
      contains: "mapContrastNormalize"
  key_links:
    - from: "packages/foundry-module/src/module.ts"
      to: "registerCanvasExtractor getNormalize"
      via: "game.settings.get(MODULE_ID,'mapContrastNormalize') ? 'auto' : 'off'"
      pattern: "getNormalize"
---

<objective>
Add pre-dither contrast normalization (luminance levels-stretch) to the glasses map stream, gated behind a user-settable Foundry option. Dark scenes (median luma ~21) currently dither to near-black mush on the G2's 4-bit greyscale; an auto levels-stretch over the FITTED CONTENT (before letterbox padding) restores usable contrast while leaving already-good frames and degenerate frames untouched.

Purpose: The player must read the map at a glance (core value). A pitch-dark dungeon scene is unreadable after the 4-bit dither without a contrast boost; this closes the Phase 27 leftover requested 2026-06-10.
Output: A backward-compatible `normalize` option on the pure `extractCurrentFrame`, a per-capture `getNormalize` hook on `registerCanvasExtractor`, a `mapContrastNormalize` client setting (IT/EN), module wiring, and tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@packages/foundry-module/src/canvas-extractor.ts
@packages/foundry-module/src/canvas-extractor.test.ts
@packages/foundry-module/src/settings.ts
@packages/foundry-module/src/module.ts
@packages/foundry-module/lang/en.json
@packages/foundry-module/lang/it.json

Environment notes (NON-NEGOTIABLE):
- pnpm is NOT on PATH locally — use `corepack pnpm ...` for every gate.
- Branch is `feat/hud-raster-rendering`, main tree (no worktree). Stage ONLY the files this plan touches by explicit path. Untracked scratch (`packages/bridge/_seed.ts`, `packages/foundry-module/release/`, `release-artifacts/`, `_scene_e2e.ts`) MUST NOT be committed.
- commitlint scopes include `foundry-module`; commit header ≤100 chars.
- `getCharacterSnapshot` / `_flushPage` style: this module ships hand-typed Foundry globals; tests stub `canvas`/`Hooks`/`game.settings` via `vi.stubGlobal` (see canvas-extractor.test.ts + settings idioms).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure luminance levels-stretch + per-capture getNormalize hook</name>
  <files>packages/foundry-module/src/canvas-extractor.ts, packages/foundry-module/src/canvas-extractor.test.ts</files>
  <behavior>
    - Dark-scene fixture (content median luma ~21, range narrow but ≥ ~8) with normalize:'auto' → output content median significantly raised vs normalize:'off' on the same input.
    - Already-bright/wide-range frame (p98−p2 ≥ ~220) with normalize:'auto' → byte-identical to normalize:'off' (skip, no clipping).
    - Degenerate near-flat frame (p98−p2 < ~8) with normalize:'auto' → byte-identical to normalize:'off' (skip, avoid noise blow-up).
    - Letterbox bands remain pure black (R=G=B=0) and alpha stays 255 everywhere when normalize:'auto' on an oversized source — normalization is computed over CONTENT pixels only, applied BEFORE padding.
    - normalize defaults to 'off' → extractCurrentFrame with no opts is byte-identical to current behavior (backward compat; existing CE-2/CE-5/CE-6 stay green).
    - getNormalize is consulted on EACH capture: a stub returning 'off' then 'auto' between two interval/hook captures changes output without re-registering.
  </behavior>
  <action>
    Extend the pure path in extractCurrentFrame. Add `normalize?: 'off' | 'auto'` to its opts param (default 'off' so the function stays backward-compatible — existing callers and CE-5/CE-6 unchanged). Compute the box-average fitted content into the out buffer exactly as today; when normalize === 'auto', apply a levels-stretch over ONLY the content region (the outWidth×outHeight rectangle at padX/padY) BEFORE the alpha-fill / letterbox bands are considered, so padding bytes (which are zero) never enter the percentile computation and stay pure black.

    Levels-stretch algorithm: compute Rec.709 luma per content pixel as luma = 0.2126*R + 0.7152*G + 0.0722*B. Build the p2 and p98 luminance percentiles over the content pixels (a 256-bin luma histogram is sufficient and cheap; pick the bin at the 2nd and 98th cumulative-count percentile). Let range = p98 − p2. Skip the stretch (leave content bytes unchanged) when range ≥ 220 (already wide) OR range < 8 (degenerate / near-flat — avoid amplifying noise). Otherwise linearly map [p2, p98] → [0, 255] applied UNIFORMLY to each channel: out = clamp(round((c − p2) * 255 / range), 0, 255) for c in {R, G, B} of every content pixel. Apply the SAME (p2, range) to all three channels (luma-derived endpoints, per-channel application — preserves hue, lifts overall brightness/contrast). Keep all arithmetic in pure JS typed-array loops (no canvas/OffscreenCanvas — matches the module's existing no-DOM rationale).

    Thread the setting through registration: add `getNormalize?: () => 'off' | 'auto'` to CanvasExtractorOpts. In performExtract, evaluate `opts.getNormalize?.() ?? 'off'` on EACH call (so a live settings change applies on the next hook-debounced or interval capture without re-registering) and pass it as `normalize` into extractCurrentFrame alongside the existing targetWidth/targetHeight spread (exactOptionalPropertyTypes-safe spread — only include the key when defined, OR always pass the resolved 'off'|'auto' value since it is a concrete string).

    Update the module-level JSDoc + the extractCurrentFrame TSDoc to document the new `normalize` option and the per-capture getNormalize evaluation. Add a `mapContrastNormalize`/normalization paragraph. Do NOT inline fenced code in JSDoc beyond existing style.

    Tests: extend canvas-extractor.test.ts with a new describe block (e.g. CE-NORM-1..CE-NORM-5) using the existing makeCanvasMock/decodeFramePixels idioms. Build a dark fixture by filling the source with a low constant plus a modest bright patch (so content luma spans a narrow but ≥8 range), and a wide fixture spanning ~0..255. Decode via decodeFramePixels and compute the content-region median to assert the lift / no-op. For the getNormalize-per-capture test, register with a stub whose return value flips between captures (use fake timers + intervalMs as the existing CE-INT tests do) and assert the two emitted frames differ. Assert the letterbox sample (e.g. out[(100*400+0)*4]) is 0 in the 'auto' case on an oversized source.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/foundry-module test -- --run canvas-extractor</automated>
  </verify>
  <done>extractCurrentFrame accepts normalize:'off'|'auto' (default 'off', backward-compatible); 'auto' levels-stretches dark content, skips wide and degenerate frames, keeps letterbox black + alpha 255; registerCanvasExtractor accepts getNormalize evaluated per capture; new CE-NORM tests + all existing canvas-extractor tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: mapContrastNormalize setting + i18n + module wiring + changeset</name>
  <files>packages/foundry-module/src/settings.ts, packages/foundry-module/src/module.ts, packages/foundry-module/lang/en.json, packages/foundry-module/lang/it.json, .changeset/map-contrast-normalize.md</files>
  <action>
    In settings.ts registerSettings(), register a new CLIENT-scope, config:true Boolean setting `mapContrastNormalize` with default `true`, name `evf.settings.map_contrast_normalize.name` and hint `evf.settings.map_contrast_normalize.hint` (follow the existing `game.settings.register(MODULE_ID, ...)` shape; scope:'client', config:true, type:Boolean, default:true — NOT restricted, it is a per-client display preference). Place it near the other registrations.

    Add the two i18n keys to BOTH lang files:
    - en.json: `evf.settings.map_contrast_normalize.name` = "Map contrast normalization (glasses)", `evf.settings.map_contrast_normalize.hint` = a one-line EN description (e.g. "Auto-stretch dark map scenes for readable contrast on the glasses before dithering. Disable to send raw brightness.").
    - it.json: `evf.settings.map_contrast_normalize.name` = "Normalizzazione contrasto mappa (occhiali)", `evf.settings.map_contrast_normalize.hint` = matching IT description.
    Keep the JSON valid (comma placement) and ordered alongside the existing `evf.settings.*` keys.

    In module.ts, update the `registerCanvasExtractor({ emit: ... })` call (around line 337) to also pass `getNormalize: () => { try { return game.settings.get(MODULE_ID, 'mapContrastNormalize') ? 'auto' : 'off'; } catch { return 'auto'; } }`. The safe fallback returns 'auto' if the settings read throws (default-on behavior), matching the default:true setting. Use a typed cast consistent with how this file reads other settings (e.g. the `game.settings.get(...) as ...` pattern already used for bridgeUrl/bearerRegistry); the return type must be the 'off'|'auto' union.

    Add `.changeset/map-contrast-normalize.md` declaring a `patch` bump for `@evf/foundry-module` with a one-line summary (map contrast normalization client setting). Match the existing changeset frontmatter format (`"@evf/foundry-module": patch`).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/foundry-module test && corepack pnpm typecheck && corepack pnpm lint:ci</automated>
  </verify>
  <done>`mapContrastNormalize` registered (client scope, config:true, default true) with IT+EN strings in both lang files; module.ts wires getNormalize reading the setting with an 'auto' fallback; changeset present; typecheck + lint:ci + foundry-module tests green.</done>
</task>

</tasks>

<verification>
- `corepack pnpm typecheck` exits 0.
- `corepack pnpm lint:ci` exits 0 (Biome — zero warnings).
- `corepack pnpm --filter @evf/foundry-module test` passes (existing + new CE-NORM tests).
- `corepack pnpm changeset:status` shows a declared `@evf/foundry-module` patch.
- Manual reasoning check: with the setting OFF, frames are byte-identical to pre-change output (normalize defaults to 'off' / setting false → 'off'); with it ON, dark scenes are lifted, bright/flat scenes untouched, letterbox stays black.
</verification>

<success_criteria>
- extractCurrentFrame is backward-compatible (no `normalize` opt → identical bytes to current behavior).
- normalize:'auto' lifts dark content, skips wide (range ≥ ~220) and degenerate (range < ~8) frames, applies pre-padding so letterbox bands stay pure black and alpha stays 255.
- getNormalize is evaluated on every capture (live toggle, no re-register).
- `mapContrastNormalize` client setting (default on) exists with IT+EN strings and is wired into the extractor with an 'auto' fallback on read failure.
- All four quality gates green; changeset declared.
</success_criteria>

<output>
Create `.planning/quick/260610-evs-contrast-normalization-setting-for-glass/260610-evs-SUMMARY.md` when done.
</output>
