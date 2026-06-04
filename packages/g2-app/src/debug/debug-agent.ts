/**
 * installDebugAgent — dev-only WS debug agent for the g2-app.
 *
 * Quick Task 260604-cwa: Dev-only whole-system debug/control harness.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DEV-ONLY — this entire module is tree-shaken from the production dist.  ║
 * ║  DO NOT import in production paths. The entry gate returns `false`        ║
 * ║  immediately when neither `import.meta.env.DEV` nor `VITE_EVF_DEBUG`     ║
 * ║  is truthy, but the tree-shake relies on the calling site using a        ║
 * ║  dynamic import behind the SAME boolean flag so Rollup can eliminate     ║
 * ║  the dead branch entirely. Presence verified by the prod marker grep     ║
 * ║  gate in Task 3.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * # What this does (when enabled)
 *
 * 1. Opens a native `WebSocket` to `VITE_EVF_DEBUG_HUB` (default:
 *    `ws://localhost:8910/debug/agent`), optionally appending
 *    `?secret=VITE_EVF_DEBUG_SECRET`.
 * 2. Sends `{kind:'register', role:'g2-app', name:'main'}` on open.
 * 3. On message, parses `{id, cmd, args}`, dispatches to
 *    `makeWizardCommandHandlers` (or a log-only handler when no store is
 *    provided), and sends back `{kind:'result', id, ok, result|error}`.
 * 4. Mirrors `console.log/info/warn/error` + `window.error` +
 *    `window.unhandledrejection` into `{kind:'log', ...}` frames.
 * 5. Exposes `window.__EVF_DEBUG__` with the same handlers for in-browser REPL use.
 *
 * All failures soft-fail (try/catch) — the agent MUST NEVER break the wizard.
 *
 * # Prod tree-shake marker
 *
 * The string literal below is used by Task 3's grep gate to verify the marker
 * is absent from the production dist (tree-shaken via the dynamic import gate):
 *
 *   `const EVF_DEBUG_AGENT_MARKER = '__EVF_DEBUG_AGENT_v1__';`
 *
 * @see ./wizard-commands.ts (WizardCommandHandlers — driven on command frames)
 * @see ../wizard/wizard.ts (calls installDebugAgent behind dynamic import gate)
 * @see ../index.ts (calls installDebugAgent behind dynamic import gate, log-only)
 * @see docs/release/debug-harness.md (enable/security/curl-ws recipe)
 */

// ─── Prod tree-shake marker ────────────────────────────────────────────────────
// This constant is only referenced inside the enabled branch, so Rollup can
// eliminate the dead branch (and this marker) from the production dist.
// Task 3 grep gate: `! grep -rE "__EVF_DEBUG_AGENT_v1__" packages/g2-app/dist`
const EVF_DEBUG_AGENT_MARKER = '__EVF_DEBUG_AGENT_v1__';

import type { Store, WizardState } from '../wizard/state.js';
import { makeWizardCommandHandlers, type WizardCommandHandlers } from './wizard-commands.js';

/** Options passed to {@link installDebugAgent}. */
export interface DebugAgentOpts {
  /**
   * Wizard store reference — when provided, all wizard command handlers are
   * wired (setBridgeUrl, goStep, setToken, click, etc.).
   * When undefined (engine entry), only logging + window.__EVF_DEBUG__ mirror
   * are installed.
   */
  store?: Store<WizardState>;
}

/**
 * Install the dev-only debug agent.
 *
 * Returns `false` immediately when the dev flag is off (no WS, no side effects).
 * Returns `true` after initiating the connection when enabled.
 *
 * All failures are caught and logged via the ORIGINAL console methods to avoid
 * infinite recursion in the mirrored console wrappers.
 *
 * @param opts - Optional store reference for full wizard command handling.
 * @returns `false` when the dev gate is off; `true` when the agent is installed.
 */
