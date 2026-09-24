import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket, settle } from './__fixtures__/direct-fixtures.js';
import {
  FoundryClient,
  FoundryClientError,
  type IoFactory,
  type SocketOptions,
} from './foundry-client.js';

const BASE = 'https://foundry.example/vtt';

function response(body: string, init: ResponseInit & { url?: string; redirected?: boolean } = {}) {
  const res = new Response(body, init);
  if (init.url !== undefined) Object.defineProperty(res, 'url', { value: init.url });
  if (init.redirected !== undefined)
    Object.defineProperty(res, 'redirected', { value: init.redirected });
  return res;
}

function client(fetchImpl: typeof fetch, io?: IoFactory, socketTimeoutMs = 1_000) {
  return new FoundryClient(BASE, { fetch: fetchImpl, ...(io ? { io } : {}), socketTimeoutMs });
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof FoundryClientError ? error.kind : 'other';
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('probeStatus', () => {
  it('parses version and generation', async () => {
    const f = vi.fn(async () => response(JSON.stringify({ active: true, version: '14.360' })));
    await expect(client(f).probeStatus()).resolves.toEqual({
      active: true,
      version: '14.360',
      generation: 14,
    });
    expect(f).toHaveBeenCalledWith(`${BASE}/api/status`, {
      method: 'GET',
      credentials: 'same-origin',
    });
  });

  it('returns null for missing or non-JSON status and handles unknown versions', async () => {
    await expect(
      client(async () => response('nope', { status: 404 })).probeStatus(),
    ).resolves.toBeNull();
    await expect(client(async () => response('<html>')).probeStatus()).resolves.toBeNull();
    await expect(client(async () => response('{}')).probeStatus()).resolves.toEqual({
      active: false,
      version: null,
      generation: null,
    });
  });

  it('maps fetch failures to network', async () => {
    expect(
      await kindOf(
        client(async () => {
          throw new TypeError('Failed to fetch');
        }).probeStatus(),
      ),
    ).toBe('network');
  });
});

describe('fetchJoinPage / login', () => {
  it('GETs /join and returns the HTML', async () => {
    await expect(client(async () => response('<html>join</html>')).fetchJoinPage()).resolves.toBe(
      '<html>join</html>',
    );
    expect(await kindOf(client(async () => response('', { status: 503 })).fetchJoinPage())).toBe(
      'server',
    );
  });

  it('POSTs both userid spellings as JSON and accepts status success', async () => {
    const f = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      response(JSON.stringify({ request: 'join', status: 'success', redirect: '/vtt/game' })),
    );
    await client(f as typeof fetch).login('u1', 'pw');
    const init = f.mock.calls[0]?.[1];
    expect(f.mock.calls[0]?.[0]).toBe(`${BASE}/join`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(String(init?.body))).toEqual({
      action: 'join',
      userid: 'u1',
      userId: 'u1',
      password: 'pw',
    });
  });

  it('accepts a redirect body or a followed redirect to /game', async () => {
    await expect(
      client(async () => response(JSON.stringify({ redirect: '/vtt/game' }))).login('u', 'p'),
    ).resolves.toBeUndefined();
    await expect(
      client(async () =>
        response('<html>game</html>', { url: `${BASE}/game`, redirected: true }),
      ).login('u', 'p'),
    ).resolves.toBeUndefined();
  });

  it('maps a login wall (cross-origin redirect, e.g. private The Forge game) to access', async () => {
    const wall = async () =>
      response('<html>Private Game</html>', {
        url: 'https://eu.forge-vtt.com/game/aiacos-vecna',
        redirected: true,
      });
    expect(await kindOf(client(wall).fetchJoinPage())).toBe('access');
    expect(await kindOf(client(wall).login('u', 'p'))).toBe('access');
    expect(await kindOf(client(wall).probeStatus())).toBe('access');
  });

  it('never puts a page body in the error: an HTML answer to POST /join is access', async () => {
    const page = '<!doctype html><html><head><title>EvenFoundryVTT · G2 HUD</title></head></html>';
    const failure = async (res: Response): Promise<FoundryClientError> => {
      try {
        await client(async () => res).login('u', 'p');
      } catch (error) {
        if (error instanceof FoundryClientError) return error;
      }
      throw new Error('expected a FoundryClientError');
    };
    const err = await failure(response(page));
    expect(err.kind).toBe('access');
    expect(err.message).not.toContain('<');
    expect((await failure(response(page, { status: 502 }))).message).toBe(
      'POST /join → HTTP 502 (HTML page)',
    );
  });

  it('maps rejected credentials to auth and other failures to server', async () => {
    expect(
      await kindOf(
        client(async () => response('JOIN.ErrorInvalidPassword', { status: 401 })).login('u', 'p'),
      ),
    ).toBe('auth');
    expect(await kindOf(client(async () => response('', { status: 403 })).login('u', 'p'))).toBe(
      'auth',
    );
    expect(
      await kindOf(
        client(async () => response(JSON.stringify({ status: 'failed', message: 'bad' }))).login(
          'u',
          'p',
        ),
      ),
    ).toBe('auth');
    expect(
      await kindOf(client(async () => response('boom', { status: 500 })).login('u', 'p')),
    ).toBe('server');
    // An HTML page is not Foundry's JSON join answer: a login wall / proxy is in the way.
    expect(await kindOf(client(async () => response('<html>')).login('u', 'p'))).toBe('access');
    expect(await kindOf(client(async () => response('not json')).login('u', 'p'))).toBe('server');
  });
});

