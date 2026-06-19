/**
 * bearer-registry-reader — Foundry bearer registry reader for bridge push.
 *
 * Quick Task 260604-eyf — wire push-based bearer-registry path for real pairing.
 *
 * Reads `listBearers()` from the pair/bearer-registry module at boot (`ready`
 * hook) and emits an `r1.bearers.available` envelope via the injected `emit`
 * callback (wired to `bridgeDeltaEmitter` in module.ts). Re-emits after
 * bearer generate / revoke / rotation events (called from module.ts at the
 * existing emit spots).
 *
 * ## Architecture (push-based)
 *
 * Push: foundry-module emits → bridge cache (POST /internal/delta) → bridge
 * validates bearer tokens from cache without a socketlib roundtrip.
 *
 * ## socketlib invariant
 *
 * NO new `socket.register(name, fn)` call. Emission uses the existing
 * `bridgeDeltaEmitter` channel. Count remains **17** (Phase 13 invariant).
 * See also module.ts file-level note on the socketlib handler count.
 *
 * ## Fault tolerance
 *
 * All errors in the reader are swallowed with `console.warn`. A reader failure
 * MUST NEVER crash the Foundry session or interrupt the hook chain.
 *
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts (schema)
 * @see packages/bridge/src/cache/bearer-registry-cache.ts (bridge cache)
 * @see packages/bridge/src/ws/bearer-registry-handler.ts (bridge handler)
 * @see packages/foundry-module/src/pair/bearer-registry.ts (listBearers source)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 2
 */

import type { BearerRegistrySnapshot } from '@evf/shared-protocol';
import { R1_BEARERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { authorizedActorIdsForUser } from '../pair/actor-authorization.js';
import { listBearers } from '../pair/bearer-registry.js';

// ─── readBearerRegistry ────────────────────────────────────────────────────────

/**
 * Read all non-revoked, non-expired bearers from the Foundry bearer registry
 * and return a BearerRegistrySnapshot.
 *
 * Uses `listBearers()` which already filters out revoked entries (revokedAt !==
 * null). This function additionally filters expired entries
 * (expiresAt <= Date.now()) before building the snapshot so the bridge cache
 * only ever contains valid (or almost-valid) tokens.
 *
 * On any throw → returns an empty snapshot with source 'foundry-registry' and
 * a console.warn (never throws; reader failure MUST NOT crash Foundry).
 *
 * @returns BearerRegistrySnapshot with all non-revoked, non-expired bearers.
 */
export function readBearerRegistry(): BearerRegistrySnapshot {
  try {
    const now = Date.now();
    // listBearers() returns non-revoked entries (revokedAt === null), newest-first.
    const rawBearers = listBearers();

    // Filter expired entries — only push tokens that are still valid.
    const bearers = rawBearers
      .filter((entry) => entry.expiresAt > now)
      .map((entry) => ({
        token: entry.token,
        alias: entry.alias,
        expiresAt: entry.expiresAt,
        worldId: entry.worldId,
        // ADR-0014: carry the bound Foundry User id so the bridge can derive the
        // bearer's authorized actor set. Required by BearerRegistryEntrySchema.
        userId: entry.userId,
        // ADR-0014 §3: compute the live owned-actor set Foundry-side and ship it
        // with the pushed snapshot so the bridge's CACHED (no-socketlib) validate
        // path can enforce per-actor read authorization. Fail-closed: an unknown
        // user / iteration error yields [] (authorizes nothing).
        authorizedActorIds: authorizedActorIdsForUser(entry.userId),
      }));

    return {
      bearers,
      source: 'foundry-registry',
      count: bearers.length,
      generatedAt: Date.now(),
    };
  } catch (err) {
    // Defensive: swallow all errors — reader failure must not crash Foundry
    // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
    console.warn('[EVF bearer-registry-reader] readBearerRegistry threw:', err);
    return {
      bearers: [],
      source: 'foundry-registry',
      count: 0,
      generatedAt: Date.now(),
    };
  }
}

// ─── registerBearerRegistryReader ─────────────────────────────────────────────

/**
 * Result object returned by {@link registerBearerRegistryReader}.
 *
 * - `unsubscribe` — tears down any pending debounce timers.
 * - `reEmit`      — re-reads and re-pushes the bearer registry snapshot
 *                   immediately (without debounce). Call this from module.ts
 *                   after bearer generate/revoke/rotate events.
 */
export interface BearerRegistryReaderHandle {
  /** Tear down pending debounce timers. */
  unsubscribe: () => void;
  /**
   * Re-read and re-push the current bearer registry snapshot immediately.
   *
   * Used by `module.ts` after bearer generate/revoke/rotate events so the
   * bridge cache stays current without a socketlib roundtrip. Errors are
   * swallowed with console.warn (never throws).
   */
  reEmit: () => void;
}

/**
 * Register the bearer-registry reader and emit the initial snapshot.
 *
 * Called by `module.ts` in `Hooks.once('ready', ...)` so the bearer registry
 * is pushed to the bridge as soon as Foundry settings (world scope) are loaded.
 *
 * Emits the initial snapshot immediately. Bearer change re-emit is triggered
 * from `module.ts` by calling the returned `handle.reEmit()` after bearer
 * generate/revoke/rotate events (same "inject the callback" pattern as
 * `setMultiAttackProgressEmitter`).
 *
 * Both handlers catch all exceptions internally — a reader failure MUST NEVER
 * crash the Foundry session or interrupt the hook chain.
 *
 * @param emit - Callback to emit the payload via bridgeDeltaEmitter.
 *               Signature: `(type: string, payload: unknown) => void`.
 * @returns {@link BearerRegistryReaderHandle} with `unsubscribe` + `reEmit`.
 */
export function registerBearerRegistryReader(
  emit: (type: string, payload: unknown) => void,
): BearerRegistryReaderHandle {
  /** Emit the current bearer registry snapshot. */
  function emitSnapshot(): void {
    try {
      const payload = readBearerRegistry();
      emit(R1_BEARERS_AVAILABLE_TYPE, payload);
    } catch (err) {
      console.warn('[EVF bearer-registry-reader] emitSnapshot threw:', err);
    }
  }

  // Initial emit — immediately push the current registry to the bridge cache.
  emitSnapshot();

  // Debounce state (bearer changes are triggered externally from module.ts via
  // the returned handle.reEmit; this is kept for future use).
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function unsubscribe(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  return {
    unsubscribe,
    reEmit: emitSnapshot,
  };
}
