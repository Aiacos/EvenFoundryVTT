/**
 * Boot-error UI types — discriminator enum + content lookup table.
 *
 * Pure data module: no I/O, no runtime imports apart from TypeScript types.
 * The `BOOT_ERROR_CONTENT` table is the single source of truth for the verbatim
 * IT / EN / DE strings each boot-error state renders (title + 2 recovery hint
 * lines + `[X] Close` annotation). The strings are baked at build time — no
 * runtime templating, no external string interpolation (T-4b-04-02 mitigation).
 *
 * The 5 enum members come straight from CONTEXT.md §Area 6 and from
 * UI-SPEC §3.3 (boot-error UI states); they are the exact reachable states that
 * `bootErrorFromException` (Plan 04 Task 2) can dispatch to. The 3 locales
 * (`it` / `en` / `de`) mirror `HudLocale` in `status-hud/i18n-budgets.ts` — DE
 * entries land here even though DE fixtures are deferred per UI-SPEC §9.5 +
 * RESEARCH §Q6 Assumption A6 (best-effort policy).
 *
 * Width budgets per UI-SPEC §4.3 — `title.length ≤ 24`, `hintLine1.length ≤ 50`,
 * `hintLine2.length ≤ 50`, `closeAnnotation.length ≤ 14`. The colocated test
 * (`__tests__/boot-error-types.test.ts`) cross-checks every BOOT_ERROR_CONTENT
 * value against the matching `HUD_WIDTH_BUDGETS.*` row landed in Plan 01.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 6
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.3 + §4.3
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 4
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (Plan 01 — boot_error_* keys)
 */

/**
 * Discriminator enum for the 5 boot-error states.
 *
 * Each member maps to:
 *   - a `BOOT_ERROR_CONTENT[state][locale]` entry (title + hints + close),
 *   - an exception source pattern in `boot-error-dispatch.ts` (Plan 04 Task 2),
 *   - an INV-1 fixture pair (IT + EN) in `packages/shared-render/src/fixtures/`.
 *
 * The literal union is intentional — `as const` arrays + Record key-typing rely
 * on it for exhaustiveness checks (Plan 04 Task 1 BET-4 parametric loop).
 */
export type BootErrorState =
  | 'handshake_failed'
  | 'version_mismatch'
  | 'no_character'
  | 'bridge_unreachable'
  | 'token_expired';

/**
 * Supported locales for boot-error UI content.
 *
 * Matches `HudLocale` from `status-hud/i18n-budgets.ts` — IT MVP canonical,
 * EN canonical fallback, DE best-effort. The table is fully populated for all
 * three locales here even though DE INV-1 fixtures are deferred per
 * UI-SPEC §9.5 + RESEARCH §Q6 Assumption A6.
 */
export type BootErrorLocale = 'it' | 'en' | 'de';

/**
 * Renderable content payload for a single (state, locale) pair.
 *
 * All four fields are mandatory strings:
 *   - `title`           — page title line (≤ 24 chars per UI-SPEC §4.3)
 *   - `hintLine1`       — first recovery hint line (≤ 50 chars)
 *   - `hintLine2`       — second recovery hint line (≤ 50 chars)
 *   - `closeAnnotation` — `[X] Close` style gesture annotation (≤ 14 chars)
 *
 * Readonly fields lock the shape against accidental in-place mutation; the
 * outer `BOOT_ERROR_CONTENT` constant is double-readonly via `Readonly<Record…>`
 * so the table is structurally immutable at compile time (BET-9 assertion).
 */
export interface BootErrorContent {
  /** Bolded title line — UI-SPEC §3.3 row 1 of the centered panel. */
  readonly title: string;
  /** First recovery hint — UI-SPEC §3.3 row 3 of the centered panel. */
  readonly hintLine1: string;
  /** Second recovery hint — UI-SPEC §3.3 row 4 of the centered panel. */
  readonly hintLine2: string;
  /** `[X] Close` style gesture annotation — UI-SPEC §3.3 row 6 of the panel. */
  readonly closeAnnotation: string;
}

