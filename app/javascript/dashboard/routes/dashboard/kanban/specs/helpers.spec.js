import { describe, it, expect } from 'vitest';
import {
  STAGE_ATTRIBUTE_KEY,
  buildFilterPayload,
  stageValuesFrom,
} from '../helpers';

// O formato do payload vem do contrato do Chatwoot, não da nossa implementação:
// POST /api/v1/accounts/{id}/conversations/filter espera uma lista de
// { attribute_key, filter_operator, values, query_operator }, e o FilterService
// aceita atributo customizado de conversa do tipo lista (list → text).
describe('buildFilterPayload', () => {
  it('filters conversations by the given stage', () => {
    expect(buildFilterPayload({ stage: 'Em atendimento' })).toEqual([
      {
        attribute_key: STAGE_ATTRIBUTE_KEY,
        filter_operator: 'equal_to',
        values: ['Em atendimento'],
        query_operator: null,
      },
    ]);
  });

  // A coluna "Sem etapa" é a que mais erra em silêncio: `equal_to` com valor
  // vazio não devolve as conversas sem o atributo — devolve nada. O operador
  // correto é `is_not_present`, que o FilterService trata explicitamente.
  it('uses is_not_present for the unassigned column', () => {
    expect(buildFilterPayload({ stage: null })).toEqual([
      {
        attribute_key: STAGE_ATTRIBUTE_KEY,
        filter_operator: 'is_not_present',
        values: [],
        query_operator: null,
      },
    ]);
  });

  // `inbox_id` é atributo padrão de conversa (lib/filters/filter_keys.yml) e
  // aceita `equal_to`. O swagger exige `query_operator` em toda condição menos
  // a última — errar isso quebra a consulta inteira, não só o filtro de caixa.
  it('narrows to one inbox, chaining the conditions with AND', () => {
    expect(buildFilterPayload({ stage: 'Novo', inboxId: 7 })).toEqual([
      {
        attribute_key: STAGE_ATTRIBUTE_KEY,
        filter_operator: 'equal_to',
        values: ['Novo'],
        query_operator: 'AND',
      },
      {
        attribute_key: 'inbox_id',
        filter_operator: 'equal_to',
        values: ['7'],
        query_operator: null,
      },
    ]);
  });

  it('omits the inbox condition when no inbox is selected', () => {
    expect(buildFilterPayload({ stage: 'Novo', inboxId: null })).toHaveLength(
      1
    );
    expect(buildFilterPayload({ stage: 'Novo' })).toHaveLength(1);
  });
});

// O getter `attributes/getConversationAttributes` passa os registros por
// camelcaseKeys, então as definições chegam em camelCase — enquanto as conversas,
// que vêm de outro módulo, mantêm snake_case. As duas convenções convivem.
describe('stageValuesFrom', () => {
  it('reads the list values of the funnel attribute', () => {
    const definitions = [
      { attributeKey: 'empresa', attributeValues: [] },
      {
        attributeKey: STAGE_ATTRIBUTE_KEY,
        attributeValues: ['Novo', 'Resolvido'],
      },
    ];

    expect(stageValuesFrom(definitions)).toEqual(['Novo', 'Resolvido']);
  });

  it('returns an empty list when the attribute is not defined', () => {
    expect(stageValuesFrom([{ attributeKey: 'empresa' }])).toEqual([]);
    expect(stageValuesFrom([])).toEqual([]);
    expect(stageValuesFrom(undefined)).toEqual([]);
  });
});
