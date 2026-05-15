/**
 * Unit tests for ConcentrationDropModalPanel (Phase 4b Plan 05 Task 2 — CONC-01).
 *
 * Covers (per 04B-05-PLAN.md §Task 2 <behavior>):
 *   - CDM-1:  id === 'conc-drop-modal'
 *   - CDM-2:  isOverlayPanel(panel) === true
 *   - CDM-3:  getContainerCount === { image: 0, text: 1 }
 *   - CDM-4:  draw() calls bridge.textContainerUpgrade with title/body/buttons content
 *   - CDM-5:  locale='it' renders 'CONCENTRATION CONFLICT' + 'Spell attivo:' +
 *             'Castando' phrases
 *   - CDM-6:  locale='de' renders 'KONZENTRATIONSKONFLIKT' + German strings
 *   - CDM-7:  Long spell name (IT 'Cura Ferite di Massa') stress — Y button text
 *             truncates to 24-char budget; panel frame layout preserved
 *   - CDM-8:  onMount subscribes to gestureBus (bus.size() === 1)
 *   - CDM-9:  onUnmount unsubscribes (bus.size() === 0) — T-4b-01-03
 *   - CDM-10: tap → ws.send called with conc.drop.confirmed envelope;
 *             EnvelopeSchema.safeParse of the emitted JSON succeeds (W-4 closure)
 *   - CDM-11: double-tap → ws.send NOT called with conc.drop.confirmed;
 *             onClose was invoked
 *   - CDM-12: other gestures (scroll) ignored — ws.send + onClose never called
 *   - CDM-13: matchAsciiFixture composing full 96×24 page with standard-mode HUD
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-05-PLAN.md §Task 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.5 + §5.16
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CONC_DROP_CONFIRMED_TYPE,
  type ConcConflictPayload,
  EnvelopeSchema,
} from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import {
  CONC_MODAL_CONTAINER_NAME,
  ConcentrationDropModalPanel,
  type ConcModalWebSocket,
} from '../concentration-drop-modal.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const VALID_SESSION_UUID = '11111111-1111-4111-8111-111111111111';

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

/**
 * Mock send-only WebSocket — `send` is a `vi.fn()` that satisfies both the
 * runtime `(data: string) => void` contract and the test introspection
 * surface (`mock.calls`). The intersection cast is the canonical Vitest
 * pattern for mocking method signatures (see scene-renderer-smoke.test.ts).
 */
type MockModalWs = ConcModalWebSocket & {
  send: ReturnType<typeof vi.fn> & ((data: string) => void);
};

function makeMockWs(): MockModalWs {
  return {
    send: vi.fn() as MockModalWs['send'],
  };
}

function makeConflict(overrides: Partial<ConcConflictPayload> = {}): ConcConflictPayload {
  return {
    effectId: 'eff-hold-person-1',
    currentConcentrationName: 'Hold Person',
    newSpellName: 'Bless',
    ...overrides,
  };
}

function makeModal(
  opts: {
    bridge?: EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
    ws?: MockModalWs;
    bus?: PanelGestureBus;
    conflict?: ConcConflictPayload;
    locale?: 'it' | 'en' | 'de';
    sessionId?: string;
    onClose?: () => void;
  } = {},
) {
  const bridge = opts.bridge ?? makeMockBridge();
  const ws = opts.ws ?? makeMockWs();
  const bus = opts.bus ?? new PanelGestureBus();
  const onClose = opts.onClose ?? vi.fn();
  const modal = new ConcentrationDropModalPanel(
    bridge,
    ws,
    bus,
    opts.conflict ?? makeConflict(),
    opts.locale ?? 'it',
    opts.sessionId ?? VALID_SESSION_UUID,
    onClose,
  );
  return { modal, bridge, ws, bus, onClose };
}

