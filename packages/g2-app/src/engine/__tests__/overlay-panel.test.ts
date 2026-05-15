/**
 * Unit tests for `isOverlayPanel` runtime type guard (Phase 4b Plan 01 Task 1).
 *
 * Covers OP-1..OP-3 from 04B-01-PLAN.md `<behavior>` block:
 *   - OP-1: guard returns true for an object that has id/draw/destroy/onMount/
 *           onUnmount/onEvent (all functions where appropriate)
 *   - OP-2: guard returns false when ANY of onMount/onUnmount/onEvent is missing
 *           (3 separate cases)
 *   - OP-3: guard narrows the type — calling `layer.onMount()` inside the
 *           `if (isOverlayPanel(layer))` branch compiles without an explicit
 *           cast. The runtime body is a no-op assertion; the load-bearing
 *           proof is `pnpm typecheck` accepting the narrow.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-01-PLAN.md Task 1
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 2
 */
import { describe, expect, it, vi } from 'vitest';
import type { Layer, OverlayPanel, R1Gesture } from '../layer-types.js';
import { isOverlayPanel } from '../overlay-panel.js';

/** Build a fully-formed OverlayPanel stub (passes the guard). */
function makeOverlayPanelStub(id = 'panel'): OverlayPanel {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
  };
}

/** Build a bare Layer stub (no panel-lifecycle methods). */
function makeBareLayerStub(id = 'bare'): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };
}

describe('isOverlayPanel — runtime type guard', () => {
  it('OP-1: returns true for an object satisfying the full OverlayPanel shape', () => {
    const panel = makeOverlayPanelStub();
    expect(isOverlayPanel(panel)).toBe(true);
  });

  it('OP-2a: returns false when onMount is missing', () => {
    const full = makeOverlayPanelStub();
    const { onMount: _drop, ...partial } = full;
    expect(isOverlayPanel(partial as unknown as Layer)).toBe(false);
  });

  it('OP-2b: returns false when onUnmount is missing', () => {
    const full = makeOverlayPanelStub();
    const { onUnmount: _drop, ...partial } = full;
    expect(isOverlayPanel(partial as unknown as Layer)).toBe(false);
  });

  it('OP-2c: returns false when onEvent is missing', () => {
    const full = makeOverlayPanelStub();
    const { onEvent: _drop, ...partial } = full;
    expect(isOverlayPanel(partial as unknown as Layer)).toBe(false);
  });

  it('OP-2d: returns false for a bare Layer with none of the lifecycle methods', () => {
    expect(isOverlayPanel(makeBareLayerStub())).toBe(false);
  });

  it('OP-3: guard narrows the type so layer.onMount/onEvent compile without cast', async () => {
    // Type-narrowing proof: the load-bearing assertion is `pnpm typecheck`
    // accepting this branch without `(layer as OverlayPanel)`. Runtime body
    // exercises the narrowed methods to keep the test meaningful at vitest
    // time as well.
    const layer: Layer = makeOverlayPanelStub('narrow');
    if (isOverlayPanel(layer)) {
      await layer.onMount();
      layer.onEvent({ kind: 'tap' } satisfies R1Gesture);
      await layer.onUnmount();
      expect((layer.onMount as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect((layer.onUnmount as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect((layer.onEvent as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    } else {
      throw new Error('expected OverlayPanel narrow to succeed');
    }
  });
});
