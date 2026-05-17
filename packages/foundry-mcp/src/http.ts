/**
 * Streamable HTTP transport entry for @evf/foundry-mcp.
 *
 * Usage (homelab remote MCP):
 *   EVF_BEARER=<token> EVF_BRIDGE_URL=http://localhost:8910 node dist/http.js
 *
 * Binds to 0.0.0.0:${MCP_HTTP_PORT} (default 8911, bridge owns 8910).
 * Handles POST/GET/DELETE /mcp — all other paths return 404.
 *
 * Bearer validation (T-11-02):
 *   - All requests MUST include `Authorization: Bearer <token>`.
 *   - Validation uses crypto.timingSafeEqual to prevent timing attacks.
 *   - On mismatch: 401 response BEFORE invoking transport.handleRequest.
 *   - This is a belt-and-suspenders layer — the bridge re-validates on
 *     every tool.invoke call via the Phase 7 bearer-bound idempotency path.
 *
 * Session model: STATELESS (sessionIdGenerator: undefined).
 * Single-tenant homelab — one bearer = one principal; no per-client session needed.
 *
 * HTTP+SSE is FORBIDDEN:
 * - Do NOT import from '@modelcontextprotocol/sdk/server/sse.js'.
 * - Only Streamable HTTP (from './streamableHttp.js') is used here.
 * - MCP spec rev 2025-06-18: HTTP+SSE deprecated since 2025-03-26.
 *
 * @see packages/foundry-mcp/src/index.ts (stdio entry)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 2
 */

import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BootError, parseMcpEnv } from './env.js';
import { buildLogger } from './logger.js';
import { buildMcpServer } from './server-factory.js';

/** Read the full body of an IncomingMessage as a Buffer. */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

/**
 * Constant-time bearer comparison (T-11-02).
 *
 * Length mismatch returns false immediately (before compare) to avoid
 * leaking timing information on length difference. Both buffers are
 * zero-padded to equal length before timingSafeEqual when lengths differ,
 * but the length check result is returned, not the compare result.
 *
 * Implementation detail: comparing Buffers of equal length is required by
 * `crypto.timingSafeEqual`. We fast-reject on length mismatch as a first
 * guard, then safe-compare on same-length inputs.
 */
function bearerEquals(provided: string, expected: string): boolean {
  // Fast-reject on length mismatch (no timing info beyond the mismatch fact).
  if (provided.length !== expected.length) {
    return false;
  }
  // Same-length: use constant-time compare.
  const a = Buffer.from(provided, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return timingSafeEqual(a, b);
}

/** HTTP methods that the MCP Streamable HTTP transport handles. */
const MCP_METHODS = new Set(['POST', 'GET', 'DELETE']);

// Top-level async IIFE — HTTP server starts here.
(async () => {
  try {
    const env = parseMcpEnv();
    // HTTP mode: pino defaults to stdout (fine — no stdio collision here).
    const logger = buildLogger({ level: env.logLevel });
    const server = buildMcpServer({ logger, bridgeUrl: env.bridgeUrl, bearer: env.bearer });

    // STATELESS mode: omit sessionIdGenerator per D-11-01 (single-tenant homelab;
    // one bearer = one principal; no per-client session id needed).
    // NOTE: With exactOptionalPropertyTypes, passing `undefined` explicitly would be
    // a type error — we omit the property to get stateless behaviour.
    const transport = new StreamableHTTPServerTransport({});
    // Cast: StreamableHTTPServerTransport.onclose is typed as `(() => void) | undefined`
    // but Transport interface expects `() => void`. This is an upstream SDK type inconsistency
    // with exactOptionalPropertyTypes; the cast is safe at runtime.
    await server.connect(
      transport as unknown as import('@modelcontextprotocol/sdk/shared/transport.js').Transport,
    );

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        // ── Health check endpoint (no auth required) ──────────────────────────────
        // Used by Docker Compose healthcheck: wget -qO- http://localhost:8911/healthz
        if (req.method === 'GET' && req.url === '/healthz') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          return;
        }

        // ── Bearer auth check (T-11-02) ──────────────────────────────────────────
        const authHeader = req.headers.authorization ?? '';
        const providedBearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

        if (!bearerEquals(providedBearer, env.bearer)) {
          logger.warn({ path: req.url }, 'HTTP MCP: unauthorized request — 401');
          res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
          res.end(JSON.stringify({ error: 'invalid_token' }));
          return;
        }

        // ── Route /mcp → Streamable HTTP transport ────────────────────────────────
        const url = req.url ?? '/';
        if (url === '/mcp' && req.method !== undefined && MCP_METHODS.has(req.method)) {
          // Read body for POST requests (GET + DELETE have no body).
          let parsedBody: unknown;
          if (req.method === 'POST') {
            const raw = await readBody(req);
            if (raw.length > 0) {
              try {
                parsedBody = JSON.parse(raw.toString('utf-8'));
              } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'invalid_json_body' }));
                return;
              }
            }
          }
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        // ── 404 for all other paths ───────────────────────────────────────────────
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
      } catch (err) {
        logger.error({ err }, 'HTTP MCP: unhandled request error');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal_server_error' }));
        }
      }
    });

    httpServer.listen(env.httpPort, '0.0.0.0', () => {
      logger.info({ port: env.httpPort }, `MCP HTTP ready on :${env.httpPort}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received — shutting down MCP HTTP server');
      httpServer.close(() => process.exit(0));
    });
    process.on('SIGINT', () => {
      logger.info('SIGINT received — shutting down MCP HTTP server');
      httpServer.close(() => process.exit(0));
    });
  } catch (err) {
    if (err instanceof BootError) {
      process.stderr.write(`BOOT_ERROR: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`UNEXPECTED: ${String(err)}\n`);
    process.exit(1);
  }
})();
