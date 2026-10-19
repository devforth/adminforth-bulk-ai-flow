<template>
  <div class="af-review-record @container/detail flex min-h-0 flex-col">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-lightFormBorder px-4 py-3 dark:border-darkFormBorder">
      <div class="min-w-0 flex-1 basis-full @md/detail:basis-0">
        <h4 class="truncate text-sm font-semibold text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ label }}</h4>
        <p class="text-xs text-lightInputIconColor dark:text-darkInputIconColor">
          {{ t('Record {position} of {total}', { position, total }) }}
          <i18n-t keypath="· {up} {down} to move, {space} to include" tag="span" class="hidden @3xl/review:inline">
            <template #up><kbd :class="KBD_CLASSES">↑</kbd></template>
            <template #down><kbd :class="KBD_CLASSES">↓</kbd></template>
            <template #space><kbd :class="KBD_CLASSES">Space</kbd></template>
          </i18n-t>
        </p>
      </div>
      <Checkbox v-model="record.isChecked">{{ t('Save this record') }}</Checkbox>
      <Button type="button" variant="secondary" size="sm" :disabled="!isSettled" @click="emit('regenerateRecord')">
        <IconRefreshCw class="w-3.5 h-3.5" aria-hidden="true" />
        {{ t('Regenerate') }}
      </Button>
      <div class="flex gap-1">
        <Button type="button" variant="secondary" size="sm" iconOnly :disabled="position === 1" :aria-label="t('Previous record')" @click="emit('prev')">
          <IconChevronUp aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" size="sm" iconOnly :disabled="position === total" :aria-label="t('Next record')" @click="emit('next')">
          <IconChevronDown aria-hidden="true" />
        </Button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="record.status === 'pending'" class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <IconClock class="w-6 h-6 text-lightInputPlaceholderText dark:text-darkInputPlaceholderText" aria-hidden="true" />
        <p class="text-sm text-lightInputIconColor dark:text-darkInputIconColor">{{ t('This record is waiting for its turn.') }}</p>
      </div>

      <template v-else>
        <div class="hidden gap-3 border-b border-lightFormBorder bg-lightFormHeading px-4 py-2 text-xs font-medium text-lightInputIconColor dark:border-darkFormBorder dark:bg-darkFormHeading dark:text-darkInputIconColor @lg/detail:grid @lg/detail:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)]">
          <span>{{ t('Current') }}</span>
          <span></span>
          <span>{{ t('Generated') }}</span>
        </div>

        <div v-if="meta.isAttachFiles" class="flex flex-col gap-2 border-b border-lightFormBorder px-4 py-3 dark:border-darkFormBorder">
          <span class="text-sm font-medium text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ t('Source images') }}</span>
          <div v-if="record.images.length" class="flex flex-wrap gap-2">
            <button
              v-for="(image, index) in record.images"
              :key="image"
              type="button"
              :class="IMAGE_BUTTON_CLASSES"
              :aria-label="t('Open source image {number}', { number: index + 1 })"
              @click="emit('zoom', image)"
            >
              <img :src="image" alt="" class="h-16 w-24 object-cover" />
            </button>
          </div>
          <Skeleton v-else-if="record.status === 'processing'" type="image" class="h-16 w-24 rounded-default" />
          <p v-else class="text-sm text-lightInputPlaceholderText dark:text-darkInputPlaceholderText">{{ t('No source images') }}</p>
        </div>

        <div
          v-for="field in meta.outputFields"
          :key="field"
          class="flex flex-col gap-2 border-b border-lightFormBorder px-4 py-3 last:border-b-0 dark:border-darkFormBorder"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ fieldLabel(meta, field) }}</span>
            <span v-if="!isFieldGenerating(record, meta, field)" :class="[BADGE_CLASSES, badgeClasses(field)]">{{ badgeLabel(field) }}</span>
            <span class="flex-1"></span>
            <Tooltip>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                :loader="record.regeneratingFieldsStatus[field] === true"
                :disabled="!isSettled || isFieldGenerating(record, meta, field)"
                :aria-label="t('Regenerate {field}', { field: fieldLabel(meta, field) })"
                @click="regenerate(field)"
              >
                <IconRefreshCw aria-hidden="true" />
              </Button>
              <template #tooltip>{{ t('Regenerate') }}</template>
            </Tooltip>
          </div>

          <div class="grid grid-cols-1 items-start gap-2 @lg/detail:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)] @lg/detail:gap-3">
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-xs text-lightInputIconColor dark:text-darkInputIconColor @lg/detail:hidden">{{ t('Current') }}</span>
              <template v-if="fieldKind(meta, field) === 'image'">
                <button
                  v-if="record.oldImagePreviews[field]"
                  type="button"
                  :class="IMAGE_BUTTON_CLASSES"
                  :aria-label="t('Open current image')"
                  @click="emit('zoom', record.oldImagePreviews[field])"
                >
                  <img :src="record.oldImagePreviews[field]" alt="" class="aspect-[16/10] w-full object-cover" />
                </button>
                <div v-else :class="IMAGE_PLACEHOLDER_CLASSES">
                  <IconImageOff class="w-5 h-5" aria-hidden="true" />
                  {{ t('No image') }}
                </div>
              </template>
              <div
                v-else
                class="min-h-[2.125rem] max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-default bg-lightSecondaryDarken px-2.5 py-1.5 text-sm leading-5 text-lightInputIconColor dark:bg-darkSecondaryLighten dark:text-darkInputIconColor"
              >
                <span v-if="isEmpty(record.oldData[field])" class="text-lightInputPlaceholderText dark:text-darkInputPlaceholderText">-</span>
                <template v-else>{{ displayValue(field, record.oldData[field]) }}</template>
              </div>
            </div>

            <IconArrowRight class="mt-2.5 hidden w-4 h-4 text-lightInputPlaceholderText dark:text-darkInputPlaceholderText @lg/detail:block" aria-hidden="true" />

            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-xs text-lightInputIconColor dark:text-darkInputIconColor @lg/detail:hidden">{{ t('Generated') }}</span>
              <template v-if="fieldKind(meta, field) === 'image'">
                <Skeleton v-if="isFieldGenerating(record, meta, field)" type="image" class="aspect-[16/10] w-full rounded-lg" />
                <button
                  v-else-if="generatedImageUrl(record, meta, field)"
                  type="button"
                  :class="IMAGE_BUTTON_CLASSES"
                  :aria-label="t('Open generated image')"
                  @click="emit('zoom', generatedImageUrl(record, meta, field))"
                >
                  <img :src="generatedImageUrl(record, meta, field)" alt="" class="aspect-[16/10] w-full object-cover" />
                </button>
                <div v-else :class="IMAGE_PLACEHOLDER_CLASSES">
                  <IconImageOff class="w-5 h-5" aria-hidden="true" />
                  {{ t('Not generated') }}
                </div>
              </template>
              <Skeleton
                v-else-if="isFieldGenerating(record, meta, field)"
                type="input"
                class="w-full"
                :class="editorKind(field) === 'multiline' ? 'h-24' : 'h-[2.125rem]'"
              />
              <Select
                v-else-if="editorKind(field) === 'enum'"
                v-model="record.data[field]"
                class="w-full"
                :options="enumOptions(field)"
                teleportToTop
              />
              <div v-else-if="editorKind(field) === 'boolean'" class="flex h-[2.125rem] items-center">
                <Toggle v-model="record.data[field]" />
              </div>
              <Input v-else-if="editorKind(field) === 'number'" v-model="record.data[field]" type="number" fullWidth />
              <Input v-else-if="editorKind(field) === 'line'" v-model="record.data[field]" type="text" fullWidth />
              <Textarea
                v-else
                :modelValue="record.data[field] ?? ''"
                rows="4"
                class="resize-y"
                @update:modelValue="(value) => record.data[field] = value"
              />
            </div>
          </div>

          <p v-if="fieldError(record, meta, field)" class="flex items-start gap-1.5 text-xs text-lightDanger dark:text-darkDanger">
            <IconCircleAlert class="mt-px w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {{ fieldError(record, meta, field) }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, Select, Skeleton, Textarea, Toggle, Tooltip } from '@/afcl';
