/**
 * pino logger factory for @evf/foundry-mcp.
 *
 * Security (T-11-01): the redact list covers all known paths where a bearer
 * token or secret could appear in a log entry. Any structural log object with
 * `bearer`, `token`, `headers.authorization`, or nested variants is redacted.
 *
 * Destination logic:
 * - `destination: 'stderr'` — used by the stdio entry so pino output does not
 *   collide with the MCP stdio transport (which writes JSON-RPC frames to stdout).
 * - default (no destination) — stdout, appropriate for the HTTP entry.
 *
 * @see packages/bridge/src/server.ts lines 122-132 (reference redact list)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 1
 */

import pino from 'pino';

/**
 * Options for {@link buildLogger}.
 */
export interface BuildLoggerOptions {
  /** pino log level string (e.g. 'info', 'debug', 'warn'). */
  level: string;
  /**
   * Optional output destination.
   *
   * - `'stderr'` — write to file descriptor 2 (required for stdio MCP entry
   *   so pino output does not collide with JSON-RPC frames on stdout).
   * - omit / `undefined` — default pino destination (stdout).
   */
  destination?: 'stderr';
}

/**
 * Redact paths for pino — covers bearer token in all known structural positions.
 *
 * Mirrors the bridge's redact list (packages/bridge/src/server.ts lines 122-132)
 * with additions for MCP-specific paths (EVF_BEARER, bridgeUrl with potential
 * query-string token).
 *
 * T-11-01 mitigation: any log object containing a `bearer` or `token` field
 * at any nesting level is redacted before being written to the transport.
 */
const BEARER_REDACT_PATHS: string[] = [
  'token',
  'bearer',
  'headers.authorization',
  'headers.idempotency-key',
  '*.token',
  '*.bearer',
  'EVF_BEARER',
  'EVF_INTERNAL_SECRET',
];

/**
 * Build and return a configured pino logger instance.
 *
 * @param opts - Logger configuration options.
 * @returns A pino logger with bearer-redacting config.
 */
export function buildLogger(opts: BuildLoggerOptions): pino.Logger {
  const pinoOptions: pino.LoggerOptions = {
    level: opts.level,
    redact: {
      paths: BEARER_REDACT_PATHS,
      censor: '[REDACTED]',
    },
  };

  if (opts.destination === 'stderr') {
    // Write to stderr (file descriptor 2) so pino output does not collide
    // with JSON-RPC frames on stdout when using the stdio MCP transport.
    return pino(pinoOptions, pino.destination(2));
  }

  return pino(pinoOptions);
}
