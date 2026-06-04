---
status: root_cause_found
trigger: "g2-app HUD renders nothing on the glasses — sim framebuffer blank/white after engine boots"
created: 2026-06-04
updated: 2026-06-04
slug: glasses-render-blank-containerid
---

# Debug: glasses render blank — container addressed by name, host requires numeric ID

## Symptoms
- After the launch glue + WS-URL + handshake fixes, the engine boots in the EvenHub simulator (WS connects, handshake passes, boot page created) BUT the glasses framebuffer stays blank/white.
- Simulator stdout (`/tmp/evf-sim.log`) repeatedly: `TextContainerUpgrade failed: container_id is required`.
- (Wizard character-selection screen renders fine — confirmed; that is NOT the bug.)

## Root cause (FOUND)
The EvenHub host (`@evenrealities/even_hub_sdk` `TextContainerUpgrade`) exposes BOTH `containerID?: number` (PB `Container_ID`) and `containerName?: string` (PB `Container_Name`), with field-passthrough `toJson`. The whole g2-app render path constructs `new TextContainerUpgrade({ containerName })` — addressing containers BY NAME ONLY, never setting `containerID`. The simulator host REQUIRES the numeric `container_id` → every `textContainerUpgrade` is rejected → nothing draws → blank glasses. Latent bug: the engine entry never actually called `bootEngine()` until today (fixed in quick ovn), so the render path was never exercised at runtime; unit tests mock the bridge and don't enforce the host's container_id requirement.

## Scope
- ~28 files under `packages/g2-app/src/**` call `textContainerUpgrade` / `updateImageRawData`, ALL by `containerName` (boot-splash, status-hud-renderer, idle-infill-layer, boot-error-layer, map-base-layer, every panel, page-lifecycle).
- Page schema declared in `engine/page-lifecycle.ts` `buildBootPageSchema()`: 4 image containers (map-tile-0..3) + 7 text containers (header, footer, status-hud, map-capture[isEventCapture=1], z05-combat-log, z05-label, z05-stats). containerTotalNum=11.
- No name→ID map exists anywhere (`grep containerID` → 0 hits in src).

## PROBE RESULTS (confirmed empirically in the sim, 2026-06-04)
- Setting `containerID` on TextContainerUpgrade removes `container_id is required`. ✓
- The host uses a SINGLE GLOBAL id namespace in declaration order: images first (0-3), then text (4-10). Probe: containerID 0 → "container 0 is not a text container" (it's image map-tile-0); containerID 4 (first text, header) → ACCEPTED, no error.
- The host RESPECTS the engine-assigned containerID (TextContainerProperty.containerID is writable; createStartUpPageContainer returns only success/fail, no IDs).
- SECOND GAP found: text containers in buildBootPageSchema have NO geometry. `TextContainerProperty` supports `xPosition/yPosition/width/height` (image containers set them; text containers don't) → even with the right containerID the text is invisible (size/pos 0) → still-blank glasses. Both the ID and geometry must be set.
- The boot sequence does createBootPage → showBootSplash → ... → rebuildPageContainer (atomic 3-layer bundle), so the MAIN page schema (createMainPage) must carry the same IDs+geometry, and the layer renderers (status-hud-renderer, idle-infill-layer, etc.) must send containerID too.

## CONFIRMED FIX (canonical container registry: name → {id, x, y, w, h})
text IDs: header=4, footer=5, status-hud=6, map-capture=7(isEventCapture), z05-combat-log=8, z05-label=9, z05-stats=10. image IDs: map-tile-0..3 = 0..3. Geometry per UI-SPEC layout (576×288). Single source of truth used by BOTH page schemas AND every textContainerUpgrade/updateImageRawData site.

## Fix plan (NOT yet applied — needs a dedicated cycle)
1. PROBE the simulator to determine the host's container-ID assignment scheme (is the ID the declaration index? do image vs text share an index space or separate? is the isEventCapture container special?). The sim API only sends gestures+screenshots, so probe via a temporary dev page that creates the boot page then calls textContainerUpgrade with containerID 0..N and screenshots which slot renders.
2. Build a single source-of-truth name→containerID registry derived from the page schema declaration order, and thread `containerID` into EVERY textContainerUpgrade/updateImageRawData call (keep containerName too if harmless).
3. Update tests to assert containerID is sent.
4. OPEN QUESTION: does real G2 hardware also require container_id, or accept container_name? (Sim requires id; likely hw too — verify against Even Hub device-apis docs / hardware.)

## Also observed (separate, lower priority)
- 5 panels fail lazy-load in dev: `[PanelRouter] panel ../panels/{quick-action-menu,reaction-prompt,slot-picker,target-picker,template-placement}-panel.ts excluded: load error`. Investigate after the container_id fix (may be a dev dynamic-import issue, non-fatal — panels are excluded gracefully).
- The user's deployed g2-app is the OLD build (no today's fixes) — even after this fix lands, the user must run/redeploy the NEW g2-app build to see the HUD.
