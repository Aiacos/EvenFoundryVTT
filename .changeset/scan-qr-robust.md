---
'@evf/g2-app': patch
'@evf/shared-protocol': patch
---

Pairing on the phone: «Scansiona QR» decodes screen photos at 1024 → 640 → 400 px (plus the native `BarcodeDetector` where available) and says when the camera is unavailable; the code field accepts the whole pairing link, without a length cap or forced capitals; link keys are read case-insensitively.
