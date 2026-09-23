---
"@evf/foundry-module": minor
"@evf/g2-app": minor
"@evf/shared-protocol": minor
---

ADR-0017 player-owned glasses. Each player pairs their own G2 from Foundry
(self-service `PairG2App` or the Players-list shortcut): the pairing QR carries an
ECDH-custodied, per-device credential, and writes run on the player's own client first,
falling back to the active GM (per-device responder election). The projector re-checks
actor ownership live on every invoke, so revoking ownership after pairing takes effect
immediately. There is no long-lived shared bearer token any more.

**Migration:** remove the bridge container and re-pair every pair of glasses from the
Foundry Players list — old bridge pairings are not compatible.
