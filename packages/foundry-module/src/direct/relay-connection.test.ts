import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type LockManagerLike,
  MAX_OUTGOING_FRAMES_PER_SECOND,
  RelayConnection,
  type RelayDeps,
  type RelayHandlers,
  relayBackoff,
  type SocketLike,
  withProjectorLock,
} from './relay-connection.js';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed: { code?: number | undefined; reason?: string | undefined } | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(data: unknown): void {
    this.onmessage?.({ data });
  }
  drop(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const clock = { now: 0 };
  const deps: RelayDeps = {
    now: () => clock.now,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: vi.fn(),
  };
  const handlers: RelayHandlers & { frames: unknown[]; peers: boolean[]; links: boolean[] } = {
    frames: [],
    peers: [],
    links: [],
    onFrame(f) {
      this.frames.push(f);
    },
    onPeer(up) {
      this.peers.push(up);
    },
    onLink(up) {
      this.links.push(up);
    },
  };
  const conn = new RelayConnection('wss://relay.example', 'roomAAAAAAAAAAAAAAAAAA', handlers, deps);
  return { conn, sockets, timers, handlers, deps, clock };
}

afterEach(() => vi.restoreAllMocks());

describe('RelayConnection', () => {
  it('RC-01 joins the room as projector, forwards app frames and peer events', async () => {
    const { conn, sockets, handlers } = harness();
    conn.start();
    conn.start();
    expect(sockets).toHaveLength(1);
    const s = sockets[0] as FakeSocket;
    expect(s.url).toBe('wss://relay.example/r/roomAAAAAAAAAAAAAAAAAA?role=projector');
    await expect(conn.send({ a: 1 })).rejects.toThrow(/relay not connected/);
    s.open();
    expect(conn.connected).toBe(true);
    await conn.send({ a: 1 });
    expect(s.sent).toEqual(['{"a":1}']);
    s.message('{"relay":"peer-up"}');
    s.message('{"evf":1}');
    s.message(new ArrayBuffer(2));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    s.message('not json');
    expect(handlers.peers).toEqual([true]);
    expect(handlers.frames).toEqual([{ evf: 1 }]);
    expect(handlers.links).toEqual([true]);
    s.onerror?.({});
  });

  it('RC-02 reconnects with exponential backoff after a drop', () => {
    const { conn, sockets, timers, handlers } = harness();
    conn.start();
    (sockets[0] as FakeSocket).drop(1006);
    expect(handlers.peers).toEqual([false]);
    expect(timers[0]?.ms).toBe(1_000);
    timers[0]?.fn();
    (sockets[1] as FakeSocket).drop(1006);
    expect(timers[1]?.ms).toBe(2_000);
    timers[1]?.fn();
    (sockets[2] as FakeSocket).open();
    (sockets[2] as FakeSocket).drop(1006);
    expect(timers[2]?.ms).toBe(1_000);
    expect(relayBackoff(10)).toBe(30_000);
  });

  it('RC-03 stands by (no reconnect) when replaced by another projector (4000)', () => {
    const { conn, sockets, timers } = harness();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    conn.start();
    (sockets[0] as FakeSocket).drop(4000);
    expect(timers).toHaveLength(0);
  });

  it('RC-04 switchRoom reconnects to the new room; stop closes for good', () => {
    const { conn, sockets, timers } = harness();
    conn.switchRoom('ignoredWhileStoppedXXXXX');
    conn.start();
    (sockets[0] as FakeSocket).open();
    conn.switchRoom('ignoredWhileStoppedXXXXX');
    conn.switchRoom('newRoomBBBBBBBBBBBBBBBB');
    expect((sockets[0] as FakeSocket).closed).toEqual({ code: 1000, reason: 'room rotated' });
    expect(sockets[1]?.url).toContain('/r/newRoomBBBBBBBBBBBBBBBB?role=projector');
    conn.stop();
    expect((sockets[1] as FakeSocket).closed?.code).toBe(1000);
    // A late close of the dropped socket must not schedule anything.
    (sockets[1] as FakeSocket).drop(1006);
    expect(timers).toHaveLength(0);
  });

  it('RC-06 paces outgoing frames under the relay rate limit, in order, without dropping', async () => {
    const { conn, sockets, timers, clock } = harness();
    conn.start();
    const s = sockets[0] as FakeSocket;
    s.open();
    const stamps: number[] = [];
    const write = s.send.bind(s);
    s.send = (data) => {
      stamps.push(clock.now);
      write(data);
    };
    const total = MAX_OUTGOING_FRAMES_PER_SECOND * 2 + 5;
    const done: number[] = [];
    const sends = Array.from({ length: total }, (_, i) =>
      conn.send({ i }).then(() => done.push(i)),
    );
    await Promise.resolve();
    // The first second carries at most the budget; the rest waits for the window.
    expect(s.sent).toHaveLength(MAX_OUTGOING_FRAMES_PER_SECOND);
    expect(MAX_OUTGOING_FRAMES_PER_SECOND).toBeLessThan(60);
    while (s.sent.length < total) {
      const timer = timers.pop();
      expect(timer).toBeDefined();
      clock.now += timer?.ms ?? 0;
      timer?.fn();
    }
    await Promise.all(sends);
    expect(s.sent.map((d) => (JSON.parse(d) as { i: number }).i)).toEqual(
      Array.from({ length: total }, (_, i) => i),
    );
    expect(done).toEqual(Array.from({ length: total }, (_, i) => i));
    // Never more than the budget in any rolling second.
    for (const [i, at] of stamps.entries()) {
      const inWindow = stamps.filter((t) => t > at - 1_000 && t <= at).length;
      expect(inWindow, `frame ${i}`).toBeLessThanOrEqual(MAX_OUTGOING_FRAMES_PER_SECOND);
    }
    expect(clock.now).toBeGreaterThanOrEqual(2_000);
  });

  it('RC-07 frames still queued when the socket goes away are rejected, not sent elsewhere', async () => {
    const { conn, sockets } = harness();
    conn.start();
    const s = sockets[0] as FakeSocket;
    s.open();
    const sends = Array.from({ length: MAX_OUTGOING_FRAMES_PER_SECOND + 3 }, (_, i) =>
      conn.send({ i }),
    );
    const results = Promise.allSettled(sends);
    await Promise.resolve();
    conn.switchRoom('newRoomBBBBBBBBBBBBBBBB');
    const settled = await results;
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(
      MAX_OUTGOING_FRAMES_PER_SECOND,
    );
    expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(3);
    (sockets[1] as FakeSocket).open();
    expect((sockets[1] as FakeSocket).sent).toEqual([]);
  });

  it('RC-05 a timer firing after stop does not reopen', () => {
    const { conn, sockets, timers } = harness();
    conn.start();
    (sockets[0] as FakeSocket).drop(1006);
    conn.stop();
    timers[0]?.fn();
    expect(sockets).toHaveLength(1);
  });
});

