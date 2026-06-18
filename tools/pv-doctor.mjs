#!/usr/bin/env node
/**
 * pv-doctor — player-view pipeline diagnostic & control CLI (ADR-0015 §C).
 *
 * One tool to inspect and drive the headless player-view end-to-end without the
 * chaotic manual `docker logs | grep` + screenshot loop. It speaks the real WS
 * protocol (handshake → client_player_view / client_select_actor) and reads the
 * bridge's Prometheus `/metrics`, so every number it prints is the same data the
 * glasses and orchestrator actually see.
 *
 * Usage (from repo root):
 *   node tools/pv-doctor.mjs report            # full pipeline snapshot (default)
 *   node tools/pv-doctor.mjs roster            # list selectable PCs (actorId → name)
 *   node tools/pv-doctor.mjs set streaming     # drive map-source = shared headless
 *   node tools/pv-doctor.mjs set actor <id>    # drive map-source = that PC's fogged view
 *   node tools/pv-doctor.mjs set off           # drive map-source = GM live view
 *   node tools/pv-doctor.mjs watch [secs]      # sample fps continuously
 *
 * Env: EVF_BRIDGE_HTTP (default http://127.0.0.1:8910), EVF_BRIDGE_TOKEN (default 'dev').
 *
 * Two fps numbers are reported because a regression can live in either half:
 *   - ingress  = POST /internal/delta rate at the bridge   (producer → bridge)
 *   - egress   = frame_png WS rate to a subscriber          (bridge → glasses)
 */
// Uses Node's built-in global WebSocket (Node 22+) — no `ws` dependency, so the
// tool runs from anywhere in the repo regardless of pnpm hoisting.

const HTTP = process.env.EVF_BRIDGE_HTTP ?? 'http://127.0.0.1:8910';
const WS_URL = `${HTTP.replace(/^http/, 'ws')}/ws`;
const TOKEN = process.env.EVF_BRIDGE_TOKEN ?? 'dev';
const HANDSHAKE = {
  proto: 'evf-v1',
  token: TOKEN,
  locale: 'en',
  capabilities: ['read_scene', 'subscribe'],
};

/** Fetch + parse the Prometheus text endpoint into a flat {metricLine: value}. */
async function metrics() {
  const text = await fetch(`${HTTP}/metrics`).then((r) => r.text());
  const out = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const sp = line.lastIndexOf(' ');
    if (sp === -1) continue;
    out[line.slice(0, sp)] = Number(line.slice(sp + 1));
  }
  return out;
}

const deltaCount = (m) =>
  m[
    'evf_http_request_duration_seconds_count{method="POST",route="/internal/delta",status_code="200"}'
  ] ?? 0;

async function healthz() {
  try {
    return await fetch(`${HTTP}/healthz`).then((r) => r.json());
  } catch {
    return { status: 'unreachable' };
  }
}

/**
 * Open a WS, run the handshake, and observe for `ms`. Captures the roster,
 * player_view_status transitions, latest settings, and counts frame_png (egress
 * fps). Optionally sends one message right after the handshake.
 */
function observe(ms, send) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const seen = {
      proto: null,
      roster: null,
      statuses: [],
      settings: null,
      frames: 0,
      firstFrameAt: null,
      lastFrameAt: null,
      errors: [],
    };
    const done = () => {
      try {
        ws.close();
      } catch {}
      resolve(seen);
    };
    ws.addEventListener('error', () => {
      seen.errors.push('ws connection error');
      resolve(seen);
    });
    ws.addEventListener('open', () => ws.send(JSON.stringify(HANDSHAKE)));
    ws.addEventListener('message', (ev) => {
      let m;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (m.proto_chosen) {
        seen.proto = m.proto_chosen;
        if (send) ws.send(JSON.stringify(send));
        return;
      }
      const type = m.type ?? m.payload?.type;
      const payload = m.payload ?? m;
      if (type === 'r1.characters.available') seen.roster = payload;
      else if (type === 'player_view_status')
        seen.statuses.push({ t: Date.now(), ...(payload ?? {}) });
      else if (type === 'settings.display' || payload.dither !== undefined) seen.settings = payload;
      else if (type === 'frame_png' || type === 'frame_pixels') {
        seen.frames += 1;
        seen.lastFrameAt = Date.now();
        if (seen.firstFrameAt === null) seen.firstFrameAt = Date.now();
      }
    });
    setTimeout(done, ms);
  });
}

/** Sample ingress fps from /metrics over `ms`. */
async function ingressFps(ms) {
  const a = deltaCount(await metrics());
  await new Promise((r) => setTimeout(r, ms));
  const b = deltaCount(await metrics());
  return ((b - a) / ms) * 1000;
}

function rosterList(roster) {
  if (!roster) return [];
  const arr = roster.characters ?? roster.actors ?? roster.list ?? [];
  return arr.map((c) => ({ id: c.actorId ?? c.id ?? '?', name: c.name ?? c.label ?? '?' }));
}

