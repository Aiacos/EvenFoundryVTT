/**
 * dashboard.ts — the single-file phosphor-green CRT debug console UI.
 *
 * Quick Task 260529-h5e Wave 3.
 *
 * The dashboard is shipped as an **inlined TS string constant** (not a separate
 * `.html` asset) so that it survives the bridge's tsup bundle without any runtime
 * asset-copy / `import.meta.url` resolution. tsup bundles `src/index.ts` into a
 * single `dist/index.js`; a string constant is inlined into that bundle verbatim,
 * resolving identically in dev (`tsx`) and bundled (`dist`) contexts. See the plan's
 * Wave 3 "tsup bundle safety" note.
 *
 * The HTML embeds all CSS + JS (no build step, mirroring `docs/showcase/index.html`):
 *   - a one-time in-memory secret field (sent as `Authorization: Bearer` on fetch
 *     and `?secret=` on the WS — browsers cannot set WS headers).
 *   - a live event stream (WS `/debug/stream`) with client-side filters.
 *   - a state panel polling `GET /debug/state`.
 *   - command forms: inject (envelope-type dropdown + JSON payload), dispatch-tool,
 *     simulate-gesture.
 *
 * @see ./debug-routes.ts (registers the GET /debug/console + /debug alias route)
 */

/**
 * Enumerated bridge→client envelope `type` values offered in the inject dropdown.
 * Kept in sync with the shared-protocol `*_TYPE` constants (dev tooling — a static
 * list is acceptable; the textarea still accepts any free-form `type`).
 */
const ENVELOPE_TYPES = [
  'character.delta',
  'combat.state',
  'combat.targets',
  'combat.turn',
  'conc.conflict',
  'conc.drop.confirmed',
  'event.log.delta',
  'log.delta',
  'r1.action.economy',
  'r1.action.result',
  'r1.entities.available',
  'r1.gesture',
  'r1.movement.budget',
  'r1.multiattack.progress',
  'r1.portrait.ready',
  'r1.reaction.available',
  'r1.spells.available',
  'scene.viewport',
  'template.placement.cancel',
  'template.placement.confirmed',
  'template.placement.requested',
] as const;

const GESTURE_KINDS = ['tap', 'double-tap', 'scroll-up', 'scroll-down'] as const;

const typeOptions = ENVELOPE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');
const gestureOptions = GESTURE_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('');

