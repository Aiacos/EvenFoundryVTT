# EvenFoundryVTT — Docs

Documentation index for **EvenFoundryVTT** v0.10.0 (direct Foundry → G2 streaming). The
**canonical source of truth** is [`Specs.md`](../Specs.md) at the repository root. Every
document here is a projection or expansion of it.

---

## 📚 Where to start

| Resource | Path | Description |
|---|---|---|
| Canonical specification | [`Specs.md`](../Specs.md) | Requirements, architecture, hardware constraints, UI/UX mockups, roadmap. |
| Setup guide | [`setup-guide.md`](setup-guide.md) | HTTPS prerequisites → install the module → GM pairing → player QR scan → manual code, revoke, troubleshooting. |
| Runbook | [`runbook.md`](runbook.md) | Diagnosis from the phone page and the GM browser, the `validate:direct-sideload` harness, revoke / re-pair, common errors. |
| Thirds layout design | [`design/g2-thirds-layout.md`](design/g2-thirds-layout.md) | 11 glasses mocks (M01–M11) + 3 phone/Foundry mocks (P01–P03). This is the INV-1 contract. |
| Direct streaming decision | [`architecture/0012-direct-foundry-streaming.md`](architecture/0012-direct-foundry-streaming.md) | Why the bridge, Docker and `foundry-mcp` were removed. |
| Firmware compatibility | [`firmware-compatibility.md`](firmware-compatibility.md) | Even Hub SDK / Even App / Foundry version matrix + forward-compat policy. |
| Invariants | [`architecture/INVARIANTS.md`](architecture/INVARIANTS.md) | INV-1..6 and how CI enforces them. |
| ADRs | [`architecture/`](architecture/) | ADR-0001 … ADR-0012 ([index](architecture/README.md)). |
| Release | [`release/foundry-module.md`](release/foundry-module.md) · [`release/evenhub.md`](release/evenhub.md) | Module zip (with `g2/`) and the secondary `.ehpk`. |
| Animated showcase | [`showcase/index.html`](showcase/index.html) | Single-file showcase (GitHub Pages). |

---

## 🧪 Field tests and measurements

- [`field-test-template.md`](field-test-template.md): NASA-TLX + Borg CR-10 self-report
  and the SC-10-01..03 closure checkboxes for a real hardware session.
- [`perf/phase-0/`](perf/phase-0/README.md): machine-readable Phase 0 evidence, plus the
  `adr-0012-direct-sideload-*.json` output of the sideload harness.

---

## 📊 Project status

| Item | Link |
|---|---|
| Root README (GitHub landing) | [`README.md`](../README.md) |
| Roadmap | [`.planning/ROADMAP.md`](../.planning/ROADMAP.md) |
| Current state | [`.planning/STATE.md`](../.planning/STATE.md) |

---

## 🏗️ Documentation structure

```
docs/
├── README.md                    ← you are here
├── setup-guide.md               ← install + pairing walkthrough
├── runbook.md                   ← diagnosis and recovery
├── firmware-compatibility.md    ← Even Hub SDK / Even App / Foundry matrix
├── field-test-template.md       ← hardware session self-report
├── index.html                   ← redirect to showcase/
├── architecture/
│   ├── README.md                ← ADR index
│   ├── INVARIANTS.md            ← INV-1..6
│   └── 0001 … 0012-*.md         ← ADRs (0012 = direct streaming)
├── design/
│   └── g2-thirds-layout.md      ← thirds HUD + pairing mocks
├── perf/
│   └── phase-0/                 ← GO/NO-GO evidence + calibration methodology
├── release/
│   ├── foundry-module.md        ← GitHub Release of the module zip
│   └── evenhub.md               ← .ehpk packaging (secondary)
├── showcase/
│   └── index.html               ← animated showcase (GitHub Pages)
└── wiki/                        ← (empty, reserved)
```

---

*Version numbers in this folder follow the `Specs.md` header (the INV-3 anchor). A
cross-cutting version bump updates `Specs.md` + `README.md` + `docs/showcase/index.html`
in one commit.*
