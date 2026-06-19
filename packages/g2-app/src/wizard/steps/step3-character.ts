/**
 * Step 3 — Character Selection
 *
 * Renders into `#step-content`. On mount:
 *   - Fires `GET {bridgeUrl}/v1/characters?world={worldId}` with bearer.
 *   - Shows skeleton loader while fetching.
 *   - Card grid for ≤8 characters; `<select>` dropdown for >8.
 *   - On Confirm: `saveSession(session)` → `store.set({ characterId, step: COMPLETION })`.
 *
 * Security (T-02-03): character name and class rendered via textContent — no innerHTML.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-UI-SPEC.md Step 3 spec
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 2
 */

import { isWizardNoAuth } from '../is-dev-no-auth.js';
import type { WizardState } from '../state.js';
import { type Store, WizardStep } from '../state.js';

/** Step to return to from Step 3's "Back": Step 1 when the token step is skipped (dev), else Step 2. */
const backStep = (): WizardStep => (isWizardNoAuth() ? WizardStep.STEP1 : WizardStep.STEP2);

import { saveSession } from '../tier3-storage.js';

/** Threshold: above this count, use dropdown instead of card grid. */
const CARD_GRID_MAX = 8;

/** Shape of a character entry returned by `/v1/characters`. */
interface CharacterEntry {
  id: string;
  name: string;
  class?: string;
  level?: number;
}

/**
 * All i18n keys used by Step 3.
 */
export type Step3Keys =
  | 'evf.wizard.step3.title'
  | 'evf.wizard.step3.scoped'
  | 'evf.wizard.step3.loading'
  | 'evf.wizard.step3.empty'
  | 'evf.wizard.step3.empty.retry'
  | 'evf.wizard.step3.error.fetch'
  | 'evf.wizard.step3.error.go_back'
  | 'evf.wizard.step3.cta'
  | 'evf.btn.back';

let _cleanup: (() => void) | null = null;
let _selectedCharacterId = '';
let _selectedCharacterName = '';
let _selectedCharacterClass = '';

/**
 * Render Step 3 into the given container.
 *
 * @param container - The `#step-content` element.
 * @param store - Wizard state store.
 * @param t - i18n translation function.
 */
