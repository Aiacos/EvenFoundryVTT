/**
 * GM roll requests → `r1.roll.request` deltas (docs/design/g2-sheet-ux.html S8: the
 * sheet opens «Tiri salvezza · Abilità» by itself when the GM asks for a check or save).
 *
 * dnd5e posts a request as a chat message whose content is `roll-request-card.hbs`: one
 * button per requested roll carrying `data-action="rollRequest"` plus the enricher
 * dataset (`data-type` = `check` | `skill` | `save` | `tool` | …, `data-ability`,
 * `data-skill`, `data-dc`). Only the first button is projected (multi-skill requests
 * show the first choice); tool checks and unknown shapes are ignored.
 *
 * @see https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/enrichers.mjs (handlePostRequest, createRequestButton, _addDataset — verified 2026-09-23)
 */
import {
  ABILITY_KEYS,
  type AbilityKey,
  type RollRequestPayload,
  SKILL_KEYS,
  type SkillKey,
} from '@evf/shared-protocol';

/** The part of a ChatMessage the parser reads. */
export interface RollRequestMessage {
  id?: string | null;
  content?: string | null;
}

const BUTTON = /<[a-z]+\b[^>]*\bdata-action\s*=\s*["']rollRequest["'][^>]*>/i;

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\bdata-${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return m?.[1];
}

function isAbility(v: string | undefined): v is AbilityKey {
  return (ABILITY_KEYS as readonly string[]).includes(v ?? '');
}

function isSkill(v: string | undefined): v is SkillKey {
  return (SKILL_KEYS as readonly string[]).includes(v ?? '');
}

/**
 * Parses a dnd5e roll-request card.
 *
 * @returns The request, or null when the message is not a (supported) request card.
 */
export function parseRollRequest(message: RollRequestMessage): RollRequestPayload | null {
  const id = message.id;
  const tag = typeof message.content === 'string' ? BUTTON.exec(message.content)?.[0] : undefined;
  if (typeof id !== 'string' || id === '' || id.length > 64 || tag === undefined) return null;
  const type = attr(tag, 'type');
  const ability = attr(tag, 'ability');
  const skill = attr(tag, 'skill');
  const dcRaw = Number(attr(tag, 'dc'));
  const dc = Number.isInteger(dcRaw) && dcRaw >= 0 && dcRaw <= 99 ? dcRaw : undefined;
  const common = {
    messageId: id,
    ...(isAbility(ability) && { ability }),
    ...(dc !== undefined && { dc }),
  };
  if (type === 'save' && isAbility(ability)) return { ...common, kind: 'save' };
  if ((type === 'skill' || type === 'check') && isSkill(skill)) {
    return { ...common, kind: 'skill', skill };
  }
  if (type === 'check' && isAbility(ability)) return { ...common, kind: 'check' };
  return null;
}
