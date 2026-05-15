/**
 * Page-lifecycle wrappers around `EvenAppBridge` page operations
 * (createStartUpPageContainer / rebuildPageContainer).
 *
 * Purpose: centralise the boot-page container schema declared by UI-SPEC
 * §Container Budget Allocation (raster mode idle row — 4 image + 7 text +
 * 1 capture = 11 containers within the SDK's 1-12 limit). All Phase 4a
 * engine consumers call these wrappers; nobody else may build a
 * `CreateStartUpPageContainer` payload, so the schema stays canonical in
 * one place.
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
  ImageContainerProperty,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';

/**
 * Build the canonical Phase 4a boot/main page container schema.
 *
 * 4 image containers (200×100 each, tiled 2×2 = 400×200 effective):
 *   - map-tile-0 @ (  0,   0)
 *   - map-tile-1 @ (200,   0)
 *   - map-tile-2 @ (  0, 100)
 *   - map-tile-3 @ (200, 100)
 *
 * 7 text containers (one with isEventCapture=1):
 *   - header        (z=1, col 0-95)
 *   - footer        (z=1, col 0-95)
 *   - status-hud    (z=1, col 68-95)
 *   - map-capture   (z=0, isEventCapture=1)
 *   - z05-combat-log (z=0.5)
 *   - z05-label      (z=0.5)
 *   - z05-stats      (z=0.5)
 *
 * containerTotalNum: 11 (= 4 image + 7 text, within SDK 1-12 limit).
 *
 * This is a pure helper exposed for tests and for any consumer that wants
 * to inspect the schema without invoking the bridge.
 */
export function buildBootPageSchema(): {
  containerTotalNum: number;
  imageObject: ImageContainerProperty[];
  textObject: TextContainerProperty[];
} {
  const imageObject = [
    new ImageContainerProperty({
      containerName: 'map-tile-0',
      width: 200,
      height: 100,
      xPosition: 0,
      yPosition: 0,
    }),
    new ImageContainerProperty({
      containerName: 'map-tile-1',
      width: 200,
      height: 100,
      xPosition: 200,
      yPosition: 0,
    }),
    new ImageContainerProperty({
      containerName: 'map-tile-2',
      width: 200,
      height: 100,
      xPosition: 0,
      yPosition: 100,
    }),
    new ImageContainerProperty({
      containerName: 'map-tile-3',
      width: 200,
      height: 100,
      xPosition: 200,
      yPosition: 100,
    }),
  ];

  // Construct text containers via the SDK's TextContainerProperty class
  // to keep `isEventCapture` / `containerName` field-mapping consistent
  // with the host-side PB normalisation (camelCase ↔ protoName).
  const textObject: TextContainerProperty[] = [
    new TextContainerProperty({ containerName: 'header', isEventCapture: 0 }),
    new TextContainerProperty({ containerName: 'footer', isEventCapture: 0 }),
    new TextContainerProperty({ containerName: 'status-hud', isEventCapture: 0 }),
    // The capture container — exactly one isEventCapture=1 per page
    // (INV-5 / ADR-0001 / UI-SPEC §Interaction Contract).
    new TextContainerProperty({ containerName: 'map-capture', isEventCapture: 1 }),
    new TextContainerProperty({ containerName: 'z05-combat-log', isEventCapture: 0 }),
    new TextContainerProperty({ containerName: 'z05-label', isEventCapture: 0 }),
    new TextContainerProperty({ containerName: 'z05-stats', isEventCapture: 0 }),
  ];

  // 4 image + 7 text → containerTotalNum: 11 (UI-SPEC §Container Budget Allocation).
  return {
    containerTotalNum: imageObject.length + textObject.length,
    imageObject,
    textObject,
  };
}

/**
 * Create the G2 boot page via `bridge.createStartUpPageContainer`.
 *
 * The 4-image + 7-text container schema is built by `buildBootPageSchema()`
 * (see that helper for the canonical layout). On non-success result, the
 * function throws an `Error` whose message includes the result value so
 * upstream boot-error UI can surface it (Phase 4b will wire the boot-error
 * branches BOOT-01).
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
 * Phase 4a: identical to the boot-page schema — the boot-splash overlays
 * its checklist onto the same 7 text containers via `textContainerUpgrade`,
 * and after handshake completion the LayerManager bundles in the real HUD
 * layers without a `shutDownPageContainer`/`createStartUpPageContainer`
 * round-trip. Phase 4b may diverge boot vs main page layouts (e.g., to
 * collapse z=0.5 in glyph mode boot) — at which point this function
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
