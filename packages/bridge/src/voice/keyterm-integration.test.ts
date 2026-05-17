/**
 * End-to-end integration test — Phase 15 Plan 04 Task 3.
 *
 * Wires real EntityPackCache + real KeytermRefresher + real Deepgram adapter
 * (with a mock WS factory + silent logger) and exercises the full plan-15
 * data flow:
 *
 *   cache.set(payload)
 *     → onChange listener fires
 *       → debounce DEBOUNCE_MS coalesces bursts
 *         → adapter.refreshKeyterm() (invalidation signal)
 *           → next adapter.connect() picks up the new keyterms (lazy)
 *
 * Test IDs:
 *   - INT-01: end-to-end happy path — cache push + debounce + reconnect →
 *     URL contains the new entity-pack keyterm (VOICE-06 + 07 + 09 in one scenario)
 *   - INT-02: empty-cache one-shot warn — three connects without a push
 *     emit exactly one 'keyterm.empty-entity-cache' warn; a subsequent push
 *     resets the flag (no NEW warn) and the URL contains the new keyterms
 *   - INT-03: large entity-pack cap behaviour — 1000-entry push truncates
 *     at DEEPGRAM_KEYTERM_LIMIT; static spells preserved, entity-pack
 *     dropped first (CONTEXT D-04)
 *
 * @see ./keyterm-merger.ts (buildKeytermList; Plan 15-01)
 * @see ./deepgram-stt.ts (createDeepgramStt; Plans 15-02 + 15-04)
 * @see ./keyterm-refresher.ts (KeytermRefresher; Plan 15-03)
 * @see ../cache/entity-pack-cache.ts (EntityPackCache; Quick Task 260517-k2g)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-04-PLAN.md Task 3
 */

import {
  type AvailableEntitiesPayload,
  type EntityPackEntry,
  SPELL_KEYTERMS,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityPackCache } from '../cache/entity-pack-cache.js';
import { createDeepgramStt } from './deepgram-stt.js';
import { buildKeytermList, DEEPGRAM_KEYTERM_LIMIT } from './keyterm-merger.js';
import { DEBOUNCE_MS, KeytermRefresher } from './keyterm-refresher.js';

// NOTE on the cap interplay (CONTEXT D-04 + Plan 15-01 KM-09):
// SPELL_KEYTERMS contains 70 entries × 2 locales = 140 static candidates.
// The production cap is DEEPGRAM_KEYTERM_LIMIT = 100, so dynamic entity-pack
// entries are dropped first whenever the static fixture saturates the cap.
// INT-01 and INT-02 want to demonstrate the END-TO-END dynamic-keyterm flow,
// which would otherwise be invisible at the production cap. We use the
// merger's `limitOverride` to widen the cap for those two scenarios — the
// flow under test (cache.set → debounce → connect picks up new URL) is
// unchanged; only the cap value differs. INT-03 exercises the production
// cap exactly to verify the truncate-dynamic-first contract on its own.
const INT_WIDE_CAP = 300;

// ─── Mock WebSocket factory ───────────────────────────────────────────────────

interface MockWsInstance {
  url: string;
  options: unknown;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on(event: string, handler: (...args: unknown[]) => void): MockWsInstance;
  emit(event: string, ...args: unknown[]): void;
  readyState: number;
}

function createMockWsFactory(): {
  factory: (url: string, options: unknown) => MockWsInstance;
  instances: MockWsInstance[];
} {
  const instances: MockWsInstance[] = [];
  const factory = (url: string, options: unknown): MockWsInstance => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const instance: MockWsInstance = {
      url,
      options,
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
      on(event, handler) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
        return this;
      },
      emit(event, ...args) {
        for (const h of handlers[event] ?? []) {
          h(...args);
        }
      },
    };
    instances.push(instance);
    return instance;
  };
  return { factory, instances };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Parameters<typeof createDeepgramStt>[0]['logger'];
}

function makeEntry(name: string, id?: string): EntityPackEntry {
  return {
    id: id ?? `id-${name}`,
    packId: 'dnd5e.test',
    entityKind: 'item',
    entityType: 'weapon',
    name,
    nameLocalized: name,
  };
}

