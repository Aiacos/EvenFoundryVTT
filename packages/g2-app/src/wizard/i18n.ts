/**
 * i18n loader for the phone WebView wizard.
 *
 * Fetches string catalogs from the bridge's `/v1/i18n/{lang}` endpoint.
 * Falls back gracefully to an empty catalog if the fetch fails (bridge not yet
 * running, or Plan 04 endpoint not yet deployed). The UI falls back to key names,
 * which is acceptable for development (I18N-01 — locale follows Foundry; I18N-03).
 *
 * The locale is detected from `navigator.language` (the Even App OS locale),
 * normalised to the primary BCP 47 tag (`it-IT` → `it`).
 *
 * Cache: module-level `Map<string, Record<string, string>>`. Once loaded per
 * locale, the catalog is never re-fetched in the same session.
 *
 * Security: the bridge response is validated to be a plain `Record<string, string>`
 * before any values are used (T-02-03 — i18n strings from trusted endpoint only).
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md D-2.18, D-2.19, D-2.20
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-UI-SPEC.md UI-B i18n keys
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 1
 */

/** Module-level cache: locale → catalog. */
const _cache = new Map<string, Record<string, string>>();

/** Fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Detect the display locale from the Even App browser locale.
 *
 * Returns the primary BCP-47 subtag (e.g. `"it"` from `"it-IT"`).
 * Defaults to `"en"` if `navigator.language` is not available.
 */
export function detectLocale(): string {
  try {
    // navigator.language is available in all modern WebViews including Safari WKWebView.
    return (navigator.language ?? 'en').split('-')[0] ?? 'en';
  } catch {
    return 'en';
  }
}

/**
 * Load the i18n catalog from the bridge.
 *
 * Makes `GET {bridgeUrl}/v1/i18n/{lang}` with a 5-second timeout.
 * On failure (network error, timeout, non-200, invalid response shape):
 *   - Logs a console.warn.
 *   - Returns an empty object (UI falls back to key names).
 *
 * Results are cached per locale — subsequent calls for the same locale
 * return the cached catalog without a network request.
 *
 * @param bridgeUrl - The validated bridge URL from Step 1.
 * @param lang - BCP-47 primary tag (e.g. `"it"`, `"en"`). Defaults to `detectLocale()`.
 */
export async function loadI18n(
  bridgeUrl: string,
  lang: string = detectLocale(),
): Promise<Record<string, string>> {
  const cacheKey = `${bridgeUrl}::${lang}`;

  const cached = _cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const url = `${bridgeUrl}/v1/i18n/${encodeURIComponent(lang)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let catalog: Record<string, string>;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      // biome-ignore lint/suspicious/noConsole: i18n fetch non-200 — informational
      console.warn(
        `[EVF] i18n: fetch returned HTTP ${response.status} for ${url} — using empty catalog.`,
      );
      catalog = {};
    } else {
      const body: unknown = await response.json();
      const validated = _validateCatalog(body);
      if (validated === null) {
        // biome-ignore lint/suspicious/noConsole: i18n response shape invalid — informational
        console.warn(
          `[EVF] i18n: invalid catalog shape from ${url} — expected Record<string,string>.`,
        );
        catalog = {};
      } else {
        catalog = validated;
      }
    }
  } catch (err) {
    // AbortError (timeout) or network error
    // biome-ignore lint/suspicious/noConsole: i18n fetch failure — informational
    console.warn(`[EVF] i18n: failed to fetch catalog from ${url} — using empty catalog.`, err);
    catalog = {};
  } finally {
    clearTimeout(timer);
  }

  _cache.set(cacheKey, catalog);
  return catalog;
}

/**
 * Create a translation function bound to the given catalog.
 *
 * The returned function:
 *   - Returns the string for `key` if found.
 *   - Interpolates `{varName}` placeholders with `vars` if provided.
 *   - Falls back to the `key` itself if not found (never throws).
 *
 * @param catalog - The loaded i18n catalog (from `loadI18n`).
 */
export function makeT(
  catalog: Record<string, string>,
): (key: string, vars?: Record<string, string>) => string {
  return function t(key: string, vars?: Record<string, string>): string {
    const raw = catalog[key] ?? key;
    if (!vars) {
      return raw;
    }
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), raw);
  };
}

/**
 * Clear the module-level cache (useful for testing).
 */
export function clearI18nCache(): void {
  _cache.clear();
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Validate that `value` is a plain object with all string values.
 * Returns null if validation fails (never throws).
 */
function _validateCatalog(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const v of Object.values(obj)) {
    if (typeof v !== 'string') {
      return null;
    }
  }
  return obj as Record<string, string>;
}
