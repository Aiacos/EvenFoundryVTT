---
"@evf/foundry-module": patch
"@evf/g2-app": patch
---

The character portrait shows on the glasses: the projector sends `actor.img` / the prototype token as `asset` pictures (144 px) and the glasses resolve them, instead of fetching a Foundry-relative path that the phone (GitHub Pages / `.ehpk`) could never load — the HUD used to fall back to the class emblem for the whole session.
