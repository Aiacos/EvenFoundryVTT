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

### (C) Real player view via a headless logged-in player session — DESIGN (2026-06-17, EvenHub-toggle activated)

To get the selected PC's **real fogged view** (their viewport + lighting + vision + fog), capture a browser **logged in as that player's Foundry user** — the only way Foundry renders those view-dependent effects correctly (see §B). Automated form: the bridge launches a **headless Chromium (Playwright)** that logs into the world as the selected player, loads the EvenFoundryVTT module, and becomes the stream-leader. Activated by an **EvenHub settings toggle**.

#### Components

1. **EvenHub toggle (g2-app phone settings panel)** — a new "Player view (headless)" switch. Enabled only when a Character/Role is selected and a Foundry URL is set. On toggle it sends a new upstream control message `client_player_view { enabled, actorId, foundryUrl }`; the bridge echoes a **status** (`off | starting | live | error:<reason>`) back to the panel (via the existing frame-POST piggyback / a status delta) so the user sees what's happening. The toggle does NOT carry credentials.

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
- **Runtime:** Chromium as a **sidecar in the bridge Docker compose** (no third-party service) — the user's stated preference. Needs WebGL: `--use-gl=angle --use-angle=swiftshader` (software GL) or a GPU passthrough; validate Foundry's PIXI scene actually renders headless.
- **Scope:** **one** headless session at a time = the actor selected in EvenHub (`client_select_actor`). Switching PC re-logins (seconds of lag) — acceptable for MVP vs one-Chromium-per-player (N× RAM).
- **Credentials:** held **only on the bridge** (env / mounted secret), never in the EvenHub app or git. The toggle triggers; the bridge authenticates.
- **Leadership:** orchestrator-assigned via `?evfLeader=1` marker (no socketlib focus distribution needed).

#### Open question — AUTH (blocking, needs the user's Forge setup)
How the headless client authenticates as the player at `foundryUrl`:
- (a) **Passwordless** Foundry user → select user + Join.
- (b) **Per-user Foundry password** → stored in bridge config, keyed by Foundry user.
- (c) **The Forge gate** → the game URL may require a Forge account login before Foundry `/join`; if so, the orchestrator needs Forge credentials too (or a player-invite/direct-join link that bypasses the Forge account).

#### Phasing
- **P1 — toggle + protocol + status (no Chromium yet):** EvenHub switch + `client_player_view` message + bridge handler that records intent and returns `status:'error:not-configured'`. Wires the UX end-to-end, no dead UI.
- **P2 — orchestrator:** Playwright sidecar, login flow (auth per the decision above), `canvas.ready` gate, lifecycle/health.
- **P3 — forced leader:** module `?evfLeader=1` flag + GM yield; confirm the captured frames are the player's fogged view.
- **P4 — hardening:** resource limits, restart policy, status surfacing, secrets handling, Forge ToS/rate-limit check.

#### Also folded in (was deferred)
- **Selection persistence:** persist the `client_select_actor` choice to the Even Hub kv store and re-seed the next handshake `actorId` (currently reverts to the wizard `characterId` on reboot). `TODO(ADR-0015)` in `g2-app/src/phone/settings-panel.ts`.

## Consequences

- **Now:** the player picks the role in the app; the map frames the party centered on that PG (synthesized). Character data and framing both retarget live.
- **Not yet:** the map does not yet show the selected PG's *fog-of-war* — that needs increment (C). The synthesized framing (B) is the standing fallback and remains useful (auto "all party in frame") even after (C) lands.
- **Rejected:** replicating a player's vision/fog on the GM client (deep, version-fragile, incomplete).
