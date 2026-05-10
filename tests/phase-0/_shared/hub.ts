// Even Hub SDK loader/wrapper. Pre-grant: uses Even Hub Simulator (BxNxM/even-dev) interface
// loaded into the WebView page. Post-grant: dynamically imports @evenrealities/even_hub_sdk.
//
// The harness scripts (10-0-X-*.ts) call loadHub() at boot. If Hub is unavailable, the script
// emits a `verdict: "skipped"` evidence file and exits 0 (per Pattern 3 in RESEARCH.md).
//
// T-00-04 mitigation: credentials read from process.env.EVEN_HUB_TOKEN ONLY. Never inline.

export type HubBridge = {
  // Subset surface used by Phase 0 tests; expanded by Phase 4a g2-app integration.
  createImageContainer(opts: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }): Promise<void>;
  updateImageRawData(id: string, data: Uint8Array): Promise<void>;
  createTextContainer(opts: { id: string; text: string; x: number; y: number }): Promise<void>;
  // R1 events arrive via subscription callback registered at loadHub time.
  onR1Event(handler: (ev: { type: string; t_ms: number; raw: unknown }) => void): () => void;
  // Audio is out of Phase 0 scope (V2 voice work) — not surfaced here.
};

export type HubLoadOptions = {
  // If true and Hub unavailable, throws instead of returning null.
  required?: boolean;
};

export type HubLoadResult =
  | { available: true; bridge: HubBridge; source: "simulator" | "real-sdk" }
  | { available: false; reason: string };

// In a real WebView context this looks at globalThis.bridge (injected by Even Realities App)
// or by the simulator. In a Node tsx context (typecheck/run-all without hardware), no bridge
// is present, so we return { available: false } and tests emit "skipped" evidence.
export async function loadHub(opts: HubLoadOptions = {}): Promise<HubLoadResult> {
  // Read env-only credential per T-00-04 — never accept inline.
  const token = process.env["EVEN_HUB_TOKEN"];
  if (!token && opts.required) {
    return {
      available: false,
      reason:
        "EVEN_HUB_TOKEN env var not set — set in .env.local (gitignored) before running hardware tests",
    };
  }
  // globalThis.bridge is injected by Even Realities App WebView OR the simulator's iframe shim.
  const maybeBridge = (globalThis as { bridge?: HubBridge }).bridge;
  if (maybeBridge) {
    return { available: true, bridge: maybeBridge, source: "simulator" };
  }
  // Defer real-SDK dynamic import to post-grant (will be:
  //   const sdk = await import("@evenrealities/even_hub_sdk");
  //   return { available: true, bridge: sdk.bridge, source: "real-sdk" };
  // ).
  return {
    available: false,
    reason:
      "Even Hub bridge not present in globalThis. Run inside Even Hub Simulator (BxNxM/even-dev) or the Even Realities App WebView with a paired G2.",
  };
}

export function isHubAvailable(): boolean {
  return Boolean((globalThis as { bridge?: HubBridge }).bridge);
}
