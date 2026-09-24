---
"@evf/g2-app": patch
"@evf/foundry-module": patch
---

Even Hub manifest: drop `min_app_version` (optional since SDK 0.0.14; the packer stamps the floor of the SDK we build against, now pinned with `--sdk-ver`). The module release ships the refreshed `.ehpk`. Adds `pnpm wizard` for one-command G2 hardware tests (LAN server + QR).
