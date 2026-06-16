/**
 * Phone-side display-settings panel (2026-06-14).
 *
 * Renders the five map/display settings (dither, brightness, WebP quality,
 * capture fps, contrast-normalize) as a DOM control surface on the PHONE — the
 * Even Realities app WebView that hosts the plugin. The user adjusts settings
 * here (sliders / toggles) instead of through gesture-limited on-glasses menus;
 * each change is pushed UPSTREAM via the display-settings sync (`sendEdit`),
 * which reaches the Foundry module and echoes back, keeping every surface in
 * sync. `update()` reflects downstream Foundry changes back into the controls.
 *
 * Styling follows the Even Hub phone-side design tokens (dark theme): the glasses
 * green (#3CFA44) is NEVER used here — that colour is glasses-display only.
 *
 * No DOM framework (CLAUDE.md): plain `createElement`; user-visible text is set
 * via `textContent` (never `innerHTML`) per the wizard's T-02-03 pattern.
 *
 * @see packages/g2-app/src/engine/display-settings-sync.ts (transport)
 * @see packages/shared-protocol/src/payloads/settings-display.ts (schema)
 */

import type { SettingsDisplay } from '@evf/shared-protocol';

/** Handle for the mounted panel. */
export interface PhoneSettingsPanel {
  /** Reflect a downstream Foundry settings snapshot into the controls. */
  update(settings: SettingsDisplay): void;
  /** Remove the panel from the DOM and release listeners. */
  dispose(): void;
}

/** A roster entry for the character/role selector. */
export interface RosterEntry {
  /** Foundry actor id to pin via `client_select_actor`. */
  readonly actorId: string;
  /** Display name (rendered via textContent only). */
  readonly name: string;
}

/** Options for {@link createPhoneSettingsPanel}. */
export interface PhoneSettingsPanelOptions {
  /** Push a partial edit upstream (glasses-less → bridge → module). */
  readonly sendEdit: (edit: SettingsDisplay) => void;
  /** Initial values to seed the controls (the synced snapshot, possibly empty). */
  readonly initial: SettingsDisplay;
  /** Locale for labels — `it` (default) or any → English fallback. */
  readonly locale?: string;
  /** Mount target; defaults to `document.body`. */
  readonly mount?: HTMLElement;
  /**
   * Async roster provider for the character/role selector. Injected so the
   * panel is unit-testable without network. Called once on construction; when
   * omitted, the selector row is not rendered.
   */
  readonly fetchRoster?: () => Promise<ReadonlyArray<RosterEntry>>;
  /** Called when the user picks a character (live switch via `client_select_actor`). */
  readonly onSelectActor?: (actorId: string) => void;
  /** The currently-selected actor id — preselected once the roster resolves. */
  readonly initialActorId?: string | undefined;
}

/** Even phone-side dark-theme tokens (design-guidelines.md). */
const T = {
  bg: '#111111',
  surface: '#1A1A1A',
  text: '#FFFFFF',
  textDim: '#8A8A8A',
  accent: '#FEF991',
  inputBg: 'rgba(255,255,255,0.08)',
} as const;

/** Bilingual labels — Italian primary, English fallback. */
const LABELS = {
  it: {
    title: 'Impostazioni mappa',
    dither: 'Dithering',
    brightness: 'Luminosità',
    webp: 'Compressione (WebP)',
    fps: 'Frame rate cattura',
    normalize: 'Normalizza contrasto',
    webpLossless: 'PNG lossless',
    // i18n keys: evf.settings.character.*
    characterLabel: 'Personaggio / Ruolo',
    characterLoading: 'Caricamento…',
    characterError: 'Non disponibile',
  },
  en: {
    title: 'Map settings',
    dither: 'Dithering',
    brightness: 'Brightness',
    webp: 'Compression (WebP)',
    fps: 'Capture frame rate',
    normalize: 'Contrast normalize',
    webpLossless: 'lossless PNG',
    // i18n keys: evf.settings.character.*
    characterLabel: 'Character / Role',
    characterLoading: 'Loading…',
    characterError: 'Unavailable',
  },
} as const;

