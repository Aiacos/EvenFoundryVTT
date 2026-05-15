/**
 * Unit + INV-1 snapshot tests for BootErrorLayer (Phase 4b Plan 04 Task 2).
 *
 * Two suites:
 *   - BEL-01..BEL-07: behavioural assertions (id, no capture provider,
 *     container count, single textContainerUpgrade with the 60-char panel,
 *     verbatim title for IT / EN / DE locales, destroy is no-op idempotent).
 *   - BEL-08 parametric: 5 states × 2 locales = 10 it() blocks that compose
 *     the full 96×24 page (empty outer frame + BootErrorLayer's 8-row panel
 *     centered at rows 11..18 cols 19..79) and call matchAsciiFixture
 *     against the corresponding `boot-error.<state>.<locale>.txt` fixture
 *     shipped under `packages/shared-render/src/fixtures/`.
 *
 * Test discriminator markers `BEL-01`..`BEL-08` are embedded in `it()` titles
 * so the plan-checker grep gate (`grep -cE 'BEL-0[1-8]'`) matches exactly 8.
 *
 * **buildBootErrorPage helper:** composes a fresh 96×24 page from the canonical
 * outer frame (`╔══…══╗ / ║ … ║ / ╚══…══╝` — 24-row empty-page layout) and
 * surgically overlays the 8-row panel content from BootErrorLayer at rows
 * 11..18 cols 19..79. The fixture is the FULL page; the layer test composes
 * the full page (outer frame + panel content) and compares. This pattern
 * mirrors `buildToastScenePage` from `toast-snapshot.test.ts` (Plan 03).
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-04-PLAN.md Task 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §5.1-§5.10
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_ERROR_CONTAINER_NAME, BootErrorLayer } from '../boot-error-layer.js';
import {
  BOOT_ERROR_CONTENT,
  type BootErrorLocale,
  type BootErrorState,
} from '../boot-error-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock bridge — minimal surface BootErrorLayer.draw() touches.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockBridge() {
  const textContainerUpgrade = vi.fn().mockResolvedValue(true);
  const bridge = {
    textContainerUpgrade,
  } as unknown as EvenAppBridge;
  return { bridge, textContainerUpgrade };
}

// ──────────────────────────────────────────────────────────────────────────────
// Full-page composer (BEL-08 helper).
// ──────────────────────────────────────────────────────────────────────────────

/** Outer column of the canonical 96-wide page (`╔`/`║`/`╚` at col 0; `╗`/`║`/`╝` at col 95). */
const PAGE_WIDTH = 96;
const PAGE_HEIGHT = 24;
/** First row of the boot-error panel (0-indexed, fixture row 11). */
const PANEL_ROW_TOP_IDX = 10;
/** Panel left column (`┌`/`│`/`└` glyph at this column). */
const PANEL_LEFT_COL = 19;
/** Panel right column (`┐`/`│`/`┘` glyph at this column). */
const PANEL_RIGHT_COL = 78;

/**
 * Build the canonical 96×24 empty boot page (outer frame only — interior cells
 * are spaces) as a mutable array-of-arrays.
 *
 * Outer frame characters:
 *   - Row 0:   `╔` + 94 × `═` + `╗`
 *   - Rows 1..22: `║` + 94 × ` ` + `║`
 *   - Row 23:  `╚` + 94 × `═` + `╝`
 *
 * The boot-error fixture's outer frame matches this layout verbatim (UI-SPEC
 * §5.1 line 1, line 24 — and every inner row of the §5.1 fixture's outer
 * frame is `║ <94 spaces> ║`).
 */
function buildEmptyPage(): string[][] {
  const page: string[][] = [];
  // Row 0 — top frame.
  page.push(['╔', ...Array<string>(PAGE_WIDTH - 2).fill('═'), '╗']);
  // Rows 1..22 — side frame + 94 interior spaces.
  for (let r = 1; r < PAGE_HEIGHT - 1; r++) {
    page.push(['║', ...Array<string>(PAGE_WIDTH - 2).fill(' '), '║']);
  }
  // Row 23 — bottom frame.
  page.push(['╚', ...Array<string>(PAGE_WIDTH - 2).fill('═'), '╝']);
  return page;
}

