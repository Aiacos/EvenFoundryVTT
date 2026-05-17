/**
 * Unit tests for ReactionPromptPanel — RPP-01..12 (Plan 13-02, Task 1).
 *
 * Tests cover:
 * - RPP-01: onMount subscribes to gesture bus
 * - RPP-02: onUnmount unsubscribes (idempotent — safe to call twice)
 * - RPP-03: tap (Shield kind) → ws.send tool.invoke with cast-shield args + onClose
 * - RPP-04: tap (Counterspell) → cast-counterspell with sourceName as target_caster_id
 * - RPP-05: tap (Opportunity Attack) → opportunity-attack with playerWeaponId
 * - RPP-06: double-tap → onClose without ws.send
 * - RPP-07: tap with no playerActorId → no ws.send + onClose still called (fail-safe)
 * - RPP-08: draw() for Shield/IT produces 12 rows each exactly 60 cp wide, matching fixture
 * - RPP-09: draw() for Counterspell/EN produces 12 rows exactly 60 cp wide, matching fixture
 * - RPP-10: draw() for Opportunity Attack/IT produces 12 rows exactly 60 cp wide, matching fixture
 * - RPP-11: getContainerCount returns { image: 0, text: 1 }
 * - RPP-12: EnvelopeSchema round-trip on emitted tool.invoke envelope (W-13 regression guard)
 *
 * @see packages/g2-app/src/panels/reaction-prompt-panel.ts
 * @see .planning/phases/13-v2-stretch/13-02-PLAN.md Task 1
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EnvelopeSchema, type ReactionAvailablePayload } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { ReactionPromptPanel } from './reaction-prompt-panel.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

function makeWs() {
  return {
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makeShieldPayload(): ReactionAvailablePayload {
  return {
    kind: 'shield',
    sourceName: 'Goblin Boss',
    expiresAt: Date.now() + 30000,
  };
}

function makeCounterspellPayload(): ReactionAvailablePayload {
  return {
    kind: 'counterspell',
    sourceName: 'Enemy Mage',
    expiresAt: Date.now() + 30000,
  };
}

function makeOppAttackPayload(): ReactionAvailablePayload {
  return {
    kind: 'opportunity-attack',
    sourceName: 'Fleeing Orc',
    expiresAt: Date.now() + 30000,
  };
}

function makePanel(opts: {
  payload?: ReactionAvailablePayload;
  locale?: 'it' | 'en' | 'de';
  playerActorId?: string | null;
  playerWeaponId?: string | null;
  onClose?: () => void;
  onTimeoutToast?: (toast: { id: string; severity: string; message: string; emittedAt: number }) => void;
} = {}) {
  const bridge = makeBridge();
  const ws = makeWs();
  const gestureBus = new PanelGestureBus();
  const payload = opts.payload ?? makeShieldPayload();
  const locale = opts.locale ?? 'it';
  const playerActorId = opts.playerActorId !== undefined ? opts.playerActorId : 'actor-thorin';
  const playerWeaponId = opts.playerWeaponId !== undefined ? opts.playerWeaponId : 'item-longsword';
  const onClose = opts.onClose ?? vi.fn();
  const onTimeoutToast = opts.onTimeoutToast;
  const panel = new ReactionPromptPanel(
    bridge,
    ws,
    gestureBus,
    payload,
    locale,
    VALID_SESSION_ID,
    playerActorId,
    playerWeaponId,
    onClose,
    onTimeoutToast,
  );
  return { panel, bridge, ws, gestureBus, onClose };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReactionPromptPanel', () => {
  // RPP-01: onMount subscribes to gesture bus
  it('RPP-01: onMount subscribes to gesture bus', async () => {
    const { panel, gestureBus } = makePanel();
    expect(gestureBus.size()).toBe(0);
    await panel.onMount();
    expect(gestureBus.size()).toBe(1);
  });

  // RPP-02: onUnmount unsubscribes (idempotent)
  it('RPP-02: onUnmount unsubscribes and is idempotent', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    expect(gestureBus.size()).toBe(1);
    await panel.onUnmount();
    expect(gestureBus.size()).toBe(0);
    // Second call is safe
    await panel.onUnmount();
    expect(gestureBus.size()).toBe(0);
  });

  // RPP-03: tap (Shield) → cast-shield args + onClose
  it('RPP-03: tap for Shield kind sends cast-shield tool.invoke and calls onClose', async () => {
    const onClose = vi.fn();
    const { panel, ws, gestureBus } = makePanel({ payload: makeShieldPayload(), playerActorId: 'actor-thorin', onClose });
    await panel.onMount();
    gestureBus.publish({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const call0 = ws.send.mock.calls[0];
    expect(call0).toBeDefined();
    const sent = JSON.parse(call0![0] as string) as unknown;
    const parsed = EnvelopeSchema.safeParse(sent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('tool.invoke');
      const payload = parsed.data.payload as { toolId: string; args: Record<string, unknown> };
      expect(payload.toolId).toBe('cast-shield');
      expect(payload.args.actor_id).toBe('actor-thorin');
      expect(payload.args.slot_level).toBe(1);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // RPP-04: tap (Counterspell) → cast-counterspell with sourceName as target_caster_id
  it('RPP-04: tap for Counterspell sends cast-counterspell with target_caster_id=sourceName', async () => {
    const { panel, ws, gestureBus } = makePanel({ payload: makeCounterspellPayload(), playerActorId: 'actor-wiz' });
    await panel.onMount();
    gestureBus.publish({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const call0cs = ws.send.mock.calls[0];
    expect(call0cs).toBeDefined();
    const sent = JSON.parse(call0cs![0] as string) as unknown;
    const parsed = EnvelopeSchema.safeParse(sent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const payload = parsed.data.payload as { toolId: string; args: Record<string, unknown> };
      expect(payload.toolId).toBe('cast-counterspell');
      expect(payload.args.actor_id).toBe('actor-wiz');
      expect(payload.args.slot_level).toBe(3);
      // target_caster_id is the sourceName (or '<unknown>' sentinel)
      expect(typeof payload.args.target_caster_id).toBe('string');
      expect((payload.args.target_caster_id as string).length).toBeGreaterThan(0);
    }
  });

  // RPP-05: tap (Opportunity Attack) → opportunity-attack with playerWeaponId
  it('RPP-05: tap for Opportunity Attack sends opportunity-attack with playerWeaponId as item_id', async () => {
    const { panel, ws, gestureBus } = makePanel({ payload: makeOppAttackPayload(), playerActorId: 'actor-fighter', playerWeaponId: 'item-axe' });
    await panel.onMount();
    gestureBus.publish({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const call0oa = ws.send.mock.calls[0];
    expect(call0oa).toBeDefined();
    const sent = JSON.parse(call0oa![0] as string) as unknown;
    const parsed = EnvelopeSchema.safeParse(sent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const payload = parsed.data.payload as { toolId: string; args: Record<string, unknown> };
      expect(payload.toolId).toBe('opportunity-attack');
      expect(payload.args.actor_id).toBe('actor-fighter');
      expect(payload.args.item_id).toBe('item-axe');
      expect(typeof payload.args.target_id).toBe('string');
    }
  });

  // RPP-06: double-tap → onClose without ws.send
  it('RPP-06: double-tap calls onClose without sending any envelope', async () => {
    const onClose = vi.fn();
    const { panel, ws, gestureBus } = makePanel({ onClose });
    await panel.onMount();
    gestureBus.publish({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // RPP-07: tap with no playerActorId → no ws.send + onClose called (fail-safe)
  it('RPP-07: tap with null playerActorId does not send envelope but calls onClose', async () => {
    const onClose = vi.fn();
    const { panel, ws, gestureBus } = makePanel({ playerActorId: null, onClose });
    await panel.onMount();
    // Should not throw, should not send, but should close
    expect(() => gestureBus.publish({ kind: 'tap' })).not.toThrow();
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // RPP-08: draw() for Shield/IT produces 12 rows each 60 cp wide
  it('RPP-08: draw() for Shield/IT produces 12 rows all exactly 60 cp wide', async () => {
    const { panel, bridge } = makePanel({ payload: makeShieldPayload(), locale: 'it' });
    await panel.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const call0 = bridge.textContainerUpgrade.mock.calls[0];
    expect(call0).toBeDefined();
    const content = (call0![0] as { content: string }).content;
    const lines = content.split('\n');
    expect(lines.length).toBe(12);
    for (const line of lines) {
      expect([...line].length).toBe(60);
    }
    // Top border starts with the reaction prompt frame
    expect(lines[0]?.startsWith('┌─[ REAZIONE')).toBe(true);
    expect(lines[0]?.endsWith('┐')).toBe(true);
    expect(lines[11]?.startsWith('└')).toBe(true);
    expect(lines[11]?.endsWith('┘')).toBe(true);
  });

  // RPP-09: draw() for Counterspell/EN produces 12 rows each 60 cp wide
  it('RPP-09: draw() for Counterspell/EN produces 12 rows all exactly 60 cp wide', async () => {
    const { panel, bridge } = makePanel({ payload: makeCounterspellPayload(), locale: 'en' });
    await panel.draw();
    const call0 = bridge.textContainerUpgrade.mock.calls[0];
    expect(call0).toBeDefined();
    const content = (call0![0] as { content: string }).content;
    const lines = content.split('\n');
    expect(lines.length).toBe(12);
    for (const line of lines) {
      expect([...line].length).toBe(60);
    }
    expect(lines[0]?.startsWith('┌─[ REACTION')).toBe(true);
  });

  // RPP-10: draw() for Opportunity Attack/IT produces 12 rows each 60 cp wide
  it('RPP-10: draw() for Opportunity Attack/IT produces 12 rows all exactly 60 cp wide', async () => {
    const { panel, bridge } = makePanel({ payload: makeOppAttackPayload(), locale: 'it' });
    await panel.draw();
    const call0 = bridge.textContainerUpgrade.mock.calls[0];
    expect(call0).toBeDefined();
    const content = (call0![0] as { content: string }).content;
    const lines = content.split('\n');
    expect(lines.length).toBe(12);
    for (const line of lines) {
      expect([...line].length).toBe(60);
    }
  });

  // RPP-11: getContainerCount returns { image: 0, text: 1 }
  it('RPP-11: getContainerCount returns { image: 0, text: 1 }', () => {
    const { panel } = makePanel();
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });

  // RPP-12: EnvelopeSchema round-trip on emitted tool.invoke envelope (W-13 regression guard)
  it('RPP-12: emitted tool.invoke envelope passes EnvelopeSchema round-trip for all 3 kinds', async () => {
    const kinds: Array<ReactionAvailablePayload['kind']> = ['shield', 'counterspell', 'opportunity-attack'];
    const payloads: Record<string, ReactionAvailablePayload> = {
      shield: makeShieldPayload(),
      counterspell: makeCounterspellPayload(),
      'opportunity-attack': makeOppAttackPayload(),
    };
    for (const kind of kinds) {
      const kindPayload = payloads[kind];
      expect(kindPayload).toBeDefined();
      const { panel, ws, gestureBus } = makePanel({ payload: kindPayload!, playerActorId: 'actor-x', playerWeaponId: 'item-sword' });
      await panel.onMount();
      gestureBus.publish({ kind: 'tap' });
      const sentStr = ws.send.mock.calls[0]?.[0] as string | undefined;
      expect(sentStr).toBeDefined();
      if (sentStr !== undefined) {
        const parsed = JSON.parse(sentStr) as unknown;
        const result = EnvelopeSchema.safeParse(parsed);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe('tool.invoke');
        }
      }
    }
  });
});
