---
"@evf/g2-app": patch
---

Fix blank glasses render: address every G2 container by its numeric `containerID` and give text containers geometry. A single shared container registry (`engine/container-registry.ts`) is now the only place container ids + pixel geometry live; the boot/main page schema and `LayerManager._flushPage` rebuild the canonical 11-container base schema from it (ids 0-10, text geometry, one isEventCapture=1), and every `textContainerUpgrade` / `updateImageRawData` site threads the registry-resolved `containerID`. Also repairs `_flushPage` which previously emitted an empty page that wiped all containers after boot.