export function render(
  container: HTMLElement,
  store: Store<WizardState>,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  destroy();

  _selectedCharacterId = '';
  _selectedCharacterName = '';
  _selectedCharacterClass = '';

  const wrapper = document.createElement('div');

  // Status region (loading / aria-live)
  const statusRegion = document.createElement('div');
  statusRegion.setAttribute('aria-live', 'polite');
  statusRegion.className = 'evf-status';
  statusRegion.textContent = t('evf.wizard.step3.loading');

  // Error region
  const errorRegion = document.createElement('div');
  errorRegion.setAttribute('role', 'alert');
  errorRegion.setAttribute('aria-live', 'assertive');
  errorRegion.className = 'evf-error-msg evf-hidden';

  // Scoping note — the roster is filtered to the paired Foundry user's owned
  // actors bridge-side (ADR-0014); surface that so the player understands why
  // only their characters appear.
  const scopedNote = document.createElement('div');
  scopedNote.className = 'evf-step3-scoped';
  scopedNote.textContent = t('evf.wizard.step3.scoped');

  // Character list area (populated after fetch)
  const charListArea = document.createElement('div');
  charListArea.id = 'evf-char-list';

  // CTA row
  const ctaRow = document.createElement('div');
  ctaRow.className = 'wizard-cta';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'evf-btn evf-btn-ghost';
  backBtn.textContent = t('evf.btn.back');

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'evf-btn evf-btn-primary';
  confirmBtn.textContent = t('evf.wizard.step3.cta');
  confirmBtn.disabled = true;

  ctaRow.appendChild(backBtn);
  ctaRow.appendChild(confirmBtn);

  wrapper.appendChild(statusRegion);
  wrapper.appendChild(errorRegion);
  wrapper.appendChild(scopedNote);
  wrapper.appendChild(charListArea);

  container.innerHTML = '';
  container.appendChild(wrapper);
  container.appendChild(ctaRow);

  // --- Fetch characters ---
  const abortController = new AbortController();

  function doFetch() {
    statusRegion.textContent = t('evf.wizard.step3.loading');
    statusRegion.classList.remove('evf-hidden');
    errorRegion.classList.add('evf-hidden');
    charListArea.innerHTML = '';
    confirmBtn.disabled = true;

    const { bridgeUrl, token } = store.get();
    const url = `${bridgeUrl}/v1/characters`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abortController.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<unknown>;
      })
      .then((body) => {
        statusRegion.classList.add('evf-hidden');
        const chars = _parseCharacters(body);

        if (chars.length === 0) {
          _renderEmpty(errorRegion, t, doFetch);
          return;
        }

        if (chars.length <= CARD_GRID_MAX) {
          _renderCardGrid(charListArea, chars, confirmBtn, t);
        } else {
          _renderDropdown(charListArea, chars, confirmBtn, t);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return; // Component was destroyed — ignore
        }
        statusRegion.classList.add('evf-hidden');
        _renderFetchError(errorRegion, t, doFetch, store);
      });
  }

  doFetch();

  // --- Event listeners ---
  function onBack() {
    abortController.abort();
    store.set({ step: backStep(), error: null });
  }

  async function onConfirm() {
    if (!_selectedCharacterId) {
      return;
    }

    const { bridgeUrl, profileId } = store.get();

    try {
      await saveSession({
        profileId,
        bridgeUrl,
        tokenObfuscated: null,
        characterId: _selectedCharacterId,
        savedAt: Date.now(),
      });
    } catch {
      // Storage failure — still proceed (session will be re-created on reconnect)
      console.warn('[EVF] step3: failed to persist session to Tier 3 — proceeding anyway.');
    }

    store.set({
      characterId: _selectedCharacterId,
      step: WizardStep.COMPLETION,
      error: null,
    });
  }

  backBtn.addEventListener('click', onBack);
  confirmBtn.addEventListener('click', onConfirm);

  _cleanup = () => {
    abortController.abort();
    backBtn.removeEventListener('click', onBack);
    confirmBtn.removeEventListener('click', onConfirm);
  };
}

/** Remove event listeners and abort any in-flight fetch. */
export function destroy(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _parseCharacters(body: unknown): CharacterEntry[] {
  // The bridge's GET /v1/characters returns `{ characters: [{ actorId, name, level }] }`.
  // Accept that envelope; also tolerate a bare array (legacy/test shape). Entries use
  // `actorId` per the bridge contract — fall back to `id` for backward compatibility.
  const list: unknown[] = Array.isArray(body)
    ? body
    : typeof body === 'object' &&
        body !== null &&
        Array.isArray((body as Record<string, unknown>).characters)
      ? ((body as Record<string, unknown>).characters as unknown[])
      : [];
  const results: CharacterEntry[] = [];
  for (const item of list) {
    if (typeof item === 'object' && item !== null && 'name' in item) {
      const entry = item as Record<string, unknown>;
      const rawId = entry.actorId ?? entry.id;
      if (rawId === undefined || rawId === null) {
        continue;
      }
      const charEntry: CharacterEntry = {
        id: String(rawId),
        name: String(entry.name),
      };
      if (typeof entry.class === 'string') {
        charEntry.class = entry.class;
      }
      if (typeof entry.level === 'number') {
        charEntry.level = entry.level;
      }
      results.push(charEntry);
    }
  }
  return results;
}

function _renderCardGrid(
  area: HTMLElement,
  chars: CharacterEntry[],
  confirmBtn: HTMLButtonElement,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  const grid = document.createElement('div');
  grid.className = 'evf-char-grid';
  grid.setAttribute('role', 'group');

  for (const char of chars) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'evf-char-card';
    card.setAttribute('aria-pressed', 'false');

    const nameEl = document.createElement('div');
    nameEl.className = 'evf-char-name';
    // Safe: textContent (T-02-03)
    nameEl.textContent = char.name;

    const infoEl = document.createElement('div');
    infoEl.className = 'evf-char-info';
    const classStr = char.class ?? '';
    const levelStr = char.level !== undefined ? `Lv ${char.level}` : '';
    // Safe: textContent (T-02-03)
    infoEl.textContent = [classStr, levelStr].filter(Boolean).join(' — ');

    card.appendChild(nameEl);
    card.appendChild(infoEl);

    card.addEventListener('click', () => {
      // Deselect all
      for (const el of grid.querySelectorAll('.evf-char-card')) {
        el.setAttribute('aria-pressed', 'false');
        el.classList.remove('evf-char-card--selected');
      }
      // Select this card
      card.setAttribute('aria-pressed', 'true');
      card.classList.add('evf-char-card--selected');

      _selectedCharacterId = char.id;
      _selectedCharacterName = char.name;
      _selectedCharacterClass = char.class ?? '';
      confirmBtn.disabled = false;
      void t; // Ensure t is referenced (used in other paths)
    });

    grid.appendChild(card);
  }

  area.appendChild(grid);
}

