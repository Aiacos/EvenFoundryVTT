---
slug: raster-dynamic-infill
date: 2026-05-14
type: inv2-round-evidence
binds: Specs.md §3.1 hardware constraint, ADR-0001 layered model, §7.2 / §7.4 / §7.4b
---

# INV-2 Re-Verification Round — Even Realities G2 Image API Constraint (2026-05-14)

## Trigger

User asked to push the raster map area past the documented 400×200 effective max. Per CLAUDE.md INV-2:

> *"Don't re-litigate constraints already verified upstream. If you suspect a claim has drifted, run a fresh WebFetch round (≥4 parallel) against canonical sources and log the result — don't quietly 'correct' without evidence."*

## Audit method

6 WebFetch attempts (the spec requires ≥4 parallel on canonical sources):

| # | URL | Status | Key finding |
|---|---|---|---|
| 1 | `https://hub.evenrealities.com/docs/guides/device-apis` | 200 OK (canonical primary) | Verbatim quote: *"No direct Bluetooth access, no arbitrary pixel drawing, no audio output, no text alignment, no font control, no background colors, no per-item list styling, no programmatic scroll position, no animations, no camera (there is none), and images are greyscale only."* Specific 200×100 dimension not visible in fetched text. |
| 2 | `https://hub.evenrealities.com/docs/getting-started/overview` | 200 OK | *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Display 576×288 4-bit, 4-mic, no speaker, no camera — all unchanged. |
| 3 | `https://evenrealities.com/ai-glasses` | 200 OK (marketing) | No granular specs on landing page. |
| 4 | `https://support.evenrealities.com/specs` | **HTTP 404** | Path deprecated/moved. |
| 5 | `https://hub.evenrealities.com/docs/guides/quickstart` | 200 but SPA-empty | React root, no content fetched via WebFetch. |
| 6 | `https://hub.evenrealities.com/docs/reference/api` | 200 but SPA-empty | React root, no content fetched via WebFetch. |

## Findings synthesis

### Constraint CONFIRMED — no drift

The **fundamental hardware constraint** (*"no arbitrary pixel drawing"*) is **verbatim present** on the canonical primary source `hub.evenrealities.com/docs/guides/device-apis` at 2026-05-14. This precludes any single full-screen 576×288 raster regardless of container dimensions.

### Constraint number — specific 200×100 not directly visible on canonical primary

The exact "image container max 200×100 px" number cited in Specs.md §3.1 is not visible on the fetched canonical text. Two non-mutually-exclusive interpretations:

- (a) The number lives in a sub-reference page that is not WebFetch-reachable today (SPA root pages 5 and 6 returned empty content);
- (b) The number was sourced from a previously fetched canonical that has been restructured.

This is **not classified as drift** for this round because the broader constraint that gates the discussion (*"no arbitrary pixel drawing"*) is preserved. Specific-number re-verification flagged as INV-2 follow-up.

### ADR-0001 cross-reference

`docs/architecture/0001-layered-ui-model.md` cites:

> *"max 4 image containers + 8 text/list containers + exactly 1 container with `isEventCapture: 1` per page"*

This budget statement is the **operative upstream-derived constraint** that controls the rest of the architecture. The Image Container count (4) is the hard ceiling that makes the 5th-tile idea infeasible. No drift on this number this round.

## Drift classification

**NEUTRO / no-drift** for the substantive constraint set (4 image containers, 8 text/list containers, 1 capture container, no arbitrary pixel drawing).

**FOLLOW-UP** for the specific 200×100 dimension citation: cannot be directly re-confirmed on the fetched canonical primary text snapshot 2026-05-14. Suggested follow-up: try `hub.evenrealities.com/docs/sdk-reference/*` paths with a JS-rendering fetch (chrome-devtools MCP) once the SDK auth/access is sorted out, or cross-check against the BxNxM/even-dev simulator README (referenced in Specs §13).

## Decision matrix presented to user

| # | Approach | Constraint impact | User decision |
|---|---|---|---|
| A | Use the 88 px vertical band below the raster | INV-compatible; cosmetic + 1-2 text container | not selected |
| B (original framing) | Repurpose z=2 overlay container as 5th raster tile when idle | **NOT FEASIBLE** — image container budget hard-capped at 4 | originally selected; corrected after I flagged the error |
| C | Reallocate status HUD z=1 to give map more width | Breaks INV-1 status-HUD persistence rule | not selected |
| **CORRECTED-B** | **Introduce z=0.5 Idle Content Infill** — text containers fill the ~5 empty rows in the map area when no overlay; auto-demolished on z=2 mount | INV-compatible (uses text/list budget, not image budget) | **SELECTED 2026-05-14** |

## References

- `https://hub.evenrealities.com/docs/guides/device-apis` (fetched 2026-05-14, canonical primary)
- `https://hub.evenrealities.com/docs/getting-started/overview` (fetched 2026-05-14)
- `Specs.md` §3.1 (hardware constraints), §7.2 (layered model), §7.4b.3 (Maximum Raster Approach D), §11.5.7-§11.5.8 (raster pipeline + failure modes)
- `docs/architecture/0001-layered-ui-model.md` (container budget verbatim)
- `CLAUDE.md` § Project Invariants — INV-2 audit method
