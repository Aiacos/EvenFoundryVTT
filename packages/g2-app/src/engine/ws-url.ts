/**
 * Derive the bridge WebSocket **connect** URL from the bridge REST **base** URL.
 *
 * The boot engine is configured with `opts.bridgeUrl` = the bridge's REST base
 * URL (scheme `http`/`https`, e.g. `https://host:443`). The WebSocket, however,
 * must target the bridge's live `/ws` route on a `ws`/`wss` scheme (the bridge
 * serves it via `app.get('/ws', { websocket: true })`). Opening a raw
 * `new WebSocket('https://host:443')` never connects (wrong scheme, no path),
 * which is exactly the boot failure this helper fixes.
 *
 * Derivation rules (pure, idempotent):
 *   - `http`/`https` input → rewrite a leading `http` to `ws` (`http→ws`,
 *     `https→wss`), strip trailing slashes, append `/ws` unless already present.
 *   - An input already on a `ws`/`wss` scheme is treated as an already-derived
 *     connect URL: trailing slashes are stripped, but the scheme is NOT
 *     converted and `/ws` is NOT force-appended (so a connect URL with a custom
 *     path is left untouched, and an already-`/ws` URL is returned unchanged).
 *     This keeps the function safe to apply twice and preserves existing
 *     test/boot fixtures byte-for-byte.
 *
 * Pure function: no `window` / global access; safe to import from unit tests.
 *
 * @param baseUrl - The bridge REST base URL (`http(s)://…`) or an already-derived
 *   `ws(s)://…` connect URL.
 * @returns The `ws(s)://…/ws` connect URL.
 *
 * @example
 * toWsConnectUrl('https://host:443')  // 'wss://host:443/ws'
 * toWsConnectUrl('http://host:8910')  // 'ws://host:8910/ws'
 * toWsConnectUrl('wss://host/ws')     // 'wss://host/ws' (idempotent)
 */
export function toWsConnectUrl(baseUrl: string): string {
  // Strip any trailing slashes first (applies to both http(s) and ws(s) inputs).
  const trimmed = baseUrl.replace(/\/+$/, '');

  // Already on a ws/wss scheme → treat as an already-derived connect URL:
  // do not scheme-convert, do not force-append '/ws'.
  if (/^wss?:\/\//.test(trimmed)) {
    return trimmed;
  }

  // http(s) REST base → ws(s) scheme; only a leading 'http' is rewritten.
  const wsScheme = trimmed.replace(/^http/, 'ws');

  // Idempotent '/ws' append: do not double-append if already present.
  return wsScheme.endsWith('/ws') ? wsScheme : `${wsScheme}/ws`;
}
