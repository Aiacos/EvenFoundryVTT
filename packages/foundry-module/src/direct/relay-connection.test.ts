import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type LockManagerLike,
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
  const deps: RelayDeps = {
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
  return { conn, sockets, timers, handlers, deps };
}

afterEach(() => vi.restoreAllMocks());

describe('RelayConnection', () => {
  it('RC-01 joins the room as projector, forwards app frames and peer events', () => {
    const { conn, sockets, handlers } = harness();
    conn.start();
    conn.start();
    expect(sockets).toHaveLength(1);
    const s = sockets[0] as FakeSocket;
    expect(s.url).toBe('wss://relay.example/r/roomAAAAAAAAAAAAAAAAAA?role=projector');
    expect(conn.send({ a: 1 })).toBe(false);
    s.open();
    expect(conn.connected).toBe(true);
    expect(conn.send({ a: 1 })).toBe(true);
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
