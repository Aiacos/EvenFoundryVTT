---
status: accepted
date: 2026-09-25
deciders: maintainer
consulted: research agents + first-hand re-verification (specs/004-relay-pairing/research.md)
informed: foundry-module, g2-app, shared-protocol, relay (new)
---

# ADR-0019: Relay Pairing — the player's Foundry tab projects; the phone never logs into Foundry

## Status

**ACCEPTED** — 2026-09-25 (maintainer: «procedi con il nuovo piano ADR-0019»). It **supersedes** [ADR-0016](./0016-direct-foundry-streaming.md)
§1 (hosting on Foundry), §2 ("(G2)" identity), §3 (pairing), §4 (transport over Foundry's
socket) and §6 (phone fetches scene art), and [ADR-0017](./0017-player-owned-glasses-hybrid-projector.md)
entirely (GM enablement, sealed passwords, ECDH custody, election). Keeps ADR-0016's sealed
envelope and projector role, [ADR-0011](./0011-foundry-write-path-single-workflow-origin.md)
(one `dispatchTool` origin per device) and [ADR-0018](./0018-dnd-sheet-hud-pixel-renderer.md).

## Context

Verified 2026-09-25 (quotes and URLs in `specs/004-relay-pairing/research.md`):

1. **Foundry ≥ 14.361 serves module HTML as `text/plain`** and will not change it (#14375
   NOT_PLANNED). ADR-0016's entry page cannot load on current v14. *CRITICAL drift.*
2. **Players cannot create users**; a phone logged in as the player's own user relies on
   the open bug #14728, whose fix will refuse or kick the second session. ⇒ Phone-login
   designs need a GM, or break the player's browser.
3. **The Forge private games** gate every path of the game host behind a Forge login plus
   invitation; User Manager takes over `/join`.
4. **Even Hub**: a packaged app reaches only fixed, whitelisted origins (no wildcards, no
   runtime URL, no deep link). QR-sideloaded pages die when the phone locks, and only
   Beta/Released installs pass the 5-minute lock test.
5. Foundry has no external/token API (#11239, #3568). Module code in a logged-in tab can open
   outbound WebSockets; no CSP was found on Forge pages.

## Decision Drivers

No GM · player's browser session untouched · one QR, < 30 s · works on v13/v14,
self-hosted and Forge · listable on Even Hub · one dev command · E2E privacy · cost ≈ 0.

## Considered Options

| Option | Verdict |
|---|---|
| A. Keep ADR-0016/0017 (Foundry-served page, "(G2)" user) | Rejected — broken on v14 (1), needs GM (2), Forge gate (3), no store (4). |
| B. Phone logs in as the player's own user | Rejected — kicks/refused once #14728 is fixed (2); Forge gate; no store. |
| C. WebRTC data channel | Rejected — still needs signalling; iOS WKWebView failures reported; TURN on cellular. |
| D. Public brokers (MQTT, ntfy, PeerJS cloud) | Rejected — ToS forbid production, size/rate limits, no SLA. |
| **E. Opaque room relay on a fixed origin (Cloudflare Worker + Durable Object per room); the player's Foundry tab is the projector; one app bundle as `.ehpk` / GitHub Pages / Vite** | **Chosen.** |

## Decision Outcome

**Option E.**

1. **Projector** = the Foundry tab of whoever showed the QR (the player; optionally a GM for
   a player without a device). One tab per browser holds a Web Lock per device.
2. **Relay** = `packages/relay`, a Worker routing `/r/<room>?role=projector|glasses` to one
   Durable Object per room (WebSocket Hibernation). It forwards opaque frames between the
   two roles, keeps one socket per role, caps frame size and rate, and stores nothing.
   Frames ≤ 1 MiB (map pictures travel inside), ≤ 60 frames/s per socket. Fixed origin
   owned by the project; a self-host URL is an opt-in override (sideload only).
3. **Pairing** = QR `https://<app-origin>/#evf=<{v:2, r:room128, k:key256, l, relay?}>` or a
   16-char code (room/key by HKDF). Room and key rotate on the first `welcome`. Pairings
   persist on both sides and are revocable. The phone never holds a Foundry credential.
4. **Transport** = ADR-0016 sealed envelopes (AES-256-GCM, AAD `from>to`, anti-replay) over
   the relay WebSocket instead of `module.evenfoundryvtt`.
5. **Map** = the projector loads the scene art in its tab (same origin, or a CDN with CORS),
   downsizes each picture once (background JPEG ≤ 768 px, tiles/tokens PNG ≤ 128 px) and
   sends it as an `asset` message; the map snapshot references `evf-asset:<id>` and keeps
   its ≤ 1 Hz throttle. The phone's pixelation (ADR-0018) is unchanged.
6. **Distribution** = Even Hub beta → store (`.ehpk`, whitelist = relay origin, `camera`
   permission for the in-app QR scan) for players; GitHub Pages `/app/` for developer-mode
   phones and as QR target; Vite + `wrangler dev` for development.

## Consequences

- ➕ No GM, no second Foundry user, no Foundry credential on the phone; the browser session
  is never touched. Works on v13/v14, self-hosted and Forge private games. Foundry needs no
  public HTTPS any more (the phone never reaches it).
- ➕ Listable on Even Hub; the installed app survives phone lock.
- ➕ Removes ADR-0017's ECDH custody, sealed passwords, election and GM enablement (large
  code deletion).
