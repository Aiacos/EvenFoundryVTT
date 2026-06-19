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
 * Styling follows the Even Hub phone-app design guidelines (LIGHT theme): white
 * surface, near-black / dark-grey text, flat layout (no collapse / dropdown).
 * The glasses green (#3CFA44) is NEVER used here — that colour is glasses-display
 * only.
 *
 * No DOM framework (CLAUDE.md): plain `createElement`; user-visible text is set
 * via `textContent` (never `innerHTML`) per the wizard's T-02-03 pattern.
 *
 * @see packages/g2-app/src/engine/display-settings-sync.ts (transport)
 * @see packages/shared-protocol/src/payloads/settings-display.ts (schema)
 */

import type { SettingsDisplay } from '@evf/shared-protocol';
import { PARTY_SELECTION, toPlayerViewRequest } from './player-view-selection.js';

/** Minimal structural shape of a player-view status (avoids a hard schema import). */
export interface PlayerViewStatusLike {
  /** Orchestrator state: off | starting | live | unavailable | error. */
  readonly state: string;
  /** Optional human-readable detail (error reason / note). */
  readonly detail?: string | undefined;
}

/** Handle for the mounted panel. */
export interface PhoneSettingsPanel {
  /** Reflect a downstream Foundry settings snapshot into the controls. */
  update(settings: SettingsDisplay): void;
  /** Reflect a downstream player-view orchestrator status into the status line. */
  setPlayerViewStatus(status: PlayerViewStatusLike): void;
  /** Remove the panel from the DOM and release listeners. */
  dispose(): void;
}

/** A roster entry for the character/role selector. */
export interface RosterEntry {
  /** Foundry actor id to pin via `client_select_actor`. */
  readonly actorId: string;
  /** Display name (rendered via textContent only). */
  readonly name: string;
  /** Owning Foundry user — present only for players who opted in to streaming. */
  readonly userName?: string;
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
  /**
   * Initial value for the Foundry URL field. Defaults to
   * {@link DEFAULT_FOUNDRY_URL}. In dev (no-auth) the live socket uses the dev
   * bridge override; this field configures the deploy connection.
   */
  readonly foundryUrl?: string | undefined;
  /** Called when the user edits the Foundry URL (persist for the next connect). */
  readonly onFoundryUrlChange?: (url: string) => void;
  /**
   * Called when the unified roster selection changes the map-view source
   * (Feature 001 D2, ADR-0015 §C). The selection is mapped via
   * {@link toPlayerViewRequest}: the synthetic "Party" entry maps to `streaming`
   * (shared overview); a real PC maps to `actor` (that PC's owner-elected view).
   * Carries NO credentials (the bridge resolves actorId to a Foundry user,
   * opt-in). The bridge replies with a status shown via
   * {@link PhoneSettingsPanel.setPlayerViewStatus}.
   */
  readonly onPlayerViewMode?: (req: PlayerViewRequest) => void;
}

/**
 * Map-view source request emitted by the panel (Feature 001 D2, ADR-0015 §C,
 * password-free).
 *
 * Derived from the unified roster selection ("Party" to `streaming`, a PC to
 * `actor`). Carries NO credentials: `actor` mode is resolved to the selected
 * player's Foundry user on the bridge (the player must have opted in to streaming).
 */
export interface PlayerViewRequest {
  readonly mode: 'streaming' | 'actor';
  readonly actorId: string;
  readonly foundryUrl: string;
}

/**
 * Even phone-app LIGHT-theme tokens (official Even Hub app guidelines): white
 * surface, near-black text, dark-grey secondary text, neutral controls.
 */
const T = {
  bg: '#FFFFFF',
  surface: '#E2E2E2',
  text: '#1A1A1A',
  textDim: '#555555',
  accent: '#2D2D2D',
  inputBg: '#F4F4F4',
} as const;

/**
 * Default Foundry/connection URL shown in the settings field. Overridable at
 * build time via `VITE_EVF_FOUNDRY_URL`; falls back to the configured world.
 */
const DEFAULT_FOUNDRY_URL = 'https://aiacos-vecna.eu.forge-vtt.com';

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
    partyEntry: 'Party',
    foundryLabel: 'Link Foundry',
    foundryHint: 'In sviluppo la connessione usa il bridge locale; questo campo serve al deploy.',
    playerViewHint:
      'Party = vista panoramica condivisa (auto-inquadrata, illuminazione corretta). Un PG = vista reale di quel personaggio (luci + nebbia di guerra).',
    playerViewStatusPrefix: 'Stato:',
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
    partyEntry: 'Party',
    foundryLabel: 'Foundry URL',
    foundryHint: 'In dev the connection uses the local bridge; this field is for deploy.',
    playerViewHint:
      "Party = a shared overview (auto-framed, correctly lit). A PC = that character's real view (lighting + fog of war).",
    playerViewStatusPrefix: 'Status:',
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

  // Refs captured by the builders. The unified roster selector reads the Foundry
  // URL when it fires; `playerViewStatusEl` is updated by `setPlayerViewStatus`
  // (downstream orchestrator status).
  let foundryUrlEl: HTMLInputElement | null = null;
  let playerViewStatusEl: HTMLSpanElement | null = null;

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
    boxShadow: '0 -2px 14px rgba(0,0,0,0.10)',
    zIndex: '2147483646',
  });

  // Flat header — settings are ALWAYS visible (no collapse / dropdown / accordion),
  // per the Even Hub phone-app guidelines.
  const title = doc.createElement('h2');
  Object.assign(title.style, {
    margin: '0 0 16px',
    font: "600 18px/1.2 'FK Grotesk Neue', system-ui, sans-serif",
    letterSpacing: '-0.02em',
    color: T.text,
  });
  title.textContent = L.title;
  root.appendChild(title);

  // Body holds all the control rows (always shown).
  const body = doc.createElement('div');
  root.appendChild(body);

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

  // ── Foundry URL field (top of body) ─────────────────────────────────────────
  //
  // The connection/Foundry URL, pre-filled with `foundryUrl` (default
  // {@link DEFAULT_FOUNDRY_URL}). Full-width text input (label above) so the long
  // URL is readable. On edit it calls `onFoundryUrlChange` to persist the value;
  // in dev (no-auth) the live socket keeps using the dev bridge override, so the
  // field configures the deploy connection (where the module-generated bearer
  // token is also required). See ADR-0015.
  function buildFoundryUrlField(): void {
    const wrap = doc.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '8px 0',
    });
    const lab = doc.createElement('span');
    lab.textContent = L.foundryLabel;
    lab.style.color = T.textDim;
    const input = doc.createElement('input');
    input.type = 'url';
    input.className = 'evf-foundry-url';
    input.value = opts.foundryUrl ?? DEFAULT_FOUNDRY_URL;
    input.placeholder = 'https://…';
    Object.assign(input.style, {
      width: '100%',
      boxSizing: 'border-box',
      padding: '10px 12px',
      background: T.inputBg,
      color: T.text,
      border: `1px solid ${T.surface}`,
      borderRadius: '8px',
      font: 'inherit',
    });
    input.addEventListener('change', () => {
      if (suppress) return;
      opts.onFoundryUrlChange?.(input.value.trim());
    });
    const hint = doc.createElement('span');
    hint.textContent = L.foundryHint;
    Object.assign(hint.style, { color: T.textDim, font: '400 13px/1.3 inherit' });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    wrap.appendChild(hint);
    body.appendChild(wrap);
    foundryUrlEl = input;
  }

  // ── Unified roster + map-view selector (Feature 001 D2) ─────────────────────
  //
  // ONE selector replaces the old (character selector + separate map-view mode
  // dropdown). It is populated with a synthetic top **"Party"** entry followed by
  // each player character. The selection drives the map-view source via
  // `toPlayerViewRequest` (Party → `streaming` overview; a PC → `actor`), and for
  // a real PC ALSO re-pins the character SHEET via `client_select_actor`
  // (`opts.onSelectActor`). Both apply LIVE — no reconnect. The selection is NOT
  // persisted across reboots — TODO(ADR-0015): seed `initialActorId` from the Even
  // Hub kv store so a reboot keeps the live choice.
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

    /** Add the synthetic top "Party" entry (always present, overview/streaming source). */
    const addPartyOption = (): void => {
      const partyOpt = doc.createElement('option');
      partyOpt.value = PARTY_SELECTION;
      partyOpt.textContent = L.partyEntry; // Safe: textContent only (T-02-03).
      select.appendChild(partyOpt);
    };

    // While the roster is pending the Party entry is already selectable and a
    // disabled placeholder shows the loading state for the PC list.
    addPartyOption();
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = L.characterLoading;
    select.appendChild(placeholder);
    // Default boot selection = Party (the shared overview/streaming source).
    select.value = PARTY_SELECTION;

    select.addEventListener('change', () => {
      if (suppress) return;
      const req = toPlayerViewRequest(select.value);
      if (req === null) return; // empty / placeholder — no-op
      // A real PC re-pins the character SHEET too (`client_select_actor`). Party
      // (streaming) carries no actor — only the map-view source changes.
      if (req.mode === 'actor' && req.actorId) {
        opts.onSelectActor?.(req.actorId);
      }
      opts.onPlayerViewMode?.({
        mode: req.mode,
        actorId: req.actorId ?? '',
        foundryUrl: foundryUrlEl?.value.trim() ?? '',
      });
    });

    r.appendChild(select);
    body.appendChild(r);

    // Hint + downstream orchestrator status line (relocated from the removed
    // map-view mode dropdown).
    const hint = doc.createElement('span');
    hint.textContent = L.playerViewHint;
    Object.assign(hint.style, { display: 'block', color: T.textDim, font: '400 13px/1.3 inherit' });
    body.appendChild(hint);

    const status = doc.createElement('span');
    status.className = 'evf-player-view-status';
    Object.assign(status.style, {
      display: 'block',
      color: T.textDim,
      font: '400 13px/1.3 inherit',
      paddingBottom: '4px',
    });
    body.appendChild(status);
    playerViewStatusEl = status;

    const roster = opts.fetchRoster;
    if (!roster) {
      // No provider: drop the loading placeholder; Party stays as the sole entry.
      placeholder.remove();
      return;
    }

    roster()
      .then((entries) => {
        suppress = true;
        try {
          while (select.firstChild) select.removeChild(select.firstChild);
          addPartyOption();
          for (const entry of entries) {
            const opt = doc.createElement('option');
            opt.value = entry.actorId;
            opt.textContent = entry.name; // Safe: textContent only (T-02-03).
            select.appendChild(opt);
          }
          // Default boot selection = Party unless the caller pinned a PC.
          select.value =
            opts.initialActorId !== undefined && opts.initialActorId !== ''
              ? opts.initialActorId
              : PARTY_SELECTION;
        } finally {
          suppress = false;
        }
      })
      .catch((err: unknown) => {
        // Roster failed: keep Party as the only selectable entry.
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

  // Foundry URL, then the unified roster + map-view selector (D2: the separate
  // map-view mode dropdown is gone — selection drives the source).
  buildFoundryUrlField();
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

  /** Reflect the downstream player-view orchestrator status into the status line. */
  function setPlayerViewStatus(status: PlayerViewStatusLike): void {
    if (playerViewStatusEl === null) return;
    const detail = status.detail !== undefined && status.detail !== '' ? ` — ${status.detail}` : '';
    playerViewStatusEl.textContent = `${L.playerViewStatusPrefix} ${status.state}${detail}`;
  }

  mount.appendChild(root);

  return {
    update: (settings) => applySettings(settings),
    setPlayerViewStatus,
    dispose: () => {
      root.remove();
    },
  };
}
