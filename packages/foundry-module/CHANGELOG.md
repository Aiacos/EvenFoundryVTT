# @evf/foundry-module

## 0.2.0

### Minor Changes

- 31bfecf: Add a module-version beacon so an operator can see which module build each connected
  Foundry client is actually running (stale browser cache vs current). The tool-invocation
  poller tags its drain GET with `&mv=<module version>` (resolved live from
  `game.modules.get('evenfoundryvtt').version`); the bridge ignores the param for draining
  but logs it once per client on change (`EVF client module version beacon`). Because it's
  an ordinary query param, the running module version is visible in the bridge's request
  access log even before the bridge itself is updated.
- c6ce597: Add a write-path debug-trace beacon for autonomous, browserless diagnosis of write tools.
  The module records a short trace label at each write-path stage (`#<n>:<tool>:handler:pending`,
  cast-spell additionally marks `…:activity.use:pending`/`:returned`) plus a one-shot runtime
  env summary (`fvtt/sys/midi/socketlib/gm`); the tool poller appends both to its drain GET as
  `&dbg=`/`&env=`. Because they're ordinary query params they appear verbatim in the bridge
  request access log even before the bridge is updated, and the bridge now also logs them on
  change (`EVF client debug beacon`). The LAST `dbg` before the poll log goes quiet pinpoints
  exactly where a handler hung — e.g. a frozen `cast-spell:activity.use:pending` proves the
  dnd5e `activity.use` call itself never resolved (likely a MidiQOL/usage prompt), not the
  audit log or the bridge.
- 96d2022: Add frame_png wire format (greyscale lossless PNG ~1-5KB vs 427KB RGBA) for the map stream: new FramePngSchema in shared-protocol, DM-configurable captureIntervalMs + leading+trailing hook throttle + identical-frame hash-skip + PNG encode in foundry-module v0.1.15, frame_png decode in g2-app (frame_pixels back-compat retained).
- e17065e: Layout B — full-screen 576×288 map: 4 image tiles of 288×144 (SDK verbatim max, INV-2 drift corrected from 200×100) cover the entire G2 display; the extractor emits 576×288 frames; status/fps move into a translucent raster corner card (top-right) drawn over the map; the native hud-status container is removed (the host renders image containers over text).
- a823240: Phase-8 write channel + skill-check tool, end-to-end.

  The bridge could receive `tool.invoke` envelopes but had no way to execute write
  tools in Foundry (it cannot use socketlib; the only bridge↔Foundry channel was the
  one-way module → `/internal/delta` POST). This adds a poll-based REVERSE channel that
  mirrors the player-view stream-request pattern:

  - **bridge**: a new in-memory `ToolInvocationQueue` (`enqueue`/`drainPending`/`resolveResult`
    with a 10s `foundry_timeout`) and two internal-secret-guarded, rate-limit-exempt
    routes — `GET /internal/tool-requests` (drain pending) and `POST /internal/tool-result`
    (resolve the awaiting promise). The production WS dispatch now enqueues on this queue
    (the test override is preserved).
  - **foundry-module**: a GM-gated `tool-invocation-poller` (≈1s cadence, fault-tolerant)
    polls the bridge, dispatches each write, and POSTs the result back. The ADR-0014
    per-actor write authorization was extracted into a single shared
    `dispatchToolAuthorized` used by BOTH the socketlib adapter and the new poller, so
    both channels enforce identical authorization. No new socketlib handler is added
    (the `socket.register` count stays 17).
  - **skill-check tool**: new `skill-check` write tool — `actor.rollSkill({ skill,
advantage, disadvantage })` (dnd5e 5.x config-object API). Added to the shared
    `TOOL_ID_SCHEMA`, the module `ToolId`/`TOOL_HANDLER_IDS`, and a new handler.
  - **g2-app**: a new interactive canvas Skills panel (Quick Action `[K]`) that, on tap,
    dispatches a `skill-check` `tool.invoke` directly (no ActionOptions modal), plus the
    `[K]` menu item, icon, and `quick_item_skills` i18n key (IT/EN/DE).

- 3a72953: Player-owned write execution (ADR-0011 Amendment 2): write tools (skill-check,
  attack, spell, use-item) now execute on the OWNING user's client — a player rolls
  their own actor's actions without a GM online. The bridge tags each queued
  invocation with the bearer's bound Foundry user and serves `GET
/internal/tool-requests?userId=<id>`; each client's poller drains only its own
  user's invocations. The per-actor write authz (dispatchToolAuthorized, ADR-0014)
  is unchanged. Removes the previous GM-only gate on the poller.
- 74a0e37: Self-service device pairing: every Foundry user can now mint their OWN G2 bearer
  token, bound to their own authenticated identity, without the GM doing anything
  manually. The pair menu is no longer GM-restricted (`pairDevice` `restricted:
