/**
 * Secret-leak grep gate for the voice subsystem.
 *
 * Phase 12 Plan 01 Task 3 — T-12-LEAK-01 mitigation.
 *
 * Asserts that every *.ts file under src/voice/ contains ZERO matches of:
 * - DEEPGRAM_API_KEY
 * - sk-[A-Za-z0-9]{20,}   (OpenAI-style API keys)
 * - Token [A-Za-z0-9_-]{20,}   (Deepgram-style Token auth header literal)
 *
 * The Deepgram API key lives ONLY in packages/bridge/src/voice/ (Plan 12-03).
 * This test enforces that it never leaks into the foundry-mcp voice subsystem.
 *
 * Implementation:
 * - Glob src/voice/*.ts relative to the foundry-mcp package root.
 * - Use import.meta.url + fileURLToPath to resolve the package root (same
 *   pattern as Phase 11 11-04 SUMMARY decision-1 — fileURLToPath + n-level-up).
 * - Exclude the test file itself from the walk to avoid self-matching.
 * - Read each file and assert zero regex matches.
 *
 * @see packages/bridge/src/voice/deepgram-stt.ts (sole legitimate holder of key)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-01-PLAN.md Task 3 (T-12-LEAK-01)
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Regex that catches common secret patterns we must not have in the voice subtree. */
const SECRET_RE = /DEEPGRAM_API_KEY|sk-[A-Za-z0-9]{20,}|Token [A-Za-z0-9_-]{20,}/;

/** Package root: 3 levels up from src/__tests__/ */
const PKG_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const VOICE_DIR = path.join(PKG_ROOT, 'src', 'voice');

describe('T-12-LEAK-01: no secret patterns in src/voice/*.ts', () => {
  // Enumerate all .ts files in src/voice/ at test-collection time.
  const voiceFiles = readdirSync(VOICE_DIR)
    .filter((f) => f.endsWith('.ts'))
    // Exclude test files to avoid self-matching on the regex pattern literal above.
    .filter((f) => !f.endsWith('.test.ts'));

  it('has at least one voice source file to check', () => {
    expect(voiceFiles.length).toBeGreaterThan(0);
  });

  for (const file of voiceFiles) {
    it(`${file} contains no secret patterns`, () => {
      const fullPath = path.join(VOICE_DIR, file);
      const content = readFileSync(fullPath, 'utf-8');
      const matches = content.match(SECRET_RE);
      expect(matches, `Found secret pattern in ${file}: ${String(matches)}`).toBeNull();
    });
  }
});
