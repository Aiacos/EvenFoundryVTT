/**
 * No-SSE-import grep gate — Plan 11-04 Task 2 (RED phase).
 *
 * Asserts that no source file in packages/foundry-mcp/src/ imports from the
 * deprecated `@modelcontextprotocol/sdk/server/sse` path or references
 * `SSEServerTransport`.
 *
 * Context:
 * - MCP spec rev 2025-06-18: HTTP+SSE transport deprecated since 2025-03-26.
 * - Specs.md §4.7 + ADR-0004 + CONTEXT D-11-01: HTTP+SSE FORBIDDEN in foundry-mcp.
 * - This test is the automated enforcement gate for that invariant.
 *
 * Implementation:
 * - Walks src/**\/*.ts recursively via fs.readdirSync.
 * - For each .ts file, checks for:
 *   1. Import from '@modelcontextprotocol/sdk/server/sse' (any variant)
 *   2. Mention of `SSEServerTransport`
 * - Fails with offending file paths listed so the developer knows exactly
 *   which file introduced the violation.
 *
 * @see .planning/phases/11-v2-foundry-mcp-server/11-04-PLAN.md Task 2
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ─── Walk helper ──────────────────────────────────────────────────────────────

function walkTs(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkTs(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

/**
 * Matches an actual import statement (not a comment) importing from server/sse.
 * Uses a line-level check: the line must start with `import` (after trimming)
 * and contain the sse path. Comments (// or * ...) are skipped.
 */
function hasRealSseImport(content: string): boolean {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (/from\s+['"]@modelcontextprotocol\/sdk\/server\/sse/.test(trimmed)) return true;
  }
  return false;
}

/**
 * Matches SSEServerTransport in non-comment, non-string-literal context.
 * We check for it outside of comment lines and outside of quote-delimited strings
 * by checking non-comment, non-test-file sources.
 *
 * The test file itself is excluded from the walk to avoid self-matching.
 */
function hasRealSseClass(content: string): boolean {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    // Only flag if SSEServerTransport appears outside a string literal
    // (a real usage would be `new SSEServerTransport(` or `import type { SSEServerTransport }`)
    if (/\bSSEServerTransport\b/.test(trimmed) && !/['"`].*SSEServerTransport.*['"`]/.test(trimmed))
      return true;
  }
  return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const srcDir = join(fileURLToPath(import.meta.url), '..', '..', '..', 'src');
// Exclude this test file from the walk (it intentionally contains the patterns for documentation)
const thisFile = fileURLToPath(import.meta.url);

describe('no-sse-import grep gate', () => {
  const tsFiles = walkTs(srcDir).filter((f) => f !== thisFile);

  it('no source file imports from @modelcontextprotocol/sdk/server/sse (deprecated since 2025-03-26)', () => {
    const offenders = tsFiles.filter((f) => hasRealSseImport(readFileSync(f, 'utf8')));
    expect(offenders, `SSE import found in: ${offenders.join(', ')}`).toHaveLength(0);
  });

  it('no source file references SSEServerTransport outside comments', () => {
    const offenders = tsFiles.filter((f) => hasRealSseClass(readFileSync(f, 'utf8')));
    expect(offenders, `SSEServerTransport found in: ${offenders.join(', ')}`).toHaveLength(0);
  });

  it('foundry-mcp src/ has at least 1 .ts file (sanity check that walk is working)', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });
});