describe('withProjectorLock', () => {
  it('RL-01 without Web Locks (null or absent), holds at once', () => {
    const hold = vi.fn();
    withProjectorLock('d', hold, null);
    withProjectorLock('d', hold);
    expect(hold).toHaveBeenCalledTimes(2);
  });

  it('RL-02 queues behind the holder and never starts once released while queued', async () => {
    let grant: (() => Promise<void>) | null = null;
    const locks: LockManagerLike = {
      request: vi.fn((_name, cb) => {
        grant = () => cb({});
        return Promise.resolve();
      }),
    };
    const hold = vi.fn();
    const release = withProjectorLock('dev1', hold, locks);
    expect(locks.request).toHaveBeenCalledWith('evf-projector-dev1', expect.any(Function));
    release();
    await (grant as unknown as () => Promise<void>)();
    expect(hold).not.toHaveBeenCalled();
  });

  it('RL-03 holds when granted and keeps the lock until released', async () => {
    let held: Promise<void> | null = null;
    const locks: LockManagerLike = {
      request: (_name, cb) => {
        held = cb({});
        return Promise.resolve();
      },
    };
    const hold = vi.fn();
    const release = withProjectorLock('dev1', hold, locks);
    expect(hold).toHaveBeenCalledOnce();
    let done = false;
    void (held as unknown as Promise<void>).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    await held;
    expect(done).toBe(true);
  });

  it('RL-04 logs a failed lock request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    withProjectorLock('d', vi.fn(), { request: () => Promise.reject(new Error('nope')) });
    await new Promise((r) => setTimeout(r, 0));
    expect(error).toHaveBeenCalled();
  });
});
