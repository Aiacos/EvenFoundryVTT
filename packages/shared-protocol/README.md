# @evf/shared-protocol

Single source of truth for protocol contracts across all EVF packages.

**Status:** Phase 2 placeholder for real schemas. Wave 2 ADR-0002 will document the WS envelope shape that lands here in Phase 2.

## Contents (Phase 2+)

- WS envelope: `{ proto, seq, ts, type, path?, value?, prev_seq? }` (ADR-0002)
- Idempotency key shape (UUID-per-action)
- Tool Registry tool input schemas: `cast_spell`, `weapon_attack`, `use_item`, `skill_check`, `move_token`, `place_template`, `set_targets` (ADR-0003)
- Actor read API result shapes (`getCharacterState`, `getCombatState`, etc.)
- Capability negotiation handshake schema

## Pattern

All schemas defined as Zod. Static types derived via `z.infer<typeof Schema>`. Imported by `@evf/bridge`, `@evf/foundry-module`, `@evf/g2-app`, `@evf/foundry-mcp` (V2).

## See also

- `docs/architecture/0002-protocol-versioning.md` (Wave 2)
- `docs/architecture/0003-tool-registry-pattern.md` (Wave 2)
