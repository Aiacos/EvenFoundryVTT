# Bridge Release & Distribution

Operator runbook for consuming the EvenFoundryVTT bridge Docker image published to
GitHub Container Registry (GHCR) and for running it via Docker Compose.

---

## 1. Image location

Every GitHub Release of EvenFoundryVTT triggers the `build-bridge-ghcr` job in
`.github/workflows/foundry-module-release.yml`, which builds `deploy/bridge.Dockerfile`
(multi-stage `node:24-alpine`) and pushes two tags to GHCR:

| Tag | Use case |
|-----|----------|
| `ghcr.io/aiacos/evf-bridge:<version>` | Version-pinned; use in `docker-compose.yml` for reproducible deploys |
| `ghcr.io/aiacos/evf-bridge:latest` | Always points at the most recent stable release |

The image is published at:

```
ghcr.io/aiacos/evf-bridge
```

---

## 2. One-time first-push visibility step (REQUIRED)

**After the very first release that pushes the bridge image, the package defaults to
private.** GHCR creates new packages as private regardless of repository visibility.
`docker pull ghcr.io/aiacos/evf-bridge:latest` will return `unauthorized` or `denied`
for unauthenticated users until you flip the setting.

**Manual step (not automatable via `GITHUB_TOKEN`):**

1. Go to: **GitHub → Your profile → Packages**
2. Find the package named **`evf-bridge`**
3. Click **Package settings** (gear icon, bottom of the left sidebar)
4. Under **Danger Zone → Change visibility** → select **Public**
5. Confirm

**Verification:** After setting to Public, run from any machine (no auth):

```bash
docker pull ghcr.io/aiacos/evf-bridge:latest
```

This step is one-time only; subsequent releases continue pushing to the same package,
which stays Public.

---

## 3. Pulling and running the pre-built image

### 3.1 Direct pull

```bash
docker pull ghcr.io/aiacos/evf-bridge:latest
```

To pull a specific version (recommended for reproducible homelab deploys):

```bash
docker pull ghcr.io/aiacos/evf-bridge:0.1.0
```

Version-pinned tags are listed on the
[GitHub Releases page](https://github.com/Aiacos/EvenFoundryVTT/releases).

### 3.2 Via Docker Compose (recommended)

The default `deploy/docker-compose.yml` uses `build: context: ..` which builds the
image locally — this is the recommended path for local development.

For homelab deploys where you want to pull the pre-built image instead of building
from source, substitute the `image:` directive for the `build:` block:

```yaml
services:
  bridge:
    # Replace the build: block below with the image: line to use the pre-built GHCR image
    # image: ghcr.io/aiacos/evf-bridge:0.1.0
    build:
      context: ..
      dockerfile: deploy/bridge.Dockerfile
    ...
```

> **Do NOT remove the `build:` block** — it is the primary dev workflow and must remain
> in the committed file. The `image:` substitution is an operator-side opt-in documented
> here for reference.

To use the pre-built image at runtime without modifying the committed file, create a
`docker-compose.override.yml` in `deploy/`:

```yaml
# deploy/docker-compose.override.yml (not committed — add to .gitignore if needed)
services:
  bridge:
    build: !reset null
    image: ghcr.io/aiacos/evf-bridge:0.1.0
```

Then run:

```bash
cd deploy/
docker compose up -d
```

Docker Compose automatically merges `docker-compose.yml` with `docker-compose.override.yml`.

---

## 4. Required environment variables

The bridge requires two environment variables before it will start. Copy
`deploy/.env.example` to `deploy/.env` and fill in:

| Variable | Required | How to generate / set |
|----------|----------|-----------------------|
| `EVF_INTERNAL_SECRET` | **Yes** | `openssl rand -base64 32` — 32-byte random secret for bridge ↔ Foundry module auth (§11.5.4). The bridge refuses to start if missing or empty. |
| `EVF_PLUGIN_HOST_URL` | **Yes** | Origin-complete URL of your G2 app static host (e.g. `https://g2app.yourdomain.com`). **No wildcards.** Per Specs.md §3.3 Even Hub network constraint. |

See `deploy/.env.example` for the full variable list including optional Phase 11/12 vars
(`EVF_BEARER`, `EVF_BRIDGE_URL`, `DEEPGRAM_API_KEY`, etc.).

### Quick start

```bash
cd deploy/
cp .env.example .env
# Edit .env:
#   EVF_INTERNAL_SECRET=$(openssl rand -base64 32)
#   EVF_PLUGIN_HOST_URL=https://g2app.yourdomain.com
docker compose up -d
```

Verify the bridge is healthy:

```bash
curl http://localhost:8910/healthz
# → 200 OK: {"status":"ok"}
```

---

## 5. Ops endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /healthz` | None | Liveness — always 200 if process is up |
| `GET /readyz` | None | Readiness — 200 if `EVF_INTERNAL_SECRET` is set, 503 otherwise |
| `GET /metrics` | None | Prometheus metrics |
| `GET /v1/health` | Bearer | Authenticated health — tests token validity |
| `GET /v1/tools` | Bearer | Returns registered tool list |

---

## 6. Re-running a failed release (idempotent workflow)

If the `build-bridge-ghcr` job fails mid-push:

1. Open **GitHub → Actions → Foundry Module Release → Run workflow**
2. Enter the tag (e.g. `v0.1.0`) in the `workflow_dispatch` input
3. The `build-bridge-ghcr` job re-runs; `docker/build-push-action@v7` re-pushes the
   same tags with `--push` — GHCR overwrites silently (no duplicate error)

---

## 7. Sources

- `deploy/bridge.Dockerfile` — multi-stage `node:24-alpine` builder + runner
- `deploy/docker-compose.yml` — `build: context: ..` homelab Compose
- `deploy/.env.example` — environment variable contract
- `.github/workflows/foundry-module-release.yml` — `build-bridge-ghcr` job (REL-02)
- [GitHub docs — Publishing Docker images](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images)
- [GHCR package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
