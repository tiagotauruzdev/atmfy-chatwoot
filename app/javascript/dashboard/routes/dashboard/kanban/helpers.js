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
