<template>
  <div class="af-confirmation-panel flex flex-col gap-4">
    <section class="af-configure-prompts-card flex flex-col gap-1.5">
      <h4 class="text-sm font-medium text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ t('Fields to generate') }}</h4>
      <ul class="af-settings-panel overflow-hidden rounded-lg border border-lightFormBorder divide-y divide-lightFormBorder dark:border-darkFormBorder dark:divide-darkFormBorder">
        <li
          v-for="row in rows"
          :key="row.field"
          :class="openFields.has(row.field) ? 'bg-lightFormHeading dark:bg-darkFormHeading' : 'bg-lightForm dark:bg-darkForm'"
        >
          <div class="flex items-center gap-3 px-3.5 py-2.5">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ fieldLabel(meta, row.field) }}</p>
              <p v-if="!openFields.has(row.field)" class="truncate text-xs text-lightInputIconColor dark:text-darkInputIconColor">
                {{ prompts[row.category][row.field] }}
              </p>
            </div>
            <span
              v-if="isUnsaved(row)"
              class="inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-medium border-lightWarningBorder bg-lightWarningSoft text-lightWarning dark:border-darkWarningBorder dark:bg-darkWarningSoft dark:text-darkWarning"
            >
              {{ t('Unsaved') }}
            </span>
            <span class="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium bg-lightSecondaryDarken text-lightInputIconColor dark:bg-darkSecondaryLighten dark:text-darkInputIconColor">
              {{ kindLabels[CATEGORY_KIND[row.category]] }}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              :aria-label="openFields.has(row.field) ? t('Hide prompt') : t('Edit prompt')"
              :aria-expanded="openFields.has(row.field)"
              :aria-controls="`${idPrefix}-${row.field}`"
              @click="toggle(row.field)"
            >
              <IconChevronUp v-if="openFields.has(row.field)" aria-hidden="true" />
              <IconPencil v-else aria-hidden="true" />
            </Button>
          </div>
          <div v-if="openFields.has(row.field)" :id="`${idPrefix}-${row.field}`" class="flex flex-col items-start gap-2 px-3.5 pb-3">
            <Textarea
              v-model="prompts[row.category][row.field]"
              rows="4"
              class="resize-y"
              :placeholder="t('Enter prompt instructions...')"
            />
            <div class="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                :disabled="prompts[row.category][row.field] === defaultPrompts[row.category][row.field]"
                @click="prompts[row.category][row.field] = defaultPrompts[row.category][row.field]"
              >
                <IconRotateCcw class="w-3.5 h-3.5" aria-hidden="true" />
                {{ t('Reset to default') }}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!isUnsaved(row)"
                @click="emit('save', row.category, row.field)"
              >
                <IconSave class="w-3.5 h-3.5" aria-hidden="true" />
                {{ t('Save prompt') }}
              </Button>
            </div>
          </div>
        </li>
      </ul>
      <p class="text-xs text-lightInputIconColor dark:text-darkInputIconColor">
        {{ t('Saved prompts are kept in this browser, unsaved changes apply to this run only.') }}
      </p>
    </section>

    <div class="af-overwrite-settings-card rounded-lg border border-lightFormBorder bg-lightForm px-3.5 py-3 dark:border-darkFormBorder dark:bg-darkForm">
      <Toggle v-model="overwrite" class="w-full flex-row-reverse justify-between gap-3 [&>label]:ms-0">
        <span class="flex flex-col">
          <span class="font-medium text-lightDialogHeaderText dark:text-darkDialogHeaderText">{{ t('Overwrite existing values') }}</span>
          <span class="text-xs text-lightInputIconColor dark:text-darkInputIconColor">
            {{ overwrite ? t('AI-generated data will replace existing values.') : t('AI fills only empty fields.') }}
          </span>
        </span>
      </Toggle>
    </div>

    <div
      v-if="overwrite"
      class="flex items-start gap-2.5 rounded-default border px-3 py-2.5 text-sm border-lightWarningBorder bg-lightWarningSoft text-lightWarning dark:border-darkWarningBorder dark:bg-darkWarningSoft dark:text-darkWarning"
    >
      <IconTriangleAlert class="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
      <p>{{ t('Existing values will be replaced when you save.') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Textarea, Toggle } from '@/afcl';
import { IconChevronUp, IconPencil, IconRotateCcw, IconSave, IconTriangleAlert } from '@iconify-prerendered/vue-lucide';
import { CATEGORY_KIND, fieldLabel, type FieldKind, type PromptCategory } from './reviewModel';

type Prompts = Record<PromptCategory, Record<string, string>>;
type PromptRow = { category: PromptCategory, field: string };

const props = defineProps<{
  meta: any,
  defaultPrompts: Prompts,
  savedPrompts: Prompts,
}>();

const emit = defineEmits<{
  save: [category: PromptCategory, field: string],
}>();

const prompts = defineModel<Prompts>('prompts', { required: true });
const overwrite = defineModel<boolean>('overwrite', { required: true });

const { t } = useI18n();
const idPrefix = useId();
const openFields = reactive(new Set<string>());

const kindLabels = computed<Record<FieldKind, string>>(() => ({
  fromImage: t('From image'),
  text: t('Text'),
  image: t('Image'),
}));

// in the order of the columns in the review
const rows = computed<PromptRow[]>(() => (Object.keys(CATEGORY_KIND) as PromptCategory[]).flatMap((category) =>
  Object.keys(prompts.value[category]).map((field) => ({ category, field })),
));

function isUnsaved(row: PromptRow): boolean {
  return prompts.value[row.category][row.field] !== props.savedPrompts[row.category][row.field];
}

function toggle(field: string) {
  if (openFields.has(field)) {
    openFields.delete(field);
  } else {
    openFields.add(field);
  }
}
</script>
