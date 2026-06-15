/**
 * Boot-engine idle render regression tests (quick-260605-f9s Task 2).
 *
 * Tests the `finalizeIdleRender` helper exported from boot-engine-core.ts.
 * This helper encapsulates the post-bundle step-13 sequence: it awaits
 * `idleInfill.draw()` under a rejection guard, then awaits `mapBase.draw()`
 * under a separate rejection guard. The ordering and resilience behaviour
 * must be correct so that:
 *
 *   - F9S-BOOT-01: both `idleInfill.draw` and `mapBase.draw` are called once.
 *   - F9S-BOOT-02: `idleInfill.draw` resolves before `mapBase.draw` is invoked
 *                  (correct post-bundle ordering — idle infill must paint after
 *                  the bundle's `rebuildPageContainer` flush, which clears z05 to
 *                  the SDK "Text" default).
 *   - F9S-BOOT-03: when `idleInfill.draw` rejects, `mapBase.draw` is STILL
 *                  called and the helper resolves without throwing (rejection-
 *                  guarded per T-etr-03 — an idle-infill failure MUST NOT abort
 *                  an already-booted engine).
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts (finalizeIdleRender)
 * @see .planning/quick/260605-f9s-g2-app-boot-call-idleinfill-draw-after-l/260605-f9s-PLAN.md Task 2
 */
import { describe, expect, it, vi } from 'vitest';
import { finalizeIdleRender } from '../internal/boot-engine-core.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/** Returns an object whose `draw` satisfies `() => Promise<void>` and is inspectable via vi. */
function makeLayer(drawImpl?: () => Promise<void>): { draw: () => Promise<void> } & {
  draw: ReturnType<typeof vi.fn>;
} {
  const fn = vi.fn().mockImplementation(drawImpl ?? (() => Promise.resolve()));
  return { draw: fn as unknown as () => Promise<void> } as ReturnType<typeof makeLayer>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('finalizeIdleRender — boot idle render helper (quick-260605-f9s)', () => {
  // F9S-BOOT-01: both draw()s are called once
  it('F9S-BOOT-01: idleInfill.draw and mapBase.draw are each called exactly once', async () => {
    const idleInfill = makeLayer();
    const mapBase = makeLayer();

    await finalizeIdleRender(idleInfill, mapBase);

    expect(idleInfill.draw).toHaveBeenCalledOnce();
    expect(mapBase.draw).toHaveBeenCalledOnce();
  });

  // F9S-BOOT-02: idleInfill.draw resolves before mapBase.draw is invoked
  it('F9S-BOOT-02: idleInfill.draw resolves before mapBase.draw is invoked (ordering)', async () => {
    const callOrder: string[] = [];

    const idleInfill = makeLayer(async () => {
      callOrder.push('idleInfill.draw:start');
      await Promise.resolve(); // simulate async work
      callOrder.push('idleInfill.draw:end');
    });
    const mapBase = makeLayer(async () => {
      callOrder.push('mapBase.draw:start');
    });

    await finalizeIdleRender(idleInfill, mapBase);

    // idleInfill.draw must complete before mapBase.draw starts
    expect(callOrder).toEqual([
      'idleInfill.draw:start',
      'idleInfill.draw:end',
      'mapBase.draw:start',
    ]);
  });

  // F9S-BOOT-03: when idleInfill.draw rejects, mapBase.draw is STILL called; helper resolves
  it('F9S-BOOT-03: idleInfill.draw rejection does not prevent mapBase.draw; helper resolves', async () => {
    const idleInfill = makeLayer(async () => {
      throw new Error('idle-infill draw failure');
    });
    const mapBase = makeLayer();

    // Helper must resolve (not throw), even when idleInfill.draw rejects
    await expect(finalizeIdleRender(idleInfill, mapBase)).resolves.toBeUndefined();

    // mapBase.draw must still be called
    expect(mapBase.draw).toHaveBeenCalledOnce();
  });
});
