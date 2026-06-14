# Deferred items (Batch 3 — T6/T7/T8)

## Pre-existing lint infos in packages/bridge/src/server.ts (NOT touched by Batch 3)

Biome `useLiteralKeys` info-level (not errors) on lines I did not modify:
- server.ts:586/587 — `process.env['EVF_FOUNDRY_ORIGIN_HOST']`
- server.ts:852 — `process.env['DEEPGRAM_API_KEY']`
- server.ts:862 — `process.env['EVF_DEEPGRAM_URL_OVERRIDE']`

These predate this batch (portrait/deepgram wiring). `info` severity does not fail
`biome ci`. Out of scope per the task's SCOPE BOUNDARY — left untouched.