export function installDebugAgent(opts?: DebugAgentOpts): boolean {
  // ── DEV GATE ──────────────────────────────────────────────────────────────
  // Reference the marker so it is NOT eliminated as dead code WITHIN this branch.
  // The outer gate is the tree-shake point: the CALLER (wizard.ts / index.ts) wraps
  // the dynamic `import('./debug-agent.js')` behind the same condition, so Rollup
  // sees the import path as dead in a default prod build (DEV=false, VITE_EVF_DEBUG
  // unset → import eliminated → marker string never included).
  void EVF_DEBUG_AGENT_MARKER; // T-cwa-05: keeps marker reachable in dev build only

  const enabled =
    import.meta.env.DEV === true ||
    import.meta.env.VITE_EVF_DEBUG === 'true' ||
    import.meta.env.VITE_EVF_DEBUG === true;

  if (!enabled) {
    return false;
  }

  // Capture original console methods BEFORE patching (to avoid recursion)
  const _origLog = console.log.bind(console);
  const _origInfo = console.info.bind(console);
  const _origWarn = console.warn.bind(console);
  const _origError = console.error.bind(console);

  // Resolve hub URL + optional secret from env
  const hubUrl =
    (import.meta.env.VITE_EVF_DEBUG_HUB as string | undefined) ?? 'ws://localhost:8910/debug/agent';
  const secret = import.meta.env.VITE_EVF_DEBUG_SECRET as string | undefined;
  const wsUrl = secret ? `${hubUrl}?secret=${encodeURIComponent(secret)}` : hubUrl;

  // Build command handlers (store-aware or log-only)
  let handlers: WizardCommandHandlers | null = null;
  if (opts?.store !== undefined) {
    try {
      handlers = makeWizardCommandHandlers(opts.store);
    } catch (err) {
      _origError('[EVF/debug-agent] failed to build wizard command handlers:', err);
    }
  }

  /** Send a frame over the WS (no-op when socket is not open). */
  let ws: WebSocket | null = null;

  function sendFrame(frame: unknown): void {
    try {
      if (ws !== null && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(frame));
      }
    } catch (err) {
      _origError('[EVF/debug-agent] send error:', err);
    }
  }

  function sendLog(level: 'debug' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
    try {
      const msg = args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ');
      sendFrame({ kind: 'log', ts: Date.now(), level, source: 'g2-app', msg });
    } catch {
      // Soft-fail — never break the wizard
    }
  }

  // ── Open WebSocket ──────────────────────────────────────────────────────────
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    _origError('[EVF/debug-agent] WebSocket open error:', err);
    return true; // still "installed" — just WS unavailable
  }

  ws.onopen = () => {
    sendFrame({ kind: 'register', role: 'g2-app', name: 'main' });
  };

  ws.onmessage = (ev) => {
    let frame: { id: string; cmd: string; args: unknown } | null = null;
    try {
      frame = JSON.parse(String(ev.data)) as { id: string; cmd: string; args: unknown };
    } catch {
      return;
    }
    if (frame === null || typeof frame.id !== 'string' || typeof frame.cmd !== 'string') {
      return;
    }

    const { id, cmd, args } = frame;

    // Dispatch to handler
    void (async () => {
      try {
        const handler = handlers?.[cmd as keyof WizardCommandHandlers];
        if (typeof handler === 'function') {
          // biome-ignore lint/suspicious/noExplicitAny: args is unknown by design
          const result = await (handler as (a: any) => Promise<unknown>)(args ?? {});
          sendFrame({ kind: 'result', id, ok: true, result });
        } else {
          sendFrame({
            kind: 'result',
            id,
            ok: false,
            error: `unknown command: ${cmd}`,
          });
        }
      } catch (err) {
        sendFrame({
          kind: 'result',
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  };

  ws.onerror = (_ev) => {
    _origError('[EVF/debug-agent] WebSocket error — debug agent connection lost.');
  };

  ws.onclose = () => {
    _origWarn('[EVF/debug-agent] WebSocket closed.');
  };

  // ── Console mirroring ──────────────────────────────────────────────────────
  console.log = (...args: unknown[]) => {
    _origLog(...args);
    sendLog('debug', ...args);
  };
  console.info = (...args: unknown[]) => {
    _origInfo(...args);
    sendLog('info', ...args);
  };
  console.warn = (...args: unknown[]) => {
    _origWarn(...args);
    sendLog('warn', ...args);
  };
  console.error = (...args: unknown[]) => {
    _origError(...args);
    sendLog('error', ...args);
  };

  // ── window error + unhandledrejection ─────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (ev) => {
      sendLog('error', `[window.error] ${ev.message} (${ev.filename}:${ev.lineno})`);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const reason =
        ev.reason instanceof Error ? ev.reason.message : String(ev.reason ?? 'unhandled rejection');
      sendLog('error', `[unhandledrejection] ${reason}`);
    });
  }

  // ── window.__EVF_DEBUG__ REPL exposure ─────────────────────────────────────
  if (handlers !== null) {
    (globalThis as Record<string, unknown>)['__EVF_DEBUG__'] = handlers;
  }

  return true;
}
