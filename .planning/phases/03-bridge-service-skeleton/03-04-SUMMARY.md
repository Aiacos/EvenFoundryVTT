---
phase: "03-bridge-service-skeleton"
plan: "04"
subsystem: "shared-protocol + bridge + foundry-module"
tags: [tool-registry, zod, adr-0003, dispatch, socketlib, phase-07-pending]
dependency_graph:
  requires: ["03-02", "03-03"]
  provides: ["GET /v1/tools", "POST /v1/tools/:name", "TOOL_REGISTRY", "TOOL_DISPATCH_TABLE", "socketlib stubs 7"]
  affects: ["03-05 (Docker Compose integration test asserts GET /v1/tools)", "Phase 07 (write path)"]
tech_stack:
  added: []
  patterns:
    - "Zod 4 native .toJSONSchema() — no zod-to-json-schema dep"
    - "toolDispatchOverride in BuildServerOptions for test injection"
    - "TOOL_DISPATCH_TABLE makeStub pattern for phase-07-pending stubs"
key_files:
  created:
    - packages/shared-protocol/src/tools/cast-spell.ts
    - packages/shared-protocol/src/tools/weapon-attack.ts
    - packages/shared-protocol/src/tools/use-item.ts
    - packages/shared-protocol/src/tools/skill-check.ts
    - packages/shared-protocol/src/tools/move-token.ts
    - packages/shared-protocol/src/tools/place-template.ts
    - packages/shared-protocol/src/tools/set-targets.ts
    - packages/shared-protocol/src/tools/index.ts
    - packages/shared-protocol/src/tools/tools.test.ts
    - packages/bridge/src/routes/tools-dispatch.ts
    - packages/bridge/src/routes/tools.test.ts
    - .changeset/03-04-tool-registry.md
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/bridge/src/routes/tools.ts
    - packages/bridge/src/server.ts
    - packages/bridge/src/server.test.ts
    - packages/foundry-module/src/pair/socketlib-handlers.ts
decisions:
  - "Zod 4 .toJSONSchema() chosen over zod-to-json-schema (native, no dep)"
  - "TOOL_DISPATCH_TABLE makeStub pattern: 7 stubs return phase-07-pending immediately (Phase 03 boundary)"
  - "toolDispatchOverride in BuildServerOptions mirrors foundrySnapshotFn pattern"
  - "T-03-13: 404 before auth check acceptable (canonical list public via GET /v1/tools)"
  - "tools.test.ts placed in routes/ subdir (co-located with implementation)"
  - "socketlib stubs in comments reference activity.use() only (T-03-14: no actual code calls)"
metrics:
  duration: "~35 min"
  completed: "2026-05-13"
  tasks: 2
  files: 13
---

# Phase 03 Plan 04: ADR-0003 Tool Registry Summary

7-tool dispatch surface (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets) with Zod 4 schemas + JSON Schema via native .toJSONSchema(), GET/POST /v1/tools routes, and Foundry-side stub handlers returning phase-07-pending.

## TOOL_REGISTRY Table

| name | description | key input fields |
|------|-------------|-----------------|
| cast_spell | Cast a spell via activity.use() | actor_id, spell_id, slot_level (0=cantrip), targets[] |
| weapon_attack | Make a weapon attack via activity.use() | actor_id, item_id, targets[], advantage |
| use_item | Use a consumable or item via activity.use() | actor_id, item_id, targets[] |
| skill_check | Roll a skill check via actor.rollSkill() | actor_id, skill, advantage |
| move_token | Move a token to grid coordinates | token_id, x, y |
| place_template | Place an AoE template for a spell/ability | actor_id, item_id, x, y |
| set_targets | Set TokenLayer targets for the current user | token_ids[], user_id? |

## GET /v1/tools Response Shape

```json
{
  "tools": [
    {
      "name": "cast_spell",
      "description": "Cast a spell via activity.use()",
      "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "actor_id": { "type": "string", "minLength": 1 },
          "spell_id": { "type": "string", "minLength": 1 },
          "slot_level": { "type": "integer", "minimum": 0, "maximum": 9 },
          "targets": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["actor_id", "spell_id", "slot_level", "targets"],
        "additionalProperties": false
      }
    }
    // ... 6 more entries
  ]
}
```

## POST /v1/tools/:name Flow

