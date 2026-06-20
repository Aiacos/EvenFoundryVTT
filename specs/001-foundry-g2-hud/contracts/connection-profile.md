# Contract — Connection profile (one direct link)

**Feature**: 001-foundry-g2-hud

## Config contract

- The plugin holds ONE connection profile, persisted in the Even Hub kv store:

  ```jsonc
  { "bridgeUrl": "https://<bridge-origin>", "token": "<non-expiring access token>" }
  ```

- `bridgeUrl` MUST be a full HTTPS origin of the bridge that fronts Foundry/Forge. The socket URL is
  derived by `https→wss` (and `/ws` path); REST base by `https` + path.
- The user supplies it once via **install + paste** (no camera/QR). Auto-reconnect on drop, no
  manual re-pair.

## Source-of-truth contract (replaces the 4-source ambiguity)

Resolution order (no silent `localhost`):

1. Saved profile (kv) — the canonical user path.
2. (dev only, explicitly gated) `VITE_EVF_DEV_BRIDGE_URL` / `VITE_EVF_NO_AUTH` — never the default in
   a user build; clearly labeled dev escape hatch.

- The previous implicit `http://localhost:8910` default and the `.env.local` override are removed from
  the default user-facing path.

## Acceptance

- A freshly installed plugin with a saved profile connects to the configured bridge and reaches a live
  HUD without any dev env var.
- No build defaults the connection to `localhost` for an end-user device.
- A dropped connection auto-recovers to live within 30 s of the bridge returning.
