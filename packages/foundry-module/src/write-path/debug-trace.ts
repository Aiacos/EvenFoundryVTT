/**
 * Write-path debug trace + environment beacon — autonomous remote diagnosis.
 *
 * The Foundry module executes write tools (skill-check / cast-spell / …) inside a remote
 * browser (the owning player's tab) that an operator cannot inspect directly. To debug a
 * hanging or failing handler WITHOUT a console, the write path records a short, URL-safe
 * "trace" string at each step it reaches, and a one-shot "env" summary of the runtime
 * (Foundry / dnd5e / MidiQOL versions). The tool-invocation poller appends both to its
 * ~1s drain GET as `&dbg=` / `&env=` query params, so they appear verbatim in the bridge's
 * request access log (`docker logs evf-bridge`) — visible even on a bridge that has no
 * dedicated debug route. The LAST trace before the log goes quiet pinpoints where a handler
 * hung (e.g. `#7:cast-spell:activity.use:pending` = it never returned from `activity.use`).
 *
 * Security: traces are step labels + tool ids + short error messages only — NEVER bearer
 * tokens or full payloads (T-02-01). Keep values short and free of secrets.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (instrumentation)
 * @see packages/foundry-module/src/write-path/tool-invocation-poller.ts (beacon transport)
 * @see packages/bridge/src/routes/tool-channel.ts (logs dbg/env on change)
 */

/** Monotonic write-path invocation counter — prefixes each trace so a NEW invocation that
 *  reaches the same step still differs (and so the bridge's change-logging re-logs it). */
let invocationSeq = 0;

/** The most recent write-path trace label (empty until the first instrumented dispatch). */
let writePathTrace = '';

/** One-shot runtime environment summary (set once on `ready`). */
let envSummary = '';

/**
 * Begin a new traced invocation: bumps the sequence and records the opening label.
 *
 * @param label - Opening step label (e.g. `cast-spell:start`).
 * @returns The invocation sequence number, to thread through {@link traceStep}.
 */
export function beginTrace(label: string): number {
  invocationSeq += 1;
  writePathTrace = `#${invocationSeq}:${label}`;
  return invocationSeq;
}

/**
 * Record a step within an in-flight invocation.
 *
 * @param seq   - The sequence returned by {@link beginTrace}.
 * @param label - Step label (e.g. `activity.use:pending`).
 */
export function traceStep(seq: number, label: string): void {
  writePathTrace = `#${seq}:${label}`;
}

/**
 * Record a step on the CURRENT invocation without threading the sequence — for handlers
 * (which receive only `args`) to mark fine-grained progress (`cast-spell:activity.use:pending`).
 * Uses the latest {@link beginTrace} sequence; dispatch is serial per cacheKey so this is
 * unambiguous for the in-flight tool.
 *
 * @param label - Step label.
 */
export function traceCurrent(label: string): void {
  writePathTrace = `#${invocationSeq}:${label}`;
}

/** @returns The most recent write-path trace label (URL-safe-ish; encode before transport). */
export function getWritePathTrace(): string {
  return writePathTrace;
}

/** Set the one-shot runtime environment summary (called once on `ready`). */
export function setEnvSummary(summary: string): void {
  envSummary = summary;
}

/** @returns The runtime environment summary, or empty string if not yet set. */
export function getEnvSummary(): string {
  return envSummary;
}

/** Test seam: reset all module-global trace state between cases. */
export function _resetDebugTrace(): void {
  invocationSeq = 0;
  writePathTrace = '';
  envSummary = '';
}
