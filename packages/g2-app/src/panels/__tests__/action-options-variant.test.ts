/**
 * Unit tests for {@link loadActionOptionsModalCtor} — the ActionOptionsModal variant
 * selector.
 *
 * Canvas + showcase composite z=2 overlays onto the shared CanvasCompositor, so the
 * item-use follow-on modal must be the CanvasActionOptionsModal (CanvasLayer). Glyph +
 * hybrid render overlays through the native text container, so they use the glyph
 * ActionOptionsModal. This locks the mapping so a future render mode can't silently
 * regress the showcase item-use path.
 *
 * @see packages/g2-app/src/panels/action-options-variant.ts
 */

import { describe, expect, it } from 'vitest';
import type { HudRenderMode } from '../../engine/layer-manager.js';
import { ActionOptionsModal } from '../action-options-modal.js';
import { loadActionOptionsModalCtor } from '../action-options-variant.js';
import { CanvasActionOptionsModal } from '../canvas-action-options-modal.js';

describe('loadActionOptionsModalCtor', () => {
  it('selects the CANVAS variant in showcase mode', async () => {
    const ctor = await loadActionOptionsModalCtor('showcase');
    expect(ctor).toBe(CanvasActionOptionsModal);
  });

  it('selects the CANVAS variant in canvas mode', async () => {
    const ctor = await loadActionOptionsModalCtor('canvas');
    expect(ctor).toBe(CanvasActionOptionsModal);
  });

  it('selects the GLYPH variant in glyph mode', async () => {
    const ctor = await loadActionOptionsModalCtor('glyph');
    expect(ctor).toBe(ActionOptionsModal);
    // Not the canvas subclass.
    expect(ctor).not.toBe(CanvasActionOptionsModal);
  });

  it('selects the GLYPH variant in hybrid mode', async () => {
    const ctor = await loadActionOptionsModalCtor('hybrid');
    expect(ctor).toBe(ActionOptionsModal);
  });

  it('the canvas variant is a subclass of the glyph modal (drop-in constructor)', () => {
    // Guards the invariant the selector relies on: the returned ctor is call-compatible
    // with `new ActionOptionsModal(...)` at every dispatch site.
    expect(CanvasActionOptionsModal.prototype).toBeInstanceOf(ActionOptionsModal);
  });

  it('covers every HudRenderMode with a defined constructor', async () => {
    const modes: HudRenderMode[] = ['canvas', 'glyph', 'hybrid', 'showcase'];
    for (const mode of modes) {
      const ctor = await loadActionOptionsModalCtor(mode);
      expect(typeof ctor).toBe('function');
    }
  });
});
