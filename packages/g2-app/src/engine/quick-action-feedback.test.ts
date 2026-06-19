/**
 * quick-action-feedback tests — the [M]/[A] toast builders produce valid,
 * budget-fitting `Toast` payloads with IT primary / EN canonical fallback.
 */
import { describe, expect, it } from 'vitest';
import { ToastSchema } from '../status-hud/toast-types.js';
import {
  ACTION_PENDING_MESSAGE,
  buildActionPendingToast,
  buildMapAlreadyFullscreenToast,
  MAP_ALREADY_FULLSCREEN_MESSAGE,
} from './quick-action-feedback.js';

describe('quick-action-feedback builders', () => {
  it('QAF-1: map toast — IT primary, valid schema, info severity', () => {
    const t = buildMapAlreadyFullscreenToast('it', 100);
    expect(ToastSchema.safeParse(t).success).toBe(true);
    expect(t.severity).toBe('info');
    expect(t.message).toBe(MAP_ALREADY_FULLSCREEN_MESSAGE.it);
    expect(t.emittedAt).toBe(100);
  });

  it('QAF-2: map toast — EN for en, and EN canonical fallback for other locales', () => {
    expect(buildMapAlreadyFullscreenToast('en', 1).message).toBe(MAP_ALREADY_FULLSCREEN_MESSAGE.en);
    expect(buildMapAlreadyFullscreenToast('de', 1).message).toBe(MAP_ALREADY_FULLSCREEN_MESSAGE.en);
    expect(buildMapAlreadyFullscreenToast('pt-br', 1).message).toBe(
      MAP_ALREADY_FULLSCREEN_MESSAGE.en,
    );
  });

  it('QAF-3: action toast — IT primary + EN fallback, valid schema', () => {
    const it = buildActionPendingToast('it', 1);
    const de = buildActionPendingToast('de', 1);
    expect(ToastSchema.safeParse(it).success).toBe(true);
    expect(it.message).toBe(ACTION_PENDING_MESSAGE.it);
    expect(de.message).toBe(ACTION_PENDING_MESSAGE.en); // fallback
  });

  it('QAF-4: all message bodies fit the 38-char ToastSchema budget', () => {
    for (const m of [
      MAP_ALREADY_FULLSCREEN_MESSAGE.it,
      MAP_ALREADY_FULLSCREEN_MESSAGE.en,
      ACTION_PENDING_MESSAGE.it,
      ACTION_PENDING_MESSAGE.en,
    ]) {
      expect(m.length).toBeLessThanOrEqual(38);
    }
  });

  it('QAF-5: ids are distinct per kind so successive enqueues do not collide trivially', () => {
    expect(buildMapAlreadyFullscreenToast('it', 5).id).not.toBe(
      buildActionPendingToast('it', 5).id,
    );
  });
});
