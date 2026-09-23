/**
 * Device-local preferences (phone page P02) persisted in `localStorage`.
 *
 * Settings never leave the phone and never modify Foundry world settings
 * (Specs.md §7.16 locale override rule).
 *
 * @see docs/design/g2-thirds-layout.md §P02
 */
import { z } from 'zod';
import { type AppSettings, DEFAULT_SETTINGS } from '../state/app-store.js';
import type { KeyValueStorage, StorageWarn } from './credentials.js';

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
