import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRelayOpener, relayHost, type WebSocketLike } from './relay-client.js';

class FakeWs implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.closedWith = code;
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
}

function opener(timeoutMs = 10_000) {
  const sockets: FakeWs[] = [];
  const open = createRelayOpener((url) => {
    const ws = new FakeWs(url);
    sockets.push(ws);
    return ws;
  }, timeoutMs);
  return { open, sockets };
}

afterEach(() => vi.useRealTimers());

describe('relay client (glasses end)', () => {
  it('RCL-01 joins the room as glasses and routes control vs app frames', async () => {
    const { open, sockets } = opener();
    const pending = open('wss://relay.example/', 'roomAAAAAAAAAAAAAAAAAA');
    const ws = sockets[0] as FakeWs;
    expect(ws.url).toBe('wss://relay.example/r/roomAAAAAAAAAAAAAAAAAA?role=glasses');
    ws.onerror?.({});
    ws.open();
    const link = await pending;
    const frames: unknown[] = [];
    const peers: boolean[] = [];
    link.onFrame((f) => frames.push(f));
    link.onPeer((up) => peers.push(up));
    ws.onmessage?.({ data: '{"relay":"peer-up"}' });
    ws.onmessage?.({ data: '{"relay":"peer-down"}' });
    ws.onmessage?.({ data: '{"evf":1}' });
    ws.onmessage?.({ data: 'not json' });
    ws.onmessage?.({ data: new ArrayBuffer(1) });
    expect(peers).toEqual([true, false]);
    expect(frames).toEqual([{ evf: 1 }]);
    expect(link.send({ a: 1 })).toBe(true);
    expect(ws.sent).toEqual(['{"a":1}']);
  });

  it('RCL-02 reports a close after open, not after an explicit close', async () => {
    const { open, sockets } = opener();
    const pending = open('wss://relay.example', 'r'.repeat(22));
    (sockets[0] as FakeWs).open();
    const link = await pending;
    const closes: number[] = [];
    link.onClose((code) => closes.push(code));
    (sockets[0] as FakeWs).onclose?.({ code: 1006 });
    expect(closes).toEqual([1006]);
    link.close();
    expect((sockets[0] as FakeWs).closedWith).toBe(1000);
    expect(link.send({})).toBe(false);
  });

  it('RCL-03 rejects when the relay closes before opening, or times out', async () => {
    vi.useFakeTimers();
    const { open, sockets } = opener(500);
    const refused = open('wss://relay.example', 'r'.repeat(22));
    (sockets[0] as FakeWs).onclose?.({ code: 1008 });
    await expect(refused).rejects.toThrow('relay closed the connection (1008)');
    const slow = open('wss://relay.example', 'r'.repeat(22));
    vi.advanceTimersByTime(500);
    await expect(slow).rejects.toThrow('relay did not answer within 500 ms');
    expect((sockets[1] as FakeWs).closedWith).toBeUndefined();
  });

  it('RCL-04 relayHost shows the host of any relay spelling', () => {
    expect(relayHost('wss://evf-relay.evf-relay.workers.dev')).toBe(
      'evf-relay.evf-relay.workers.dev',
    );
    expect(relayHost('ws://10.0.0.2:8787')).toBe('10.0.0.2:8787');
    expect(relayHost('not a url')).toBe('not a url');
  });

  it('RCL-05 the default factory builds a browser WebSocket', async () => {
    const created: string[] = [];
    vi.stubGlobal(
      'WebSocket',
      class {
        readyState = 0;
        onopen: (() => void) | null = null;
        onclose: ((ev: { code: number }) => void) | null = null;
        onerror = null;
        onmessage = null;
        constructor(url: string) {
          created.push(url);
          queueMicrotask(() => this.onclose?.({ code: 1006 }));
        }
        send(): void {}
        close(): void {}
      },
    );
    await expect(createRelayOpener()('wss://relay.example', 'r'.repeat(22))).rejects.toThrow();
    expect(created).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
