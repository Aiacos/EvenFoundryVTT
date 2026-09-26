<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0 (2026-09-26)
Bump rationale: MINOR — one new principle (XII Living Tracking Files) + icon-map entry
(Tasks / TODO ✅); factual refresh of Additional Constraints after ADR-0019 (relay pairing).
Added principles:
  XII.  Living Tracking Files — root `TODO.md`, `SECURITY.md`, `CHANGELOG.md` as checkable,
        referenced lists; format enforced by `scripts/check-tracking-files.mjs` (CI).
Modified principles:
  XI.   Consistent Chapter Icons — map gains «Tasks / TODO ✅».
Changed sections: Additional Constraints (pairing = relay QR/code per ADR-0019; SDK 0.0.16).
Mapping to CLAUDE.md "Engineering Constitution" P1–P12: … P11=XI, P12=XII.
Templates requiring updates:
  ✅ .specify/templates/* — read this file dynamically; no edit required.
  ✅ CLAUDE.md — P12 + icon row added in the same commit.
Follow-up TODOs: none.

---- previous report (1.1.0) ----
Version change: 1.0.0 → 1.1.0 (2026-09-23, v0.12.0 direct-streaming port)
Bump rationale: MINOR — one new principle (XI) and materially expanded guidance (V, IX),
plus factual corrections after the bridge was removed (ADR-0016..0018).

Modified principles:
  IV.   Performance Budgets — v0.12 map budget (≤ 1 fps, hash skip) noted; bridge-era 5/15 fps stream kept as history.
  V.    Autonomous Debug & Validation — rewritten around the direct model: debug loop
        (reproduce → isolate → fix → regression test), g2-app debug channel, `?demo=` scenarios,
        Even Hub simulator loop (`sim:check`); bridge/Docker/pv-doctor references removed.
  IX.   Reliable, Useful CI/CD — gate rule: every mechanically checkable principle gets a CI gate;
        never bypass (`--no-verify`, skipped jobs, lowered thresholds); remove dead gates.
Added principles:
  XI.   Consistent Chapter Icons — canonical heading-icon map (ported from the direct-streaming
        branch's Engineering Constitution P11).
Changed sections: preamble (no Node bridge); Additional Constraints (image container 20–288 ×
  20–144, long-press only as duplicate shortcut, QR pairing shown by Foundry, voice/MCP needs a
  new ADR); Development Workflow (Spec Kit feature folders).
Mapping to CLAUDE.md "Engineering Constitution" P1–P11: P1≈I, P2≈II, P3≈III, P4≈IV, P5≈V,
  P6≈VI, P7≈VII, P8≈VIII, P9≈IX, P10≈X, P11=XI.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md  — Constitution Check reads this file dynamically; no edit required.
  ✅ .specify/templates/spec-template.md  — no conflict.
  ✅ .specify/templates/tasks-template.md — no conflict.
  ⚠ CLAUDE.md — must carry the same P1–P11 wording (updated in the same v0.12.0 docs commit).

Follow-up TODOs: none.

---- previous report (1.0.0) ----
Version change: (unversioned template) → 1.0.0
Bump rationale: First ratified constitution; all principles newly defined (MAJOR baseline).

Principles (all NEW in 1.0.0):
  I.    Code Quality & Zero Dead Code
  II.   Test-First & Coverage Discipline
  III.  Layout & UX Consistency (INV-1)
  IV.   Performance Budgets
  V.     Autonomous Debug & Validation
  VI.   Source-Verified SDK & Library Research (INV-2)
  VII.  Documentation Coherence (INV-3)
  VIII. Repository Hygiene
  IX.   Reliable, Useful CI/CD
  X.     Disciplined Subagent Orchestration

Added sections: Additional Constraints; Development Workflow & Quality Gates; Governance.
Removed sections: none (template placeholders fully replaced).

Templates requiring updates:
  ✅ .specify/templates/plan-template.md  — "Constitution Check" gate references this file dynamically; no edit required.
  ✅ .specify/templates/spec-template.md  — no mandatory-section conflict; no edit required.
  ✅ .specify/templates/tasks-template.md — task categories already cover testing/docs/perf; no edit required.
  ✅ CLAUDE.md — constitution is consistent with INV-1..INV-4 and the Conventions section.

Follow-up TODOs: none.
-->

# EvenFoundryVTT Constitution

EvenFoundryVTT (EVF) projects a FoundryVTT D&D 5e session onto Even Realities G2 AR glasses
directly through the Foundry module (no server of our own since v0.12.0, ADR-0016), driven by
R1 ring gestures. These principles are non-negotiable rules for
every change. They extend and operationalize the four project invariants (INV-1..INV-4) in
`Specs.md` §0.1 and `CLAUDE.md`; where this document and an invariant overlap, both bind.

## Core Principles

### I. Code Quality & Zero Dead Code

Code MUST be clean, optimized, documented, and free of dead or unreachable code (INV-4).
Biome (lint + format) and TypeScript strict (with the 6 lifted flags) MUST pass with zero
errors on every change; warnings introduced by a change MUST be resolved or explicitly
justified in the PR. Every exported/public API MUST carry JSDoc/TSDoc. A `// TODO` is only
permitted with a `(#issue)` or `(ADR-NNNN)` reference. Match the surrounding code's idiom,
naming, and comment density — consistency outranks personal style.

Rationale: the system is multi-package and long-lived; unreviewed cruft compounds into
unmaintainable surface area and hides real defects.

### II. Test-First & Coverage Discipline

New behavior MUST be covered by tests; bug fixes MUST add a regression test that fails
before the fix. Vitest is the only test runner. The v8 coverage gate (≥80%) MUST hold.
Pure logic MUST be unit-tested in isolation (export the function rather than reaching into
a process); integration-level behavior (g2-app session ↔ projector sealed-envelope
round-trips on a fake socket, write-path handlers, zone rendering) MUST have integration tests. A change that lowers coverage
or disables a test without a documented reason MUST NOT merge.

Rationale: deterministic correctness is the MVP's core promise; tests are the only durable
proof that gestures and rendering behave identically across states and locales.

### III. Layout & UX Consistency (INV-1)

Every ASCII mockup and every runtime layout MUST align character-perfect across all states,
contents, and locales (IT + EN). Frame corners, dividers, and columns occupy the same column
from top to bottom, always. Variable content (HP `7` vs `700`, name length, condition
overflow, i18n width) MUST be width-budgeted at build time, never left to best-effort.
Layout-bearing mockups in `Specs.md` are the contract for INV-1 snapshot tests and MUST be
edited with character precision. The user MUST never be forced to look at a phone or laptop
to use the HUD — any decision that breaks the glanceable, on-glasses experience is wrong.

Rationale: a misaligned or off-glasses HUD destroys the product's single core value.

### IV. Performance Budgets

The map stream targets 5 fps committed / 15 fps stretch; hot paths (capture, encode, delta
hash, frame fan-out) MUST stay within their documented budgets and MUST NOT regress without
a recorded benchmark and a justification. When a performance ceiling is hit, the bottleneck
MUST be measured (telemetry: capture/encode/post timings, ingress/egress fps) and attributed
to a specific stage before any fix — never guessed. Any cap, truncation, sampling, or dropped
work MUST be logged, not silent.

Since v0.12.0 the map is not a stream: zone C is rebuilt on the phone from document data and
sent at most once per second, only when its hash changes; image updates are paced ≥ 100 ms
(SDK) and sized for the real-G2 BLE budget (~10–30 KB/s). The 5/15 fps figures above bind only
if a streamed map returns.

Rationale: glanceable AR is latency-sensitive; unmeasured "optimizations" routinely move the
bottleneck instead of removing it (see the browser-capture network-path diagnosis, 2026-06-18).

### V. Autonomous Debug & Validation

The system MUST be observable and drivable without glasses. Every feature MUST record
structured events in the g2-app debug channel (`src/debug/`), add a `?demo=` scenario for every
new HUD state, and keep the Even Hub simulator loop (`sim:check`: screenshots + input + console
via the automation API) green. Debug surfaces are dev-only and fail closed (off in production
builds, secret-gated when on). Debugging follows a fixed loop: **reproduce → isolate (debug
channel, logs, simulator) → fix → regression test**, autonomously; the user is asked only for
hardware-gated steps, which follow the defer-hardware pattern (`validation-harness`, runnable
with `--skip-hardware`). Before claiming done, run `pnpm lint:ci && pnpm typecheck && pnpm
test:coverage` (+ the simulator for display/input changes) and report real output. Diagnostics
MUST report outcomes faithfully — a failed step is reported with its evidence, never glossed.

Rationale: the glasses ⇄ phone WebView ⇄ Foundry relay ⇄ projector chain is too distributed to
debug by eyeball, and the simulator accepts things the real host rejects (e.g. non-grid image
offsets); verifiable instrumentation is what turned multi-hour mysteries into minutes.

### VI. Source-Verified SDK & Library Research (INV-2)

Every technical claim about hardware, the Even Hub SDK, Foundry/dnd5e, MCP, or a library
version MUST cite a canonical upstream source (the allow-list in INV-2). Aggregator, blog,
and AI-summary sources are NOT authoritative. Before adopting or bumping a dependency, its
real API and version MUST be verified (e.g. `npm view`, the canonical docs), and the finding
documented (STACK.md / ADR / changelog with a `Re-verified ✓` or `Drift: …` line). Suspected
drift MUST trigger a fresh ≥4-source parallel verification round, never a silent "correction".

Rationale: this project has repeatedly been bitten by fictional APIs and non-existent
versions; source-of-truth verification is the only defense.

### VII. Documentation Coherence (INV-3)

`Specs.md`, `README.md`, and `docs/showcase/index.html` are projections of one truth and MUST
be updated in the SAME commit for any cross-cutting change (version, fps target, phase count,
hardware spec, library version, locale set, ADR list). No half-updated states. Architecture
decisions, new invariants, and open-question resolutions MUST be recorded (ADR + changelog
with rationale). Both technical docs and user-facing docs (release runbooks, pairing/install
guides) MUST be kept current as behavior changes — a feature is not "done" until its docs are.

Rationale: incoherent docs erode trust in every other claim and silently rot into landmines.

### VIII. Repository Hygiene

The working tree MUST stay clean and intentional. Scratch files, build artifacts, secrets,
and generated bundles MUST be gitignored, never committed (`.env*`, `release*/`, `*.ehpk`,
`_*.ts`, `__pycache__/`). Commits MUST be atomic and follow Conventional Commits; work
lands on a branch, never directly on `main` unless explicitly authorized. Secrets MUST NOT
appear in code, logs, error messages, or commit history; a leaked secret MUST be rotated.
Dead branches, stale planning dirs, and orphaned files MUST be cleaned up rather than
accumulated.

Rationale: a tidy repo is reviewable; a noisy one hides regressions, secrets, and intent.

### IX. Reliable, Useful CI/CD

CI/CD MUST stay green and meaningful. The CI quality gates (lint, typecheck, test, coverage,
changeset, INV checks) MUST pass before merge and MUST NOT be weakened to pass. A release
pipeline step MUST fail loudly on real problems and MUST NOT abort a release on a benign
condition (e.g. a missing optional changelog entry is graceful, not fatal). Workflows MUST be
maintained as the build evolves — a recurringly-red pipeline MUST be fixed or removed, never
ignored. Versioned artifacts (module zip, `.ehpk`) MUST be reproducible from a tag.
CI is the enforcement of this constitution: every principle that can be checked mechanically
MUST get a gate (lint, typecheck, coverage, TODO discipline, snapshot drift, changeset,
ADR-0011 guard, socketlib confinement, module assets, wiki links, …). Gates MUST NOT be
bypassed with `--no-verify`, skipped jobs, or lowered thresholds; a gate that no longer
protects anything is removed, and a new gate is added when a bug class escapes. Pipelines stay
fast and deterministic (pinned actions and tool versions, cached pnpm store, actionable
failure messages), are tested on a branch before merge, and a red `develop` is fixed before new
feature work.

Rationale: CI that is flaky, red-by-default, or trivially bypassed provides no safety and
trains the team to ignore it.

### X. Disciplined Subagent Orchestration

Subagents and multi-agent workflows are used deliberately, not reflexively. A subagent is
spawned to parallelize independent work, to fan out broad read-only searches, or to obtain an
adversarial/independent perspective — and its scope, inputs, and expected output MUST be
stated up front. The orchestrator keeps the conclusion, not the file dumps; relay what
matters. Large multi-agent fan-outs (workflows) are opt-in and run only when the user has
asked for that scale, because they consume significant tokens. A single known-file lookup
MUST be done directly, not delegated.

Rationale: undirected delegation wastes tokens and context and produces unverifiable results;
targeted orchestration multiplies throughput and confidence.

### XI. Consistent Chapter Icons

Every `##` heading in `README.md`, `docs/**/*.md`, wiki pages and the showcase MUST use one
leading emoji from this canonical map — same concept, same icon, everywhere. The map MUST be
extended here (and in `CLAUDE.md` P11) before a new icon is introduced; two icons for one
concept are forbidden.

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Overview / What is it | 🎲 | Hardware (G2 / R1) | 🥽 |
| Quick summary / In one sentence | 💡 | Stack / Dependencies | 🧰 |
| Installation / Setup | 📦 | Research / SDK notes | 🔬 |
| Configuration | ⚙️ | Documentation / Guides | 📚 |
| Usage / Gestures | 🕹️ | Testing | 🧪 |
| UX / UI design | 👓 | Debug / Troubleshooting | 🐞 |
| Architecture | 🏗️ | Performance | ⚡ |
| Highlights / Features | ✨ | Security / Auth | 🔐 |
| Code quality | 💎 | CI/CD / Release | 🚀 |
| Invariants / Principles | 🛡️ | Contributing / Cleanup | 🧹 |
| Status / Progress | 📊 | Agents / Automation | 🤖 |
| Roadmap / Milestones | 🗺️ | Voice / MCP (V2) | 🎙️ |
| Changelog | 📝 | Inspiration | 🎨 |
| Icons / Conventions | 🏷️ | License | ⚖️ |
| Author / Credits | 👤 | Tasks / TODO | ✅ |

