# ADR-0015: Player-view map capture & live character/role selection

- **Status:** Proposed (2026-06-16; C design 2026-06-17) — (A) live in-app role selection **implemented**; (B) synthesized framing **implemented, defaulted OFF (lighting-incompatible)**; (C) headless player-view session **designed, EvenHub-toggle activated, phased build pending the AUTH decision**.
- **Relates to:** ADR-0001 (layered UI — z=0 map), ADR-0014 (bearer ↔ Foundry-user binding — the authorized actor set), [[map-auto-framing]], [[frame-post-depth2-pipeline]].
- **Driver:** user request 2026-06-16 — *"la mappa deve essere quella del PG selezionato (Shin), non per forza quella del GM"* and *"vorrei che si loggasse con il ruolo selezionato"*.

## Context

The map streamed to the glasses is a **screenshot of a rendered Foundry PIXI canvas**. That canvas exists **only inside a logged-in browser** — there is no server-side scene render. So *whose* view the glasses show is exactly *whose browser is captured*:

- Today the stream-leader is the **GM client** (`isStreamLeader()` elects the active GM, lowest id). → the glasses show the **GM's viewport with full fog reveal**, wherever the GM happens to be looking.
- The actor selected on the glasses (`?actor` / handshake `actorId`) only chooses which `character.delta` / status card is shown — it does **not** change the map source.

The user wants the map to reflect the **selected player character (Shin)** — ideally Shin's *real* view, including **Shin's fog-of-war / limited vision**. Shin's true fogged view exists only in a browser **logged in as Shin's Foundry user**; it cannot be reconstructed from the GM client without re-deriving per-token vision (deep, version-fragile — rejected for MVP).

A hard constraint from the user: *"al massimo il GM loggato"* — don't require every player to keep a browser open. This pushes any "real player view" toward an **automated/headless logged-in session**, not a human-per-player.

## Decision

Three increments, decoupled so value lands without the heavy part:

### (A) Live character/role selection from the EvenHub app — IMPLEMENTED (module v0.1.30)

The active character is selectable **live from the EvenHub app settings panel**, not only at pairing/handshake:

- New upstream WS message `client_select_actor { actorId }` (`shared-protocol`, strict, mirrors `client_setting`).
- Bridge `client-select-actor-handler` **re-authorizes** the requested `actorId` against the session bearer's owned-actor set (ADR-0014, fail-closed via `tokenCache.validate`), then updates `session.selectedActorId` and pushes the new actor's cached snapshot to that session.
- `session.selectedActorId` is the single pivot: it already drives `character.delta` filtering (`delta-emitter`) **and** the map-framing focus (`SessionStore.getFocusActorId` → frame-POST piggyback → module `_focusActorId`).
- g2-app `phone/settings-panel` gains a "Character / Role" `<select>` populated from `GET /v1/characters`; on change it sends `client_select_actor`.

### (B) Synthesized party-fit, focus-weighted framing on the GM client — IMPLEMENTED v0.1.29, DEFAULTED OFF v0.1.30 (lighting-incompatible)

Without a player session, the GM (leader) client synthesizes the framing: a world-rect containing all PC tokens, centered toward the selected actor, rendered to an off-screen RenderTexture without moving the GM camera. See [[map-auto-framing]]. This gives "all characters visible, Shin centered" **but not Shin's fog** (the GM sees all).

**Lighting-incompatibility (confirmed 2026-06-17, INV-2 — Foundry API + Mystler canvas-capture recipe).** Foundry's lighting/vision/fog are NOT scene geometry — they are **view-dependent post-process effects**: `EffectsCanvasGroup` *"modifies the result of the PrimaryCanvasGroup by adding lighting, vision, fog of war"* and `CanvasVisibility` *"consolidates multiple render textures and applies a filter"*, all computed into screen/scene-sized RenderTextures for the **live** view. The framing re-renders `canvas.stage` under a temporary pivot/scale **without** `canvas.pan()`, so the PrimaryCanvasGroup moves but the lighting/vision RTs stay aligned to the original view → **the lighting renders misaligned** (observed live: a bright illumination block offset from the map). The canonical capture recipe (Mystler gist) confirms the only correct way to capture a different view is `canvas.pan({x,y,scale})` (which recomputes the effects) then restore — but `pan` moves the GM's actual screen (flicker) and is async.

**Conclusion:** party-fit framing synthesized on the GM client is *fundamentally incompatible* with correct Foundry lighting. It ships **OFF by default** (v0.1.30); the live, correctly-lit GM viewport is the default capture. Correct framing **with** the player's own lighting/fog is precisely what increment (C) — the headless player session — delivers (a browser logged in as the player renders THEIR view with THEIR effects natively).

