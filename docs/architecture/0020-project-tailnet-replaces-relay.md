---
status: proposed
date: 2026-11-01
deciders: maintainer
consulted: research agent + first-hand re-verification of the key quotes (Even Hub networking, Tailscale serve / sharing)
informed: foundry-module, g2-app, shared-protocol, relay
---

# ADR-0020: Project tailnet replaces the relay — Tailscale identity instead of QR pairing

## Status

**PROPOSED** — 2026-11-01. Maintainer decision: «Tailnet sostituisce il relay», accepting a
restricted audience (groups invited into the project tailnet) instead of the public Even Hub
audience that ADR-0019 targeted. Becomes ACCEPTED only after the spike gates below are GO on real
hardware. Would **supersede** [ADR-0019](./0019-relay-pairing-player-projector.md) (relay, QR /
16-char code pairing, per-device AES key, rotation) and the sealed-envelope part of
[ADR-0016](./0016-direct-foundry-streaming.md). Keeps the projector role (the player's own Foundry
tab executes everything), [ADR-0011](./0011-foundry-write-path-single-workflow-origin.md),
[ADR-0012](./0012-r1-gesture-model-overscroll-exit-lifecycle.md) and
[ADR-0018](./0018-dnd-sheet-hud-pixel-renderer.md).

## Context

The maintainer asked to simplify login and security by working over a Tailscale network.
Facts verified 2026-11-01 (canonical sources, quoted):

1. **Even Hub whitelist** — "Use the full origin (`https://api.example.com`) - bare hostnames and
   wildcards aren't supported"; "The Even Realities App enforces it before the request ever
   leaves the WebView" (<https://hub.evenrealities.com/docs/build/networking>). ⇒ A store build
   can reach **one fixed** tailnet name, never each group's own tailnet. A single project tailnet
   with one fixed node name fits; per-group tailnets do not.
