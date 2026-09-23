import {
  CreateStartUpPageContainer,
  type EvenHubEvent,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toGestureEvent } from '../hud/input/events.js';
import { fakeBridge } from './__fixtures__/fake-bridge.js';
import { gestureEvent, isDoublePress, tapBridge } from './bridge-tap.js';

const timers = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
};

function page(names: string[]): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({
    containerTotalNum: names.length,
    textObject: names.map(
      (n, i) =>
        new TextContainerProperty({ containerID: i + 1, containerName: n, content: `${n}!` }),
    ),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('gestureEvent', () => {
  it('produces events the HUD decodes to the same gesture', () => {
    expect(toGestureEvent(gestureEvent('tap'))).toEqual({ t: 'tap' });
    expect(toGestureEvent(gestureEvent('double'))).toEqual({ t: 'double' });
    expect(toGestureEvent(gestureEvent('up'))).toEqual({ t: 'up' });
    expect(toGestureEvent(gestureEvent('down'))).toEqual({ t: 'down' });
    expect(toGestureEvent(gestureEvent({ menu: 4 }))).toEqual({ t: 'menu', id: 4 });
    expect(isDoublePress(gestureEvent('double'))).toBe(true);
    expect(isDoublePress(gestureEvent('tap'))).toBe(false);
  });
});

describe('tapBridge', () => {
  it('fans real and injected events out to live leases; intercept can swallow', () => {
    const fake = fakeBridge();
    const swallowed: EvenHubEvent[] = [];
    const tap = tapBridge(fake.bridge, {
      timers,
      intercept: (e) => {
        if (!isDoublePress(e)) return false;
        swallowed.push(e);
        return true;
      },
    });
    const a = tap.lease();
    const got: EvenHubEvent[] = [];
    const off = a.bridge.onEvenHubEvent((e) => got.push(e));
    fake.emit(gestureEvent('tap'));
    fake.emit(gestureEvent('double'));
    tap.inject('down');
    expect(got.map((e) => toGestureEvent(e))).toEqual([{ t: 'tap' }, { t: 'down' }]);
    expect(swallowed).toHaveLength(1);
    off();
    tap.inject('up');
    expect(got).toHaveLength(2);
    tap.dispose();
    expect(fake.listenerCount()).toBe(0);
  });

  it('creates the start-up page once, then turns later creates into rebuilds', async () => {
    const fake = fakeBridge();
    const tap = tapBridge(fake.bridge, { timers });
    const first = tap.lease();
    await expect(first.bridge.createStartUpPageContainer(page(['a-head']))).resolves.toBe(
      StartUpPageCreateResult.success,
    );
    await expect(first.placed).resolves.toBe(true);
    expect(tap.mirror()).toEqual({ 'a-head': 'a-head!' });
    first.retire();

    const second = tap.lease();
    await expect(second.bridge.createStartUpPageContainer(page(['full']))).resolves.toBe(
      StartUpPageCreateResult.success,
    );
    expect(fake.of('create')).toHaveLength(1);
    expect(fake.of('rebuild')[0]?.arg).toBeInstanceOf(RebuildPageContainer);
    expect(tap.mirror()).toEqual({ full: 'full!' });

    fake.results.rebuild = false;
    const third = tap.lease();
    await expect(third.bridge.createStartUpPageContainer(page(['x']))).resolves.toBe(
      StartUpPageCreateResult.invalid,
    );
    await expect(third.placed).resolves.toBe(false);
  });

  it('reports a rejected first create and retries creation on the next lease', async () => {
    const fake = fakeBridge();
    fake.results.create = StartUpPageCreateResult.oversize;
    const tap = tapBridge(fake.bridge, { timers });
    const a = tap.lease();
    await expect(a.bridge.createStartUpPageContainer(page(['a']))).resolves.toBe(
      StartUpPageCreateResult.oversize,
    );
    await expect(a.placed).resolves.toBe(false);
    fake.results.create = StartUpPageCreateResult.success;
    const b = tap.lease();
    await b.bridge.createStartUpPageContainer(page(['b']));
    expect(fake.of('create')).toHaveLength(2);
  });

  it('mirrors rebuilds and text upgrades; retired leases are inert', async () => {
    const fake = fakeBridge();
    const tap = tapBridge(fake.bridge, { timers });
    const a = tap.lease();
    await a.bridge.rebuildPageContainer(new RebuildPageContainer(page(['c-head', 'c-body'])));
    await a.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'c-head', content: 'AZIONI' }),
    );
    fake.results.text = false;
    await a.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 2, containerName: 'c-body', content: 'lost' }),
    );
    expect(tap.mirror()).toEqual({ 'c-head': 'AZIONI', 'c-body': 'c-body!' });
    await a.bridge.updateImageRawData({} as never);
    await a.bridge.shutDownPageContainer(1);
    expect(fake.of('image')).toHaveLength(1);
    expect(fake.of('shutdown')).toHaveLength(1);
    // Non-overridden members are forwarded, bound to the real bridge.
    await expect(a.bridge.getDeviceInfo()).resolves.toEqual({ model: 'fake' });

    a.retire();
    const before = fake.calls.length;
    await expect(a.bridge.createStartUpPageContainer(page(['z']))).resolves.toBe(
      StartUpPageCreateResult.success,
    );
    await expect(a.bridge.rebuildPageContainer(new RebuildPageContainer({}))).resolves.toBe(true);
    await expect(a.bridge.textContainerUpgrade(new TextContainerUpgrade({}))).resolves.toBe(false);
    await expect(a.bridge.updateImageRawData({} as never)).resolves.toBe('success');
    await expect(a.bridge.shutDownPageContainer(1)).resolves.toBe(true);
    expect(fake.calls.length).toBe(before);
    const off = a.bridge.onEvenHubEvent(() => {
      throw new Error('retired lease must not receive events');
    });
    tap.inject('tap');
    off();
  });

  it('whenIdle waits for quiet, and gives up after maxMs', async () => {
    const fake = fakeBridge();
    const tap = tapBridge(fake.bridge, { timers });
    let resolveText: (v: boolean) => void = () => {};
    fake.bridge.textContainerUpgrade = () =>
      new Promise<boolean>((r) => {
        resolveText = r;
      });
    const a = tap.lease();
    const upgrade = a.bridge.textContainerUpgrade(new TextContainerUpgrade({}));
    let idle = false;
    void tap.whenIdle(200).then(() => {
      idle = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(idle).toBe(false);
    resolveText(true);
    await upgrade;
    await vi.advanceTimersByTimeAsync(150);
    expect(idle).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(idle).toBe(true);

    let capped = false;
    void a.bridge.textContainerUpgrade(new TextContainerUpgrade({}));
    void tap.whenIdle(200, 500).then(() => {
      capped = true;
    });
    await vi.advanceTimersByTimeAsync(550);
    expect(capped).toBe(true);
  });

  it('propagates bridge failures after tracking them', async () => {
    const fake = fakeBridge();
    fake.results.text = new Error('ble down');
    const tap = tapBridge(fake.bridge, { timers });
    const a = tap.lease();
    await expect(a.bridge.textContainerUpgrade(new TextContainerUpgrade({}))).rejects.toThrow(
      'ble down',
    );
    let idle = false;
    void tap.whenIdle(100).then(() => {
      idle = true;
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(idle).toBe(true);
  });
});
