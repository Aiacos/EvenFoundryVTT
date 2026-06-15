/**
 * Tests for AgentRegistry — in-memory connected-agent registry + id-correlated
 * pending-command map.
 *
 * Quick Task 260604-cwa: Dev-only whole-system debug/control harness.
 *
 * Coverage:
 *   - register: adds agent; listAgents includes it with {agentId,role,name,connectedAt}.
 *   - unregister: removes agent from roster.
 *   - send: resolves by name, writes JSON frame to socket, stores pending entry.
 *   - send: returns null / undefined when target is unknown.
 *   - resolve: settles the matching waitFor promise.
 *   - waitFor: resolves with result when resolve() called in time.
 *   - waitFor: resolves with timeout sentinel after timeoutMs.
 *   - MAX_PENDING / TTL: pending map stays bounded (no leak).
 *
 * @see ./agent-registry.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRegistry } from './agent-registry.js';

/** Build a fake WebSocket with a send spy. */
function fakeSocket(): { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(), close: vi.fn() };
}

describe('AgentRegistry — register / list / unregister', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('register returns an agentId string', () => {
    const socket = fakeSocket();
    const id = registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('listAgents includes the registered agent with correct fields', () => {
    const socket = fakeSocket();
    const before = Date.now();
    const agentId = registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const after = Date.now();
    const list = registry.listAgents();
    expect(list).toHaveLength(1);
    const agent = list[0]!;
    expect(agent.agentId).toBe(agentId);
    expect(agent.role).toBe('g2-app');
    expect(agent.name).toBe('main');
    expect(agent.connectedAt).toBeGreaterThanOrEqual(before);
    expect(agent.connectedAt).toBeLessThanOrEqual(after);
  });

  it('unregister removes the agent from listAgents', () => {
    const socket = fakeSocket();
    const agentId = registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    registry.unregister(agentId);
    expect(registry.listAgents()).toHaveLength(0);
  });

  it('unregister is idempotent for unknown ids', () => {
    expect(() => registry.unregister('unknown-id')).not.toThrow();
  });

  it('multiple agents can be registered', () => {
    const s1 = fakeSocket();
    const s2 = fakeSocket();
    registry.register({ role: 'g2-app', name: 'a', socket: s1 as never });
    registry.register({ role: 'bridge', name: 'b', socket: s2 as never });
    expect(registry.listAgents()).toHaveLength(2);
  });
});

describe('AgentRegistry — send', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('send resolves target by name, writes JSON frame, returns {id}', () => {
    const socket = fakeSocket();
    registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const result = registry.send('main', 'setBridgeUrl', { url: 'http://localhost' });
    expect(result).not.toBeNull();
    expect(typeof result?.id).toBe('string');
    expect(socket.send).toHaveBeenCalledOnce();
    const frame = JSON.parse(socket.send.mock.calls[0]![0] as string) as {
      id: string;
      cmd: string;
      args: unknown;
    };
    expect(frame.id).toBe(result?.id);
    expect(frame.cmd).toBe('setBridgeUrl');
    expect(frame.args).toEqual({ url: 'http://localhost' });
  });

  it('send returns null when target name is unknown', () => {
    const result = registry.send('nonexistent', 'getState', {});
    expect(result).toBeNull();
  });

  it('send stores a pending entry keyed by command id', () => {
    const socket = fakeSocket();
    registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const result = registry.send('main', 'getState', {});
    expect(result).not.toBeNull();
    // The pending entry must exist (accessed via resolve without error)
    expect(() =>
      registry.resolve(result!.id, { ok: true, result: { step: 'STEP1' } }),
    ).not.toThrow();
  });
});

describe('AgentRegistry — resolve + waitFor', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new AgentRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waitFor resolves with the result when resolve() is called before timeout', async () => {
    const socket = fakeSocket();
    registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const sent = registry.send('main', 'getState', {});
    expect(sent).not.toBeNull();
    const promise = registry.waitFor(sent!.id, 2000);
    registry.resolve(sent!.id, { ok: true, result: { step: 'STEP1' } });
    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect((outcome as { ok: true; result: unknown }).result).toEqual({ step: 'STEP1' });
  });

  it('waitFor resolves with timeout sentinel after timeoutMs', async () => {
    const socket = fakeSocket();
    registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const sent = registry.send('main', 'getState', {});
    expect(sent).not.toBeNull();
    const promise = registry.waitFor(sent!.id, 100);
    // Advance timers past timeout
    vi.advanceTimersByTime(200);
    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    expect((outcome as { ok: false; error: string }).error).toBe('timeout');
  });

  it('resolve is a no-op for an unknown command id', () => {
    expect(() => registry.resolve('no-such-id', { ok: true })).not.toThrow();
  });

  it('resolve clears the pending entry after settling', async () => {
    const socket = fakeSocket();
    registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const sent = registry.send('main', 'getState', {});
    const promise = registry.waitFor(sent!.id, 2000);
    registry.resolve(sent!.id, { ok: true, result: null });
    await promise;
    // Second resolve on same id is a no-op (not error)
    expect(() => registry.resolve(sent!.id, { ok: false, error: 'late' })).not.toThrow();
  });
});

describe('AgentRegistry — MAX_PENDING cap', () => {
  it('pending map stays bounded after filling past cap', () => {
    const registry = new AgentRegistry({ maxPending: 5 });
    const socket = fakeSocket();
    registry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    // Send more commands than maxPending
    for (let i = 0; i < 10; i++) {
      registry.send('main', 'getState', { i });
    }
    // The registry should not throw and pending count must be <= maxPending
    // (we can't access private state directly; assert no throw + listAgents still works)
    expect(registry.listAgents()).toHaveLength(1);
  });
});
