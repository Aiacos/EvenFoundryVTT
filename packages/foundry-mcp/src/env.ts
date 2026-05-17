/**
 * Environment variable loading + validation for @evf/foundry-mcp.
 *
 * Centralises all env-var access so entrypoints (stdio + HTTP) share a single
 * parsing path. Throws `BootError` (never plain Error) on missing/invalid
 * required variables so entrypoints can distinguish boot-time config failures
 * from runtime errors and exit with code 2 (D-11-01-AUTH convention).
 *
 * Security (T-11-01): `BootError.message` NEVER includes the bearer value.
 * The redact list in `logger.ts` also covers all known bearer field paths.
 *
 * @see packages/foundry-mcp/src/logger.ts (pino redact config — T-11-01)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 1
 */

/**
 * Configuration loaded from environment variables at startup.
 *
 * All fields are validated by `parseMcpEnv` before use.
 */
export interface McpEnv {
  /** Opaque 24h bearer token (required, non-empty). */
  bearer: string;
  /** HTTP URL of the EVF bridge, e.g. `http://localhost:8910`. */
  bridgeUrl: string;
  /** Port for the Streamable HTTP transport (default: 8911). */
  httpPort: number;
  /** pino log level string (default: 'info'). */
  logLevel: string;
}

/**
 * Boot-time configuration error.
 *
 * Thrown by `parseMcpEnv` when a required environment variable is missing
 * or invalid. Entrypoints catch `BootError` and exit with code 2, writing
 * the message to stderr.
 *
 * SECURITY: The constructor NEVER includes the bearer value in `message` —
 * this is validated by test case 7 in env.test.ts (T-11-01).
 */
export class BootError extends Error {
  override readonly name = 'BootError';

  constructor(message: string) {
    // Never pass a bearer value here — callers must not include secrets in message.
    super(message);
    // Restore prototype chain for `instanceof` checks in Node ESM.
    Object.setPrototypeOf(this, BootError.prototype);
  }
}

/**
 * Parse and validate environment variables for the MCP server.
 *
 * Accepts an optional `env` parameter (defaults to `process.env`) for
 * test isolation — tests pass plain objects, no `vi.stubEnv` needed.
 *
 * Validation rules:
 * - `EVF_BEARER` — required, non-empty string. Boot fails with exit(2) if absent.
 * - `EVF_BRIDGE_URL` — required, non-empty string.
 * - `MCP_HTTP_PORT` — optional, must parse to a positive integer in [1..65535].
 * - `LOG_LEVEL` — optional, any string (pino will validate at logger construction).
 *
 * @param env - Object to read env vars from (default: `process.env`).
 * @returns Parsed, validated {@link McpEnv}.
 * @throws {BootError} If any required variable is missing/empty or a numeric
 *   variable has an invalid format.
 */
export function parseMcpEnv(env: Record<string, string | undefined> = process.env): McpEnv {
  // ── EVF_BEARER ────────────────────────────────────────────────────────────────
  const bearer = env.EVF_BEARER;
  if (bearer === undefined || bearer === '') {
    // SECURITY: Do NOT include the bearer value in the error message (T-11-01).
    throw new BootError('EVF_BEARER required: set this to the 24h opaque bearer token');
  }

  // ── EVF_BRIDGE_URL ────────────────────────────────────────────────────────────
  const bridgeUrl = env.EVF_BRIDGE_URL;
  if (bridgeUrl === undefined || bridgeUrl === '') {
    throw new BootError(
      'EVF_BRIDGE_URL required: set this to the bridge HTTP URL (e.g. http://localhost:8910)',
    );
  }

  // ── MCP_HTTP_PORT (optional, default 8911) ────────────────────────────────────
  let httpPort = 8911;
  const rawPort = env.MCP_HTTP_PORT;
  if (rawPort !== undefined && rawPort !== '') {
    const parsed = parseInt(rawPort, 10);
    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new BootError(
        `MCP_HTTP_PORT must be integer in [1..65535]; got: ${JSON.stringify(rawPort)}`,
      );
    }
    httpPort = parsed;
  }

  // ── LOG_LEVEL (optional, default 'info') ─────────────────────────────────────
  const logLevel = env.LOG_LEVEL ?? 'info';

  return { bearer, bridgeUrl, httpPort, logLevel };
}