import {
  IconArrowRight, IconChevronDown, IconChevronUp, IconCircleAlert, IconClock, IconImageOff, IconRefreshCw,
} from '@iconify-prerendered/vue-lucide';
import {
  fieldChange, fieldError, fieldKind, fieldLabel, generatedImageUrl, isFieldGenerating, isRecordBusy, type RecordState,
} from './reviewModel';

type EditorKind = 'enum' | 'boolean' | 'number' | 'line' | 'multiline';

const NUMBER_TYPES = ['integer', 'decimal', 'float'];
const KBD_CLASSES = 'rounded border border-lightFormBorder px-1 font-mono text-[11px] dark:border-darkFormBorder';
const BADGE_CLASSES = 'inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium';
const IMAGE_BUTTON_CLASSES = 'block overflow-hidden rounded-lg border border-lightFormBorder cursor-zoom-in hover:border-lightPrimary focus:outline-none focus-visible:ring-[3px] focus-visible:ring-lightFocusRing dark:border-darkFormBorder dark:hover:border-darkPrimary dark:focus-visible:ring-darkFocusRing transition-colors';
const IMAGE_PLACEHOLDER_CLASSES = 'flex aspect-[16/10] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-lightFormBorder bg-lightFormHeading text-xs text-lightInputPlaceholderText dark:border-darkFormBorder dark:bg-darkFormHeading dark:text-darkInputPlaceholderText';

