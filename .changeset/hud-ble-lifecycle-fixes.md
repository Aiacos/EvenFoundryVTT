---
"@evf/g2-app": patch
---

HUD over BLE: an image tile identical to the one in flight is never sent twice; the 100 ms image gap is measured from the end of the previous send; a timed-out bridge call keeps the queue blocked until it settles (30 s hard cap); a page placement that throws or times out is retried instead of switching to the full-screen fallback for good; the tick and image pipeline pause on FOREGROUND_EXIT / ABNORMAL_EXIT; device settings are mirrored into the Even Hub SDK key-value store like the credentials.
