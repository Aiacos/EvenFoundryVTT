/**
 * Pure HTTP routing for the EVF relay Worker (ADR-0019, specs/004-relay-pairing plan §Design 1).
 *
 * Kept free of Workers-runtime globals so it is unit-testable under Node.
 */

/** The two roles that can join a room. */
export type Role = 'projector' | 'glasses';

/** Room ids are base64url, 22–64 chars (≥ 128 bits of entropy at the low end). */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

const ROOM_PATH_PATTERN = /^\/r\/([^/]+)$/;

/** CORS headers sent on `/health` and on every `OPTIONS` preflight. */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

/** Outcome of {@link routeRequest}. */
export type Route =
  | { readonly kind: 'health' }
  | { readonly kind: 'preflight' }
  | { readonly kind: 'room'; readonly room: string; readonly role: Role }
  | { readonly kind: 'reject'; readonly status: 404 | 426 };

/**
 * Narrows an arbitrary string to a {@link Role}.
 *
 * @param value - Candidate role (e.g. the `role` query parameter).
 * @returns `true` when `value` is `projector` or `glasses`.
 */
export function isRole(value: string | null): value is Role {
  return value === 'projector' || value === 'glasses';
}

/**
 * The role a socket forwards to.
 *
 * @param role - The sender's role.
 * @returns The opposite role.
 */
export function peerOf(role: Role): Role {
  return role === 'projector' ? 'glasses' : 'projector';
}

/**
 * Decides what the Worker does with a request.
 *
 * - `OPTIONS` on any path → `preflight` (204 + CORS).
 * - `GET /health` → `health` (200 `ok` + CORS).
 * - `GET /r/<room>?role=projector|glasses` → `room` when upgrading to WebSocket, else
 *   `reject 426`.
 * - Anything else (bad path, room id or role, other method) → `reject 404`.
 *
 * @param method - HTTP method.
 * @param url - Full request URL.
 * @param upgrade - Value of the `Upgrade` header, or `null`.
 * @returns The routing decision.
 */
export function routeRequest(method: string, url: URL, upgrade: string | null): Route {
  if (method === 'OPTIONS') return { kind: 'preflight' };
  if (method !== 'GET') return { kind: 'reject', status: 404 };
  if (url.pathname === '/health') return { kind: 'health' };
  const room = ROOM_PATH_PATTERN.exec(url.pathname)?.[1];
  const role = url.searchParams.get('role');
  if (room === undefined || !ROOM_ID_PATTERN.test(room) || !isRole(role)) {
    return { kind: 'reject', status: 404 };
  }
  if (upgrade?.toLowerCase() !== 'websocket') return { kind: 'reject', status: 426 };
  return { kind: 'room', room, role };
}
