# EvenFoundryVTT — Simulator Testing

This document describes the one-command dev/test loop for iterating on the G2 app HUD without
physical glasses. It uses the `@evenrealities/evenhub-simulator` to render the HUD locally and
expose a screenshot/console/input API for automated observation.

INV-3 note: this is additive operational documentation consistent with `Specs.md`. No
`Specs.md` or `docs/showcase/index.html` change is expected or required.

---

## Prerequisites

### 1. Toolchain

Use `corepack pnpm` — never bare `pnpm`. The workspace is pinned to
`pnpm@10.33.4` via `packageManager` in `package.json`. Corepack ensures the exact version:

```bash
corepack pnpm --version   # should print 10.33.4
```

### 2. EvenHub simulator binary

The simulator is available globally on this box:

```bash
command -v evenhub-simulator   # /home/linuxbrew/.linuxbrew/bin/evenhub-simulator
```

`scripts/sim.sh` auto-detects the binary. If `evenhub-simulator` is not on `PATH`, it falls
back to `npx @evenrealities/evenhub-simulator` automatically — no manual install required.

### 3. Headless Linux — xvfb + GTK packages

On a headless server (no `DISPLAY`), the simulator requires:

```bash
sudo apt-get install -y xvfb libgtk-3-0 libglib2.0-0 libgdk-pixbuf2.0-0
```

`scripts/sim.sh` detects `DISPLAY` and automatically sets the mandatory GTK environment
variables on headless:

```
XDG_DATA_DIRS=/usr/share:/usr/local/share:/home/linuxbrew/.linuxbrew/share
GDK_PIXBUF_MODULE_FILE=/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache
GSK_RENDERER=cairo
LIBGL_ALWAYS_SOFTWARE=1
```

Without this block the simulator crashes with glycin-loaders / GdkPixbuf errors. The script
handles it automatically — no manual export is needed.

### 4. No real Foundry instance required

The harness uses the bridge in `EVF_DEV_NO_AUTH` mode with pre-seeded JSON fixtures. No
Foundry VTT, no real database — everything is served from the committed `scripts/sim-fixtures/`
files.

---

## The single command

```bash
pnpm sim start
```

That's it. The script:

1. Kills any prior session on ports 8911, 5173, 9898 via `fuser -k` (idempotent).
2. Starts the **bridge** on port 8911 with `EVF_DEV_NO_AUTH=true` + `EVF_INTERNAL_SECRET=dev-secret`
   + `NODE_ENV=development` (no bearer token needed for any request).
3. **Seeds** all four character fixtures via `POST /internal/delta` — roster first, then
   Artemis, Dante, Karius, and Shin. The bridge validates each payload against
   `CharacterSnapshotSchema` before caching — a 200 response is the schema-validity proof.
4. Starts **Vite** on port 5173 with `VITE_EVF_NO_AUTH=true` +
   `VITE_EVF_DEV_BRIDGE_URL=http://localhost:8911`.
5. Launches the **EvenHub simulator** on port 9898, pointed at `http://localhost:5173/`
   (with `?actor=<id>` appended when `--actor` is supplied).
6. Waits for all three services to be healthy (HTTP 200 gates + `/api/ping` body check).
7. Prints the services cheatsheet with actorIds, observation commands, and teardown.

### Select which PC the glasses render

Pass `--actor ACTORID` to select a character. The `?actor=<id>` query is appended to the
simulator target URL before launch — appending it after the simulator starts has no effect
(known footgun; the script handles it correctly):

```bash
pnpm sim start --actor 6KWxQXAiJgz4zKlS   # Dante Lanzulli
pnpm sim start --actor 4GXG7ufxylS4H1Pk   # Karius Frede
pnpm sim start --actor VoNfASW4hQ4dG4cv   # Shin
pnpm sim start                             # default: Artemis (E14Tfh9Ba07cpPyM)
```

---

## Roster actorIds

| PC | actorId | hp/maxHp | ac |
|----|---------|----------|----|
| Artemis (default) | `E14Tfh9Ba07cpPyM` | 55/88 | 18 |
| Dante Lanzulli | `6KWxQXAiJgz4zKlS` | 41/63 | 16 |
| Karius Frede | `4GXG7ufxylS4H1Pk` | 70/70 | 20 |
| Shin | `VoNfASW4hQ4dG4cv` | 12/48 | 14 |

All four PCs are level 10 and are visually distinguishable by hp/maxHp and ac on the HUD.

---

## How to iterate

### Vite HMR — edit g2-app source

With Vite running (`pnpm sim start`), editing any file under `packages/g2-app/src/` triggers
hot module replacement. The EvenHub simulator's WebView automatically reloads the updated code
within ~1s — no manual restart needed.

### Bridge restart — re-seed

The bridge in-memory cache is **wiped on every restart**. If you restart the bridge
independently (e.g. after a source change), re-seed the fixtures:

```bash
pnpm sim seed
```

This POSTs all five fixtures to `http://localhost:8911/internal/delta` in the correct order
(roster first, then the four character snapshots). It is equivalent to the seeding step that
`pnpm sim start` runs automatically.

