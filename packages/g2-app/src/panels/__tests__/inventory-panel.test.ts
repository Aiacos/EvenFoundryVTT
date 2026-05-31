/**
 * Unit tests for InventoryPanel + renderInventoryTabContent + renderInventoryRow
 * (Phase 5 Plan 05-04 — SHEET-01/02/03).
 *
 * Test coverage per 05-04-PLAN.md §Task 1 IP-* discriminator markers:
 *
 * Meta / constructor:
 *   - IP-META-1:  InventoryPanel.meta passes PanelMetaSchema (id='inventory')
 *   - IP-META-2:  InventoryPanel.meta.navKey === 'I'
 *   - IP-CTOR-1:  implements OverlayPanel (isOverlayPanel returns true)
 *   - IP-CTOR-2:  getContainerCount returns { image:0, text:1 }
 *
 * Lifecycle:
 *   - IP-MOUNT-UNMOUNT-1: bus subscribe on mount; unsubscribe on unmount
 *   - IP-DRAW-1: single textContainerUpgrade per draw()
 *
 * Row rendering — 2014/2024 edition delta:
 *   - IP-ROW-2014:          modernRules=false + weapon → no [M] flag
 *   - IP-ROW-2024:          modernRules=true  + weapon → [M] flag present after name
 *   - IP-ROW-2024-NON-WEAPON: modernRules=true + consumable → no [M] flag
 *   - IP-ROW-TRUNC:         weapon name 20 chars → truncated with … to fit name budget
 *   - IP-ROW-WIDTH:         every row exactly 66 code-points
 *
 * Section helpers:
 *   - IP-SECTION-EQUIPPED-1: renderEquippedSection header is EQUIPAGGIAMENTO (IT)
 *
 * Content renderers:
 *   - IP-CONTENT-SHEET:      renderInventoryTabContent returns 18 rows
 *   - IP-CONTENT-SHEET-WIDTH: each row exactly 66 code-points
 *   - IP-CONTENT-STANDALONE:  renderInventoryStandaloneContent returns 18 rows
 *   - IP-CONTENT-STANDALONE-WIDTH: each row exactly 66 code-points
 *   - IP-CONTENT-STANDALONE-NO-CURRENCY: standalone output does NOT contain currency strip
 *
 * Schema:
 *   - IP-SCHEMA-1: parse with empty inventory succeeds
 *   - IP-SCHEMA-2: parse with weapon item succeeds
 *   - IP-SCHEMA-3: missing inventory field FAILS
 *
 * INV-1 fixture round-trips:
 *   - IP-FIX-SHEET-2014:       renderInventoryTabContent 2014 → sheet.inventory.2014.it.txt
 *   - IP-FIX-SHEET-2024:       renderInventoryTabContent 2024 → sheet.inventory.2024.it.txt
 *   - IP-FIX-STANDALONE-2014:  renderInventoryStandaloneContent 2014 → inventory.2014.it.txt
 *   - IP-FIX-STANDALONE-2024:  renderInventoryStandaloneContent 2024 → inventory.2024.it.txt
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-04-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.4 + §5.10
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import type { ActionOptionsRequest } from '../action-options-modal.js';
import InventoryPanel, {
  buildInventoryRowItemMap,
  renderEquippedSection,
  renderInventoryRow,
  renderInventoryStandaloneContent,
  renderInventoryTabContent,
  resolveItemAtRow,
} from '../inventory-panel.js';

// ─── Fixture helpers ───────────────────────────────────────────────────────────

function fixtureDir(): string {
  return resolve(__dirname, '../../../../shared-render/src/fixtures');
}

function loadFixture(name: string): string {
  return readFileSync(resolve(fixtureDir(), name), 'utf-8');
}

function normaliseRows(content: string): string {
  return content
    .split('\n')
    .map((row) => row.trimEnd())
    .join('\n')
    .trimEnd();
}

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockBridge(): EvenAppBridge {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge;
}

function makeMockBus(): PanelGestureBus {
  return {
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as PanelGestureBus;
}

// ─── Test snapshots ───────────────────────────────────────────────────────────

/** Thorin Oakenshield — PHB 2014, full inventory (4 weapons + 3 consumables + 1 container). */
const snapshot2014: CharacterSnapshot = {
  actorId: 'thorin-oakenshield-001',
  name: 'THORIN OAKENSHIELD',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 8,
  conditions: ['Bless'],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [
    {
      id: 'w1',
      name: 'Spada lunga',
      type: 'weapon',
      damage: '1d8 taglio',
      tags: ['versatile'],
    },
    {
      id: 'w2',
      name: 'Ascia a mano',
      type: 'weapon',
      damage: '1d6 taglio',
      tags: ['scagliata'],
    },
    {
      id: 'a1',
      name: 'Maglia',
      type: 'armor',
      tags: ['svant. furtività'],
    },
    {
      id: 'a2',
      name: 'Scudo',
      type: 'equipment',
      tags: ['+2 CA'],
    },
    {
      id: 'c1',
      name: 'Pozione di Guarigione',
      type: 'consumable',
      damage: '2d4+2 PF',
      quantity: 3,
    },
    {
      id: 'c2',
      name: 'Pozione di Arrampicata',
      type: 'consumable',
      damage: '+20m scalata',
      quantity: 1,
    },
    {
      id: 'c3',
      name: 'Acqua Sacra',
      type: 'consumable',
      damage: '2d6 radiante',
      quantity: 2,
    },
    {
      id: 'bag1',
      name: 'Zaino con attrezzi',
      type: 'container',
    },
  ],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
    dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
  },
};

