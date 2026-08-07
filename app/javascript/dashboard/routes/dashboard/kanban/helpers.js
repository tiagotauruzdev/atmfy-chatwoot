import { getInboxIconByType } from 'dashboard/helper/inbox';

/**
 * As colunas do quadro vêm de um atributo customizado de CONVERSA do tipo lista.
 * Quem manda nas etapas é o operador, em Configurações → Atributos Personalizados —
 * o quadro só reflete o que estiver lá. Por isso nenhuma etapa fica escrita aqui.
 */
export const STAGE_ATTRIBUTE_KEY = 'etapa_funil';

/**
 * A prioridade do card também é atributo de conversa, e não o campo `priority` nativo
 * do Chatwoot: o agente classifica em Crítica/Alta/Média/Baixa (ver o prompt do N1) e a
 * única ferramenta que ele tem para gravar é `set_custom_attribute`. O campo nativo usa
 * outro vocabulário (low/medium/high/urgent) e hoje ninguém escreve nele.
 */
export const PRIORITY_ATTRIBUTE_KEY = 'prioridade';

/**
 * A empresa mora no CONTATO, não na conversa — é onde o formulário de pré-chat grava e
 * onde o agente escreve (`scope: 'contact'`). Procurar na conversa devolve undefined.
 */
const COMPANY_ATTRIBUTE_KEY = 'empresa';

const SNIPPET_LENGTH = 90;

/**
 * Converte o conteúdo da última mensagem em texto puro para o card.
 *
 * Canal de e-mail entrega HTML em `content`; sem limpar, o card mostraria "<p>..." cru.
 * O `textContent` do DOM resolve marcação e entidades de uma vez — e como só lemos texto
 * de um nó nunca anexado ao documento, nada do HTML executa.
 */
function toPlainText(content) {
  if (!content) return '';

  const el = document.createElement('div');
  el.innerHTML = content;

  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Reduz uma conversa do endpoint de filtro ao que o card desenha.
 *
 * Todos os campos já vêm nessa mesma resposta (ver
 * `app/views/api/v1/conversations/partials/_conversation.json.jbuilder`), então enriquecer
 * o card não custa nenhuma requisição a mais. Campo ausente vira string ou lista vazia:
 * conversa recém-criada não tem mensagem, contato anônimo não tem empresa nem avatar, e
 * etiqueta e prioridade só existem depois que o agente classifica.
 */
export function cardFrom(conversation) {
  const sender = conversation.meta?.sender || {};

  return {
    id: conversation.id,
    name: sender.name || '',
    avatarUrl: sender.thumbnail || '',
    company: sender.custom_attributes?.[COMPANY_ATTRIBUTE_KEY] || '',
    snippet: truncate(
      toPlainText(conversation.last_non_activity_message?.content),
      SNIPPET_LENGTH
    ),
    labels: conversation.labels || [],
    priority: conversation.custom_attributes?.[PRIORITY_ATTRIBUTE_KEY] || '',
    // O mesmo helper da lista de conversas, para o WhatsApp não ter um símbolo aqui e
    // outro ali. Ele já devolve um ícone padrão para canal desconhecido.
    channelIcon: getInboxIconByType(conversation.meta?.channel),
    lastActivityAt: conversation.last_activity_at || 0,
  };
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Há quanto tempo a conversa não anda, em rótulo curto ("3m", "2h", "5d").
 *
 * `now` entra por parâmetro para o teste não depender do relógio. Adiantamento de relógio
 * do cliente vira "agora" em vez de "-3m", e sem timestamp não mostramos nada.
 */
export function elapsedLabel(lastActivityAt, now = Date.now() / 1000) {
  if (!lastActivityAt) return '';

  const seconds = Math.max(0, Math.floor(now - lastActivityAt));

  if (seconds < MINUTE) return 'agora';
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;

  return `${Math.floor(seconds / DAY)}d`;
}

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

// NOTA: houve aqui um `buildColumns` que agrupava as conversas no navegador e
// criava coluna para etapa órfã (valor gravado que o operador renomeou depois).
// Saiu quando a busca passou para o servidor — o quadro agora pergunta só pelas
// etapas declaradas, e conversa com etapa inválida fica invisível. Lacuna
// conhecida, ainda em aberto: ver o handoff.
