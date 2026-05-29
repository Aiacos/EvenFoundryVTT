---
"@evf/foundry-mcp": patch
"@evf/bridge": patch
---

Internal/CI quality work — no external behavior change. Extract `bearerEquals` to a tested `foundry-mcp/src/security/bearer-equals.ts` helper (behavior-preserving import-swap), add real branch-coverage tests for `foundry-mcp` (bridge-client, logger) and `bridge` routes (scene/character/combat), and exclude un-instrumentable boot/worker files (`g2-app raster-worker.ts`, `foundry-mcp` boot `http.ts`/`index.ts`) from coverage. Also fixes `changeset:status` to compare against `origin/main` (CI runners have no local `main` ref).
