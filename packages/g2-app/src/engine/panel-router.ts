/// <reference types="vite/client" />
/**
 * PanelRouter — discovery, mount/unmount orchestration, and capability gating
 * for the Phase 5 Panel Plugin System.
 *
 * Design rationale: @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 *
 * Key contracts (CONTEXT.md §Area 1 + §Area 7):
 *   - **Discovery** — `import.meta.glob('../panels/**\/*-panel.ts', { eager: false })`
 *     provides a Vite build-time static module map. `discoverPanels()` iterates the
 *     map, validates each default export's `static meta` against `PanelMetaSchema`,
 *     and silently excludes invalid entries with `console.warn`. Boot never fails
 *     due to a single malformed panel — surviving panels remain available.
 *   - **Single-active invariant** — only one z=2 overlay panel may be mounted at a
 *     time. `openPanel()` closes the current active panel first if any is mounted.
 *   - **Capability gate** — `PanelMeta.requiredCaps` is checked against
 *     `PanelDeps.negotiatedCaps` at `openPanel()` time. Missing cap → toast via
 *     `PanelDeps.toastQueue?.enqueue(...)` + early return (no mount). The toast key
 *     `panel_cap_denied_template` is defined in i18n-budgets.ts Phase 5 extension.
 *   - **LayerManager ownership** — panels NEVER call `LayerManager.bundle` directly.
 *     The router owns ALL z=2 bundle calls (CONTEXT.md §Area 1 anti-pattern rule).
 *
 * LayerManager caching: `PanelRouter` caches the LayerManager from the first
 * `openPanel` call via `PanelDeps`. This keeps `closeActivePanel()` dependency-free
 * after first mount — see `_cachedLayerManager` field and JSDoc.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md §Area 1 + §Area 7
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 1
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1 (z=2 lifecycle)
 * @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { z } from 'zod';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { ToastSink } from '../status-hud/toast-types.js';
import type { LayerManager } from './layer-manager.js';
import type { OverlayPanel } from './layer-types.js';
import { ZIndex } from './layer-types.js';
import { isOverlayPanel } from './overlay-panel.js';
import type { PanelGestureBus } from './panel-gesture-bus.js';

// ─── PanelMeta contract ───────────────────────────────────────────────────────

/**
 * Zod schema for `static meta` on every panel class.
 *
 * Validated at `discoverPanels()` time via `PanelMetaSchema.safeParse(Cls.meta)`.
 * Invalid meta → silent exclusion with `console.warn` (T-05-01-01 mitigation).
 *
 * Field constraints:
 *   - `id`           — stable kebab-case identifier used for routing; min 1 char.
 *   - `title`        — localised panel title (IT + EN required; DE optional).
 *   - `navKey`       — Single-character Quick Action menu key (e.g. `'S'` for Sheet).
 *                      Empty string `''` is reserved for system overlays opened directly
 *                      via `pushOverlay()` (e.g. QuickActionMenuPanel) — these are filtered
 *                      out of `discoverPanels()` registry so they never appear in the
 *                      user-navigable nav set. `max(1)` accepts both single-char and empty.
 *   - `requiredCaps` — server capability names checked against negotiated caps;
 *                      absent = no caps required (all Phase 5 panels use `[]`).
 *   - `defaultTab`   — optional initial tab for tabbed panels.
 */
export const PanelMetaSchema = z.object({
  id: z.string().min(1),
  title: z.object({
    it: z.string(),
    en: z.string(),
    de: z.string().optional(),
  }),
  navKey: z.string().max(1),
  requiredCaps: z.array(z.string()).optional(),
  defaultTab: z.string().optional(),
});

/** Inferred static meta type for panel classes. */
export type PanelMeta = z.infer<typeof PanelMetaSchema>;

// ─── PanelConstructor ─────────────────────────────────────────────────────────

