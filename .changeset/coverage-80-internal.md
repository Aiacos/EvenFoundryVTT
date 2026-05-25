---
---

Internal/CI only — no package release impact. Extract `bearerEquals` to a tested `foundry-mcp/src/security/bearer-equals.ts` helper (behavior-preserving import-swap), add real branch-coverage tests, and exclude un-instrumentable boot/worker files (`raster-worker.ts`, `foundry-mcp` boot `http.ts`/`index.ts`) from coverage. Also fix `changeset:status` to compare against `origin/main` (CI runners have no local `main` ref).
