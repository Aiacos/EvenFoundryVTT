/**
 * HUD frame chrome writers — paints the persistent header (id4) and footer (id5)
 * text containers once at boot, AFTER the step-12 `lm.bundle()` flush.
 *
 * ## Why this module exists
 *
 * Two base text containers were never given intentional content at boot:
 *
 *   - `header` (id4, 576×12): the boot-splash repurposes it for the 5-step
 *     checklist + protocol line, then nothing repaints it → the glasses keep
 *     showing a stale boot line (or the SDK `"Text"` default if the splash race
 *     lost). See {@link writeHeaderChrome}.
 *   - `footer` (id5, 576×24): no layer ever writes it → permanent SDK `"Text"`
 *     default. See {@link writeFooterChrome}.
 *
 * Both writers are called once by `_bootEngineCore` step 12a, immediately after
 * `await lm.bundle([...])` (the single rebuildPageContainer flush). Writing AFTER
 * the flush guarantees that neither container is reset back to `"Text"` by a
 * subsequent page rebuild (which is what `_flushPage` triggers). LayerManager-owned
 * layers (StatusHudLayer, IdleInfillLayer) self-redraw via their own
 * `draw()`/subscription; the header and footer have no owning layer, so this
 * explicit post-flush write is their one-and-only draw call.
 *
 * ## INV-3 disposition (D-4 of the plan)
 *
 * Both writers IMPLEMENT content already shown in the canonical Specs §7.4 mockup
 * and the frozen INV-1 fixture (`glyph-scene.raster-idle-it.txt`). The `—` fallbacks
 * are the spec's own missing-scalar convention (no `scene` / `round` / `battery`
 * data at boot time). No rendered content diverges from existing mockups — the INV-3
 * atomic-doc-coherence gate does NOT trigger for this module.
 *
 * ## INV-1 disposition (D-5 of the plan)
 *
 * The frozen composite INV-1 fixtures are produced by the snapshot-test harness from
 * layer output; they do NOT include these boot-time writers. This module does NOT
 * regenerate any composite fixtures. New content is asserted only by the dedicated
 * unit tests in `__tests__/hud-chrome.test.ts`.
 *
 * ## GEST-01 / ADR-0012 — `long=quick` deferral (D-2 of the plan)
 *
 * The footer string carries `long=quick` verbatim. This matches the canonical Specs §7.4
 * mockup AND the frozen INV-1 fixture (both still read `long=quick`). Updating to `qa=`
 * (the GEST-01/ADR-0012 gesture-vocab change) is explicitly scoped to **Phase 20**, which
 * will sweep `long=` → `qa=` across Specs mockups + INV-1 fixtures + README + showcase
 * atomically. Introducing `qa=` here would diverge from the frozen fixtures and require
 * an INV-3 spec bump in this quick task. Leave `long=quick` until Phase 20 owns the sweep.
 *
 * ## Missing-scalar policy
 *
 * `—` (U+2014 EM DASH) is the project-wide convention for unknown/unavailable scalars at
 * boot time: scene name not yet pushed, round/turn not yet set by combat, R1 battery not
 * yet read from device status. This mirrors the pattern used verbatim in `IdleInfillLayer`
 * (`_formatStatsStrip`) and the `StatusHudRenderer`.
 *
 * @see Specs.md §7.4 (canonical HUD frame-top + footer mockup)
 * @see packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt (frozen INV-1)
 * @see packages/g2-app/src/engine/container-registry.ts (id4 / id5 source of truth)
 * @see packages/g2-app/src/internal/boot-engine-core.ts (step 12a — invocation site)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { BootEngineLocale } from '../internal/boot-engine-core.js';
import { resolveContainerIdField } from './container-registry.js';

// ── Container names ──────────────────────────────────────────────────────────

/** Header container name (registered in container-registry.ts, maps to id 4). */
const HEADER_CONTAINER = 'header' as const;
/** Footer container name (registered in container-registry.ts, maps to id 5). */
const FOOTER_CONTAINER = 'footer' as const;

// ── Chrome writer options ─────────────────────────────────────────────────────

/**
 * Options shared by both HUD chrome writers.
 *
 * - `mode`   — current render mode (`'raster'` | `'glyph'`), derived from
 *              `effectiveVerdict` in `_bootEngineCore` at step 12a.
 * - `locale` — effective boot locale (after step 9c override read-back), e.g.
 *              `'it'` / `'en'` / `'de'`. Drives the center label (`TURNO` vs
 *              `TURN`) and the footer's `modo:` / `mode:` label.
 */
