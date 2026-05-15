/**
 * Runtime type guard for the `OverlayPanel` interface contract.
 *
 * No abstract base class for panels (matches Phase 4a's `Layer` /
 * `getCaptureContainer` optionality pattern). Phase 5 panels implement
 * `OverlayPanel` directly; LayerManager.bundle() calls `isOverlayPanel(layer)`
 * to decide whether to invoke `onMount` / `onUnmount` lifecycle hooks. Ordinary
 * `Layer` implementations (MapBaseLayer, StatusHudLayer, IdleInfillLayer,
 * ToastQueueLayer) return `false` and are unaffected.
 *
 * Duck-typed: checks for the three function-valued members `onMount`,
 * `onUnmount`, `onEvent`. Acceptable because the panel contract is internal
 * (no third-party panels in MVP — T-4b-01-05 dispositioned `accept` in the
 * Plan 01 threat register).
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 1
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
 */

import type { Layer, OverlayPanel } from './layer-types.js';

/**
 * Type predicate distinguishing `OverlayPanel` from a plain `Layer`.
 *
 * Returns `true` iff the candidate has all three panel-lifecycle methods as
 * `function` values. The type predicate `layer is OverlayPanel` is the
 * load-bearing return — callers narrow the variable in the `if` branch
 * without an explicit cast.
 *
 * Implementation note: the cast through `Partial<OverlayPanel>` is local to
 * this guard and never escapes — the predicate fences the unsafe access.
 *
 * @param layer Any `Layer` instance (panel or non-panel)
 * @returns `true` when `layer` satisfies the full `OverlayPanel` shape
 */
export function isOverlayPanel(layer: Layer): layer is OverlayPanel {
  const candidate = layer as Partial<OverlayPanel>;
  return (
    typeof candidate.onMount === 'function' &&
    typeof candidate.onUnmount === 'function' &&
    typeof candidate.onEvent === 'function'
  );
}
