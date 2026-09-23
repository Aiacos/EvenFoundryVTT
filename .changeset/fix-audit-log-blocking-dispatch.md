---
"@evf/foundry-module": patch
---

Stop the audit-log write from stalling tool dispatch. `dispatchTool` awaits
`writeAuditLog` before returning its result. On a player executor
`ChatMessage.create` can hang indefinitely — observed live: a skill roll executed (its
card appeared in Foundry) yet the glasses invoke still timed out because the audit write
never resolved. `writeAuditLog` now bounds the create with `AUDIT_WRITE_TIMEOUT_MS`
(2.5 s, well under the ~10 s invoke timeout), so a hung audit write resolves best-effort
instead of stalling the action. Regression test added.
