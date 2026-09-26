/**
 * Integration test against a running relay (`pnpm --filter @evf/relay dev`).
 *
 * Skipped unless `EVF_RELAY_IT=1`; target defaults to `http://127.0.0.1:8787`
 * (override with `EVF_RELAY_URL`). Uses Node's built-in `WebSocket` (Node ≥ 22).
 */
import { describe, expect, it } from 'vitest';

const BASE = process.env.EVF_RELAY_URL ?? 'http://127.0.0.1:8787';
const enabled = process.env.EVF_RELAY_IT === '1';

interface Client {
  readonly ws: WebSocket;
  readonly frames: string[];
  next(): Promise<string>;
  closed: Promise<number>;
}

function connect(room: string, role: 'projector' | 'glasses'): Promise<Client> {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/r/${room}?role=${role}`);
  const frames: string[] = [];
  const waiters: Array<(f: string) => void> = [];
  ws.addEventListener('message', (e) => {
    const data = String(e.data);
    const waiter = waiters.shift();
    if (waiter) waiter(data);
    else frames.push(data);
  });
  const closed = new Promise<number>((resolve) =>
    ws.addEventListener('close', (e) => resolve(e.code)),
  );
  const next = (): Promise<string> => {
    const queued = frames.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => waiters.push(resolve));
  };
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({ ws, frames, next, closed }));
    ws.addEventListener('error', () => reject(new Error(`connect ${role} failed`)));
  });
}

const room = (): string => `it-${crypto.randomUUID().replaceAll('-', '')}`;

describe.skipIf(!enabled)('relay over wrangler dev', () => {
  it('serves /health with CORS', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('pairs, forwards, replaces and announces peer-down', async () => {
    const r = room();
    const p = await connect(r, 'projector');
    const g = await connect(r, 'glasses');
    expect(await g.next()).toBe('{"relay":"peer-up"}');
    expect(await p.next()).toBe('{"relay":"peer-up"}');

    p.ws.send('sealed-envelope');
    expect(await g.next()).toBe('sealed-envelope');

    const g2 = await connect(r, 'glasses');
    // Replaced with 4000. Under local workerd the replaced client can linger in CLOSING (the
    // close frame arrives, the TCP close does not), so assert the state, not the close event.
    await expect.poll(() => g.ws.readyState).toBeGreaterThanOrEqual(WebSocket.CLOSING);
    expect(await g2.next()).toBe('{"relay":"peer-up"}');
    expect(await p.next()).toBe('{"relay":"peer-up"}');

    g2.ws.close(1000);
    expect(await p.next()).toBe('{"relay":"peer-down"}');
    expect(await g2.closed).toBe(1000);
    p.ws.close(1000);
  });

  it('closes an oversize sender with 1009', async () => {
    const g = await connect(room(), 'glasses');
    g.ws.send('x'.repeat(1_048_577));
    expect(await g.closed).toBe(1009);
  });
});
