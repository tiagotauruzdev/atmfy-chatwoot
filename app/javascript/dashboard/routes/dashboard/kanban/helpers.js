/**
 * As colunas do quadro vêm de um atributo customizado de CONVERSA do tipo lista.
 * Quem manda nas etapas é o operador, em Configurações → Atributos Personalizados —
 * o quadro só reflete o que estiver lá. Por isso nenhuma etapa fica escrita aqui.
 */
export const STAGE_ATTRIBUTE_KEY = 'etapa_funil';

/**
 * Extrai os valores da lista de etapas das definições de atributo de conversa.
 *
 * Atenção à convenção: o getter `attributes/getConversationAttributes` passa os
 * registros por `camelcaseKeys`, então aqui os campos são camelCase. Já as
 * conversas vêm de outro módulo e mantêm snake_case (`custom_attributes`). As
 * duas convivem no mesmo componente — não unifique por engano.
 */
export function stageValuesFrom(definitions) {
  const definition = (definitions || []).find(
    d => d.attributeKey === STAGE_ATTRIBUTE_KEY
  );

  return definition?.attributeValues || [];
}

/**
 * Monta o payload de `POST /conversations/filter` para uma coluna.
 *
 * O motor de filtro do Chatwoot (`app/services/filter_service.rb`) aceita
 * atributo customizado de conversa — inclusive do tipo lista — então cada
 * coluna do quadro é uma consulta no servidor, e não um agrupamento feito
 * no navegador depois de baixar tudo.
 */
export function buildFilterPayload({ stage, inboxId = null }) {
  // Conversa sem etapa não tem a chave gravada, então `equal_to` com valor
  // vazio devolveria nada em vez de devolvê-las.
  const stageCondition =
    stage === null
      ? { filter_operator: 'is_not_present', values: [] }
      : { filter_operator: 'equal_to', values: [stage] };

  const conditions = [
    { attribute_key: STAGE_ATTRIBUTE_KEY, ...stageCondition },
  ];

  if (inboxId !== null && inboxId !== undefined) {
    conditions.push({
      attribute_key: 'inbox_id',
      filter_operator: 'equal_to',
      values: [String(inboxId)],
    });
  }

  // O swagger exige `query_operator` encadeando cada condição com a seguinte,
  // e `null` na última. Montar isso na hora evita esquecer ao acrescentar filtro.
  return conditions.map((condition, index) => ({
    ...condition,
    query_operator: index === conditions.length - 1 ? null : 'AND',
  }));
}

const stageOf = conversation =>
  conversation?.custom_attributes?.[STAGE_ATTRIBUTE_KEY] || null;

/**
 * Monta as colunas na ordem em que serão exibidas:
 *
 *   1. a coluna sem etapa (toda conversa nasce aqui — sem ela, sumiriam do quadro);
 *   2. as etapas definidas, na ordem do atributo;
 *   3. etapas órfãs — valores gravados em conversas que o operador renomeou ou
 *      removeu depois. Também não podem sumir, então ganham coluna marcada.
 */
export function buildColumns(conversations, stages) {
  const list = conversations || [];
  const declared = stages || [];

  const known = new Set(declared);
  const orphans = [
    ...new Set(
      list.map(stageOf).filter(stage => stage !== null && !known.has(stage))
    ),
  ];

  const column = (stage, isUnknown = false) => ({
    stage,
    isUnknown,
    conversations: list.filter(item => stageOf(item) === stage),
  });

  return [
    column(null),
    ...declared.map(stage => column(stage)),
    ...orphans.map(stage => column(stage, true)),
  ];
}
