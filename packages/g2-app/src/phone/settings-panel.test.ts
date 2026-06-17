/**
 * Unit tests for the phone settings panel — character/role selector.
 *
 * Runs in happy-dom (g2-app vitest default environment). `fetchRoster` is
 * injected so no network is touched; the display-settings controls are seeded
 * with an empty snapshot.
 */

import type { SettingsDisplay } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhoneSettingsPanel, type RosterEntry } from './settings-panel.js';

/** Empty display snapshot — the selector under test is independent of these. */
const EMPTY: SettingsDisplay = {};

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

describe('createPhoneSettingsPanel — character/role selector', () => {
  it('populates the select from fetchRoster and preselects initialActorId', async () => {
    const roster: RosterEntry[] = [
      { actorId: 'actor-shin', name: 'Shin' },
      { actorId: 'actor-mira', name: 'Mira' },
    ];
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () => Promise.resolve(roster),
      onSelectActor: () => {},
      initialActorId: 'actor-mira',
    });

    await flush();

    const select = getSelect();
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.value).toBe('actor-shin');
    expect(select.options[1]?.value).toBe('actor-mira');
    expect(select.value).toBe('actor-mira');
  });

  it('calls onSelectActor with the new actorId on change', async () => {
    const onSelectActor = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () =>
        Promise.resolve([
          { actorId: 'actor-shin', name: 'Shin' },
          { actorId: 'actor-mira', name: 'Mira' },
        ]),
      onSelectActor,
      initialActorId: 'actor-shin',
    });

    await flush();

    const select = getSelect();
    select.value = 'actor-mira';
    select.dispatchEvent(new Event('change'));

    expect(onSelectActor).toHaveBeenCalledTimes(1);
    expect(onSelectActor).toHaveBeenCalledWith('actor-mira');
  });

  it('does NOT fire onSelectActor on programmatic preselect', async () => {
    const onSelectActor = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () =>
        Promise.resolve([
          { actorId: 'actor-shin', name: 'Shin' },
          { actorId: 'actor-mira', name: 'Mira' },
        ]),
      onSelectActor,
      initialActorId: 'actor-mira',
    });

    await flush();

    expect(getSelect().value).toBe('actor-mira');
    expect(onSelectActor).not.toHaveBeenCalled();
  });

  it('re-drives the headless (onPlayerViewMode) on character change when map source is actor', async () => {
    const onSelectActor = vi.fn();
    const onPlayerViewMode = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () =>
        Promise.resolve([
          { actorId: 'actor-shin', name: 'Shin' },
          { actorId: 'actor-mira', name: 'Mira' },
        ]),
      onSelectActor,
      onPlayerViewMode,
      initialActorId: 'actor-shin',
      playerViewInitialMode: 'actor',
      foundryUrl: 'https://forge.example',
    });

    await flush();

    const select = getSelect();
    select.value = 'actor-mira';
    select.dispatchEvent(new Event('change'));

    // The sheet re-pin AND the headless re-drive BOTH fire (ADR-0015 §C bug fix).
    // Password-free: the request carries no credentials.
    expect(onSelectActor).toHaveBeenCalledWith('actor-mira');
    expect(onPlayerViewMode).toHaveBeenCalledWith({
      mode: 'actor',
      actorId: 'actor-mira',
      foundryUrl: 'https://forge.example',
    });
  });

  it('does NOT re-drive the headless on character change when map source is streaming', async () => {
    const onPlayerViewMode = vi.fn();
    createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      fetchRoster: () =>
        Promise.resolve([
          { actorId: 'actor-shin', name: 'Shin' },
          { actorId: 'actor-mira', name: 'Mira' },
        ]),
      onSelectActor: () => {},
      onPlayerViewMode,
      initialActorId: 'actor-shin',
      playerViewInitialMode: 'streaming',
    });

    await flush();

    const select = getSelect();
    select.value = 'actor-mira';
    select.dispatchEvent(new Event('change'));

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

  it('map-view source select fires onPlayerViewMode with the mode + actorId + URL', async () => {
    const onPlayerViewMode = vi.fn();
    const panel = createPhoneSettingsPanel({
      sendEdit: () => {},
      initial: EMPTY,
      foundryUrl: 'https://forge.example',
      fetchRoster: () => Promise.resolve([{ actorId: 'actor-shin', name: 'Shin' }]),
      initialActorId: 'actor-shin',
      onPlayerViewMode,
    });
    await flush();
    const select = document.querySelector<HTMLSelectElement>('select.evf-player-view');
    if (!select) throw new Error('player-view select not found');
    expect(select.value).toBe('streaming'); // default
    // First option is the selected PC, last is GM (live).
    expect(select.options[0]?.value).toBe('actor');
    expect(select.options[2]?.value).toBe('off');
    select.value = 'off';
    select.dispatchEvent(new Event('change'));
    // off/streaming requests carry NO credentials (only the mode/actor/url).
    expect(onPlayerViewMode).toHaveBeenCalledWith({
      mode: 'off',
      actorId: 'actor-shin',
      foundryUrl: 'https://forge.example',
    });
    // setPlayerViewStatus updates the status line.
    panel.setPlayerViewStatus({ state: 'unavailable', detail: 'orchestrator P2' });
    const status = document.querySelector<HTMLElement>('.evf-player-view-status');
    expect(status?.textContent).toContain('unavailable');
    expect(status?.textContent).toContain('orchestrator P2');
  });

  it('leaves a disabled option and does not throw when fetchRoster rejects', async () => {
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
    expect(select.options).toHaveLength(1);
    expect(select.options[0]?.disabled).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(onSelectActor).not.toHaveBeenCalled();
  });
});