describe('openSocket', () => {
  it('connects to {prefix}/socket.io with websocket + credentials and resolves on session', async () => {
    const socket = new FakeSocket();
    const io = vi.fn(() => socket);
    const promise = client(vi.fn(), io).openSocket();
    expect(io).toHaveBeenCalledWith('https://foundry.example', {
      path: '/vtt/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      reconnection: false,
    });
    socket.deliver('session', { sessionId: 's', userId: 'u1' });
    await expect(promise).resolves.toBe(socket);
    expect(socket.listeners.get('session')?.size ?? 0).toBe(0);
  });

  it('rejects an anonymous session as auth', async () => {
    const socket = new FakeSocket();
    const promise = client(vi.fn(), () => socket).openSocket();
    socket.deliver('session', { sessionId: 's', userId: null });
    expect(await kindOf(promise)).toBe('auth');
    expect(socket.disconnected).toBe(true);
  });

  it('maps connect errors and timeouts to network', async () => {
    const s1 = new FakeSocket();
    const p1 = client(vi.fn(), () => s1).openSocket();
    s1.deliver('connect_error', new Error('refused'));
    expect(await kindOf(p1)).toBe('network');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s2 = new FakeSocket();
    const p2 = client(vi.fn(), () => s2, 500).openSocket();
    vi.advanceTimersByTime(500);
    expect(await kindOf(p2)).toBe('network');
  });

  it('uses the root socket path without a routePrefix', () => {
    const io = vi.fn((_uri: string, _options: SocketOptions) => new FakeSocket());
    void new FoundryClient('https://h.example', { fetch: vi.fn(), io })
      .openSocket()
      .catch(() => {});
    expect(io.mock.calls[0]?.[1]).toMatchObject({ path: '/socket.io' });
  });
});

describe('listG2Users', () => {
  const html = '<select name="userid"><option value="h1">Html (G2)</option></select>';

  it('prefers getJoinData over an anonymous socket', async () => {
    const socket = new FakeSocket();
    socket.emit = vi.fn((event: string, ack?: unknown) => {
      if (event === 'getJoinData' && typeof ack === 'function') {
        ack({
          users: [
            { _id: 'a1', name: 'Anna' },
            { _id: 'l1', name: 'Luca (G2)' },
            { _id: 7, name: 'bad' },
          ],
        });
      }
      return socket;
    }) as FakeSocket['emit'];
    const promise = client(
      async () => response(html),
      () => socket,
    ).listG2Users();
    await settle();
    socket.deliver('session', null);
    await expect(promise).resolves.toEqual([{ id: 'l1', name: 'Luca (G2)' }]);
    expect(socket.disconnected).toBe(true);
  });

  it('falls back to the /join HTML when getJoinData has no users', async () => {
    const socket = new FakeSocket();
    socket.emit = vi.fn((_event: string, ack?: unknown) => {
      if (typeof ack === 'function') ack({});
      return socket;
    }) as FakeSocket['emit'];
    const promise = client(
      async () => response(html),
      () => socket,
    ).listG2Users();
    await settle();
    socket.deliver('session', null);
    await expect(promise).resolves.toEqual([{ id: 'h1', name: 'Html (G2)' }]);
  });

  it('falls back to HTML when the socket cannot connect or getJoinData times out', async () => {
    const s1 = new FakeSocket();
    const p1 = client(
      async () => response(html),
      () => s1,
    ).listG2Users();
    await settle();
    s1.deliver('connect_error', new Error('x'));
    await expect(p1).resolves.toHaveLength(1);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s2 = new FakeSocket();
    const p2 = client(
      async () => response(html),
      () => s2,
      100,
    ).listG2Users();
    await settle();
    s2.deliver('session', null);
    await settle();
    vi.advanceTimersByTime(100);
    await expect(p2).resolves.toHaveLength(1);
  });
});
