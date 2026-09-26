import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FRAME_BYTES } from './limits.js';
import { isSendableCloseCode, Room, type RoomState } from './room.js';
import type { Role } from './routing.js';

/** Minimal stand-in for a Workers `WebSocket` (server end). */
class FakeSocket {
  readonly sent: Array<string | ArrayBuffer> = [];
  closed: { code: number; reason: string } | null = null;
  failSend = false;
  failClose = false;
  private attachment: unknown = null;

  send(message: string | ArrayBuffer): void {
    if (this.failSend) throw new Error('send on dead socket');
    this.sent.push(message);
  }
  close(code: number, reason: string): void {
    if (this.failClose) throw new Error('already closed');
    this.closed = { code, reason };
  }
  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
  /** Relay control frames (`{"relay":…}`), parsed; app frames are skipped. */
  controls(): unknown[] {
    return this.sent
      .filter((m): m is string => typeof m === 'string' && m.startsWith('{"relay":'))
      .map((m) => JSON.parse(m));
  }
}

/** Hand-written fake of the Hibernation part of `DurableObjectState`. */
class FakeState {
  readonly sockets: Array<{ ws: FakeSocket; tags: string[] }> = [];
  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    this.sockets.push({ ws: ws as unknown as FakeSocket, tags: tags ?? [] });
  }
  getWebSockets(tag?: string): WebSocket[] {
    return this.sockets
      .filter((s) => tag === undefined || s.tags.includes(tag))
      .map((s) => s.ws as unknown as WebSocket);
  }
  getTags(ws: WebSocket): string[] {
    const found = this.sockets.find((s) => s.ws === (ws as unknown as FakeSocket));
    if (!found) throw new Error('unknown socket');
    return found.tags;
  }
}

const PEER_UP = { relay: 'peer-up' };
const PEER_DOWN = { relay: 'peer-down' };
const asWs = (s: FakeSocket): WebSocket => s as unknown as WebSocket;

function setup(): { room: Room; state: FakeState; join: (role: Role) => FakeSocket } {
  const state = new FakeState();
  const room = new Room(state as unknown as RoomState);
  const join = (role: Role): FakeSocket => {
    const ws = new FakeSocket();
    room.accept(asWs(ws), role);
    return ws;
  };
  return { room, state, join };
}

describe('Room — pairing', () => {
  it('sends nothing to a lone socket', () => {
    const { join } = setup();
    const p = join('projector');
    expect(p.sent).toEqual([]);
  });

  it('sends peer-up to both sides, the newcomer included', () => {
    const { join } = setup();
    const p = join('projector');
    const g = join('glasses');
    expect(p.controls()).toEqual([PEER_UP]);
    expect(g.controls()).toEqual([PEER_UP]);
  });

  it('keeps one socket per role: a newcomer replaces the old one with 4000', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g1 = join('glasses');
    const g2 = join('glasses');
    expect(g1.closed).toEqual({ code: 4000, reason: 'replaced' });
    expect(g2.closed).toBeNull();
    expect(g2.controls()).toEqual([PEER_UP]);
    expect(p.controls()).toEqual([PEER_UP, PEER_UP]);
    // The replaced socket's close — with 4000 or any other code — never announces peer-down.
    room.webSocketClose(asWs(g1), 4000);
    room.webSocketClose(asWs(g1), 1006);
    room.webSocketError(asWs(g1), new Error('reset'));
    expect(p.controls()).toEqual([PEER_UP, PEER_UP]);
  });

  it('survives failing to close the replaced socket', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { join } = setup();
    const g1 = join('glasses');
    g1.failClose = true;
    const g2 = join('glasses');
    expect(g2.closed).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[EVF relay] close replaced socket failed:',
      'Error: already closed',
    );
    warn.mockRestore();
  });
});

