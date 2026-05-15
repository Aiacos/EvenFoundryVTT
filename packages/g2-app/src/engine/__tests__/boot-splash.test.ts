/**
 * Unit tests for boot-splash (Phase 4a Plan 02 Task 2).
 *
 * Covers (per 04A-02-PLAN.md `<behavior>` block, BS-1 .. BS-4):
 *   - showBootSplash renders the 5-step checklist via textContainerUpgrade in
 *     order: G2 display → R1 paired → Bridge → Foundry sync → Character
 *   - Each step content uses the UI-SPEC §Screen 1 checklist markers
 *   - The final textContainerUpgrade renders the protocol line
 *     `protocol {ver} · panels available: {N}`
 *   - textContainerUpgrade rejection propagates (no swallow)
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §boot-splash.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 1
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { type BootStep, type BootStepState, showBootSplash } from '../boot-splash.js';

function makeMockBridge() {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(0),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
  };
}

function makeSteps(): BootStep[] {
  return [
    { label: 'G2 display 576×288', state: 'done' satisfies BootStepState },
    { label: 'R1 ring paired (92%)', state: 'done' satisfies BootStepState },
    { label: 'Bridge ws://homelab:8910', state: 'in_progress' satisfies BootStepState },
    { label: 'Foundry sync', state: 'pending' satisfies BootStepState },
    { label: 'Character: Thorin', state: 'pending' satisfies BootStepState },
  ];
}

describe('boot-splash.showBootSplash', () => {
  it('BS-1: calls textContainerUpgrade once per step in label order (5 total) + 1 protocol-line call', async () => {
    const bridge = makeMockBridge();
    const steps = makeSteps();
    await showBootSplash(bridge as unknown as EvenAppBridge, {
      steps,
      protocolVersion: '1.0',
      panelsAvailable: 5,
    });
    // 5 step calls + 1 final protocol-line call = 6
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(6);

    // First 5 calls reference the 5 step labels in order
    for (let i = 0; i < 5; i++) {
      const arg = bridge.textContainerUpgrade.mock.calls[i]?.[0];
      const content = String(arg?.content ?? '');
      expect(content).toContain(steps[i]?.label ?? '');
    }
  });

  it('BS-2: each rendered step uses one of the UI-SPEC §Screen 1 state markers', async () => {
    const bridge = makeMockBridge();
    await showBootSplash(bridge as unknown as EvenAppBridge, {
      steps: makeSteps(),
      protocolVersion: '1.0',
      panelsAvailable: 5,
    });
    // Each of the 5 step calls must contain at least one of the canonical markers.
    const markerRe = /\[\s*(?:✓|⟳|✕|\s)\s*\]/u;
    for (let i = 0; i < 5; i++) {
      const arg = bridge.textContainerUpgrade.mock.calls[i]?.[0];
      const content = String(arg?.content ?? '');
      expect(content).toMatch(markerRe);
    }
  });

  it('BS-3: final call renders the protocol line `protocol {v} · panels available: {N}`', async () => {
    const bridge = makeMockBridge();
    await showBootSplash(bridge as unknown as EvenAppBridge, {
      steps: makeSteps(),
      protocolVersion: '1.0',
      panelsAvailable: 5,
    });
    const last = bridge.textContainerUpgrade.mock.calls.at(-1)?.[0];
    const content = String(last?.content ?? '');
    expect(content).toContain('protocol 1.0');
    expect(content).toContain('panels available: 5');
  });

  it('BS-4: propagates textContainerUpgrade rejections', async () => {
    const bridge = makeMockBridge();
    bridge.textContainerUpgrade.mockRejectedValueOnce(new Error('bridge boom'));
    await expect(
      showBootSplash(bridge as unknown as EvenAppBridge, {
        steps: makeSteps(),
        protocolVersion: '1.0',
        panelsAvailable: 5,
      }),
    ).rejects.toThrow(/bridge boom/);
  });
});
