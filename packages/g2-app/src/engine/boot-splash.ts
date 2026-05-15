/**
 * Boot-splash renderer — paints the 5-step checklist on the G2 boot page
 * via sequential `bridge.textContainerUpgrade` calls, then renders the
 * protocol-line "footer" once.
 *
 * UI-SPEC §Screen 1 fixture: each step uses one of four state markers:
 *
 *   `[ ✓ ]` done       `[ ⟳ ]` in_progress       `[   ]` pending       `[ ✕ ]` failed
 *
 * Container target: by default the `header` text container (declared by
 * `page-lifecycle.createBootPage()`). The boot splash repurposes the
 * header slot for the checklist; after the main HUD comes online the
 * StatusHudLayer / Header layer take over the same container via
 * subsequent `textContainerUpgrade` calls — no `rebuildPageContainer`
 * is needed.
 *
 * No virtual DOM — content is a plain string assembled inline.
 *
 * Behaviour vs threat model T-4a-02-04: all labels are static or pulled
 * from already-trusted Phase 3 sources (pairing token already validated
 * by the bridge). No PII rendered. The `protocol` line surfaces the
 * negotiated protocol version + count of available panels — both
 * non-secret negotiated metadata.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §boot-splash.ts
 * @see Specs.md §7.12 (boot splash)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';

/** State of an individual boot-splash checklist step. */
export type BootStepState = 'pending' | 'in_progress' | 'done' | 'failed';

/** A single labeled step in the boot-splash checklist. */
export interface BootStep {
  /** Human-readable label (already locale-resolved by the caller). */
  readonly label: string;
  /** Current state — drives which `[ ✓ | ⟳ |   | ✕ ]` marker is rendered. */
  readonly state: BootStepState;
}

/**
 * Options accepted by `showBootSplash`.
 *
 * - `steps`            — checklist rows in display order (caller picks the count;
 *                        Phase 4a UI-SPEC §Screen 1 lists 5 canonical steps)
 * - `protocolVersion`  — render in the trailing protocol line (e.g., `"1.0"`)
 * - `panelsAvailable`  — count of panel plugins declared by the bridge
 * - `containerName`    — text container to upgrade; defaults to `'header'`
 */
export interface BootSplashOptions {
  readonly steps: ReadonlyArray<BootStep>;
  readonly protocolVersion: string;
  readonly panelsAvailable: number;
  readonly containerName?: string;
}

/** Map state → UI-SPEC §Screen 1 state-table marker. */
function marker(state: BootStepState): string {
  switch (state) {
    case 'done':
      return '[ ✓ ]';
    case 'in_progress':
      return '[ ⟳ ]';
    case 'failed':
      return '[ ✕ ]';
    default:
      return '[   ]';
  }
}

/**
 * Render the boot-splash checklist on the G2 boot page.
 *
 * Sequential semantics:
 *   1. For each step (in order), assemble the cumulative checklist string
 *      and upgrade the target text container. This produces the visible
 *      "step-by-step advancing" boot animation per UI-SPEC §Screen 1.
 *   2. After the final step, upgrade the same container once more with
 *      the protocol-line content `protocol {V} · panels available: {N}`.
 *
 * Total `bridge.textContainerUpgrade` calls = `steps.length + 1`.
 *
 * On any bridge rejection the error propagates to the caller (no swallow).
 * Phase 4b will wire boot-error UI (BOOT-01) around this function.
 */
export async function showBootSplash(
  bridge: EvenAppBridge,
  opts: BootSplashOptions,
): Promise<void> {
  const containerName = opts.containerName ?? 'header';

  // Render each step cumulatively: at step i, all steps[0..i] are visible
  // and the i-th one carries its `state` marker. Earlier steps keep their
  // declared `state` (the caller has already advanced them).
  for (let i = 0; i < opts.steps.length; i++) {
    const visible = opts.steps.slice(0, i + 1);
    const lines = visible.map((s) => `${marker(s.state)} ${s.label}`);
    const content = lines.join('\n');
    const payload = new TextContainerUpgrade({ containerName, content });
    await bridge.textContainerUpgrade(payload);
  }

  // Final protocol line — single textContainerUpgrade.
  const protoLine = `protocol ${opts.protocolVersion} · panels available: ${opts.panelsAvailable}`;
  const finalPayload = new TextContainerUpgrade({ containerName, content: protoLine });
  await bridge.textContainerUpgrade(finalPayload);
}