/**
 * Static lookup table — 5 boot-error states × 3 locales × 4 fields.
 *
 * Values copied **verbatim** from UI-SPEC §3.3 (also mirrored in the
 * `HUD_WIDTH_BUDGETS.boot_error_*` rows landed by Plan 01). Plan 04 commits
 * this table as the single source of truth that the rendering layer
 * (`BootErrorLayer.draw()`) reads.
 *
 * The outer `as const` clause guarantees that every nested string is its
 * literal type (not `string`); the `Readonly<Record<…>>` annotation rejects
 * any mutation attempt with a TS compile-time error (BET-9 enforced via
 * `// @ts-expect-error`).
 *
 * T-4b-04-02 mitigation: this table is BAKED AT COMPILE TIME — there is no
 * runtime templating, no external interpolation, no path by which a Foundry
 * i18n catalog change could inject content into the boot-error UI without a
 * source-level patch to this file (which would also fail BET-5..BET-8 budget
 * tests).
 */
export const BOOT_ERROR_CONTENT: Readonly<
  Record<BootErrorState, Readonly<Record<BootErrorLocale, BootErrorContent>>>
> = {
  handshake_failed: {
    it: {
      title: 'HANDSHAKE FALLITO',
      hintLine1: 'Risposta del bridge non valida.',
      hintLine2: 'Verifica versione del modulo.',
      closeAnnotation: '[X] Chiudi',
    },
    en: {
      title: 'HANDSHAKE FAILED',
      hintLine1: 'Bridge response was invalid.',
      hintLine2: 'Check module version.',
      closeAnnotation: '[X] Close',
    },
    de: {
      title: 'HANDSHAKE FEHLGESCHLAGEN',
      hintLine1: 'Bridge-Antwort ungültig.',
      hintLine2: 'Modulversion prüfen.',
      closeAnnotation: '[X] Schließen',
    },
  },
  version_mismatch: {
    it: {
      title: 'VERSIONE INCOMPATIBILE',
      hintLine1: 'Il bridge parla un protocollo diverso.',
      hintLine2: 'Aggiorna il modulo Foundry.',
      closeAnnotation: '[X] Chiudi',
    },
    en: {
      title: 'VERSION MISMATCH',
      hintLine1: 'Bridge speaks a different protocol.',
      hintLine2: 'Update the Foundry module.',
      closeAnnotation: '[X] Close',
    },
    de: {
      title: 'VERSION INKOMPATIBEL',
      hintLine1: 'Bridge nutzt anderes Protokoll.',
      hintLine2: 'Foundry-Modul aktualisieren.',
      closeAnnotation: '[X] Schließen',
    },
  },
  no_character: {
    it: {
      title: 'NESSUN PERSONAGGIO',
      hintLine1: 'Nessun PG assegnato a questo player.',
      hintLine2: 'Assegna un PG da Foundry.',
      closeAnnotation: '[X] Chiudi',
    },
    en: {
      title: 'NO CHARACTER',
      hintLine1: 'No PC assigned to this player.',
      hintLine2: 'Assign one from Foundry.',
      closeAnnotation: '[X] Close',
    },
    de: {
      title: 'KEIN CHARAKTER',
      hintLine1: 'Kein SC zugewiesen.',
      hintLine2: 'Einen SC in Foundry zuweisen.',
      closeAnnotation: '[X] Schließen',
    },
  },
  bridge_unreachable: {
    it: {
      title: 'BRIDGE NON RAGGIUNGIBILE',
      hintLine1: 'Connessione al bridge fallita.',
      hintLine2: 'Verifica URL e rete LAN.',
      closeAnnotation: '[X] Chiudi',
    },
    en: {
      title: 'BRIDGE UNREACHABLE',
      hintLine1: 'Connection to bridge failed.',
      hintLine2: 'Check URL and LAN.',
      closeAnnotation: '[X] Close',
    },
    de: {
      title: 'BRIDGE NICHT ERREICHBAR',
      hintLine1: 'Bridge-Verbindung fehlgeschlagen.',
      hintLine2: 'URL und LAN prüfen.',
      closeAnnotation: '[X] Schließen',
    },
  },
  token_expired: {
    it: {
      title: 'TOKEN SCADUTO',
      hintLine1: 'La sessione è scaduta (24h).',
      hintLine2: 'Riaccoppia con un nuovo QR.',
      closeAnnotation: '[X] Chiudi',
    },
    en: {
      title: 'TOKEN EXPIRED',
      hintLine1: 'Session expired (24h).',
      hintLine2: 'Re-pair via the QR.',
      closeAnnotation: '[X] Close',
    },
    de: {
      title: 'TOKEN ABGELAUFEN',
      hintLine1: 'Sitzung abgelaufen (24h).',
      hintLine2: 'Neu pairen via QR.',
      closeAnnotation: '[X] Schließen',
    },
  },
} as const;
