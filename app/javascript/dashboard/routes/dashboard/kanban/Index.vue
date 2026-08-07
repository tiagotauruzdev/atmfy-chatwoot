<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store.js';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Draggable from 'vuedraggable';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';

import { useAlert } from 'dashboard/composables';
import ConversationApi from 'dashboard/api/inbox/conversation';

import {
  STAGE_ATTRIBUTE_KEY,
  buildFilterPayload,
  cardFrom,
  elapsedLabel,
  stageValuesFrom,
} from './helpers';

// As prioridades são escritas pelo agente e configuradas pelo operador, então a lista pode
// crescer — valor desconhecido cai no tom neutro em vez de sumir do card.
const PRIORITY_TONE = {
  Crítica: 'bg-n-ruby-3 text-n-ruby-11',
  Alta: 'bg-n-amber-3 text-n-amber-11',
  Média: 'bg-n-iris-3 text-n-iris-11',
  Baixa: 'bg-n-slate-3 text-n-slate-11',
};

const priorityTone = priority =>
  PRIORITY_TONE[priority] || 'bg-n-slate-3 text-n-slate-11';

const { t } = useI18n();
const store = useStore();
const router = useRouter();

const attributeDefinitions = useMapGetter(
  'attributes/getConversationAttributes'
);
const accountId = useMapGetter('getCurrentAccountId');

const isLoading = ref(true);
const loadError = ref(false);
const selectedInboxId = ref(null);

// O quadro guarda o resultado de cada coluna aqui, e não no store de conversas:
// aquele é cache compartilhado com a lista de atendimento, então uma consulta
// por coluna sobrescreveria a outra — e o quadro herdaria os filtros que o
// usuário tivesse deixado na lista.
const conversationsByStage = ref({});

const stages = computed(() => stageValuesFrom(attributeDefinitions.value));

// Sem o atributo cadastrado não existe quadro — e o operador precisa saber onde
// criá-lo, senão vê uma tela vazia sem explicação.
const hasStages = computed(() => stages.value.length > 0);

const keyOf = stage => (stage === null ? '__none__' : stage);

// Cada item carrega a conversa crua ao lado do card já reduzido: o template desenha a
// partir de `card`, e `moveTo` grava a partir de `conversation` — sem recalcular a
// redução a cada render nem perder os campos que o card não mostra.
const columns = computed(() =>
  [null, ...stages.value].map(stage => ({
    stage,
    items: (conversationsByStage.value[keyOf(stage)] || []).map(
      conversation => ({
        id: conversation.id,
        conversation,
        card: cardFrom(conversation),
      })
    ),
  }))
);

const loadColumn = async stage => {
  const { data } = await ConversationApi.filter({
    queryData: {
      payload: buildFilterPayload({ stage, inboxId: selectedInboxId.value }),
    },
    page: 1,
  });

  conversationsByStage.value = {
    ...conversationsByStage.value,
    [keyOf(stage)]: data.payload || [],
  };
};

const loadBoard = async () => {
  isLoading.value = true;
  loadError.value = false;
  try {
    await Promise.all([null, ...stages.value].map(loadColumn));
  } catch (error) {
    loadError.value = true;
  } finally {
    isLoading.value = false;
  }
};

const inboxes = useMapGetter('inboxes/getInboxes');

const onInboxChange = async event => {
  const { value } = event.target;
  selectedInboxId.value = value === '' ? null : value;
  await loadBoard();
};

onMounted(async () => {
  await Promise.all([
    store.dispatch('attributes/get'),
    store.dispatch('inboxes/get'),
  ]);
  await loadBoard();
});

const moveTo = async (stage, event) => {
  const conversation = event?.added?.element?.conversation;
  if (!conversation) return;

  // Chamada direta em vez do `updateCustomAttributes` do store: aquela ação tem
  // catch vazio, então uma gravação que falha some sem avisar ninguém — e o card
  // fica na coluna nova mentindo até o próximo reload.
  try {
    await ConversationApi.updateCustomAttributes({
      conversationId: conversation.id,
      customAttributes: {
        ...conversation.custom_attributes,
        [STAGE_ATTRIBUTE_KEY]: stage,
      },
    });
  } catch (error) {
    useAlert(t('KANBAN.BOARD.MOVE_FAILED'));
  } finally {
    // Recarrega dos dois lados: a origem devolve o card se a gravação falhou,
    // e o destino confirma o que o servidor realmente tem.
    await loadBoard();
  }
};

const openConversation = conversation => {
  router.push({
    name: 'inbox_conversation',
    params: { accountId: accountId.value, conversation_id: conversation.id },
  });
};

const columnTitle = column =>
  column.stage === null ? t('KANBAN.BOARD.NO_STAGE') : column.stage;
</script>

