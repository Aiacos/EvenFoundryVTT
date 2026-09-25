/**
 * Build-time constants injected by `vite.config.ts` (`define`).
 */

/** App version from `app.json` (sent in `hello.app`). */
declare const __EVF_APP_VERSION__: string;

/**
 * Relay origin baked in at build time (`VITE_RELAY_URL`, e.g. `ws://192.168.1.5:8787` for
 * a dev build); empty = the production relay (`DEFAULT_RELAY_URL`).
 */
declare const __EVF_RELAY_URL__: string;
