---
"@evf/foundry-module": patch
---

Add `readme`, `manual`, `bugs`, and `changelog` links to `module.json` so the Foundry
package listing surfaces the GitHub README, the showcase guide
(`https://aiacos.github.io/EvenFoundryVTT/showcase/`), the issue tracker, and the
releases changelog. (CI-only, no package change: the tagged-release CD now also packs
and attaches the submission-ready Even Hub `evenfoundryvtt.ehpk` as a permanent GitHub
Release asset, and `release.yml` gains `actions: write` so the tagged release auto-builds
without a manual `workflow_dispatch`.)