Rationale: the same concept recurring across README, wiki, docs and showcase must be
recognisable at a glance; drifting icons are a documentation-coherence (INV-3) smell.

### XII. Living Tracking Files

The root files `TODO.md`, `SECURITY.md` and `CHANGELOG.md` MUST exist and stay current, short
and easy to update: checkable lists (`- [ ]` / `- [x]`), one line per item, and a reference on
every item (spec task, ADR, issue/PR, file path or `Specs.md §`). `TODO.md` holds open work only
(tick in the finishing commit, move to `CHANGELOG.md` when shipped); `SECURITY.md` holds supported
versions, the private reporting path, a short threat model and a checklist of controls each
linked to its proof, and MUST be updated by any change to auth, crypto, pairing, the relay,
permissions or secrets; `CHANGELOG.md` is the human release index (Unreleased → `vX.Y.Z`) that
links — never duplicates — the Changesets package changelogs and the `Specs.md` changelog. The
format MUST be enforced in CI (`scripts/check-tracking-files.mjs`).

Rationale: humans and agents resume work from these files; a stale or verbose tracker is worse
than none, and a reference on every line makes each item verifiable.

## Additional Constraints

- **Non-negotiable hardware/platform facts** (verified upstream, do not re-litigate without
  INV-2 evidence): plugins run on the paired phone WebView, not G2 firmware; G2 has 4 mics,
  no speaker, no camera; max 4 image containers (each 20–288 × 20–144 px, SDK 0.0.16) + 8
  text/list, exactly one `isEventCapture:1`; image containers render on top of text; the real
  host rejects image tiles at non-grid offsets (only the 2×2 grid of 288×144 tiles from (0,0) is
  hardware-proven); canonical gestures are press / double-press / swipe-up / swipe-down —
  long-press (SDK ≥ 0.0.14) may only duplicate a function reachable otherwise (ADR-0012);
  EvenAI is opaque (no developer API) — voice/MCP needs a new ADR (ADR-0016 removed
  `foundry-mcp`).
