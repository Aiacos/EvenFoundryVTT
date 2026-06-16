# ADR-0015: Player-view map capture & live character/role selection

- **Status:** Proposed (2026-06-16) — increments (A) and (B) below are **implemented**; the headless-session capture (C) is **deferred / future-work to inspect**.
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

### (B) Synthesized party-fit, focus-weighted framing on the GM client — IMPLEMENTED (module v0.1.29)

Without a player session, the GM (leader) client synthesizes the framing: a world-rect containing all PC tokens, centered toward the selected actor, rendered to an off-screen RenderTexture without moving the GM camera. See [[map-auto-framing]]. This gives "all characters visible, Shin centered" **but not Shin's fog** (the GM sees all).

### (C) Real player view via a logged-in player session — DEFERRED (future work to inspect)

To get Shin's **real fogged view**, capture a browser **logged in as Shin's Foundry user**. Interim manual form (what the user runs *now*): keep a browser logged in as the player; the stream-leader should then be **that** client. Automated target: a **headless Chromium (Playwright)** the bridge launches, that logs into the world as the selected player's user, loads the module, and becomes the leader.

This is deferred. Open questions to resolve before building (the "rest to inspect"):

1. **Stream-leader election must follow the focus actor.** Prefer the active client whose user **owns** the selected actor; fall back to GM/lowest-id. *Complication:* the focus actor is currently known only to the **posting (leader)** client (it learns `focusActorId` from frame-POST responses). A non-leader player client never POSTs, so it can't know to take over. Fix options: distribute the focus actor to **all** clients (socketlib broadcast, or a transient world/user flag), with a one-time GM→player leadership handoff. Until this exists, a manually-logged-in player client will **not** automatically become the source.
2. **Authentication of the headless session.** Foundry user password vs passwordless join; on The Forge, whether the game URL gates behind a Forge account or routes straight to Foundry `/join`. Credentials must be supplied via bridge config (env/settings), never in code.
3. **Runtime & lifecycle.** Where Chromium runs (preferred: a sidecar in the bridge Docker compose, no third-party service); one session that **follows** the glasses selection (logout/login on PG change — seconds of lag) vs **one persistent session per player** (instant switch, N× RAM/CPU). Spawn/restart/teardown ownership.
4. **Resource cost.** A persistent headless Chromium rendering a Foundry scene is heavy; quantify before committing the homelab to it.
5. **Selection persistence.** Persist the live `client_select_actor` choice to the Even Hub kv store and re-seed the next handshake `actorId` (currently the selection reverts to the wizard's `characterId` on reboot). Tracked as `TODO(ADR-0015)` in `g2-app/src/phone/settings-panel.ts`.

## Consequences

- **Now:** the player picks the role in the app; the map frames the party centered on that PG (synthesized). Character data and framing both retarget live.
- **Not yet:** the map does not yet show the selected PG's *fog-of-war* — that needs increment (C). The synthesized framing (B) is the standing fallback and remains useful (auto "all party in frame") even after (C) lands.
- **Rejected:** replicating a player's vision/fog on the GM client (deep, version-fragile, incomplete).
