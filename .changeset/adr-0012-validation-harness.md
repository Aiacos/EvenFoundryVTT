---
"@evf/validation-harness": minor
---

Add `validate:direct-sideload` (ADR-0012 GO/NO-GO): with `FOUNDRY_URL` set it checks HTTPS,
TLS reachability, that `/modules/evenfoundryvtt/g2/index.html` is served 200 `text/html`,
reads `/api/status` when exposed, prints the pairing-QR URL form, and runs (or, with
`--skip-hardware`, prints) the manual hardware checklist: QR load in the Even App, SDK bridge
injection, cookie persistence across foreground exit/enter, socket reconnect.
