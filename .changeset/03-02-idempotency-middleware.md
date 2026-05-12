---
"@evf/bridge": patch
---

Add RFC draft-ietf-httpapi-idempotency-key-header-04 idempotency middleware (Plan 03-02).

- `IdempotencyStore`: in-memory 60s TTL Map with 10,000-entry LRU cap (ADR-0002, T-03-06).
- `registerIdempotencyHooks`: Fastify `preHandler`+`onSend` pair; same key+same body → replay; same key+different body → 422; `/internal/*` excluded.
- `FastifyRequest` augmented with `idempotencyKey`, `idempotencyBodyHash`, `evfStartTime` (reserved for Plan 03-03 metrics).
- `Idempotency-Key` header added to pino redact list (T-03-07).
- 10 unit + integration tests (all branches including TTL eviction, LRU overflow, exclusion rules).