- ➖ Re-introduces infrastructure: one project-operated relay (free plan, shared quota;
  capacity gate G3). Mitigated by delta-only traffic and a documented self-host path.
- ➖ The projector's tab must be open during play (a GM tab covers players without one).
- ➖ Relay learns metadata (room id, timing, sizes), never content.
- ➖ Existing pairings must be redone once (migration notice).

## Confirmation

- Relay unit + `wrangler dev` integration tests (routing, one socket per role, newcomer
  `peer-up`, no `peer-down` on replacement, size/rate caps).
- Sealed round-trip projector ⇄ app over a fake relay; payload v2 + code derivation; tab lock.
- Regression: no g2-app code path requests the Foundry origin.
- Gates (`validate:relay`, defer-hardware): **G1** relay reachable from a Forge v14 private
  game tab and self-hosted v13/v14; **G2** store/private build whitelist spelling, camera QR
  decode iOS + Android, credentials survive kill + 5-minute lock; **G3** measured
  requests + GB-s per session within the free plan.

### Confirmation — implementation (2026-09-25)

- Relay: `packages/relay` (Worker + `Room` Durable Object, Hibernation API) — unit tests at
  100 % coverage (`src/*.test.ts`) and a `wrangler dev` integration suite
  (`src/relay.it.test.ts`, `EVF_RELAY_IT=1`); bundle 3 KiB gzip (`wrangler deploy --dry-run`).
- Protocol v2: `packages/shared-protocol/src/direct/{pairing,relay,messages}.ts` (payload v2,
  code → room + key by HKDF, `welcome.rotate {room, key}`, `asset`), `direct.test.ts`.
- Projector: `packages/foundry-module/src/direct/{projector,relay-connection,map-assets,pairing-flow,pairing-store,PairG2App,players-menu,ownership}.ts`
  and tests — including the regression «two hellos racing on a fresh QR rotate once» (PJ-02b).
- Glasses: `packages/g2-app/src/direct/{session,relay-client,credentials}.ts`,
  `src/phone/{phone-page,qr-scan}.ts` and tests — including the regression «peer-up racing the
  first hello» found by the real-relay E2E.
- End-to-end over a real relay: `packages/g2-app/src/direct/relay.e2e.test.ts` (CI step "Relay
  end-to-end" with `wrangler dev`): code → rotate → online in 133 ms locally; asset, invoke,
  projector away → `no-projector` → back online by itself.
- Gates: CI Gate 10 `scripts/check-relay-origin.mjs` (whitelist = `DEFAULT_RELAY_URL`, camera
  declared, no Foundry login / socket.io in the bundle); `validate:relay` harness (G1 software
  part GO on a local relay; G1 on Forge/self-hosted tabs, G2 and G3 are defer-hardware /
  post-deploy items in `specs/004-relay-pairing/tasks.md` Phase 7).

