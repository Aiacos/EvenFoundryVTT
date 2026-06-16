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
