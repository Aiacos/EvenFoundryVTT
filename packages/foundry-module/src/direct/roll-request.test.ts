import { describe, expect, it } from 'vitest';
import { parseRollRequest } from './roll-request.js';

const card = (attrs: string) =>
  `<div class="dnd5e2 chat-card request-card"><div class="card-buttons"><button type="button" ${attrs}><i class="fa-solid fa-dice-d20"></i> Prova</button></div></div>`;

describe('parseRollRequest', () => {
  it('reads a saving throw request with DC', () => {
    expect(
      parseRollRequest({
        id: 'm1',
        content: card(
          'data-type="save" data-ability="wis" data-dc="15" data-action="rollRequest" data-visibility="all"',
        ),
      }),
    ).toEqual({ messageId: 'm1', kind: 'save', ability: 'wis', dc: 15 });
  });

  it('reads skill requests (type skill or check+skill) and ability checks', () => {
    expect(
      parseRollRequest({
        id: 'm2',
        content: card(
          'data-action="rollRequest" data-type="skill" data-skill="prc" data-ability="wis"',
        ),
      }),
    ).toEqual({ messageId: 'm2', kind: 'skill', skill: 'prc', ability: 'wis' });
    expect(
      parseRollRequest({
        id: 'm3',
        content: card("data-action='rollRequest' data-type='check' data-skill='ath'"),
      }),
    ).toEqual({ messageId: 'm3', kind: 'skill', skill: 'ath' });
    expect(
      parseRollRequest({
        id: 'm4',
        content: card(
          'data-action="rollRequest" data-type="check" data-ability="str" data-dc="abc"',
        ),
      }),
    ).toEqual({ messageId: 'm4', kind: 'check', ability: 'str' });
  });

  it('ignores ordinary messages, tool checks and malformed requests', () => {
    expect(parseRollRequest({ id: 'm', content: '<p>hello</p>' })).toBeNull();
    expect(parseRollRequest({ id: 'm', content: null })).toBeNull();
    expect(
      parseRollRequest({
        id: '',
        content: card('data-action="rollRequest" data-type="save" data-ability="dex"'),
      }),
    ).toBeNull();
    expect(
      parseRollRequest({
        id: 'm',
        content: card('data-action="rollRequest" data-type="tool" data-tool="thief"'),
      }),
    ).toBeNull();
    expect(
      parseRollRequest({
        id: 'm',
        content: card('data-action="rollRequest" data-type="save" data-ability="luck"'),
      }),
    ).toBeNull();
  });
});
