/**
 * Feeds the debug channel from sources the app does not own: `console.warn/error` (the
 * HUD reports bridge failures with `console.warn('[hud] …')`), uncaught errors and
 * unhandled rejections, plus simulator marker lines.
 *
 * Installed by `main.ts` only in debug/demo mode; every installer returns its uninstall.
 */
import type { DebugLevel, DebugLog } from './debug-log.js';

type ConsoleLike = Pick<Console, 'warn' | 'error' | 'info'>;

/** Leading `[tag]` of a console message, used as the entry source. */
const TAG = /^\[([\w:-]+)\]\s*/;

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular / exotic values: the string form is the documented fallback.
    return String(value);
  }
}

/**
 * Formats console arguments into `{source, message}`: a leading `[tag]` becomes the
 * source (default `console`), the rest is joined with spaces.
 */
export function formatConsoleArgs(args: readonly unknown[]): { source: string; message: string } {
  const text = args.map(describe).join(' ');
  const tag = TAG.exec(text);
  return tag?.[1] === undefined
    ? { source: 'console', message: text }
    : { source: tag[1], message: text.slice(tag[0].length) };
}

/**
 * Wraps `console.warn` / `console.error` so each call is also pushed to `log` (the
 * original is still called first — the simulator's `/api/console` keeps seeing it).
 *
 * @returns Restores the original methods.
 */
export function captureConsole(log: DebugLog, target: ConsoleLike = console): () => void {
  const original = { warn: target.warn, error: target.error };
  const wrap =
    (level: DebugLevel, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      fn.apply(target, args);
      const { source, message } = formatConsoleArgs(args);
      log.push(level, source, message);
    };
  target.warn = wrap('warn', original.warn);
  target.error = wrap('error', original.error);
  return () => {
    target.warn = original.warn;
    target.error = original.error;
  };
}

type ErrorEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Records uncaught errors (`uncaught`) and unhandled rejections (`unhandledrejection`).
 * Does not prevent default handling, so the simulator still reports them.
 *
 * @returns Removes the listeners.
 */
export function captureGlobalErrors(log: DebugLog, target: ErrorEventTarget): () => void {
  const onError = (event: ErrorEvent): void => {
    // `error` is null for cross-origin scripts and synthetic events: fall back to `message`.
    const error: unknown = event.error;
    log.push('error', 'uncaught', error == null ? event.message : describe(error));
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    log.push('error', 'unhandledrejection', describe(event.reason));
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Marker lines polled by `scripts/sim-check.ts` through the simulator `/api/console`. */
export type Marker = 'EVF_READY' | 'EVF_SCENE';

/**
 * Emits one marker line (`EVF_READY`, `EVF_SCENE 3/12 actions sheet`) on the console
 * (`info` level) and in the debug log.
 */
export function emitMarker(
  log: DebugLog,
  marker: Marker,
  detail = '',
  sink: Pick<ConsoleLike, 'info'> = console,
): void {
  const line = detail === '' ? marker : `${marker} ${detail}`;
  // Machine-readable protocol line for the simulator console, debug/demo mode only.
  sink.info(line);
  log.push('info', 'marker', line);
}
