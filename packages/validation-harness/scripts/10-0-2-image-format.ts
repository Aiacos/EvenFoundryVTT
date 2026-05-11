// Specs §10.0.2 + Pitfall 7 — updateImageRawData byte format probe.
// 3 candidate formats:
//   A: PNG indexed-palette 4-bit greyscale (~3-5 KB) — generated via upng-js@2.1.0 (CLAUDE.md §11.5.7 pin)
//   B: Raw 4-bit packed big-endian (10000 bytes for 200×100)
//   C: Raw 4-bit packed little-endian (same length, swapped nibble order)
//
// Protocol: harness sends each format sequentially (5 sec hold per format), prompts researcher
// to photograph G2 and enter verdict A/B/C/none via CLI. Promotes the identified format to ADR-0006
// + Phase 4a boot-time format probe (Pitfall 7 mitigation 2 — re-verify on every plugin boot).
//
// Skip case: Hub unavailable → write skipped evidence + exit 2 (Pattern 3 capability-negotiation skip).
//
// Threat model T-00-03: ZERO network introspection. Probe pattern hash anchors INV-2 traceability.

import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import UPNG from 'upng-js';
import { loadHub } from '../src/lib/hub.js';
import { writeJsonEvidence } from '../src/lib/output.js';
import { ImageFormatResult } from '../src/lib/schemas.js';

// upng-js ships no .d.ts in 2.1.0; ambient module declaration lives in tests/phase-0/upng-js.d.ts.
// CLAUDE.md §11.5.7 pins upng-js@2.1.0; @types/upng-js does not exist on npm (verified 2026-05-10).

// THRESHOLDS pre-committed top-level (D-12 strict numeric, no runtime overrides).
const THRESHOLDS = {
  width: 200,
  height: 100,
  hold_per_format_sec: 5,
} as const;

function makeFormatA(width: number, height: number): Uint8Array {
  // 16-step uniform greyscale palette (calibration §10.0.9 will refine perceptually).
  // Test pattern: top half = vertical 16-step gradient, bottom half = 8x8 checker
  const indexed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const grad = Math.min(15, Math.floor((y / (height / 2)) * 16));
      const checker = ((x >> 3) ^ (y >> 3)) & 1 ? 15 : 0;
      indexed[y * width + x] = y < height / 2 ? grad : checker;
    }
  }
  // upng-js encodeLL signature: encodeLL([buffers], w, h, channels, depthChannels, depth)
  // For 4-bit indexed greyscale: channels=1, depthChannels=0 (indexed), depth=4.
  // Note: upng-js indexed mode auto-derives palette from buffer values; we pre-quantize to 0..15
  // so the palette ends up as a 16-entry greyscale ramp.
  // Cast Uint8Array.buffer → ArrayBuffer (Node TS lib types may surface ArrayBufferLike).
  return new Uint8Array(UPNG.encodeLL([indexed.buffer as ArrayBuffer], width, height, 1, 0, 4));
}

function makeFormatB(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array((width * height) / 2);
  for (let i = 0; i < bytes.length; i++) {
    const x0 = (i * 2) % width;
    const y0 = Math.floor((i * 2) / width);
    const x1 = (i * 2 + 1) % width;
    const y1 = Math.floor((i * 2 + 1) / width);
    void x0;
    void x1;
    const v0 = Math.min(15, Math.floor((y0 / height) * 16)) & 0xf;
    const v1 = Math.min(15, Math.floor((y1 / height) * 16)) & 0xf;
    // Big-endian: high nibble = first pixel
    bytes[i] = (v0 << 4) | v1;
  }
  return bytes;
}