/** Thorin Oakenshield — PHB 2024, same inventory (with [M] mastery flag on weapons). */
const snapshot2024: CharacterSnapshot = {
  ...snapshot2014,
  world: { modernRules: true },
};

/** Snapshot with empty inventory. */
const snapshotEmpty: CharacterSnapshot = {
  ...snapshot2014,
  inventory: [],
};

/** Count code-points in a string ([...str].length). */
function codePointLen(s: string): number {
  return [...s].length;
}

// ─── IP-META: static metadata ─────────────────────────────────────────────────

describe('InventoryPanel static meta', () => {
  it('IP-META-1: meta.id is "inventory"', () => {
    expect(InventoryPanel.meta.id).toBe('inventory');
  });

  it('IP-META-2: meta.navKey is "I"', () => {
    expect(InventoryPanel.meta.navKey).toBe('I');
  });
});

// ─── IP-CTOR: constructor + interface ─────────────────────────────────────────

describe('InventoryPanel constructor', () => {
  it('IP-CTOR-1: implements OverlayPanel (isOverlayPanel returns true)', () => {
    const panel = new InventoryPanel(makeMockBridge(), makeMockBus(), 'it');
    expect(isOverlayPanel(panel)).toBe(true);
  });

  it('IP-CTOR-2: getContainerCount returns { image: 0, text: 1 }', () => {
    const panel = new InventoryPanel(makeMockBridge(), makeMockBus(), 'it');
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── IP-MOUNT-UNMOUNT: lifecycle ──────────────────────────────────────────────

describe('InventoryPanel lifecycle', () => {
  it('IP-MOUNT-UNMOUNT-1: bus subscribe on mount; unsubscribe on unmount', async () => {
    const unsubSpy = vi.fn();
    const bus: PanelGestureBus = {
      subscribe: vi.fn().mockReturnValue(unsubSpy),
    } as unknown as PanelGestureBus;
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');

    await panel.onMount();
    expect(bus.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubSpy).not.toHaveBeenCalled();

    await panel.onUnmount();
    expect(unsubSpy).toHaveBeenCalledTimes(1);

    // Idempotent: second unmount must not crash
    await panel.onUnmount();
    expect(unsubSpy).toHaveBeenCalledTimes(1);
  });

  it('IP-DRAW-1: draw() issues exactly one textContainerUpgrade call', async () => {
    const bridge = makeMockBridge();
    const panel = new InventoryPanel(bridge, makeMockBus(), 'it');
    panel.onSnapshot(snapshot2014);
    // Drain the async void draw from onSnapshot before clearing
    await new Promise((r) => setTimeout(r, 0));
    (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mockClear();

    await panel.draw();

    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
  });
});

// ─── IP-ROW: row rendering ────────────────────────────────────────────────────

describe('renderInventoryRow', () => {
  it('IP-ROW-2014: weapon row without modernRules has no [M] flag', () => {
    const item = { id: 'w1', name: 'Spada lunga', type: 'weapon' as const, damage: '1d8 taglio' };
    const row = renderInventoryRow(item, 'it', false);
    expect(row).not.toContain('[M]');
    expect(row).toContain('Spada lunga');
  });

  it('IP-ROW-2024: weapon row with modernRules has [M] flag after name', () => {
    const item = { id: 'w1', name: 'Spada lunga', type: 'weapon' as const, damage: '1d8 taglio' };
    const row = renderInventoryRow(item, 'it', true);
    expect(row).toContain('[M]');
    expect(row).toContain('Spada lunga');
    // [M] must appear after the name, not before
    const nameIdx = row.indexOf('Spada lunga');
    const masteryIdx = row.indexOf('[M]');
    expect(masteryIdx).toBeGreaterThan(nameIdx);
  });

  it('IP-ROW-2024-NON-WEAPON: consumable with modernRules has no [M] flag', () => {
    const item = { id: 'c1', name: 'Pozione', type: 'consumable' as const, damage: '2d4+2' };
    const row = renderInventoryRow(item, 'it', true);
    expect(row).not.toContain('[M]');
  });

  it('IP-ROW-TRUNC: weapon name exceeding budget is truncated with …', () => {
    const longName = 'A'.repeat(25); // Longer than any name budget
    const item = { id: 'w1', name: longName, type: 'weapon' as const };
    const row2014 = renderInventoryRow(item, 'it', false);
    const row2024 = renderInventoryRow(item, 'it', true);
    expect(row2014).toContain('…');
    expect(row2024).toContain('…');
    expect(row2024).toContain('[M]');
  });

  it('IP-ROW-WIDTH: every row exactly 66 code-points', () => {
    const items = [
      {
        id: 'w1',
        name: 'Spada lunga',
        type: 'weapon' as const,
        damage: '1d8 taglio',
        tags: ['versatile'],
      },
      { id: 'c1', name: 'Pozione', type: 'consumable' as const, damage: '2d4+2 PF', quantity: 3 },
      { id: 'a1', name: 'Maglia', type: 'armor' as const },
    ];
    for (const item of items) {
      const row2014 = renderInventoryRow(item, 'it', false);
      const row2024 = renderInventoryRow(item, 'it', true);
      expect(codePointLen(row2014)).toBe(66);
      expect(codePointLen(row2024)).toBe(66);
    }
  });
});

// ─── IP-SECTION: section helpers ─────────────────────────────────────────────

describe('renderEquippedSection', () => {
  it('IP-SECTION-EQUIPPED-1: section header is EQUIPAGGIAMENTO (IT locale)', () => {
    const rows = renderEquippedSection(snapshot2014.inventory, 'it', false);
    expect(rows[0]).toContain('EQUIPAGGIAMENTO');
  });
});

// ─── IP-CONTENT: content renderers ───────────────────────────────────────────

describe('renderInventoryTabContent', () => {
  it('IP-CONTENT-SHEET: returns exactly 18 rows', () => {
    const rows = renderInventoryTabContent(snapshot2014, 'it', 0);
    expect(rows).toHaveLength(18);
  });

  it('IP-CONTENT-SHEET-WIDTH: each row exactly 66 code-points', () => {
    const rows = renderInventoryTabContent(snapshot2014, 'it', 0);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
  });

  it('IP-CONTENT-SHEET-NULL: null snapshot returns 18 blank rows', () => {
    const rows = renderInventoryTabContent(null, 'it', 0);
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(row.trim()).toBe('');
    }
  });
});

describe('renderInventoryStandaloneContent', () => {
  it('IP-CONTENT-STANDALONE: returns exactly 18 rows', () => {
    const rows = renderInventoryStandaloneContent(snapshot2014, 'it', 0);
    expect(rows).toHaveLength(18);
  });

  it('IP-CONTENT-STANDALONE-WIDTH: each row exactly 66 code-points', () => {
    const rows = renderInventoryStandaloneContent(snapshot2014, 'it', 0);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
  });

  it('IP-CONTENT-STANDALONE-NO-CURRENCY: standalone output has no currency strip', () => {
    const rows = renderInventoryStandaloneContent(snapshot2014, 'it', 0);
    const joined = rows.join('\n');
    // Standalone has no currency label (◈ Monete)
    expect(joined).not.toContain('◈ Monete');
  });

  it('IP-CONTENT-STANDALONE-EQUIPPED-HEADER: standalone output contains EQUIPAGGIAMENTO header', () => {
    const rows = renderInventoryStandaloneContent(snapshot2014, 'it', 0);
    const joined = rows.join('\n');
    expect(joined).toContain('EQUIPAGGIAMENTO');
  });
});

// ─── IP-SCHEMA: schema validation ─────────────────────────────────────────────

describe('CharacterSnapshotSchema with inventory', () => {
  it('IP-SCHEMA-1: parse with empty inventory succeeds', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...snapshot2014,
      inventory: [],
    });
    expect(result.success).toBe(true);
  });

  it('IP-SCHEMA-2: parse with weapon item succeeds', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...snapshot2014,
      inventory: [{ id: 'w1', name: 'Longsword', type: 'weapon', damage: '1d8 sl' }],
    });
    expect(result.success).toBe(true);
  });

  it('IP-SCHEMA-3: missing inventory field FAILS (strict atomic gate)', () => {
    const { inventory: _inv, ...withoutInventory } = snapshot2014;
    const result = CharacterSnapshotSchema.safeParse(withoutInventory);
    expect(result.success).toBe(false);
  });
});

