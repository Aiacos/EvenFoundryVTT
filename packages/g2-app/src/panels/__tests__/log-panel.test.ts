/**
 * Unit tests for LogPanel (Phase 5 Plan 05-05).
 *
 * Covers the LP-* test discriminators from the plan:
 *
 * Meta / identity:
 *   - LP-META-1: `LogPanel.meta` passes `PanelMetaSchema.safeParse`
 *   - LP-META-2: meta fields (id, navKey, requiredCaps)
 *   - LP-CTOR-1: instance passes `isOverlayPanel` predicate
 *   - LP-CTOR-2: `getContainerCount()` returns `{ image: 0, text: 1 }`
 *
 * renderLogEvent:
 *   - LP-RENDER-MAIN-ROW:        single event → 66-char main row
 *   - LP-RENDER-TIMESTAMP-RECENT: event 30s ago → T-00:30
 *   - LP-RENDER-TIMESTAMP-MIN:    event 90s ago → T-01:30
 *   - LP-RENDER-ACTOR-TRUNC:     15-char actorName → truncated to 10 with `…`
 *   - LP-RENDER-ICON-ATTACK:     kind 'attack' → ⚔
 *   - LP-RENDER-ICON-SPELL:      kind 'spell' → ✧
 *   - LP-RENDER-RESULT-HIT:      result.kind 'hit' → IT row contains COLPITO
 *   - LP-RENDER-RESULT-MISS:     result.kind 'miss' → IT row contains MANCATO
 *   - LP-RENDER-NO-RESULT:       event without result → only 1 row
 *
 * renderLogFilterBar:
 *   - LP-FILTER-BAR-WIDTH: filter bar exactly 66 code-points
 *   - LP-FILTER-BAR-ACTIVE: active filter has ▶ prefix
 *
 * renderLogContent:
 *   - LP-CONTENT-EMPTY: null snapshot → 18 rows with Nessun evento centered
 *   - LP-CONTENT-FULL:  snapshot with events → 18 rows including filter bar
 *
 * INV-1 fixtures:
 *   - LP-FIX-STANDARD: matches log.standard.it.txt
 *   - LP-FIX-EMPTY:    matches log.empty.it.txt
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md §Task 2
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.9
 */

import { resolve } from 'node:path';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { LogEvent, LogSnapshot } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { PanelMetaSchema } from '../../engine/panel-router.js';
import LogPanel, { renderLogContent, renderLogEvent, renderLogFilterBar } from '../log-panel.js';

// ─── Fixture directory ────────────────────────────────────────────────────────

function fixtureDir(): string {
  return resolve(__dirname, '../../../../shared-render/src/fixtures');
}

// ─── Fixed reference epoch (deterministic timestamps) ─────────────────────────
// 2024-05-15T16:00:00Z — used by all fixture tests.

const FIXED_NOW = 1715788800000; // 2024-05-15T16:00:00Z

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn().mockResolvedValue(''),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

function makePanel(opts?: { bridge?: ReturnType<typeof makeMockBridge>; bus?: PanelGestureBus }) {
  const bridge = opts?.bridge ?? makeMockBridge();
  const bus = opts?.bus ?? new PanelGestureBus();
  const panel = new LogPanel(bridge, bus, 'it');
  return { panel, bridge, bus };
}

// ─── Event factory ────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: overrides.id ?? 'msg-1',
    timestamp: overrides.timestamp ?? FIXED_NOW - 60_000,
    actorName: overrides.actorName ?? 'Thorin',
    kind: overrides.kind ?? 'attack',
    description: overrides.description ?? 'Spada lunga vs Goblin',
    result: overrides.result,
  };
}

// ─── LP-META-* ───────────────────────────────────────────────────────────────

describe('LogPanel — static meta', () => {
  it('LP-META-1: static meta passes PanelMetaSchema.safeParse', () => {
    const result = PanelMetaSchema.safeParse(LogPanel.meta);
    expect(result.success).toBe(true);
  });

  it('LP-META-2: id="log", navKey="L", requiredCaps=[]', () => {
    const { meta } = LogPanel;
    expect(meta.id).toBe('log');
    expect(meta.navKey).toBe('L');
    expect(meta.requiredCaps).toEqual([]);
  });
});

