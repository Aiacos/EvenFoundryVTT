/**
 * 4-bit pixel run-length encoder + decoder for the G2 raster pipeline.
 *
 * Wire shape: each output unit is a `[runLength: u8 (1-255), pixelValue: u8 (0-15)]`
 * tuple. A run longer than 255 is emitted as multiple consecutive units that
 * share the same pixel value. The encoder rejects any input byte > 15 — the
 * G2 wire format is 4-bit indexed greyscale (16 phosphor-green levels per
 * Specs §3.1), so a value > 15 is a programming error upstream of this
 * encoder. The decoder rejects truncated streams (odd-length input) and any
 * stream that would decode to a length that disagrees with an optional
 * `expectedLength` argument.
 *
 * This is used as a telemetry/compression-stats sink (`encodeRle4bit(tileBuffer)`
 * length is logged alongside the PNG payload length) — the actual on-wire
 * payload for `updateImageRawData` is the 4-bit indexed PNG produced by
 * `upng-js`. Per CONTEXT.md §Area 2 the custom RLE is reserved for the
 * "encode only changed sub-tiles" layer of the 6-layer optimization stack
 * (Specs §7.4b.6.1 Layer 4).
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-03-PLAN.md Task 1
 */

/**
 * Encode a 4-bit pixel buffer into RLE byte pairs.
 *
 * Output is a `Uint8Array` of even length. Each pair is
 * `[runLength (1..255), pixelValue (0..15)]`. A run of length L > 255 is split
 * into `floor(L / 255)` units of length 255 followed by an optional remainder
 * unit (1..254).
 *
 * @param input  Input pixel buffer — every element MUST be in `[0, 15]`.
 * @returns      Encoded `Uint8Array` (even length).
 * @throws       `Error` with `RLE encode` prefix on values > 15.
 */
export function encodeRle4bit(input: Uint8Array): Uint8Array {
  // Validate first — never write a partial output then throw.
  for (let i = 0; i < input.length; i++) {
    const v = input[i] ?? 0;
    if (v > 15) {
      throw new Error(`RLE encode: invalid 4-bit value ${v} at index ${i} (must be 0..15)`);
    }
  }
  // Worst case: every byte differs from the next ⇒ 2 output bytes per input
  // byte. Allocate that upper bound and slice at the end.
  const out = new Uint8Array(input.length * 2);
  let outLen = 0;
  let i = 0;
  while (i < input.length) {
    const value = input[i] ?? 0;
    let run = 1;
    // Extend the run until the value changes (no upper bound here — the
    // 255-cap is enforced by the chunk loop below).
    while (i + run < input.length && (input[i + run] ?? 0) === value) {
      run++;
    }
    // Emit one or more 255-capped chunks for this run.
    let remaining = run;
    while (remaining > 0) {
      const chunk = remaining > 255 ? 255 : remaining;
      out[outLen++] = chunk;
      out[outLen++] = value;
      remaining -= chunk;
    }
    i += run;
  }
  return out.slice(0, outLen);
}

/**
 * Decode an RLE byte stream produced by {@link encodeRle4bit} back into a
 * 4-bit pixel buffer.
 *
 * @param input          Encoded byte stream (even length).
 * @param expectedLength Optional decoded length expected; if supplied and the
 *                      decoded buffer ends at a different length, the function
 *                      throws.
 * @returns              Decoded `Uint8Array` of pixel values.
 * @throws               `Error` with `RLE decode` prefix on truncated input,
 *                       run-length = 0, or expected-length mismatch.
 */
export function decodeRle4bit(input: Uint8Array, expectedLength?: number): Uint8Array {
  if ((input.length & 1) !== 0) {
    throw new Error(`RLE decode: truncated input (length ${input.length} is not even)`);
  }
  // First pass: compute total decoded length so we allocate exactly once.
  let totalLen = 0;
  for (let p = 0; p < input.length; p += 2) {
    const run = input[p] ?? 0;
    if (run === 0) {
      throw new Error(`RLE decode: invalid zero run length at offset ${p}`);
    }
    totalLen += run;
  }
  if (expectedLength !== undefined && totalLen !== expectedLength) {
    throw new Error(
      `RLE decode: length mismatch — expected ${expectedLength}, decoded ${totalLen}`,
    );
  }
  // Second pass: materialize the output buffer.
  const out = new Uint8Array(totalLen);
  let outIdx = 0;
  for (let p = 0; p < input.length; p += 2) {
    const run = input[p] ?? 0;
    const value = input[p + 1] ?? 0;
    if (value > 15) {
      throw new Error(`RLE decode: invalid 4-bit value ${value} at offset ${p + 1}`);
    }
    for (let k = 0; k < run; k++) {
      out[outIdx++] = value;
    }
  }
  return out;
}
