/**
 * Regression: graceful shutdown — app.close() runs Fastify onClose hooks.
 *
 * LOW finding (review cleanup): the bridge had no SIGTERM/SIGINT handler, so on
 * Docker `stop` the process was hard-killed and the server.ts onClose hooks
 * (KeytermRefresher dispose, in-flight WS drain, debounce timers) never ran.
 * index.ts now installs SIGTERM/SIGINT handlers that call app.close().
 *
 * The signal handlers themselves call process.exit() and cannot be unit-tested
 * without terminating the runner, so this test asserts the load-bearing contract
 * the handlers rely on: app.close() (from buildServer) fires the onClose chain.
 *
 * @see packages/bridge/src/index.ts (SIGTERM/SIGINT → app.close())
 * @see packages/bridge/src/server.ts (onClose hook wiring)
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'foundry-module',
  'lang',
);

describe('graceful shutdown: app.close() runs onClose hooks', () => {
  it('fires a registered onClose hook exactly once on close', async () => {
    const app = await buildServer({ langDirOverride: LANG_DIR });

    let closeRan = 0;
    app.addHook('onClose', async () => {
      closeRan += 1;
    });

    await app.close();

    expect(closeRan).toBe(1);
  });
});