function _renderDropdown(
  area: HTMLElement,
  chars: CharacterEntry[],
  confirmBtn: HTMLButtonElement,
  t: (key: string, vars?: Record<string, string>) => string,
): void {
  const select = document.createElement('select');
  select.className = 'evf-select';
  select.setAttribute('aria-label', t('evf.wizard.step3.title'));

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a character...';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  for (const char of chars) {
    const opt = document.createElement('option');
    opt.value = char.id;
    // Safe: textContent (T-02-03)
    const label = char.class
      ? `${char.name} — ${char.class}${char.level !== undefined ? ` Lv ${char.level}` : ''}`
      : char.name;
    opt.textContent = label;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const selected = chars.find((c) => c.id === select.value);
    if (selected) {
      _selectedCharacterId = selected.id;
      _selectedCharacterName = selected.name;
      _selectedCharacterClass = selected.class ?? '';
      confirmBtn.disabled = false;
    }
  });

  area.appendChild(select);
}

function _renderEmpty(
  errorRegion: HTMLElement,
  t: (key: string, vars?: Record<string, string>) => string,
  onRetry: () => void,
): void {
  errorRegion.textContent = t('evf.wizard.step3.empty');
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'evf-btn evf-btn-ghost';
  retryBtn.textContent = t('evf.wizard.step3.empty.retry');
  retryBtn.addEventListener('click', () => {
    errorRegion.innerHTML = '';
    errorRegion.classList.add('evf-hidden');
    onRetry();
  });
  errorRegion.appendChild(retryBtn);
  errorRegion.classList.remove('evf-hidden');
}

function _renderFetchError(
  errorRegion: HTMLElement,
  t: (key: string, vars?: Record<string, string>) => string,
  onRetry: () => void,
  store: Store<WizardState>,
): void {
  errorRegion.textContent = t('evf.wizard.step3.error.fetch');

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'evf-btn evf-btn-ghost';
  retryBtn.textContent = t('evf.btn.retry' as string);
  retryBtn.addEventListener('click', () => {
    errorRegion.innerHTML = '';
    errorRegion.classList.add('evf-hidden');
    onRetry();
  });

  const goBackBtn = document.createElement('button');
  goBackBtn.type = 'button';
  goBackBtn.className = 'evf-btn evf-btn-ghost';
  goBackBtn.textContent = t('evf.wizard.step3.error.go_back');
  goBackBtn.addEventListener('click', () => {
    store.set({ step: backStep(), error: null });
  });

  errorRegion.appendChild(retryBtn);
  errorRegion.appendChild(goBackBtn);
  errorRegion.classList.remove('evf-hidden');
}

/** Expose selected character info for use in the Completion screen. */
export function getSelectedCharacter(): { id: string; name: string; characterClass: string } {
  return {
    id: _selectedCharacterId,
    name: _selectedCharacterName,
    characterClass: _selectedCharacterClass,
  };
}