/**
 * Constructor type for auto-discovered panel classes.
 *
 * The `static meta?: unknown` field is typed as `unknown` at the glob boundary
 * (RESEARCH.md Pitfall 1 mitigation — `static meta` lives on the constructor
 * function, not the instance; we read it as `(Cls as { meta?: unknown }).meta`
 * and validate via `PanelMetaSchema.safeParse` before trusting it).
 *
 * Constructor signature matches the ConcentrationDropModalPanel exemplar:
 * `new(bridge, gestureBus, locale)`. Phase 5 panels use the same 3-arg shape
 * for consistency (additional dependencies are accessed via deps or closures).
 */
export type PanelConstructor = {
  new (bridge: EvenAppBridge, gestureBus: PanelGestureBus, locale: HudLocale): OverlayPanel;
  meta?: unknown;
};

// ─── PanelDeps ────────────────────────────────────────────────────────────────

/**
 * Runtime dependencies injected by the router when mounting a panel.
 *
 * `toastQueue` is optional — when absent the cap-denied path logs to
 * `console.warn` instead of enqueuing a toast (defensive for early-boot
 * scenarios where the toast layer may not be mounted yet).
 *
 * `negotiatedCaps` is a `ReadonlySet<string>` (not `ReadonlySet<ServerCap>`)
 * to avoid a cross-package type coupling at the router layer — the panel router
 * validates string membership, not the exact ServerCap union. The handshake
 * module owns the type-level cap narrowing.
 */
export interface PanelDeps {
  /** Even Hub bridge handle (passed verbatim to panel constructor). */
  readonly bridge: EvenAppBridge;
  /** In-process gesture pub/sub (passed verbatim to panel constructor). */
  readonly gestureBus: PanelGestureBus;
  /** Active HUD locale (passed verbatim to panel constructor). */
  readonly locale: HudLocale;
  /** LayerManager singleton — router caches on first `openPanel` call. */
  readonly layerManager: LayerManager;
  /** Negotiated server capabilities (from capability handshake). */
  readonly negotiatedCaps: ReadonlySet<string>;
  /** Optional toast queue for user-facing cap-denied notifications. */
  readonly toastQueue?: ToastSink;
}

// ─── Registry entry ───────────────────────────────────────────────────────────

/** Internal registry entry — combines validated meta with the panel class. */
type RegistryEntry = {
  readonly meta: PanelMeta;
  readonly Cls: PanelConstructor;
};

// ─── PanelRouter ─────────────────────────────────────────────────────────────

/**
 * Central orchestrator for z=2 panel mount/unmount lifecycle.
 *
 * Construct once per app boot; call `discoverPanels()` during the boot sequence
 * before any gesture routing. After discovery, `openPanel(id, deps)` is the sole
 * entry point for mounting a panel.
 *
 * Thread model: single-threaded (browser main thread). All methods except
 * `discoverPanels()` and `openPanel()` are synchronous.
 *
 * @see ADR-0010 (docs/architecture/0010-panel-plugin-registry.md)
 */
export class PanelRouter {
  /**
   * Registry populated by `discoverPanels()`. Keyed by `PanelMeta.id`.
   * Read-only after discovery completes; never mutated at runtime.
   */
  private readonly registry = new Map<string, RegistryEntry>();

  /** Currently mounted panel instance; null when no overlay is open. */
  private activePanel: OverlayPanel | null = null;

  /** ID of the currently mounted panel; null when no overlay is open. */
  private activeId: string | null = null;

  /**
   * LayerManager reference cached on the first `openPanel` call.
   *
   * Caching avoids requiring `closeActivePanel()` callers to pass the LayerManager
   * again — it must be the same singleton across both calls, and the deps pattern
   * guarantees this (single app-boot deps object). `null` until first `openPanel`.
   *
   * Design choice documented here per the PLAN §Area 1 inline-document directive.
   */
  private _cachedLayerManager: LayerManager | null = null;

