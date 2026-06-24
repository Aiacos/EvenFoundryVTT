# Phase-8 write channel — redeploy notes (module v0.1.39 + bridge)

Write tools (cast-spell / use-item / **skill-check**) now actually execute in
Foundry via a poll-based reverse channel. **Both** the Foundry module AND the
bridge must be redeployed together — the module's poller talks to two NEW bridge
routes (`/internal/tool-requests`, `/internal/tool-result`).

## 1. Foundry module → v0.1.39 (done — released)

- The Forge manifest tracks `releases/latest/download/module.json` → **0.1.39**.
- On The Forge: **Check for Updates** (or reinstall from the manifest) → **reload
  the world** so the new `ready` hook registers the GM-side tool-invocation poller.

## 2. Bridge → rebuild from source (REQUIRED)

The deployed bridge image is built from source (`deploy/bridge.Dockerfile`,
build context = repo root), so it must be rebuilt to gain the queue + routes.

On the homelab host:

```bash
# 1. Get the new source (the change is on feat/hud-raster-rendering, also merged to main/develop)
cd /path/to/EvenFoundryVTT
git fetch origin && git checkout main && git pull        # or the deployed branch

# 2. Rebuild + restart the bridge container
cd deploy/
docker compose up -d --build bridge

# 3. Verify health + the new routes exist (401 without the internal secret = route present)
curl -fsS http://127.0.0.1:8910/healthz
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8910/internal/tool-requests   # expect 401 (auth required)
```

`deploy/.env` `EVF_INTERNAL_SECRET` must equal the module's `bridgeInternalSecret`
world setting (already true for the existing `/internal/delta` channel — the poller
reuses the same secret).

## 3. Runtime requirements

- **A GM client must be online.** The poller runs writes in GM context (ADR-0011);
  with no GM connected, a `tool.invoke` resolves `foundry_timeout` after 10s.
- **Writes require a REAL bearer** bound to a user who OWNS the acting actor
  (ADR-0014). The per-actor write authz (`dispatchToolAuthorized`) is enforced
  ALWAYS — even with `EVF_DEV_NO_AUTH=true`, the dev sentinel token does NOT resolve
  to a Foundry user, so it is **denied** (`not_authorized`) for writes. For dev
  testing pass a real token via the g2-app `?token=<bearer>` param so writes for the
  bearer's owned actors are authorized. (No-auth still bypasses the READ path only.)

## 4. Smoke test (end to end)

1. Open the app with a real token + actor: `…/?token=<bearer>&actor=<ownedActorId>`.
2. Tap → Quick Action menu (`[K] Abilità`) → open Skill panel → tap a skill.
3. With a GM online, the roll appears in Foundry chat (as if the sheet button was
   clicked). `docker logs evf-bridge` shows the `/internal/tool-requests` drain +
   `/internal/tool-result` POST round-trip.
