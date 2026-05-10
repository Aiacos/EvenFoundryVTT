// EVF Phase 0 MidiQOL Probe — Foundry-side ES module.
// Loaded by tests/phase-0/midiqol-probe-module/module.json esmodules.
// Hooks 'ready', reads MidiQOL settings via game.settings.get (READ-ONLY — T-00-02 mitigation),
// POSTs JSON to localhost endpoint stored in localStorage['evf-probe-endpoint'].
//
// SAFETY GUARANTEES (T-00-02 read-only mitigation):
//   - Uses ONLY the read accessor `game.settings.get(...)` — never the write accessor or any
//     other mutation API. The grep gate `! grep -q "game.settings\\.set" probe.js` MUST return
//     zero hits — that's why the write accessor name is NOT spelled out anywhere in this file.
//   - Reads game.modules.get('midi-qol') metadata only
//   - POST body contains ONLY MidiQOL configuration values (booleans, enum strings, version)
//   - Does NOT read game.userId, session tokens, world data, actor data, or anything PII-bearing
//   - Endpoint URL validated to localhost (T-00-05 mitigation)

Hooks.once("ready", async () => {
  console.log("[EVF Phase 0 Probe] ready hook fired");

  const endpoint = window.localStorage.getItem("evf-probe-endpoint");
  if (!endpoint) {
    ui.notifications?.warn(
      "EVF Phase 0 Probe: no endpoint set. In console, run: localStorage.setItem('evf-probe-endpoint', '<harness URL>')"
    );
    console.warn(
      "[EVF Phase 0 Probe] localStorage['evf-probe-endpoint'] is empty. Set it to the harness URL printed by `pnpm exec tsx midiqol-config-probe.ts` then reload."
    );
    return;
  }

  // Validate URL: must be http://127.0.0.1:<port>/probe (T-00-05 mitigation — refuse non-localhost).
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    console.error("[EVF Phase 0 Probe] localStorage endpoint is not a valid URL:", endpoint);
    return;
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    console.error(
      "[EVF Phase 0 Probe] endpoint hostname not localhost; refusing POST. Got:",
      parsed.hostname
    );
    return;
  }
  if (parsed.protocol !== "http:") {
    console.error("[EVF Phase 0 Probe] endpoint protocol must be http:; got:", parsed.protocol);
    return;
  }

  // Detect MidiQOL presence.
  const midiQolModule = game.modules.get("midi-qol");
  const midiqolActive = Boolean(midiQolModule?.active);
  const midiqolVersion = midiQolModule?.version ?? "unknown";

  let settings = null;
  if (midiqolActive) {
    // READ-ONLY ACCESS — game.settings.get only. The write accessor is intentionally
    // not referenced anywhere in this file (T-00-02 grep gate).
    try {
      settings = {
        AutoFastForwardAbilityRolls: game.settings.get("midi-qol", "AutoFastForwardAbilityRolls"),
        autoRollAttack: game.settings.get("midi-qol", "autoRollAttack"),
        autoRollDamage: game.settings.get("midi-qol", "autoRollDamage"),
        autoFastForwardRolls: game.settings.get("midi-qol", "autoFastForwardRolls"),
        autoCompleteWorkflow: game.settings.get("midi-qol", "autoCompleteWorkflow"),
        removeButtons: game.settings.get("midi-qol", "removeButtons"),
      };
    } catch (err) {
      console.error("[EVF Phase 0 Probe] failed to read midi-qol settings:", err);
      // Continue with partial — harness will surface what's available
    }
  }

  const payload = {
    midiqol_version: midiqolVersion,
    midiqol_active: midiqolActive,
    settings: settings ?? {},
  };

  console.log("[EVF Phase 0 Probe] POSTing payload to", endpoint);
  console.log("[EVF Phase 0 Probe] payload:", payload);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    console.log("[EVF Phase 0 Probe] harness response:", body);
    ui.notifications?.info(
      `EVF Phase 0 Probe: verdict=${body.verdict ?? "unknown"} (see CLI for details)`
    );
  } catch (err) {
    console.error("[EVF Phase 0 Probe] POST failed:", err);
    ui.notifications?.error(
      "EVF Phase 0 Probe: failed to POST to harness. Is `pnpm exec tsx midiqol-config-probe.ts` still running?"
    );
  }
});
