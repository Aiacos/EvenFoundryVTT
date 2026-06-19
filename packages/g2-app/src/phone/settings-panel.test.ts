/**
 * Unit tests for the phone settings panel — unified roster + map-view selector.
 *
 * Feature 001 D2: ONE selector (synthetic "Party" entry + each PC) replaces the
 * old character selector + separate map-view mode dropdown. Selecting Party →
 * `streaming`; selecting a PC → `actor` (+ live sheet re-pin).
 *
 * Runs in happy-dom (g2-app vitest default environment). `fetchRoster` is
 * injected so no network is touched; the display-settings controls are seeded
 * with an empty snapshot.
 */

import type { SettingsDisplay } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PARTY_SELECTION } from './player-view-selection.js';
import { createPhoneSettingsPanel, type RosterEntry } from './settings-panel.js';

/** Empty display snapshot — the selector under test is independent of these. */
const EMPTY: SettingsDisplay = {};

const ROSTER: RosterEntry[] = [
  { actorId: 'actor-shin', name: 'Shin' },
  { actorId: 'actor-mira', name: 'Mira' },
];

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Resolve all pending microtasks (lets the injected `fetchRoster` settle). */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function getSelect(): HTMLSelectElement {
  const el = document.querySelector<HTMLSelectElement>('select.evf-character-select');
  if (!el) throw new Error('character select not found');
  return el;
}

describe('createPhoneSettingsPanel — unified roster + map-view selector', () => {
  it('populates the select with a synthetic Party entry then the roster; preselects initialActorId', async () => {
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
      onSelectActor: () => {},
      initialActorId: 'actor-mira',
    });

    await flush();

    const select = getSelect();
    expect(select.options).toHaveLength(3);
    expect(select.options[0]?.value).toBe(PARTY_SELECTION);
    expect(select.options[1]?.value).toBe('actor-shin');
    expect(select.options[2]?.value).toBe('actor-mira');
    expect(select.value).toBe('actor-mira');
  });

  it('defaults the boot selection to Party when no initialActorId is given', async () => {
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
    });
    await flush();
    expect(getSelect().value).toBe(PARTY_SELECTION);
  });

  it('selecting a PC re-pins the sheet (onSelectActor) AND drives actor mode (onPlayerViewMode)', async () => {
    const onSelectActor = vi.fn();
    const onPlayerViewMode = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
      onSelectActor,
      onPlayerViewMode,
      foundryUrl: 'https://forge.example',
    });

    await flush();

    const select = getSelect();
    select.value = 'actor-mira';
    select.dispatchEvent(new Event('change'));

    expect(onSelectActor).toHaveBeenCalledTimes(1);
    expect(onSelectActor).toHaveBeenCalledWith('actor-mira');
    expect(onPlayerViewMode).toHaveBeenCalledWith({
      mode: 'actor',
      actorId: 'actor-mira',
      foundryUrl: 'https://forge.example',
    });
  });

  it('selecting Party drives streaming (no actorId) and does NOT re-pin a sheet actor', async () => {
    const onSelectActor = vi.fn();
    const onPlayerViewMode = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
      onSelectActor,
      onPlayerViewMode,
      initialActorId: 'actor-shin',
      foundryUrl: 'https://forge.example',
    });

    await flush();

    const select = getSelect();
    expect(select.value).toBe('actor-shin'); // preselected PC
    select.value = PARTY_SELECTION;
    select.dispatchEvent(new Event('change'));

    expect(onSelectActor).not.toHaveBeenCalled();
    expect(onPlayerViewMode).toHaveBeenCalledWith({
      mode: 'streaming',
      actorId: '',
      foundryUrl: 'https://forge.example',
    });
  });

  it('does NOT fire callbacks on programmatic preselect', async () => {
    const onSelectActor = vi.fn();
    const onPlayerViewMode = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
      onSelectActor,
      onPlayerViewMode,
      initialActorId: 'actor-mira',
    });

    await flush();

    expect(getSelect().value).toBe('actor-mira');
    expect(onSelectActor).not.toHaveBeenCalled();
    expect(onPlayerViewMode).not.toHaveBeenCalled();
  });

  it('renders the Foundry URL field pre-filled and is flat (no collapse chevron)', () => {
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      foundryUrl: 'https://my.foundry',
    });
    const url = document.querySelector<HTMLInputElement>('input.evf-foundry-url');
    expect(url).not.toBeNull();
    expect(url?.value).toBe('https://my.foundry');
    // Flat layout: no collapse chevron glyph in the header.
    expect(document.body.textContent).not.toContain('▾');
    expect(document.body.textContent).not.toContain('▸');
  });

  it('defaults the Foundry URL field when no foundryUrl is provided', () => {
    createPhoneSettingsPanel({ sendEdit: () => {}, initial: EMPTY });
    const url = document.querySelector<HTMLInputElement>('input.evf-foundry-url');
    expect(url?.value).toMatch(/^https?:\/\//);
  });

  it('calls onFoundryUrlChange with the trimmed URL on change', () => {
    const onFoundryUrlChange = vi.fn();
    createPhoneSettingsPanel({ sendEdit: () => {}, initial: EMPTY, onFoundryUrlChange });
    const url = document.querySelector<HTMLInputElement>('input.evf-foundry-url');
    if (!url) throw new Error('foundry url input not found');
    url.value = '  https://new.forge  ';
    url.dispatchEvent(new Event('change'));
    expect(onFoundryUrlChange).toHaveBeenCalledWith('https://new.forge');
  });

  it('the separate map-view mode dropdown is gone (no .evf-player-view select)', async () => {
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
    });
    await flush();
    expect(document.querySelector('select.evf-player-view')).toBeNull();
  });

  it('setPlayerViewStatus updates the status line', async () => {
    const panel = createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(ROSTER),
    });
    await flush();
    panel.setPlayerViewStatus({ state: 'unavailable', detail: 'orchestrator P2' });
    const status = document.querySelector<HTMLElement>('.evf-player-view-status');
    expect(status?.textContent).toContain('unavailable');
    expect(status?.textContent).toContain('orchestrator P2');
  });

  it('keeps Party selectable and does not throw when fetchRoster rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSelectActor = vi.fn();

    expect(() =>
      createPhoneSettingsPanel({
        sendEdit: () => {},
        initial: EMPTY,
        fetchRoster: () => Promise.reject(new Error('boom')),
        onSelectActor,
        initialActorId: 'actor-shin',
      }),
    ).not.toThrow();

    await flush();

    const select = getSelect();
    // Party stays as a usable entry even when the PC list fails to load.
    expect(select.options[0]?.value).toBe(PARTY_SELECTION);
    expect(warn).toHaveBeenCalled();
    expect(onSelectActor).not.toHaveBeenCalled();
  });
});
