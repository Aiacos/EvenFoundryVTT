/**
 * EVF relay Worker entry (ADR-0019, specs/004-relay-pairing plan §Design 1).
 *
 * Routes `GET /r/<room>?role=projector|glasses` WebSocket upgrades to the `Room` Durable
 * Object named after the room, answers `GET /health` and CORS preflights, 404s the rest.
 */
import { CORS_HEADERS, routeRequest } from './routing.js';

export { Room } from './room.js';

/** Worker bindings declared in `wrangler.toml`. */
export interface Env {
  /** One `Room` Durable Object per room id. */
  readonly ROOM: DurableObjectNamespace;
}

/**
 * Handles one HTTP request.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns The response (a `101` from the room for accepted upgrades).
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const route = routeRequest(request.method, new URL(request.url), request.headers.get('Upgrade'));
  switch (route.kind) {
    case 'preflight':
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    case 'health':
      return new Response('ok', {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      });
    case 'room':
      return env.ROOM.get(env.ROOM.idFromName(route.room)).fetch(request);
    case 'reject':
      return new Response(route.status === 426 ? 'upgrade required' : 'not found', {
        status: route.status,
      });
  }
}

export default { fetch: handleRequest } satisfies ExportedHandler<Env>;
