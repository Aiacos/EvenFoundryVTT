# sim-fixtures

Committed, schema-valid JSON fixtures for the EvenFoundryVTT EvenHub simulator dev/test loop.

## What these files are

Each file is a complete `/internal/delta` request body: a JSON object with two top-level keys,
`type` and `payload`. They are seeded into a locally running bridge (no-auth dev mode) by
`scripts/sim.sh` on every `pnpm sim start` (and `pnpm sim seed`).

The bridge validates every `character.delta` payload against `CharacterSnapshotSchema` before
caching. A 200 response from `GET /v1/character/:actorId` is the authoritative proof that a
fixture is schema-valid.

## Files

| File | Type | Purpose |
|------|------|---------|
| `roster.json` | `r1.characters.available` | 4-PC roster matching `CharacterListSnapshotSchema` |
| `character-artemis.json` | `character.delta` | Artemis — hp 55/88, ac 18 |
| `character-dante.json` | `character.delta` | Dante Lanzulli — hp 41/63, ac 16 |
| `character-karius.json` | `character.delta` | Karius Frede — hp 70/70, ac 20 |
| `character-shin.json` | `character.delta` | Shin — hp 12/48, ac 14 |

## actorId correspondence

| PC | actorId |
|----|---------|
| Artemis | `E14Tfh9Ba07cpPyM` |
| Dante Lanzulli | `6KWxQXAiJgz4zKlS` |
| Karius Frede | `4GXG7ufxylS4H1Pk` |
| Shin | `VoNfASW4hQ4dG4cv` |

## Schema contracts

- `roster.json` — must satisfy `CharacterListSnapshotSchema` in
  `packages/shared-protocol/src/payloads/character-list.ts`
- Each `character-*.json` — must satisfy `CharacterSnapshotSchema` in
  `packages/shared-protocol/src/payloads/character.ts`

If you edit a fixture, verify it stays schema-valid by running `pnpm sim start` and checking
that `GET http://localhost:8911/v1/character/:actorId` returns 200 for all 4 actorIds.

## Seeding

`scripts/sim.sh` seeds `roster.json` first, then the four character files, in order.
The bridge in-memory cache is wiped on every restart — re-seeding on every start is intentional.