  /**
   * Overlay suspension stack for `pushOverlay` / `popOverlay`.
   *
   * When a z=2 panel is already mounted and `pushOverlay` is called, the existing
   * panel is suspended (its instance reference pushed here) and the new panel
   * atomically replaces it via a single `bundle([destroy, mount])` call.
   * `popOverlay` pops the stack and restores the suspended panel in a single
   * atomic bundle — JS reference semantics mean the panel's state fields survive
   * the `onUnmount → onMount` round-trip.
   *
   * Invariant: `overlayStack.length === 0` when no overlay is currently pushed
   * on top of a "primary" z=2 panel. The stack grows when menus are nested
   * (Phase 6+ does not nest menus in MVP, so max depth is 1).
   *
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3 (suspension semantics)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 3 (single atomic bundle)
   */
  private readonly overlayStack: OverlayPanel[] = [];

  /**
   * Discover and register all `*-panel.ts` modules in `../panels/**`.
   *
   * Uses Vite's `import.meta.glob` with `{ eager: false }` for lazy loading
   * (ADR-0010 Option C). Each discovered module is imported, its default export
   * is retrieved, and `PanelMetaSchema.safeParse((Cls as { meta?: unknown }).meta)`
   * validates the static meta. Invalid panels are silently excluded with
   * `console.warn`; import errors are caught and also excluded.
   *
   * Boot NEVER fails due to panel exclusions — surviving panels remain available.
   * Boot-error state `'panel_router_zero_panels'` is triggered only when the
   * registry ends up empty (catastrophic failure; no panels loaded at all).
   *
   * @see docs/architecture/0010-panel-plugin-registry.md §Decision Outcome
   */
  async discoverPanels(): Promise<void> {
    // Vite build-time static module map — types tell TS the default export
    // shape so the cast below is safe at the point of PanelMetaSchema.safeParse.
    const modules: Record<string, () => Promise<{ default: PanelConstructor }>> = import.meta.glob<{
      default: PanelConstructor;
    }>('../panels/**/*-panel.ts', {
      eager: false,
    });

    for (const [path, loader] of Object.entries(modules)) {
      try {
        const mod = await loader();
        const Cls = mod.default;

        // System overlays (QuickActionMenuPanel, ReactionPromptPanel, SlotPicker,
        // TargetPicker, TemplatePlacement) are constructed directly by their
        // dispatchers and exported BY NAME ONLY — no default export by design
        // (see target-picker-panel.ts header: "opened directly via pushOverlay").
        // Treat a missing default export as the expected system-overlay marker,
        // mirroring the empty-navKey silent skip below. Without this guard the
        // `Cls.meta` access throws and the panel is logged as a load error
        // (debug `canvas-sheet-overlay-wont-open`, 2026-06-09).
        if (Cls === undefined) {
          continue;
        }

        const parseResult = PanelMetaSchema.safeParse((Cls as { meta?: unknown }).meta);
        if (!parseResult.success) {
          console.warn(
            `[PanelRouter] panel ${path} excluded: invalid meta — ${parseResult.error.message}`,
          );
          continue;
        }

        const meta = parseResult.data;

        // Filter out system overlays (empty navKey) — they are opened directly via
        // `pushOverlay()` and must NOT appear in the user-navigable nav set.
        // Silent skip — no console.warn; this is expected exclusion, not malformed input.
        if (meta.navKey === '') {
          continue;
        }

        this.registry.set(meta.id, { meta, Cls });
      } catch (err) {
        // String(err) — a bare `console.warn(..., err)` serializes Error objects
        // as `{}` in the WebView console, hiding the actual failure reason
        // (cost a full debug session: canvas-sheet-overlay-wont-open, 2026-06-09).
        console.warn(`[PanelRouter] panel ${path} excluded: load error — ${String(err)}`);
      }
    }

    if (this.registry.size === 0) {
      console.warn('[PanelRouter] no panels registered after discovery — boot-error state');
    }
  }

