---
"@evf/foundry-module": patch
---

Stop the audit-log write from stalling tool dispatch. `dispatchTool` awaits
`writeAuditLog` before returning its result (and, on the poll path, before POSTing
the result back to the bridge). On a player/headless executor `ChatMessage.create`
can hang indefinitely — observed live: a skill roll executed (its card appeared in
Foundry) yet the bridge still hit its 10s `foundry_timeout` because the audit write
never resolved. `writeAuditLog` now bounds the create with `AUDIT_WRITE_TIMEOUT_MS`
(2.5s, well under the bridge's 10s), so a hung audit write resolves best-effort
instead of stalling the action and the bridge queue slot. Regression test added.