- **Pairing**: the Foundry tab that shows «Collega occhiali G2» displays a QR + 16-char code
  (relay room + AES-256 key, single use); the glasses app reads it with the phone camera or the
  typed code; the phone never logs into Foundry and there is no camera on the glasses
  (ADR-0019).
- **Determinism first**: the MVP core is gesture-explicit; voice/AI is an optional V2 stretch,
  never a dependency.
- **Tooling is fixed**: pnpm, TypeScript strict 5.8.x, Biome, Vitest, Changesets. The pinned
  versions and the "do NOT use" list in `CLAUDE.md` are load-bearing; re-verify any pin against
  canonical upstream (INV-2) before changing it.

## Development Workflow & Quality Gates

- Substantive work flows through a Spec Kit feature (`specs/NNN-*/` spec → plan → tasks) so
  planning artifacts and execution context stay in sync; direct repo edits outside that flow
  require explicit user authorization.
- Each change runs `pnpm lint:ci` + `pnpm typecheck` + the affected package tests before commit;
  cross-cutting changes additionally satisfy INV-3 (docs in the same commit).
- Outward-facing or hard-to-reverse actions (publishing, releases, deploys, deletions) are
  confirmed before execution unless durably authorized; outcomes are reported faithfully.
- Commits and PRs carry NO AI/assistant attribution (project convention); messages follow
  Conventional Commits.
- The user's primary language is Italian; replies default to Italian unless asked otherwise.

## Governance

This constitution supersedes ad-hoc practice. Where it overlaps `Specs.md` §0.1 invariants
(INV-1..INV-4) and `CLAUDE.md`, all bind together; a direct conflict is resolved in favor of
the stricter rule and recorded as an amendment.

Amendments MUST be made via PR, documenting the change and its rationale, with the version
bumped per semantic versioning: MAJOR for backward-incompatible governance/principle removals
or redefinitions, MINOR for a new principle or materially expanded guidance, PATCH for
clarifications and wording. Dependent templates (`.specify/templates/*`) and runtime guidance
(`CLAUDE.md`, READMEs, runbooks) MUST be re-checked for alignment in the same amendment, and
the Sync Impact Report at the top of this file MUST be updated.

Compliance is verified at review time: every PR/review MUST confirm the change honors these
principles, and any deviation MUST be justified in the PR (and, if retained, issue- or
ADR-linked). Complexity MUST be justified against the simpler rejected alternative.

**Version**: 1.2.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-09-26