### (C) Real player view via a headless logged-in player session — IMPLEMENTED & VERIFIED live (2026-06-17, EvenHub-toggle activated)

To get the selected PC's **real fogged view** (their viewport + lighting + vision + fog), capture a browser **logged in as that player's Foundry user** — the only way Foundry renders those view-dependent effects correctly (see §B). Automated form: the bridge launches a **headless Chromium (Playwright)** that logs into the world as the selected player, loads the EvenFoundryVTT module, and becomes the stream-leader. Activated by an **EvenHub settings toggle**.

#### Components

1. **EvenHub toggle (g2-app phone settings panel)** — a new "Player view (headless)" switch. Enabled only when a Character/Role is selected and a Foundry URL is set. On change it sends the upstream control message `client_player_view { mode, actorId?, foundryUrl? }` (mode = `off`/`streaming`/`actor`); the bridge echoes a **status** (`off | starting | live | unavailable | error`) back to the panel. **No credentials ride here** — see the password-free credential model below.

2. **Bridge: headless-session orchestrator (new `packages/bridge/src/headless/`)** — owns the Playwright lifecycle:
   - On `enabled:true`: launch a headless Chromium (or reuse a warm one), `goto(foundryUrl)`, pass any Forge gate, complete Foundry `/join` as the selected player's user (auth — see below), wait for `canvas.ready`. The module (installed in the world) loads in this client.
   - On `enabled:false` / player change / glasses disconnect: tear down (or re-login as the new player).
   - Health: restart on crash (bounded retries), surface status. Single active session (the selected player) to bound RAM/CPU.

