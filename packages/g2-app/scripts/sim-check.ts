/**
 * No-hardware validation loop (P5): drives the real g2-app demo tour inside the Even Hub
 * simulator and checks what actually reaches the glasses display.
 *
 *   tsx scripts/sim-check.ts [--url <app url>] [--port 9898] [--vite-port 5173]
 *                            [--sim "<simulator command>"] [--timeout 60000]
 *
 * 1. Serves the app with `vite` (unless `--url` is given).
 * 2. Launches `evenhub-simulator <url>?demo=tour --automation-port <port>` (`--sim` or
 *    `$EVF_SIMULATOR` overrides the command, e.g. `npx -y @evenrealities/evenhub-simulator@0.9.5`).
 * 3. Waits for `EVF_READY`, then for every `EVF_SCENE i/n name layout` marker saves the
 *    glasses screenshot to `.sim-artifacts/`, checks it (lit pixels in the five sheet
 *    zones, header rules continuous across the x = 287 | 288 top-tile seam; INV-1 gutter
 *    pixels at x = 144 / 432 / 288 identical across sheet scenes),
 *    probes real input on list scenes (`down` must change the display) and advances with
 *    `double_click`.
 * 4. Fails on `[uncaught]` / `[unhandledrejection]` entries in the simulator console.
 *
 * Exit codes: 0 pass · 1 fail · 2 simulator unavailable (skip — hardware-style defer
 * pattern: a missing simulator/display never fails software CI).
 *
 * @see everything-evenhub:simulator-automation (HTTP API)
 * @see src/demo/demo-app.ts (marker protocol)
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  type ConsoleEntry,
  checkGutters,
  checkScene,
  decodePng,
  diffPixels,
  findConsoleErrors,
  gutterSignature,
  hasMarker,
  lastId,
  parseSceneMarker,
  type RgbaImage,
  type SceneMarker,
} from './sim-lib.js';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = join(PACKAGE_DIR, '.sim-artifacts');
/** Simulator version the loop was validated against. */
const EXPECTED_SIM_VERSION = '0.9.5';
/** Scenes whose list cursor must visibly move on a real `down` input. */
const INPUT_PROBES: readonly string[] = ['actions', 'target'];
/** Extra wait after a scene marker: the paced image zones land after the text. */
const SHOT_DELAY_MS = 1800;
const INPUT_DELAY_MS = 700;

class Unavailable extends Error {}

const { values: args } = parseArgs({
  // `pnpm sim:check -- --flag` forwards a literal `--`; drop it so flags still parse.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    url: { type: 'string' },
    port: { type: 'string', default: '9898' },
    'vite-port': { type: 'string', default: '5173' },
    sim: { type: 'string' },
    timeout: { type: 'string', default: '60000' },
  },
});

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const api = `http://127.0.0.1:${args.port}`;
const timeoutMs = Number(args.timeout);
const children: ChildProcess[] = [];

async function waitFor<T>(what: string, probe: () => Promise<T | null>, ms: number): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== null) return value;
    } catch {
      // Not up yet (connection refused): keep polling until the deadline.
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function simulatorCommand(): string[] {
  const raw = args.sim ?? process.env.EVF_SIMULATOR ?? 'evenhub-simulator';
  return raw.split(/\s+/).filter((p) => p !== '');
}

/** Checks the simulator can start here (binary present, display available). */
function probeSimulator(cmd: string[]): void {
  const [bin, ...rest] = cmd;
  if (bin === undefined) throw new Unavailable('empty simulator command');
  const res = spawnSync(bin, [...rest, '--version'], { encoding: 'utf8', timeout: 120_000 });
  if (res.error !== undefined) throw new Unavailable(`${bin}: ${res.error.message}`);
  if (res.status !== 0) {
    const why = `${res.stderr}${res.stdout}`.trim().split('\n').slice(-2).join(' ');
    throw new Unavailable(`${cmd.join(' ')} --version failed (no display?): ${why}`);
  }
  const version = res.stdout.trim();
  out(`simulator: ${version}`);
  if (!version.includes(EXPECTED_SIM_VERSION)) {
    out(`warning: validated against evenhub-simulator ${EXPECTED_SIM_VERSION}`);
  }
}

/** Starts `cmd` in its own process group, output to `.sim-artifacts/<name>.log`. */
function start(name: string, cmd: string[], cwd: string): ChildProcess {
  const [bin, ...rest] = cmd;
  if (bin === undefined) throw new Error('empty command');
  const log = openSync(join(ARTIFACTS, `${name}.log`), 'w');
  const child = spawn(bin, rest, { cwd, detached: true, stdio: ['ignore', log, log] });
  children.push(child);
  return child;
}

function stopAll(): void {
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone (group exited between the check and the kill).
    }
  }
}