const props = defineProps<{
  record: RecordState,
  meta: any,
  label: string,
  position: number,
  total: number,
}>();

const emit = defineEmits<{
  prev: [],
  next: [],
  regenerateRecord: [],
  regenerateImages: [],
  regenerateField: [field: string],
  zoom: [url: string],
}>();

const { t } = useI18n();

const isSettled = computed(() => !isRecordBusy(props.record));

function columnEnum(field: string) {
  return props.meta.columnEnums.find((column: any) => column.name === field);
}

function editorKind(field: string): EditorKind {
  if (columnEnum(field)) {
    return 'enum';
  }
  const type = props.meta.columnTypes[field];
  if (type === 'boolean') {
    return 'boolean';
  }
  if (NUMBER_TYPES.includes(type)) {
    return 'number';
  }
  return type === 'string' ? 'line' : 'multiline';
}

function enumOptions(field: string) {
  return columnEnum(field).enum.map((item: any) => ({ label: item.label, value: item.value }));
}

function isEmpty(value: any) {
  return value === null || value === undefined || value === '';
}

function displayValue(field: string, value: any): string {
  const option = columnEnum(field)?.enum.find((item: any) => item.value === value);
  if (option) {
    return option.label;
  }
  if (typeof value === 'boolean') {
    return value ? t('Yes') : t('No');
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function badgeLabel(field: string): string {
  if (fieldError(props.record, props.meta, field)) {
    return t('Failed');
  }
  return {
    new: t('New'),
    changed: t('Changed'),
    same: t('Unchanged'),
  }[fieldChange(props.record, props.meta, field)];
}

function badgeClasses(field: string): string {
  if (fieldError(props.record, props.meta, field)) {
    return 'border-lightDangerBorder bg-lightDangerSoft text-lightDanger dark:border-darkDangerBorder dark:bg-darkDangerSoft dark:text-darkDanger';
  }
  return fieldChange(props.record, props.meta, field) === 'same'
    ? 'border-transparent bg-lightSecondaryDarken text-lightInputIconColor dark:bg-darkSecondaryLighten dark:text-darkInputIconColor'
    : 'border-lightPrimary/30 bg-lightPrimaryOpacity text-lightPrimary dark:border-darkPrimary/40 dark:bg-darkPrimaryOpacity dark:text-darkPrimary';
}

function regenerate(field: string) {
  if (fieldKind(props.meta, field) === 'image') {
    emit('regenerateImages');
  } else {
    emit('regenerateField', field);
  }
}
</script>
