# Research: Glasses login, pairing and distribution — redone from scratch

**Feature**: `004-relay-pairing` | **Date**: 2026-09-25 | **Method**: 4 parallel source-verified
research rounds (Foundry/Forge, Even Hub, relay transports, sibling G2 projects) + first-hand
re-verification of every load-bearing quote + a local relay spike. Confidence: **[V]** verified
verbatim upstream · **[S]** verified by our own spike/probe · **[L]** likely (inferred) ·
**[?]** unknown → becomes a GO/NO-GO gate.

## 🎲 The question

Make the player log in on the glasses, stream the map and act **without the GM**, **without
losing the login in their own browser**, simple and fast (QR is fine), and find an easy path
for both the **development build** and an **Even Hub release**.

## 🔬 Findings

### F1 — Foundry v14 no longer renders module HTML (CRITICAL drift vs ADR-0016)

- **[V]** Foundry **14.361** (Stable 3, 2026-05-05): *"Foundry VTT now serves HTML files with a
  'text/plain' content type … when static HTML files are accessed directly by the Electron
  client or browsers they will no longer render as HTML."* — foundryvtt.com/releases/14.361
- **[V]** Re-enabling it was refused: issue #14375 closed NOT_PLANNED — *"we won't be
  re-enabling `text/html` as a served filetype for user-uploaded content"* (aaclayton) —
  github.com/foundryvtt/foundryvtt/issues/14375
- ⇒ `https://<foundry>/modules/evenfoundryvtt/g2/index.html` (ADR-0016 §1) shows **source
  text** on every v14 ≥ 14.361 server, self-hosted or Forge. This is the "old HTML page shown
  as text" symptom seen on 2026-09-24. ADR-0016's "works on v13 **and** v14" is false.
  **Drift: CRITICAL.** The only recorded `validate:direct-sideload` run
  (`docs/perf/phase-0/adr-0016-direct-sideload-2026-09-24…json`) stopped at the Forge 302
  before reaching this check.

### F2 — Same-user double login is a bug being fixed; players can't create users

- **[V]** Issue #14728 (OPEN, label `authorization`, assigned stwlam): *"Regression: the same
  user can log in twice, with no warning and no disconnect of the first session"*; expected
  fix = *"reject the duplicate login … or disconnect the earlier session"*. ⇒ logging the
  phone in as the player's **own** user would, once fixed, kick the player's browser (or be
  refused). Never design on it.
- **[V]** *"If you are a user with the player or trusted player role you can only open your
  own user configuration, but gamemasters and assistant gamemasters can configure any user
  they want."* — foundryvtt.com/article/users. `CONST.USER_PERMISSIONS` has no user-creation
  permission. ⇒ any design where the phone logs into Foundry needs a GM to create a second
  user ("(G2)", ADR-0017 §1). **"No GM" and "phone logs into Foundry" are incompatible.**
