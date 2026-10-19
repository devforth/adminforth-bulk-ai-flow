<template>
  <div class="af-review-queue @container/review flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex min-w-[16rem] flex-1 items-center gap-3">
        <IconPause v-if="isPaused" class="w-4 h-4 shrink-0 text-lightWarning dark:text-darkWarning" aria-hidden="true" />
        <Spinner v-else-if="isProcessing" class="w-4 h-4 shrink-0" />
        <IconCircleCheck v-else-if="processed === total" class="w-4 h-4 shrink-0 text-lightSuccess dark:text-darkSuccess" aria-hidden="true" />
        <IconClock v-else class="w-4 h-4 shrink-0 text-lightInputIconColor dark:text-darkInputIconColor" aria-hidden="true" />
        <span class="shrink-0 text-sm tabular-nums text-lightDialogHeaderText dark:text-darkDialogHeaderText" aria-live="polite">
          <span v-if="isPaused" class="font-medium text-lightWarning dark:text-darkWarning">{{ t('Paused') }} ·</span>
          {{ t('{processed} of {total} records processed', { processed, total }) }}
        </span>
        <ProgressBar
          class="flex-1"
          :currentValue="processed"
          :maxValue="Math.max(total, 1)"
          :showValues="false"
          :showProgress="false"
          :showAnimation="isProcessing && !isPaused"
        />
        <template v-if="isPaused">
          <Button type="button" variant="secondary" size="sm" @click="emit('stop')">
            <IconSquare class="w-3.5 h-3.5" aria-hidden="true" />
            {{ t('Stop') }}
          </Button>
          <Button type="button" variant="secondary" size="sm" @click="emit('resume')">
            <IconPlay class="w-3.5 h-3.5" aria-hidden="true" />
            {{ t('Resume') }}
          </Button>
        </template>
      </div>
      <ButtonGroup v-model="filter">
        <template #button:all>
          <span :class="FILTER_CLASSES">{{ t('All') }} <span class="tabular-nums opacity-60">{{ records.length }}</span></span>
        </template>
        <template #button:changed>
          <span :class="FILTER_CLASSES">{{ t('Changed') }} <span class="tabular-nums opacity-60">{{ changedCount }}</span></span>
        </template>
        <template #button:failed>
          <span :class="FILTER_CLASSES">{{ t('Failed') }} <span class="tabular-nums opacity-60">{{ failedCount }}</span></span>
        </template>
      </ButtonGroup>
    </div>

    <div class="grid h-[min(44rem,calc(100dvh-16rem))] min-h-[20rem] grid-cols-1 overflow-hidden rounded-lg border border-lightFormBorder bg-lightForm dark:border-darkFormBorder dark:bg-darkForm @3xl/review:grid-cols-[18rem_minmax(0,1fr)]">
      <div class="af-review-list hidden min-h-0 flex-col border-e border-lightFormBorder bg-lightFormHeading dark:border-darkFormBorder dark:bg-darkFormHeading @3xl/review:flex">
        <ul class="min-h-0 flex-1 overflow-y-auto" :aria-label="t('Records')">
          <li
            v-for="record in pageRecords"
            :key="record.id"
            class="flex items-center gap-2.5 border-b border-s-2 border-b-lightFormBorder ps-2.5 dark:border-b-darkFormBorder"
            :class="record === selectedRecord
              ? 'border-s-lightPrimary bg-lightPrimaryOpacity dark:border-s-darkPrimary dark:bg-darkPrimaryOpacity'
              : 'border-s-transparent hover:bg-lightListTableRowHover dark:hover:bg-darkListTableRowHover'"
          >
            <Checkbox v-model="record.isChecked" class="[&>label]:ms-0">
              <span class="sr-only">{{ t('Save {record}', { record: recordLabel(record) }) }}</span>
            </Checkbox>
            <button
              :ref="(el) => setRowButton(record, el as HTMLButtonElement | null)"
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2.5 py-2 pe-3 text-start focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-lightFocusRing dark:focus-visible:ring-darkFocusRing"
              :aria-current="record === selectedRecord || undefined"
              @click="selectAt(filteredRecords.indexOf(record))"
              @keydown="onRowKeydown($event, record)"
            >
              <span
                v-if="hasImages"
                class="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-lightSecondaryDarken dark:bg-darkSecondaryLighten"
                :class="!record.isChecked && 'opacity-50'"
              >
                <img v-if="thumbnail(record)" :src="thumbnail(record)" alt="" loading="lazy" class="h-full w-full object-cover" />
                <IconImage v-else class="w-4 h-4 text-lightInputPlaceholderText dark:text-darkInputPlaceholderText" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1" :class="!record.isChecked && 'opacity-50'">
                <span class="block truncate text-sm font-medium text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ recordLabel(record) }}</span>
                <span
                  class="block truncate text-xs"
                  :class="record.status === 'failed' ? 'text-lightDanger dark:text-darkDanger' : 'text-lightInputIconColor dark:text-darkInputIconColor'"
                >
                  {{ recordSummary(record) }}
                </span>
              </span>
              <Spinner v-if="record.status === 'processing'" class="w-4 h-4 shrink-0" />
              <IconClock v-else-if="record.status === 'pending'" class="w-4 h-4 shrink-0 text-lightInputPlaceholderText dark:text-darkInputPlaceholderText" aria-hidden="true" />
              <IconCircleAlert v-else-if="record.status === 'failed'" class="w-4 h-4 shrink-0 text-lightDanger dark:text-darkDanger" aria-hidden="true" />
              <IconCircleCheck v-else class="w-4 h-4 shrink-0 text-lightSuccess dark:text-darkSuccess" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div
          v-if="filteredRecords.length > pageSize"
          class="af-pagination-container flex items-center justify-between gap-2 border-t border-lightFormBorder px-3 py-1.5 text-xs text-lightInputIconColor dark:border-darkFormBorder dark:text-darkInputIconColor"
        >
          <span class="tabular-nums">
            {{ t('{from}–{to} of {total}', { from: pageStart + 1, to: pageStart + pageRecords.length, total: filteredRecords.length }) }}
          </span>
          <div class="flex gap-1">
            <Button type="button" variant="ghost" size="sm" iconOnly :disabled="pageStart === 0" :aria-label="t('Previous page')" @click="offset = pageStart - pageSize">
              <IconChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="sm" iconOnly :disabled="pageStart + pageSize >= filteredRecords.length" :aria-label="t('Next page')" @click="offset = pageStart + pageSize">
              <IconChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <RecordDetail
        v-if="selectedRecord"
        :record="selectedRecord"
        :meta="meta"
        :label="recordLabel(selectedRecord)"
        :position="selectedIndex + 1"
        :total="filteredRecords.length"
        @prev="selectAt(selectedIndex - 1)"
        @next="selectAt(selectedIndex + 1)"
        @regenerateRecord="emit('regenerateRecord', { recordId: selectedRecord.id })"
        @regenerateImages="emit('regenerateImages', { recordId: selectedRecord.id })"
        @regenerateField="(fieldName) => emit('regenerateCell', { recordId: selectedRecord.id, fieldName })"
        @zoom="(url) => emit('zoom', url)"
      />
      <div v-else class="flex flex-col items-center justify-center gap-2 p-6 text-center @3xl/review:col-start-2">
        <IconListFilter class="w-6 h-6 text-lightInputPlaceholderText dark:text-darkInputPlaceholderText" aria-hidden="true" />
        <p class="text-sm text-lightInputIconColor dark:text-darkInputIconColor">{{ t('No records match this filter.') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, ButtonGroup, Checkbox, ProgressBar, Spinner } from '@/afcl';
import {
  IconChevronLeft, IconChevronRight, IconCircleAlert, IconCircleCheck, IconClock, IconImage, IconListFilter, IconPause, IconPlay,
  IconSquare,
} from '@iconify-prerendered/vue-lucide';
import RecordDetail from './RecordDetail.vue';
import { changedFieldsCount, generatedImageUrl, isRecordChanged, recordError, type RecordState } from './reviewModel';

type Filter = 'all' | 'changed' | 'failed';

const DEFAULT_PAGE_SIZE = 10;
const FILTER_CLASSES = 'px-3 py-1.5';

const props = defineProps<{
  records: RecordState[],
  meta: any,
  processed: number,
  total: number,
  isProcessing: boolean,
  isPaused: boolean,
}>();

const emit = defineEmits<{
  regenerateRecord: [payload: { recordId: string | number }],
  regenerateImages: [payload: { recordId: string | number }],
  regenerateCell: [payload: { recordId: string | number, fieldName: string }],
  zoom: [url: string],
  stop: [],
  resume: [],
}>();

const { t } = useI18n();

const pageSize: number = props.meta.pageSize ?? DEFAULT_PAGE_SIZE;
const hasImages = props.meta.isAttachFiles || props.meta.outputImageFields.length > 0;

const filter = ref<Filter>('all');
const selectedId = ref<string | number | null>(null);
const offset = ref(0);
const rowButtons = new Map<string | number, HTMLButtonElement>();

const changedCount = computed(() => props.records.filter((record) => isRecordChanged(record, props.meta)).length);
const failedCount = computed(() => props.records.filter((record) => record.status === 'failed').length);

const filteredRecords = computed(() => props.records.filter((record) => {
  if (filter.value === 'changed') {
    return isRecordChanged(record, props.meta);
  }
  return filter.value === 'all' || record.status === 'failed';
}));

// a record which left the filter (or was saved) hands the selection to the first one
const selectedIndex = computed(() => Math.max(0, filteredRecords.value.findIndex((record) => record.id === selectedId.value)));
const selectedRecord = computed<RecordState | undefined>(() => filteredRecords.value[selectedIndex.value]);

// stays on the last page when saved records shrink the list
const pageStart = computed(() => {
  const lastPageStart = Math.max(0, Math.ceil(filteredRecords.value.length / pageSize) - 1) * pageSize;
  return Math.min(offset.value, lastPageStart);
});
const pageRecords = computed(() => filteredRecords.value.slice(pageStart.value, pageStart.value + pageSize));

watch(filter, () => {
  offset.value = 0;
});

function selectAt(index: number) {
  selectedId.value = filteredRecords.value[index].id;
  offset.value = index - index % pageSize;
}

function setRowButton(record: RecordState, el: HTMLButtonElement | null) {
  if (el) {
    rowButtons.set(record.id, el);
  } else {
    rowButtons.delete(record.id);
  }
}

async function onRowKeydown(event: KeyboardEvent, record: RecordState) {
  if (event.key === ' ') {
    event.preventDefault();
    record.isChecked = !record.isChecked;
    return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  const index = filteredRecords.value.indexOf(record) + (step ?? 0);
  if (!step || index < 0 || index >= filteredRecords.value.length) {
    return;
  }
  event.preventDefault();
  selectAt(index);
  await nextTick();
  rowButtons.get(filteredRecords.value[index].id)!.focus();
}

function recordLabel(record: RecordState): string {
  return record.label || t('Record {id}', { id: record.id });
}

function thumbnail(record: RecordState): string | null {
  return record.images[0]
    ?? props.meta.outputImageFields.map((field: string) => generatedImageUrl(record, props.meta, field)).find(Boolean)
    ?? null;
}

function recordSummary(record: RecordState): string {
  if (record.status === 'pending') {
    return t('Waiting');
  }
  if (record.status === 'processing') {
    return t('Generating…');
  }
  if (record.status === 'failed') {
    return recordError(record) || t('Generation failed');
  }
  const count = changedFieldsCount(record, props.meta);
  return count ? t('{count} field changed | {count} fields changed', count) : t('No changes');
}
</script>