/**
 * Build + mount the phone settings panel.
 *
 * Returns synchronously; the panel is in the DOM on return. Safe to call in a
 * `happy-dom` test environment (only standard DOM APIs are used).
 */
export function createPhoneSettingsPanel(opts: PhoneSettingsPanelOptions): PhoneSettingsPanel {
  const doc = globalThis.document;
  const mount = opts.mount ?? doc.body;
  const L = opts.locale === 'en' ? LABELS.en : LABELS.it;

  // `suppress` guards `update()` from re-firing sendEdit while we set control values.
  let suppress = false;

  const root = doc.createElement('section');
  root.className = 'evf-settings-panel';
  Object.assign(root.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    margin: '0 auto',
    maxWidth: '520px',
    boxSizing: 'border-box',
    padding: '16px 20px 24px',
    background: T.bg,
    color: T.text,
    font: "400 16px/1.3 'FK Grotesk Neue', system-ui, sans-serif",
    letterSpacing: '-0.01em',
    borderTop: `1px solid ${T.surface}`,
    zIndex: '2147483646',
  });

  // Collapsible header (issue #35): tap the title to hide/show the controls so
  // the panel does not permanently occupy the phone UI during gameplay.
  let collapsed = false;
  const title = doc.createElement('h2');
  Object.assign(title.style, {
    margin: '0 0 16px',
    font: "600 18px/1.2 'FK Grotesk Neue', system-ui, sans-serif",
    letterSpacing: '-0.02em',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  const titleText = doc.createElement('span');
  titleText.textContent = L.title;
  const chevron = doc.createElement('span');
  chevron.style.color = T.textDim;
  title.appendChild(titleText);
  title.appendChild(chevron);
  root.appendChild(title);

  // Body holds all the control rows; collapsing hides it (header stays visible).
  const body = doc.createElement('div');
  root.appendChild(body);

  const applyCollapsed = (): void => {
    body.style.display = collapsed ? 'none' : '';
    title.style.margin = collapsed ? '0' : '0 0 16px';
    chevron.textContent = collapsed ? '▸' : '▾';
  };
  title.addEventListener('click', () => {
    collapsed = !collapsed;
    applyCollapsed();
  });

  // ── Control builders ───────────────────────────────────────────────────────

  /** A labelled row wrapper. */
  function row(labelText: string): HTMLDivElement {
    const r = doc.createElement('div');
    Object.assign(r.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '8px 0',
    });
    const lab = doc.createElement('span');
    lab.textContent = labelText;
    lab.style.color = T.textDim;
    r.appendChild(lab);
    return r;
  }

  // ── Character / Role selector (top of body) ─────────────────────────────────
  //
  // Lets the player switch the active actor LIVE from the phone. Independent of
  // the display-settings (`sendEdit`) path: a change emits the upstream
  // `client_select_actor` WS message via `opts.onSelectActor`, which the bridge
  // applies without a reconnect. The selection is NOT persisted across reboots —
  // TODO(ADR-0015): seed `initialActorId` from the Even Hub kv store so a reboot
  // keeps the live choice instead of reverting to the wizard-picked `characterId`.
  function buildCharacterSelector(): void {
    const r = row(L.characterLabel);
    const select = doc.createElement('select');
    select.className = 'evf-character-select';
    Object.assign(select.style, {
      maxWidth: '220px',
      padding: '6px 8px',
      background: T.inputBg,
      color: T.text,
      border: `1px solid ${T.surface}`,
      borderRadius: '6px',
      font: 'inherit',
    });

    // While the roster is pending (or on failure) a single disabled placeholder
    // is shown; `select.value` then equals '' so `change` handling is a no-op.
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = L.characterLoading;
    select.appendChild(placeholder);

    select.addEventListener('change', () => {
      if (suppress) return;
      const value = select.value;
      if (!value) return; // guard against the disabled placeholder
      opts.onSelectActor?.(value);
    });

    r.appendChild(select);
    body.appendChild(r);

    const roster = opts.fetchRoster;
    if (!roster) {
      // No provider: leave the placeholder as a static disabled option.
      placeholder.textContent = L.characterError;
      return;
    }

    roster()
      .then((entries) => {
        suppress = true;
        try {
          while (select.firstChild) select.removeChild(select.firstChild);
          for (const entry of entries) {
            const opt = doc.createElement('option');
            opt.value = entry.actorId;
            opt.textContent = entry.name; // Safe: textContent only (T-02-03).
            select.appendChild(opt);
          }
          if (opts.initialActorId !== undefined) {
            select.value = opts.initialActorId;
          }
        } finally {
          suppress = false;
        }
      })
      .catch((err: unknown) => {
        placeholder.textContent = L.characterError;
        console.warn('[EVF] settings-panel: failed to load character roster —', err);
      });
  }

  /** Checkbox toggle bound to a boolean setting key. */
  function toggle(labelText: string, key: 'dither' | 'normalize'): HTMLInputElement {
    const r = row(labelText);
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('data-evf-key', key);
    Object.assign(input.style, { width: '22px', height: '22px', accentColor: T.accent });
    input.addEventListener('change', () => {
      if (suppress) return;
      opts.sendEdit({ [key]: input.checked } as SettingsDisplay);
    });
    r.appendChild(input);
    body.appendChild(r);
    return input;
  }

  /** Range slider + live value bound to a numeric setting key. */
  function slider(
    labelText: string,
    key: 'brightness' | 'webpQuality' | 'captureFps',
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
  ): HTMLInputElement {
    const r = row(labelText);
    const wrap = doc.createElement('div');
    Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const input = doc.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute('data-evf-key', key);
    Object.assign(input.style, { width: '170px', accentColor: T.accent });
    const val = doc.createElement('span');
    Object.assign(val.style, {
      minWidth: '64px',
      textAlign: 'right',
      color: T.text,
      fontVariantNumeric: 'tabular-nums',
    });
    const render = (): void => {
      val.textContent = fmt(Number(input.value));
    };
    input.addEventListener('input', () => {
      render();
      if (suppress) return;
      opts.sendEdit({ [key]: Number(input.value) } as SettingsDisplay);
    });
    input.setAttribute('data-evf-render', '');
    (input as unknown as { _evfRender: () => void })._evfRender = render;
    wrap.appendChild(input);
    wrap.appendChild(val);
    r.appendChild(wrap);
    body.appendChild(r);
    return input;
  }

  // Character/Role selector first → it is the top-most row in the body.
  buildCharacterSelector();

  const ditherEl = toggle(L.dither, 'dither');
  const brightnessEl = slider(
    L.brightness,
    'brightness',
    -100,
    100,
    5,
    (v) => `${v > 0 ? '+' : ''}${v}`,
  );
  const webpEl = slider(L.webp, 'webpQuality', 0, 100, 5, (v) =>
    v === 0 ? L.webpLossless : `${v}`,
  );
  const fpsEl = slider(L.fps, 'captureFps', 1, 60, 1, (v) => `${v} fps`);
  const normalizeEl = toggle(L.normalize, 'normalize');

  // ── State application ────────────────────────────────────────────────────────

  function applySettings(s: SettingsDisplay): void {
    suppress = true;
    try {
      if (typeof s.dither === 'boolean') ditherEl.checked = s.dither;
      if (typeof s.normalize === 'boolean') normalizeEl.checked = s.normalize;
      for (const [el, key] of [
        [brightnessEl, 'brightness'],
        [webpEl, 'webpQuality'],
        [fpsEl, 'captureFps'],
      ] as const) {
        const v = s[key];
        if (typeof v === 'number') {
          el.value = String(v);
          (el as unknown as { _evfRender?: () => void })._evfRender?.();
        }
      }
    } finally {
      suppress = false;
    }
  }

  applySettings(opts.initial);
  // Render initial slider value labels even when `initial` omitted them.
  for (const el of [brightnessEl, webpEl, fpsEl]) {
    (el as unknown as { _evfRender?: () => void })._evfRender?.();
  }
  applyCollapsed(); // set the initial expanded state + chevron (▾)

  mount.appendChild(root);

  return {
    update: (settings) => applySettings(settings),
    dispose: () => {
      root.remove();
    },
  };
}