describe('Room — close', () => {
  it('announces peer-down once on a real close', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    room.webSocketClose(asWs(g), 1000);
    room.webSocketClose(asWs(g), 1000);
    expect(p.controls()).toEqual([PEER_UP, PEER_DOWN]);
  });

  it('completes the close handshake, echoing sendable codes only', () => {
    const { join, room } = setup();
    const a = join('glasses');
    room.webSocketClose(asWs(a), 4321);
    expect(a.closed?.code).toBe(4321);
    const b = join('glasses');
    room.webSocketClose(asWs(b), 1006);
    expect(a.closed).not.toBeNull();
    expect(b.closed?.code).toBeUndefined();
  });

  it('logs when completing the close handshake fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    g.failClose = true;
    room.webSocketClose(asWs(g), 1000);
    expect(warn).toHaveBeenCalledWith(
      '[EVF relay] complete close failed:',
      'Error: already closed',
    );
    expect(p.controls()).toEqual([PEER_UP, PEER_DOWN]);
    warn.mockRestore();
  });

  it('classifies close codes that may be sent', () => {
    for (const code of [1000, 1001, 1003, 1007, 1014, 3000, 4000, 4999]) {
      expect(isSendableCloseCode(code)).toBe(true);
    }
    for (const code of [999, 1004, 1005, 1006, 1015, 2999, 5000]) {
      expect(isSendableCloseCode(code)).toBe(false);
    }
  });

  it('ignores a close code 4000 on a live socket', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    room.webSocketClose(asWs(g), 4000);
    expect(p.controls()).toEqual([PEER_UP]);
  });

  it('treats an error like a real close', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    room.webSocketError(asWs(p), new Error('boom'));
    expect(g.controls()).toEqual([PEER_UP, PEER_DOWN]);
    expect(warn).toHaveBeenCalledWith('[EVF relay] socket error:', 'Error: boom');
    warn.mockRestore();
  });

  it('closing without a peer sends nothing', () => {
    const { join, room } = setup();
    const g = join('glasses');
    room.webSocketClose(asWs(g), 1001);
    expect(g.sent).toEqual([]);
  });

  it('a closed socket no longer counts as a peer', () => {
    const { join, room } = setup();
    const p = join('projector');
    room.webSocketClose(asWs(p), 1000);
    const g = join('glasses');
    expect(g.sent).toEqual([]);
  });
});

