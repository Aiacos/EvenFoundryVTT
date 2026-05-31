---
"@evf/g2-app": patch
---

Fix the phone-setup wizard showing raw i18n key names (e.g. `evf.wizard.step1.title`) instead
of labels. The wizard fetched all strings from the bridge (`/v1/i18n/{lang}`), but Step 1 is
where you enter the bridge URL — so there is no bridge to fetch from yet (chicken-and-egg), and
the catalog also never defined the wizard keys. Adds a bundled IT/EN wizard catalog
(`wizard/i18n-catalog.ts`, all 44 keys) used as the base, with the bridge catalog merged on top
when connected. Every wizard step is now readable with no bridge.