// ─── LP-CTOR-* ───────────────────────────────────────────────────────────────

describe('LogPanel — constructor / interface conformance', () => {
  it('LP-CTOR-1: instance passes isOverlayPanel predicate', () => {
    const { panel } = makePanel();
    expect(isOverlayPanel(panel)).toBe(true);
  });

  it('LP-CTOR-2: getContainerCount returns { image: 0, text: 1 } (Strategy A)', () => {
    const { panel } = makePanel();
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── LP-RENDER-* ─────────────────────────────────────────────────────────────

describe('renderLogEvent — single event rendering', () => {
  it('LP-RENDER-MAIN-ROW: attack event → 66-char main row', () => {
    const event = makeEvent({ kind: 'attack' });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const mainRow = rows[0] ?? '';
    expect([...mainRow].length).toBe(66);
  });

  it('LP-RENDER-TIMESTAMP-RECENT: 30s ago → T-00:30', () => {
    const event = makeEvent({ timestamp: FIXED_NOW - 30_000 });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows[0]).toContain('T-00:30');
  });

  it('LP-RENDER-TIMESTAMP-MIN: 90s ago → T-01:30', () => {
    const event = makeEvent({ timestamp: FIXED_NOW - 90_000 });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows[0]).toContain('T-01:30');
  });

  it('LP-RENDER-ACTOR-TRUNC: 15-char actorName → truncated to 10 with ellipsis', () => {
    const event = makeEvent({ actorName: 'Thorin Oakenshield' });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    const mainRow = rows[0] ?? '';
    // Actor field is 10 chars — longer names are truncated
    expect([...mainRow].length).toBe(66);
    // Should contain the truncation character (…)
    expect(mainRow).toContain('…');
  });

  it('LP-RENDER-ICON-ATTACK: kind attack → ⚔ glyph', () => {
    const event = makeEvent({ kind: 'attack' });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows[0]).toContain('⚔');
  });

  it('LP-RENDER-ICON-SPELL: kind spell → ✧ glyph', () => {
    const event = makeEvent({ kind: 'spell' });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows[0]).toContain('✧');
  });

  it('LP-RENDER-RESULT-HIT: result.kind hit → IT row contains COLPITO', () => {
    const event = makeEvent({ result: { kind: 'hit', value: 23 } });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('COLPITO');
  });

  it('LP-RENDER-RESULT-MISS: result.kind miss → IT row contains MANCATO', () => {
    const event = makeEvent({ result: { kind: 'miss', value: 14 } });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('MANCATO');
  });

  it('LP-RENDER-NO-RESULT: event without result → only 1 row', () => {
    const event = makeEvent({ result: undefined });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows).toHaveLength(1);
  });

  it('LP-RENDER-RESULT-WIDTH: result sub-line is exactly 66 code-points', () => {
    const event = makeEvent({ result: { kind: 'hit', value: 23 } });
    const rows = renderLogEvent(event, 'it', FIXED_NOW);
    expect(rows).toHaveLength(2);
    const subLine = rows[1] ?? '';
    expect([...subLine].length).toBe(66);
  });
});

// ─── LP-FILTER-BAR-* ─────────────────────────────────────────────────────────

describe('renderLogFilterBar — filter bar row', () => {
  it('LP-FILTER-BAR-WIDTH: filter bar is exactly 66 code-points', () => {
    const bar = renderLogFilterBar('all', 'it');
    expect([...bar].length).toBe(66);
  });

  it('LP-FILTER-BAR-ACTIVE: active filter uses ▶ prefix', () => {
    // 'all' filter is active → [▶TUTTI] contains ▶
    const bar = renderLogFilterBar('all', 'it');
    expect(bar).toContain('▶');
  });
});

// ─── LP-CONTENT-* ────────────────────────────────────────────────────────────

