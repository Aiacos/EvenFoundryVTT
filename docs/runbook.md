# Runbook — EvenFoundryVTT (direct streaming)

What to check when the glasses won't connect or stop updating. Since v0.10.0 there is no
server to restart ([ADR-0016](architecture/0016-direct-foundry-streaming.md)). Only three
pieces can fail:

1. **the phone page**: the g2-app in the Even Realities App WebView.
2. **the Foundry server**: HTTPS, the static `/modules/evenfoundryvtt/g2/` files, the socket relay.
3. **the GM browser**: the `evenfoundryvtt` module acting as **projector**. It holds the
   device keys, reads dnd5e data and runs every action.

First-time installation is covered in the [setup guide](setup-guide.md).

---

## 🏗️ What talks to what

```
[G2] ⇄ BLE ⇄ [Even App WebView: /modules/evenfoundryvtt/g2/index.html]
                    │ POST /join (cookie) + socket.io, same origin
                    ▼
             [Foundry server] ── relays module.evenfoundryvtt (AES-GCM sealed envelopes)
                    │
                    ▼
             [GM browser: projector] — answers only if game.users.activeGM is this client
```

| Step | Who | Failure shows up as |
|---|---|---|
| Page load | Even App → Foundry HTTPS | blank page / certificate error |
| Login | g2-app `POST /join` as "&lt;Player&gt; (G2)" | *credentials rejected* → first-setup page (P03) |
| Socket | socket.io `/socket.io/` | *Foundry not responding*, retry with backoff 1→30 s |
| `hello` → `welcome` | projector in the GM browser | *no GM connected* after 8 s without `welcome` |
| Live updates | projector hooks → sealed pushes | stale sheet/map; after 2 missed pongs the page goes offline (S12) |

---

## 🐞 Diagnose from the phone

The phone page is the fastest place to look.

