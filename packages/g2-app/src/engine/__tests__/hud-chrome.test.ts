/**
 * Unit tests for hud-chrome — regression guard for the permanent HUD frame
 * chrome writers (header id4 + footer id5).
 *
 * Covers HC-1..HC-7 per the plan behavior block:
 *   HC-1: writeHeaderChrome calls textContainerUpgrade once with containerName
 *         'header' AND containerID 4; content is not 'Text' and not a
 *         boot-checklist marker.
 *   HC-2: header content carries the canonical §7.4 frame-top tokens:
 *         starts with 'MAP · ', contains the mode token, contains '⌁ R1',
 *         uses '—' for unknown slots; center label is locale-sensitive.
 *   HC-3: writeFooterChrome calls textContainerUpgrade once with containerName
 *         'footer' AND containerID 5; content is not 'Text'.
 *   HC-4: footer IT content equals the canonical line with 'modo:', '[scheda]',
 *         'long=quick', '▶RASTER (toggle GLYPH)'.
 *   HC-5: footer EN content contains 'mode:', '[sheet]', 'long=quick'.
 *   HC-6: glyph mode variant: header mode token = 'glyph', footer shows
 *         '▶GLYPH (toggle RASTER)'.
 *   HC-7: textContainerUpgrade rejection propagates (no swallow).
 *
 * @see packages/g2-app/src/engine/hud-chrome.ts (implementation)
 * @see Specs.md §7.4 (frame-top + footer canonical mockup)
 * @see packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt (frozen INV-1)
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { writeFooterChrome, writeHeaderChrome } from '../hud-chrome.js';

/** Minimal mock bridge — mirrors makeMockBridge from boot-splash.test.ts */
function makeMockBridge() {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(0),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
  };
}

describe('hud-chrome.writeHeaderChrome', () => {
  it('HC-1: calls textContainerUpgrade exactly once with containerName "header" and containerID 4', async () => {
    const bridge = makeMockBridge();
    await writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg.containerName).toBe('header');
    expect(arg.containerID).toBe(4);
  });

  it('HC-1b: header content is not the SDK "Text" default and not a boot-checklist marker', async () => {
    const bridge = makeMockBridge();
    await writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).not.toBe('Text');
    expect(content).not.toContain('[ ✓ ]');
    expect(content).not.toContain('[ ⟳ ]');
    expect(content).not.toContain('protocol ');
  });

  it('HC-2: header content starts with "MAP · ", contains the mode token, "⌁ R1", and "—"', async () => {
    const bridge = makeMockBridge();
    await writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toMatch(/^MAP · /);
    expect(content).toContain('raster');
    expect(content).toContain('⌁ R1');
    expect(content).toContain('—');
  });

  it('HC-2b: center label is "TURNO" for locale="it"', async () => {
    const bridge = makeMockBridge();
    await writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toContain('TURNO');
    expect(content).not.toContain('TURN ');
  });

  it('HC-2c: center label is "TURN" for locale="en"', async () => {
    const bridge = makeMockBridge();
    await writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'en' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toContain('TURN');
    expect(content).not.toContain('TURNO');
  });

  it('HC-7 header: textContainerUpgrade rejection propagates from writeHeaderChrome', async () => {
    const bridge = makeMockBridge();
    bridge.textContainerUpgrade.mockRejectedValueOnce(new Error('bridge boom header'));

    await expect(
      writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' }),
    ).rejects.toThrow(/bridge boom header/);
  });
});

describe('hud-chrome.writeFooterChrome', () => {
  it('HC-3: calls textContainerUpgrade exactly once with containerName "footer" and containerID 5', async () => {
    const bridge = makeMockBridge();
    await writeFooterChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg.containerName).toBe('footer');
    expect(arg.containerID).toBe(5);
  });

  it('HC-3b: footer content is not the SDK "Text" default', async () => {
    const bridge = makeMockBridge();
    await writeFooterChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).not.toBe('Text');
  });

  it('HC-4: footer IT content contains "long=quick", "modo:", "[scheda]", "▶RASTER (toggle GLYPH)"', async () => {
    const bridge = makeMockBridge();
    await writeFooterChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toContain('long=quick');
    expect(content).toContain('modo:');
    expect(content).toContain('[scheda]');
    expect(content).toContain('▶RASTER (toggle GLYPH)');
  });

  it('HC-5: footer EN content contains "long=quick", "mode:", "[sheet]"', async () => {
    const bridge = makeMockBridge();
    await writeFooterChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'en' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toContain('long=quick');
    expect(content).toContain('mode:');
    expect(content).toContain('[sheet]');
  });

  it('HC-6 footer: mode=glyph produces "▶GLYPH (toggle RASTER)"', async () => {
    const bridge = makeMockBridge();
    await writeFooterChrome(bridge as unknown as EvenAppBridge, { mode: 'glyph', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toContain('▶GLYPH (toggle RASTER)');
  });

  it('HC-7 footer: textContainerUpgrade rejection propagates from writeFooterChrome', async () => {
    const bridge = makeMockBridge();
    bridge.textContainerUpgrade.mockRejectedValueOnce(new Error('bridge boom footer'));

    await expect(
      writeFooterChrome(bridge as unknown as EvenAppBridge, { mode: 'raster', locale: 'it' }),
    ).rejects.toThrow(/bridge boom footer/);
  });
});

describe('hud-chrome.writeHeaderChrome — mode=glyph', () => {
  it('HC-6 header: mode=glyph produces header with "glyph" token', async () => {
    const bridge = makeMockBridge();
    await writeHeaderChrome(bridge as unknown as EvenAppBridge, { mode: 'glyph', locale: 'it' });

    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0];
    const content = String(arg?.content ?? '');
    expect(content).toContain('glyph');
    expect(content).not.toContain('raster');
  });
});