  /**
   * Open a panel by ID, enforcing the capability gate and single-active invariant.
   *
   * Steps:
   * 1. Registry lookup — unknown IDs emit `console.warn` and return early.
   * 2. Capability gate — any `meta.requiredCaps` entry missing from
   *    `deps.negotiatedCaps` triggers a toast (if available) and returns early.
   * 3. Single-active invariant — closes the current active panel first (if any).
   * 4. Construct and mount the new panel via `deps.layerManager.bundle()`.
   * 5. Store `activePanel` + `activeId`; cache `layerManager`.
   *
   * @param id   The panel's `PanelMeta.id` (e.g. `'character-sheet'`)
   * @param deps Runtime dependencies for construction + cap validation
   */
  async openPanel(id: string, deps: PanelDeps): Promise<void> {
    // Cache the LayerManager from the first call (construction-cached pattern).
    this._cachedLayerManager = deps.layerManager;

    // Step 1 — Registry lookup.
    const entry = this.registry.get(id);
    if (entry === undefined) {
      console.warn(`[PanelRouter] openPanel: panel '${id}' not in registry`);
      return;
    }

    // Step 2 — Capability gate.
    const requiredCaps = entry.meta.requiredCaps ?? [];
    for (const cap of requiredCaps) {
      if (!deps.negotiatedCaps.has(cap)) {
        const msg = `[PanelRouter] panel '${id}' requires cap '${cap}' — not in negotiated set`;
        console.warn(msg);
        if (deps.toastQueue !== undefined) {
          deps.toastQueue.enqueue({
            id: `panel-cap-denied-${id}-${cap}`,
            message: `${entry.meta.title.en} requires ${cap} — unavailable`,
            severity: 'warn',
            emittedAt: Date.now(),
          });
        }
        return;
      }
    }

    // Step 3 — Single-active invariant: close current panel first.
    if (this.activePanel !== null) {
      await this._closeActiveInternal(deps.layerManager);
    }

    // Step 4 — Construct and mount the new panel.
    const panel = new entry.Cls(deps.bridge, deps.gestureBus, deps.locale);

    // Step 4a — Post-construction injection (Plan 08-05): fire registered handler if any.
    // This injects setActionOptionsHandler / setQuickActionHandler before onMount runs
    // (the handler is registered at boot time via setPanelInstanceHandler).
    const instanceHandler = this._instanceHandlers.get(id);
    if (instanceHandler !== undefined) {
      instanceHandler(panel);
    }

    await deps.layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);

