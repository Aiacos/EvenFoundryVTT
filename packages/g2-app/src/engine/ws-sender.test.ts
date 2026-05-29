/**
 * WsSender unit tests (quick-task 260529-khy Wave 1 Task 1 — TDD RED phase).
 *
 * The WsSender holder is the stable outbound-socket indirection used by panels +
 * the perf probe so a WS reconnect can swap the underlying target via `.swap(newWs)`
 * with zero re-wiring (BLOCKER 2 — outbound dispatch after reconnect).
 *
 * Covers:
 *   - send delegates to the current target socket
 *   - swap redirects subsequent sends to the new socket
 *   - holder identity is stable across swaps (same object reference)
 *   - structural assignability to a `{ send(data: string): void }` consumer
 *
 * @see packages/g2-app/src/engine/ws-sender.ts
 */
import { describe, expect, it } from 'vitest';
import { WsSender } from './ws-sender.js';

/** Minimal capture-only sink mirroring the panel `{ send(data:string):void }` shape. */
class CaptureSink {
  public readonly sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
}

describe('WsSender', () => {
  it('send delegates to the current target socket', () => {
    const sink = new CaptureSink();
    const sender = new WsSender(sink);
    sender.send('hello');
    expect(sink.sent).toEqual(['hello']);
  });

  it('swap redirects subsequent sends to the new socket', () => {
    const original = new CaptureSink();
    const replacement = new CaptureSink();
    const sender = new WsSender(original);

    sender.send('before');
    sender.swap(replacement);
    sender.send('after');

    expect(original.sent).toEqual(['before']);
    expect(replacement.sent).toEqual(['after']);
  });

  it('holder identity is stable across swaps', () => {
    const sender = new WsSender(new CaptureSink());
    const ref = sender;
    sender.swap(new CaptureSink());
    expect(sender).toBe(ref);
  });

  it('is structurally assignable to a { send(data: string): void } consumer', () => {
    const sink = new CaptureSink();
    const sender = new WsSender(sink);
    // Type-level assertion: the holder satisfies the narrow panel ws-param shape.
    const consumer: { send(data: string): void } = sender;
    consumer.send('typed');
    expect(sink.sent).toEqual(['typed']);
  });
});
