---
"@evf/foundry-module": patch
---

fix(foundry-module): PairModal renders QR + token again (remove unregistered `eq` Handlebars helper)

The PairModal template used the `eq` Handlebars helper, which Foundry VTT does not
register by default, so every render threw `Missing helper: "eq"` and the modal came up
blank — no QR, no token. Replaced `eq` with boolean flags precomputed in `_prepareContext`
(`isEmpty`/`isExpired`/`isRefreshNeeded`/`isPairing`/`showQr`). Also fixes four latent
defects exposed once rendering worked: empty state now has a "generate code" CTA so a fresh
install can mint its first bearer; `expiresAtMs` is passed for the countdown timer; the
`expiresIn` and `close` i18n keys are now resolved (added `evf.pair.modal.close` to IT/EN);
and tests now exercise the real template render to close the coverage gap.