```
POST /v1/tools/:name
  │
  ├─ 1. name in TOOL_DISPATCH_TABLE?
  │       No → 404 { error:'unknown_tool', tool: name }
  │
  ├─ 2. Authorization: Bearer <token>?
  │       Missing/invalid → 401 { error:'invalid_token' }
  │       Foundry unreachable → 503 { error:'foundry_unreachable' }
  │
  ├─ 3. body.safeParse(request.body)?
  │       Fails → 400 { error:'invalid_body', details: [...issues] }
  │
  ├─ 4. Idempotency-Key middleware (Plan 03-02) intercepts if key+body cached
  │       Cache hit (same key+body) → 200 (replayed, handler NOT called)
  │       Cache conflict (same key, diff body) → 422 { error:'idempotency_key_conflict' }
  │
  └─ 5. TOOL_DISPATCH_TABLE[name](body, idempotencyKey)
          → 200 { status:'phase-07-pending', tool, idempotency_key, accepted_at }
```

**Status-code matrix:**

| Condition | Status |
|-----------|--------|
| Unknown tool name | 404 |
| Missing/invalid bearer | 401 |
| Foundry unreachable | 503 |
| Invalid body | 400 |
| Idempotency key conflict | 422 |
| OK (stub) | 200 |

## Foundry-Module Socketlib Stub Handlers

Registered in `registerSocketlibHandlers()` (Plan 03-04 block):

| Handler name | Returns |
|---|---|
| evf.castSpell | `{ status: 'phase-07-pending' }` |
| evf.weaponAttack | `{ status: 'phase-07-pending' }` |
| evf.useItem | `{ status: 'phase-07-pending' }` |
| evf.skillCheck | `{ status: 'phase-07-pending' }` |
| evf.moveToken | `{ status: 'phase-07-pending' }` |
| evf.placeTemplate | `{ status: 'phase-07-pending' }` |
| evf.setTargets | `{ status: 'phase-07-pending' }` |

**Phase 07 wiring contract:** Phase 07 replaces each stub body with a real `socketlib.executeAsGM(handlerName, input)` call from the bridge dispatch table, which routes to these handlers which in turn call `activity.use()` or `MidiQOL.completeActivityUse`.

## T-03-14 Boundary Verification

```bash
# Check for actual code-level write API calls (not comments) in new stubs
grep -E "actor\.update|game\.settings\.set|combat\.advance|activity\.use\(|completeActivityUse\(" \
  packages/foundry-module/src/pair/socketlib-handlers.ts
```

All 9 occurrences of `activity.use` / `completeActivityUse` in the file are in:
- JSDoc `/** ... */` block comments
- `//` line comments

Zero occurrences in executable code. T-03-14 boundary preserved.

## Idempotency Dedup End-to-End (Plan 03-02 + 03-03 + 03-04)

Test 9 in `routes/tools.test.ts` proves the cross-plan wiring:

1. `POST /v1/tools/cast_spell` with `Idempotency-Key: k-dedup` and same body → fires spy handler once
2. Second identical request → served from `IdempotencyStore` cache, spy NOT called again
3. Both responses have identical body bytes (idempotency guarantee)
4. `evf_idempotency_dedup_total` counter (Plan 03-03) increments on second request

## JSON Schema Drift Test (T-03-15)

`tools.test.ts` test 16 (in `packages/shared-protocol/src/tools/tools.test.ts`):

```ts
for (const entry of TOOL_REGISTRY) {
  const schema = schemaMap[entry.name];
  expect(entry.inputSchema).toEqual(schema.toJSONSchema());
}
```

Passes — proves precomputed `TOOL_REGISTRY[i].inputSchema` matches live `.toJSONSchema()` for all 7 tools. If Phase 07 modifies a Zod schema without updating TOOL_REGISTRY, this test will fail.

## Commits

1. `81b544b` — feat(03-04): 7 Zod tool schemas + TOOL_REGISTRY in @evf/shared-protocol
2. `6959c54` — feat(03-04): bridge Tool Registry routes + Foundry stubs (ADR-0003)

## Self-Check

- [x] 9 files in packages/shared-protocol/src/tools/ (7 schemas + index.ts + tools.test.ts)
- [x] TOOL_REGISTRY has 7 entries (verified by grep -c)
- [x] GET /v1/tools returns 7 entries (tools.ts implementation)
- [x] POST /v1/tools/:name → 404/401/400/200 flow implemented
- [x] T-03-14 verified: 0 actual write API calls in new stub handlers
- [x] T-03-15 drift test in tools.test.ts
- [x] pnpm typecheck exits 0
- [x] pnpm test (407 tests, 24 files) exits 0
- [x] Changeset declared
- [x] socketlib-handlers.ts has 7 new evf.* registrations

## Self-Check: PASSED