- **[V]** No token / API-key / SSO login exists (#3568 open; access keys removed in 0.8.7,
  #4462) and no external API is planned (#11239 closed NOT_PLANNED: *"only offer a JavaScript
  API internal to Foundry Virtual Tabletop"*).
- **[V]** The module socket relay works from any client: *"relays arbitrary data packets
  between the sending client and all other connected clients"* —
  foundryvtt.com/article/module-development.

### F3 — The Forge blocks the phone, not the player's browser

- **[V]** Private games: *"only users who are logged in can access the game's URL, and only
  then users who have been invited"* — forums.forge-vtt.com/t/public-private-games/3588.
  **[S]** `HEAD https://aiacos-vecna.eu.forge-vtt.com/` → `302` to `eu.forge-vtt.com/game/…`
  for every path (2026-09-25).
- **[V]** User Manager auto-maps the Forge account to its Foundry user and takes over `/join`
  (forums.forge-vtt.com/t/the-user-manager/11039; `ForgeVTT.mjs` commit 7809ede).
- **[S]** No `Content-Security-Policy` header on `forge-vtt.com`, `eu.forge-vtt.com/game/*`
  or the game host redirect (2026-09-25). **[L]** Foundry itself sends no CSP (no release note
  or issue mentions one). **[?]** The logged-in `/game` page of a Forge v14 game → **GATE G1**.

### F4 — Even Hub: what a store app can reach, and how

All quotes from hub.evenrealities.com/docs (35 pages fetched 2026-09-25) and SDK 0.0.16 (npm,
2026-09-24; `index.d.ts` identical to 0.0.15).

- **[V]** Whitelist covers *"fetch(), XMLHttpRequest, WebSockets"*; *"One whitelist entry per
  origin … bare hostnames and wildcards aren't supported"*; multiple origins allowed;
  *"HTTPS in production"* (build/networking). *"Can I open a WebSocket? Yes - same whitelist
  rules. Expect drops when the WebView backgrounds."* (reference/faq)
- **[V]** *"The whitelist is not a CORS bypass"*; *"proxy through a server you control that
  sets the right headers - then put that server's domain in the app.json whitelist"*.
- **[V]** No runtime origin: *"Can I open a deep link in the system browser? TBD."*; launch
  info is only `LaunchSource = 'appMenu' | 'glassesMenu'`; the manifest of a Released build
  can't be edited (ship/app-submission). ⇒ a store app can talk **only to a fixed origin
  we own**, never to each table's Foundry.
- **[V]** `captureImageFromCamera(): Promise<AppImageAsset | null>` (SDK ≥ 0.0.11, `camera`
  permission) — no QR decoder: decode in JS. No clipboard (*"no clipboard"*, faq).
- **[V]** localStorage *"survives suspension, kill, and update. Cleared on uninstall."*
  (faq); the `device-features` skill warns it is unreliable → write both `localStorage` and
  `bridge.setLocalStorage` (the g2-app already mirrors).
- **[V]** Lifecycle: sideload *"dies the second the phone locks"* (test/local-testing),
  private build *"survive[s] briefly but not 5 minutes"*, only **Beta/Released** installs pass
  the 5-minute lock test (test/beta-testing). ⇒ **for real play the player needs the
  store/beta install; QR sideload is a dev tool.**
- **[V]** States Draft → Test → Submitted → Released; beta testers install from *"Me → Beta
  tester"*; review wants *"Backend service domains … documented and traceable to the
  developer"* and a privacy policy covering every permission; *"No paid distribution yet"*.
- **[V]** Dev loop: `evenhub qr --url http://<lan-ip>:5173` with HMR; CLI encodes the URL
  verbatim (query/fragment survive); Developer Mode = sign in once at hub.evenrealities.com.
- **[?]** `wss://` vs `https://` spelling of the whitelist entry, whether sideload enforces
  the whitelist, sideload + store install coexistence → **GATE G2** (list both spellings).

### F5 — Transport: an opaque room relay on a fixed origin

- Ranked (vendor docs, Sept 2026): **Cloudflare Workers + Durable Objects (WebSocket
  Hibernation), free plan** ≫ Ably free > self-hosted. Rejected: public MQTT brokers (ToS:
  *"not intended for private or production data"*), ntfy.sh (4 096-byte messages, 60-burst
  then 1/5 s), Supabase (*"paused after 1 week of inactivity"*), PeerJS cloud (no SLA),
  WebRTC (still needs signalling; WKWebView reports of failures; TURN on cellular).
- **[V]** Cloudflare: *"There is no charge for outgoing WebSocket messages"*; *"a 20:1 ratio is
  applied to incoming WebSocket messages"*; hibernated/idle objects not billed for duration;
  free plan = SQLite-backed DOs; 100 000 requests/day shared by all tables
  (developers.cloudflare.com/durable-objects/platform/pricing, …/best-practices/websockets).
  Budget: a 4 h session at 1 msg/s each way ≈ 1 440 billed requests ⇒ ≈ 69 worst-case
  sessions/day; delta-only + hash-gated map makes real use far lower. **[?]** real GB-s →
  **GATE G3** (measure on deploy).
- **[S]** Spike (`wrangler` 4.140.0, `wrangler dev`, 2026-09-25): 60-line Worker + one DO per
  room, tags `projector|glasses`, 64 KiB frame cap. Invalid room → 404; 100 × 6 KB tiles
  projector → glasses in 45 ms locally; reconnect of a role replaces the stale socket.
  Two protocol fixes found: (a) a newcomer must receive `peer-up` when its peer is already
  there; (b) closing a *replaced* socket (code 4000) must not emit `peer-down`.

### F6 — Sibling G2 projects (prior art on disk)

None has been submitted to Even Hub. `alchemyrpg_g2_notes` talks directly to a CORS-friendly
backend whitelisted as `https://` **and** `wss://` origins; `even-cmatrix` bans
`window.localStorage` in favour of `bridge.setLocalStorage`. Confirms F4; nothing contradicts.

## ⚖️ Decisions

| # | Decision | Rationale | Alternatives rejected |
|---|----------|-----------|----------------------|
| D1 | **The phone never logs into Foundry.** The player's own Foundry tab is the projector; phone ⇄ projector traffic goes through an opaque E2E-sealed room relay. | F1 (no HTML on v14), F2 (no GM ⇒ no second user; own user kicks the browser), F3 (Forge gate), F4 (store needs a fixed origin). Single design that satisfies all four. | Keep same-origin sideload (broken on v14, needs GM, Forge gate, no store); phone logs in as the player (#14728 fix kicks the browser); WebRTC (signalling + iOS risk). |
| D2 | **Relay = Cloudflare Worker + one Durable Object per room**, fixed origin owned by the project; self-host URL as opt-in override. | F5: free, fixed origin, no ToS ban, ~60 LOC, proven in spike. | Ably (token server needed), public brokers (ToS), self-host only (no fixed origin ⇒ no store). |
| D3 | **Pairing = one QR shown in the player's Foundry**: `https://<app-origin>/#evf=<v2 payload: room, key, label>`; 16-char code fallback derives room + key by HKDF. Pairing is long-lived (persisted both sides) and revocable; no single-use password needed because no password exists. | Fast (one scan), no GM, no Foundry credential ever leaves the browser. | Short numeric code (too little entropy for the key). |
| D4 | **App hosting:** (a) **Even Hub store/beta `.ehpk`** whitelisting only the relay → the player path (survives phone lock); (b) **GitHub Pages** copy of the same build at a fixed URL → QR-scan path for developer-mode phones and for the pairing QR itself; (c) **Vite on LAN** + `wrangler dev` → dev loop. Same bundle, relay URL chosen at build time. | F4 lifecycle + whitelist facts. | Foundry-served page (F1). |
| D5 | In the store app, the pairing QR is read with `captureImageFromCamera()` + a JS QR decoder; the code field is the no-camera fallback. | F4 (no deep link, no clipboard). | Deep link (not available). |
| D6 | **Scene pictures are prepared by the projector** (it can load the scene art) and sent once each as downsized `asset` messages; the phone's pixelation is unchanged. The phone no longer fetches Foundry assets. | The phone has no Foundry origin any more; smallest change to the proven ADR-0018 renderer; BLE budget unchanged (P4). | Phone fetches art (impossible without login/CORS); projector renders 4-bit tiles (duplicates the renderer, re-sends on every token move). |
| D7 | **GM path = optional, same flow**: a GM may generate a QR for any actor; whoever showed the QR is that device's projector. No "(G2)" users, no ECDH custody, no election. | "Simple and fast"; removes ADR-0017's moving parts. | Keep hybrid election (complexity without a login to protect). |

## 🗺️ Gates (defer-hardware / live checks)

- **G1** Projector tab can open `wss://<relay>` on a Forge v14 private game and on self-hosted
  v13/v14 (built-in check in the pairing dialog: "Relay ✓/✗").
- **G2** Store/private build: whitelist spelling (`https://` + `wss://`), camera QR decode on
  iOS + Android, credentials survive kill + 5-minute lock (Beta build).
- **G3** Durable Object real cost per session (GB-s + requests) after the first real session.