// ─── IP-FIX: INV-1 fixture round-trips ───────────────────────────────────────

describe('INV-1 fixture round-trips', () => {
  it('IP-FIX-SHEET-2014: renderInventoryTabContent 2014 matches sheet.inventory.2014.it.txt', () => {
    const rows = renderInventoryTabContent(snapshot2014, 'it', 0);
    const expected = normaliseRows(loadFixture('sheet.inventory.2014.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });

  it('IP-FIX-SHEET-2024: renderInventoryTabContent 2024 matches sheet.inventory.2024.it.txt', () => {
    const rows = renderInventoryTabContent(snapshot2024, 'it', 0);
    const expected = normaliseRows(loadFixture('sheet.inventory.2024.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });

  it('IP-FIX-STANDALONE-2014: renderInventoryStandaloneContent 2014 matches inventory.2014.it.txt', () => {
    const rows = renderInventoryStandaloneContent(snapshot2014, 'it', 0);
    const expected = normaliseRows(loadFixture('inventory.2014.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });

  it('IP-FIX-STANDALONE-2024: renderInventoryStandaloneContent 2024 matches inventory.2024.it.txt', () => {
    const rows = renderInventoryStandaloneContent(snapshot2024, 'it', 0);
    const expected = normaliseRows(loadFixture('inventory.2024.it.txt'));
    const actual = normaliseRows(rows.join('\n'));
    expect(actual).toBe(expected);
  });
});

// ─── IP-EMPTY: empty inventory behavior ───────────────────────────────────────

describe('Empty inventory behavior', () => {
  it('IP-EMPTY-SHEET: sheet tab with empty inventory still returns 18 rows × 66 cp', () => {
    const rows = renderInventoryTabContent(snapshotEmpty, 'it', 0);
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
  });

  it('IP-EMPTY-STANDALONE: standalone with empty inventory still returns 18 rows × 66 cp', () => {
    const rows = renderInventoryStandaloneContent(snapshotEmpty, 'it', 0);
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(codePointLen(row)).toBe(66);
    }
  });
});

// ─── IP-R1HINTS-* (Phase 6 Plan 03) ──────────────────────────────────────────

describe('InventoryPanel — getR1Hints (Phase 6 NAV-01 chip data)', () => {
  it('IP-R1HINTS-IT: returns getR1Hints with q[inv] quickActionLabel (IT locale)', () => {
    const bridge = makeMockBridge();
    const bus = makeMockBus();
    const panel = new InventoryPanel(bridge, bus, 'it');
    const hints = panel.getR1Hints();
    expect(hints.quickActionLabel).toMatch(/q\[inv\]/);
    expect(typeof hints.tap).toBe('string');
    expect(typeof hints.scroll).toBe('string');
    expect(hints.tap.length).toBeGreaterThan(0);
    expect(hints.scroll.length).toBeGreaterThan(0);
  });

  it('IP-R1HINTS-BUDGET: chip hint fields fit 38-char budget across IT/EN/DE locales', () => {
    const locales = ['it', 'en', 'de'] as const;
    for (const locale of locales) {
      const bridge = makeMockBridge();
      const bus = makeMockBus();
      const panel = new InventoryPanel(bridge, bus, locale);
      const hints = panel.getR1Hints();
      expect([...hints.tap].length).toBeLessThanOrEqual(38);
      expect([...hints.scroll].length).toBeLessThanOrEqual(38);
      expect([...hints.quickActionLabel].length).toBeLessThanOrEqual(38);
    }
  });
});

// ─── INV-OVERSCROLL-*: ADR-0012 D-2 over-scroll boundary probe ────────────────

describe('InventoryPanel — isAtTopBoundary (ADR-0012 D-2)', () => {
  it('INV-OVERSCROLL-01: true at offset 0, false after scrolling down', async () => {
    const bus = new PanelGestureBus();
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');
    panel.onSnapshot(snapshotWithWeapon);
    await panel.onMount();

    expect(panel.isAtTopBoundary()).toBe(true);
    bus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(false);
    bus.publish({ kind: 'scroll', direction: 'up' });
    expect(panel.isAtTopBoundary()).toBe(true);

    await panel.onUnmount();
  });
});

// ─── INV-LP-*: Phase 8 Plan 08-03 — setActionOptionsHandler + tap context action

/**
 * Snapshot with weapon item at index 0 for INV-LP-* tests.
 * Weapon type → requiresTarget heuristic = true (type !== 'consumable').
 */
const snapshotWithWeapon: CharacterSnapshot = {
  ...snapshot2014,
  inventory: [
    {
      id: 'item-sword',
      name: 'Spada lunga',
      type: 'weapon',
      damage: '1d8 taglio',
      tags: ['versatile'],
    },
  ],
};

/**
 * Snapshot with consumable item at index 0 for INV-LP-* tests.
 * Consumable type → requiresTarget heuristic = false (type === 'consumable').
 */
const snapshotWithPotion: CharacterSnapshot = {
  ...snapshot2014,
  inventory: [
    {
      id: 'item-potion-healing',
      name: 'Pozione di Guarigione',
      type: 'consumable',
      damage: '2d4+2 PF',
      quantity: 1,
    },
  ],
};

describe('InventoryPanel — setActionOptionsHandler (INV-LP-*)', () => {
  it('INV-LP-01: setActionOptionsHandler method exists on panel instance', () => {
    const panel = new InventoryPanel(makeMockBridge(), new PanelGestureBus(), 'it');
    expect(typeof panel.setActionOptionsHandler).toBe('function');
  });

  it('INV-LP-02: tap with handler set + valid snapshot (weapon) calls handler', async () => {
    const bus = new PanelGestureBus();
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');
    panel.onSnapshot(snapshotWithWeapon);
    await panel.onMount();

    const spy = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(spy);

    bus.publish({ kind: 'tap' });

    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    expect(req?.kind).toBe('item');
    expect(req?.name).toBe('Spada lunga');
    expect(req?.actorId).toBe('thorin-oakenshield-001');
    expect(req?.itemId).toBe('item-sword');
    expect(req?.requiresTarget).toBe(true); // weapon → requiresTarget=true

    await panel.onUnmount();
  });

  it('INV-LP-02b: requiresTarget heuristic — consumable → false', async () => {
    const bus = new PanelGestureBus();
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');
    panel.onSnapshot(snapshotWithPotion);
    await panel.onMount();

    const spy = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(spy);

    bus.publish({ kind: 'tap' });

    const req = spy.mock.calls[0]?.[0];
    expect(req?.requiresTarget).toBe(false);
    expect(req?.name).toBe('Pozione di Guarigione');

    await panel.onUnmount();
  });

  it('INV-LP-03: tap with handler NOT set → re-draw no-op', async () => {
    const bus = new PanelGestureBus();
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');
    panel.onSnapshot(snapshotWithWeapon);
    await panel.onMount();

    // No setActionOptionsHandler call — should be a re-draw no-op
    bus.publish({ kind: 'tap' });

    // Panel stays alive — no crash
    await panel.onUnmount();
  });

  it('INV-LP-04: tap with handler set but snapshot=null → no-op + console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new PanelGestureBus();
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');
    // No onSnapshot call → snapshot is null
    await panel.onMount();

    const spy = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(spy);

    bus.publish({ kind: 'tap' });

    expect(spy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0]?.[0];
    expect(String(msg)).toContain('inventory-panel');

    warnSpy.mockRestore();
    await panel.onUnmount();
  });
});

// ─── INV-LPMAP-*: header-aware row → item mapping (cursor-row resolution) ──────

/**
 * Multi-section snapshot: 1 equipped weapon + 1 consumable. The standalone
 * renderer's `allRows` layout is:
 *   row 0: EQUIPPED header
 *   row 1: weapon (item-sword)
 *   row 2: blank
 *   row 3: CONSUMABLES header
 *   row 4: consumable (item-potion)
 *   row 5: blank
 *   rows 6-7: CARRIED header + condensed summary (non-addressable)
 * BUG: flat inventory[scrollOffset] mis-maps once a header sits above the cursor.
 */
const multiSectionInvSnapshot: CharacterSnapshot = {
  ...snapshot2014,
  inventory: [
    { id: 'item-sword', name: 'Spada lunga', type: 'weapon', damage: '1d8 taglio' },
    { id: 'item-potion', name: 'Pozione', type: 'consumable', damage: '2d4+2', quantity: 2 },
  ],
};

describe('buildInventoryRowItemMap + resolveItemAtRow (cursor-row resolution)', () => {
  it('INV-LPMAP-01: map aligns headers/blanks→null and item rows→item across sections', () => {
    const map = buildInventoryRowItemMap(multiSectionInvSnapshot, 'it');
    expect(map[0]).toBeNull(); // EQUIPPED header
    expect(map[1]?.id).toBe('item-sword');
    expect(map[2]).toBeNull(); // blank
    expect(map[3]).toBeNull(); // CONSUMABLES header
    expect(map[4]?.id).toBe('item-potion');
    expect(map[5]).toBeNull(); // blank
    // CARRIED header + summary are non-addressable nulls.
    expect(map[6]).toBeNull();
    expect(map.slice(6).every((m) => m === null)).toBe(true);
  });

  it('INV-LPMAP-02: cursor on a consumable item row resolves that item (not flat index)', () => {
    const map = buildInventoryRowItemMap(multiSectionInvSnapshot, 'it');
    // Row 4 → potion. The OLD flat index inventory[4] would be undefined.
    expect(resolveItemAtRow(map, 4)?.id).toBe('item-potion');
  });

  it('INV-LPMAP-03: cursor on a header falls through to the next item row', () => {
    const map = buildInventoryRowItemMap(multiSectionInvSnapshot, 'it');
    expect(resolveItemAtRow(map, 0)?.id).toBe('item-sword'); // EQUIPPED header → first item
    expect(resolveItemAtRow(map, 3)?.id).toBe('item-potion'); // CONSUMABLES header → next item
  });

  it('INV-LPMAP-04: empty map → null; null snapshot → empty map', () => {
    expect(resolveItemAtRow([], 0)).toBeNull();
    expect(buildInventoryRowItemMap(null, 'it')).toEqual([]);
  });

  it('INV-LPMAP-05: tap after scrolling a tall list resolves the cursor-row item across a header', async () => {
    // Build a list TALLER than ROW_COUNT (18) so the scroll window actually shifts.
    const weapons = Array.from({ length: 18 }, (_, i) => ({
      id: `weapon-${i}`,
      name: `Arma ${i}`,
      type: 'weapon' as const,
      damage: '1d6',
    }));
    const tallSnapshot: CharacterSnapshot = {
      ...snapshot2014,
      inventory: [...weapons, { id: 'item-potion', name: 'Pozione', type: 'consumable' }],
    };
    // allRows: row 0 EQUIPPED hdr, rows 1..18 weapons 0..17, row 19 blank,
    // row 20 CONSUMABLES hdr, row 21 potion, ... → the scroll window clamps offset.
    const map = buildInventoryRowItemMap(tallSnapshot, 'it');
    expect(map[1]?.id).toBe('weapon-0'); // first weapon row (after EQUIPPED header)

    const bus = new PanelGestureBus();
    const panel = new InventoryPanel(makeMockBridge(), bus, 'it');
    panel.onSnapshot(tallSnapshot);
    await panel.onMount();

    const spy = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(spy);

    // Scroll down well past the clamp ceiling. The cursor row is offset by the
    // single EQUIPPED header, so the resolved item is weapon-(offset-1) — the OLD
    // flat-index code dispatched inventory[offset] = weapon-offset (off by 1 header).
    for (let i = 0; i < 20; i++) bus.publish({ kind: 'scroll', direction: 'down' });
    bus.publish({ kind: 'tap' });

    const req = spy.mock.calls.at(-1)?.[0];
    // Clamp ceiling = allRows.length - 17. Resolve item at that row via the map and
    // assert the handler dispatched the SAME item (row-mapped, header-aware).
    const clampCeiling = Math.max(0, map.length - 17);
    const expected = resolveItemAtRow(map, clampCeiling);
    expect(req?.itemId).toBe(expected?.id);
    // The mapped item must be header-shifted relative to the naive flat index.
    expect(req?.itemId).not.toBe(`weapon-${clampCeiling}`);

    await panel.onUnmount();
  });
});
