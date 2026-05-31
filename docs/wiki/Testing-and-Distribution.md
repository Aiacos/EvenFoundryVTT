# Testing & Distribution

How to get the G2 plugin (`packages/g2-app`) onto the glasses — and how to ship it to Even Hub.
There are **two different paths**; confusing them causes the Even app's **"trial version expired"** error.

## TL;DR

| | **Dev mode** (iterate) | **`.ehpk`** (ship / short test) |
|---|---|---|
| Tool | `evenhub qr` → scan with the Even app | Even Hub developer **portal** upload |
| Loads | your **live dev server** (`http://<LAN-IP>:5173`), **hot reload** | the packaged `.ehpk` bundle |
| Expiry | **none** | **trial uploads EXPIRE** → *"versione di prova scaduta"* |
| Permanent install | — | only after a **portal submission Even approves** |

> Even docs (verbatim, `hub.evenrealities.com/docs/reference/cli`): *"Scan the QR code with the Even
> Realities App on your phone. Your app loads on the glasses with hot reload support."* and
> *"For development mode with the Even app, the `qr` command is the only command you need."*

## 1. Dev mode — test on the glasses with no expiry

```bash
pnpm --filter @evf/g2-app dev        # vite dev server on :5173
pnpm --filter @evf/g2-app dev:qr     # prints a QR for http://<LAN-IP>:5173
```

Phone and machine on the **same LAN**. Scan the QR in the Even Realities app → the plugin loads on
the G2 and hot-reloads on every save. This is the right loop for day-to-day development. **No `.ehpk`,
no expiry.**

## 2. `.ehpk` — package for distribution (or a short private test)

```bash
pnpm --filter @evf/g2-app pack:ehpk  # fresh build + pack → packages/g2-app/evenfoundryvtt.ehpk
```

CI also attaches a fresh `evenfoundryvtt.ehpk` to **every GitHub Release** (`foundry-module-release.yml`),
so the latest [release asset](https://github.com/Aiacos/EvenFoundryVTT/releases/latest) is always current.

**"Trial version expired" fix:** a portal *trial/test* upload is time-limited. For ongoing testing use
**dev mode** (§1). If you must re-test via an upload, **regenerate a fresh `.ehpk` and re-upload** — a new
upload resets the window. The `.ehpk` carries no expiry itself; the limit is a portal trial policy.

### Why auto-submit to Even Hub is not possible (INV-2, re-verified 2026-05-31)

Even Hub CLI **0.1.13** exposes only `login` / `init` / `pack` / `qr` — there is **no
`publish`/`submit`/`upload` command**, `login` is interactive, and submission is a **manual portal upload +
manual review**. A private `/api/v1/` surface exists in the CLI (auth/login, apps/check) but has **no app
upload endpoint** and is unsupported — deliberately not used. See
[`docs/release/evenhub.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/main/docs/release/evenhub.md).

## 3. Manual submission (the only path to a permanent Even Hub install)

1. Deploy the **bridge** (`ghcr.io/aiacos/evf-bridge:latest`) + the **plugin host** (`g2-app-dist.zip`) on real
   HTTPS origins.
2. In `packages/g2-app/app.json` → `permissions[0].whitelist`, replace the `REPLACE-WITH-YOUR-ORIGIN.example`
   placeholders with those real origins (origin-complete, no wildcards).
3. Rebuild the `.ehpk` (`pnpm --filter @evf/g2-app pack:ehpk`, or take the latest Release asset).
4. `npx @evenrealities/evenhub-cli login -e you@email.com`, then upload the `.ehpk` at the **Even Hub
   developer portal**, complete the listing (see Icon below), and submit for review.
5. After Even Realities approves → the app is live for G2 users.

## 4. App icon (Even Hub listing + project logo)

Even Hub requires a **greyscale** icon with **both a foreground and a background** image (color is rejected,
must be legible). The repo ships a stylised **d20** icon, regenerable:

```bash
python3 assets/generate-icon.py   # → assets/icon/{icon,icon-foreground,icon-background}.png (512×512, greyscale)
```

- Portal upload: `assets/icon/icon-foreground.png` + `assets/icon/icon-background.png`.
- The composite `icon.png` is bundled into the `.ehpk` (`app.json` `icon` field) and reused as the
  Docker image / Compose icon (OCI label `com.evenfoundryvtt.icon`).

## Local deploy quick reference

```bash
docker compose -f deploy/docker-compose.yml up -d bridge   # container: evf-bridge, project: evenfoundryvtt
docker compose -f deploy/docker-compose.yml logs -f bridge
curl http://localhost:8910/healthz
```
