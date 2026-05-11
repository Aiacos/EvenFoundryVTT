/**
 * GET /v1/i18n/:lang — i18n catalog endpoint.
 *
 * No auth required — catalog strings are not sensitive (D-2.19).
 * Loads from `packages/foundry-module/lang/{en,it}.json` at server startup.
 * Falls back to `en` if requested lang not found.
 * Sets `Cache-Control: public, max-age=300` (5 min).
 *
 * Response: the raw JSON object from the lang file.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md § D-2.19
 * @see Specs.md §7.16 (locale handling)
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const SUPPORTED_LANGS = ['en', 'it'] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Catalog map loaded at module init (once per process). */
const catalogs = new Map<SupportedLang, Record<string, string>>();

/**
 * Load lang files from foundry-module/lang/ at server startup.
 *
 * Path resolution is ESM-safe via `import.meta.url`.
 * If a lang file is missing, logs a warning and stores an empty catalog.
 */
function loadCatalogs(langDirOverride?: string): void {
  const langDir =
    langDirOverride ??
    resolve(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'foundry-module',
      'lang',
    );

  for (const lang of SUPPORTED_LANGS) {
    try {
      const content = readFileSync(join(langDir, `${lang}.json`), 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        catalogs.set(lang, parsed as Record<string, string>);
      } else {
        console.warn(
          `[EVF bridge] i18n: unexpected catalog shape for ${lang} — using empty object`,
        );
        catalogs.set(lang, {});
      }
    } catch (err) {
      console.warn(
        `[EVF bridge] i18n: could not load lang/${lang}.json — using empty catalog`,
        err,
      );
      catalogs.set(lang, {});
    }
  }
}

// Load on module import (production path). Tests can call loadCatalogs(dir) directly.
loadCatalogs();

/**
 * Register the GET /v1/i18n/:lang route.
 *
 * @param app - Fastify instance
 * @param langDirOverride - Optional override for the lang directory (used in tests)
 */
export async function registerI18nRoute(
  app: FastifyInstance,
  langDirOverride?: string,
): Promise<void> {
  if (langDirOverride !== undefined) {
    // Reload with test override path
    catalogs.clear();
    loadCatalogs(langDirOverride);
  }

  app.get<{ Params: { lang: string } }>('/v1/i18n/:lang', async (request, reply) => {
    const { lang } = request.params;

    // Normalise: BCP-47 primary tag only (e.g. "it-IT" → "it")
    const primary = lang.split('-')[0]?.toLowerCase() ?? 'en';
    const resolved: SupportedLang = SUPPORTED_LANGS.includes(primary as SupportedLang)
      ? (primary as SupportedLang)
      : 'en';

    const catalog = catalogs.get(resolved) ?? {};

    return reply.header('Cache-Control', 'public, max-age=300').status(200).send(catalog);
  });
}
