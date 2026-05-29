/**
 * Unit tests for bus-log-stream — pino → DebugEventBus 'log' tap.
 *
 * Quick Task 260529-icd Task 1.
 *
 * Strategy: drive a REAL `pino` instance whose multistream includes a real
 * `createBusLogStream(bus)` sink, then assert the produced DebugEvent shape,
 * redaction (double safety: pino redact + bus structural redact), malformed-line
 * safety, and per-stream min-level filtering. Also unit-test `levelLabel` directly.
 *
 * @see ./bus-log-stream.ts
 */
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createBusLogStream, levelLabel } from './bus-log-stream.js';
import { DebugEventBus } from './debug-event-bus.js';

/** Shared redact list mirroring server.ts LOGGER_REDACT (subset sufficient for tests). */
const REDACT = ['token', 'bearer', '*.token', '*.bearer'];

describe('levelLabel', () => {
  it('maps known pino numeric levels to labels', () => {
    expect(levelLabel(10)).toBe('trace');
    expect(levelLabel(20)).toBe('debug');
    expect(levelLabel(30)).toBe('info');
    expect(levelLabel(40)).toBe('warn');
    expect(levelLabel(50)).toBe('error');
    expect(levelLabel(60)).toBe('fatal');
  });

  it('falls back to lvl<N> for an unknown numeric level', () => {
    expect(levelLabel(35)).toBe('lvl35');
    expect(levelLabel(99)).toBe('lvl99');
  });
});

describe('createBusLogStream', () => {
  it('turns a pino warn line into a log.warn DebugEvent with summary + payload', () => {
    const bus = new DebugEventBus();
    const logger = pino(
      { level: 'info', redact: REDACT },
      createBusLogStream(bus) as unknown as pino.DestinationStream,
    );
    logger.warn({ foo: 1 }, 'hello');

    const events = bus.query({ direction: 'log' });
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e?.direction).toBe('log');
    expect(e?.type).toBe('log.warn');
    expect(e?.summary).toBe('hello');
    expect((e?.payload as { foo: number }).foo).toBe(1);
    expect(e?.seq).toBeNull();
  });

  it('carries sessionId from the log line, defaulting to null', () => {
    const bus = new DebugEventBus();
    const logger = pino(
      { level: 'info', redact: REDACT },
      createBusLogStream(bus) as unknown as pino.DestinationStream,
    );
    logger.info({ sessionId: 'sess-42' }, 'with-session');
    logger.info('no-session');

    const events = bus.query({ direction: 'log' });
    expect(events[0]?.sessionId).toBe('sess-42');
    expect(events[1]?.sessionId).toBeNull();
  });

  it('never leaks a logged secret into the bus event (pino redact + bus scrub)', () => {
    const bus = new DebugEventBus();
    const logger = pino(
      { level: 'info', redact: REDACT },
      createBusLogStream(bus) as unknown as pino.DestinationStream,
    );
    const SECRET_TOKEN = 'evf_live_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c';
    const SECRET_BEARER = 'bearer-very-long-secret-value-1234567890';
    logger.info({ token: SECRET_TOKEN, bearer: SECRET_BEARER }, 'auth');

    const events = bus.query({ direction: 'log' });
    expect(events.length).toBe(1);
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain(SECRET_TOKEN);
    expect(serialized).not.toContain(SECRET_BEARER);
  });

  it('swallows a malformed (non-JSON) line: no throw, no event', () => {
    const bus = new DebugEventBus();
    const sink = createBusLogStream(bus);
    expect(() => sink.write('this is not json')).not.toThrow();
    expect(() => sink.write('{ broken')).not.toThrow();
    expect(bus.query({ direction: 'log' }).length).toBe(0);
  });

  it('honours the multistream per-stream min level (EVF_DEBUG_LOG_LEVEL semantics)', () => {
    const bus = new DebugEventBus();
    // Parent logger emits at debug; the bus stream only forwards >= warn.
    const logger = pino(
      { level: 'debug', redact: REDACT },
      pino.multistream([
        { level: 'warn', stream: createBusLogStream(bus) as unknown as pino.DestinationStream },
      ]),
    );
    logger.debug('below-threshold');
    logger.info('still-below');
    logger.warn('forwarded');

    const events = bus.query({ direction: 'log' });
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('log.warn');
    expect(events[0]?.summary).toBe('forwarded');
  });
});