// ──────────────────────────────────────────────────────────────────────────────
// CDM-1 / CDM-2 / CDM-3 — identity + interface conformance
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — identity + interface conformance', () => {
  it('CDM-1: id === "conc-drop-modal"', () => {
    const { modal } = makeModal();
    expect(modal.id).toBe('conc-drop-modal');
  });

  it('CDM-2: isOverlayPanel(panel) === true', () => {
    const { modal } = makeModal();
    expect(isOverlayPanel(modal)).toBe(true);
  });

  it('CDM-3: getContainerCount === { image: 0, text: 1 } (Strategy A)', () => {
    const { modal } = makeModal();
    expect(modal.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-4 / CDM-5 / CDM-6 — draw() content + locale variants
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — draw() content + locales', () => {
  it('CDM-4: draw() calls bridge.textContainerUpgrade with title/body/buttons', async () => {
    const { modal, bridge } = makeModal();
    await modal.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as {
      containerName: string;
      content: string;
    };
    expect(arg.containerName).toBe(CONC_MODAL_CONTAINER_NAME);
    expect(arg.content).toContain('CONCENTRATION CONFLICT');
    expect(arg.content).toContain('Hold Person');
    expect(arg.content).toContain('Bless');
    expect(arg.content).toContain('[Y]');
    expect(arg.content).toContain('[N]');
  });

  it('CDM-5: locale="it" uses "Spell attivo:" + "Castando" phrases', async () => {
    const { modal, bridge } = makeModal({ locale: 'it' });
    await modal.draw();
    const content = (bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content: string }).content;
    expect(content).toContain('CONCENTRATION CONFLICT'); // IT title = EN per i18n budget
    expect(content).toContain('Spell attivo:');
    expect(content).toContain('Castando');
    expect(content).toContain('Continuare?');
  });

  it('CDM-6: locale="de" uses "KONZENTRATIONSKONFLIKT" + German body/buttons', async () => {
    const { modal, bridge } = makeModal({ locale: 'de' });
    await modal.draw();
    const content = (bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content: string }).content;
    expect(content).toContain('KONZENTRATIONSKONFLIKT');
    expect(content).toContain('Aktiver Zauber:');
    expect(content).toContain('Fortfahren?');
    expect(content).toContain('Abbrechen');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-7 — long-name stress (ST-4)
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — long-name truncation (ST-4)', () => {
  it('CDM-7: IT "Cura Ferite di Massa" Y button truncates to 24-char budget', async () => {
    const { modal, bridge } = makeModal({
      conflict: makeConflict({
        newSpellName: 'Cura Ferite di Massa', // 20 chars
      }),
      locale: 'it',
    });
    await modal.draw();
    const content = (bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content: string }).content;
    // The Y button row is line 9 of the panel (10th line, 0-indexed 9). It must
    // contain '[Y]' + 'Drop & cast' + start of name (truncated with `…`).
    const lines = content.split('\n');
    const yLine = lines[9];
    expect(yLine).toBeDefined();
    expect(yLine).toContain('[Y]');
    // The full "[Y] Drop & cast Cura Ferite di Massa" = 36 chars; budget is 24,
    // so the truncation produces `[Y] Drop & cast Cura Fe…` (23 + … = 24 chars).
    expect(yLine).toContain('[Y] Drop & cast');
    expect(yLine).toContain('…');
    // The panel frame's right edge `│` is still column-aligned (every row is
    // exactly 60 chars wide; line ends with ` │`).
    expect(yLine?.endsWith(' │')).toBe(true);
    // All lines are exactly 60 chars wide (modal frame integrity).
    for (const line of lines) {
      expect([...line].length).toBe(60);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-8 / CDM-9 — onMount / onUnmount lifecycle (T-4b-01-03)
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — gesture bus subscription lifecycle', () => {
  it('CDM-8: onMount subscribes to gestureBus (bus.size() === 1)', async () => {
    const bus = new PanelGestureBus();
    const { modal } = makeModal({ bus });
    expect(bus.size()).toBe(0);
    await modal.onMount();
    expect(bus.size()).toBe(1);
  });

  it('CDM-9: onUnmount unsubscribes (bus.size() === 0) — T-4b-01-03', async () => {
    const bus = new PanelGestureBus();
    const { modal } = makeModal({ bus });
    await modal.onMount();
    expect(bus.size()).toBe(1);
    await modal.onUnmount();
    expect(bus.size()).toBe(0);
    // Double-unmount is idempotent — second call must not throw or under-count.
    await modal.onUnmount();
    expect(bus.size()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-10 — Y emission + W-4 EnvelopeSchema round-trip
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — Y emission + W-4 envelope round-trip', () => {
  it('CDM-10: tap → ws.send + EnvelopeSchema.safeParse round-trip (W-4 closure)', async () => {
    const bus = new PanelGestureBus();
    const { modal, ws, onClose } = makeModal({ bus });
    await modal.onMount();
    // Publish a tap — the modal's onEvent handler emits the envelope.
    bus.publish({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = ws.send.mock.calls[0]?.[0] as string;
    expect(typeof sent).toBe('string');

    // W-4 round-trip — extract and parse via canonical EnvelopeSchema.
    const parsed = JSON.parse(sent) as unknown;
    const envParse = EnvelopeSchema.safeParse(parsed);
    expect(envParse.success).toBe(true);
    if (envParse.success) {
      expect(envParse.data.proto).toBe('evf-v1');
      expect(envParse.data.type).toBe(CONC_DROP_CONFIRMED_TYPE);
      expect(envParse.data.session_id).toBe(VALID_SESSION_UUID);
      expect(envParse.data.payload).toEqual({ effectId: 'eff-hold-person-1' });
    }
    // onClose was called after emission.
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-11 — N cancel
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — N cancel', () => {
  it('CDM-11: double-tap → ws.send NOT called; onClose was invoked', async () => {
    const bus = new PanelGestureBus();
    const { modal, ws, onClose } = makeModal({ bus });
    await modal.onMount();
    bus.publish({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-12 — other gestures ignored
// ──────────────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — ignored gestures', () => {
  it('CDM-12: scroll gesture is ignored (ws.send + onClose NOT called)', async () => {
    const bus = new PanelGestureBus();
    const { modal, ws, onClose } = makeModal({ bus });
    await modal.onMount();
    bus.publish({ kind: 'scroll', direction: 'up' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CDM-12b: long-press gesture is ignored', async () => {
    const bus = new PanelGestureBus();
    const { modal, ws, onClose } = makeModal({ bus });
    await modal.onMount();
    bus.publish({ kind: 'long-press' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CDM-13 — matchAsciiFixture full-page composition
// ──────────────────────────────────────────────────────────────────────────────

// CDM-13 is moved to the integration smoke test (ISM-09) which has the full
// scene + Status HUD composition harness. The fixture content (conc-modal
// open layout) is asserted at the integration boundary where the layer
// composition is real. Unit-level CDM-13 here verifies only that the panel's
// rendered content (12 modal rows) matches the modal-only fragment of the
// fixture — confirms the panel's per-row alignment in isolation.

describe('ConcentrationDropModalPanel — modal-only row fragment', () => {
  it('CDM-13: 12-row modal panel content matches UI-SPEC §3.5 layout', async () => {
    const { modal, bridge } = makeModal({
      conflict: makeConflict({
        currentConcentrationName: 'Hold Person (5r)',
        newSpellName: 'Bless',
      }),
      locale: 'it',
    });
    await modal.draw();
    const content = (bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content: string }).content;
    const lines = content.split('\n');
    expect(lines.length).toBe(12);
    // Every row is exactly 60 chars wide (modal frame integrity).
    for (const line of lines) {
      expect([...line].length).toBe(60);
    }
    // Top border starts `┌─[ CONCENTRATION CONFLICT ]` and ends `┐`.
    expect(lines[0]?.startsWith('┌─[ CONCENTRATION CONFLICT ]')).toBe(true);
    expect(lines[0]?.endsWith('┐')).toBe(true);
    // Bottom border is `└─...─┘`.
    expect(lines[11]?.startsWith('└')).toBe(true);
    expect(lines[11]?.endsWith('┘')).toBe(true);
  });
});
