import { describe, it, expect } from 'vitest';
import { STAGE_ATTRIBUTE_KEY, buildColumns, stageValuesFrom } from '../helpers';

const conversation = (id, stage) => ({
  id,
  custom_attributes: stage ? { [STAGE_ATTRIBUTE_KEY]: stage } : {},
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

describe('buildColumns', () => {
  const stages = ['Novo', 'Em atendimento', 'Resolvido'];

  it('creates one column per stage, in the declared order', () => {
    const columns = buildColumns([], stages);

    expect(columns.map(c => c.stage)).toEqual([null, ...stages]);
  });

  it('places each conversation in the column of its stage', () => {
    const columns = buildColumns(
      [conversation(1, 'Novo'), conversation(2, 'Resolvido')],
      stages
    );

    const byStage = Object.fromEntries(
      columns.map(c => [c.stage, c.conversations.map(i => i.id)])
    );

    expect(byStage.Novo).toEqual([1]);
    expect(byStage.Resolvido).toEqual([2]);
    expect(byStage['Em atendimento']).toEqual([]);
  });

  // A conversa sem etapa é o caso mais comum: toda conversa nasce assim, e sumiria
  // do quadro se não tivesse coluna. Por isso a coluna `null` vem sempre primeiro.
  it('collects conversations without a stage in the unassigned column', () => {
    const columns = buildColumns(
      [conversation(1), conversation(2, 'Novo'), conversation(3, null)],
      stages
    );

    expect(columns[0].stage).toBeNull();
    expect(columns[0].conversations.map(c => c.id)).toEqual([1, 3]);
  });

  // Uma etapa renomeada ou removida no Chatwoot deixa conversas apontando para um
  // valor que não existe mais. Elas não podem sumir do quadro.
  it('keeps conversations whose stage is no longer defined', () => {
    const columns = buildColumns([conversation(1, 'Etapa antiga')], stages);
    const orphans = columns.find(c => c.stage === 'Etapa antiga');

    expect(orphans).toBeDefined();
    expect(orphans.conversations.map(c => c.id)).toEqual([1]);
    expect(orphans.isUnknown).toBe(true);
  });

  it('survives an empty stage list', () => {
    const columns = buildColumns([conversation(1)], []);

    expect(columns).toHaveLength(1);
    expect(columns[0].stage).toBeNull();
  });
});