export interface HudChromeOpts {
  /** Render mode derived from `effectiveVerdict === 'glyph' ? 'glyph' : 'raster'`. */
  readonly mode: 'raster' | 'glyph';
  /** Effective locale after step 9c override read-back. */
  readonly locale: BootEngineLocale | string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return the upper-case active/other mode pair for the footer toggle segment.
 *
 * @param mode Current render mode.
 * @returns `{ active: 'RASTER', other: 'GLYPH' }` or `{ active: 'GLYPH', other: 'RASTER' }`.
 */
function modeTokens(mode: 'raster' | 'glyph'): { active: string; other: string } {
  return mode === 'raster'
    ? { active: 'RASTER', other: 'GLYPH' }
    : { active: 'GLYPH', other: 'RASTER' };
}

// ── Public writers ────────────────────────────────────────────────────────────

/**
 * Write the canonical §7.4 frame-top content into the `header` container (id4).
 *
 * Renders the three-segment header line:
 *   - Left:   `MAP · — · <mode>`
 *   - Center: `TURNO —/—` (IT) or `TURN —/—` (EN/other) — round/turn are `—` at boot
 *   - Right:  `⌁ R1 —` — battery is `—` at boot (device-status not yet read)
 *
 * The `—` slots (scene, round, turn, battery) carry the project-wide missing-scalar
 * convention and will be overwritten by future layer updates once real data arrives.
 * This is the "implements-existing-mockup" case per D-1 / D-4 of the plan.
 *
 * **Important:** this function propagates any `textContainerUpgrade` rejection — it does
 * NOT swallow errors. The call site in `_bootEngineCore` step 12a wraps each writer so
 * a rejection logs and continues (T-etr-03 mitigation) without aborting the engine.
 *
 * @param bridge  The live `EvenAppBridge` instance.
 * @param opts    Chrome options: render mode + effective locale.
 * @returns       Resolves when the `textContainerUpgrade` call resolves.
 * @throws        Re-throws the bridge rejection so the step-12a wrapper can catch it.
 *
 * @see Specs.md §7.4 (row 0 / fixture row 2 — frame-top)
 * @see packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt row 2
 * @see packages/g2-app/src/engine/container-registry.ts (header → id 4)
 */
export async function writeHeaderChrome(bridge: EvenAppBridge, opts: HudChromeOpts): Promise<void> {
  const { mode, locale } = opts;

  // Center label: 'TURNO' for Italian, 'TURN' for all other locales.
  const turnLabel = locale === 'it' ? 'TURNO' : 'TURN';

  // Assemble the three segments in the §7.4 fixture order.
  // Space-padded segments separated by spaces — the host left-aligns within the
  // 576px container. Character-perfect full-frame INV-1 composition is the snapshot
  // harness's responsibility (D-5); here we emit intentional non-"Text" content.
  const left = `MAP · — · ${mode}`;
  const center = `${turnLabel} —/—`;
  const right = `⌁ R1 —`;

  // Join with the spacing pattern from the §7.4 IT fixture:
  //   'MAP · Sala Banchetti · raster        TURNO 2/5                  ⌁ R1 92%'
  // At boot we have `—` in the scene/round/battery slots, but the structural segments
  // and their relative ordering are preserved verbatim.
  const content = `${left}        ${center}                  ${right}`;

  const idField = resolveContainerIdField(HEADER_CONTAINER);
  const payload = new TextContainerUpgrade({
    ...idField,
    containerName: HEADER_CONTAINER,
    content,
  });

  await bridge.textContainerUpgrade(payload);
}

/**
 * Write the canonical §7.4 footer line into the `footer` container (id5).
 *
 * Renders the single-line gesture-hint + mode + nav-chip footer:
 *   - IT: `R1: scroll=pan  tap=ping  long=quick   modo: ▶<ACTIVE> (toggle <OTHER>)   [scheda] [combat]`
 *   - EN: `R1: scroll=pan  tap=ping  long=quick   mode: ▶<ACTIVE> (toggle <OTHER>)   [sheet] [combat]`
 *
 * `<ACTIVE>` and `<OTHER>` are determined by `opts.mode`:
 *   - `'raster'` → `RASTER` / `GLYPH`
 *   - `'glyph'`  → `GLYPH` / `RASTER`
 *
 * **GEST-01 / Phase 20 deferral:** `long=quick` is kept verbatim. The canonical Specs §7.4
 * mockup and frozen INV-1 fixture both carry `long=quick`. Updating to `qa=` is Phase 20's
 * responsibility (gesture-vocab sweep of all specs + INV-1 fixtures + docs atomically).
 *
 * **Important:** this function propagates any `textContainerUpgrade` rejection — it does
 * NOT swallow errors. The call site in `_bootEngineCore` step 12a wraps each writer so
 * a rejection logs and continues (T-etr-03 mitigation) without aborting the engine.
 *
 * @param bridge  The live `EvenAppBridge` instance.
 * @param opts    Chrome options: render mode + effective locale.
 * @returns       Resolves when the `textContainerUpgrade` call resolves.
 * @throws        Re-throws the bridge rejection so the step-12a wrapper can catch it.
 *
 * @see Specs.md §7.4 (row 22 / fixture row 23 — footer)
 * @see packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt row 23
 * @see packages/g2-app/src/engine/container-registry.ts (footer → id 5)
 */
export async function writeFooterChrome(bridge: EvenAppBridge, opts: HudChromeOpts): Promise<void> {
  const { mode, locale } = opts;
  const { active, other } = modeTokens(mode);

  // Locale-sensitive labels:
  const modeLabel = locale === 'it' ? 'modo:' : 'mode:';
  const sheetChip = locale === 'it' ? '[scheda]' : '[sheet]';

  // Canonical footer line verbatim from Specs §7.4 + frozen INV-1 fixture.
  // GEST-01/Phase-20 note: `long=quick` is intentional — do NOT replace with `qa=`
  // until Phase 20 owns the full gesture-vocab sweep of specs + fixtures + docs.
  const content = `R1: scroll=pan  tap=ping  long=quick   ${modeLabel} ▶${active} (toggle ${other})   ${sheetChip} [combat]`;

  const idField = resolveContainerIdField(FOOTER_CONTAINER);
  const payload = new TextContainerUpgrade({
    ...idField,
    containerName: FOOTER_CONTAINER,
    content,
  });

  await bridge.textContainerUpgrade(payload);
}
