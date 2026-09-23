---
"@evf/foundry-module": minor
"@evf/shared-protocol": minor
---

New `skill-check` write tool: `actor.rollSkill({ skill, advantage, disadvantage },
{ configure: false })` (dnd5e 5.x config-object API), registered in the module
`ToolId`/`TOOL_IDS` and the shared `TOOL_ID_SCHEMA`, dispatched through the same
single-workflow-origin `dispatchTool` path as every other write tool (ADR-0011).
