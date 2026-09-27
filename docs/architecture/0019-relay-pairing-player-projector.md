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
3. **Pairing** = QR `https://<app-origin>/#evf=<{v:2, r:room128, k:key256, l, relay?}>` (see **Amendment 1**: now `#c=<CODE>`) or a
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

### Amendment 1 — code-only QR (2026-09-26)

**Why:** the v0.13.0 QR carried a base64url JSON payload `{v:2, r, k, l, relay?}` — 201
characters, QR version 10 (57 × 57 modules) with a 1-module quiet zone. On hardware the Even
Realities App's developer "Scan QR" did not recognise it from a laptop screen, and the manual
URL field truncated it (maintainer report, 2026-09-26).

**Decision:** the QR carries only the 16-char code: `<app-url>#c=<CODE>[&relay=<ws(s)://…>]`
(≈ 63 characters, QR version 4, 33 × 33 modules, quiet zone 4 modules). Room and key are derived
from the code with HKDF exactly as for the typed code; the relay override appears only for
development / self-hosting; the pre-`welcome` label is dropped (the `welcome` names the
character). The pairing window also shows the plain app address (44 characters) for developer
mode without a camera: open it, then type the code.

**Security:** the secret shown on screen is now 80 bits (was 128 + 256) — the same as the code
that was always displayed next to the QR; it is single use (room + key rotate to fresh random
values on the first `welcome`) and expires in 5 minutes, so an online guess over the relay is
infeasible.


**Superseded detail (Amendment 2):** the plain app address for developer mode is no longer
shown. The Even App's manual link field truncates and capitalises, and a typed code already
works on the page the QR opens (P03 «Prima configurazione»).

### Amendment 2 — pairing that survives real phones (2026-09-26)

**Why:** in Even App developer mode, pairing still failed for the maintainer after
Amendment 1. The investigation (real projector + real relay E2E, a headless Chromium probe,
simulator runs) found one root cause and several traps that turned any slip into a dead end:

1. **Secure context.** `pnpm dev:glasses` in v0.3.0/0.3.1 told the maintainer to set the
   Foundry client setting «Glasses app page (advanced)» to `http://<LAN-IP>:<port>/`. A
   plain-http page on a LAN host is not a secure context: `crypto.subtle` and
   `crypto.randomUUID` are `undefined` (Chromium probe; WebKit's `Crypto.idl` marks both
   `[SecureContext]`). Code derivation threw, the phone page showed «Codice non valido» / «non
   è un QR di associazione» for every failure, and every Foundry QR kept opening that dead page.
   The same holds for a Foundry tab served over `http://192.168…` (the projector).
2. **Used link.** Credentials were saved before any `welcome`, and re-opening an already-used
   `#c=` link (the Even App reloads the scanned URL; a re-scan after a lock) overwrote the
   rotated pairing with the dead room derived from the code.
3. **No way back.** The phone's P02 page had no scan button or code field: after any failed
   attempt the only exit was *Diagnostica › Dimentica associazione*.
4. **Window close.** Closing «Collega occhiali G2» (✕ / ESC) discarded the pending QR, and
   every such failure surfaced as «Foundry del giocatore chiuso».
5. **Burst.** The glasses said `hello` twice, and the projector answered each with the full
   state; on a scene with many pictures that could cross the relay's 60 frames/s cap (1008)
   and loop.

**Decision:**

- **Crypto everywhere.** `@evf/shared-protocol` `direct/crypto.ts` uses WebCrypto when
  `crypto.subtle` exists and otherwise lazy-loads `crypto-fallback.ts` (AES-256-GCM, HKDF-SHA256,
  SHA-256 from `@noble/ciphers` 2.4.0 + `@noble/hashes` 2.4.0, exact pins). The wire bytes are
  unchanged, so each side may use either backend. `randomId()` replaces `crypto.randomUUID`.
  An http LAN page (phone or Foundry) now pairs; https stays the recommended setup.
