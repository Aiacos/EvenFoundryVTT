---
"@evf/foundry-module": patch
"@evf/g2-app": patch
---

fix(pairing): install via Even Hub + paste token (remove unrealizable QR-scan path)

The previous design assumed the player would scan the Foundry PairModal QR with the Even
Realities app. This is impossible: the Even Hub platform exposes no camera / QR-scan API to
apps (canonical `hub.evenrealities.com/docs/guides/device-apis`: "no camera (there is none)"),
the app runs in the phone WebView, and the PairModal hid the token from text so the DM could
not hand it over either.

Real flow: install the EVF app via Even Hub (dev `evenhub qr` loads the plugin-host URL into
the Even app; prod `.ehpk` → portal review → store), then open the app → wizard → enter the
bridge URL + **paste** the token shown in the Foundry PairModal → pick a character.

- `@evf/foundry-module` PairModal: removed QR generation (dropped the `qrcode` dependency),
  now renders the bridge URL + bearer token as copyable text. The token is masked by default
  with a Reveal/Copy control (scoped security relaxation — pairing is otherwise impossible).
  i18n realigned: removed `evf.pair.qr.scan_instruction`, added `evf.pair.copy.*` (IT + EN).
- `@evf/g2-app` wizard step 2: removed the dead QR-scan path (`hub.camera`, `_probeCameraApi`,
  `evf.wizard.step2.scan_qr_btn`) per INV-4; the `hub.camera` type and polyfill field are gone.
  Paste-from-clipboard + manual entry + the `/v1/health` connect check are unchanged.
