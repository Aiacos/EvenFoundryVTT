---
"@evf/foundry-module": minor
"@evf/bridge": patch
---

Add a write-path debug-trace beacon for autonomous, browserless diagnosis of write tools.
The module records a short trace label at each write-path stage (`#<n>:<tool>:handler:pending`,
cast-spell additionally marks `…:activity.use:pending`/`:returned`) plus a one-shot runtime
env summary (`fvtt/sys/midi/socketlib/gm`); the tool poller appends both to its drain GET as
`&dbg=`/`&env=`. Because they're ordinary query params they appear verbatim in the bridge
request access log even before the bridge is updated, and the bridge now also logs them on
change (`EVF client debug beacon`). The LAST `dbg` before the poll log goes quiet pinpoints
exactly where a handler hung — e.g. a frozen `cast-spell:activity.use:pending` proves the
dnd5e `activity.use` call itself never resolved (likely a MidiQOL/usage prompt), not the
audit log or the bridge.
