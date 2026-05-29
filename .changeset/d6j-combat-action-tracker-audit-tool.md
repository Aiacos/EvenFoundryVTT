---
"@evf/foundry-module": patch
---

fix(foundry-module): combat-action-tracker reads `flags.evf.audit.tool` not `audit.toolId`

The `createChatMessage` hook read `audit.toolId`, which `writeAuditLog`/`dispatchTool`
never write (the real `AuditEntry` field is `tool`). The read was always `undefined`,
short-circuiting before any action-economy `emit` — dead code per INV-4. Reading
`audit.tool` (matching the sibling `action-result-watcher`) revives production
action-economy tracking. Added a CAT-REGRESSION guard pinning the wire-shape field name.