async function appUrl(): Promise<string> {
  if (args.url !== undefined) return args.url;
  const port = args['vite-port'];
  const vite = join(PACKAGE_DIR, 'node_modules', '.bin', 'vite');
  start('vite', [vite, '--port', port, '--strictPort', '--host', '127.0.0.1'], PACKAGE_DIR);
  const url = `http://127.0.0.1:${port}/`;
  await waitFor('vite dev server', async () => ((await fetch(url)).ok ? true : null), 30_000);
  out(`vite: ${url}`);
  return url;
}

let consoleSeen: ConsoleEntry[] = [];

async function pollConsole(): Promise<ConsoleEntry[]> {
  const since = lastId(consoleSeen);
  const res = await fetch(`${api}/api/console${since === null ? '' : `?since_id=${since}`}`);
  const body = (await res.json()) as { entries: ConsoleEntry[] };
  consoleSeen = [...consoleSeen, ...body.entries];
  return body.entries;
}

async function screenshot(): Promise<{ png: Uint8Array; img: RgbaImage }> {
  const res = await fetch(`${api}/api/screenshot/glasses`);
  if (!res.ok) throw new Error(`screenshot HTTP ${res.status}`);
  const png = new Uint8Array(await res.arrayBuffer());
  return { png, img: decodePng(png) };
}

async function input(action: 'up' | 'down' | 'click' | 'double_click'): Promise<void> {
  const res = await fetch(`${api}/api/input`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`input ${action}: HTTP ${res.status}`);
}

async function waitScene(index: number): Promise<SceneMarker> {
  return waitFor(
    `EVF_SCENE ${index}`,
    async () => {
      await pollConsole();
      for (const e of consoleSeen) {
        const m = parseSceneMarker(e.message);
        if (m?.index === index) return m;
      }
      return null;
    },
    timeoutMs,
  );
}

async function run(): Promise<number> {
  const cmd = simulatorCommand();
  probeSimulator(cmd);
  await rm(ARTIFACTS, { recursive: true, force: true });
  await mkdir(ARTIFACTS, { recursive: true });

  const target = new URL(await appUrl());
  target.searchParams.set('demo', 'tour');
  start(
    'simulator',
    [...cmd, target.toString(), '--automation-port', String(args.port)],
    PACKAGE_DIR,
  );
  await waitFor(
    'simulator /api/ping',
    async () => ((await fetch(`${api}/api/ping`)).ok ? true : null),
    60_000,
  );
  await waitFor(
    'EVF_READY',
    async () => {
      await pollConsole();
      return hasMarker(consoleSeen, 'EVF_READY') ? true : null;
    },
    timeoutMs,
  );
  out('EVF_READY');

  const problems: string[] = [];
  const sheetScenes: { name: string; signature: string }[] = [];
  const report: Record<string, unknown>[] = [];
  let total = 1;
  for (let i = 1; i <= total; i++) {
    const marker = await waitScene(i);
    total = marker.total;
    await sleep(SHOT_DELAY_MS);
    const shot = await screenshot();
    const file = `${String(i).padStart(2, '0')}-${marker.name}.png`;
    await writeFile(join(ARTIFACTS, file), shot.png);
    const sceneProblems = checkScene(marker, shot.img);
    if (marker.layout !== 'full') {
      sheetScenes.push({ name: marker.name, signature: gutterSignature(shot.img) });
    }
    if (INPUT_PROBES.includes(marker.name)) {
      await input('down');
      await sleep(INPUT_DELAY_MS);
      const after = await screenshot();
      await writeFile(join(ARTIFACTS, file.replace('.png', '-down.png')), after.png);
      if (diffPixels(shot.img, after.img) === 0) {
        sceneProblems.push(`${marker.name}: real "down" input did not change the display`);
      }
      await input('up');
      await sleep(INPUT_DELAY_MS);
    }
    problems.push(...sceneProblems);
    report.push({ ...marker, file, problems: sceneProblems });
    out(
      `${sceneProblems.length === 0 ? 'ok  ' : 'FAIL'} ${i}/${total} ${marker.name} (${marker.layout})`,
    );
    if (i < total) await input('double_click');
  }

  problems.push(...checkGutters(sheetScenes));
  await pollConsole();
  const errors = findConsoleErrors(consoleSeen);
  problems.push(...errors.map((e) => `console: ${e.message}`));
  await writeFile(
    join(ARTIFACTS, 'report.json'),
    `${JSON.stringify({ scenes: report, problems, console: consoleSeen }, null, 2)}\n`,
  );
  const files = (await readdir(ARTIFACTS)).length;
  out(`artifacts: ${ARTIFACTS} (${files} files)`);
  for (const p of problems) out(`problem: ${p}`);
  out(problems.length === 0 ? 'sim-check PASS' : `sim-check FAIL (${problems.length})`);
  return problems.length === 0 ? 0 : 1;
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

run().then(
  (code) => {
    stopAll();
    process.exit(code);
  },
  (error: unknown) => {
    stopAll();
    if (error instanceof Unavailable) {
      out(`SKIP: simulator unavailable — ${error.message}`);
      process.exit(2);
    }
    out(`sim-check ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