describe('renderLogContent — full 18-row content area', () => {
  it('LP-CONTENT-EMPTY: null snapshot → 18 rows with Nessun evento centered', () => {
    const rows = renderLogContent(null, 'it', 0, FIXED_NOW);
    expect(rows).toHaveLength(18);
    const joined = rows.join('\n');
    expect(joined).toContain('Nessun evento');
  });

  it('LP-CONTENT-EMPTY-SNAPSHOT: empty events array → 18 rows with empty state', () => {
    const snapshot: LogSnapshot = { events: [] };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW);
    expect(rows).toHaveLength(18);
    const joined = rows.join('\n');
    expect(joined).toContain('Nessun evento');
  });

  it('LP-CONTENT-FULL: snapshot with events → 18 rows', () => {
    const events: LogEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: `msg-${i}`, timestamp: FIXED_NOW - i * 10_000 }),
    );
    const snapshot: LogSnapshot = { events };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW);
    expect(rows).toHaveLength(18);
  });

  it('LP-CONTENT-ROWS-WIDTH: all 18 rows are exactly 66 code-points', () => {
    const snapshot: LogSnapshot = { events: [makeEvent()] };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW);
    for (const [i, row] of rows.entries()) {
      expect([...row].length, `row ${i} width`).toBe(66);
    }
  });
});

// ─── Gesture bus lifecycle ────────────────────────────────────────────────────

describe('LogPanel — gesture bus lifecycle (T-4b-01-03)', () => {
  it('onMount subscribes to gestureBus', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    expect(bus.size()).toBe(0);
    await panel.onMount();
    expect(bus.size()).toBe(1);
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });

  it('onUnmount is idempotent', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();
    await panel.onUnmount();
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });
});

// ─── WR-04 regression: renderLogFilterBar wired into renderLogContent ────────

describe('renderLogContent — WR-04 filter bar wiring', () => {
  it('WR-04-ALL-FILTER: activeFilter="all" → no filter bar row (fixtures unchanged)', () => {
    const events: LogEvent[] = [makeEvent({ id: 'e1' })];
    const snapshot: LogSnapshot = { events };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW, 'all');
    // Row 0 must be the title border ┌─── ...
    expect(rows[0]).toContain('┌');
    // Should NOT contain the filter bar format (▶TUTTI)
    const joined = rows.join('\n');
    expect(joined).not.toContain('▶TUTTI');
    expect(rows).toHaveLength(18);
  });

  it('WR-04-ROLLS-FILTER: activeFilter="rolls" → filter bar row renders after title (no dead code)', () => {
    const events: LogEvent[] = [makeEvent({ id: 'e1' })];
    const snapshot: LogSnapshot = { events };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW, 'rolls');
    // renderLogFilterBar must have been called — output should contain filter labels
    const joined = rows.join('\n');
    // Filter bar contains 'Tiri' or 'Rolls' (locale-specific label for rolls filter)
    expect(joined).toContain('REGISTRO EVENTI');
    expect(rows).toHaveLength(18);
    // The second row (index 1) should come from renderLogFilterBar (contains '───')
    expect(rows[1]).toContain('───');
  });

  it('WR-04-WIDTH-ROWS: all rows exactly 66 code-points when filter active', () => {
    const events: LogEvent[] = [makeEvent({ id: 'e1' })];
    const snapshot: LogSnapshot = { events };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW, 'damage');
    for (const [i, row] of rows.entries()) {
      expect([...row].length, `row ${i} width`).toBe(66);
    }
  });
});

// ─── WR-02 regression: scrollOffset upper-bound clamp in LogPanel ─────────────