function makePayload(entries: EntityPackEntry[]): AvailableEntitiesPayload {
  return {
    entries,
    source: 'foundry-packs',
    count: entries.length,
    generatedAt: 1000,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Keyterm integration — end-to-end (INT-01..03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('INT-01: cache push → debounce → reconnect → URL contains new keyterm (VOICE-06 + 07 + 09)', () => {
    const { factory, instances } = createMockWsFactory();
    const logger = silentLogger();
    const cache = new EntityPackCache();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger,
      // Widen cap so the entity-pack entry is observable end-to-end (see INT_WIDE_CAP note above).
      keytermProvider: () => ({
        keyterms: buildKeytermList(SPELL_KEYTERMS, cache.get(), { limitOverride: INT_WIDE_CAP }),
        entityCachePresent: cache.get() !== null,
      }),
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    // Wire the refresher AFTER adapter is constructed (matches server.ts step 10b).
    const refresher = new KeytermRefresher({ cache, adapter, logger });

    // First connect: cache is cold → spells-only URL (140 keyterm= params at wide cap).
    adapter.connect('session-int-1a');
    expect(instances).toHaveLength(1);
    const firstUrl = instances[0]!.url;
    expect(firstUrl.match(/keyterm=/g)?.length).toBe(140); // 70 spells × 2 locales
    // Should NOT yet contain Lord Brankor.
    expect(firstUrl).not.toContain('Lord%20Brankor');

    // Push a small entity-pack and advance fake timers past DEBOUNCE_MS.
    const refreshInfoSpy = logger.info as unknown as ReturnType<typeof vi.fn>;
    refreshInfoSpy.mockClear();
    cache.set(makePayload([makeEntry('Lord Brankor')]));
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    // The refresher should have invoked the adapter; the structured
    // 'keyterm.refreshed' log event is the observable signal.
    const refreshed = refreshInfoSpy.mock.calls.find((call) => {
      const first = call[0] as { event?: string } | undefined;
      return first?.event === 'keyterm.refreshed';
    });
    expect(refreshed).toBeDefined();

    // Second connect: URL must contain the new Lord Brankor keyterm.
    adapter.connect('session-int-1b');
    expect(instances).toHaveLength(2);
    expect(instances[1]!.url).toContain('keyterm=Lord%20Brankor');

    refresher.dispose();
  });

  it('INT-02: empty-cache → 3 connects emit ONE warn; push transitions; warn flag preserved across cache returns', () => {
    const { factory, instances } = createMockWsFactory();
    const logger = silentLogger();
    const cache = new EntityPackCache();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger,
      // Widen cap so the entity-pack entry is observable end-to-end.
      keytermProvider: () => ({
        keyterms: buildKeytermList(SPELL_KEYTERMS, cache.get(), { limitOverride: INT_WIDE_CAP }),
        entityCachePresent: cache.get() !== null,
      }),
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });

    const warnSpy = logger.warn as unknown as ReturnType<typeof vi.fn>;
    function countEmptyCacheWarns(): number {
      return warnSpy.mock.calls.filter((call) => {
        const first = call[0] as { event?: string } | undefined;
        return first?.event === 'keyterm.empty-entity-cache';
      }).length;
    }

    // Three connects with cold cache — exactly one warn.
    adapter.connect('session-int-2a');
    adapter.connect('session-int-2b');
    adapter.connect('session-int-2c');
    expect(countEmptyCacheWarns()).toBe(1);

    // Push transitions cache from empty → present.
    cache.set(makePayload([makeEntry('Magic Sword')]));
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    // Connect with cache present — no new empty-cache warn.
    adapter.connect('session-int-2d');
    expect(countEmptyCacheWarns()).toBe(1);
    // URL contains the new keyterm.
    expect(instances[instances.length - 1]!.url).toContain('keyterm=Magic%20Sword');
  });

  it('INT-03: large entity-pack (1000 entries) caps at DEEPGRAM_KEYTERM_LIMIT; static spells preserved (CONTEXT D-04)', () => {
    const { factory, instances } = createMockWsFactory();
    const logger = silentLogger();
    const cache = new EntityPackCache();
    const adapter = createDeepgramStt({
      apiKey: 'sk-real',
      logger,
      keytermProvider: () => ({
        keyterms: buildKeytermList(SPELL_KEYTERMS, cache.get()),
        entityCachePresent: cache.get() !== null,
      }),
      _wsFactory: factory as unknown as (url: string, opts: unknown) => unknown,
    });
    const refresher = new KeytermRefresher({ cache, adapter, logger });

    // 1000 fabricated weapons, names "Weapon0" .. "Weapon999".
    const entries: EntityPackEntry[] = Array.from({ length: 1000 }, (_, i) =>
      makeEntry(`Weapon${i}`, `e${i}`),
    );
    cache.set(makePayload(entries));
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    adapter.connect('session-int-3');
    const url = instances[instances.length - 1]!.url;

    // Exactly DEEPGRAM_KEYTERM_LIMIT keyterm= occurrences.
    expect(url.match(/keyterm=/g)?.length).toBe(DEEPGRAM_KEYTERM_LIMIT);
    // Static spells preserved — the FIRST 50 SPELL_KEYTERMS entries (20 cantrips
    // + 30 L1) survive the cap (50 spells × 2 locales = 100 entries). 'shield'
    // is L1, position 43 within the first-50 window; 'acid splash' is cantrip 0.
    // (NOTE: spells beyond position 49, e.g. 'fireball' at L3, do NOT survive
    // the production cap — CONTEXT D-04 truncates static AFTER the first 100
    // candidates are filled, and entity-pack entries are truncated FIRST.)
    expect(url.toLowerCase()).toContain('keyterm=shield');
    expect(url.toLowerCase()).toContain('keyterm=acid%20splash');
    // Entity-pack truncated first — Weapon999 (at the tail) is dropped.
    expect(url).not.toContain('Weapon999');
    // Even Weapon0 doesn't fit: static spells saturate the cap entirely.
    expect(url).not.toContain('Weapon0');

    refresher.dispose();
  });
});
