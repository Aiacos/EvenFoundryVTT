/**
 * Page-lifecycle wrappers around `EvenAppBridge` page operations
 * (createStartUpPageContainer / rebuildPageContainer).
 *
 * Purpose: centralise the boot-page container schema. All Phase 4a engine
 * consumers call these wrappers; nobody else may build a
 * `CreateStartUpPageContainer` payload, so the schema stays canonical in
 * one place.
 *
 * DEFAULT (status-view) boot schema: 3 text containers — header, footer,
 * status-hud — NO image containers. map-capture and z05-* are excluded to
 * avoid the full-rect overlap that caused the G2 host to reject the schema
 * (quick-260605-j0t-04 fix). They remain in the registry for the deferred
 * map-mode page (Phase 20 / Specs §7.4).
 *
 * No virtual DOM (D-2.04, CLAUDE.md) — every method directly forwards an
 * SDK class instance to the bridge.
 *
 * Open question resolution: per OQ-INV2-1 the image API is page-based
 * declarative (`createStartUpPageContainer` / `rebuildPageContainer`),
 * NOT per-container imperative. Boot and main pages share the same
 * container layout; the splash content is overlaid by repurposing the
 * text containers via `textContainerUpgrade` (boot-splash.ts). Phase 4b
 * may diverge boot vs main page layouts.
 *
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 + Amendment 1)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Container Budget Allocation
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 2
 */

import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  type ImageContainerProperty,
  RebuildPageContainer,
  StartUpPageCreateResult,
  type TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { BOOT_CONTAINER_TOTAL, buildStatusViewTextContainers } from './container-registry.js';

/**
 * Build the DEFAULT STATUS-VIEW boot page container schema.
 *
 * The default view declares ONLY 3 text containers — NO image containers:
 *   - header     (id 4): y=0,   width=576, height=27  (1 row: boot splash)
 *   - footer     (id 5): y=261, width=576, height=27  (1 row: R1 hint / mode)
 *   - status-hud (id 6): y=27,  width=576, height=234 (9 rows × 27px)
 *
 * These three tile perfectly within 576×288: 27+234+27=288, no gaps, no
 * overlaps. containerTotalNum: 3.
 *
 * WHY NOT ALL 11? After the HUD-27PX redesign (quick-260605-j0t), `map-capture`
 * (id 7) and `status-hud` (id 6) share the IDENTICAL full rect (x=0, y=27,
 * w=576, h=234). The G2 host rejects a schema where two text containers — one
 * with `isEventCapture=1` — occupy the same rectangle, returning a non-success
 * result from `createStartUpPageContainer` (hence `bootEngine failed`). The fix
 * is to declare ONLY the status-default containers at boot, and defer map-capture
 * / z05-* / image map-tiles to the gesture-opened map-mode page (Phase 20).
 *
 * The registry still holds all 11 entries; `buildStatusViewTextContainers()`
 * filters to the 3 that belong to the default view.
 *
 * This is a pure helper exposed for tests and for any consumer that wants
 * to inspect the schema without invoking the bridge.
 *
 * @see ./container-registry.ts (CONTAINER_REGISTRY single source of truth)
 * @see ./container-registry.ts#buildStatusViewTextContainers
 * @see ./container-registry.ts#BOOT_CONTAINER_TOTAL
 * @see .planning/debug/glasses-render-blank-containerid.md
 */
export function buildBootPageSchema(): {
  containerTotalNum: number;
  imageObject: ImageContainerProperty[];
  textObject: TextContainerProperty[];
} {
  // Status-view only: header (id4), footer (id5), status-hud (id6).
  // map-capture (id7), z05-* (ids 8-10), and image map-tiles are EXCLUDED
  // — they are deferred to the gesture-opened map-mode page (Phase 20).
  const textObject = buildStatusViewTextContainers();

  // 0 image + 3 text → containerTotalNum: 3 (BOOT_CONTAINER_TOTAL).
  return {
    containerTotalNum: BOOT_CONTAINER_TOTAL,
    imageObject: [],
    textObject,
  };
}

/**
 * Create the G2 boot page via `bridge.createStartUpPageContainer`.
 *
 * The default status-view schema (3 text containers: header, footer,
 * status-hud) is built by `buildBootPageSchema()` — see that helper for
 * the canonical layout. On non-success result, the function throws an `Error`
 * whose message includes the result value so upstream boot-error UI can
 * surface it (Phase 4b will wire the boot-error branches BOOT-01).
 *
 * Idempotency: callers must invoke this AT MOST ONCE per app boot. A
 * subsequent boot transition uses `rebuildPageContainer` (via the
 * LayerManager bundle flush) or a full `shutDownPageContainer` cycle.
 *
 * @param bridge - The resolved EvenAppBridge singleton
 */
export async function createBootPage(bridge: EvenAppBridge): Promise<void> {
  const schema = buildBootPageSchema();
  const payload = new CreateStartUpPageContainer({
    containerTotalNum: schema.containerTotalNum,
    imageObject: schema.imageObject,
    textObject: schema.textObject,
  });
  const result = await bridge.createStartUpPageContainer(payload);
  if (result !== StartUpPageCreateResult.success) {
    throw new Error(
      `createBootPage: createStartUpPageContainer returned non-success (${String(result)})`,
    );
  }
}

/**
 * Build the canonical main-page schema.
 *
 * Phase 4a: identical to the boot-page schema (3 text containers: header,
 * footer, status-hud) — the boot-splash overlays its checklist onto those
 * containers via `textContainerUpgrade`, and after handshake completion the
 * LayerManager bundles in the real HUD layers without a
 * `shutDownPageContainer`/`createStartUpPageContainer` round-trip. Phase 4b
 * may diverge boot vs main page layouts — at which point this function
 * becomes the divergence point.
 */
export async function createMainPage(bridge: EvenAppBridge): Promise<void> {
  // Same schema as the boot page in Phase 4a (see JSDoc above).
  await createBootPage(bridge);
}

/**
 * Forward a fully-built `rebuildPageContainer` payload to the bridge.
 *
 * Reserved for `LayerManager.bundle()` consumption — the bundle flush
 * builds the merged container definition (e.g., demolish z=0.5, mount
 * z=2 overlay) and calls this exactly once per bundle. Throws on bridge
 * rejection; LayerManager surfaces the error to its caller.
 */
export async function rebuildToOverlay(
  bridge: EvenAppBridge,
  overlayDef: {
    containerTotalNum: number;
    textObject: TextContainerProperty[];
    imageObject: ImageContainerProperty[];
  },
): Promise<void> {
  const payload = new RebuildPageContainer({
    containerTotalNum: overlayDef.containerTotalNum,
    textObject: overlayDef.textObject,
    imageObject: overlayDef.imageObject,
  });
  await bridge.rebuildPageContainer(payload);
}