3. **Module: forced stream-leader (foundry-module)** — the headless client must win `isStreamLeader()` so ITS view (not the GM's) is captured. The bridge launches it with a marker (URL query param `?evfLeader=1`, read once at init into a module flag); a client with the marker forces `isStreamLeader()=true` and every other client (incl. the GM) yields when a marked client is active. This sidesteps the "focus-actor distribution" problem entirely — leadership is assigned by the orchestrator, not elected.

#### Data flow

```
EvenHub toggle ON (player = Shin)
  g2-app → client_player_view{enabled:true, actorId:Shin, foundryUrl} → bridge
  bridge → spawn Chromium → login as Shin's user @ foundryUrl (?evfLeader=1)
         → module loads, forced leader → captures Shin's REAL view (lighting+fog) → frame_png → bridge
  bridge → broadcast frames → glasses show Shin's real fogged view
  bridge → status:'live' → EvenHub panel
EvenHub toggle OFF → bridge tears down Chromium → back to GM-live capture (§B default)
```

#### Decisions (this design)
- **Runtime:** Chromium as a **sidecar in the bridge Docker compose** (no third-party service) — the user's stated preference. Needs **hardware** WebGL — see the P2c finding below: software GL (`swiftshader`/`llvmpipe`) is too slow to stream a real Foundry world.
- **Scope:** **one** headless session at a time = the actor selected in EvenHub (`client_select_actor`). Switching PC re-logins (seconds of lag) — acceptable for MVP vs one-Chromium-per-player (N× RAM).
- **Credentials:** held **only on the bridge** (env / mounted secret), never in the EvenHub app or git. The toggle triggers; the bridge authenticates.
- **Leadership:** orchestrator-assigned via `?evfLeader=1` marker (no socketlib focus distribution needed).

#### AUTH — decided 2026-06-17: **The Forge gate (c)**
The game URL gates behind a **Forge account login** before Foundry `/join`. The orchestrator authenticates to **The Forge**, then The Forge routes into the world as the authenticated account's Foundry user (the join screen carries a single matching user — the headless USER is determined by the LOGIN, not by picking from the join `<select>`).

#### AUTH credential model — FINAL 2026-06-17: PASSWORD-FREE
Two design iterations were superseded (all-on-bridge; then per-player passwords from the app). The final model needs **NO passwords anywhere**, grounded in two upstream facts:
- **Foundry users have no password by default** — you join by selecting the user and leaving the password blank ([foundryvtt.com/article/users](https://foundryvtt.com/article/users/)).
- The Forge gate is account-level; once inside the world, the Foundry `/join` screen lists ALL users and you pick which to join as ([Forge: how players log in](https://forums.forge-vtt.com/t/how-do-players-log-into-a-game/68554)).

So both modes pass the Forge gate with the **bridge's streaming account** (env creds + saved `storageState`), and:
- **`streaming`** — joins as the **configured stream user** `EVF_PLAYER_VIEW_STREAM_USER` (selected by `/join` option label, blank password). This is the streamer's intended map source — pick a user whose live Foundry viewport frames the party (e.g. a GM or a dedicated observer). When unset, the headless falls back to the **first** `/join` option, which is **non-deterministic** (often a fogged player → a single-token view, not the party); configuring the var is strongly advised.
- **`actor`** — selects the **selected player's Foundry user** on `/join` (resolved from `actorId`) and joins with a **blank password** → that player's real fogged view. No per-player secret travels anywhere.

Resolution + consent:
- The bridge maps `actorId → Foundry username` from the character-list cache. The roster entry carries `userName` **only for players who OPTED IN** to streaming (per-user consent in the Foundry module — the user's "token"). Not opted in → no `userName` → orchestrator status `unavailable` ("Selected player is not available for streaming (opt-in required)").
- `client_player_view` carries `{ mode, actorId?, foundryUrl? }` — strictly **no credentials**.

**Status (2026-06-17):** the password-free protocol/bridge/g2-app are implemented + tested (streaming + off fully work; actor mode resolves usernames + selects the `/join` user). **PENDING (PIVOT-2, needs the module rebuilt+deployed to a live Foundry):** the Foundry module's `character-list-reader` must emit each actor's owning `userName` gated on a per-user opt-in flag (reuse the ADR-0014 ownership helper `pair/actor-authorization.ts`). Until then, actor mode reports `unavailable` for every actor.

#### Phasing
- **P1 — toggle + protocol + status (no Chromium yet):** EvenHub switch + `client_player_view` message + bridge handler that records intent and returns `status:'error:not-configured'`. Wires the UX end-to-end, no dead UI.
- **P2 — orchestrator:** Playwright sidecar, login flow (auth per the decision above), `canvas.ready` gate, lifecycle/health.
- **P3 — forced leader:** module `?evfLeader=1` flag + GM yield; confirm the captured frames are the player's fogged view.
- **P4 — hardening:** resource limits, restart policy, status surfacing, secrets handling, Forge ToS/rate-limit check.

#### P2/P2c — IMPLEMENTED & VERIFIED end-to-end (2026-06-17)
The orchestrator (Playwright sidecar, storageState session, Forge gate) + forced-leader reach **live streaming on the glasses**. Diagnosis log (the chain looked broken for hours before the real cause surfaced):

- **Root cause = software WebGL, not the network.** Inside the bridge container Chromium fell back to `ANGLE (Mesa, llvmpipe)` — pure software. Rendering a populated Foundry scene (lighting/vision shaders) under llvmpipe ran at **~0.1 fps** and so saturated the page main thread that the module's frame POSTs hit their 5 s `AbortSignal.timeout` before their resolve callback could run (`bridgeDeltaEmitter: signal timed out`). Almost no frames reached the bridge.
- **Fix = ANGLE-on-Vulkan via Mesa radv.** The host AMD GPU (Phoenix1 / Radeon 780M) is passed through (`/dev/dri`), but `radeonsi` GL never engaged; the working hardware path is **ANGLE-on-Vulkan**: install `mesa-vulkan-ati` + `vulkan-loader` and launch with `--use-angle=vulkan --enable-features=Vulkan`. ANGLE then reports the real device (`RADV PHOENIX`) and the headless renders the world at **~18 fps**. `EVF_PLAYER_VIEW_GL=gl` forces the llvmpipe fallback for GPU-less hosts. (See `deploy/bridge.Dockerfile`, `playwright-browser.ts`.)
- **Measurement gotcha (cost hours):** the world's `bridgeUrl` is a public hostname reverse-proxied to the bridge, so **every** frame POST — GM *and* headless — arrives with `remoteAddress: 192.168.1.174` (the proxy). Source IP cannot distinguish posters; use the `X-EVF-Forced-Leader` header (preserved through the proxy — verified) via the `EVF_FORCED_LEADER_DEBUG=1` opt-in log instead.
- **Confirmed working:** forced-leader header survives the proxy; the tracker stays `active`, GM frames are dropped, the glasses show the streaming player's auto-framed view. Third-party page errors in the headless console (`simple-calendar` `.find`, `stealthy`/`GetPerceptionBanking` no-GM) are unrelated noise.

#### Also folded in (was deferred)
- **Selection persistence:** persist the `client_select_actor` choice to the Even Hub kv store and re-seed the next handshake `actorId` (currently reverts to the wizard `characterId` on reboot). `TODO(ADR-0015)` in `g2-app/src/phone/settings-panel.ts`.

## Consequences

- **Now:** the player picks the role in the app; the map frames the party centered on that PG (synthesized). Character data and framing both retarget live.
- **Not yet:** the map does not yet show the selected PG's *fog-of-war* — that needs increment (C). The synthesized framing (B) is the standing fallback and remains useful (auto "all party in frame") even after (C) lands.
- **Rejected:** replicating a player's vision/fog on the GM client (deep, version-fragile, incomplete).