function makeFormatC(width: number, height: number): Uint8Array {
  const bytes = makeFormatB(width, height);
  // Swap nibbles (little-endian)
  for (let i = 0; i < bytes.length; i++) {
    const cur = bytes[i] ?? 0;
    bytes[i] = ((cur & 0xf) << 4) | ((cur >> 4) & 0xf);
  }
  return bytes;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log('Specs §10.0.2 — updateImageRawData byte format probe (Pitfall 7)');
  console.log('==================================================================');
  console.log(`Image dimensions: ${THRESHOLDS.width}×${THRESHOLDS.height}`);
  console.log(`Hold per format: ${THRESHOLDS.hold_per_format_sec} sec`);
  console.log();

  const hub = await loadHub();
  if (!hub.available) {
    const skipped = ImageFormatResult.parse({
      schema_version: 1,
      test_id: '10-0-2-image-format',
      timestamp: new Date().toISOString(),
      verdict: 'skipped',
      rationale: hub.reason,
      formats_tested: [],
      identified_format: 'none',
      probe_pattern_hash: '',
      researcher_visual_verdict: 'skipped — Hub unavailable',
    });
    const fpath = await writeJsonEvidence(skipped);
    console.log(`[SKIP] ${hub.reason}`);
    console.log(`Evidence: ${fpath}`);
    process.exit(2);
  }

  await hub.bridge.createImageContainer({
    id: 'img-probe',
    x: 0,
    y: 0,
    w: THRESHOLDS.width,
    h: THRESHOLDS.height,
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const formats = [
    { id: 'A-png-indexed' as const, data: makeFormatA(THRESHOLDS.width, THRESHOLDS.height) },
    { id: 'B-raw-4bit-be' as const, data: makeFormatB(THRESHOLDS.width, THRESHOLDS.height) },
    { id: 'C-raw-4bit-le' as const, data: makeFormatC(THRESHOLDS.width, THRESHOLDS.height) },
  ];

  // Hash for INV-2 traceability — anchors the canonical probe pattern across re-runs
  const hash = createHash('sha256');
  for (const f of formats) hash.update(f.data);
  const probePatternHash = hash.digest('hex');

  console.log(`Probe pattern hash (sha256): ${probePatternHash}`);
  console.log(
    `(This hash anchors the canonical probe pattern for INV-2 + Phase 4a boot-time self-test per Pitfall 7 mitigation 2.)`,
  );
  console.log();

  for (const f of formats) {
    console.log(`\n>>> Sending Format ${f.id} (${f.data.length} bytes)...`);
    await hub.bridge.updateImageRawData('img-probe', f.data);
    console.log(`>>> Photograph G2 NOW. Holding for ${THRESHOLDS.hold_per_format_sec} sec.`);
    await sleep(THRESHOLDS.hold_per_format_sec * 1000);
  }

  console.log();
  const verdict = await rl.question(
    `Which format rendered the test pattern (top half = 16-step vertical gradient, bottom half = 8×8 checker)?\n` +
      `  A — PNG indexed (Format A)\n` +
      `  B — raw 4-bit big-endian (Format B)\n` +
      `  C — raw 4-bit little-endian (Format C)\n` +
      `  none — none rendered correctly\n` +
      `> `,
  );
  const cleanVerdict = verdict.trim().toUpperCase();
  const identified =
    cleanVerdict === 'A'
      ? 'A-png-indexed'
      : cleanVerdict === 'B'
        ? 'B-raw-4bit-be'
        : cleanVerdict === 'C'
          ? 'C-raw-4bit-le'
          : 'none';
  await rl.close();

  const passOrFail: 'pass' | 'fail' = identified === 'none' ? 'fail' : 'pass';

  const result = ImageFormatResult.parse({
    schema_version: 1,
    test_id: '10-0-2-image-format',
    timestamp: new Date().toISOString(),
    verdict: passOrFail,
    rationale:
      identified === 'none'
        ? `No format rendered correctly — Phase 4a raster pipeline blocked, glyph-only mode required (Branch C trigger or SDK API mismatch — re-verify post-grant SDK signature)`
        : `Format ${identified} renders correctly — Phase 4a raster pipeline + boot-time format probe pattern locked (Pitfall 7 mitigation 2)`,
    formats_tested: ['A-png-indexed', 'B-raw-4bit-be', 'C-raw-4bit-le'],
    identified_format: identified,
    probe_pattern_hash: probePatternHash,
    researcher_visual_verdict: `Researcher entered: "${verdict.trim()}" → identified ${identified}`,
  });
  const fpath = await writeJsonEvidence(result);
  console.log();
  console.log(`Verdict: ${passOrFail.toUpperCase()}`);
  console.log(`Identified format: ${identified}`);
  console.log(`Evidence: ${fpath}`);
  process.exit(passOrFail === 'pass' ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
