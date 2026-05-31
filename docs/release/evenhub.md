# Even Hub publishing runbook (g2-app plugin)

How the EvenFoundryVTT G2 plugin (`packages/g2-app`) is packaged and submitted to the
Even Hub. Closes **DIST-EHUB-01**.

## What the CI/CD does automatically (maximum possible automation)

Two automated paths produce the submission-ready `.ehpk`:

1. **Every push to `main`** — `.github/workflows/evenhub-pack.yml`:
   builds `g2-app` → syncs `app.json` `version` from `packages/g2-app/package.json` →
   `evenhub pack` → uploads `evenfoundryvtt.ehpk` as a **build artifact** (90-day retention).
2. **Every tagged release** — `.github/workflows/foundry-module-release.yml` (`build-g2app-zip`
   job): same build + pack, then attaches `evenfoundryvtt.ehpk` as a **permanent GitHub
   Release asset** alongside `module.json`, `evenfoundryvtt.zip`, and `g2-app-dist.zip`.

So the latest submission-ready `.ehpk` is always one download away — either the workflow run
or, for releases, `https://github.com/Aiacos/EvenFoundryVTT/releases/latest`.

## Why submission is NOT fully automated (INV-2, re-verified 2026-05-31)

Re-verified against `hub.evenrealities.com/docs/reference/{cli,app-submission}`, the live
`evenhub --help` of **CLI 0.1.13** (latest), AND the CLI source (`main.js`):

- The Even Hub CLI exposes only `login`, `init`, `pack`, `qr` — **there is no
  `publish`/`submit`/`deploy`/`upload` command** (confirmed in 0.1.13 `--help`).
- `evenhub login` takes only `-e/--email`; the password is prompted **interactively** — no
  documented token / env-var / non-interactive login for CI.
- App-submission doc verbatim: *"Every app submitted to Even Hub goes through a **manual
  review**."* Submission is a **manual upload to the developer portal**, review/approval-gated.

### Private API surface found in the CLI (NOT used — documented for completeness)

The CLI talks to a private REST API at `https://hub.evenrealities.com/api/v1/…`
(overridable via `EVENHUB_BASE_URL` / `EVENHUB_API_URL`, extra headers via `EVENHUB_API_HEADERS`):

- `POST /api/v1/auth/login {email, password}` → access/refresh tokens (header `X-Even-Authorization`).
- `POST /api/v1/auth/refresh`, `GET /api/v1/auth/self_check`.
- `POST /api/v1/apps/check {package_id}` (the `pack -c` availability check — **needs auth**).

A non-interactive login is therefore *technically* possible, **but there is NO documented app
upload/submit endpoint** (none in the CLI, none in the docs), and any use of this private API
would be unsupported, fragile, possibly against ToS, and still review-gated. We deliberately do
**not** build CI on it. The day Even ships a real CI submit command + token, enable the gated
step stubbed at the bottom of `build-g2app-zip` in `foundry-module-release.yml` (and in
`evenhub-pack.yml`) — it expects an `EVENHUB_TOKEN` secret; no other change needed.

## One-time prerequisites before the first submission

1. **Set the real network whitelist** in `packages/g2-app/app.json` → `permissions[0].whitelist`.
   Replace the `REPLACE-WITH-YOUR-ORIGIN.example` placeholders with the **origin-complete,
   wildcard-free** URLs of your deployed bridge and plugin host (e.g.
   `https://evf-bridge.yourhome.net`, `https://evf-plugin.yourhome.net`). The WebView
   enforces this list at runtime; wrong/placeholder origins → the plugin cannot reach the
   bridge.
2. **Verify `min_app_version`** (`2.0.0` placeholder) against your target Even Realities
   App version, and `package_id` availability:
   `npx @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/g2-app/dist -c`.

## Manual submission steps

1. Download `evenfoundryvtt.ehpk` from the latest `Even Hub Pack` workflow run (or build
   locally: `pnpm --filter @evf/g2-app build && npx @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/g2-app/dist -o evenfoundryvtt.ehpk`).
2. Log in to the Even Hub developer portal.
3. Upload the `.ehpk`, complete the listing metadata, and submit for review.
4. After approval the plugin is available to Even Hub G2 users.

## Manifest field notes (`app.json`)

| Field | Value | Constraint |
|-------|-------|------------|
| `package_id` | `io.github.aiacos.foundryvtt` | reverse-domain, lowercase, no hyphens, ≥2 segments, each segment starts with a letter |
| `edition` | `202601` | exact |
| `name` | `FoundryVTT G2 HUD` | ≤20 chars (avoid "Even") |
| `version` | synced from `g2-app/package.json` | semver, no `v` prefix |
| `min_app_version` / `min_sdk_version` | `2.0.0` / `0.0.10` | both required; SDK floor `0.0.10` |
| `entrypoint` | `index.html` | must exist at the build-output root. `vite.config.ts` uses `root: 'src'` + `outDir: '../dist'` so the entry emits as `dist/index.html` (not `dist/src/index.html`) — keeping the canonical `index.html` entrypoint. |
| `supported_languages` | `["it","en"]` | from `en,de,fr,es,it,zh,ja,ko` |

## Canonical Even Hub references (INV-2)

Authoritative upstream for the packaging pipeline. Re-verify against these before any
change (INV-2); aggregator/blog/AI-summary sources are not authoritative.

| Topic | Canonical URL | Used for |
|-------|---------------|----------|
| Execution model + dev workflow | <https://hub.evenrealities.com/docs/getting-started/overview> | *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* — 5-step workflow (write → preview → test → **pack** → submit). |
| CLI reference | <https://hub.evenrealities.com/docs/reference/cli> | Commands `login` / `init` / `qr` / `pack` only — **no `publish`/`submit`/`upload`** (portal submit is manual). `evenhub pack app.json dist -o myapp.ehpk` (`-c` = online `package_id` availability check). |
| Packaging | <https://hub.evenrealities.com/docs/reference/packaging> | `.ehpk` format + manifest field rules. |
| App submission & QA | <https://hub.evenrealities.com/docs/reference/app-submission> | Manual portal upload + review/approval gate (why the CD stops at the artifact). |
| Device APIs | <https://hub.evenrealities.com/docs/guides/device-apis> | Hardware envelope + `network` whitelist enforcement that the manifest `permissions` declares. |

npm tooling: `@evenrealities/evenhub-cli` (used by `.github/workflows/evenhub-pack.yml`),
`@evenrealities/evenhub-simulator` (local preview — `evenhub-simulator http://localhost:5173`),
`@evenrealities/even_hub_sdk` (plugin SDK; the g2-app types live in
`packages/g2-app/src/types/even-hub.d.ts`).
