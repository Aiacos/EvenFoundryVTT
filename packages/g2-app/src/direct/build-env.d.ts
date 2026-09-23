/**
 * Build-time constants injected by `vite.config.ts` (`define`).
 */

/** App version from `app.json` (sent in `hello.app`). */
declare const __EVF_APP_VERSION__: string;

/**
 * Version of the Foundry module (`evenfoundryvtt`) this bundle was built with — compared
 * with `welcome.moduleVersion` (phone Diagnostica warns on a mismatch).
 */
declare const __EVF_MODULE_VERSION__: string;