false`) and the user-picker dropdown is removed — you can only pair your own
  device.

  Secure by construction (ADR-0014): the bound userId is authenticated, never
  client-asserted. A user writes a `pendingPair` flag (with a client-generated
  token) on their OWN `User` document — only that user can write their own user
  flags — and a GM client auto-ingests it into the world-scope bearer registry,
  binding the token to the user the flag belongs to (taken from the User document,
  never from the payload), then pushes it to the bridge. socketlib's `executeAsGM`
  is deliberately NOT used here because it cannot authenticate the caller (which
  would let a player bind a token to another user and read their character). No new
  socketlib handler is added (handler count stays 17).

  New: `ingestBearer` in bearer-registry (the GM-side write half; idempotent, 60s
  refresh grace) and `self-pair-ingestion.ts` (the `updateUser` hook + `ready`
  sweep). Note: finalizing a token requires a GM client to be online (world-scope
  registry writes are GM-only) — but it is auto-ingested with no manual GM action.

### Patch Changes

- d2e6df4: Add a dedicated EVF — Bridge Configuration dialog that pre-loads, displays, validates and reliably persists the bridge URL + internal secret; demote the two settings to config:false (managed solely via the dialog).
- b385bf8: Combat snapshots now carry each combatant's **token UUID** (`tokenUuid`, e.g.
  `Scene.X.Token.Y`) read from `combatant.token?.uuid`. The combatant `id` is the
  Combatant document id, NOT a token UUID, so the glasses target picker — which forwards
  the selected target into MidiQOL's `midiOptions.targetUuids` — was passing a value
  MidiQOL could not resolve, silently producing no attack/cast on the chosen token (only
  the EVF Audit card appeared). `CombatantSchema` gains an optional+nullable `tokenUuid`
  field (back-compat with pre-tokenUuid module builds) and the combat reader emits it.
- a705477: Canvas-mode full-screen streamed map + hud-status native container (quick-task 260610-d42)

  - canvas-extractor: continuous ~1Hz interval capture + canvasPan hook replaces one-shot request model
  - MapCanvasLayer at z=0: full-screen Foundry viewport stream routed from scene-input in canvas mode, replacing the legacy RasterController scene path
  - hud-status native G2 text container (id=5): status line (PF/CA/LV) pushed via bridge.textContainerUpgrade on each character.delta; opaque full-frame fill removed so z=0 map shows through
  - canvas-mode root double-tap exit restored: root-exit-dispatcher now fires on getTopLayer()===null (both canvas and glyph modes)

- 184f172: Fix every write-path handler that called `activity.use({ configure: false, ... })`
  with the dialog-suppression flag in the WRONG (usage) argument. dnd5e 5.x
  `Activity#use(usage, dialog, message)` reads `configure` from the **dialog (2nd)**
  argument and defaults it to `true` (INV-2: foundryvtt/dnd5e
  `module/documents/activity/mixin.mjs` — `if (dialogConfig.configure && …)`), so the
  configuration dialog stayed enabled and `activity.use` awaited a dialog no one can
  answer from the glasses → every spell cast / item use / attack hung until the
  bridge's 10s `foundry_timeout`. Verified live in the EvenHub simulator: cast-spell
  timed out at exactly 10s; skill-check (which already used the 2nd arg) worked.

  Corrected `cast-spell`, `use-item`, `cast-shield`, `cast-counterspell`,
  `weapon-attack`, and `opportunity-attack` to `use(usage, { configure: false }[, message])`
  (opportunity-attack's `opportunityAttack` chat flag moved to its proper message arg).
  Widened the `Activity#use` type to the real 3-arg signature. Tests updated to assert
  the corrected call shape (regression).

- fbb9f83: Stop the audit-log write from stalling tool dispatch. `dispatchTool` awaits
  `writeAuditLog` before returning its result (and, on the poll path, before POSTing
  the result back to the bridge). On a player/headless executor `ChatMessage.create`
  can hang indefinitely — observed live: a skill roll executed (its card appeared in
  Foundry) yet the bridge still hit its 10s `foundry_timeout` because the audit write
  never resolved. `writeAuditLog` now bounds the create with `AUDIT_WRITE_TIMEOUT_MS`
  (2.5s, well under the bridge's 10s), so a hung audit write resolves best-effort
  instead of stalling the action and the bridge queue slot. Regression test added.
- 3368eab: `canvas-extractor` now fit-downscales the WHOLE Foundry scene (box-average, aspect preserved, letterboxed) onto the canonical 400×200 frame instead of center-cropping a 400×200 window (~4% of a 1920×1080 render). Pure-JS filter — no OffscreenCanvas dependency; 1920×1080 → 400×200 in ~18 ms. Live-sim verified with the production extractor: full battlemap (3 rooms, corridor, water, columns, tokens) renders on the glasses.
- edae764: Fix the scene-frame pipeline dimension contradiction that made every `frame_pixels` payload un-processable: `FramePixelsSchema` capped frames at 288×144 (pre-ADR-0013 SDK-polyfill bound) while `raster-worker.ts` rejects anything that is not the canonical 400×200 raster region. Schema bounds now admit 20–400 × 20–200; `canvas-extractor` always emits exactly 400×200 (center-crop + opaque-black letterbox, pure byte copy); `scene-input` center-pads undersized frames to the canonical region as consumer-side defence. Live-sim verified: a real 400×200 scene frame now dithers and renders on the glasses end-to-end.
- ce30808: fix(foundry-module): use the real socketlib registerModule/register API and register socketlib handlers on socketlib.ready, decoupled from the Foundry ready hook so the /internal/delta push readers always register — restores real Forge pairing.
- 0ce4322: Stop reading the deprecated dnd5e `SpellData#preparation.{mode,prepared}` getters
  in `extractSpellbook` (they logged a compatibility-warning flood on every
  character snapshot for any spellcaster on dnd5e 5.1+). Now read the new top-level
  `SpellData#method` / `SpellData#prepared` fields, falling back to the legacy
  `preparation` object only for dnd5e < 5.1. No behavior change to the emitted
  spellbook; removes the console-warning spam.
- 448a56c: Fix character snapshots being silently dropped for any actor with no temporary HP.
  dnd5e leaves `hp.temp` as `null` (not 0) when there is no temp HP; character-reader
  passed it through as `tempHp: null`, failing the bridge's `CharacterSnapshotSchema`
  (`tempHp: number().nonnegative()`). The bridge still 200s the `/internal/delta` POST
  but never caches the snapshot → `GET /v1/character/:id` 404 → empty glasses sheet.
  Coerced to 0.
- ff60e90: fix(foundry-module): capture viewport instead of whole stage in canvas-extractor — fixes row-stride frame corruption on Forge; add fail-loud byte-length guard with resolution inference
- a6c8fc8: Latency-audit follow-up: residual fps fixes + map brightness + bidirectional display-settings sync.

  **Performance (residual latency removed):**

  - foundry-module: the capture loop no longer awaits the native encode — `runEncodeJob` is fire-and-forget behind the single-flight latest-wins queue, so the loop re-arms after acquire+process only (the encode genuinely overlaps the next capture). Raises the producer ceiling well past 30 fps.
  - foundry-module: lossy WebP wire format via `OffscreenCanvas.convertToBlob` (new `mapWebpQuality` world setting, default 75) — ~4–7× smaller than PNG, cutting the per-hop bandwidth from ~22 to ~4 Mbit/s at 30 fps. Transparent PNG fallback on hosts without WebP encoding.
  - foundry-module: the `/internal/delta` frame POST is now single-flight latest-wins with a 5 s `AbortSignal.timeout`, so a slow WAN can no longer accumulate unbounded in-flight requests.
  - bridge: frame deltas (`frame_png`/`frame_pixels`/`frame_stats`) are excluded from the replay buffer (no ~160 MB/session growth, no stale-frame replay burst on reconnect) and reuse the current seq (gap detection stays correct). Per-session `bufferedAmount` backpressure drops frames for a saturated client instead of queuing unbounded.
  - g2-app: the HudDeltaDriver throttle (33 ms ≈ 30 fps cap) is now configurable per boot via `BootEngineOpts.hudMinIntervalMs` / `?hudms=` for lab tuning.

  **Map brightness:** new `mapBrightness` client setting (−100..+100 luma gain) applied module-side before the 16-level quantize, with on-glasses `[+]`/`[-]` Quick Action menu rows.

  **Bidirectional display-settings sync:** the five map settings (dither, brightness, WebP quality, capture fps, contrast-normalize) stay in sync between Foundry and the glasses and are controllable from both. Downstream over a new `settings.display` delta (cached by the bridge, pushed on connect); upstream over a `client_setting` WS message that the bridge piggybacks on the module's next frame-POST response (no new connection / no polling — the module is push-only). New `@evf/shared-protocol` payload `settings-display.ts`.

- be5167e: Lower the default `captureFps` 30 → **5** (the spec's committed frame-rate target,
  Specs.md §7.4b.6.1) for real-glasses performance. 30 fps was tuned for the dev simulator
  (powerful CPU, no real BLE); on physical G2 it floods the phone→glasses BLE link
  (~540 KB/s vs ~25 KB/s sustained) and the phone's per-frame canvas/raster decode, causing
  HUD lag. 5 fps keeps the map glanceable with BLE + CPU headroom; the identical-frame skip
  means a static map still costs ~0, so the cap only bounds the burst during map motion.
  DMs with spare bandwidth can raise it live (1–60) in the module settings. Bumps the
  Foundry module to v0.1.55.
- f86a48f: render-to-texture viewport capture fixes idle all-zero map frames on the real Forge client (no-arg framebuffer read was only valid during the render pass)
- a5a7406: Add map contrast normalization client setting: auto-stretch dark scenes for readable contrast on the G2 glasses before dithering.
- e8233b8: Floor fractional renderer.screen dims before RenderTexture.create — at devicePixelRatio 1.333 Foundry reports e.g. 2348.25×824.25; PIXI floors the texture internally, so the fractional expected-length check rejected EVERY frame ("pixel buffer length mismatch"). Live-verified root cause on the real Forge client (2026-06-10).
- df66691: fix(pairing): install via Even Hub + paste token (remove unrealizable QR-scan path)

  The previous design assumed the player would scan the Foundry PairModal QR with the Even
  Realities app. This is impossible: the Even Hub platform exposes no camera / QR-scan API to
  apps (canonical `hub.evenrealities.com/docs/guides/device-apis`: "no camera (there is none)"),
  the app runs in the phone WebView, and the PairModal hid the token from text so the DM could
  not hand it over either.

  Real flow: install the EVF app via Even Hub (dev `evenhub qr` loads the plugin-host URL into
  the Even app; prod `.ehpk` → portal review → store), then open the app → wizard → enter the
  bridge URL + **paste** the token shown in the Foundry PairModal → pick a character.

  - `@evf/foundry-module` PairModal: removed QR generation (dropped the `qrcode` dependency),
    now renders the bridge URL + bearer token as copyable text. The token is masked by default
    with a Reveal/Copy control (scoped security relaxation — pairing is otherwise impossible).
    i18n realigned: removed `evf.pair.qr.scan_instruction`, added `evf.pair.copy.*` (IT + EN).
  - `@evf/g2-app` wizard step 2: removed the dead QR-scan path (`hub.camera`, `_probeCameraApi`,
    `evf.wizard.step2.scan_qr_btn`) per INV-4; the `hub.camera` type and polyfill field are gone.
    Paste-from-clipboard + manual entry + the `/v1/health` connect check are unchanged.

- 0038f94: Wire push-based bridge↔Foundry bearer-registry + character-list path enabling real pairing.

  Adds two new push envelopes (`r1.bearers.available`, `r1.characters.available`) that the Foundry
  module emits on `ready` and on bearer/actor lifecycle events. The bridge caches both and uses
  them to validate bearer tokens (`GET /v1/health`) and serve the player-character roster
  (`GET /v1/characters`) without a socketlib roundtrip. `buildServer({})` now works with NO
  options — real token validation and character listing are wired internally.

  Security: bearer tokens are pushed over the EVF_INTERNAL_SECRET-gated /internal/delta channel
  (homelab trust model). Tokens are Zod-validated at the handler boundary before cache write and
  never logged (T-RFP-01 / T-RFP-02). A never-pushed cache returns `foundry_unreachable` (503)
  distinguishable from `unknown_token` (401) — T-RFP-03.

- 7f37b5f: Release CD now version-stamps the Foundry esmodule filename
  (`dist/module.js` → `dist/module-<version>.js`) and points `module.json` `esmodules`
  at it. The entry-point URL was stable across releases, so a CDN/browser HTTP cache
  keyed on `modules/evenfoundryvtt/dist/module.js` kept serving the OLD bundle even
  after `module.json`'s version bumped — Foundry reported the new version while still
  executing stale code (v0.1.49 spell casts kept hanging with the pre-fix handler
  despite the fix shipping in the artifact). A per-version filename guarantees a unique
  URL no cache can serve stale. The committed `module.json` keeps `dist/module.js` for
  local dev; the rename happens only in the release artifact.
- c854bf0: Wire DM-editable bridgeUrl + bridgeInternalSecret world settings so real Forge pairing pushes authenticate against the bridge's static EVF_INTERNAL_SECRET (settings preferred, bearer-entry fallback).
- Updated dependencies [b385bf8]
- Updated dependencies [8c4c5e3]
- Updated dependencies [edae764]
- Updated dependencies [96d2022]
- Updated dependencies [2d5a35b]
- Updated dependencies [a6c8fc8]
- Updated dependencies [e17065e]
- Updated dependencies [a823240]
- Updated dependencies [0038f94]
  - @evf/shared-protocol@0.3.0

## 0.1.47

### Patch Changes

- Tokens no longer expire — campaign-long bearers (operator request). The 24h TTL is
  what made yesterday's token expire mid-session. New bearers (GM-direct, GM-ingested, or
  a player's self-service flag) are now minted with a far-future sentinel `expiresAt`
  (`NO_EXPIRY_MS`), so every `expiresAt > now` validation/push check treats them as
  never-expiring with no special-casing. Crucially, the rotation scheduler no longer
  rotates a non-expiring bearer (rotating it would change the token the player already
  pasted, defeating the purpose). The pair modal shows "Never expires (campaign-long)"
  with no countdown instead of a TTL. Legacy finite tokens still validate/rotate normally
  until they age out.

## 0.1.46

### Patch Changes

- A non-GM PLAYER can now pair and roll STANDALONE — no GM client required — and the
  pairing modal is fixed. The old model wrote a per-user `pendingPair` flag that a GM
  client had to ingest into the world `bearerRegistry`; a player alone (no GM online)
  was stranded — the token never reached the registry/bridge, so `boundUserId` was null
  and every skill check / attack / spell timed out. But a non-GM literally cannot write
  the world registry, so "pair as GM" was the only workaround — exactly what a player
  doesn't want.
  - **The `pendingPair` flag is now a first-class, self-authenticated bearer.** Only the
    owning user can write their own flag, so the token→user binding is trustworthy
    without a GM. `validateBearer` and `readBearerRegistry` (the bridge push) both
    resolve flag tokens, deduped registry-first, so a player's token routes + authorizes
    immediately. The module re-emits on `updateUser` so a mint reaches the bridge at once.
    A GM that later ingests the flag simply upgrades it to the persistent registry.
  - **PairModal fixes (from the user's screenshot):** the flag shows as a live `active`
    device with a real `createdAt+24h` countdown (no more "Awaiting connection…" / the
    literal "{time}" placeholder / "No devices paired" shown beside a token). Revoking a
    player device deletes the user's own flag via `unsetFlag` (works without GM, updates
    live — fixes "revoke only works after reopening"). The reveal toggle now flips inline
    `display` instead of a `.evf-hidden` CSS class that did nothing (the module ships no
    stylesheet) — so the access-token field no longer shows the masked dots AND the plain
    token at the same time.

## 0.1.45

### Patch Changes

- Pairing workflow rework — fixes "the generated token never works" and "the modal
  doesn't update dynamically".
  - **GM generates DIRECTLY into the registry.** Previously the PairModal ALWAYS wrote a
    per-user `pendingPair` flag (even for a GM), which then had to be ingested by a GM
    client to reach the world `bearerRegistry`. For an operator who IS the GM but plays
    on a non-GM user — or any setup where no GM client ingests — the token stayed a flag,
    never reached `listBearers()` / the bridge, and the glasses tap timed out
    (`boundUserId` null). Now a GM mint calls `generateBearer` directly → the token is a
    LIVE registry bearer immediately; only a genuine non-GM player uses the flag path.
  - **Modal auto-updates on registry change.** The open PairModal now listens for the
    `bearerRegistry` setting change and re-renders, so a non-GM's `pairing-in-progress`
    flips to `active` the instant a GM ingests it, and revokes/rotations reflect live —
    no more close-and-reopen.
  - **Registry changes re-emit to the bridge at once.** A new `updateSetting` hook
    re-pushes the bearer registry whenever it changes (generate / ingest / revoke /
    rotate), so a freshly-generated token is recognised within one round-trip instead of
    waiting up to a full heartbeat. Also defaults a first pairing's alias to a non-empty
    `'G2'` (empty aliases otherwise fail the bridge schema and drop the whole push).

## 0.1.44

### Patch Changes

- (g2-app) WS reconnect no longer strands the outbound channel — fixes the glasses tap
  silently failing to reach Foundry after any WS drop (e.g. a bridge restart). The
  reconnect path called `performCapabilityHandshake` on a freshly-created socket that was
  still in CONNECTING; the handshake `.send()`s immediately and throws on a non-OPEN
  socket, so every reconnect attempt failed, the bridge idle-timed-out the connection
  (close 4400), the backoff looped forever, and the `WsSender` was never swapped onto a
  live socket — so `tool.invoke` writes (skill check / attack / spell) vanished until a
  full app reload. The reconnect now awaits the socket's `open` before handshaking
  (mirroring boot's `awaitWsOpen`), so it reconnects cleanly, swaps the sender, and taps
  reach Foundry again. Verified live: after a bridge restart the sim re-handshakes with
  zero idle timeouts and a tapped skill's `tool.invoke` is received by the bridge.

## 0.1.43

### Patch Changes

- Skill rolls now actually fire in Foundry (three real bugs fixed end-to-end):
  - **Bearer-registry poisoning → routing dead for non-GM players.** A self-minted
    bearer may carry an empty `alias`, but the bridge's `BearerRegistryEntrySchema`
    requires `alias` min(1); since `bearers` is an array, ONE empty-alias entry failed
    the WHOLE snapshot's validation and the bridge silently dropped the entire registry
    push. With an empty bearer cache the bridge resolved `tool.invoke` `boundUserId` to
    null, so a non-GM player's owner-scoped poll never drained their own skill check /
    attack / spell (and there is no GM-fallback for a non-GM). The reader now coerces an
    empty/missing alias to a placeholder before emitting (alias is a display-only label),
    and the bridge handler defensively does the same — one unlabeled bearer can no longer
    strand routing for everyone.
  - **Skill roll blocked on a configuration dialog.** `skill-check` called
    `actor.rollSkill({...})` without suppressing the dnd5e roll-config dialog. Driven
    headlessly by the poller, that dialog never gets confirmed, the awaiting bridge
    Promise times out, and the glasses tap appears to do nothing. Now passes
    `dialog: { configure: false }` to fast-forward (matching how every `activity.use()`
    handler already suppresses its dialog).
  - (g2-app) **Skills panel didn't scroll.** The canvas Abilità list rendered all 18
    skills from the top with no windowing, so the cursor and every skill past the 9th
    scrolled off-screen and were unreachable. It now windows to follow the cursor and
    clamps down-scroll at the last skill (inventory/spellbook already windowed correctly).

## 0.1.42

### Patch Changes

- Bridge-restart self-heal (fixes a non-GM player being stranded after a bridge
  restart). Two bridge caches only repopulate on discrete events and go cold when the
  bridge (re)starts after a client's `ready`: the bearer registry (re-pushed on
  ready / bearer change / self-pair) and the per-actor character snapshot (pushed only
  on `updateActor`). A cold bearer cache makes `tool.invoke` routing resolve
  `boundUserId` to null — and since a non-GM has no GM-fallback drain, their own skill
  check / attack / spell silently times out; a cold snapshot cache leaves the glasses
  sheet / skills panel empty, so an interactive tap no-ops. A new leader-gated
  heartbeat (same cadence as the existing settings/roster heartbeats) re-emits BOTH the
  bearer registry and every player character's full snapshot, so a bridge restart
  self-heals within ~10s with no Foundry reload and no actor "nudge". Best-effort;
  never throws into the timer.

## 0.1.41

### Patch Changes

- Write channel resilience: the tool-invocation poller now performs a GM-fallback
  unfiltered drain in addition to the owner-scoped poll. When the bridge cannot route
  a queued write to a bound user — `boundUserId === null`, e.g. its bearer-registry
  cache went cold after a restart (the registry is only pushed on Foundry `ready`) —
  the request previously sat unrouted until it timed out, so skill checks / attacks /
  spells silently did nothing. A GM client now also drains the unfiltered slice and
  executes those orphaned (and genuinely global) requests. This is ADR-0014-safe: the
  per-actor write authz (`dispatchToolAuthorized` → `validateBearer` against Foundry's
  authoritative local registry) still gates execution by the request's own bearer, so a
  GM executing here cannot act as an actor the bearer does not own.

## 0.1.40

### Minor Changes

- Player-owned write execution (ADR-0011 Amendment 2): the tool-invocation poller
  is no longer GM-gated. Each client polls for ITS OWN user's invocations
  (`GET /internal/tool-requests?userId=<game.user.id>`) and executes them, so a
  PLAYER rolls their own actor's skill check / attack / spell **without a GM
  online**. The bridge routes each queued write to the bearer's bound user; the
  per-actor write authz (ADR-0014) is unchanged (the acting actor must be owned by
  the bearer's user, and the executing client IS that user).

## 0.1.39

### Minor Changes

- Phase-8 write channel: write tools now actually EXECUTE in Foundry. Previously
  the bridge could not reach Foundry for writes (its dispatch was a stub), so
  `tool.invoke` envelopes (cast-spell / use-item / skill-check) were dropped. A
  GM-gated poller now drains the bridge's tool-invocation queue
  (`GET /internal/tool-requests`), runs each invocation through the authoritative
  write path, and POSTs the result back (`POST /internal/tool-result`). Per-actor
  write authorization (ADR-0014) is enforced by a single shared
  `dispatchToolAuthorized` gate used by BOTH the socketlib adapter and the new
  poller — the acting `actor_id` must be owned by the bearer's bound user. No new
  socketlib handler (count stays 17). Requires a GM client online (ADR-0011).

### Patch Changes

- New `skill-check` write tool: rolls a skill check via `actor.rollSkill(...)` (as
  if clicking the skill button on the Foundry sheet). Wired to the g2-app
  interactive Skill panel + Quick Action `[K]` entry.
- Stop reading the deprecated dnd5e `SpellData#preparation.{mode,prepared}` getters
  in `extractSpellbook` (read `system.method`/`system.prepared` on 5.1+; fall back
  to `preparation` only for < 5.1). Removes the per-spell deprecation-warning flood.

## 0.1.38

### Patch Changes

- Fix: character snapshots were silently dropped by the bridge for any actor with
  NO temporary HP. dnd5e leaves `actor.system.attributes.hp.temp` as `null` (not 0)
  when there is no temp HP; character-reader passed it straight through as
  `tempHp: null`, which fails the bridge's `CharacterSnapshotSchema`
  (`tempHp: number().nonnegative()`). The bridge still answers `200` to the
  `/internal/delta` POST but never caches the snapshot, so `GET /v1/character/:id`
  returns `404` and the glasses sheet/HUD stay empty. Now coerced to `0`. The
  "active" character (whose temp HP is often set) worked, masking the bug.

## 0.1.37

### Patch Changes

- PairModal UX: the "active" pairing state now shows an explicit **"Generate new
  token"** button (mints a fresh bearer bound to the current user). Previously the
  active state offered only "Revoke", so there was no obvious way to re-pair or
  rotate without first revoking — confusing. Removed the now-dead
  `evf.pair.user.select_label` i18n string left over from the user-picker dropdown.

## 0.1.36

### Minor Changes

- Self-service device pairing: every Foundry user can mint their OWN G2 bearer
  token, bound to their own authenticated identity, with no manual GM action. The
  pair menu is no longer GM-restricted and the user-picker dropdown is removed —
  you pair only your own device. Secure by construction (ADR-0014): a user writes
  a `pendingPair` flag (carrying a client-generated token) on their OWN User
  document — only that user can write their own user flags — and a GM client
  auto-ingests it into the world-scope bearer registry, binding the token to the
  user the flag belongs to (never a client-asserted id), then pushes it to the
  bridge. socketlib is deliberately NOT used (it cannot authenticate the caller).
  No new socketlib handler (count stays 17). A GM client must be online to
  finalize a token (auto-ingested; world-scope writes are GM-only).

## 0.1.35

### Minor Changes

- ADR-0015 §C browser-capture: show a player's REAL view by capturing from their
  already-open Foundry browser — no headless re-login (which The Forge blocks by
  binding a session to its account's user). The module now polls the bridge
  (`/internal/stream-request`) for the requested actor and elects the actor's
  ACTIVE, CONSENTING, NON-GM owner as the stream leader; that client captures its
  own vision/fog/lighting directly. If no consenting owner is online, the default
  GM-wins election still applies (the map is never blank). Pairs with the bridge's
  `EVF_PLAYER_VIEW_HEADLESS=0` default (headless becomes a self-hosted-only fallback).

## 0.1.34

### Patch Changes

- ADR-0015 §C (BUG-4): roster heartbeat. The character-list reader emitted
  `r1.characters.available` only on `ready` + actor CRUD hooks, so after a bridge
  (re)start or stream-leadership migration the bridge `CharacterListCache` went
  cold until an actor changed — breaking the g2-app PC selector (`GET /v1/characters`)
  and the actor player-view (`actorId → userName` resolution → `unavailable`). The
  stream leader now re-publishes the roster on the same 10s cadence as the
  display-settings heartbeat, keeping the cache warm. Leader-gated; best-effort.

## 0.1.15

### Minor Changes

- Quick Task 260611-e71: frame_png wire format — greyscale lossless PNG (~1-5 KB vs ~884 KB RGBA).
  - `canvas-extractor.ts` now emits ONLY `frame_png` envelopes (never `frame_pixels`).
  - PNG encode via `UPNG.encode([rgbaLuma.buffer], w, h, 0, undefined, true)` (ctype=2 RGB, exact luma roundtrip, ~100–700× smaller than frame_pixels).
  - Identical-frame skip: FNV-1a 32-bit luma hash — no POST when content unchanged.
  - Leading+trailing hook throttle (THROTTLE_MS=200 ms): continuous canvasPan emits ~5 fps.
  - Live `captureIntervalMs` world setting (default 250 ms, range 100–5000 ms, step 50 ms) via TICK_MS=100 ms poll — DM can change cadence without module reload.

## 0.1.4

### Patch Changes

- e5b4a3f: Fix the "Pair Device" dialog crashing on Foundry v13+ with _"PairModal … is not renderable
  because it does not implement \_renderHTML and \_replaceHTML"_. `PairModal` mixed v1 `Application`
  patterns (`defaultOptions.template`, `getData`, `_activateListeners`) onto the abstract
  `ApplicationV2` base. Converted it to the real v13 API: `HandlebarsApplicationMixin(ApplicationV2)`
  - `static DEFAULT_OPTIONS`/`PARTS`, `_prepareContext()`, `_onRender()` (reads `this.element`),
    and `render({ force: true })`. The hand-rolled `foundry.applications.api` type declaration gained
    `HandlebarsApplicationMixin` + the v13 ApplicationV2 surface.

## 0.1.3

### Patch Changes

- 68deaf8: Distribution re-release: bundle the updated g2-app (Even Hub app icon + manifest `description` +
  dev-mode docs) into the release assets. No module source change — the foundry-module release is the
  distribution anchor that re-packages `g2-app-dist.zip` + the submission-ready `evenfoundryvtt.ehpk`
  (now carrying the icon + description) and attaches them to the GitHub Release.

## 0.1.2

### Patch Changes

- 2ac3fbd: Add `readme`, `manual`, `bugs`, and `changelog` links to `module.json` so the Foundry
  package listing surfaces the GitHub README, the showcase guide
  (`https://aiacos.github.io/EvenFoundryVTT/showcase/`), the issue tracker, and the
  releases changelog. (CI-only, no package change: the tagged-release CD now also packs
  and attaches the submission-ready Even Hub `evenfoundryvtt.ehpk` as a permanent GitHub
  Release asset, and `release.yml` gains `actions: write` so the tagged release auto-builds
  without a manual `workflow_dispatch`.)

## 0.1.1

### Patch Changes

- Updated dependencies [36aea7f]
  - @evf/shared-protocol@0.2.0

## 0.1.0

### Minor Changes

- 498c01f: Phase 2 Wave 0: module skeleton, module.json, settings panel, locale catalogs (EN + IT).

  Bootstraps `packages/foundry-module` from placeholder to a buildable Foundry module:

  - `module.json` with relationships.requires (socketlib, midi-qol, dnd5e), socket:true
  - tsup ESM build pipeline → `dist/module.js`
  - `src/module.ts`: MODULE_ID export, Hooks.once("init") bootstrap
  - `src/settings.ts`: registerSettings(), PairModalStub, detectedLocale (I18N-01)
  - `lang/en.json` + `lang/it.json`: 24 UI-A i18n keys (evf.pair._ + evf.settings._)
  - 10 unit tests, coverage ≥80%

- 7f5d0d1: Phase 2 Plan 05: Reader API + Foundry hooks + delta emitter

  - **@evf/shared-protocol**: Add Zod `strictObject` payload schemas for `CharacterSnapshot`, `CombatSnapshot`, `SceneViewport`, `EventLogEntry`, and `EventLogResponse`; re-export all from package index
  - **@evf/foundry-module**: Add `RingBuffer<T>` (200-entry, oldest-evict), character/combat/scene/event-log readers, `registerHookSubscribers()` for 5 Foundry hooks (updateActor, updateCombat, canvasReady, controlToken, createChatMessage, targetToken), `bridgeDeltaEmitter` fire-and-forget POST to bridge `/internal/delta`, extended socketlib GM handlers for all 5 snapshot reads
  - **@evf/bridge**: Add REST routes `GET /v1/character/:actorId`, `GET /v1/combat/current`, `GET /v1/scene/viewport`, `GET /v1/events`, `GET /v1/characters`; `POST /internal/delta` (EVF_INTERNAL_SECRET auth); `DeltaEmitter` WS fanout with capability routing and replay buffer integration

### Patch Changes

- 6959c54: Implement ADR-0003 Tool Registry: 7 Zod-typed tools in @evf/shared-protocol (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets), GET /v1/tools returns full entries with Zod 4 native .toJSONSchema(), POST /v1/tools/:name dispatches via stub returning phase-07-pending (write path lands in Phase 07 per D-15). Foundry-module socketlib-handlers gains 7 stub registrations for Phase 07 wiring.
- b516ab6: Forward weapon-attack `advantage` + weapon/spell `targets` to the dnd5e workflow via `MidiQOL.completeActivityUse` when present; honest single `console.warn` (no behavior change, no double-roll) when MidiQOL is absent.

  FIX-B + FIX-C: both protocol fields previously passed Zod validation but reached a dead end — neither write-path handler read them, so they had zero effect on the actual roll. This wires them through a MidiQOL capability split:

  - **MidiQOL present** (`typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active`): `weapon-attack` forwards `midiOptions.targetUuids` + `advantage`/`disadvantage` (preserving the `i===0` Extra-Attack action economy and multi-attack progress emit); `cast-spell` forwards `midiOptions.targetUuids` merged with the spell slot override (concentration-conflict pre-check still runs first).
  - **MidiQOL absent**: behavior is byte-identical to today's `activity.use` — NO `rollAttack`, NO roll hook, NO `game.user.targets` mutation, no double-execution. A single honest `console.warn` surfaces that advantage/target auto-application requires MidiQOL.

  Backward-compat: `advantage='normal'` + empty `targets` is unchanged. No new public API surface — schema fields were already public; this only wires them into the workflow.

- 1f3f2bf: fix(foundry-module): combat-action-tracker reads `flags.evf.audit.tool` not `audit.toolId`

  The `createChatMessage` hook read `audit.toolId`, which `writeAuditLog`/`dispatchTool`
  never write (the real `AuditEntry` field is `tool`). The read was always `undefined`,
  short-circuiting before any action-economy `emit` — dead code per INV-4. Reading
  `audit.tool` (matching the sibling `action-result-watcher`) revives production
  action-economy tracking. Added a CAT-REGRESSION guard pinning the wire-shape field name.

- f44b008: Quick-task 260529-g0j: three source-verified write-path/dispatcher hardening fixes.

  - **FIX D** (`tool-registry.ts` `dispatchTool`): close the in-flight idempotency race. A module-scoped `Map<cacheKey, Promise<ToolResult>>` collapses truly-concurrent duplicate calls (same bearer + idempotencyKey, both cache-misses) to ONE `handler.handle`, ONE `moduleIdempotencyStore.set`, and ONE audit-log write; the second caller awaits the shared promise and receives the identical result. The entry is deleted in a `finally`, so only OVERLAPPING calls are deduped — a later sequential retry re-runs (preserving WR-01: failures are not cached and stay retryable). Cache-hit short-circuit and always-resolves-never-rejects semantics unchanged.
  - **FIX E** (`combat-movement-tracker.ts`): add a `deleteCombat` hook that clears `_state` + `_lastPosition` so stale `usedThisTurn` from an ended encounter cannot leak into a freshly created combat before its first turn-advance. Mirrors the existing defensive try/catch/never-return-false pattern; the unsubscribe closure now also `Hooks.off`s the deleteCombat hook.
  - **FIX F** (`reaction-prompt-dispatcher.ts` `handleClose`): add an early-return idempotency guard (`if (mountedPanel === null) return;`) so a late gesture after the 5s auto-timeout does not issue a redundant second destroy bundle. Mirrors the auto-timeout's existing `mountedPanel !== null` gate.

- c80d16f: Quick-task 260529-khy: codebase-review fixes — Tier 1 (R1/R2/R3) + Tier 3 hardening.

  **Wave 1 — R1 FULL WebSocket reconnect rewire (CRITICAL, g2-app):**
  After a WS reconnect, ALL functionality recovers (display + input + outbound
  action dispatch) AND repeated reconnects work.

  - BLOCKER 1 — repeated-reconnect close re-arm (`ws-reconnect.ts`): the controller
    tracks `currentWs` and re-arms its `'close'` listener on the new socket after each
    successful reconnect, so a second/third disconnect is detected (previously reconnect
    worked exactly once → permanent dark on the next drop). `dispose()` removes the
    listener from `currentWs`, not the original socket.
  - BLOCKER 2 — outbound + missed inbound (`ws-sender.ts`, `status-hud-layer.ts`,
    `boot-engine-core.ts`): new `WsSender` holder gives panels/probes a stable
    outbound-socket indirection (`send`/`swap`) structurally assignable to the narrow
    panel `{send}` interfaces, so a reconnect's `holder.swap(newWs)` redirects every
    outbound sender (perfProbe + SlotPicker + both ActionOptionsModal) with no panel
    churn. A new optional `onReconnected(newWs)` controller callback fires after resume
    (before chip-unmount on both resume paths); the boot handler swaps the holder +
    disposes-and-re-attaches all 7 inbound listeners against the live socket — including
    reaction-prompt + portrait (the two sources missed in the first rewire) — plus
    `StatusHudLayer.rebindWsEvents` for the 3 HUD channels.

  **Wave 2 — Tier 1 robustness:**

  - R2 (g2-app `raster-controller.ts`): a fatal worker error now settles ALL pending
    frames (and a debounced `pendingPayload`) with the existing `RasterResponse.error`
    shape, clears the map and logs — previously a worker crash left awaiting callers
    parked forever.
  - R3 (foundry-module `combat-action-tracker.ts`): subscribe `deleteCombat` (mirroring
    combat-movement-tracker FIX E) to clear `_state` + `_attackIdSeen` on combat removal;
    unsubscribe closure offs the new hook id. (Hooks.on, not a socketlib handler — CI
    Gate 8 socketlib count stays 17.)

  **Wave 3 — Tier 3 hardening:**

  - R-longpress (g2-app spellbook + inventory panels): long-press now resolves the item
    under the cursor ROW via a header-aware row→item map instead of indexing the flat
    array with the content-row scroll offset (which dispatched the wrong item after
    scrolling past a section header).
  - shared-protocol schema bounds: `d20` → `int().min(1).max(20).nullable()`; debug-events
    `id` `.min(1)`, `ts` (+ perf-sample) and layer-index `z` `.int()`.
  - foundry-mcp `spell-lookup.ts`: relocate mass-cure-wounds (level 5) into a dedicated L5
    grouping + fix block-count comments (SPELL_LOOKUP length stays 70, SKT-02 gate).
  - foundry-mcp `bridge-client.ts`: snapshot getters pass `null` default to `_restGet`
    (network failure → null, not undefined); `ws.onclose` early-returns on a pre-handshake
    close so it does not fall through to the 4001 / other-close branches.
  - foundry-module `character-reader.ts`: spell `range.value === 0` with a non-self/touch
    unit renders `--` (not `0m`).
  - validation-harness `inv-suite.ts`: INV-5 returns `skipped` (not green) when the COR-
    vitest run exits 0 with no matching tests ("no test files found").

  Backward compatible: `onReconnected` is optional; `WsSender`, `rebindWsEvents`,
  `worker.onerror`, the deleteCombat hook and the row→item maps are all additive; schema
  tightenings reject only previously-invalid values; the bridge-client null default makes
  the `… | null` return type honest.

- Updated dependencies [498c01f]
- Updated dependencies [0eaa5aa]
- Updated dependencies [7f5d0d1]
- Updated dependencies [a05f35e]
- Updated dependencies [6959c54]
- Updated dependencies [40d3a52]
- Updated dependencies [c80d16f]
  - @evf/shared-protocol@0.1.0
