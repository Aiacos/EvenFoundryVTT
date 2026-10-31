/**
 * Device-local preferences (phone page P02) persisted in `localStorage`, mirrored into the
 * Even Hub SDK key-value store like the credentials ({@link MirroredSettingsStorage}):
 * WebView storage is not always reliable (everything-evenhub `device-features` guide).
 *
 * Settings never leave the phone and never modify Foundry world settings
 * (Specs.md §7.16 locale override rule).
 *
 * @see docs/design/g2-thirds-layout.md §P02
 * @see ./credentials.ts (same localStorage-primary / SDK-mirror-secondary model)
 */
import { z } from 'zod';
import { type AppSettings, DEFAULT_SETTINGS } from '../state/app-store.js';
import type { KeyValueStorage, SdkKeyValue, StorageWarn } from './credentials.js';

/** localStorage key holding the JSON settings record. */
export const SETTINGS_STORAGE_KEY = 'evf.settings.v1';

const SettingsSchema = z.strictObject({
  locale: z.enum(['auto', 'it', 'en']),
  mapCellPx: z.union([z.literal(6), z.literal(8), z.literal(12)]),
  followToken: z.boolean(),
  autoSheetPage: z.boolean(),
  /** Map pixel scale (phone P02); absent = the HUD default. */
  mapPixelSize: z.union([z.literal(1), z.literal(2), z.literal(3)]).exactOptional(),
}) satisfies z.ZodType<AppSettings>;

/**
 * Reads settings, merging valid stored fields over {@link DEFAULT_SETTINGS}.
 * Unknown/invalid fields are dropped individually so one bad value never resets all.
 */
export function loadSettings(storage: KeyValueStorage | null, warn: StorageWarn): AppSettings {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SETTINGS_STORAGE_KEY) ?? null;
  } catch (error) {
    warn('localStorage getItem failed', error);
  }
  return parseSettings(raw);
}

/** Parses a stored settings record (null = none stored); see {@link loadSettings}. */
function parseSettings(raw: string | null): AppSettings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted entry: defaults are the documented fallback.
    return { ...DEFAULT_SETTINGS };
  }
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (typeof parsed === 'object' && parsed !== null) {
    const shape = SettingsSchema.shape;
    for (const key of Object.keys(shape) as Array<keyof typeof shape>) {
      const field = shape[key].safeParse((parsed as Record<string, unknown>)[key]);
      if (field.success && field.data !== undefined) merged[key] = field.data;
    }
  }
  return SettingsSchema.parse(merged);
}

/** Persists settings; storage failures are reported, not thrown. */
export function saveSettings(
  storage: KeyValueStorage | null,
  settings: AppSettings,
  warn: StorageWarn,
): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    warn('localStorage setItem failed', error);
  }
}

/**
 * Settings storage: `localStorage` primary, SDK key-value mirror secondary (the
 * `CredentialStore` model). Passed to the session as its `settingsStorage`: every
 * write goes to both backends; {@link attach} restores the record from the mirror when
 * WebView storage lost it.
 */
export class MirroredSettingsStorage implements KeyValueStorage {
  private mirror: SdkKeyValue | null = null;
  /** A settings record was written since construction (a restore must not override it). */
  private written = false;

  /**
   * @param local - Browser storage, or `null` when unavailable.
   * @param warn - Diagnostics sink for recoverable mirror errors.
   */
  constructor(
    private readonly local: KeyValueStorage | null,
    private readonly warn: StorageWarn,
  ) {}

  getItem(key: string): string | null {
    return this.local?.getItem(key) ?? null;
  }

  /** Writes `localStorage` and the mirror; a `localStorage` failure is rethrown after. */
  setItem(key: string, value: string): void {
    this.written = true;
    const mirror = this.mirror;
    if (mirror !== null) {
      mirror.setLocalStorage(key, value).catch((error: unknown) => {
        this.warn('sdk setLocalStorage failed', error);
      });
    }
    this.local?.setItem(key, value);
  }

  removeItem(key: string): void {
    this.local?.removeItem(key);
  }

  /**
   * Attaches the SDK key-value store once the Even App bridge is ready.
   *
   * @returns The settings restored from the mirror (also written back to `localStorage`)
   *   when `localStorage` had none, else null (nothing to restore, read failed, or the
   *   user saved settings meanwhile).
   */
  async attach(mirror: SdkKeyValue): Promise<AppSettings | null> {
    this.mirror = mirror;
    let local: string | null = null;
    try {
      local = this.local?.getItem(SETTINGS_STORAGE_KEY) ?? null;
    } catch (error) {
      this.warn('localStorage getItem failed', error);
    }
    if (local !== null) return null;
    let raw: string;
    try {
      raw = await mirror.getLocalStorage(SETTINGS_STORAGE_KEY);
    } catch (error) {
      this.warn('sdk getLocalStorage failed', error);
      return null;
    }
    // The SDK returns '' for a missing key.
    if (raw === '' || this.written) return null;
    try {
      this.local?.setItem(SETTINGS_STORAGE_KEY, raw);
    } catch (error) {
      this.warn('localStorage setItem failed', error);
    }
    return parseSettings(raw);
  }
}