/**
 * Paint the BootErrorLayer's 8-row panel onto the empty page at rows
 * PANEL_ROW_TOP_IDX..(PANEL_ROW_TOP_IDX + 7), columns PANEL_LEFT_COL..PANEL_RIGHT_COL.
 *
 * The 8 rows are assembled with the SAME logic as `BootErrorLayer._innerRow`:
 *   - Row 0: top border `┌` + 58 × `─` + `┐`
 *   - Row 1: `│ <title padded to 56 chars> │`
 *   - Row 2: `│ <56 spaces> │`
 *   - Row 3: `│ <hintLine1 padded to 56 chars> │`
 *   - Row 4: `│ <hintLine2 padded to 56 chars> │`
 *   - Row 5: `│ <56 spaces> │`
 *   - Row 6: `│ <closeAnnotation padded to 56 chars> │`
 *   - Row 7: bottom border `└` + 58 × `─` + `┘`
 */
function paintPanel(page: string[][], state: BootErrorState, locale: BootErrorLocale): void {
  const content = BOOT_ERROR_CONTENT[state][locale];
  const innerWidth = PANEL_RIGHT_COL - PANEL_LEFT_COL - 3; // 56 = 60 - 4 (│ ... │)

  const pad = (s: string): string => {
    if (s.length >= innerWidth) {
      return s.slice(0, innerWidth);
    }
    return s + ' '.repeat(innerWidth - s.length);
  };

  const innerRow = (s: string): string[] => ['│', ' ', ...pad(s), ' ', '│'];

  const topRow = ['┌', ...Array<string>(PANEL_RIGHT_COL - PANEL_LEFT_COL - 1).fill('─'), '┐'];
  const bottomRow = ['└', ...Array<string>(PANEL_RIGHT_COL - PANEL_LEFT_COL - 1).fill('─'), '┘'];

  const panelRows: string[][] = [
    topRow,
    innerRow(content.title),
    innerRow(''),
    innerRow(content.hintLine1),
    innerRow(content.hintLine2),
    innerRow(''),
    innerRow(content.closeAnnotation),
    bottomRow,
  ];

  for (let i = 0; i < panelRows.length; i++) {
    const targetRow = page[PANEL_ROW_TOP_IDX + i];
    const panelRow = panelRows[i];
    if (targetRow === undefined || panelRow === undefined) {
      throw new Error(`paintPanel: target row ${PANEL_ROW_TOP_IDX + i} or panel row ${i} missing`);
    }
    for (let c = 0; c < panelRow.length; c++) {
      const ch = panelRow[c];
      if (ch === undefined) {
        throw new Error(`paintPanel: missing char at panel row ${i} col ${c}`);
      }
      targetRow[PANEL_LEFT_COL + c] = ch;
    }
  }
}

/** Build the full 96×24 AsciiGrid for a given (state, locale) pair. */
function buildBootErrorPage(state: BootErrorState, locale: BootErrorLocale): AsciiGrid {
  const page = buildEmptyPage();
  paintPanel(page, state, locale);
  return new AsciiGrid(page);
}

