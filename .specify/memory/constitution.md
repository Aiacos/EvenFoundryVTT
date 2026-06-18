<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: First ratified constitution; all principles newly defined (MAJOR baseline).

Principles (all NEW):
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
via a Node bridge, driven by R1 ring gestures. These principles are non-negotiable rules for
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
a process); integration-level behavior (WS handlers, routes, the headless/orchestrator
state machine, frame pipeline) MUST have integration tests. A change that lowers coverage
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

Rationale: glanceable AR is latency-sensitive; unmeasured "optimizations" routinely move the
bottleneck instead of removing it (see the browser-capture network-path diagnosis, 2026-06-18).

### V. Autonomous Debug & Validation

The system MUST be observable and self-diagnosable without a human babysitting `docker logs`.
Each subsystem with live behavior MUST expose first-class diagnostics: Prometheus metrics,
structured logs, and a purpose-built CLI/tool that speaks the real protocol (e.g.
`tools/pv-doctor.mjs`). New live features MUST ship with the means to inspect, drive, and
measure them end-to-end. Diagnostics MUST report outcomes faithfully — a failed step is
reported with its evidence, never glossed.

Rationale: the four-boundary system (glasses ⇄ app ⇄ bridge ⇄ Foundry) is too distributed to
debug by eyeball; verifiable instrumentation is what turned multi-hour mysteries into minutes.

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
and generated bundles MUST be gitignored, never committed (`deploy/.env`, `deploy/secrets/`,
`release*/`, `*.ehpk`, `_*.ts`). Commits MUST be atomic and follow Conventional Commits; work
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
ignored. Versioned artifacts (module zip, `.ehpk`, images) MUST be reproducible from a tag.

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

## Additional Constraints

- **Non-negotiable hardware/platform facts** (verified upstream, do not re-litigate without
  INV-2 evidence): plugins run on the paired phone WebView, not G2 firmware; G2 has 4 mics,
  no speaker, no camera, no arbitrary pixel drawing; max 4 image containers (each 20–200 ×
  20–100 px); R1 gestures are press / double-press / swipe-up / swipe-down only (no
  long-press); EvenAI is opaque (no developer API) — V2 voice is via an external MCP server.
- **Pairing has no QR-scan path** (no camera API): pairing is Even Hub install + paste token.
- **Determinism first**: the MVP core is gesture-explicit; voice/AI is an optional V2 stretch,
  never a dependency.
- **Tooling is fixed**: pnpm, TypeScript strict 5.8.x, Biome, Vitest, Changesets. The pinned
  versions and the "do NOT use" list in `CLAUDE.md` are load-bearing; re-verify any pin against
  canonical upstream (INV-2) before changing it.

## Development Workflow & Quality Gates

- Substantive work flows through the GSD workflow so planning artifacts and execution context
  stay in sync; direct repo edits outside a GSD entry point require explicit user authorization.
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

**Version**: 1.0.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18
