/**
 * Unit tests for moveTokenHandler (Plan 07-02, Task 1).
 *
 * Tests cover:
 * - Happy path: scene + token found → tokenDoc.update() called → success result
 * - No active scene → { success: false, error: 'no_active_scene' }
 * - Missing token → { success: false, error: 'token_not_found' }
 * - tokenDoc.update() rejects → { success: false, error: <message> }
 *
 * Note: move-token does NOT call activity.use() — it calls tokenDoc.update() directly.
 * This is intentional per ADR-0011 (move is a direct document update, not a dnd5e activity).
 *
 * @see packages/foundry-module/src/write-path/handlers/move-token.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTokenDoc(opts: { id?: string; updateThrows?: Error | string } = {}) {
  return {
    id: opts.id ?? 'token-1',
    update: vi.fn().mockImplementation(async () => {
      if (opts.updateThrows !== undefined) {
        throw opts.updateThrows instanceof Error ? opts.updateThrows : new Error(opts.updateThrows);
      }
      return {};
    }),
  };
}

function makeScene(opts: { tokenDoc?: ReturnType<typeof makeTokenDoc> | null } = {}) {
  const tokenDoc = opts.tokenDoc !== null ? (opts.tokenDoc ?? makeTokenDoc()) : null;
  return {
    id: 'scene-1',
    name: 'Dungeon',
    tokens: {
      get: vi.fn((id: string) => (tokenDoc?.id === id ? tokenDoc : undefined)),
      contents: tokenDoc !== null ? [tokenDoc] : [],
    },
  };
}

function makeGameGlobal(scene: ReturnType<typeof makeScene> | null = makeScene()) {
  return {
    actors: { get: vi.fn(() => undefined) },
    scenes: {
      active: scene,
      get: vi.fn(() => undefined),
      contents: scene !== null ? [scene] : [],
    },
    users: { contents: [] },
    settings: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    combat: null,
    user: { isGM: false, targets: new Set() },
    messages: { contents: [], get: vi.fn() },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('moveTokenHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns success with token position on happy path', async () => {
    const tokenDoc = makeTokenDoc({ id: 'tok-1' });
    const scene = makeScene({ tokenDoc });

    vi.stubGlobal('game', makeGameGlobal(scene));

    const { moveTokenHandler } = await import('./move-token.js');

    const result = await moveTokenHandler.handle({
      token_id: 'tok-1',
      x: 100,
      y: 200,
    });

    expect(result).toEqual({
      success: true,
      data: { token_id: 'tok-1', x: 100, y: 200 },
    });
    expect(tokenDoc.update).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it('returns no_active_scene when no scene is active', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));

    const { moveTokenHandler } = await import('./move-token.js');

    const result = await moveTokenHandler.handle({
      token_id: 'tok-1',
      x: 100,
      y: 200,
    });

    expect(result).toEqual({ success: false, error: 'no_active_scene' });
  });

  it('returns token_not_found when token does not exist in scene', async () => {
    const scene = makeScene({ tokenDoc: null });
    vi.stubGlobal('game', makeGameGlobal(scene));

    const { moveTokenHandler } = await import('./move-token.js');

    const result = await moveTokenHandler.handle({
      token_id: 'non-existent-token',
      x: 50,
      y: 75,
    });

    expect(result).toEqual({ success: false, error: 'token_not_found' });
  });

  it('returns error string when tokenDoc.update() rejects', async () => {
    const tokenDoc = makeTokenDoc({ id: 'tok-1', updateThrows: new Error('update failed') });
    const scene = makeScene({ tokenDoc });
    vi.stubGlobal('game', makeGameGlobal(scene));

    const { moveTokenHandler } = await import('./move-token.js');

    const result = await moveTokenHandler.handle({
      token_id: 'tok-1',
      x: 100,
      y: 200,
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain('update failed');
  });

  it('does NOT call activity.use() (move-token is a direct doc update)', async () => {
    // This test ensures move-token does not accidentally use activity.use()
    // The module source file is inspected by CI Gate 8, but this test
    // confirms runtime behaviour also doesn't route through activity.
    const tokenDoc = makeTokenDoc({ id: 'tok-1' });
    const scene = makeScene({ tokenDoc });
    vi.stubGlobal('game', makeGameGlobal(scene));

    const { moveTokenHandler } = await import('./move-token.js');

    await moveTokenHandler.handle({ token_id: 'tok-1', x: 10, y: 20 });

    // tokenDoc.update called once, with just x/y
    expect(tokenDoc.update).toHaveBeenCalledTimes(1);
    expect(tokenDoc.update).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  it('argsSchema validates correct input', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { moveTokenHandler } = await import('./move-token.js');

    const parsed = moveTokenHandler.argsSchema.safeParse({
      token_id: 'tok-1',
      x: 300,
      y: 150,
    });
    expect(parsed.success).toBe(true);
  });

  it('argsSchema rejects empty token_id', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { moveTokenHandler } = await import('./move-token.js');

    const parsed = moveTokenHandler.argsSchema.safeParse({
      token_id: '',
      x: 100,
      y: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it('argsSchema rejects non-numeric x', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { moveTokenHandler } = await import('./move-token.js');

    const parsed = moveTokenHandler.argsSchema.safeParse({
      token_id: 'tok-1',
      x: 'not-a-number',
      y: 100,
    });
    expect(parsed.success).toBe(false);
  });
});
