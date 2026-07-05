/**
 * Vitest setupFile — hermetic-fetch guard for the `test` sentinel host.
 *
 * ## Why this exists (CI exit-1 with 0 test failures)
 *
 * The boot-engine integration tests boot the real engine with
 * `bridgeUrl: 'ws://test/bridge'`. Boot mounts the phone settings panel, whose
 * roster dropdown eagerly calls `fetchRoster()` → `window.fetch('http://test/bridge/v1/characters')`.
 * happy-dom implements `window.fetch` over REAL `node:http`, and for a
 * cross-origin URL it first performs a REAL CORS preflight (`OPTIONS`) —
 * `Fetch.compliesWithCrossOriginPolicy` → `http.Agent.createConnection` → a
 * genuine DNS lookup of the host `test` → `getaddrinfo EAI_AGAIN test`.
 *
 * The app-level promise chain is `.catch`-handled (settings-panel), but
 * happy-dom's INTERNAL preflight request errors escape its own promise chain
 * after worker teardown → Vitest counts an unhandled error → the run exits 1
 * with 0 assertion failures (the intermittent "Errors 1 error" flake, and the
 * red `quality-gates` on GitHub runners where the lookup is slow).
 *
 * ## What it does
 *
 * Wraps `globalThis.fetch` once per worker: requests whose URL host is exactly
 * the boot-test sentinel `test` resolve to a canned empty-roster `200` response
 * — no socket, no DNS, no preflight. Every other URL delegates to the original
 * fetch untouched, so tests that install their own fetch mocks/stubs (wizard
 * suites, i18n suites) behave exactly as before: they replace `globalThis.fetch`
 * AFTER this setup ran, and restoring them re-lands on this guarded wrapper.
 *
 * The sentinel host `test` is used exclusively by the boot-engine tests — no
 * production URL can ever have that host (app.json whitelists a real origin).
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts (fetchRoster)
 * @see packages/g2-app/src/phone/settings-panel.ts (eager roster load, .catch-handled)
 */

const SENTINEL_HOST = 'test';

/** Canned empty-roster payload — satisfies the fetchRoster contract shape. */
const EMPTY_ROSTER_BODY = JSON.stringify({ characters: [] });

const originalFetch: typeof fetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? String(input) : input.url,
    );
    if (url.hostname === SENTINEL_HOST) {
      return Promise.resolve(
        new Response(EMPTY_ROSTER_BODY, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
  } catch {
    // Relative/unparsable URL — fall through to the real fetch.
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof fetch;
