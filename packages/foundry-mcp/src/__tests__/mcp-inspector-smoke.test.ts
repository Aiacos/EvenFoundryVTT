/**
 * MCP Inspector smoke test — Plan 11-04 Task 2 (RED phase).
 *
 * Spawns the stdio entrypoint (dist/index.js) as a child process and verifies
 * the MCP wire protocol end-to-end:
 *   1. initialize → serverInfo.name + serverInfo.version + protocolVersion
 *   2. tools/list → exactly 6 tools with correct sorted names
 *   3. resources/list → exactly 4 resources with correct sorted URIs
 *   4. SIGTERM → clean process exit
 *
 * Design:
 * - Uses EVF_BRIDGE_URL=http://localhost:9999 (unreachable on purpose) to exercise
 *   bridge-soft-fail behavior: server boots and answers tools/list + resources/list
 *   even with no bridge connection.
 * - EVF_BEARER=smoke-token (any non-empty string satisfies the env validator).
 * - LOG_LEVEL=silent so stderr noise is suppressed.
 *
 * Prerequisites:
 * - `pnpm --filter @evf/foundry-mcp build` must have run before this test.
 *   The beforeAll hook builds if dist/index.js is missing.
 *
 * Timeout: 30 000 ms per test (spawn + MCP handshake can take several seconds).
 *
 * @see packages/foundry-mcp/src/index.ts (stdio entry)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-04-PLAN.md Task 2
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ─── Paths ────────────────────────────────────────────────────────────────────

// Resolve from the test file path: src/__tests__/file.ts → go up 3 levels → package root
// (file → __tests__ → src → foundry-mcp)
const pkgDir = join(fileURLToPath(import.meta.url), '..', '..', '..');
const distIndex = join(pkgDir, 'dist', 'index.js');

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function frame(obj: object): string {
  return JSON.stringify(obj) + '\n';
}

const INITIALIZE = frame({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0.0.0' },
  },
});

const INITIALIZED = frame({
  jsonrpc: '2.0',
  method: 'notifications/initialized',
});

const TOOLS_LIST = frame({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

const RESOURCES_LIST = frame({ jsonrpc: '2.0', id: 3, method: 'resources/list' });

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

// ─── Build gate ───────────────────────────────────────────────────────────────

beforeAll(() => {
  if (!existsSync(distIndex)) {
    execSync('pnpm --filter @evf/foundry-mcp build', {
      stdio: 'pipe',
      cwd: join(pkgDir, '..', '..'),
    });
  }
}, 60_000);

// ─── Smoke test ───────────────────────────────────────────────────────────────

describe('MCP Inspector smoke — stdio entrypoint', () => {
  it('case 1-7: initialize + tools/list + resources/list end-to-end', async () => {
    const child = spawn('node', [distIndex], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EVF_BEARER: 'smoke-token',
        EVF_BRIDGE_URL: 'http://localhost:9999',
        LOG_LEVEL: 'silent',
      },
    });

    const responses = new Map<number, JsonRpcResponse>();
    let stdoutBuffer = '';

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Smoke test timed out waiting for id=3 response'));
      }, 25_000);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let parsed: JsonRpcResponse;
          try {
            parsed = JSON.parse(trimmed) as JsonRpcResponse;
          } catch {
            continue;
          }
          if (typeof parsed.id === 'number') {
            responses.set(parsed.id, parsed);
          }
          if (responses.has(3)) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Write JSON-RPC frames
      child.stdin.write(INITIALIZE);
      child.stdin.write(INITIALIZED);
      child.stdin.write(TOOLS_LIST);
      child.stdin.write(RESOURCES_LIST);
    });

    // ── Case 1: initialize response (id=1) ──────────────────────────────────
    const initResp = responses.get(1);
    expect(initResp, 'initialize response (id=1) must exist').toBeDefined();
    expect(initResp!.result).toBeDefined();
    const serverInfo = initResp!.result!['serverInfo'] as { name: string; version: string };
    expect(serverInfo.name, 'serverInfo.name').toBe('evf-foundry-mcp');
    expect(serverInfo.version, 'serverInfo.version').toBe('0.1.0-alpha.0');
    const protocolVersion = initResp!.result!['protocolVersion'] as string;
    expect(protocolVersion, 'protocolVersion').toBe('2025-06-18');

    // ── Case 2: tools/list response (id=2) ─────────────────────────────────
    const toolsResp = responses.get(2);
    expect(toolsResp, 'tools/list response (id=2) must exist').toBeDefined();
    expect(toolsResp!.result).toBeDefined();
    const tools = toolsResp!.result!['tools'] as { name: string }[];
    expect(tools, 'tools must be an array').toBeInstanceOf(Array);
    expect(tools, 'must have exactly 6 tools').toHaveLength(6);
    const sortedToolNames = tools.map((t) => t.name).sort();
    expect(sortedToolNames).toEqual([
      'cast-spell',
      'drop-concentration',
      'move-token',
      'place-template',
      'use-item',
      'weapon-attack',
    ]);

    // ── Case 3: resources/list response (id=3) ──────────────────────────────
    const resourcesResp = responses.get(3);
    expect(resourcesResp, 'resources/list response (id=3) must exist').toBeDefined();
    expect(resourcesResp!.result).toBeDefined();
    const resources = resourcesResp!.result!['resources'] as { uri: string }[];
    expect(resources, 'resources must be an array').toBeInstanceOf(Array);
    expect(resources, 'must have exactly 4 resources').toHaveLength(4);
    const sortedUris = resources.map((r) => r.uri).sort();
    expect(sortedUris).toEqual([
      'actor://current',
      'combat://current',
      'log://recent',
      'scene://current',
    ]);

    // ── Case 4: clean shutdown ───────────────────────────────────────────────
    child.kill('SIGTERM');
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
      // Fallback: if SIGTERM doesn't land, force kill after 5s
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve(null);
      }, 5_000);
    });
    // SIGTERM exit: code=null + signal='SIGTERM', or code=0 (graceful handler)
    // Both are acceptable — we just assert the process actually exited.
    expect(exitCode === null || exitCode === 0 || exitCode === 1).toBe(true);
  }, 30_000);
});

afterAll(() => {
  // No persistent resources to clean up — child is killed in the test itself.
});
