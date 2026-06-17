/**
 * Tests for the player-view (headless) protocol schemas — strict shape, URL
 * validation, optional fields, and the status enum.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIENT_PLAYER_VIEW_TYPE,
  ClientPlayerViewMessageSchema,
  PLAYER_VIEW_STATUS_TYPE,
  PlayerViewStatusSchema,
} from './player-view.js';

describe('ClientPlayerViewMessageSchema', () => {
  it('PV-1: accepts enable with actorId + foundryUrl', () => {
    const m = ClientPlayerViewMessageSchema.parse({
      type: CLIENT_PLAYER_VIEW_TYPE,
      enabled: true,
      actorId: 'actor-shin',
      foundryUrl: 'https://aiacos-vecna.eu.forge-vtt.com',
    });
    expect(m.enabled).toBe(true);
    expect(m.actorId).toBe('actor-shin');
  });

  it('PV-2: accepts disable with no actor/url', () => {
    expect(
      ClientPlayerViewMessageSchema.safeParse({ type: CLIENT_PLAYER_VIEW_TYPE, enabled: false })
        .success,
    ).toBe(true);
  });

  it('PV-3: rejects a non-URL foundryUrl', () => {
    expect(
      ClientPlayerViewMessageSchema.safeParse({
        type: CLIENT_PLAYER_VIEW_TYPE,
        enabled: true,
        foundryUrl: 'not a url',
      }).success,
    ).toBe(false);
  });

  it('PV-4: rejects unknown keys (strict) — credentials must never ride here', () => {
    expect(
      ClientPlayerViewMessageSchema.safeParse({
        type: CLIENT_PLAYER_VIEW_TYPE,
        enabled: true,
        password: 'secret',
      }).success,
    ).toBe(false);
  });
});

describe('PlayerViewStatusSchema', () => {
  it('PVS-1: accepts a valid state + detail', () => {
    expect(
      PlayerViewStatusSchema.parse({ state: 'unavailable', detail: 'orchestrator P2' }),
    ).toEqual({ state: 'unavailable', detail: 'orchestrator P2' });
  });

  it('PVS-2: rejects an unknown state', () => {
    expect(PlayerViewStatusSchema.safeParse({ state: 'booting' }).success).toBe(false);
  });

  it('PVS-3: status type constant is stable', () => {
    expect(PLAYER_VIEW_STATUS_TYPE).toBe('player_view_status');
  });
});
