<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store.js';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';

import { STAGE_ATTRIBUTE_KEY, buildColumns, stageValuesFrom } from './helpers';

const { t } = useI18n();
const store = useStore();
const router = useRouter();

const conversations = useMapGetter('getAllConversations');
const attributeDefinitions = useMapGetter(
  'attributes/getConversationAttributes'
);
const accountId = useMapGetter('getCurrentAccountId');

const isLoading = ref(true);

const stages = computed(() => stageValuesFrom(attributeDefinitions.value));
const columns = computed(() => buildColumns(conversations.value, stages.value));

// Sem o atributo cadastrado não existe quadro — e o operador precisa saber onde
// criá-lo, senão vê uma tela vazia sem explicação.
const hasStages = computed(() => stages.value.length > 0);

onMounted(async () => {
  try {
    await Promise.all([
      store.dispatch('attributes/get'),
      store.dispatch('fetchAllConversations', { page: 1, status: 'open' }),
    ]);
  } finally {
    isLoading.value = false;
  }
});

const moveTo = async (stage, event) => {
  const conversation = event?.added?.element;
  if (!conversation) return;

  await store.dispatch('updateCustomAttributes', {
    conversationId: conversation.id,
    customAttributes: {
      ...conversation.custom_attributes,
      [STAGE_ATTRIBUTE_KEY]: stage,
    },
  });
};

const openConversation = conversation => {
  router.push({
    name: 'inbox_conversation',
    params: { accountId: accountId.value, conversation_id: conversation.id },
  });
};

const senderName = conversation =>
  conversation.meta?.sender?.name || t('KANBAN.BOARD.UNKNOWN_CONTACT');

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
    </header>

    <div v-if="isLoading" class="flex items-center justify-center flex-1">
      <Spinner />
    </div>

    <div
      v-else-if="!hasStages"
      class="flex flex-col items-center justify-center flex-1 gap-2 px-6 text-center"
    >
      <Icon class="text-n-slate-10 size-6" icon="i-lucide-columns-3" />
      <p class="text-sm text-n-slate-11">
        {{ t('KANBAN.BOARD.NO_ATTRIBUTE') }}
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
            {{ column.conversations.length }}
          </span>
        </div>

        <p v-if="column.isUnknown" class="px-3 py-1 text-xs text-n-slate-10">
          {{ t('KANBAN.BOARD.UNKNOWN_STAGE') }}
        </p>

        <draggable
          :model-value="column.conversations"
          group="kanban"
          item-key="id"
          class="flex flex-col gap-2 p-2 overflow-y-auto grow min-h-16"
          @change="event => moveTo(column.stage, event)"
        >
          <template #item="{ element }">
            <button
              type="button"
              class="flex flex-col w-full gap-1 p-3 text-left border rounded-lg cursor-grab bg-n-solid-2 border-n-weak hover:border-n-brand"
              @click="openConversation(element)"
            >
              <span class="text-sm font-medium truncate text-n-slate-12">
                {{ senderName(element) }}
              </span>
              <span class="text-xs truncate text-n-slate-11">
                #{{ element.id }}
              </span>
            </button>
          </template>
        </draggable>
      </div>
    </div>
  </section>
</template>