    // Step 5 — Record active state.
    this.activePanel = panel;
    this.activeId = id;
  }

  /**
   * Close the currently active panel (if any).
   *
   * Issues a `{ type:'destroy', z:Z2_OVERLAY }` bundle op via the cached
   * LayerManager (ADR-0009 Amendment 1 differential demolish auto-handles the
   * z=0.5 reinstatement). Idempotent when no panel is active.
   *
   * @throws If called before any `openPanel()` (LayerManager not cached yet).
   *         Callers are responsible for calling `closeActivePanel` only after
   *         at least one successful `openPanel` invocation.
   */
  async closeActivePanel(): Promise<void> {
    if (this.activePanel === null) {
      return; // Idempotent no-op.
    }

    const lm = this._cachedLayerManager;
    if (lm === null) {
      console.warn('[PanelRouter] closeActivePanel: LayerManager not cached — no-op');
      return;
    }

    await this._closeActiveInternal(lm);
  }

  /**
   * Internal close helper shared by `closeActivePanel` and the single-active
   * invariant inside `openPanel`.
   *
   * Passes the destroy bundle to `layerManager`, then nulls `activePanel` +
   * `activeId`. The LayerManager's `bundle()` invokes `onUnmount()` on the
   * outgoing OverlayPanel (ADR-0009 Amendment 1 lifecycle).
   */
  private async _closeActiveInternal(layerManager: LayerManager): Promise<void> {
    await layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    this.activePanel = null;
    this.activeId = null;
  }

  /**
   * Push an overlay panel on top of whatever is currently mounted at z=2.
   *
   * **Suspension semantics (RESEARCH §Q3):** if a panel is currently at z=2, its
   * instance is pushed onto `overlayStack` (JS reference — GC will NOT reclaim it).
   * The instance's in-memory state (activeIndex, mode, etc.) is fully preserved
   * through the `onUnmount → onMount` round-trip when `popOverlay` restores it.
   *
   * **Single atomic bundle (RESEARCH Pitfall 3):** both the destroy of the current
   * panel AND the mount of `panel` are batched into ONE `layerManager.bundle()` call.
   * This eliminates the intermediate frame where z=2 is empty (visible flicker).
   *
   * If no panel is currently at z=2, a single-op `[{type:'mount', z:2, layer:panel}]`
   * bundle is issued — nothing to suspend, nothing to destroy.
   *
   * @param panel        The overlay panel to mount at z=2 (typically QuickActionMenuPanel)
   * @param layerManager LayerManager singleton — also cached as `_cachedLayerManager`
   *
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 3
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
   */
  async pushOverlay(panel: OverlayPanel, layerManager: LayerManager): Promise<void> {
    this._cachedLayerManager = layerManager;

    const current = layerManager.getLayer(ZIndex.Z2_OVERLAY);

    if (current !== undefined && isOverlayPanel(current)) {
      // Suspend the current panel — preserve its instance on the stack.
      this.overlayStack.push(current as OverlayPanel);
      // Single atomic bundle: destroy current + mount new (RESEARCH Pitfall 3).
      await layerManager.bundle([
        { type: 'destroy', z: ZIndex.Z2_OVERLAY },
        { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel },
      ]);
    } else {
      // Nothing at z=2 — simple single-op mount.
      await layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    }

    this.activePanel = panel;
    this.activeId = panel.id;
  }

  /**
   * Pop the top overlay panel, restoring the previously suspended panel if any.
   *
   * **Defensive guard (RESEARCH Pitfall 4):** if no panel is currently mounted at
   * z=2, the call is a no-op with a `console.warn` telemetry entry. The guard
   * prevents double-pops from corrupting the stack.
   *
   * **Restore path:** if `overlayStack` is non-empty, the suspended panel is popped
   * and remounted in a single atomic `[destroy, mount]` bundle. Its in-memory state
   * is fully preserved (JS reference semantics per RESEARCH §Q3).
   *
   * **Empty-stack path:** if `overlayStack` is empty, only a `[destroy]` bundle is
   * issued. The LayerManager's differential demolish rule (ADR-0009 Amendment 1)
   * automatically reinstates the z=0.5 `IdleInfillLayer` in the same flush.
   *
   * @param layerManager LayerManager singleton
   *
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 4 (empty-stack guard)
   * @see docs/architecture/0009-layer-manager-contract.md Amendment 1 (differential demolish)
   */
  async popOverlay(layerManager: LayerManager): Promise<void> {
    const current = layerManager.getLayer(ZIndex.Z2_OVERLAY);

    if (current === undefined) {
      // Defensive guard — nothing at z=2, so pop is a no-op.
      console.warn('[PanelRouter] popOverlay: no z=2 mounted — idempotent no-op');
      return;
    }

    const restored = this.overlayStack.pop(); // undefined on empty stack

    if (restored !== undefined) {
      // Restore the suspended panel atomically (RESEARCH §Q3 + Pitfall 3).
      await layerManager.bundle([
        { type: 'destroy', z: ZIndex.Z2_OVERLAY },
        { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: restored },
      ]);
      this.activePanel = restored;
      this.activeId = restored.id;
    } else {
      // Empty stack — destroy only; differential demolish auto-restores z=0.5
      // (ADR-0009 Amendment 1).
      await layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
      this.activePanel = null;
      this.activeId = null;
    }
  }

  /**
   * Clear the overlay suspension stack without restoring any suspended panel.
   *
   * Called by `onNavigate` in `boot-engine-core.ts` before `openPanel` when the
   * user selects a navigation item from the Quick Action menu. The menu was pushed
   * via `pushOverlay`, so the primary panel (if any) lives in `overlayStack`. We
   * must discard that entry before `openPanel` takes over z=2 — otherwise a
   * subsequent `popOverlay` call (e.g. from a re-opened menu) would erroneously
   * restore the pre-menu panel on top of the freshly navigated target.
   *
   * This is safe because `openPanel` already calls `_closeActiveInternal` which
   * destroys the current z=2 occupant (the menu). The suspended panels in
   * `overlayStack` are simply abandoned — their `onUnmount` was already called
   * when they were suspended, so no cleanup callback is needed here.
   *
   * @see CR-01 fix — Phase 6 REVIEW.md
   * @see packages/g2-app/src/internal/boot-engine-core.ts onNavigate callback (step 11c)
   */
  clearOverlayStack(): void {
    this.overlayStack.length = 0;
  }

  /**
   * Post-construction injection registry (Plan 08-05 step 11g/11i).
   *
   * Maps panel IDs to callbacks invoked immediately after each panel is constructed
   * in `openPanel()` (before `onMount`). Boot-engine registers handlers here to
   * inject `setActionOptionsHandler` and `setQuickActionHandler` without threading
   * them through the 3-arg `PanelConstructor` signature.
   *
   * Design: the handler receives the freshly-constructed panel instance typed as
   * `OverlayPanel`. The caller down-casts to the appropriate panel type.
   *
   * @internal Registered at boot time (before first `openPanel` call). Cleared on
   * teardown by the boot orchestrator discarding the PanelRouter instance.
   */
  private readonly _instanceHandlers: Map<string, (panel: OverlayPanel) => void> = new Map();

  /**
   * Register a post-construction handler for a specific panel ID (Plan 08-05).
   *
   * Called at boot time to inject handlers (e.g. `setActionOptionsHandler`,
   * `setQuickActionHandler`) into panels that are constructed on-demand by
   * `openPanel()`. The handler fires once per `openPanel(id)` call, immediately
   * after the panel is constructed and before `onMount` runs.
   *
   * Registering a new handler for the same ID replaces the previous one
   * (last-wins — idempotent for repeated boot in tests).
   *
   * @param id       The panel ID to intercept (e.g. `'spellbook'`, `'combat-tracker'`)
   * @param handler  Callback receiving the freshly-constructed panel instance
   */
  setPanelInstanceHandler(id: string, handler: (panel: OverlayPanel) => void): void {
    this._instanceHandlers.set(id, handler);
  }

  /**
   * Test-only diagnostic: IDs for which a `setPanelInstanceHandler` was registered.
   *
   * Exposed for BERW-11/12 structural wiring assertions. Production code MUST NOT
   * gate behavior on this list.
   */
  getRegisteredHandlerIds(): string[] {
    return [...this._instanceHandlers.keys()];
  }

  /**
   * Test-only diagnostic: is the panel with the given ID currently mounted?
   *
   * Production code MUST NOT gate behavior on panel identity — the LayerManager
   * is the authority on what is mounted. This accessor exists for test assertions
   * (PRT-IS-OPEN) and log/telemetry affordances.
   */
  isPanelOpen(id: string): boolean {
    return this.activeId === id;
  }

  /**
   * Test-only diagnostic: number of registered panels.
   *
   * Exposed for PRT-DISC-04 and boot-error detection (zero = catastrophic failure).
   * Production code should use `discoverPanels()` + `openPanel()` exclusively.
   */
  getRegistrySize(): number {
    return this.registry.size;
  }
}
