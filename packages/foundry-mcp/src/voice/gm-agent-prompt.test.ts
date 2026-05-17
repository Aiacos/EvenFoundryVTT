/**
 * Unit tests for GM_AGENT_SYSTEM_PROMPT + buildGmAgentPrompt() — Plan 12-02 Task 3.
 *
 * Each assertion targets a specific directive or security constraint. Tests are
 * individual `it()` blocks so failures pinpoint the missing directive.
 *
 * Test IDs:
 *   - GP-01: GM_AGENT_SYSTEM_PROMPT is non-empty string ≥ 600 chars (covers 6 directives)
 *   - GP-02: Contains 'GM-Agent' (role definition — directive 1)
 *   - GP-03: Contains 'D&D 5e' OR 'D&D' (game system — directive 1)
 *   - GP-04: Contains 'Foundry VTT' (host platform — directive 1)
 *   - GP-05: 'confirm' within 200 chars of 'target' (directive 2 — spell+target confirm)
 *   - GP-06: Contains 'palla di fuoco' AND 'fireball' (directive 3 — code-switching)
 *   - GP-07: 'clarify' within 200 chars of 'ambig' (directive 4 — ambiguity → clarify)
 *   - GP-08: All 6 MCP tool IDs present as kebab-case literals (directive 5)
 *   - GP-09: Contains 'visual toast' OR 'toast visivo' (directive 6 — VOICE-05)
 *   - GP-10: Contains 'actor://current' or 'combat://current' (resource read guidance)
 *   - GP-11: buildGmAgentPrompt() startsWith GM_AGENT_SYSTEM_PROMPT
 *   - GP-12: buildGmAgentPrompt() contains '\n\n---\n\n' separator
 *   - GP-13: buildGmAgentPrompt() contains each example's transcript verbatim (3x)
 *   - GP-14: buildGmAgentPrompt().length > GM_AGENT_SYSTEM_PROMPT.length + 800
 *   - GP-15: No 'sk-', 'Token ', or 'DEEPGRAM_API_KEY' in prompt (T-12-PROMPT-01)
 *   - GP-16: Barrel exports buildGmAgentPrompt + GM_AGENT_SYSTEM_PROMPT + WORKED_EXAMPLES
 *
 * @see ./gm-agent-prompt.ts (GM_AGENT_SYSTEM_PROMPT + buildGmAgentPrompt)
 * @see ./worked-examples.ts (WORKED_EXAMPLES — Task 2)
 * @see ./index.ts (barrel re-export)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md Task 3
 */
import { describe, expect, it } from 'vitest';
import { buildGmAgentPrompt, GM_AGENT_SYSTEM_PROMPT } from './gm-agent-prompt.js';
import { WORKED_EXAMPLES } from './worked-examples.js';