- **Used-link rule.** A stored pairing remembers the room its code derived (`from`), and the
  phone keeps a short list of spent code rooms (rotated, unanswered, then revoked or forgotten)
  in its own storage key, which «Scollega» / «Dimentica associazione» do not wipe. A link whose
  code is spent is ignored and the working pairing kept; the phone says so («Codice già usato
  su questo telefono: l'associazione attuale resta valida» on P02, «…genera un nuovo QR» on
  P03). A code still waiting for its first `welcome` (`pendingSince`) is retried, and cleared
  after `PAIRING_TTL_MS` (5 min, shared by both sides) with the notice «Nessuna risposta al
  codice». Pairings rotated before v0.4.2 carry no `from`: a link arriving at boot over such a
  confirmed pairing keeps it as `fallback`, given back (and the code marked spent) if the code
  gets no answer — so the reloaded spent QR costs one 5-minute wait at most, never the pairing.
  The page reads the link before stripping it from the (live) address, also on `hashchange`
  (listened to from the start of the boot, links applied in order), accepts `?c=` in its URL
  and in a pasted / scanned link and any key case, and names a legacy `#evf=` link or a link
  without a valid code.
- **Re-pair UX.** P02 has a «Collega di nuovo» card (scan + code, open while not online) and
  both pages show a boot line `app · secure · crypto · link · relay` (no secrets). Errors are
  precise: invalid code, not a pairing QR, code already used, else «Collegamento non riuscito:
  <msg>». New offline causes on phone and glasses: `code-pending`, `actor` (hello refused:
  `actor_missing` / `forbidden_actor`, slower retries), `replaced` (relay close 4000: no
  reconnect loop).
- **Pending pairing survives window close.** The projector owns the expiry (a timer when the
  channel opens, plus the prune at start, plus a check on each frame for late timers). Closing
  the window only stops the countdown; reopening it within 5 minutes — from any entry point,
  the Players list included — shows the same QR. Because closing no longer cancels, the shown
  QR has an explicit «Annulla QR» that forgets it and closes its channel at once. Under
  the QR the window shows live status (relay connected, glasses in the room, why the last
  glasses frame was refused: clocks apart > 2 min, other key, malformed). A non-default app
  page or relay is flagged there with «Ripristina predefinito». Each pairing stores the relay
  it was made on and the projector serves it there, so resetting the relay setting never
  separates a projector from glasses that keep their QR's relay.
- **Frame pacing.** One full push per link: a repeated `hello` gets only a `welcome`. The
  glasses say `hello` once per join (on `peer-up`, or after a 1.5 s grace), and again on every
  later `peer-up` even while welcomed: a projector socket replaced by a new one (relay close
  4000, no `peer-down`) starts an un-welcomed link that pushes nothing until a `hello`. The
  projector's relay socket paces outgoing frames to 40 per rolling second (relay cap 60).

**Security:** the fallback implements the same algorithms with the same parameters; the
libraries are audited (cure53: `@noble/ciphers` v1.0.0, 2024; `@noble/hashes`, 2022 — earlier
releases than the pinned 2.4.0) and pinned exactly, loaded only when WebCrypto is missing. It is
only algorithmically constant-time (AES table lookups may leak cache timings; the GCM tag
check is constant-time), acceptable on plain-http pages only. On the fallback the device key sits in
page memory as bytes instead of a non-extractable `CryptoKey`; that adds no exposure, because
the same key is already in that browser's pairing storage. A plain-http page is exposed to its
network by nature, so https stays recommended. The used-link rule does not weaken single use:
a spent code still opens nothing on the projector, it only stops the phone from destroying a
working pairing. Closing the window leaves a shown code redeemable until it expires: a QR
others may have seen must be killed with «Annulla QR». See [SECURITY.md](../../SECURITY.md).

**Confirmation:** regression tests that failed before the fix —
`packages/g2-app/src/direct/insecure-context.regression.test.ts` (BUG-2),
`packages/g2-app/src/direct/pairing-bugs.regression.test.ts` (BUG-1, H2, H3b, H3c, H5, H6,
H6b, hello refusals, close 4000, inbound queue), `credentials.test.ts` (link read before the
live address is stripped), `packages/foundry-module/src/direct/projector.test.ts` (PJ-15,
PJ-15b, PJ-17, PJ-19…21), `PairG2App.test.ts` (PA-11b, PA-12…12f, PA-17),
`relay-connection.test.ts` (RC-06); the cross-package E2E `packages/e2e/src/pairing.e2e.test.ts`
(real projector + real session + the built bundle in Chromium on `http://127.0.0.1` and on
`http://<LAN-IP>`) in the CI step "Relay end-to-end", all against `wrangler dev` (window
closed / reopened / cancelled, expiry, spent QR reopened, clock skew, the crypto fallback). Still
hardware-gated (`TODO.md`): whether the Even App's developer Scan QR passes `#c=` through,
whether sideloaded / installed pages are secure contexts, and the camera on a sideloaded page.
