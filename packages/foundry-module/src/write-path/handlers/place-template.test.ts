/**
 * Unit tests for placeTemplateHandler + confirmTemplatePlacementHandler (Plan 07-03, Task 1).
 *
 * Tests cover:
 * - placeTemplateHandler: happy path (3 templates from Magic Missile)
 * - placeTemplateHandler: fromActivity returns null → no_templates
 * - placeTemplateHandler: missing actor → actor_not_found
 * - placeTemplateHandler: missing item → item_not_found
 * - placeTemplateHandler: no first activity → no_activity
 * - placeTemplateHandler: PLACEMENT_CONTEXTS TTL eviction after 61s (vi.useFakeTimers)
 * - confirmTemplatePlacementHandler: happy path (calls createEmbeddedDocuments with x/y)
 * - confirmTemplatePlacementHandler: unknown placementId → placement_expired
 * - confirmTemplatePlacementHandler: out-of-range index → invalid_template_index
 * - confirmTemplatePlacementHandler: createEmbeddedDocuments throws → error result
 * - clearPlacementContexts() clears all contexts
 * - Verify NO drawPreview() call anywhere
 *
 * @see packages/foundry-module/src/write-path/handlers/place-template.ts
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAbilityTemplate(
  opts: {
    t?: 'circle' | 'cone' | 'rect' | 'ray';
    distance?: number;
    angle?: number;
    createThrows?: Error;
  } = {},
) {
  const templateData: Record<string, unknown> = {
    x: 0,
    y: 0,
    t: opts.t ?? 'circle',
    distance: opts.distance ?? 20,
  };
  if (opts.angle !== undefined) {
    templateData.angle = opts.angle;
  }
  return {
    document: {
      x: 0 as number,
      y: 0 as number,
      t: opts.t ?? ('circle' as const),
      distance: opts.distance ?? 20,
      angle: opts.angle,
      toObject: vi.fn(() => ({ ...templateData })),
    },
    activity: {},
  };
}

function makeActivity(opts: { templates?: ReturnType<typeof makeAbilityTemplate>[] | null } = {}) {
  return {
    type: 'spell',
    use: vi.fn().mockResolvedValue({ id: 'chat-1' }),
    _templatesForTest: opts.templates, // used to prime fromActivity mock
  };
}

function makeItem(opts: { id?: string; activity?: ReturnType<typeof makeActivity> | null } = {}) {
  return {
    id: opts.id ?? 'item-1',
    name: 'Fireball',
    type: 'spell',
    system: {
      activities:
        opts.activity === null ? undefined : { contents: [opts.activity ?? makeActivity()] },
    },
  };
}

function makeActor(opts: { id?: string; item?: ReturnType<typeof makeItem> | null } = {}) {
  const item = opts.item !== null ? (opts.item ?? makeItem()) : null;
  return {
    id: opts.id ?? 'actor-1',
    name: 'Wizard',
    type: 'character',
    items: item !== null ? { contents: [item] } : { contents: [] },
  };
}

function makeSceneGlobal(opts: { createThrows?: Error; createdId?: string } = {}) {
  return {
    createEmbeddedDocuments: vi.fn().mockImplementation(async () => {
      if (opts.createThrows) throw opts.createThrows;
      return [{ id: opts.createdId ?? 'tmpl-doc-1' }];
    }),
  };
}

function makeGameGlobal(
  actor: ReturnType<typeof makeActor> | null,
  scene?: ReturnType<typeof makeSceneGlobal> | null,
) {
  return {
    actors: {
      get: vi.fn((id: string) => (actor?.id === id ? actor : undefined)),
    },
    scenes: { active: scene ?? makeSceneGlobal() },
    users: { contents: [] },
    settings: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    combat: null,
    user: { id: 'user-gm', isGM: true, targets: new Set() },
    messages: { contents: [], get: vi.fn() },
  };
}

function makeCanvasGlobal(scene?: ReturnType<typeof makeSceneGlobal> | null) {
  return {
    scene: scene ?? makeSceneGlobal(),
    stage: { pivot: { x: 0, y: 0 }, scale: { x: 1 } },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('placeTemplateHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns success with placementId and 1 template on happy path (Fireball)', async () => {
    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as {
        placementId: string;
        total: number;
        templates: Array<{ index: number; type: string; distance: number }>;
      };
      expect(data.total).toBe(1);
      expect(data.placementId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(data.templates).toHaveLength(1);
      expect(data.templates[0]).toMatchObject({ index: 0, type: 'circle', distance: 20 });
    }
  });

  it('returns 3 templates for Magic Missile (multi-template)', async () => {
    const templates = [
      makeAbilityTemplate({ t: 'circle', distance: 5 }),
      makeAbilityTemplate({ t: 'circle', distance: 5 }),
      makeAbilityTemplate({ t: 'circle', distance: 5 }),
    ];
    const activity = makeActivity({ templates });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue(templates),
        },
      },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { total: number };
      expect(data.total).toBe(3);
    }
  });

  it('returns no_templates when fromActivity returns null', async () => {
    const activity = makeActivity({ templates: null });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue(null),
        },
      },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });

    expect(result).toEqual({ success: false, error: 'no_templates' });
  });

  it('returns no_templates when fromActivity returns empty array', async () => {
    const activity = makeActivity({ templates: [] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([]),
        },
      },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });

    expect(result).toEqual({ success: false, error: 'no_templates' });
  });

  it('returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: { AbilityTemplate: { fromActivity: vi.fn() } },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'unknown-actor',
      spell_id: 'spell-1',
    });

    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  it('returns item_not_found when item is missing from actor', async () => {
    const actor = makeActor({ id: 'actor-a', item: null });
    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: { AbilityTemplate: { fromActivity: vi.fn() } },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'no-such-spell',
    });

    expect(result).toEqual({ success: false, error: 'item_not_found' });
  });

  it('returns no_activity when item has no activities', async () => {
    const item = makeItem({ id: 'spell-1', activity: null });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: { AbilityTemplate: { fromActivity: vi.fn() } },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    const result = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });

    expect(result).toEqual({ success: false, error: 'no_activity' });
  });

  it('clears PLACEMENT_CONTEXTS via clearPlacementContexts()', async () => {
    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    // Place template to create context
    const placeResult = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });
    expect(placeResult.success).toBe(true);

    // Clear contexts
    clearPlacementContexts();

    // Confirm should now return placement_expired
    const { confirmTemplatePlacementHandler } = await import('./place-template.js');
    const placementId =
      (placeResult.success && (placeResult.data as { placementId: string }).placementId) || 'xxx';
    const confirmResult = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 0,
      x: 100,
      y: 200,
    });
    expect(confirmResult).toEqual({ success: false, error: 'placement_expired' });
  });

  it('expires PLACEMENT_CONTEXTS after 61s (fake timers)', async () => {
    vi.useFakeTimers();

    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    const scene = makeSceneGlobal();

    vi.stubGlobal('game', makeGameGlobal(actor, scene));
    vi.stubGlobal('canvas', makeCanvasGlobal(scene));
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, confirmTemplatePlacementHandler, clearPlacementContexts } =
      await import('./place-template.js');
    clearPlacementContexts();

    const placeResult = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });
    expect(placeResult.success).toBe(true);
    if (!placeResult.success) throw new Error('Expected success');
    const placementId = (placeResult.data as { placementId: string }).placementId;

    // Advance time past 60s TTL
    vi.advanceTimersByTime(61_000);

    const confirmResult = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 0,
      x: 100,
      y: 200,
    });

    expect(confirmResult).toEqual({ success: false, error: 'placement_expired' });
    vi.useRealTimers();
  });
});

// ─── confirmTemplatePlacementHandler ─────────────────────────────────────────

describe('confirmTemplatePlacementHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits template with overridden x/y via createEmbeddedDocuments', async () => {
    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    const scene = makeSceneGlobal({ createdId: 'tmpl-doc-42' });

    vi.stubGlobal('game', makeGameGlobal(actor, scene));
    vi.stubGlobal('canvas', makeCanvasGlobal(scene));
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, confirmTemplatePlacementHandler, clearPlacementContexts } =
      await import('./place-template.js');
    clearPlacementContexts();

    // First place the template
    const placeResult = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });
    expect(placeResult.success).toBe(true);
    if (!placeResult.success) throw new Error('Expected success');
    const placementId = (placeResult.data as { placementId: string }).placementId;

    // Then confirm
    const confirmResult = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 0,
      x: 150,
      y: 300,
    });

    expect(confirmResult.success).toBe(true);
    if (confirmResult.success) {
      const data = confirmResult.data as {
        templateId: string | null;
        templateIndex: number;
        x: number;
        y: number;
      };
      expect(data.templateId).toBe('tmpl-doc-42');
      expect(data.templateIndex).toBe(0);
      expect(data.x).toBe(150);
      expect(data.y).toBe(300);
    }

    // Verify createEmbeddedDocuments was called with overridden x/y
    expect(scene.createEmbeddedDocuments).toHaveBeenCalledWith(
      'MeasuredTemplate',
      expect.arrayContaining([expect.objectContaining({ x: 150, y: 300 })]),
    );
  });

  it('returns placement_expired for unknown placementId', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', {
      canvas: { AbilityTemplate: { fromActivity: vi.fn() } },
    });

    const { confirmTemplatePlacementHandler, clearPlacementContexts } = await import(
      './place-template.js'
    );
    clearPlacementContexts();

    const result = await confirmTemplatePlacementHandler.handle({
      placementId: '550e8400-e29b-41d4-a716-446655440099',
      templateIndex: 0,
      x: 100,
      y: 200,
    });

    expect(result).toEqual({ success: false, error: 'placement_expired' });
  });

  it('returns invalid_template_index for out-of-range index', async () => {
    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    const scene = makeSceneGlobal();

    vi.stubGlobal('game', makeGameGlobal(actor, scene));
    vi.stubGlobal('canvas', makeCanvasGlobal(scene));
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, confirmTemplatePlacementHandler, clearPlacementContexts } =
      await import('./place-template.js');
    clearPlacementContexts();

    const placeResult = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });
    if (!placeResult.success) throw new Error('Expected success');
    const placementId = (placeResult.data as { placementId: string }).placementId;

    // Template index 5 is out-of-range (only 1 template)
    const result = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 5,
      x: 100,
      y: 200,
    });

    expect(result).toEqual({ success: false, error: 'invalid_template_index' });
  });

  it('returns error when createEmbeddedDocuments throws', async () => {
    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    const scene = makeSceneGlobal({ createThrows: new Error('Scene not active') });

    vi.stubGlobal('game', makeGameGlobal(actor, scene));
    vi.stubGlobal('canvas', makeCanvasGlobal(scene));
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, confirmTemplatePlacementHandler, clearPlacementContexts } =
      await import('./place-template.js');
    clearPlacementContexts();

    const placeResult = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });
    if (!placeResult.success) throw new Error('Expected success');
    const placementId = (placeResult.data as { placementId: string }).placementId;

    const result = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 0,
      x: 100,
      y: 200,
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain('Scene not active');
  });

  it('argsSchema rejects missing placementId', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    vi.stubGlobal('canvas', makeCanvasGlobal());
    vi.stubGlobal('dnd5e', { canvas: { AbilityTemplate: { fromActivity: vi.fn() } } });

    const { confirmTemplatePlacementHandler } = await import('./place-template.js');
    const parsed = confirmTemplatePlacementHandler.argsSchema.safeParse({
      templateIndex: 0,
      x: 100,
      y: 200,
    });
    expect(parsed.success).toBe(false);
  });

  it('does NOT call drawPreview() anywhere in the handler', async () => {
    // This test verifies the anti-pattern is absent.
    // Importing the module and verifying no drawPreview stub was called
    // (the global is not defined so it would throw if called).
    const drawPreviewSpy = vi.fn();
    vi.stubGlobal('drawPreview', drawPreviewSpy); // should never be called

    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    const scene = makeSceneGlobal();

    vi.stubGlobal('game', makeGameGlobal(actor, scene));
    vi.stubGlobal('canvas', makeCanvasGlobal(scene));
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, clearPlacementContexts } = await import('./place-template.js');
    clearPlacementContexts();

    await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });

    expect(drawPreviewSpy).not.toHaveBeenCalled();
  });

  // ── CR-04 regression: double-confirm must return placement_expired ────────────

  it('CR-04: second confirm with same placementId returns placement_expired (context evicted)', async () => {
    const template = makeAbilityTemplate({ t: 'circle', distance: 20 });
    const activity = makeActivity({ templates: [template] });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    const scene = makeSceneGlobal({ createdId: 'tmpl-doc-1' });

    vi.stubGlobal('game', makeGameGlobal(actor, scene));
    vi.stubGlobal('canvas', makeCanvasGlobal(scene));
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn().mockReturnValue([template]),
        },
      },
    });

    const { placeTemplateHandler, confirmTemplatePlacementHandler, clearPlacementContexts } =
      await import('./place-template.js');
    clearPlacementContexts();

    // Place the template
    const placeResult = await placeTemplateHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
    });
    expect(placeResult.success).toBe(true);
    if (!placeResult.success) throw new Error('Expected success');
    const placementId = (placeResult.data as { placementId: string }).placementId;

    // First confirm — must succeed
    const firstConfirm = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 0,
      x: 100,
      y: 200,
    });
    expect(firstConfirm.success).toBe(true);
    expect(scene.createEmbeddedDocuments).toHaveBeenCalledTimes(1);

    // Second confirm with same placementId — must return placement_expired (context was evicted)
    const secondConfirm = await confirmTemplatePlacementHandler.handle({
      placementId,
      templateIndex: 0,
      x: 150,
      y: 250,
    });
    expect(secondConfirm).toEqual({ success: false, error: 'placement_expired' });
    // createEmbeddedDocuments must NOT have been called a second time
    expect(scene.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });
});