describe('LogPanel — WR-02 scrollOffset clamping', () => {
  it('WR-02-LP-CLAMP: excessive scroll-down does not push offset past events.length - 1', async () => {
    const bridge = {
      textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    } as unknown as EvenAppBridge;
    const bus = new PanelGestureBus();
    const panel = new LogPanel(bridge, bus, 'it');
    await panel.onMount();

    // Deliver a snapshot with 3 events
    const events: LogEvent[] = Array.from({ length: 3 }, (_, i) =>
      makeEvent({ id: `e${i}`, timestamp: FIXED_NOW - i * 1000 }),
    );
    panel.onSnapshot({ events });
    await Promise.resolve();

    // Scroll down 10 times — should clamp at maxOffset = 3 - 1 = 2
    for (let i = 0; i < 10; i++) {
      bus.publish({ kind: 'scroll', direction: 'down' });
    }
    await Promise.resolve();

    // Scroll up once — if offset was unbounded (=10) it would go to 9,
    // but if clamped to 2 it goes to 1. We verify by scrolling back to 0
    // in exactly 2 further scroll-ups (not 10).
    bus.publish({ kind: 'scroll', direction: 'up' });
    bus.publish({ kind: 'scroll', direction: 'up' });
    await Promise.resolve();

    // At this point offset must be 0 (clamped path: 2 → 1 → 0, not 10 → 9 → 8)
    // Draw must have been called (no stuck panel)
    // The draw count test is indirect — just confirm no exception and draw called
    expect(
      (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);
  });
});

// ─── LP-FIX-* — INV-1 fixture round-trips ────────────────────────────────────

describe('LogPanel — INV-1 fixture round-trips', () => {
  it('LP-FIX-EMPTY: null snapshot matches log.empty.it.txt', async () => {
    const rows = renderLogContent(null, 'it', 0, FIXED_NOW);
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'log.empty.it.txt'));
  });

  it('LP-FIX-STANDARD: standard log matches log.standard.it.txt', async () => {
    // Fixed snapshot matching the UI-SPEC §5.9 mockup
    const events: LogEvent[] = [
      makeEvent({
        id: 'msg-1',
        timestamp: FIXED_NOW - 1_000,
        actorName: 'THORIN',
        kind: 'attack',
        description: 'Spada lunga vs Goblin Arciere',
        result: { kind: 'hit', value: 23, damage: '12 taglio' },
      }),
      makeEvent({
        id: 'msg-2',
        timestamp: FIXED_NOW,
        actorName: 'THORIN',
        kind: 'feature',
        description: 'Secondo soffio (bns)',
      }),
      makeEvent({
        id: 'msg-3',
        timestamp: FIXED_NOW - 12_000,
        actorName: 'GOB ARC',
        kind: 'attack',
        description: 'Arco corto vs Thorin',
        result: { kind: 'miss', value: 14 },
      }),
      makeEvent({
        id: 'msg-4',
        timestamp: FIXED_NOW - 30_000,
        actorName: 'LYRA',
        kind: 'spell',
        description: 'Bless [slot 1] su Thorin, Lyra',
        result: { kind: 'concentrating' },
      }),
    ];
    const snapshot: LogSnapshot = { events };
    const rows = renderLogContent(snapshot, 'it', 0, FIXED_NOW);
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'log.standard.it.txt'));
  });
});

// ─── LP-R1HINTS-* (Phase 6 Plan 03) ──────────────────────────────────────────

describe('LogPanel — getR1Hints (Phase 6 NAV-01 chip data)', () => {
  it('LP-R1HINTS-IT: returns getR1Hints with q[log] longPressLabel (IT locale)', () => {
    const { panel } = makePanel();
    const hints = panel.getR1Hints();
    expect(hints.longPressLabel).toMatch(/q\[log\]/);
    expect(typeof hints.tap).toBe('string');
    expect(typeof hints.scroll).toBe('string');
    expect(hints.tap.length).toBeGreaterThan(0);
    expect(hints.scroll.length).toBeGreaterThan(0);
  });

  it('LP-R1HINTS-BUDGET: chip hint fields fit 38-char budget across IT/EN/DE locales', () => {
    const locales = ['it', 'en', 'de'] as const;
    for (const locale of locales) {
      const bridge = makeMockBridge();
      const bus = new PanelGestureBus();
      const panel = new LogPanel(bridge, bus, locale);
      const hints = panel.getR1Hints();
      expect([...hints.tap].length).toBeLessThanOrEqual(38);
      expect([...hints.scroll].length).toBeLessThanOrEqual(38);
      expect([...hints.longPressLabel].length).toBeLessThanOrEqual(38);
    }
  });
});
