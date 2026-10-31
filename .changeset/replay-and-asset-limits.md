---
"@evf/shared-protocol": patch
"@evf/foundry-module": patch
---

Security/robustness: the idempotency cache now outlives the envelope replay window (2 × 120 s), so a sealed `invoke` re-delivered by the relay can no longer run an action twice; `asset` data is capped so every sealed frame fits the relay's 1 MiB limit (an oversized scene picture used to get the projector ejected and re-sent in a loop) — oversized or failed pictures fall back to the schematic map and are retried after 60 s instead of never; picture cache 96 → 256.
