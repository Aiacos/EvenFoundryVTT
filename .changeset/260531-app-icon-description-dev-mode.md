---
"@evf/g2-app": patch
---

Add an Even Hub-compatible app icon and a `description` to the plugin manifest, and document the
dev-mode test flow (fixing the "trial version expired" trap).

- `app.json` now carries `description` + `icon` (`icon.png`), bundled into the `.ehpk` (the Even
  Hub `pack` accepts both fields). The icon is a greyscale d20 (Even Hub requires monochrome
  foreground + background), regenerable via `assets/generate-icon.py`; the same icon is reused as
  the Docker image / Compose icon (OCI label).
- New scripts: `pack:ehpk` (fresh build + pack) and `dev:qr` (`evenhub qr` for on-device dev mode
  with hot reload — the no-expiry path; `.ehpk` portal trials expire). Documented in README, the
  Even Hub runbook, and the wiki (`docs/wiki/Testing-and-Distribution.md`).