<template>
  <section class="flex flex-col w-full h-full bg-n-surface-1">
    <header class="flex items-center gap-2 px-6 py-4 border-b border-n-weak">
      <h1 class="text-base font-medium text-n-slate-12">
        {{ t('KANBAN.BOARD.TITLE') }}
      </h1>
      <span class="text-sm text-n-slate-11">
        {{ t('KANBAN.BOARD.SUBTITLE') }}
      </span>

      <select
        :value="selectedInboxId ?? ''"
        class="h-8 py-0 ml-auto text-sm w-52 bg-n-alpha-2 border-n-weak rounded-lg"
        :aria-label="t('KANBAN.BOARD.ALL_INBOXES')"
        @change="onInboxChange"
      >
        <option value="">{{ t('KANBAN.BOARD.ALL_INBOXES') }}</option>
        <option v-for="inbox in inboxes" :key="inbox.id" :value="inbox.id">
          {{ inbox.name }}
        </option>
      </select>
    </header>

    <div v-if="isLoading" class="flex items-center justify-center flex-1">
      <Spinner />
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-col items-center justify-center flex-1 gap-2 px-6 text-center"
    >
      <Icon class="text-n-ruby-9 size-6" icon="i-lucide-circle-alert" />
      <p class="text-sm text-n-slate-11">
        {{ t('KANBAN.BOARD.LOAD_FAILED') }}
      </p>
    </div>

    <div
      v-else-if="!hasStages"
      class="flex flex-col items-center justify-center flex-1 gap-2 px-6 text-center"
    >
      <Icon class="text-n-slate-10 size-6" icon="i-lucide-columns-3" />
      <p class="text-sm text-n-slate-11">
        {{ t('KANBAN.BOARD.NO_ATTRIBUTE', { key: STAGE_ATTRIBUTE_KEY }) }}
      </p>
    </div>

    <div v-else class="flex flex-1 gap-4 p-6 overflow-x-auto">
      <div
        v-for="column in columns"
        :key="column.stage ?? '__none__'"
        class="flex flex-col border w-72 shrink-0 rounded-xl bg-n-solid-1 border-n-weak"
      >
        <div
          class="flex items-center justify-between px-3 py-2 border-b border-n-weak"
        >
          <span class="text-sm font-medium truncate text-n-slate-12">
            {{ columnTitle(column) }}
          </span>
          <span class="text-xs text-n-slate-10">
            {{ column.items.length }}
          </span>
        </div>

        <Draggable
          :model-value="column.items"
          group="kanban"
          item-key="id"
          class="flex flex-col gap-2 p-2 overflow-y-auto grow min-h-16"
          @change="event => moveTo(column.stage, event)"
        >
          <template #item="{ element: { conversation, card } }">
            <button
              type="button"
              class="flex flex-col w-full gap-2 p-3 text-left border rounded-lg cursor-grab bg-n-solid-2 border-n-weak hover:border-n-brand"
              @click="openConversation(conversation)"
            >
              <div class="flex items-center w-full gap-2">
                <Avatar
                  :src="card.avatarUrl"
                  :name="card.name || t('KANBAN.BOARD.UNKNOWN_CONTACT')"
                  :size="24"
                  rounded-full
                />
                <div class="flex flex-col min-w-0 grow">
                  <span class="text-sm font-medium truncate text-n-slate-12">
                    {{ card.name || t('KANBAN.BOARD.UNKNOWN_CONTACT') }}
                  </span>
                  <span
                    v-if="card.company"
                    class="text-xs truncate text-n-slate-11"
                  >
                    {{ card.company }}
                  </span>
                </div>
                <div class="flex items-center gap-1 shrink-0 text-n-slate-10">
                  <Icon :icon="card.channelIcon" class="size-3.5" />
                  <span class="text-xs tabular-nums">
                    {{ elapsedLabel(card.lastActivityAt) }}
                  </span>
                </div>
              </div>

              <p
                v-if="card.snippet"
                class="text-xs leading-snug line-clamp-2 text-n-slate-11"
              >
                {{ card.snippet }}
              </p>

              <div class="flex flex-wrap items-center w-full gap-1">
                <span
                  v-if="card.priority"
                  class="px-1.5 py-0.5 text-xs font-medium rounded"
                  :class="priorityTone(card.priority)"
                >
                  {{ card.priority }}
                </span>
                <span
                  v-for="label in card.labels"
                  :key="label"
                  class="px-1.5 py-0.5 text-xs rounded bg-n-alpha-2 text-n-slate-11"
                >
                  {{ label }}
                </span>
                <span class="ml-auto text-xs shrink-0 text-n-slate-10">
                  {{ t('KANBAN.BOARD.CARD_ID', { id: card.id }) }}
                </span>
              </div>
            </button>
          </template>
        </Draggable>
      </div>
    </div>
  </section>
</template>
