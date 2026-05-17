/**
 * Voice-path secret-redact gate — Plan 12-03 Task 1 (T-12-02 mitigation).
 *
 * Asserts that:
 * 1. The pino redact list in server.ts contains all 4 new Deepgram field paths.
 * 2. A pino logger configured with the Phase 12 redact list does NOT emit 'sk-fake'
 *    in any of the 4 sensitive field positions.
 *
 * Test IDs:
 *   - VSR-01: server.ts source contains 'deepgramKey' in the redact array
 *   - VSR-02: server.ts source contains 'apiKey' in the redact array
 *   - VSR-03: server.ts source contains '*.deepgramKey' in the redact array
 *   - VSR-04: server.ts source contains '*.apiKey' in the redact array
 *   - VSR-05: pino logger with Phase 12 redact list emits zero 'sk-fake' in captured output
 *
 * @see ../server.ts (pino redact list — lines with 'deepgramKey', 'apiKey')
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 1
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

describe('pino redact — Deepgram key paths (VSR-01..VSR-05)', () => {
  it('VSR-01..VSR-04: server.ts redact array contains all 4 new Deepgram field paths', () => {
    const serverPath = fileURLToPath(new URL('../server.ts', import.meta.url));
    const serverSource = readFileSync(serverPath, 'utf-8');

    // VSR-01
    expect(serverSource).toContain("'deepgramKey'");
    // VSR-02
    expect(serverSource).toContain("'apiKey'");
    // VSR-03
    expect(serverSource).toContain("'*.deepgramKey'");
    // VSR-04
    expect(serverSource).toContain("'*.apiKey'");
  });

  it('VSR-05: pino logger with Phase 12 redact list emits zero sk-fake in captured output', () => {
    const captured: string[] = [];

    // Create a pino logger with the full Phase 12 redact list and a custom
    // destination that writes to our in-memory buffer.
    const testLogger = pino(
      {
        level: 'debug',
        redact: [
          'apiKey',
          'bearer',
          'deepgramKey',
          'EVF_INTERNAL_SECRET',
          'headers.authorization',
          'headers.idempotency-key',
          'token',
          '*.apiKey',
          '*.bearer',
          '*.deepgramKey',
          '*.token',
        ],
      },
      {
        write(line: string) {
          captured.push(line);
        },
      },
    );

    // Log an object containing 'sk-fake' in all 4 sensitive field positions.
    testLogger.info(
      {
        deepgramKey: 'sk-fake',
        apiKey: 'sk-fake',
        headers: { authorization: 'Token sk-fake' },
        deepgram: { apiKey: 'sk-fake' },
      },
      'voice path init — VSR-05',
    );

    // pino writes synchronously to the destination stream for objects.
    // If nothing was captured, the test environment may be using a deferred
    // transport — we explicitly force a synchronous write via the destination pattern above.
    expect(captured.length).toBeGreaterThan(0);
    const allOutput = captured.join('');

    // VSR-05: zero occurrences of 'sk-fake' anywhere in the log output
    expect(allOutput).not.toContain('sk-fake');
  });
});
