import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeMidiQol, extractChatCardId, isNoGmError } from './common.js';

function stubModules(midiActive: boolean | null): void {
  vi.stubGlobal('game', {
    modules: {
      get: (id: string) =>
        id === 'midi-qol' && midiActive !== null ? { active: midiActive } : undefined,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isNoGmError', () => {
  it('recognizes both the Foundry message and the normalized code', () => {
    expect(isNoGmError(new Error('No connected GM to handle this'))).toBe(true);
    expect(isNoGmError('no_gm_connected')).toBe(true);
    expect(isNoGmError(new Error('slot exhausted'))).toBe(false);
    expect(isNoGmError(undefined)).toBe(false);
  });
});

describe('extractChatCardId', () => {
  it('returns a string id and null for anything else', () => {
    expect(extractChatCardId({ id: 'msg1' })).toBe('msg1');
    expect(extractChatCardId({ id: 7 })).toBeNull();
    expect(extractChatCardId(null)).toBeNull();
    expect(extractChatCardId('msg1')).toBeNull();
  });
});

describe('activeMidiQol', () => {
  const api = { completeActivityUse: vi.fn() };

  it('returns the API only when the global exists and the module is active', () => {
    vi.stubGlobal('MidiQOL', api);
    stubModules(true);
    expect(activeMidiQol()).toBe(api);
  });

  it('returns null when the module is installed but inactive', () => {
    vi.stubGlobal('MidiQOL', api);
    stubModules(false);
    expect(activeMidiQol()).toBeNull();
  });

  it('returns null when the module is active but its global is not initialized yet', () => {
    vi.stubGlobal('MidiQOL', undefined);
    stubModules(true);
    expect(activeMidiQol()).toBeNull();
  });

  it('returns null when midi-qol is not installed', () => {
    vi.stubGlobal('MidiQOL', api);
    stubModules(null);
    expect(activeMidiQol()).toBeNull();
  });
});