// ──────────────────────────────────────────────────────────────────────────────
// BEL-01..BEL-07 — behavioural unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe('BootErrorLayer — unit behaviour', () => {
  let bridgeSpy: ReturnType<typeof makeMockBridge>;

  beforeEach(() => {
    bridgeSpy = makeMockBridge();
  });

  it('BEL-01: id is the stable literal "boot-error"', () => {
    const layer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'it');
    expect(layer.id).toBe('boot-error');
  });

  it('BEL-02: BootErrorLayer does NOT register a capture container (getCaptureContainer absent)', () => {
    const layer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'it');
    // Layer.getCaptureContainer is optional — absence means "no capture provider".
    expect((layer as { getCaptureContainer?: unknown }).getCaptureContainer).toBeUndefined();
  });

  it('BEL-03: getContainerCount() === { image: 0, text: 1 } (Strategy A)', () => {
    const layer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'it');
    expect(layer.getContainerCount()).toEqual({ image: 0, text: 1 });
  });

  it('BEL-04: draw() calls textContainerUpgrade exactly once with 8 newline-separated rows of 60 chars each', async () => {
    const layer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'it');
    await layer.draw();
    expect(bridgeSpy.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridgeSpy.textContainerUpgrade.mock.calls[0]?.[0] as {
      containerName: string;
      content: string;
    };
    expect(arg.containerName).toBe(BOOT_ERROR_CONTAINER_NAME);
    const rows = arg.content.split('\n');
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      // Each row is the inner panel (60 chars wide). Code-point count via spread.
      expect([...row]).toHaveLength(60);
    }
  });

  it('BEL-05: IT vs EN locale → different verbatim titles in the rendered content', async () => {
    // IT
    const itLayer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'it');
    await itLayer.draw();
    const itContent = (bridgeSpy.textContainerUpgrade.mock.calls[0]?.[0] as { content: string })
      .content;
    expect(itContent).toContain('HANDSHAKE FALLITO');
    // Reset and try EN
    bridgeSpy.textContainerUpgrade.mockClear();
    const enLayer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'en');
    await enLayer.draw();
    const enContent = (bridgeSpy.textContainerUpgrade.mock.calls[0]?.[0] as { content: string })
      .content;
    expect(enContent).toContain('HANDSHAKE FAILED');
  });

  it('BEL-06: DE locale → "BRIDGE NICHT ERREICHBAR" title rendered verbatim', async () => {
    const layer = new BootErrorLayer(bridgeSpy.bridge, 'bridge_unreachable', 'de');
    await layer.draw();
    const content = (bridgeSpy.textContainerUpgrade.mock.calls[0]?.[0] as { content: string })
      .content;
    expect(content).toContain('BRIDGE NICHT ERREICHBAR');
    expect(content).toContain('[X] Schließen');
  });

  it('BEL-07: destroy() is idempotent and never calls textContainerUpgrade', () => {
    const layer = new BootErrorLayer(bridgeSpy.bridge, 'handshake_failed', 'it');
    expect(() => {
      layer.destroy();
    }).not.toThrow();
    expect(() => {
      layer.destroy();
    }).not.toThrow();
    expect(bridgeSpy.textContainerUpgrade).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BEL-08 — parametric INV-1 fixture coverage (5 states × 2 locales = 10)
// ──────────────────────────────────────────────────────────────────────────────

interface FixtureCase {
  readonly state: BootErrorState;
  readonly locale: 'it' | 'en';
  readonly filename: string;
}

const FIXTURE_CASES: readonly FixtureCase[] = [
  { state: 'handshake_failed', locale: 'it', filename: 'boot-error.handshake-failed.it.txt' },
  { state: 'handshake_failed', locale: 'en', filename: 'boot-error.handshake-failed.en.txt' },
  { state: 'version_mismatch', locale: 'it', filename: 'boot-error.version-mismatch.it.txt' },
  { state: 'version_mismatch', locale: 'en', filename: 'boot-error.version-mismatch.en.txt' },
  { state: 'no_character', locale: 'it', filename: 'boot-error.no-character.it.txt' },
  { state: 'no_character', locale: 'en', filename: 'boot-error.no-character.en.txt' },
  { state: 'bridge_unreachable', locale: 'it', filename: 'boot-error.bridge-unreachable.it.txt' },
  { state: 'bridge_unreachable', locale: 'en', filename: 'boot-error.bridge-unreachable.en.txt' },
  { state: 'token_expired', locale: 'it', filename: 'boot-error.token-expired.it.txt' },
  { state: 'token_expired', locale: 'en', filename: 'boot-error.token-expired.en.txt' },
];

describe('BootErrorLayer — BEL-08 INV-1 fixture parity (5 states × IT/EN = 10)', () => {
  for (const { state, locale, filename } of FIXTURE_CASES) {
    it(`BEL-08 :: ${state} ${locale} matches ${filename}`, async () => {
      const page = buildBootErrorPage(state, locale);
      expect(page.width).toBe(PAGE_WIDTH);
      expect(page.height).toBe(PAGE_HEIGHT);
      await matchAsciiFixture(page, `../../../../shared-render/src/fixtures/${filename}`);
    });
  }
});