### Full restart

```bash
pnpm sim start               # tears down existing session, starts fresh, re-seeds
pnpm sim start --actor <id>  # same with a specific PC
```

---

## How to observe

### Screenshot — glasses framebuffer

Capture the current 576×288 RGBA png from the glasses viewport:

```bash
pnpm sim shot /tmp/glasses.png
# or equivalently:
curl -s http://127.0.0.1:9898/api/screenshot/glasses -o /tmp/glasses.png
```

The `shot` subcommand defaults to `/tmp/glasses.png` when no path is given:

```bash
pnpm sim shot           # saves to /tmp/glasses.png
```

### Console log — g2-app stdout in the simulator

```bash
curl -s http://127.0.0.1:9898/api/console
```

Returns the accumulated console output from the g2-app running inside the simulator's WebView.
Useful for inspecting `[EVF]` boot messages, WS handshake results, and render errors.

### Input events — simulate R1 ring gestures

```bash
# R1 tap (primary action)
curl -s -X POST http://127.0.0.1:9898/api/input \
  -H 'Content-Type: application/json' \
  -d '{"action":"tap"}'

# R1 double-tap (exit / close panel)
curl -s -X POST http://127.0.0.1:9898/api/input \
  -H 'Content-Type: application/json' \
  -d '{"action":"double-tap"}'

# R1 swipe up (navigate / scroll up)
curl -s -X POST http://127.0.0.1:9898/api/input \
  -H 'Content-Type: application/json' \
  -d '{"action":"swipe-up"}'

# R1 swipe down
curl -s -X POST http://127.0.0.1:9898/api/input \
  -H 'Content-Type: application/json' \
  -d '{"action":"swipe-down"}'
```

See `hub.evenrealities.com/docs/guides/input-events` for the full gesture set
(`press / double-press / swipe-up / swipe-down`).

---

## No-auth model

The bridge runs with `EVF_DEV_NO_AUTH=true` + `NODE_ENV=development`. This bypasses the
bearer token check for all API endpoints (`/v1/*` and `/internal/delta`). The no-auth gate
is implemented in `packages/bridge/src/auth/is-dev-no-auth.ts` — it requires **both** flags
simultaneously; production `NODE_ENV` always blocks it.

The `DEV_SECRET` (`dev-secret`) is a throwaway local value — safe to commit, never used in
production. Production secrets live in `deploy/.env` (`EVF_INTERNAL_SECRET`).

For the production auth model (bearer token, QR pairing, BridgeConfigDialog), see
`docs/self-hosting.md`.

---

## Teardown

```bash
pnpm sim stop
```

Kills processes on ports 8911, 5173, and 9898 using `fuser -k`:

```bash
fuser -k 8911/tcp
fuser -k 5173/tcp
fuser -k 9898/tcp
```

`fuser -k` targets the specific port listener, not a process name. Process-name-based kill
(e.g. by `vite` or `evenhub` patterns) would self-match the script's own command line — this
is a known footgun that `fuser` avoids entirely.

After `pnpm sim stop`, connections to all three services will immediately fail. You can verify:

```bash
curl http://localhost:8911/healthz   # should fail with "Connection refused"
```

---

## Subcommands reference

| Command | Description |
|---------|-------------|
| `pnpm sim start` | Boot bridge + seed + vite + simulator (idempotent) |
| `pnpm sim start --actor ACTORID` | Same, with specific PC selected |
| `pnpm sim stop` | Tear down all three services (fuser -k on 8911/5173/9898) |
| `pnpm sim seed` | Re-seed fixtures into a running bridge |
| `pnpm sim shot [PATH]` | Capture glasses screenshot (default: `/tmp/glasses.png`) |

---

## Runtime files

The script writes pid files and log files to `.sim-run/` (gitignored):

```
.sim-run/
  bridge.pid   bridge.log
  vite.pid     vite.log
  sim.pid      sim.log
```

Tail any log for live output:

```bash
tail -f .sim-run/bridge.log
tail -f .sim-run/vite.log
tail -f .sim-run/sim.log
```

---

## Schema-validity proof

The bridge validates every `character.delta` payload against `CharacterSnapshotSchema`
(from `packages/shared-protocol/src/payloads/character.ts`) before caching. A 200 response
from `GET /v1/character/:actorId` is the authoritative proof that a fixture is schema-valid:

```bash
# After pnpm sim start, verify all 4 actorIds:
for id in E14Tfh9Ba07cpPyM 6KWxQXAiJgz4zKlS 4GXG7ufxylS4H1Pk VoNfASW4hQ4dG4cv; do
  curl -fsS -o /dev/null -w "GET /v1/character/$id → %{http_code}\n" \
    "http://localhost:8911/v1/character/$id"
done
# All four should return 200.
```

If a fixture is edited and becomes schema-invalid, the bridge returns 400 on the POST
(seeding fails) and the actorId is absent from the cache (GET returns 404).

See `scripts/sim-fixtures/README.md` for the actorId table and schema contract pointers.
