---
'@evf/bridge': minor
'@evf/shared-protocol': minor
---

Phase 03 Plan 01 — Bridge handshake wiring + WS resume protocol

**Critical fix:** Phase 02 shipped a latent bug where `handleHandshake` returned
`void` and the production code in `server.ts` never wired
`deltaEmitter.registerSession`. Every delta emitted via `/internal/delta` was
silently dropped in production because the emitter's `connections` map was
always empty. Tests passed because they injected directly into the map.

This change:

- Promotes `handleHandshake` return type to `Promise<string | null>` so callers
  can wire the registration step.
- In `server.ts`, every accepted handshake now calls
  `deltaEmitter.registerSession(sessionId, socket)` and registers a
  `socket.on('close', ...)` handler that unregisters from the emitter, deletes
  the session, and clears the replay buffer.
- Adds `socket.on('message', ...)` that routes to the new resume handler
  (`@evf/bridge/ws/resume.ts`).

**WS resume protocol (ADR-0002):**

- `@evf/shared-protocol` exports `ClientResumeSchema`, `ResumeReplaySchema`,
  `ResumeFullSnapshotSchema`. ResumeReplay uses a leaner `count: N` header
  followed by N envelope frames (separate sends) instead of bundling all
  deltas inline — smaller individual frames, simpler client decoding.
- `@evf/bridge/ws/replay-buffer.ts` adds `hasGap(sessionId, fromSeq)`. Returns
  true when buffered entries with seq > fromSeq are non-contiguous. Used to
  short-circuit replay attempts that would silently hide a gap.
- `@evf/bridge/ws/resume.ts` implements the decision matrix: gap → full_snapshot
  with `reason: 'buffer_gap'`; empty → full_snapshot with `reason:
  'buffer_expired'`; contiguous → header + envelope frames.

No public API of `@evf/bridge` is removed. All existing endpoints continue to
work identically. The signature change to `handleHandshake` is internal (only
`server.ts` calls it).