function egressFps(seen, _windowMs) {
  if (seen.frames < 2 || seen.firstFrameAt === null) return 0;
  const span = (seen.lastFrameAt - seen.firstFrameAt) / 1000;
  return span > 0 ? (seen.frames - 1) / span : 0;
}

async function cmdReport() {
  const WINDOW = 5000;
  const [h, m, seen, inFps] = await Promise.all([
    healthz(),
    metrics(),
    observe(WINDOW),
    ingressFps(WINDOW),
  ]);
  const last = seen.statuses.at(-1);
  console.log('━━━━ player-view doctor ━━━━');
  console.log(`bridge      : ${h.status} (uptime ${h.uptime_sec ?? '?'}s) @ ${HTTP}`);
  console.log(`ws sessions : ${m.evf_ws_sessions_active ?? '?'} active`);
  console.log(
    `player-view : ${last ? `${last.state}${last.detail ? ` — ${last.detail}` : ''}` : '(no status broadcast in window — orchestrator idle/off)'}`,
  );
  console.log(`fps ingress : ${inFps.toFixed(1)} fps  (POST /internal/delta → bridge)`);
  console.log(
    `fps egress  : ${egressFps(seen, WINDOW).toFixed(1)} fps  (frame_png → this subscriber)  [${seen.frames} frames/${WINDOW / 1000}s]`,
  );
  const r = rosterList(seen.roster);
  console.log(`roster      : ${r.length ? r.map((x) => x.name).join(', ') : '(not received)'}`);
  if (seen.settings)
    console.log(
      `settings    : dither=${seen.settings.dither} brightness=${seen.settings.brightness} normalize=${seen.settings.normalize} captureFps=${seen.settings.captureFps} webp=${seen.settings.webpQuality}`,
    );
  if (seen.errors.length) console.log(`errors      : ${seen.errors.join(' | ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function cmdRoster() {
  const seen = await observe(4000);
  const r = rosterList(seen.roster);
  if (!r.length) return console.log('roster not received (is a producer connected?)');
  for (const c of r) console.log(`${c.id}\t${c.name}`);
}

async function cmdSet(mode, actorId) {
  if (!['off', 'streaming', 'actor'].includes(mode)) {
    console.error(`bad mode '${mode}' — use off|streaming|actor`);
    process.exit(2);
  }
  const msg = { type: 'client_player_view', mode };
  if (mode === 'actor') {
    if (!actorId) {
      console.error('actor mode needs an actorId — run `pv-doctor roster`');
      process.exit(2);
    }
    msg.actorId = actorId;
  } else if (mode === 'streaming' && actorId) {
    // ADR-0015 §C: streaming can join as the selected PC's owning user (app reuses
    // the character selector). Optional — omit to use the env stream user fallback.
    msg.actorId = actorId;
  }
  console.log(`→ sending ${JSON.stringify(msg)}; waiting up to 150s for live/error...`);
  const ws = new WebSocket(WS_URL);
  const t0 = Date.now();
  // When switching sessions the bridge re-broadcasts the OLD session's 'live'
  // before tearing it down. Only accept a terminal status AFTER we've seen the
  // new session enter 'starting'/'off' (or for the 'off' intent, immediately).
  let sawTransition = msg.mode === 'off';
  ws.addEventListener('open', () => ws.send(JSON.stringify(HANDSHAKE)));
  ws.addEventListener('message', (ev) => {
    let m;
    try {
      m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    } catch {
      return;
    }
    if (m.proto_chosen) return ws.send(JSON.stringify(msg));
    const type = m.type ?? m.payload?.type;
    if (type === 'player_view_status') {
      const s = m.payload ?? m;
      console.log(
        `  [+${((Date.now() - t0) / 1000).toFixed(0)}s] ${s.state}${s.detail ? ` — ${s.detail}` : ''}`,
      );
      if (s.state === 'starting' || s.state === 'off') sawTransition = true;
      if (
        sawTransition &&
        (s.state === 'live' || s.state === 'error' || s.state === 'unavailable')
      ) {
        ws.close();
        process.exit(0);
      }
    }
  });
  setTimeout(() => {
    console.log('  (timeout — no terminal status)');
    process.exit(1);
  }, 150_000);
}

async function cmdWatch(secs) {
  const n = Number(secs) || 30;
  console.log(`watching fps for ${n}s (ingress | egress)...`);
  for (let i = 0; i < n; i += 3) {
    const [seen, inFps] = await Promise.all([observe(3000), ingressFps(3000)]);
    console.log(
      `t+${i + 3}s  ingress=${inFps.toFixed(1)}  egress=${egressFps(seen).toFixed(1)} fps`,
    );
  }
}

const [cmd, a, b] = process.argv.slice(2);
const run = {
  report: cmdReport,
  roster: cmdRoster,
  set: () => cmdSet(a, b),
  watch: () => cmdWatch(a),
}[cmd ?? 'report'];
if (!run) {
  console.error(`unknown command '${cmd}' — use report|roster|set|watch`);
  process.exit(2);
}
run();
