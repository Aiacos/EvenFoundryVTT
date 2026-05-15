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
import type { ToastQueueLayer } from '../status-hud/toast-queue-layer.js';
import type { LayerManager } from './layer-manager.js';
import type { OverlayPanel } from './layer-types.js';
import { ZIndex } from './layer-types.js';
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
 *   - `navKey`       — single-character Quick Action menu key (e.g. `'S'` for Sheet).
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
  navKey: z.string().length(1),
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
  readonly toastQueue?: ToastQueueLayer;
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

        const parseResult = PanelMetaSchema.safeParse((Cls as { meta?: unknown }).meta);
        if (!parseResult.success) {
          console.warn(
            `[PanelRouter] panel ${path} excluded: invalid meta — ${parseResult.error.message}`,
          );
          continue;
        }

        const meta = parseResult.data;
        this.registry.set(meta.id, { meta, Cls });
      } catch (err) {
        console.warn(`[PanelRouter] panel ${path} excluded: load error`, err);
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
