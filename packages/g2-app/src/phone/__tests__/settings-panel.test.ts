/**
 * createPhoneSettingsPanel unit tests (phone-side settings, 2026-06-14).
 *
 * @see packages/g2-app/src/phone/settings-panel.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhoneSettingsPanel } from '../settings-panel.js';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Find a control by its data-evf-key. */
function ctrl(key: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`[data-evf-key="${key}"]`);
  if (el === null) throw new Error(`control ${key} not found`);
  return el;
}

describe('createPhoneSettingsPanel', () => {
  it('PSP-01: mounts a panel with all five controls', () => {
    const panel = createPhoneSettingsPanel({ sendEdit: vi.fn(), initial: {} });
    for (const key of ['dither', 'brightness', 'webpQuality', 'captureFps', 'normalize']) {
      expect(document.querySelector(`[data-evf-key="${key}"]`)).not.toBeNull();
    }
    panel.dispose();
  });

  it('PSP-02: seeds controls from the initial snapshot', () => {
    createPhoneSettingsPanel({
      sendEdit: vi.fn(),
      initial: { dither: true, brightness: 40, webpQuality: 50, captureFps: 24, normalize: true },
    });
    expect(ctrl('dither').checked).toBe(true);
    expect(ctrl('brightness').value).toBe('40');
    expect(ctrl('webpQuality').value).toBe('50');
    expect(ctrl('captureFps').value).toBe('24');
    expect(ctrl('normalize').checked).toBe(true);
  });

  it('PSP-03: toggling dither sends the edit upstream', () => {
    const sendEdit = vi.fn();
    createPhoneSettingsPanel({ sendEdit, initial: { dither: false } });
    const el = ctrl('dither');
    el.checked = true;
    el.dispatchEvent(new Event('change'));
    expect(sendEdit).toHaveBeenCalledWith({ dither: true });
  });

  it('PSP-04: moving the brightness slider sends a numeric edit', () => {
    const sendEdit = vi.fn();
    createPhoneSettingsPanel({ sendEdit, initial: { brightness: 0 } });
    const el = ctrl('brightness');
    el.value = '60';
    el.dispatchEvent(new Event('input'));
    expect(sendEdit).toHaveBeenCalledWith({ brightness: 60 });
  });

  it('PSP-05: update() reflects downstream changes WITHOUT firing sendEdit', () => {
    const sendEdit = vi.fn();
    const panel = createPhoneSettingsPanel({ sendEdit, initial: {} });
    panel.update({ brightness: -40, dither: true });
    expect(ctrl('brightness').value).toBe('-40');
    expect(ctrl('dither').checked).toBe(true);
    expect(sendEdit).not.toHaveBeenCalled(); // update must not echo back upstream
  });

  it('PSP-06: dispose removes the panel from the DOM', () => {
    const panel = createPhoneSettingsPanel({ sendEdit: vi.fn(), initial: {} });
    expect(document.querySelector('.evf-settings-panel')).not.toBeNull();
    panel.dispose();
    expect(document.querySelector('.evf-settings-panel')).toBeNull();
  });

  it('PSP-07: English locale renders English labels', () => {
    createPhoneSettingsPanel({ sendEdit: vi.fn(), initial: {}, locale: 'en' });
    expect(document.body.textContent).toContain('Map settings');
  });

  it('PSP-08: tapping the title collapses/expands the controls (issue #35)', () => {
    createPhoneSettingsPanel({ sendEdit: vi.fn(), initial: {} });
    const titleEl = document.querySelector<HTMLElement>('.evf-settings-panel h2');
    const body = document.querySelector<HTMLElement>('.evf-settings-panel h2 + div');
    if (titleEl === null || body === null) throw new Error('title/body not found');
    // Starts expanded.
    expect(body.style.display).not.toBe('none');
    titleEl.dispatchEvent(new Event('click'));
    expect(body.style.display).toBe('none'); // collapsed
    titleEl.dispatchEvent(new Event('click'));
    expect(body.style.display).not.toBe('none'); // expanded again
  });
});
