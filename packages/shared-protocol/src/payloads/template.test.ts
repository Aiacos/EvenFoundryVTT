/**
 * Unit tests for the template placement confirmation schema (ACT-02).
 *
 * @see packages/shared-protocol/src/payloads/template.ts
 */

import { describe, expect, it } from 'vitest';
import { TemplatePlacementConfirmPayloadSchema } from './template.js';

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
