# Even Hub publishing runbook (g2-app plugin)

How the EvenFoundryVTT G2 plugin (`packages/g2-app`) is packaged and submitted to the
Even Hub. Closes **DIST-EHUB-01**.

## What the CI/CD does automatically (every merge to `main`)

`.github/workflows/evenhub-pack.yml` runs on every push to `main`:

1. Builds `g2-app` (`pnpm --filter @evf/g2-app build` → `dist/`).
2. Syncs `app.json` `version` from the Changesets-managed `packages/g2-app/package.json`.
3. Packs + validates the manifest/build into `evenfoundryvtt.ehpk` (`evenhub pack`).
4. Uploads `evenfoundryvtt.ehpk` as a build artifact (90-day retention).

The latest submission-ready `.ehpk` is therefore always available from the workflow run.

## Why submission is NOT fully automated (INV-2, 2026-05-31)

Verified against `hub.evenrealities.com/docs/reference/{cli,app-submission}` + the
`everything-evenhub:build-and-deploy` skill:

- The Even Hub CLI (`@evenrealities/evenhub-cli`) exposes only `login`, `init`, `qr`,
  `pack` — **there is no `publish`/`submit`/`deploy`/`upload` command.**
- `evenhub login` is **interactive** — no documented token / env-var / non-interactive
  auth for CI.
- The final submission is a **manual upload to the Even Hub developer portal**, which
  runs compatibility checks and a **review/approval** gate before the app goes live.

So a literal "auto-publish to the hub on every merge" is not possible with the current
tooling. The workflow automates everything up to (and including) producing the validated
`.ehpk`; the portal submission is the one manual step. If Even Realities later ships a
non-interactive submit command + token, wire the gated step already stubbed at the bottom
of `evenhub-pack.yml` (it expects an `EVENHUB_TOKEN` GitHub secret).

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
| `entrypoint` | `index.html` | must exist in the build output (`dist/`) |
| `supported_languages` | `["it","en"]` | from `en,de,fr,es,it,zh,ja,ko` |
