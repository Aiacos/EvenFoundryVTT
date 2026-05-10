// JSON+CSV evidence writer (D-07). Filename pattern: {test_id}-{env?}-{ISO8601}.json
// Path: docs/perf/phase-0/ (resolved relative to repo root via process.cwd() expectation).
// Zod-validated payload only — refuses anything that doesn't conform to AnyResult.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import type { AnyResult } from "./schemas.js";

const EVIDENCE_DIR = path.resolve("docs/perf/phase-0");

function safeFilename(payload: AnyResult): string {
  const tsSafe = payload.timestamp.replace(/[:.]/g, "-");
  const envPart = payload.env ? `-${payload.env}` : "";
  return `${payload.test_id}${envPart}-${tsSafe}`;
}

export async function writeJsonEvidence(payload: AnyResult): Promise<string> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const fname = `${safeFilename(payload)}.json`;
  const fpath = path.join(EVIDENCE_DIR, fname);
  await writeFile(fpath, JSON.stringify(payload, null, 2), "utf8");
  return fpath;
}

// CSV emitted only for tests with `samples_kbps` numeric arrays (BLE, DLE).
// Other tests skip CSV (no array data to flatten).
export async function writeCsvEvidence(payload: AnyResult): Promise<string | null> {
  if (!("samples_kbps" in payload)) return null;
  const samples = payload.samples_kbps;
  if (!Array.isArray(samples) || samples.length === 0) return null;
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const fname = `${safeFilename(payload)}.csv`;
  const fpath = path.join(EVIDENCE_DIR, fname);
  const rows = samples.map((kbps, i) => ({ sample_idx: i, kbps }));
  const csv = stringify(rows, { header: true, columns: ["sample_idx", "kbps"] });
  await writeFile(fpath, csv, "utf8");
  return fpath;
}