describe('Room — forwarding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards text and binary verbatim to the peer only', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    const bin = new Uint8Array([1, 2, 3]).buffer;
    room.webSocketMessage(asWs(p), 'hello');
    room.webSocketMessage(asWs(g), bin);
    expect(g.sent.at(-1)).toBe('hello');
    expect(p.sent.at(-1)).toBe(bin);
    expect(p.sent).not.toContain('hello');
    expect(g.sent).not.toContain(bin);
  });

  it('drops frames silently when there is no peer', () => {
    const { join, room } = setup();
    const p = join('projector');
    room.webSocketMessage(asWs(p), 'into the void');
    expect(p.sent).toEqual([]);
    expect(p.closed).toBeNull();
  });

  it('ignores frames from replaced or closed sockets', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g1 = join('glasses');
    join('glasses');
    room.webSocketMessage(asWs(g1), 'stale');
    expect(p.sent).not.toContain('stale');
  });

  it('logs and carries on when forwarding to a dead peer fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    g.failSend = true;
    room.webSocketMessage(asWs(p), 'x');
    expect(p.closed).toBeNull();
    expect(warn).toHaveBeenCalledWith('[EVF relay] forward frame failed:', expect.any(String));
    warn.mockRestore();
  });

  it('closes the sender with 1009 on a frame over 1 MiB (UTF-8 bytes) and tells the peer', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    room.webSocketMessage(asWs(p), 'a'.repeat(MAX_FRAME_BYTES)); // exactly 1 MiB: allowed
    expect(p.closed).toBeNull();
    const big = '€'.repeat(Math.ceil(MAX_FRAME_BYTES / 3) + 1); // < 1 Mi chars, > 1 MiB bytes
    room.webSocketMessage(asWs(p), big);
    expect(p.closed).toEqual({ code: 1009, reason: 'frame too large' });
    expect(g.sent).not.toContain(big);
    expect(g.controls().at(-1)).toEqual(PEER_DOWN);
    // The eventual runtime close callback does not announce twice.
    room.webSocketClose(asWs(p), 1009);
    expect(
      g.controls().filter((c) => JSON.stringify(c) === JSON.stringify(PEER_DOWN)),
    ).toHaveLength(1);
  });

  it('closes oversize binary frames with 1009', () => {
    const { join, room } = setup();
    const g = join('glasses');
    room.webSocketMessage(asWs(g), new ArrayBuffer(MAX_FRAME_BYTES + 1));
    expect(g.closed?.code).toBe(1009);
  });

  it('closes the sender with 1008 on the 61st frame within 1 s', () => {
    const { join, room } = setup();
    const p = join('projector');
    const g = join('glasses');
    for (let i = 0; i < 60; i++) {
      vi.setSystemTime(i * 10);
      room.webSocketMessage(asWs(g), `f${i}`);
    }
    expect(g.closed).toBeNull();
    vi.setSystemTime(999);
    room.webSocketMessage(asWs(g), 'f60');
    expect(g.closed).toEqual({ code: 1008, reason: 'rate limit' });
    expect(p.sent).not.toContain('f60');
    expect(p.controls().at(-1)).toEqual(PEER_DOWN);
  });

  it('keeps a steady 60 frames/s sender open', () => {
    const { join, room } = setup();
    const g = join('glasses');
    for (let i = 0; i < 300; i++) {
      vi.setSystemTime(i * 17);
      room.webSocketMessage(asWs(g), 'tick');
    }
    expect(g.closed).toBeNull();
  });

  it('logs when closing an ejected socket fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { join, room } = setup();
    const g = join('glasses');
    g.failClose = true;
    room.webSocketMessage(asWs(g), new ArrayBuffer(MAX_FRAME_BYTES + 1));
    expect(warn).toHaveBeenCalledWith('[EVF relay] close (1009) failed:', 'Error: already closed');
    warn.mockRestore();
  });

  it('throws on a socket without a role tag', () => {
    const state = new FakeState();
    const room = new Room(state as unknown as RoomState);
    const ws = new FakeSocket();
    state.acceptWebSocket(asWs(ws), ['other']);
    expect(() => room.webSocketMessage(asWs(ws), 'x')).toThrow('socket has no role tag');
  });
});

describe('Room.fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('404s a request without a valid role', async () => {
    const room = new Room(new FakeState() as unknown as RoomState);
    const res = await room.fetch(new Request('https://relay.test/r/x?role=gm'));
    expect(res.status).toBe(404);
  });

  it('accepts the server end and returns 101 with the client end', async () => {
    const client = new FakeSocket();
    const server = new FakeSocket();
    vi.stubGlobal(
      'WebSocketPair',
      class {
        0 = client;
        1 = server;
      },
    );
    // Node's Response rejects status 101; stand in for the Workers Response.
    vi.stubGlobal(
      'Response',
      class {
        constructor(
          readonly body: unknown,
          readonly init: { status: number; webSocket?: unknown },
        ) {}
        get status(): number {
          return this.init.status;
        }
      },
    );
    const state = new FakeState();
    const room = new Room(state as unknown as RoomState);
    const res = (await room.fetch(
      new Request('https://relay.test/r/abcdefghijklmnopqrstuv?role=glasses'),
    )) as unknown as { status: number; init: { webSocket: unknown } };
    expect(res.status).toBe(101);
    expect(res.init.webSocket).toBe(client);
    expect(state.sockets).toEqual([{ ws: server, tags: ['glasses'] }]);
  });
});
