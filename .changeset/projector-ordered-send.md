---
"@evf/foundry-module": patch
---

Projector: messages to each G2 device are sealed and emitted in call order. Async sealing let later deltas overtake earlier ones (the glasses saw `seq` gaps and resynced everything) and could deliver a message sealed with a freshly rotated key before the `welcome` announcing it.
