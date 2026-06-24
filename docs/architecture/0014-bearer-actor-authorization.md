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

### Amendment 1 — write-path authorization (2026-06-15)

The original decision (§4) enforced per-actor authorization on every **read** path
(REST `GET /v1/character/:actorId`, `characters-list` roster, WS handshake
`client.actorId` pin, Foundry `getCharacterSnapshot`). It left the **write** path
unguarded: write tools are invoked via WS `tool.invoke` → bridge `tool-invoke.ts` →
Foundry `socket.executeAsGM(...)`, which runs the handler in **GM context** and
therefore **bypasses Foundry's per-actor ownership check**. The tool `args` carries a
client-supplied **acting** `actor_id` (the PC performing the action). Nothing verified
that this acting actor was owned by the bearer's bound user — so a player could invoke a
write tool acting **as another player's PC** by supplying a foreign `actor_id`.

**Decision:** the acting `args.actor_id` of every write tool is now authorized against
the bearer's owned-actor set (the same live `authorizedActorIds` derived from
`actor.testUserPermission(user, "OWNER")` as the read path), exactly mirroring the read
model. A write whose acting actor is not owned is rejected with the constant error code
`not_authorized` and is **not executed**.

**Acting actor vs. targets (critical scope boundary).** The check is on the **acting**
actor only — the PC doing the action. It deliberately does **NOT** restrict
`args.targets` (the token ids an action is aimed at). Targets may legitimately be
non-owned (e.g. attacking a monster, casting on an ally's token). Restricting targets
would break legitimate gameplay. The convention is uniform across every write handler:
`args.actor_id` = acting actor; `args.targets` = aim points (unrestricted by this gate).

**Tools with no acting actor are unaffected:** `move-token` (keyed by `token_id`, no
`actor_id`) and `confirm-template-placement` (keyed by `placementId`; the acting actor
was already authorized at `place-template` time) carry no acting `args.actor_id` and are
not gated. Handler args that determine the acting actor from a handshake-pinned
`selectedActorId` rather than `args.actor_id` are already covered by the handshake gate
(§4).

**Enforcement points (defence in depth):**

| Path | Enforcement |
|------|-------------|
| Foundry `socket.executeAsGM` write dispatch (`makeDispatchAdapter` in `pair/socketlib-handlers.ts`) | **Authoritative.** Resolve bearer → bound user → live owned set; reject with `not_authorized` (no dispatch) unless the acting `args.actor_id` is owned. A denied write writes a best-effort audit-log entry (bearer hashed, never logged raw — T-02-01). |
| Bridge WS `tool.invoke` (`ws/tool-invoke.ts`) | **Fast-reject.** Re-validate the session token via `TokenCache`; when `args.actor_id` is present, reject with `not_authorized` before dispatching if it is not in `authorizedActorIds`. Uses the existing `isActorAuthorized` predicate, which honors the dev-no-auth bypass so the simulator keeps working. |

Foundry remains the authorization **authority**; the bridge check is a defence-in-depth
fast-reject that avoids a round-trip when the cached owned-set already proves denial.
Both paths fail closed (invalid/unknown bearer → denied).

**Updated §4 enforcement table** (additive — the write rows complement the read rows):

| Path | Enforcement |
|------|-------------|
| Foundry write dispatch (`makeDispatchAdapter`) | acting `args.actor_id ∈ authorizedActorIds(userId)` → else `not_authorized`, not executed |
| Bridge WS `tool.invoke` | acting `args.actor_id ∈ validatedToken.authorizedActorIds` → else `not_authorized` fast-reject |

## Amendment 2 — self-service standalone pairing + non-expiring tokens (2026-06-21)

Field testing surfaced two problems with the pairing model above. Both are resolved here;
this amendment supersedes the "user selector" mechanism in §1 and the 24h TTL.

### 2a. Every user pairs their OWN device — no GM user-selector

The §1 "PairModal gains a user selector (the GM pairs a device to any user)" mechanism is
**retired**. Instead pairing is **self-service**: the "Pair a G2 device" entry is available
to ALL users, and each user pairs a device bound to **their own** `game.user.id`. There is
no user picker; you can only pair yourself.

The binding stays authenticated by Foundry's permission model, on TWO storage paths by
permission:

- **GM** → `generateBearer(...)` writes the bearer **directly** into the world-scope
  `bearerRegistry` (a GM may write world settings) → live immediately.
- **Non-GM player** → cannot write the world registry, so the client-minted token is
  written as a `pendingPair` flag on the player's **own** `User` document. Only that user
  can write their own flags, so the token→user binding is authenticated by **document
  ownership** — as trustworthy as a GM-written registry entry.

**Self-service standalone (the key fix):** a `pendingPair` flag is a **first-class bearer**,
not a request awaiting GM materialisation. `validateBearer` (Foundry-side authz) and
`readBearerRegistry` (the bridge push) BOTH resolve flag tokens (`listPendingFlagBearers`,
deduped registry-first), and the module re-emits to the bridge on `updateSetting`
(registry change) and `updateUser` (flag change). So a non-GM player pairs and rolls
**without any GM client online** — the previous flag→GM-ingestion step is now an optional
upgrade to persistent storage, not a requirement. The security argument is unchanged: a
player can only write their own flag → can only bind tokens to themselves → the per-actor
authz (this ADR) still confines them to their own owned actors. Revoking a player's device
deletes their own flag (`unsetFlag`); GM-written registry bearers are revoked via
`revokeBearer`.

### 2b. Non-expiring, campaign-long tokens (no 24h TTL)

Tokens are minted **without expiry** (`expiresAt = NO_EXPIRY_MS`, a far-future sentinel)
so a paired device stays valid for the whole campaign — the 24h TTL expired devices
mid-session for no benefit in the homelab single-tenant trust model. Consequences:

- Every `expiresAt > now` validation/push check treats them as never-expiring with no
  special-casing; the sentinel is a valid non-negative integer so `BearerRegistryEntrySchema`
  (`expiresAt: z.number().int().min(0)`) is unchanged.
- **Bearer rotation is disabled for non-expiring tokens** (`scheduleBearerRotation`
  short-circuits when `expiresAt >= NO_EXPIRY_MS`): rotating would change the token the
  player already pasted. Finite legacy tokens still rotate.
- The PairModal shows "Never expires (campaign-long)" instead of a countdown.

Revocation (delete the flag / `revokeBearer`) remains the way to invalidate a device.

### 2c. Discovered hazards fixed alongside (field-test, 2026-06-20/21)

- **Empty-alias registry poisoning:** `BearerRegistryEntrySchema` requires `alias` min(1);
  a self-minted bearer could carry `alias: ''`, and because `bearers` is an array, ONE
  empty-alias entry failed the WHOLE snapshot's `safeParse` — the bridge silently dropped
  the entire registry push, so `boundUserId` never resolved and writes timed out. Fixed by
  coercing an empty alias to a placeholder on both the emit (`readBearerRegistry`) and the
  bridge handler.
- **WS reconnect stranded the outbound channel:** the g2-app reconnect ran the capability
  handshake on a still-`CONNECTING` socket (the send threw), so after any drop the
  `WsSender` never swapped to a live socket and `tool.invoke` writes silently stopped.
  Fixed by awaiting the socket `open` before the reconnect handshake.
- **Headless skill-roll dialog:** `skill-check` now passes `dialog: { configure: false }`
  so a poller-driven roll fast-forwards instead of blocking on an un-confirmable dialog.
