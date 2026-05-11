/**
 * Tier 3 storage adapter for the wizard session.
 *
 * Uses the Even Hub host-managed key-value store (`hub.setItem` / `hub.getItem`).
 * This is the ONLY persistence layer available in the sandboxed WebView iframe
 * (no localStorage per Specs.md §3.1).
 *
 * Security invariants (T-02-01, T-02-04, D-2.08):
 *   - Bearer tokens are NEVER stored in Tier 3 (`tokenObfuscated: z.null()` enforces this).
 *   - All loaded JSON is validated with Zod before use — corrupted data is silently dropped.
 *   - On schema validation failure: `loadSession` returns null; wizard restarts from Step 1.
 *
 * @see Specs.md §11.5.5 (Tier 3 storage — Even Hub kv)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md D-2.08
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md (threat model T-02-01, T-02-04)
 */
import { z } from 'zod';

/** Prefix for all EVF session keys in the Even Hub kv store. */
const SESSION_KEY_PREFIX = 'evf.session.';

/** Index key listing all known profile IDs. */
const PROFILE_INDEX_KEY = 'evf.profile.index';

/**
 * Zod schema for a persisted wizard session.
 *
 * `tokenObfuscated: z.null()` is a compile-time + runtime invariant: Phase 2 never
 * stores the bearer token in plaintext. This field exists as a placeholder for a
 * potential obfuscated hint in a future phase — Phase 2 always writes `null`.
 */
export const SessionSchema = z.object({
  /** UUID profile identifier — used as the kv key suffix. */
  profileId: z.string().uuid(),
  /** Bridge URL (validated in Step 1). */
  bridgeUrl: z.string().url(),
  /**
   * Token storage slot — ALWAYS null in Phase 2 (T-02-01).
   * The bearer is held in memory only during the wizard session.
   */
  tokenObfuscated: z.null(),
  /** Foundry actor ID selected in Step 3. */
  characterId: z.string().min(1),
  /** Unix epoch milliseconds when the session was saved. */
  savedAt: z.number().int().positive(),
});

/** A valid parsed wizard session. */
export type Session = z.infer<typeof SessionSchema>;

/**
 * Persist a wizard session to Tier 3 (Even Hub kv store).
 *
 * The session is JSON-serialised and stored under `evf.session.{profileId}`.
 * The profile ID is also added to the profile index so `listProfiles` can enumerate.
 *
 * @param session - A fully-validated Session object.
 */
export async function saveSession(session: Session): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}${session.profileId}`;
  await hub.setItem(key, JSON.stringify(session));
  await _addToProfileIndex(session.profileId);
}

/**
 * Load and validate a wizard session from Tier 3.
 *
 * Returns `null` (and emits a console.warn) if:
 *   - The key does not exist.
 *   - The stored value is not valid JSON.
 *   - The parsed JSON does not conform to `SessionSchema` (e.g. corrupted or stale).
 *
 * @param profileId - UUID of the profile to load.
 */
export async function loadSession(profileId: string): Promise<Session | null> {
  const key = `${SESSION_KEY_PREFIX}${profileId}`;
  const raw = await hub.getItem(key);
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    // biome-ignore lint/suspicious/noConsole: Tier 3 JSON parse failure — informational
    console.warn(
      `[EVF] tier3-storage: corrupted session JSON for profile ${profileId} — dropping.`,
    );
    return null;
  }

  const result = SessionSchema.safeParse(parsed);
  if (!result.success) {
    // biome-ignore lint/suspicious/noConsole: Tier 3 schema validation failure — informational
    console.warn(
      `[EVF] tier3-storage: session schema validation failed for profile ${profileId} — dropping.`,
      result.error.flatten(),
    );
    return null;
  }

  return result.data;
}

/**
 * Delete a wizard session from Tier 3.
 *
 * @param profileId - UUID of the profile to remove.
 */
export async function deleteSession(profileId: string): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}${profileId}`;
  await hub.removeItem(key);
  await _removeFromProfileIndex(profileId);
}

/**
 * List all stored sessions.
 *
 * Iterates the profile index, loads each session, and skips any that fail validation.
 * Corrupted entries are silently dropped (logged via console.warn).
 */
export async function listProfiles(): Promise<Session[]> {
  const index = await _loadProfileIndex();
  const results: Session[] = [];

  for (const profileId of index) {
    const session = await loadSession(profileId);
    if (session !== null) {
      results.push(session);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Private helpers — profile index management
// ---------------------------------------------------------------------------

async function _loadProfileIndex(): Promise<string[]> {
  const raw = await hub.getItem(PROFILE_INDEX_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

async function _addToProfileIndex(profileId: string): Promise<void> {
  const index = await _loadProfileIndex();
  if (!index.includes(profileId)) {
    index.push(profileId);
    await hub.setItem(PROFILE_INDEX_KEY, JSON.stringify(index));
  }
}

async function _removeFromProfileIndex(profileId: string): Promise<void> {
  const index = await _loadProfileIndex();
  const filtered = index.filter((id) => id !== profileId);
  await hub.setItem(PROFILE_INDEX_KEY, JSON.stringify(filtered));
}
