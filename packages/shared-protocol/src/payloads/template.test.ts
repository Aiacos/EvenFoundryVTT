/**
 * Unit tests for template placement payload schemas (Plan 07-03, Task 1).
 *
 * Tests cover:
 * - TemplatePlacementRequestedPayloadSchema: valid + invalid cases
 * - TemplatePlacementConfirmPayloadSchema: valid + invalid cases
 * - TemplatePlacementCancelPayloadSchema: valid + invalid cases
 * - Type constant exports verified
 *
 * @see packages/shared-protocol/src/payloads/template.ts
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_PLACEMENT_CANCEL_TYPE,
  TEMPLATE_PLACEMENT_CONFIRMED_TYPE,
  TEMPLATE_PLACEMENT_REQUESTED_TYPE,
  TemplatePlacementCancelPayloadSchema,
  TemplatePlacementConfirmPayloadSchema,
  TemplatePlacementRequestedPayloadSchema,
} from './template.js';

// ─── TemplatePlacementRequestedPayloadSchema ──────────────────────────────────

describe('TemplatePlacementRequestedPayloadSchema', () => {
  it('accepts a valid circle template request', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440000',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'circle',
      distance: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('circle');
      expect(result.data.angle).toBeUndefined();
    }
  });

  it('accepts a valid cone template request with angle', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440001',
      spellName: 'Burning Hands',
      templateIndex: 0,
      total: 1,
      type: 'cone',
      distance: 15,
      angle: 53.13,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.angle).toBe(53.13);
    }
  });

  it('accepts multi-template index 2 of 3 (Magic Missile)', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440002',
      spellName: 'Magic Missile',
      templateIndex: 2,
      total: 3,
      type: 'circle',
      distance: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts rect and ray template types', () => {
    const rect = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440003',
      spellName: 'Wall of Fire',
      templateIndex: 0,
      total: 1,
      type: 'rect',
      distance: 60,
    });
    expect(rect.success).toBe(true);

    const ray = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440004',
      spellName: 'Lightning Bolt',
      templateIndex: 0,
      total: 1,
      type: 'ray',
      distance: 100,
    });
    expect(ray.success).toBe(true);
  });

  it('rejects missing placementId', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'circle',
      distance: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID placementId', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: 'not-a-uuid',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'circle',
      distance: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid shape enum value', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440005',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'triangle', // not in enum
      distance: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative distance', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440006',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'circle',
      distance: -5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects total = 0', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440007',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 0, // min(1) violated
      type: 'circle',
      distance: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict object)', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440008',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'circle',
      distance: 20,
      extraField: 'not allowed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative angle', () => {
    const result = TemplatePlacementRequestedPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440009',
      spellName: 'Burning Hands',
      templateIndex: 0,
      total: 1,
      type: 'cone',
      distance: 15,
      angle: -30,
    });
    expect(result.success).toBe(false);
  });
});

// ─── TemplatePlacementConfirmPayloadSchema ────────────────────────────────────

describe('TemplatePlacementConfirmPayloadSchema', () => {
  it('accepts a valid confirm payload', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440010',
      templateIndex: 0,
      x: 150,
      y: 250,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.x).toBe(150);
      expect(result.data.y).toBe(250);
    }
  });

  it('accepts negative coordinates (off-screen initial state)', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440011',
      templateIndex: 0,
      x: -100,
      y: -200,
    });
    expect(result.success).toBe(true);
  });

  it('accepts templateIndex = 2 for multi-template spells', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440012',
      templateIndex: 2,
      x: 300,
      y: 400,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing placementId', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      templateIndex: 0,
      x: 150,
      y: 250,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID placementId', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      placementId: 'not-a-uuid',
      templateIndex: 0,
      x: 150,
      y: 250,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative templateIndex', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440013',
      templateIndex: -1,
      x: 150,
      y: 250,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict object)', () => {
    const result = TemplatePlacementConfirmPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440014',
      templateIndex: 0,
      x: 150,
      y: 250,
      extra: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});

// ─── TemplatePlacementCancelPayloadSchema ─────────────────────────────────────

describe('TemplatePlacementCancelPayloadSchema', () => {
  it('accepts a valid cancel payload', () => {
    const result = TemplatePlacementCancelPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440015',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.placementId).toBe('550e8400-e29b-41d4-a716-446655440015');
    }
  });

  it('rejects missing placementId', () => {
    const result = TemplatePlacementCancelPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID placementId', () => {
    const result = TemplatePlacementCancelPayloadSchema.safeParse({
      placementId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict object)', () => {
    const result = TemplatePlacementCancelPayloadSchema.safeParse({
      placementId: '550e8400-e29b-41d4-a716-446655440016',
      extra: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Type constant exports ────────────────────────────────────────────────────

describe('type constants', () => {
  it('exports TEMPLATE_PLACEMENT_REQUESTED_TYPE', () => {
    expect(TEMPLATE_PLACEMENT_REQUESTED_TYPE).toBe('template.placement.requested');
  });

  it('exports TEMPLATE_PLACEMENT_CONFIRMED_TYPE', () => {
    expect(TEMPLATE_PLACEMENT_CONFIRMED_TYPE).toBe('template.placement.confirmed');
  });

  it('exports TEMPLATE_PLACEMENT_CANCEL_TYPE', () => {
    expect(TEMPLATE_PLACEMENT_CANCEL_TYPE).toBe('template.placement.cancel');
  });
});
