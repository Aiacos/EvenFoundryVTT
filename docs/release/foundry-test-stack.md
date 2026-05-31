# Full test stack — Foundry + bridge + module (end-to-end wizard test)

How to stand up a complete local stack so the phone wizard connects end-to-end
(Step 1 bridge URL → Step 2 token → Step 3 character → HUD). This is the only way to test
**past Step 2**, because the bridge validates the wizard's bearer token by asking the
Foundry module (`socketlib executeAsGM "evf.validateToken"`) — no Foundry, no valid token.

```
[ phone wizard ] --token--> [ bridge :8910 ] <--socketlib+secret-- [ Foundry module (GM browser) ] -- [ Foundry :30000 ]
```

## 0. Prerequisite — Foundry license

Foundry VTT is **licensed**. The `felddy/foundryvtt` image downloads it with **your Foundry
account** (https://foundryvtt.com). There is no way around this. You need v13+ on your license
(the module requires Foundry ≥ 13.347, verified on 14).

## 1. Configure + start the stack

```bash
cp deploy/.env.example deploy/.env
# In deploy/.env set:
#   EVF_INTERNAL_SECRET=$(openssl rand -base64 32)     # shared module ↔ bridge secret
#   FOUNDRY_USERNAME=your-foundry-login
#   FOUNDRY_PASSWORD=your-foundry-password
#   FOUNDRY_ADMIN_KEY=evf-admin                        # Foundry admin/setup password

docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.foundry-test.yml up -d
# Foundry → http://localhost:30000   ·   bridge → http://localhost:8910
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.foundry-test.yml logs -f foundry   # watch first-run download
```

(First run downloads + installs Foundry — give it a minute. If your account has multiple
licenses, add `FOUNDRY_LICENSE_KEY=...` to `.env`.)

## 2. One-time Foundry setup (browser, http://localhost:30000)

1. Sign the EULA / enter the admin key (`FOUNDRY_ADMIN_KEY`).
2. **Install the dnd5e system** — *Game Systems → Install System →* search **"Dungeons & Dragons
   Fifth Edition"** (≥ 5.3.3).
3. **Install socketlib** — *Add-on Modules → Install Module →* search **"socketlib"**.
4. **Install EvenFoundryVTT** — *Add-on Modules → Install Module →* paste the manifest URL:
   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```
5. **Create a World** on the dnd5e system, then **Launch** it (you are the GM).
6. **Manage Modules** → enable **socketlib** + **EvenFoundryVTT** → Save (reloads the world).
7. Create at least one **Actor → Character** (the wizard's Step 3 lists owned characters).

## 3. Wire the module to the bridge + pair

1. **Game Settings → Configure Settings → EvenFoundryVTT**: set the **Bridge URL** to
   `http://<your-host-ip>:8910` (use the LAN IP, not `localhost`, if the phone must reach it),
   and the **internal secret** to the **same `EVF_INTERNAL_SECRET`** you put in `deploy/.env`.
2. **Game Settings → EvenFoundryVTT → "Pair Device"** (the QR-code button). This generates a
   **24h bearer token** + a QR.

## 4. Run the wizard end-to-end

In the phone wizard (or the simulator / a browser at `http://<host>:5173/wizard/wizard.html`):

1. **Step 1** — Bridge URL: `http://<your-host-ip>:8910`.
2. **Step 2** — paste the bearer token (or scan the QR) from §3.2. The bridge validates it via
   the connected Foundry module → connects.
3. **Step 3** — pick the character you created in §2.7.
4. Done — the engine boots and the G2 HUD is driven by the live Foundry session.

## Troubleshooting

- **Step 2 "invalid / 401"** — token wrong/expired, or the EvenFoundryVTT module isn't enabled /
  the GM world isn't open (the bridge can't validate without the module's socketlib link). Re-pair.
- **Step 2 "unreachable"** — the phone/simulator can't reach `http://<host>:8910`. Use the LAN IP,
  check the firewall, confirm `curl http://<host>:8910/healthz` works from the device's network.
- **Step 3 empty** — no player-owned characters in the world; create one (§2.7).
- **Foundry won't start** — missing/invalid `FOUNDRY_USERNAME`/`FOUNDRY_PASSWORD`, or the license
  doesn't cover v13. Check `docker compose ... logs foundry`.