2. **Tailscale Serve identity** — Serve adds `Tailscale-User-Login`, `Tailscale-User-Name`,
   `Tailscale-User-Profile-Pic`; "not populated for traffic originating from tagged devices";
   "Funnel traffic … does not include identity headers"; incoming copies are removed "to avoid
   header spoofing"; "only `http://127.0.0.1` is supported for proxies"
   (<https://tailscale.com/kb/1312/serve>, <https://tailscale.com/kb/1242/tailscale-serve>).
3. **Sharing** — "Sharing gives the recipient access to only the shared machine in your tailnet";
   the recipient can accept "from any Tailscale account" but must be "an Owner, Admin, or IT admin
   of a tailnet" (a personal tailnet qualifies); reusable invite links "up to 1,000 times"
   (<https://tailscale.com/kb/1084/sharing>).
4. **Phones** — "iOS and Android enforce a limit of running only one VPN at a time"
   (<https://tailscale.com/docs/reference/faq/other-vpns>); Android routes every app through
   Tailscale by default (split tunnelling is opt-out).
5. **Free plan** — "Up to 6 users", "Unlimited user devices", "only suitable for non-commercial
   use" (<https://tailscale.com/pricing>).
6. Unchanged from ADR-0019: Foundry ≥ 14.361 serves module HTML as `text/plain`; the phone must
   not log into Foundry (#14728); a Forge-hosted game cannot join a tailnet — so the player's own
   browser tab stays the projector, and that laptop joins the tailnet instead.

**Not documented anywhere (spike gates):** WebSocket proxying through Serve; identity headers for
users a machine is *shared* with; whether shared users count toward the 6-user limit; MagicDNS
resolution of `*.ts.net` inside the Even app's WebView (iOS WKWebView, Android); Even Hub store
review of a `*.ts.net` origin; survival of the 5-minute phone lock with the VPN on.

## Decision Drivers

- Simpler security and login: no QR, no code to type, no keys to rotate or store.
- Core Value unchanged: the phone stays in the pocket during play.
- Store-compatible: one fixed origin in `app.json`.
- Works with The Forge (projector = the player's browser tab).
- Accepted cost: a restricted audience (groups invited into the project tailnet) and a node the
  maintainer keeps running.

## Considered Options

1. **Keep the Cloudflare relay (ADR-0019)** — public store audience, zero setup for players;
   pairing by QR/code. Rejected by the maintainer (2026-11-01).
2. **Hybrid** — relay for the store, tailnet mode for the maintainer's group. Rejected (two
   transports to maintain).
3. **Phone talks to a tailnet-hosted Foundry** — impossible: per-group origins, phone login to
   Foundry (#14728), The Forge.
4. **Project tailnet replaces the relay** (chosen, pending gates).

## Decision Outcome (proposed)

1. **One hub node in the project tailnet** — an always-on machine (home server, NAS or small VM)
   named e.g. `evf-hub`, running a small WebSocket hub on `127.0.0.1` behind
   `tailscale serve --https=443`. Its full origin `https://evf-hub.<project-tailnet>.ts.net` (and
   `wss://` same host) replaces the relay in `app.json`'s whitelist and in
   `DEFAULT_RELAY_URL`. The hub reuses the relay's room logic (`packages/relay` ported from a
   Durable Object to a Node process: same limits, same opaque forwarding).
2. **Players join by share** — the maintainer shares `evf-hub` with a reusable invite link; each
   player accepts it from their own Tailscale account and runs Tailscale on **both** the phone and
   the laptop with the Foundry tab, signed in to the same account.
3. **Identity replaces pairing** — the hub reads `Tailscale-User-Login` (set by Serve, spoofed
   copies stripped; the hub listens on localhost only and rejects requests without it). The room
   is the login: the player's phone and their projector tab meet automatically. The projector tab
   serves its user's assigned character (`game.user.character`), chosen in the Foundry window when
   the user owns several. No QR, no 16-character code, no device key, no rotation.
4. **Transport security** — WireGuard (Tailscale) encrypts every hop; frames are no longer
   AES-sealed end to end. The hub operator (the maintainer) is inside the trust boundary and could
   read game traffic; this is accepted for a closed group and stated in `SECURITY.md`. *Open: keep
   the sealed envelope with a key derived per login if the maintainer wants the hub blind.*
5. **What goes away** — Cloudflare Worker deployment (`relay-deploy.yml`), QR / code pairing UI
   (Foundry window «Collega occhiali G2» becomes a status window), phone «Scansiona QR» and the
   `jsqr` chunk, pairing payload v2 + HKDF code derivation, the `@noble` crypto fallback (only if
   4. drops sealing), `rotate`.

## Spike gates (GO/NO-GO before ACCEPTED; `packages/validation-harness`, defer-hardware pattern)

| Gate | Check | NO-GO means |
|---|---|---|
| T1 | `wss://` through `tailscale serve` to a localhost WS server: upgrade, 1 MiB frames, 30 min idle | proxy the hub differently (tsnet/userspace) or keep the relay |
| T2 | `Tailscale-User-Login` present for a user the node is **shared** with (and absent for tagged devices) | invite players as tailnet users instead of shares (6-user free limit) |
| T3 | Even app WebView on iOS **and** Android resolves `evf-hub.<tailnet>.ts.net` and connects with the Tailscale VPN on; survives the 5-minute phone lock | NO-GO for that OS |
| T4 | Foundry tab on the laptop (self-hosted and The Forge) connects to the hub over the tailnet | NO-GO |
| T5 | Do shared users count toward the free plan's 6 users? (Tailscale support / admin console) | budget a paid plan or cap groups |
| T6 | Even Hub portal accepts an `.ehpk` whose whitelist is a `*.ts.net` origin (beta group first) | sideload/Pages only |

## Consequences

- **Good:** no pairing step at all; nothing secret on the phone; no relay quota; no Cloudflare
  account; fewer moving parts (no rotation, no expiry races, no crypto fallback).
- **Bad:** every player installs Tailscale on two devices and keeps it on while playing (iOS: the
  one VPN slot); the audience is restricted to the project tailnet's guests (PRODUCT.md updated);
  the maintainer runs and secures an always-on node; the hub operator can read traffic unless
  sealing is kept.
- **Neutral:** Foundry, dnd5e, the write path and the HUD are untouched; the projector role stays.

## Confirmation

Spike gates T1–T6 recorded in `docs/perf/phase-0/` by `validate:tailnet`; then a Spec Kit feature
(`specs/005-project-tailnet/`) for the implementation, with `Specs.md`, `README.md`, showcase,
setup guide, wiki, `SECURITY.md` and `PRODUCT.md` updated together (INV-3).
