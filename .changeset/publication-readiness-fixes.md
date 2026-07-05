---
"@evf/foundry-module": patch
"@evf/bridge": patch
---

Publication-readiness hardening:

- foundry-module: bearer-registry degrades safely when `game.settings` is
  unavailable (guards a real unhandled-rejection on module reload while a
  bearer rotation is pending); CI-safe canvas-extractor scheduler tests
  (multi-cycle frames shrunk — kills the 5s-timeout flake on throttled runners).
- bridge: `.catch()` on void'd async WS handlers (tool-invoke, select-actor,
  audio-stream auth setup) aligned with the established fail-soft pattern.