- **Status line:** *Connected* / *Connecting…* / *Offline*, with the cause and the retry
  countdown (*retrying in N s (attempt K)*). The causes:
  - *no GM connected*: the projector did not answer. See [the GM section](#-diagnose-from-foundry-gm-browser).
  - *Foundry not responding*: network, TLS, proxy or socket problem.
  - *credentials rejected*: revoked, already used, or expired. Re-pair.
  - *app in background*: expected. The page reconnects on foreground re-entry.
- **Server / User / Character / GM:** confirms the page talks to the right world, as the
  right "(G2)" user, and names the projecting GM (*Anna (online)*).
- **Latency:** ping → pong round trip through the relay and the GM browser.
- **Diagnostics ▸** (IT: *Diagnostica*): Foundry version (from `/api/status` when it is
  exposed), the **recent errors** list (newest first, with level), and **Forget pairing**.
- **Reconnect** forces a new login + socket. **Disconnect** stops the session and keeps
  the credentials.

---

## 🐞 Diagnose from Foundry (GM browser)

### Pair dialog

*Configure Settings* → *EvenFoundryVTT* → **Pair G2 glasses**:

- **Checks:** *valid HTTPS · module served · socket active*. Any ✗ blocks the phone.
- **Paired devices:** each "(G2)" user with its character and **last contact**
  (*last contact 12 s ago* / *never connected*). A device that never connects after a
  scan means the phone never reached the projector: check HTTPS and the GM.

### Browser console (F12 on the GM client)

The projector logs with the `[EVF]` prefix:

| Message | Meaning |
|---|---|
| `[EVF] projector: rejected envelope from <id> (authentication failed)` | The device used an old or unknown key: an old QR, or keys from another GM browser. Re-pair. |
| `[EVF] projector: malformed message from <id>` | Protocol mismatch between the g2-app and the module. Update the module so both come from the same release. |
| `[EVF] projector: password rotation failed …` | The one-time rotation failed. The pairing credentials stay valid. Check that the GM may edit users. |
| `[EVF] projector: failed to push to a G2 device` | Socket emit failed. Usually transient. |
| `[EVF] could not notify <id> of revocation` | The device was offline during revoke. The user is still deleted. |

Useful checks in the console:

```js
game.users.activeGM?.name                       // must be the GM who paired
game.settings.get('evenfoundryvtt', 'g2Devices') // public device metadata (no keys)
game.socket.connected                            // relay available
```

Device **keys** are stored only in a hidden client-scoped setting of the browser that
paired. Another browser or another GM account sees the metadata but can't open the
envelopes, and the device reports *no GM connected*.

### Audit log

Every action that runs through `dispatchTool` (attack, cast, use item, end turn…) writes
a GM-only hidden chat message flagged `flags.evf.audit`
([ADR-0011](architecture/0011-foundry-write-path-single-workflow-origin.md)):

```js
game.messages.contents
  .filter((m) => m.flags?.evf?.audit)
  .slice(-20)
  .forEach((m) => console.log(m.flags.evf.audit));
```

Each entry holds `tool`, `payload`, `idempotencyKey` (the request `rid`), `actorId`,
`result`, `timestamp` and `bearer_id`. `bearer_id` is a hash of the device principal
`g2:<userId>`, never a secret.

---

## 🧪 Sideload GO/NO-GO harness

`validate:direct-sideload` checks that a Foundry instance can serve the glasses app to
the Even Realities App (ADR-0016 §Confirmation). Script:
[`packages/validation-harness/scripts/direct-sideload.ts`](../packages/validation-harness/scripts/direct-sideload.ts).

```bash
# Software checks only (CI-safe, no phone needed)
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload:skip-hardware

# Full run: software checks + interactive y/n hardware checklist (needs a TTY, phone, G2, R1)
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload
```

`FOUNDRY_URL` is the Foundry base URL **including any routePrefix**
(e.g. `https://host/foundry`). The only flag is `--skip-hardware`.

| Check | GO when | NO-GO typical cause |
|---|---|---|
| `https` | the URL is `https://` | HTTP URL |
| `reachable` | Foundry root answers over TLS | `DEPTH_ZERO_SELF_SIGNED_CERT`, `ENOTFOUND`, 5xx |
| `g2-entry` | `/modules/evenfoundryvtt/g2/index.html` → 200 `text/html` | module not enabled, zip without `g2/` |
| `api-status` | informational: reports the Foundry version | *skipped* when hidden by a proxy (never NO-GO) |
| `hw-qr-load` | the Even App scans the QR and loads the page | certificate, URL |
| `hw-sdk-bridge` | `EvenAppBridge` is injected; the g2-app draws on the G2 | page opened outside the Even App |
| `hw-cookie-persist` | the session cookie survives foreground exit → enter | WebView cookie policy |
| `hw-socket-reconnect` | socket.io reconnects and the HUD resumes | proxy WebSocket timeout |

The script also prints the URL form the QR encodes (with placeholders).

**Exit codes:** `0` GO · `1` NO-GO · `2` skipped (`FOUNDRY_URL` unset, or the full run has
no TTY) · `3` usage error (unknown flag, invalid URL).

**Evidence:** `docs/perf/phase-0/adr-0016-direct-sideload-<ISO>.json`, holding the check
verdicts only. URLs, credentials and QR payloads are never written. On NO-GO the script
prints the documented fallback: serve Foundry and the g2 bundle behind a **same-site
reverse-proxy subdomain**.

---

## 🔐 Revoke

1. GM: **Pair G2 glasses** → **Revoke** next to the device → **Confirm revoke**.
2. The module sends a sealed `{t:'revoked'}` to the device, deletes the "(G2)" user and
   forgets the key. The glasses go back to the "not paired" screen (S10).
3. If the device was offline, the console logs `could not notify … of revocation`. The
   user is deleted anyway, so the next login fails with *credentials rejected*.

Revoke right away if a phone is lost. Don't delete the "(G2)" user from *User
Management*, because the device metadata would stay behind.

## 🔐 Re-pair

Re-pair when you changed the GM browser or computer, cleared browser data, changed the
character, or when the phone shows *credentials rejected*.

1. From the browser **the GM will use during play**, open **Pair G2 glasses**.
2. Pick the same player: the same "(G2)" user is refreshed (tagged
   `flags.evenfoundryvtt.g2For`). Pick the character → **Generate new QR**.
3. On the phone: scan again. If the page is stuck on old credentials, use
   *Diagnostics* → **Forget pairing** first.

---

## 🐞 Common errors and recovery

| Symptom | Diagnosis | Recovery |
|---|---|---|
| *no GM connected* although the GM is in the world | The active GM is not the browser that paired (keys missing), or the GM tab is suspended | Bring the pairing GM's tab to the front, or re-pair from the active GM's browser. |
| Certificate warning / blank page on the phone | Self-signed or expired certificate | Put Foundry behind Let's Encrypt, Tailscale or a trusted proxy. Re-run the harness `reachable` check. |
| `g2-entry` NO-GO / pair dialog ✗ module served | `g2/` missing | Reinstall the release zip, or run `pnpm --filter @evf/foundry-module build:all` for a dev symlink. |
| Connects, then *Foundry not responding* every ~minute | Proxy drops idle WebSockets or doesn't forward the upgrade | Forward `Upgrade`/`Connection` and raise the proxy read timeout. |
| *credentials rejected* right after scanning | The QR had expired (5 min) or was already used | Generate a new QR. |
| Sheet updates, map frozen or glyph-only | BLE throughput low; the map is ≤ 1 fps with 100 ms image pacing | Move the phone closer to the glasses. The map recovers after two good frames. |
| Actions return `forbidden_actor` | The request targeted another actor | Only the paired character can act. Re-pair for a different character. |
| Actions return `actor_missing` on connect | The paired character was deleted | Re-pair with an existing character. |
| Attack posts a card but no rolls | midi-qol not active: vanilla `activity.use()` only posts the card | Enable midi-qol for full automation. |

---

## 📚 See also

- [Setup guide](setup-guide.md) · [Firmware compatibility](firmware-compatibility.md)
- [ADR-0016](architecture/0016-direct-foundry-streaming.md) · [ADR-0011](architecture/0011-foundry-write-path-single-workflow-origin.md)
- [G2 sheet UX](design/g2-sheet-ux.html) — S10 not paired · S11 connecting · S12 offline ([screenshots](design/img/))
- [G2 thirds layout](design/g2-thirds-layout.md) — superseded layout; pairing mocks P01–P03 still current
- [`packages/foundry-module/README.md`](../packages/foundry-module/README.md) — security model
