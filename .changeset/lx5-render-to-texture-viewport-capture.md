---
"@evf/foundry-module": patch
---

render-to-texture viewport capture fixes idle all-zero map frames on the real Forge client (no-arg framebuffer read was only valid during the render pass)