/**
 * The complete, self-contained debug console HTML document.
 *
 * Marker substring `EVF Debug Console` is asserted by `dashboard-route.test.ts`.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a0f0a" />
<title>EVF Debug Console</title>
<style>
:root {
  --p0:#050a05; --p1:#0a0f0a; --p2:#0f1810; --p3:#142214;
  --g0:#2d4a2d; --g1:#4a8c4a; --g2:#6dd56d; --g3:#9cffaf; --g4:#d8ffd8;
  --warn:#ffb84d; --crit:#ff6b6b;
  --mono:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
}
* { box-sizing:border-box; }
html,body { margin:0; height:100%; }
body {
  background:var(--p1); color:var(--g4); font-family:var(--mono); font-size:13px;
  line-height:1.45; padding:12px;
  background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.18) 3px,transparent 4px);
}
h1,h2 { font-weight:400; letter-spacing:.06em; color:var(--g3); text-shadow:0 0 10px rgba(109,213,109,.4); margin:0 0 .4rem; }
h1 { font-size:1.4rem; }
h2 { font-size:1rem; text-transform:uppercase; letter-spacing:.14em; color:var(--g2); margin:0 0 .5rem; }
a { color:var(--g3); }
.bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; padding:8px; background:var(--p2); border:1px solid var(--g0); border-radius:4px; }
.grid { display:grid; grid-template-columns:1.4fr 1fr; gap:12px; }
@media (max-width:900px){ .grid { grid-template-columns:1fr; } }
.panel { background:var(--p2); border:1px solid var(--g0); border-radius:4px; padding:10px; }
input,select,textarea,button {
  background:var(--p0); color:var(--g4); border:1px solid var(--g0); border-radius:3px;
  font-family:var(--mono); font-size:12px; padding:5px 7px;
}
input:focus,select:focus,textarea:focus { outline:none; border-color:var(--g2); box-shadow:0 0 6px rgba(109,213,109,.35); }
button { cursor:pointer; color:var(--g3); border-color:var(--g1); }
button:hover { background:var(--p3); color:var(--g4); border-color:var(--g2); }
textarea { width:100%; min-height:64px; resize:vertical; }
label { display:block; color:var(--g2); font-size:11px; text-transform:uppercase; letter-spacing:.08em; margin:6px 0 2px; }
.row { display:flex; gap:6px; flex-wrap:wrap; align-items:flex-end; }
.row > * { flex:1 1 auto; }
.feed { height:48vh; overflow:auto; border:1px solid var(--g0); border-radius:3px; padding:4px; background:var(--p0); }
.ev { padding:2px 4px; border-bottom:1px solid rgba(45,74,45,.4); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ev .dir { display:inline-block; min-width:64px; }
.dir-inbound { color:var(--g2); } .dir-outbound { color:var(--g3); } .dir-tool { color:var(--warn); }
.dir-display { color:#9cd5ff; } .dir-log { color:var(--g1); }
.muted { color:var(--g1); }
pre { margin:6px 0 0; white-space:pre-wrap; word-break:break-word; max-height:30vh; overflow:auto; background:var(--p0); padding:6px; border:1px solid var(--g0); border-radius:3px; }
.tag { color:var(--g2); }
.err { color:var(--crit); }
.ok { color:var(--g2); }
fieldset { border:1px solid var(--g0); border-radius:3px; margin:0 0 10px; padding:8px; }
legend { color:var(--g2); padding:0 6px; text-transform:uppercase; letter-spacing:.08em; font-size:11px; }
</style>
</head>
<body>
<h1>EVF Debug Console <span class="muted" style="font-size:.75rem">// dev-only · secret-gated</span></h1>
<div class="bar">
  <label style="margin:0">secret</label>
  <input id="secret" type="password" placeholder="EVF_INTERNAL_SECRET" style="flex:2 1 220px" />
  <button id="connect">connect stream</button>
  <span id="wsStatus" class="muted">ws: idle</span>
</div>
<div class="grid">
  <div class="panel">
    <h2>Live event stream</h2>
    <div class="row">
      <div style="flex:1"><label>filter direction</label>
        <select id="fDir"><option value="">(all)</option><option>inbound</option><option>outbound</option><option>tool</option><option>display</option><option>log</option></select>
      </div>
      <div style="flex:1"><label>filter type</label><input id="fType" placeholder="substring" /></div>
      <div style="flex:1"><label>filter session</label><input id="fSession" placeholder="sessionId" /></div>
      <div style="flex:0"><label>&nbsp;</label><button id="clearFeed">clear</button></div>
    </div>
    <div id="feed" class="feed"></div>
  </div>
  <div class="panel">
    <h2>State snapshot</h2>
    <div class="row">
      <button id="poll">poll /debug/state</button>
      <button id="autoPoll">auto: off</button>
    </div>
    <pre id="state" class="muted">(not polled)</pre>
  </div>
</div>

<div class="panel" style="margin-top:12px">
  <h2>Commands</h2>
  <div class="grid">
    <fieldset>
      <legend>inject envelope</legend>
      <label>type</label>
      <select id="injType">${typeOptions}</select>
      <label>targetSessionId (blank = all)</label>
      <input id="injTarget" placeholder="(all sessions)" />
      <label>payload (JSON)</label>
      <textarea id="injPayload">{}</textarea>
      <div class="row" style="margin-top:6px"><button id="injSend">inject</button><span id="injOut" class="muted"></span></div>
    </fieldset>
    <fieldset>
      <legend>dispatch tool (ADR-0011 → foundry)</legend>
      <label>sessionId</label><input id="dspSession" />
      <label>toolId</label><input id="dspTool" placeholder="cast-spell" />
      <label>args (JSON)</label>
      <textarea id="dspArgs">{}</textarea>
      <div class="row" style="margin-top:6px"><button id="dspSend">dispatch</button><span id="dspOut" class="muted"></span></div>
    </fieldset>
  </div>
  <fieldset style="margin-top:10px">
    <legend>simulate R1 gesture</legend>
    <div class="row">
      <div style="flex:2"><label>sessionId</label><input id="gesSession" /></div>
      <div style="flex:1"><label>kind</label><select id="gesKind">${gestureOptions}</select></div>
      <div style="flex:0"><label>&nbsp;</label><button id="gesSend">gesture</button></div>
      <span id="gesOut" class="muted" style="flex:2"></span>
    </div>
  </fieldset>
</div>

<script>
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var feed = $('feed');
  var events = [];
  var ws = null;
  var autoTimer = null;

  function secret(){ return $('secret').value || ''; }
  function headers(){ return { 'Authorization': 'Bearer ' + secret(), 'Content-Type':'application/json' }; }

  function passesFilter(e){
    var d = $('fDir').value, t = $('fType').value.trim(), s = $('fSession').value.trim();
    if (d && e.direction !== d) return false;
    if (t && (e.type||'').indexOf(t) < 0) return false;
    if (s && (e.sessionId||'') !== s) return false;
    return true;
  }
  function esc(x){ var d=document.createElement('div'); d.textContent = x==null?'':String(x); return d.innerHTML; }
  function renderFeed(){
    feed.innerHTML = events.filter(passesFilter).slice(-400).map(function(e){
      return '<div class="ev"><span class="dir dir-'+esc(e.direction)+'">'+esc(e.direction)+'</span> '
        + '<span class="muted">'+esc(new Date(e.ts).toLocaleTimeString())+'</span> '
        + '<span class="tag">'+esc(e.type)+'</span> '
        + (e.seq!=null?'<span class="muted">#'+esc(e.seq)+'</span> ':'')
        + (e.sessionId?'<span class="muted">['+esc(e.sessionId).slice(0,8)+']</span> ':'')
        + esc(e.summary) + '</div>';
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  }
  ['fDir','fType','fSession'].forEach(function(id){ $(id).addEventListener('input', renderFeed); });
  $('clearFeed').addEventListener('click', function(){ events = []; renderFeed(); });

  $('connect').addEventListener('click', function(){
    if (ws){ try { ws.close(); } catch(e){} ws = null; }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host + '/debug/stream?secret=' + encodeURIComponent(secret());
    ws = new WebSocket(url);
    $('wsStatus').textContent = 'ws: connecting';
    ws.onopen = function(){ $('wsStatus').textContent = 'ws: live'; };
    ws.onclose = function(){ $('wsStatus').textContent = 'ws: closed'; };
    ws.onerror = function(){ $('wsStatus').textContent = 'ws: error'; };
    ws.onmessage = function(m){ try { events.push(JSON.parse(m.data)); renderFeed(); } catch(e){} };
  });

  function pollState(){
    fetch('/debug/state', { headers: headers() }).then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
      .then(function(o){ $('state').textContent = JSON.stringify(o.j, null, 2); $('state').className = o.ok ? '' : 'err'; })
      .catch(function(e){ $('state').textContent = String(e); $('state').className = 'err'; });
  }
  $('poll').addEventListener('click', pollState);
  $('autoPoll').addEventListener('click', function(){
    if (autoTimer){ clearInterval(autoTimer); autoTimer = null; $('autoPoll').textContent = 'auto: off'; }
    else { autoTimer = setInterval(pollState, 1500); $('autoPoll').textContent = 'auto: on'; pollState(); }
  });

  function post(path, body, outEl){
    var el = $(outEl); el.className = 'muted'; el.textContent = '…';
    fetch(path, { method:'POST', headers: headers(), body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
      .then(function(o){ el.className = o.ok ? 'ok' : 'err'; el.textContent = JSON.stringify(o.j); })
      .catch(function(e){ el.className = 'err'; el.textContent = String(e); });
  }
  function parseJson(id, outEl){
    try { return JSON.parse($(id).value || '{}'); }
    catch(e){ var el=$(outEl); el.className='err'; el.textContent='bad JSON'; return undefined; }
  }

  $('injSend').addEventListener('click', function(){
    var p = parseJson('injPayload','injOut'); if (p===undefined) return;
    var body = { type: $('injType').value, payload: p };
    var t = $('injTarget').value.trim(); if (t) body.targetSessionId = t;
    post('/debug/inject', body, 'injOut');
  });
  $('dspSend').addEventListener('click', function(){
    var a = parseJson('dspArgs','dspOut'); if (a===undefined) return;
    post('/debug/dispatch-tool', { sessionId: $('dspSession').value.trim(), toolId: $('dspTool').value.trim(), args: a }, 'dspOut');
  });
  $('gesSend').addEventListener('click', function(){
    post('/debug/simulate-gesture', { sessionId: $('gesSession').value.trim(), kind: $('gesKind').value }, 'gesOut');
  });
})();
</script>
</body>
</html>`;
