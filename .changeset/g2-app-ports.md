---
"@evf/g2-app": minor
---

Ports from the bridge-era g2-app, re-implemented for the direct channel:

- GM roll request: besides «Done» (real dice at the table), the request view can roll the
  check / skill / saving throw in Foundry (`skill-check` tool, current advantage).
- Consumables pick a target like weapons (`use-item` `targets`; «no target» = self).
- Read-only «Feats…» list (origin feats tagged) when the sheet carries feats.
- Phone «Diagnostics» shows the EVF module version from `welcome.moduleVersion` and warns
  when the glasses app was built for a different module version.
- Lifecycle: `ABNORMAL_EXIT_EVENT` closes the connection gracefully (app-submission QA);
  a press counts only from a real touch source (`sysEvent.eventSource` 1–3).
- `app.json`: description, icon, `min_app_version`, `min_sdk_version` 0.0.15 and a version
  kept equal to the package version (`scripts/sync-app-json.mjs`, run by `version-packages`).
