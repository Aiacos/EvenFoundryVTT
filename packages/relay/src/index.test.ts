import { describe, expect, it, vi } from 'vitest';
import worker, { type Env, handleRequest } from './index.js';

const ROOM = 'abcdefghijklmnopqrstuv';

function fakeEnv(): {
  env: Env;
  stubFetch: ReturnType<typeof vi.fn>;
  idFromName: ReturnType<typeof vi.fn>;
} {
  const stubFetch = vi.fn(async () => new Response('from-room', { status: 200 }));
  const idFromName = vi.fn((name: string) => ({ name }));
  const get = vi.fn(() => ({ fetch: stubFetch }));
  return { env: { ROOM: { idFromName, get } } as unknown as Env, stubFetch, idFromName };
}

describe('worker fetch', () => {
  it('exports handleRequest as the Worker fetch handler', () => {
    expect(worker.fetch).toBe(handleRequest);
  });

  it('GET /health → 200 ok with CORS', async () => {
    const res = await handleRequest(new Request('https://relay.test/health'), fakeEnv().env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('OPTIONS on any path → 204 with CORS', async () => {
    const res = await handleRequest(
      new Request('https://relay.test/whatever', { method: 'OPTIONS' }),
      fakeEnv().env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('404s unknown paths and bad rooms', async () => {
    for (const path of ['/', '/r/short?role=glasses', `/r/${ROOM}?role=gm`]) {
      const res = await handleRequest(
        new Request(`https://relay.test${path}`, { headers: { Upgrade: 'websocket' } }),
        fakeEnv().env,
      );
      expect(res.status).toBe(404);
    }
  });

  it('426s a room request without Upgrade: websocket', async () => {
    const res = await handleRequest(
      new Request(`https://relay.test/r/${ROOM}?role=glasses`),
      fakeEnv().env,
    );
    expect(res.status).toBe(426);
  });

  it('routes an upgrade to the Durable Object named after the room', async () => {
    const { env, stubFetch, idFromName } = fakeEnv();
    const req = new Request(`https://relay.test/r/${ROOM}?role=projector`, {
      headers: { Upgrade: 'websocket' },
    });
    const res = await handleRequest(req, env);
    expect(idFromName).toHaveBeenCalledWith(ROOM);
    expect(stubFetch).toHaveBeenCalledWith(req);
    expect(await res.text()).toBe('from-room');
  });
});