describe('GM_AGENT_SYSTEM_PROMPT content (GP-01..GP-10)', () => {
  it('GP-01: non-empty string ≥ 600 chars', () => {
    expect(typeof GM_AGENT_SYSTEM_PROMPT).toBe('string');
    expect(GM_AGENT_SYSTEM_PROMPT.length).toBeGreaterThanOrEqual(600);
  });

  it("GP-02: contains 'GM-Agent' (role definition — directive 1)", () => {
    expect(GM_AGENT_SYSTEM_PROMPT).toContain('GM-Agent');
  });

  it("GP-03: contains 'D&D 5e' or 'D&D' (game system — directive 1)", () => {
    const hasSystem =
      GM_AGENT_SYSTEM_PROMPT.includes('D&D 5e') || GM_AGENT_SYSTEM_PROMPT.includes('D&D');
    expect(hasSystem).toBe(true);
  });

  it("GP-04: contains 'Foundry VTT' (host platform — directive 1)", () => {
    expect(GM_AGENT_SYSTEM_PROMPT).toContain('Foundry VTT');
  });

  it("GP-05: 'confirm' within 200 chars of 'target' (directive 2 — spell+target confirm)", () => {
    const lower = GM_AGENT_SYSTEM_PROMPT.toLowerCase();
    const confirmIdx = lower.indexOf('confirm');
    const targetIdx = lower.indexOf('target');
    expect(confirmIdx).toBeGreaterThanOrEqual(0);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    expect(Math.abs(confirmIdx - targetIdx)).toBeLessThanOrEqual(200);
  });

  it("GP-06: contains 'palla di fuoco' AND 'fireball' (directive 3 — code-switching tolerance)", () => {
    expect(GM_AGENT_SYSTEM_PROMPT).toContain('palla di fuoco');
    expect(GM_AGENT_SYSTEM_PROMPT).toContain('fireball');
  });

  it("GP-07: 'clarify' within 200 chars of 'ambig' (directive 4 — ambiguity → clarify)", () => {
    const lower = GM_AGENT_SYSTEM_PROMPT.toLowerCase();
    const clarifyIdx = lower.indexOf('clarify');
    const ambigIdx = lower.indexOf('ambig');
    expect(clarifyIdx).toBeGreaterThanOrEqual(0);
    expect(ambigIdx).toBeGreaterThanOrEqual(0);
    expect(Math.abs(clarifyIdx - ambigIdx)).toBeLessThanOrEqual(200);
  });

  it('GP-08: contains all 6 MCP tool IDs as kebab-case literals (directive 5)', () => {
    const TOOL_IDS = [
      'cast-spell',
      'weapon-attack',
      'use-item',
      'move-token',
      'place-template',
      'drop-concentration',
    ] as const;
    for (const id of TOOL_IDS) {
      expect(GM_AGENT_SYSTEM_PROMPT, `missing tool ID: ${id}`).toContain(id);
    }
  });

  it("GP-09: contains 'visual toast' OR 'toast visivo' (directive 6 — VOICE-05, no audio)", () => {
    const hasVoice05 =
      GM_AGENT_SYSTEM_PROMPT.includes('visual toast') ||
      GM_AGENT_SYSTEM_PROMPT.includes('toast visivo');
    expect(hasVoice05).toBe(true);
  });

  it("GP-10: contains 'actor://current' or 'combat://current' (resource read guidance)", () => {
    const hasResource =
      GM_AGENT_SYSTEM_PROMPT.includes('actor://current') ||
      GM_AGENT_SYSTEM_PROMPT.includes('combat://current');
    expect(hasResource).toBe(true);
  });
});

describe('buildGmAgentPrompt() shape (GP-11..GP-14)', () => {
  const built = buildGmAgentPrompt();

  it('GP-11: startsWith GM_AGENT_SYSTEM_PROMPT', () => {
    expect(built.startsWith(GM_AGENT_SYSTEM_PROMPT)).toBe(true);
  });

  it("GP-12: contains '\\n\\n---\\n\\n' separator", () => {
    expect(built).toContain('\n\n---\n\n');
  });

  it('GP-13: contains each example transcript verbatim', () => {
    for (const example of WORKED_EXAMPLES) {
      expect(built, `missing transcript for example ${example.id}`).toContain(example.transcript);
    }
  });

  it('GP-14: length > GM_AGENT_SYSTEM_PROMPT.length + 800 (worked examples add substantial body)', () => {
    expect(built.length).toBeGreaterThan(GM_AGENT_SYSTEM_PROMPT.length + 800);
  });
});

describe('Security constraints (GP-15)', () => {
  it('GP-15: no sk-, Token, or DEEPGRAM_API_KEY in prompt (T-12-PROMPT-01)', () => {
    const SECRET_RE = /DEEPGRAM_API_KEY|sk-[A-Za-z0-9]{20,}|Token [A-Za-z0-9_-]{20,}/;
    expect(GM_AGENT_SYSTEM_PROMPT.match(SECRET_RE)).toBeNull();
    expect(buildGmAgentPrompt().match(SECRET_RE)).toBeNull();
  });
});

describe('Barrel export contract (GP-16)', () => {
  it('GP-16: voice/index.ts re-exports buildGmAgentPrompt + GM_AGENT_SYSTEM_PROMPT + WORKED_EXAMPLES', async () => {
    const barrel = await import('./index.js');
    expect(typeof barrel.GM_AGENT_SYSTEM_PROMPT).toBe('string');
    expect(typeof barrel.buildGmAgentPrompt).toBe('function');
    expect(Array.isArray(barrel.WORKED_EXAMPLES)).toBe(true);
  });
});
