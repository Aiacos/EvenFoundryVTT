---
"@evf/foundry-module": minor
"@evf/g2-app": minor
"@evf/shared-protocol": minor
---

ADR-0012 direct Foundry → G2 streaming. The g2-app is now built into the module
(`packages/foundry-module/g2/`) and served by Foundry at
`/modules/evenfoundryvtt/g2/index.html`; the Even Realities App loads it by scanning the
pairing QR shown in Foundry. The phone logs in as a dedicated "(G2)" Foundry user and talks
to the GM-client projector over `module.evenfoundryvtt` with AES-GCM sealed envelopes;
all writes still go through the GM-side `dispatchTool` pipeline (ADR-0011).

**Removed:** the Node bridge (`@evf/bridge`), the V2 MCP server (`@evf/foundry-mcp`) and the
Docker Compose deployment (`deploy/`). There is no longer a GHCR bridge image or a separate
`g2-app-dist.zip` release asset — the module zip is the only artefact. Bridge-only protocol
(handshake/resume/debug events), the g2-app bridge wizard and audio capture are gone; voice/MCP
need a new ADR before returning.
