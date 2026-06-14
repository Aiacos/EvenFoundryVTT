# ADR-0014: Bearer ↔ Foundry-User binding & per-actor read authorization

- **Status:** Accepted (2026-06-15)
- **Relates to:** ADR-0002 (protocol versioning — WS envelope + token), ADR-0011 (Foundry write-path single-workflow-origin). Supersedes the implicit "world-scoped bearer" trust assumption in `Specs.md` §11.5.4.
- **Security finding addressed:** T8 — *cross-player character data disclosure* (full-codebase review, 2026-06-14). See [[bearer-tokens-world-scoped-not-actor]].

## Context

A bearer token authenticates a paired G2 device to the bridge. Today the token is **world-scoped, not actor-scoped**:

- `BearerRegistryEntrySchema` (shared-protocol) = `{ token, alias, expiresAt, worldId }` — no user, no actor.
- `generateBearer(alias, bridgeUrl, worldId, refresh?)` does not know *who* the device belongs to; `PairModal` has no user/actor selector.
- The Foundry-side `evf.validateToken` returns `{ valid, entry:{ alias, expiresAt, worldId } }` — no identity.
- `character-list-reader.ts` reads **all** player characters from `game.actors` (roster is global).
- The Foundry-side `getCharacterSnapshot(actorId)` and the bridge REST `GET /v1/character/:actorId` (+ cached `internalSnapshotFn`) serve **any** `actorId` for **any** valid token.
- The WS handshake `client.actorId` pin is **client-supplied targeting, not authorization** — a client freely pins itself to any actor; the `delta-emitter` `selectedActorId` gate only multiplexes, it does not authorize.

**Consequence:** any authenticated player can read any character's full snapshot (HP, inventory, spells, biography) by enumerating actor ids. This is the exact `T-flv-01` leak the WS fan-out claims to defend, left open on the REST path and unenforced everywhere else.

The trust model is homelab single-tenant (Specs §11.5.3), so the practical adversary is another player at the same table — but DM-hidden inventory / other players' private sheets are still real secrets, and "selection ≠ authorization": adding an on-device actor picker (phone settings / glasses launch) constrains the *UI*, not the *server*, so it does not close the hole.

## Decision

**Bind every bearer to a Foundry `User` at pairing time, derive the authorized actor set from that user's live Foundry ownership, and enforce set-membership on every read path (REST + WS), with Foundry as the authorization authority.**

On-device actor *selection* (the UX of "which of my characters do I view") is layered **on top** of this: the roster the device receives is already filtered to the user's owned actors, and the server rejects any `actorId` outside that set regardless of what the client selects.

### 1. Pairing binds bearer → user

- `PairModal` gains a **user selector** (a `<select>` populated from `game.users`, defaulting to the players; the GM may pair a device to any user). The DM chooses which Foundry `User` this device represents.
- `generateBearer(alias, bridgeUrl, worldId, userId, refresh?)` stores `userId` on the entry. `bearer-rotation` carries `userId` through `refresh=true`.

### 2. Schema

- `BearerRegistryEntrySchema` (shared-protocol) gains `userId: z.string().min(1)`.
- `ValidateTokenResult.entry` gains `userId: string`, and the result gains `authorizedActorIds: string[]` — the live owned-actor set computed by Foundry at validation time.

### 3. Authorization source (Foundry is authority)

- Owned set = `game.actors.filter(a => a.testUserPermission(user, "OWNER"))` for the bearer's `userId`. Computed live on the Foundry side (ownership can change without re-pairing).
- `evf.validateToken(token)` → `{ valid, entry:{ alias, expiresAt, worldId, userId }, authorizedActorIds }`.
- `evf.getCharacterSnapshot(token, actorId)` re-checks `actorId ∈ authorizedActorIds(userId)` and denies otherwise (defence in depth — the Foundry handler is the last line even if the bridge cache is stale).

### 4. Enforcement points (all of them)

| Path | Enforcement |
|------|-------------|
| Bridge REST `GET /v1/character/:actorId` + `internalSnapshotFn` | `actorId ∈ validatedToken.authorizedActorIds` → else 404 (avoid enumeration) |
| Bridge `characters-list` / roster | filtered to `authorizedActorIds` |
| Bridge WS handshake `client.actorId` pin | must be `∈ authorizedActorIds`, else close 4400 |
| Foundry `getCharacterSnapshot` handler | re-check ownership (last line of defence) |

The bridge caches `authorizedActorIds` alongside the token-validation result (same 5-min TTL as `TokenCache`); ownership changes propagate within one TTL, identical to the existing token-revocation window.

### 5. Migration (fail-closed)

Existing bearers have no `userId`. A bearer **without `userId` is treated as authorizing an empty actor set** (fail-closed): reads return 404, the device shows "re-pair required". Pre-1.0, single-tenant homelab → requiring a one-time re-pair is acceptable and is the only choice that actually closes the leak. The `BearerRegistryEntrySchema` migration makes `userId` required; legacy entries fail `safeParse` and are pruned on next registry read.

## Consequences

- **Closes T8**: a device can read only the actors its paired user owns, enforced server-side on every path — selection UI can no longer be bypassed.
- **Ownership stays live**: authorization tracks Foundry ownership (computed at validate time), not a frozen snapshot; no re-pair needed when a DM grants/revokes ownership.
- **One-time re-pair** for existing devices (migration cost). Acceptable pre-1.0.
- **Pairing UX gains a step** (pick the user). The roster the device sees is now correctly scoped, which also improves the selection UX.
- **Specs §11.5.4 + changelog** updated for the new auth model (INV-3 coherence). README badge/showcase unaffected (no version-surface change beyond the changelog entry).
- **Bridge ↔ Foundry contract** (`ValidateTokenResult`) changes shape → both ends bumped together; `shared-protocol` is the single source.

## Alternatives considered

1. **Bearer → single actor** (1:1 at pairing). Simpler authz (`actorId === entry.actorId`), but a player with multiple characters needs multiple devices/re-pairs and there is no runtime selection. Rejected: too rigid for the multi-PC case and still needs a picker at pairing.
2. **Selection-only, no isolation** (accept the leak for the trusted table, document it). Cheapest, but leaves a known HIGH security gap open and was explicitly rejected by the project owner.
3. **Freeze owned-actor set into the bearer at pairing.** Avoids a per-validate Foundry computation, but goes stale on ownership changes and needs re-pair to update. Rejected in favour of live computation + TTL cache.

## Scope (implementation plan — this branch)

Ordered by dependency (schema → Foundry → bridge), atomic commits, tests at each step:

1. **shared-protocol** — `BearerRegistryEntrySchema.userId`; extend `ValidateTokenResult` contract (`entry.userId`, `authorizedActorIds`). Tests + migration note.
2. **foundry-module** — `generateBearer(...userId...)` + registry storage; `PairModal` user selector (no-arg pattern, precompute the user list in `_prepareContext` — no `eq` helper); `bearer-rotation` carries `userId`; `validateToken` returns `userId` + `authorizedActorIds` (`testUserPermission OWNER`); `getCharacterSnapshot` ownership re-check; `character-list-reader` filters to owned.
3. **bridge** — `ValidateTokenResult`/`TokenCache` carry `authorizedActorIds`; enforce membership on `GET /v1/character/:actorId` + `internalSnapshotFn` (404) and `characters-list` (filter); validate the WS handshake `actorId` pin (close 4400).
4. **docs** — Specs §11.5.4 + changelog (INV-3); this ADR indexed in `docs/architecture/README.md`.

## Amendments

_None yet._
