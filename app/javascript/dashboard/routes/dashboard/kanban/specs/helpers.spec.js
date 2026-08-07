import { describe, it, expect } from 'vitest';
import {
  STAGE_ATTRIBUTE_KEY,
  buildFilterPayload,
  cardFrom,
  elapsedLabel,
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

// Uma conversa como o endpoint de filtro devolve (partials/_conversation.json.jbuilder).
// Tudo em snake_case — ao contrário das definições de atributo, que passam por camelcaseKeys.
const conversation = () => ({
  id: 7,
  labels: ['SAT', 'certificado'],
  custom_attributes: { etapa_funil: 'Em atendimento', prioridade: 'Crítica' },
  last_activity_at: 1_700_000_000,
  last_non_activity_message: { content: 'Bom dia, meu SAT parou de emitir' },
  meta: {
    channel: 'Channel::WebWidget',
    sender: {
      name: 'Teste Funil',
      thumbnail: 'https://exemplo/avatar.png',
      custom_attributes: { empresa: 'Padaria Estrela do Vale' },
    },
  },
});

describe('cardFrom', () => {
  it('reads every field the card shows off one conversation', () => {
    expect(cardFrom(conversation())).toEqual({
      id: 7,
      name: 'Teste Funil',
      avatarUrl: 'https://exemplo/avatar.png',
      company: 'Padaria Estrela do Vale',
      snippet: 'Bom dia, meu SAT parou de emitir',
      labels: ['SAT', 'certificado'],
      priority: 'Crítica',
      channelIcon: 'i-ri-global-fill',
      lastActivityAt: 1_700_000_000,
    });
  });

  // A empresa mora no CONTATO, não na conversa — foi assim que o pré-chat gravou e
  // é assim que o agente escreve (`scope: 'contact'`). Procurar em
  // `conversation.custom_attributes` devolve undefined em toda conversa.
  it('takes the company from the contact, not from the conversation', () => {
    const withDecoy = conversation();
    withDecoy.custom_attributes.empresa = 'Empresa Errada';
    withDecoy.meta.sender.custom_attributes.empresa = 'Empresa Certa';

    expect(cardFrom(withDecoy).company).toBe('Empresa Certa');
  });

  // Canal de e-mail entrega HTML em `content`; sem limpar, o card mostraria "<p>..." cru.
  it('strips markup out of the message snippet', () => {
    const html = conversation();
    html.last_non_activity_message.content =
      '<p>Bom <strong>dia</strong>, o SAT travou</p>';

    expect(cardFrom(html).snippet).toBe('Bom dia, o SAT travou');
  });

  // O ícone vem de `getInboxIconByType`, o mesmo que a lista de conversas usa — o card
  // não inventa um mapa próprio, senão o WhatsApp teria um símbolo aqui e outro ali.
  it('labels the channel with the icon the rest of the dashboard uses', () => {
    const iconOf = value => {
      const c = conversation();
      c.meta.channel = value;
      return cardFrom(c).channelIcon;
    };

    expect(iconOf('Channel::WebWidget')).toBe('i-ri-global-fill');
    expect(iconOf('Channel::Whatsapp')).toBe('i-ri-whatsapp-fill');
    expect(iconOf('Channel::Email')).toBe('i-ri-mail-fill');
    expect(iconOf('Channel::Coisa')).toBe('i-ri-chat-1-fill');
  });

  // Conversa recém-criada não tem mensagem, contato anônimo não tem empresa nem avatar,
  // e etiqueta/prioridade só existem depois que o agente classifica. Nenhum desses casos
  // pode quebrar o card — todos aparecem no quadro em produção.
  it('survives a bare conversation with nothing filled in', () => {
    expect(cardFrom({ id: 12, meta: {} })).toEqual({
      id: 12,
      name: '',
      avatarUrl: '',
      company: '',
      snippet: '',
      labels: [],
      priority: '',
      channelIcon: 'i-ri-chat-1-fill',
      lastActivityAt: 0,
    });
  });
});

describe('elapsedLabel', () => {
  const now = 1_700_000_000;

  it('collapses anything under a minute into "agora"', () => {
    expect(elapsedLabel(now - 0, now)).toBe('agora');
    expect(elapsedLabel(now - 59, now)).toBe('agora');
  });

  it('counts up in minutes, then hours, then days', () => {
    expect(elapsedLabel(now - 60, now)).toBe('1m');
    expect(elapsedLabel(now - 59 * 60, now)).toBe('59m');
    expect(elapsedLabel(now - 60 * 60, now)).toBe('1h');
    expect(elapsedLabel(now - 23 * 3600, now)).toBe('23h');
    expect(elapsedLabel(now - 24 * 3600, now)).toBe('1d');
    expect(elapsedLabel(now - 30 * 86_400, now)).toBe('30d');
  });

  // Sem timestamp não há o que mostrar — e um relógio adiantado no cliente não pode
  // virar "-3m" no card.
  it('shows nothing without a timestamp, and never goes negative', () => {
    expect(elapsedLabel(0, now)).toBe('');
    expect(elapsedLabel(undefined, now)).toBe('');
    expect(elapsedLabel(now + 300, now)).toBe('agora');
  });
});
