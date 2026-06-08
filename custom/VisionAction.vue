<template>
  <div class="flex items-end justify-start gap-2 cursor-pointer">
    <div class="flex items-center justify-center text-white bg-gradient-to-r h-[18px] from-lightPrimary via-lightPrimary/90 to-lightPrimary/80 hover:opacity-90 focus:ring-4 focus:outline-none focus:ring-lightPrimary/30 dark:focus:ring-darkPrimary/30 font-medium rounded-md text-sm px-1 text-center dark:bg-none dark:bg-darkPrimary/10 dark:text-darkPrimary dark:brightness-200">
      {{t('AI')}}
    </div>
    <p class="text-justify max-h-[18px] truncate max-w-[60vw] md:max-w-none">{{ props.meta.actionName }}</p>
  </div>
  <Dialog 
    ref="confirmDialog"
    header="Bulk AI Generation"
    class="[scrollbar-gutter:stable] max-w-full h-fit"
    :beforeCancelFunction="handleBeforeCancel"
    :class="popupMode === 'generation' ? 'lg:w-auto !lg:max-w-[1600px]' 
      : popupMode === 'settings' ? 'lg:w-[1000px] !lg:max-w-[1000px]' 
        : 'lg:w-[500px] !lg:max-w-[500px]'"
    :closable="true"
    :buttons="popupMode === 'generation' ? generationModeButtons : popupMode === 'settings' ? [
          {
            label: t('Cancel'),
            options: {
              class: 'afcl-button w-1/6',
              mode: 'secondary'
            },
            onclick: () => { popupMode = 'confirmation'; }
          },
          {
            label: t('Save settings'),
            options: {
              class: 'afcl-button w-1/6',
            },
            onclick: (dialog) => { saveSettings(); }
          },
        ] : 
          [
            {
              label: t('Cancel'),
              options: {
                class: 'afcl-button w-1/2',
                mode: 'secondary'
              },
              onclick: (dialog) => confirmDialog.tryToHideModal()
            },
            {
              label: t('Start generation'),
              options: {
                class: 'afcl-button w-1/2',
                loader: isCheckingRateLimits
              },
              onclick: async () => { await runAiActions(); }
            }
          ]"
    :click-to-close-outside="false"
  >
    <div
      class="bulk-vision-table flex flex-col gap-3 w-full"
      :class="{
        'h-[830px]': popupMode === 'generation',
        'h-auto max-h-[720px]': popupMode !== 'generation'
      }"
    >
      <template v-if="recordsList.length && popupMode === 'generation'" >
        <div class="w-full min-w-[980px]">
          <div v-if="isGenerationPaused" class="flex flex-col gap-2 mb-2">
            <p class="text-sm font-semibold text-yellow-800">{{ t(`Generated ${startedRecordCount} records. `) + t('Generation on pause. Resume generation?') }}</p>
            <div class="flex items-center gap-2">
              <button
                class="h-8 px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-lightPrimary to-lightPrimary/80 text-white border-none ml-2"
                @click="resumeGeneration"
              >
                {{ t('Resume generation') }}
              </button>
              <button
                class="h-8 px-3 py-1.5 text-sm rounded-md bg-white hover:bg-gray-100 text-gray-900 border border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:border-gray-600"
                @click="cancelGeneration"
              >
                {{ t('Cancel generation') }}
              </button>
            </div>
          </div>

          <div class="w-full bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-5 m-1 rounded-2xl shadow-sm flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div 
                  class="p-2 rounded-xl shrink-0"
                  :class="generationStatusClass"
                >
                  <IconShieldCheckOutline v-if="displayedProcessedCount === totalRecords" class="w-5 h-5" />
                  <IconRefreshOutline v-else :class="isProcessingAny ? 'animate-spin' : ''" class="w-5 h-5" />
                </div>
                
                <div>
                  <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200 tracking-tight">
                    {{ displayedProcessedCount }} {{ t('of') }} {{ totalRecords }} {{ t('fields ready to save') }}
                  </h4>
                </div>
              </div>

              <span
                class="px-2.5 py-1 text-xs rounded-default border flex items-center gap-1.5"
                :class="generationStatusClass"
              >
                <span 
                  class="w-1.5 h-1.5 rounded-full"
                  :class="isGenerationPaused ? 'bg-yellow-500' : displayedProcessedCount === totalRecords ? 'bg-green-500' : 'bg-blue-500'"
                ></span>
                {{ 
                  isGenerationPaused ? t('On pause') 
                  : displayedProcessedCount === totalRecords ? t('Ready') 
                  : t('Processing') 
                }}
              </span>
            </div>

            <ProgressBar 
              class="w-full"
              :class="isGenerationPaused ? 'opacity-80' : ''"
              :current-value="Math.floor((displayedProcessedCount / totalRecords) * 100)" 
              :max-value="100" 
              :min-value="0"
              :showAnimation="isProcessingAny && !isGenerationPaused"
              :showLabels="false"
              :showValues="false"
              :show-progress="false"
            />

          </div>
        </div>


        <VisionTable
          class="w-full flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] [mask-image:linear-gradient(to_bottom,transparent_0px,black_20px)]"
          ref="tableRef"
          :records="recordsList"
          :meta="props.meta"
          :tableHeaders="tableHeaders"
          :customFieldNames="customFieldNames"
          :isError="isError"
          :errorMessage="errorMessage"
          :regenerateImagesRefreshRate="props.meta.refreshRates?.regenerateImages"
          :isImageHasPreviewUrl="isImageHasPreviewUrl"
          :imageGenerationPrompts="generationPrompts.generateImages"
          :outputImageFields="props.meta.outputImageFields"
          :outputFieldsForAnalizeFromImages="props.meta.outputFieldsForAnalizeFromImages"
          :outputPlainFields="props.meta.outputPlainFields"
          :overwriteExistingValues="overwriteExistingValues"
          @error="handleTableError"
          @regenerate-images="regenerateImages"
          @regenerate-record="regenerateRecord"
        />
        <div class="mt-2 flex items-center text-lightPrimary dark:text-darkPrimary bg-lightPrimary/10 dark:bg-darkPrimary/10 px-4 py-3 rounded-default border border-lightPrimary/20 dark:border-darkPrimary/20 text-sm">
          <IconInfoCircleSolid class="w-5 h-5 me-2 shrink-0 text-lightPrimary dark:text-darkPrimary dark:brightness-200" />
          <p class="text-lightPrimary dark:text-darkPrimary dark:brightness-200">
            <span class="font-semibold text-lightPrimary dark:text-darkPrimary dark:brightness-200">{{ t('Only checked fields will be saved.') }}</span> 
            {{ t('You can regenerate fields before saving if needed.') }}
          </p>
        </div>
        <div class="text-red-600 flex items-center w-full">
          <p v-if="isError === true">{{ errorMessage }}</p>
        </div>
      </template>
      <template v-else-if="!recordsList.length && popupMode === 'generation'">
        <p>{{ t('No data to save. Feel free to click "Cancel"') }}</p>
      </template>
      <div v-else-if="popupMode === 'settings'" class="w-full flex flex-col gap-6 overflow-y-auto overflow-x-hidden pr-2 max-h-[70vh]">
        <template v-for="(promptsCategory, key) in generationPrompts" :key="key">
        <div v-if="Object.keys(promptsCategory).length > 0" class="w-full flex flex-col">
          <div class="flex items-start gap-3.5 mb-6">
            
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-bold text-gray-900 dark:text-white tracking-tight">
                {{
                 key === "plainFieldsPrompts" ? t("Prompts for non-image fields") 
                  : key === "generateImages" ? t("Prompts for image fields") 
                    : t("Prompts for image analysis")
                }}
              </h3>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ 
                  key === "plainFieldsPrompts" ? t("Define how AI should generate content for text-based fields.") 
                  : key === "generateImages" ? t("Configure prompt rules for generating media and images.") 
                    : t("Instructions for extracting text specifications from images.")
                }}
              </p>
            </div>
          </div>

          <div class="grid gap-6" :class="Object.keys(promptsCategory).length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'">
            <div 
              v-for="(prompt, promptKey) in promptsCategory" 
              :key="promptKey" 
              class="
              flex flex-col bg-white dark:bg-gray-900 border border-gray-200/80 p-5 rounded-default shadow-sm transition-all duration-200
              hover:shadow-md hover:border-gray-300
              dark:border-gray-800
              dark:hover:border-gray-700"
            >
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-lightPrimary/10 text-lightPrimary rounded-lg shrink-0
                    dark:bg-darkPrimary/20
                    dark:text-darkPrimary ">
                    <IconImageSolid 
                      v-if="key === 'generateImages'" 
                      class="w-5 h-5 dark:brightness-200" 
                    />
                    <IconFileLinesOutline 
                      v-else 
                      class="w-5 h-5 dark:brightness-200" 
                    />
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize tracking-tight">
                      {{ formatLabel(promptKey) }}
                    </h4>
                    <p class="text-[11px] text-gray-400 dark:text-gray-500">
                      {{ key === 'generateImages' ? t('Generate source media') : t('Generate a detailed content') }}
                    </p>
                  </div>
                </div>

                <span class="px-2 py-0.5 text-[10px] font-semibold tracking-wide rounded-md bg-lightPrimary/10 text-lightPrimary dark:bg-darkPrimary/10 dark:text-darkPrimary dark:brightness-200">
                  {{ key === 'generateImages' ? t('Image field') : t('Text field') }}
                </span>
              </div>

              <div class="relative flex-1">
                <Textarea 
                  v-model="generationPrompts[key][promptKey]" 
                  class="w-full h-56 p-3.5 text-sm leading-relaxed border border-gray-200 bg-gray-50/30 text-gray-800 shadow-sm resize-none font-sans
                  dark:border-gray-700  
                  dark:bg-gray-800/40  
                  dark:text-gray-100 rounded-xl 
                  dark:focus:border-gray-700
                  focus:outline-none 
                  focus:border-gray-200"
                  placeholder="Enter prompt instructions..."
                ></Textarea>
              </div>

              <button 
                type="button"
                mode="secondary"
                @click="resetPromptToDefault(key, promptKey)"
                class="
                mt-4 flex items-center gap-1.5 text-xs font-semibold bg-transparent px-3 py-1 w-fit rounded-default
                border border-red-200 hover:border-red-600
                text-red-600 hover:text-red-700 
                dark:border-red-900/50 dark:hover:border-red-400
                dark:text-red-500 dark:hover:text-red-400
                transition-colors duration-150"
              >
                <IconUndoOutline class="w-3.5 h-3.5" />
                {{ t('Reset') }}
              </button>

            </div>
          </div>
        </div>
      </template>
      </div>
      <div v-else class="flex flex-col gap-4 w-full h-full">
        <div class="flex flex-col p-5 rounded-default border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/40">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3 min-w-0">
              <div class="p-2 bg-lightPrimary/10 dark:bg-darkPrimary/10 rounded-xl text-lightPrimary dark:text-darkPrimary shrink-0 mt-0.5">
                <IconShieldCheckOutline class="w-5 h-5 dark:brightness-200"  />
              </div>
              <div class="min-w-0">
                <p class="text-base font-semibold text-gray-900 dark:text-white leading-tight">{{ t('Overwrite existing values') }}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 break-words pr-2">{{ t('AI-generated data will replace existing values.') }}</p>
              </div>
            </div>
            <div class="shrink-0 pt-1">
              <Toggle v-model="overwriteExistingValues" />
            </div>
          </div>

          <div v-if="overwriteExistingValues" class="mt-4 flex items-start text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 text-sm">
            <IconInfoCircleSolid class="w-4 h-4 me-2 shrink-0 mt-0.5 " />
            <p>{{ t('Warning: Existing values will be overwritten.') }}</p>
          </div>
        </div>

        <div 
          @click="clickSettingsButton()"
          class="
          flex items-center justify-between p-5 rounded-default border border-gray-100 bg-white shadow-sm cursor-pointer transition-all duration-150
          dark:border-gray-800 dark:bg-gray-900/40 "
        >
          <div class="flex items-start gap-3 min-w-0">
            <div class="p-2 bg-lightPrimary/10 dark:bg-darkPrimary/10 rounded-xl text-lightPrimary dark:text-darkPrimary shrink-0 mt-0.5">
              <IconMessageCaptionOutline class="w-5 h-5 dark:brightness-200" />
            </div>
            <div class="min-w-0">
              <p class="text-base font-semibold text-gray-900 dark:text-white leading-tight">{{ t('Configure prompts')}}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 break-words">{{ t('Change the instructions for AI to generate actual data.')}}</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 px-1 text-xs font-medium text-gray-400 dark:text-gray-500 dark:brightness-200">
          <IconInfoCircleSolid class="w-4 h-4 " />
          <p>{{ t('This action will only apply to the fields included in your prompts.') }}</p>
        </div>
    
      </div>
    </div>
  </Dialog>
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { ref, computed, nextTick } from 'vue'
import pLimit from 'p-limit';
import { Dialog, Textarea, Toggle, Tooltip } from '@/afcl';
import VisionTable from './VisionTable.vue'
import adminforth from '@/adminforth';
import { useI18n } from 'vue-i18n';
import { AdminUser, type AdminForthResourceCommon } from '@/types/Common';
import { useCoreStore } from '@/stores/core';
import { IconShieldSolid, IconInfoCircleSolid } from '@iconify-prerendered/vue-flowbite';
import { IconExclamationTriangle } from '@iconify-prerendered/vue-humbleicons';
import { useFiltersStore } from '@/stores/filters';
import { Button } from '@/afcl'
import { IconMessageCaptionOutline, IconShieldCheckOutline, IconFileLinesOutline, IconUndoOutline, IconImageSolid, IconRefreshOutline } from '@iconify-prerendered/vue-flowbite';
import { ProgressBar } from '@/afcl';


const coreStore = useCoreStore();
const filtersStore = useFiltersStore();
const showCloseConfirmModal = ref(false);

const { t } = useI18n();
const props = defineProps<{
  checkboxes: any,
  meta: any,
  resource: AdminForthResourceCommon,
  adminUser: AdminUser,
  updateList: () => any,
  clearCheckboxes?: () => any,
}>();

type RecordStatus = 'pending' | 'processing' | 'completed' | 'failed';
type GenerationAction = 'analyze' | 'analyze_no_images' | 'generate_images';

type RecordState = {
  id: string | number;
  status: RecordStatus;
  isChecked: boolean;
  label: string;
  data: Record<string, any>;
  oldData: Record<string, any>;
  images: any[];
  aiStatus: {
    generatedImages: boolean;
    analyzedImages: boolean;
    analyzedNoImages: boolean;
  };
  openGenerationCarousel: Record<string, boolean>;
  openImageCompare: Record<string, boolean>;
  carouselSaveImages: Record<string, any[]>;
  carouselImageIndex: Record<string, number>;
  imageGenerationErrorMessage: string;
  imageGenerationFailed: boolean;
  imageToTextErrorMessages: Record<string, string>;
  textToTextErrorMessages: Record<string, string>;
  regeneratingFieldsStatus: Record<string, boolean>;
  listOfImageNotGenerated: Record<string, any>;
};

const recordIds = ref<Array<string | number>>([]);
const recordsById = new Map<string, RecordState>();
const uncheckedRecordIds = new Set<string>();

defineExpose({
  click
});

const confirmDialog = ref<any>(null);
const primaryKey = props.meta.primaryKey;
const isLoading = ref(false);
const isFetchingRecords = ref(false);
const isError = ref(false);
const errorMessage = ref('');
const isDialogOpen = ref(false);
const isImageHasPreviewUrl = ref<Record<string, boolean>>({});
const popupMode = ref<'generation' | 'confirmation' | 'settings'>('confirmation');
const generationPrompts = ref<any>({});
const isDataSaved = ref(false);
const overwriteExistingValues = ref<boolean>(false);

const checkedCount = computed(() => recordIds.value.length - uncheckedRecordIds.size);
const totalRecords = computed(() => recordIds.value.length);
const isGenerationPaused = ref(false);
const isGenerationCancelled = ref(false);
const pendingResumeResolver = ref<null | (() => void)>(null);
const completedRecordIds = ref<Set<string>>(new Set());
const isActiveGeneration = ref(false);
const pauseBreakpoints = computed(() => props.meta.askConfirmation || []);
const startedRecordCount = ref(0);
const isCheckingRateLimits = ref(false);
let startGate = Promise.resolve();
const tableRef = ref<any>(null);
const generationFailureGroups = new Map<string, {
  actionType: GenerationAction;
  error: string;
  recordIds: Set<string>;
}>();
const processedCount = computed(() => {
  recordsVersion.value;
  return Array.from(recordsById.values()).filter(record => record.status === 'completed' || record.status === 'failed').length;
});
const progressStep = computed(() => {
  if (!totalRecords.value || totalRecords.value < 100) {
    return 1;
  }
  return Math.max(1, Math.floor(totalRecords.value / 100));
});
const displayedProcessedCount = computed(() => {
  const step = progressStep.value;
  if (step <= 1) {
    return processedCount.value;
  }
  if (processedCount.value >= totalRecords.value) {
    return totalRecords.value;
  }
  return Math.floor(processedCount.value / step) * step;
});
const displayedProgressPercent = computed(() => {
  if (!totalRecords.value) {
    return 0;
  }
  return Math.min(100, Math.round((displayedProcessedCount.value / totalRecords.value) * 100));
});
const isProcessingAny = computed(() => {
  recordsVersion.value;
  return Array.from(recordsById.values()).some(record => record.status === 'processing');
});

const tableHeaders = computed(() => generateTableHeaders(props.meta.outputFields));
const customFieldNames = computed(() => tableHeaders.value.slice((props.meta.isAttachFiles) ? 3 : 2).map(h => h.fieldName));
const recordsVersion = ref(0);
const recordsList = computed(() => {
  recordsVersion.value;
  const ids = isGenerationCancelled.value
    ? recordIds.value.filter(id => completedRecordIds.value.has(String(id)))
    : recordIds.value;
  return ids.map(id => getOrCreateRecord(id));
});

const generationModeButtons = computed(() => {
  const arrayToReturn = [
    { 
      label: checkedCount.value > 1 ? t('Save fields') : t('Save field'), 
      options: { 
        disabled: isLoading.value || checkedCount.value < 1 || isFetchingRecords.value || isProcessingAny.value || isGenerationPaused.value, 
        loader: isLoading.value, 
        class: 'afcl-button w-1/6'
      }, 
      onclick: async (dialog) => { await saveData(); closeDialog(); dialog.hide(false); } 
    },
    { 
      label: t('Cancel'), 
      options: {
        class: 'afcl-button w-1/6',
        mode: 'secondary'
      }, 
      onclick: async (dialog) => { await dialog.hide(true); } 
    },
  ]

  if (isProcessingAny.value) {
    arrayToReturn.splice(1, 0, {
      label: t('Save processed'),
      options: {
        disabled: isLoading.value || isSavingCurrent.value || completedRecordIds.value.size < 1,
        loader: isSavingCurrent.value,
        class: 'afcl-button w-1/6',
      },
      onclick: async () => { await saveCurrentGenerated(); }
    })
  }
  return arrayToReturn;
});

async function regenerateRecord({ recordId }) {

  const promises = [];

  if (props.meta.isImageGeneration) {
    promises.push(regenerateImages({ recordId }));
  }

  for (const fieldName of props.meta.outputFieldsForAnalizeFromImages || []) {
    promises.push(
      regenerateCell({
        recordId,
        fieldName,
      })
    );
  }

  for (const fieldName of props.meta.outputPlainFields || []) {
    promises.push(
      regenerateCell({
        recordId,
        fieldName,
      })
    );

  await Promise.allSettled(promises);
}
}

const handleBeforeClose = async (dialog?: any) => {
  if (popupMode.value === 'generation') {
    const confirmed = await adminforth.confirm({
      title: t('Close without saving?'),
      message: t('Are you sure you want to close without saving?'),
      yes: t('Yes'),
      no: t('Cancel'),
    });

    if (confirmed) {
      closeDialog();

      if (confirmDialog.value && typeof confirmDialog.value.hide === 'function') {
        confirmDialog.value.hide();
      } else if (dialog && typeof dialog.hide === 'function') {
        dialog.hide();
      }
      return true;
    }
    return false;
  }
}

const isSavingCurrent = ref(false);
function checkIfDialogOpen() {
  return isDialogOpen.value === true;
}

const openDialog = async () => {
  window.addEventListener('beforeunload', beforeUnloadHandler);
  if (props.meta.askConfirmationBeforeGenerating) {
    popupMode.value = 'confirmation';
  } else {
    popupMode.value = 'generation';
  }
  isDialogOpen.value = true;
  confirmDialog.value.open();
  isFetchingRecords.value = true;
  await initializeGlobalState();
  await findPreviewURLForImages();
  isFetchingRecords.value = false;
  if (!generationPrompts.value || Object.keys(generationPrompts.value).length === 0) {
    await getGenerationPrompts();
  }
  if (!props.meta.askConfirmationBeforeGenerating) {
    runAiActions();
  }
}

const handleBeforeCancel = async () => {
  if (popupMode.value === 'generation') {
    const confirmed = await adminforth.confirm({
      title: t('Close without saving?'),
      message: t('Are you sure you want to close without saving?'),
      yes: t('Yes'),
      no: t('Cancel'),
    });

    if (confirmed) {
      closeDialog();
      return true;
    }
    return false;
  }
  closeDialog();
  return true;
};

async function getListOfIds() {
  if ( props.meta.recordSelector === 'filtered' ) {
    const filters = filtersStore.getFilters(props.resource.resourceId);
    let res;
    try {
      res = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/get_filtered_ids`,
        method: 'POST',
        body: { filters },
        silentError: true,
      });
    } catch (e) {
      console.error('Failed to get records for filtered selector:', e);
      isError.value = true;
      errorMessage.value = t(`Failed to fetch records. Please, try to re-run the action.`);
      return [];
    }
    if (!res?.ok || !res?.recordIds) {
      console.error('Failed to get records for filtered selector, response error:', res);
      isError.value = true;
      errorMessage.value = t(`Failed to fetch records. Please, try to re-run the action.`);
      return [];
    }
    return res.recordIds;
  } else {
   return props.checkboxes;
  }
}
 

async function runAiActions() {
  if (!await checkRateLimits()) {
    confirmDialog.value.close();
    return;
  }
  popupMode.value = 'generation';
  isGenerationCancelled.value = false;
  isGenerationPaused.value = false;
  isActiveGeneration.value = true;
  completedRecordIds.value = new Set();
  startedRecordCount.value = 0;
  generationFailureGroups.clear();
  await nextTick();
  tableRef.value?.refresh();
  const limit = pLimit(props.meta.concurrencyLimit || 10);
  const tasks = recordIds.value
    .map(id => limit(() => processOneRecord(String(id))));
  await Promise.all(tasks);
  showGenerationFailureSummary();
  isActiveGeneration.value = false;
}

const closeDialog = () => {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  resetGlobalState();
  isError.value = false;
  errorMessage.value = '';
  isDialogOpen.value = false;
  popupMode.value = 'confirmation';
  isDataSaved.value = false;
  if (isGenerationPaused.value || isGenerationCancelled.value) {
    resolvePause();
  }
}

async function initializeGlobalState() {
  const ids = await getListOfIds();
  recordIds.value = ids;
  recordsById.clear();
  uncheckedRecordIds.clear();
}

function resetGlobalState() {
  recordIds.value = [];
  recordsById.clear();
  uncheckedRecordIds.clear();
  generationFailureGroups.clear();
}

function getActionLabel(actionType: GenerationAction) {
  return actionType.replace('_', ' ');
}

function getGenerationFailureGroupKey(actionType: GenerationAction, error: string) {
  const normalizedError = error
    .replace(/Please retry in [\d.]+s\.?/g, 'Please retry later.')
    .replace(/\b\d+\.\d+s\b/g, '<duration>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>');
  return `${actionType}:${normalizedError}`;
}

function registerGenerationFailure(record: RecordState, actionType: GenerationAction, error: string) {
  const key = getGenerationFailureGroupKey(actionType, error);
  let group = generationFailureGroups.get(key);
  if (!group) {
    group = {
      actionType,
      error,
      recordIds: new Set(),
    };
    generationFailureGroups.set(key, group);
  }
  group.recordIds.add(String(record.id));
}

function showGenerationFailureSummary() {
  for (const group of Array.from(generationFailureGroups.values())) {
    const failedCount = group.recordIds.size;
    const firstRecordId = Array.from(group.recordIds)[0];
    adminforth.alert({
      message: t(
        `Generation action "${getActionLabel(group.actionType)}" failed for ${failedCount} record(s). First failed record: ${firstRecordId}. Error: ${group.error}`,
      ),
      variant: 'danger',
      timeout: 'unlimited',
    });
  }
}

function getOrCreateRecord(recordId: string | number): RecordState {
  const key = String(recordId);
  let record = recordsById.get(key);
  if (!record) {
    record = createEmptyRecord(recordId);
    record.isChecked = !uncheckedRecordIds.has(key);
    recordsById.set(key, record);
  }
  return record;
}

function touchRecords() {
  recordsVersion.value += 1;
}

function waitForResumeIfPaused() {
  if (!isGenerationPaused.value) {
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    pendingResumeResolver.value = resolve;
  });
}

function resolvePause() {
  if (pendingResumeResolver.value) {
    pendingResumeResolver.value();
    pendingResumeResolver.value = null;
  }
}

function shouldPauseAfterRecords(processed: number) {
  if (!pauseBreakpoints.value?.length) {
    return false;
  }
  return pauseBreakpoints.value.some((rule: any) => {
    if (typeof rule?.afterRecords === 'number' && processed === rule.afterRecords) {
      return true;
    }
    if (typeof rule?.everyRecords === 'number' && rule.everyRecords > 0 && processed % rule.everyRecords === 0) {
      return true;
    }
    return false;
  });
}

function resumeGeneration() {
  if (!isGenerationPaused.value) {
    return;
  }
  isGenerationPaused.value = false;
  resolvePause();
}

async function cancelGeneration() {
  if (isGenerationCancelled.value) {
    return;
  }
  isGenerationCancelled.value = true;
  isGenerationPaused.value = false;
  resolvePause();
  const generatedIds = new Set(completedRecordIds.value);
  recordIds.value = recordIds.value.filter(id => generatedIds.has(String(id)));
  for (const key of Array.from(recordsById.keys())) {
    if (!generatedIds.has(key)) {
      recordsById.delete(key);
    }
  }
  for (const key of Array.from(uncheckedRecordIds)) {
    if (!generatedIds.has(key)) {
      uncheckedRecordIds.delete(key);
    }
  }
  touchRecords();
  await nextTick();
  tableRef.value?.refresh();
}

async function withStartGate<T>(fn: () => Promise<T>) {
  const previousGate = startGate;
  let releaseGate: () => void;
  startGate = new Promise<void>(resolve => {
    releaseGate = resolve;
  });
  await previousGate;
  try {
    return await fn();
  } finally {
    releaseGate!();
  }
}

function createImageFieldMap<T>(factory: () => T): Record<string, T> {
  const result: Record<string, T> = {};
  for (const field of props.meta.outputImageFields || []) {
    result[field] = factory();
  }
  return result;
}

function createEmptyRecord(recordId: string | number): RecordState {
  return {
    id: recordId,
    status: 'pending',
    isChecked: true,
    label: '',
    data: {},
    oldData: {},
    images: [],
    aiStatus: {
      generatedImages: !props.meta.isImageGeneration,
      analyzedImages: !props.meta.isFieldsForAnalizeFromImages,
      analyzedNoImages: !props.meta.isFieldsForAnalizePlain,
    },
    openGenerationCarousel: createImageFieldMap(() => false),
    openImageCompare: createImageFieldMap(() => false),
    carouselSaveImages: createImageFieldMap(() => []),
    carouselImageIndex: createImageFieldMap(() => 0),
    imageGenerationErrorMessage: '',
    imageGenerationFailed: false,
    imageToTextErrorMessages: {},
    textToTextErrorMessages: {},
    regeneratingFieldsStatus: {},
    listOfImageNotGenerated: {},
  };
}

async function processOneRecord(recordId: string) {
  if (!checkIfDialogOpen()) {
    return;
  }
  if (isGenerationCancelled.value) {
    return;
  }
  await withStartGate(async () => {
    while (true) {
      if (!checkIfDialogOpen() || isGenerationCancelled.value) {
        return;
      }
      if (isGenerationPaused.value) {
        await waitForResumeIfPaused();
        continue;
      }
      const nextStarted = startedRecordCount.value + 1;
      startedRecordCount.value = nextStarted;
      if (isActiveGeneration.value && shouldPauseAfterRecords(nextStarted)) {
        isGenerationPaused.value = true;
      }
      break;
    }
  });
  if (!checkIfDialogOpen() || isGenerationCancelled.value) {
    return;
  }
  const record = getOrCreateRecord(recordId);
  if (!record || !record.isChecked) {
    return;
  }
  record.status = 'processing';
  touchRecords();
  record.imageGenerationFailed = false;
  record.imageGenerationErrorMessage = '';
  record.imageToTextErrorMessages = {};
  record.textToTextErrorMessages = {};
  record.aiStatus.generatedImages = !props.meta.isImageGeneration;
  record.aiStatus.analyzedImages = !props.meta.isFieldsForAnalizeFromImages;
  record.aiStatus.analyzedNoImages = !props.meta.isFieldsForAnalizePlain;

  const oldDataResult = await fetchOldData(recordId);
  if (!checkIfDialogOpen()) {
    return;
  }
  if (!oldDataResult) {
    record.status = 'failed';
    record.aiStatus.generatedImages = true;
    record.aiStatus.analyzedImages = true;
    record.aiStatus.analyzedNoImages = true;
    touchRecords();
    return;
  }
  record.label = oldDataResult._label || record.label;
  initializeRecordData(record, oldDataResult);
  if (props.meta.isAttachFiles) {
    await fetchImages(record, oldDataResult);
    if (!checkIfDialogOpen()) {
      return;
    }
  }

  const actions: GenerationAction[] = [];
  if (props.meta.isImageGeneration) {
    actions.push('generate_images');
  }
  if (props.meta.isFieldsForAnalizeFromImages) {
    actions.push('analyze');
  }
  if (props.meta.isFieldsForAnalizePlain) {
    actions.push('analyze_no_images');
  }

  const results = await Promise.allSettled(actions.map(actionType => runActionForRecord(record, actionType)));
  if (!checkIfDialogOpen()) {
    return;
  }
  const hasError = results.some(result => result.status === 'rejected');
  record.status = hasError ? 'failed' : 'completed';
  completedRecordIds.value.add(String(recordId));
  touchRecords();
}

async function checkRateLimits() {
  isCheckingRateLimits.value = true;
  const actionsToCheck: GenerationAction[] = [];
  if (props.meta.isImageGeneration) {
    actionsToCheck.push('generate_images');
  }
  if (props.meta.isFieldsForAnalizeFromImages) {
    actionsToCheck.push('analyze');
  }
  if (props.meta.isFieldsForAnalizePlain) {
    actionsToCheck.push('analyze_no_images');
  }
  for (const actionType of actionsToCheck) {
    try {
      const rateLimitRes = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/update-rate-limits`,
        method: 'POST',
        body: { actionType },
      });
      if (rateLimitRes?.error || rateLimitRes?.ok === false) {
        adminforth.alert({
          message: t(`Rate limit exceeded for "${getActionLabel(actionType)}" action. Please try again later.`),
          variant: 'danger',
          timeout: 'unlimited',
        });
        return false;
      }
    } catch (e) {
      adminforth.alert({
        message: t(`Error checking rate limit for "${getActionLabel(actionType)}" action.`),
        variant: 'danger',
        timeout: 'unlimited',
      });
      isCheckingRateLimits.value = false;
      return false;
    }
  }
  isCheckingRateLimits.value = false;
  return true;
}

async function runActionForRecord(record: RecordState, actionType: GenerationAction, forceFilterFilledFields?: boolean) {
  if (!checkIfDialogOpen()) {
    return;
  }
  const responseFlag = actionType === 'generate_images'
    ? 'generatedImages'
    : actionType === 'analyze'
      ? 'analyzedImages'
      : 'analyzedNoImages';
  record.aiStatus[responseFlag] = false;

  let customPrompt;
  if (actionType === 'generate_images') {
    customPrompt = generationPrompts.value.imageGenerationPrompts || generationPrompts.value.generateImages;
  } else if (actionType === 'analyze') {
    customPrompt = generationPrompts.value.imageFieldsPrompts;
  } else if (actionType === 'analyze_no_images') {
    customPrompt = generationPrompts.value.plainFieldsPrompts;
  }

  let createJobResponse;
  try {
    if (!checkIfDialogOpen()) {
      return;
    }
    createJobResponse = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
      method: 'POST',
      body: {
        actionType,
        recordId: record.id,
        ...(customPrompt !== undefined ? { customPrompt: JSON.stringify(customPrompt) } : {}),
        filterFilledFields: forceFilterFilledFields !== undefined ? forceFilterFilledFields: !overwriteExistingValues.value,
      },
      silentError: true,
    });
  } catch (e) {
    record.aiStatus[responseFlag] = true;
    registerGenerationFailure(record, actionType, e instanceof Error ? e.message : String(e));
    throw e;
  }

  if (!checkIfDialogOpen()) {
    return;
  }

  if (createJobResponse?.error || !createJobResponse?.jobId) {
    record.aiStatus[responseFlag] = true;
    registerGenerationFailure(record, actionType, createJobResponse?.error || `Failed to ${getActionLabel(actionType)}. Please, try to re-run the action.`);
    throw new Error(createJobResponse?.error || 'Failed to create job');
  }

  await pollJob(record, createJobResponse.jobId, actionType, responseFlag);
}

async function pollJob(
  record: RecordState,
  jobId: string,
  actionType: GenerationAction,
  responseFlag: keyof RecordState['aiStatus']
) {
  let isInProgress = true;
  while (isInProgress && isDialogOpen.value) {
    const jobResponse = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get-job-status`,
      method: 'POST',
      body: { jobId },
      silentError: true,
    });
    if (!jobResponse) {
      await waitForRefresh(actionType);
      continue;
    }
    if (jobResponse?.error) {
      record.aiStatus[responseFlag] = true;
      registerGenerationFailure(record, actionType, jobResponse.error);
      throw new Error(jobResponse.error);
    }
    const jobStatus = jobResponse?.job?.status;
    if (jobStatus === 'in_progress') {
      await waitForRefresh(actionType);
      continue;
    }
    if (jobStatus === 'completed') {
      applyJobResult(record, jobResponse.job, actionType);
      record.aiStatus[responseFlag] = true;
      isInProgress = false;
      continue;
    }
    if (jobStatus === 'failed') {
      applyJobFailure(record, jobResponse.job, actionType);
      record.aiStatus[responseFlag] = true;
      throw new Error(jobResponse.job?.error || 'Job failed');
    }
  }
}

function applyJobResult(record: RecordState, job: any, actionType: GenerationAction) {
  if (actionType === 'generate_images') {
    for (const fieldName of props.meta.outputImageFields || []) {
      const resultValue = job?.result?.[fieldName];
      if (resultValue !== undefined) {
        record.data[fieldName] = resultValue;
      }
      record.carouselSaveImages[fieldName] = resultValue ? [resultValue] : [];
      if (job?.recordMeta?.[`${fieldName}_meta`]) {
        record.carouselSaveImages[fieldName] = [job.recordMeta[`${fieldName}_meta`].originalImage];
        record.listOfImageNotGenerated[fieldName] = job.recordMeta[`${fieldName}_meta`];
      }
    }
  } else {
    record.data = {
      ...record.data,
      ...(job?.result || {}),
    };
  }
  touchRecords();
}

function applyJobFailure(record: RecordState, job: any, actionType: GenerationAction) {
  registerGenerationFailure(record, actionType, job?.error || 'Unknown error');
  if (actionType === 'generate_images') {
    record.imageGenerationFailed = true;
    record.imageGenerationErrorMessage = job?.error || 'Unknown error';
  } else if (actionType === 'analyze') {
    for (const field of Object.keys(props.meta.outputFieldsForAnalizeFromImages || {})) {
      record.imageToTextErrorMessages[props.meta.outputFieldsForAnalizeFromImages[field]] = job?.error || 'Unknown error';
    }
  } else if (actionType === 'analyze_no_images') {
    for (const field of Object.keys(props.meta.outputPlainFields || {})) {
      record.textToTextErrorMessages[props.meta.outputPlainFields[field]] = job?.error || 'Unknown error';
    }
  }
  touchRecords();
}

async function waitForRefresh(actionType: GenerationAction) {
  if (actionType === 'generate_images') {
    await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.generateImages));
  } else if (actionType === 'analyze') {
    await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.fillFieldsFromImages));
  } else if (actionType === 'analyze_no_images') {
    await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.fillPlainFields));
  }
}

async function fetchOldData(recordId: string) {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_old_data`,
      method: 'POST',
      body: { recordId },
      silentError: true,
    });
    if (!res?.ok || !res?.record) {
      adminforth.alert({
        message: res?.error || t('Failed to fetch old data. Please, try to re-run the action.'),
        variant: 'danger',
        timeout: 'unlimited',
      });
      return null;
    }
    return res.record;
  } catch (error) {
    console.error('Failed to get old record:', error);
    isError.value = true;
    errorMessage.value = t(`Failed to fetch records. Please, try to re-run the action.`);
    return null;
  }
}

function initializeRecordData(record: RecordState, oldRecord: Record<string, any>) {
  const newData: Record<string, any> = {};
  const newOldData: Record<string, any> = {};
  for (const key in props.meta.outputFields || {}) {
    const normalizedValue = normalizeEnumValue(key, oldRecord[key] ?? null);
    newData[key] = normalizedValue;
    newOldData[key] = normalizedValue;
  }
  if (props.meta.outputImageFields) {
    for (const key of props.meta.outputImageFields) {
      const normalizedValue = normalizeEnumValue(key, oldRecord[key] ?? null);
      newData[key] = normalizedValue;
      newOldData[key] = normalizedValue;
    }
  }
  newData[primaryKey] = oldRecord[primaryKey] ?? record.id;
  newOldData[primaryKey] = oldRecord[primaryKey] ?? record.id;
  newOldData._label = oldRecord._label;
  record.data = newData;
  record.oldData = newOldData;
  touchRecords();
}

function normalizeEnumValue(key: string, value: any) {
  const colEnum = props.meta.columnEnums?.find(c => c.name === key);
  if (!colEnum) {
    return value;
  }
  const match = colEnum.enum.find(item => item.value === value);
  return match ? value : null;
}

async function fetchImages(record: RecordState, oldRecord: Record<string, any>) {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_images`,
      method: 'POST',
      body: {
        record: [oldRecord],
      },
    });
    record.images = res.images?.[0] || [];
    touchRecords();
  } catch (error) {
    console.error('Failed to get images:', error);
    isError.value = true;
    errorMessage.value = t(`Failed to fetch images. Please, try to re-run the action.`);
  }
}

function formatLabel(str) {
  const labelsMap = props.meta?.columnLabels || {};
  let labelFromMeta = labelsMap[str];
  if (!labelFromMeta) {
    const match = Object.keys(labelsMap).find(k => k.toLowerCase() === String(str).toLowerCase());
    if (match) labelFromMeta = labelsMap[match];
  }
  if (labelFromMeta) return labelFromMeta;
  return str
    .split('_')                   
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');      
}

function generateTableHeaders(outputFields) {
  const headers = [];

  headers.push({ label: 'Checkboxes', fieldName: 'checkboxes' });
  headers.push({ label: 'Field name', fieldName: 'label' });
  if (props.meta.isAttachFiles) {
    headers.push({ label: 'Source Images', fieldName: 'images' });
  }
  for (const key in outputFields) {
    headers.push({
      label: formatLabel(key),
      fieldName: key,
    });
  }
  return headers;
}
function handleTableError(errorData) {
  isError.value = errorData.isError;
  errorMessage.value = errorData.errorMessage;
}
async function prepareDataForSave() {
  const checkedRecords = recordIds.value
    .map(id => getOrCreateRecord(id))
    .filter(record => record.isChecked === true);
  const checkedItems = checkedRecords.map(record => ({
    ...record.data,
    [primaryKey]: record.id,
  }));

  const promises: Promise<void>[] = [];
  checkedRecords.forEach((record, index) => {
    if (record.imageGenerationFailed) {
      return;
    }
    for (const [key, value] of Object.entries(checkedItems[index])) {
      if (props.meta.outputImageFields?.includes(key)) {
        const p = convertImages(key, value).then(result => {
          checkedItems[index][key] = result;
        });
        promises.push(p);
      }
    }
  });

  await Promise.all(promises);
  return [checkedItems, checkedRecords] as const;
}

async function prepareDataForRecords(records: RecordState[]) {
  const checkedItems = records.map(record => ({
    ...record.data,
    [primaryKey]: record.id,
  }));

  const promises: Promise<void>[] = [];
  records.forEach((record, index) => {
    if (record.imageGenerationFailed) {
      return;
    }
    for (const [key, value] of Object.entries(checkedItems[index])) {
      if (props.meta.outputImageFields?.includes(key)) {
        const p = convertImages(key, value).then(result => {
          checkedItems[index][key] = result;
        });
        promises.push(p);
      }
    }
  });

  await Promise.all(promises);
  return [checkedItems, records] as const;
}

async function convertImages(fieldName, img) {
  let imgBlob;
  if (typeof img === 'string' && img.startsWith('data:')) {
    const base64 = img.split(',')[1];
    const mimeType = img.split(';')[0].split(':')[1];
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    imgBlob = new Blob([byteArray], { type: mimeType });
  } else if (typeof img === 'string') {
    imgBlob = await fetch(
      `/adminapi/v1/plugin/${props.meta.outputImagesPluginInstanceIds[fieldName]}/cors-proxy?url=${encodeURIComponent(img)}`
    ).then(res => { return res.blob() });
  }
  return imgBlob;
}

async function uploadImagesForRecords(reqData: Record<string, any>[], checkedRecords: RecordState[]) {
  if (checkedRecords.some(record => record.imageGenerationFailed)) {
    return;
  }
  const imagesToUpload = [];
  for (let index = 0; index < reqData.length; index++) {
    const item = reqData[index];
    const record = checkedRecords[index];
    for (const [key, value] of Object.entries(item)) {
      if (props.meta.outputImageFields?.includes(key)) {
        if (!value) {
          continue;
        }
        if (!overwriteExistingValues.value) {
          const imageURL = record.data[key];
          const originalImageUrl = record.listOfImageNotGenerated?.[key]?.originalImage || '';
          if (originalImageUrl === imageURL) {
            reqData[index][key] = undefined;
            continue;
          }
        }
        const p = uploadImage(value, record.id, key).then(result => {
          reqData[index][key] = result;
        });
        imagesToUpload.push(p);
      }
    }
  }
  await Promise.all(imagesToUpload);
}


async function saveData() {
  const errorText = 'Failed to save some records. Not all data may be saved'
  try {
    isLoading.value = true;
  const [reqData, checkedRecords] = await prepareDataForSave();
    if (checkedRecords.length < 1) {
      adminforth.alert({ message: t('No items selected'), variant: 'warning' });
      return;
    }
    await uploadImagesForRecords(reqData, checkedRecords);
    const limit = pLimit(props.meta.concurrencyLimit || 10);
    const saveTasks = checkedRecords.map((record, index) =>
      limit(async () => {
        return await callAdminForthApi({
          path: `/plugin/${props.meta.pluginInstanceId}/update_fields`,
          method: 'POST',
          body: {
            selectedIds: [record.id],
            fields: [reqData[index]],
            saveImages: !record.imageGenerationFailed,
          },
        });
      })
    );

    const saveResults = await Promise.all(saveTasks);
    const failedResult = saveResults.find(res => res?.ok === false || res?.error);

     if (failedResult && failedResult.ok === false) {
      saveResults.filter(res => res?.ok === false).forEach(res => {
        adminforth.alert({
          message: res.error || t(errorText),
          variant: 'danger',
          timeout: 'unlimited',
        });
        console.error('Error saving data:', res.error);
      });
      isError.value = true;
      errorMessage.value = t(errorText);
    } else if ( failedResult ) {
      console.error('Error saving data:', failedResult);
      isError.value = true;
      errorMessage.value = t(errorText);
    }
  } catch (error) {
    console.error('Error saving data:', error);
    isError.value = true;
    errorMessage.value = t(errorText);
  } finally {
    confirmDialog.value.close();
    props.updateList();
    props.clearCheckboxes?.();
    isLoading.value = false;
    isDataSaved.value = true;
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }
}
async function uploadImage(imgBlob, id, fieldName) {
  const file = new File([imgBlob], `generated_${fieldName}_${id}.${imgBlob.type.split('/').pop()}`, { type: imgBlob.type });
  const { name, size, type } = file;
  
  const extension = name.split('.').pop();
  const nameNoExtension = name.replace(`.${extension}`, '');

  try {
    const { uploadUrl, uploadExtraParams, filePath, error } = await callAdminForthApi({
        path: `/plugin/${props.meta.outputImagesPluginInstanceIds[fieldName]}/get_file_upload_url`,
        method: 'POST',
        body: {
          originalFilename: nameNoExtension,
          contentType: type,
          size,
          originalExtension: extension,
          recordPk: id,
        },
    });

    if (error) {
      adminforth.alert({
        message: t('File was not uploaded because of error: {error}', { error }),
        variant: 'danger'
      });
      return;
    }

    const xhr = new XMLHttpRequest();
    const success = await new Promise((resolve) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
        }
      };
      xhr.addEventListener('loadend', () => {
        const success = xhr.readyState === 4 && xhr.status === 200;
        // try to read response
        resolve(success);
      });
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', type);
      uploadExtraParams && Object.entries(uploadExtraParams).forEach(([key, value]: [string, string]) => {
        xhr.setRequestHeader(key, value);
      })
      xhr.send(file);
    });
    if (!success) {
      adminforth.alert({
        messageHtml: `<div>${t('Sorry but the file was not uploaded because of internal storage Request Error:')}</div>
        <pre style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%;">${
          xhr.responseText.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        }</pre>`,
        variant: 'danger',
        timeout: 30,
      });
      return;
    }
    return filePath;
  } catch (error) {
    console.error('Error uploading file:', error);
    adminforth.alert({
      message: 'Sorry but the file was not be uploaded. Please try again.',
      variant: 'danger'
    });

    isError.value = true;
    errorMessage.value = `Failed to upload images. Please, try to re-run the action.`;
    return null;
  }
}

async function regenerateImages({ recordId }: { recordId: any }) {
  if (coreStore.isInternetError) {
    adminforth.alert({
      message: t('Cannot regenerate images while internet connection is lost. Please check your connection and try again.'),
      variant: 'danger',
      timeout: 'unlimited',
    });
    return;
  }
  const record = recordsById.get(String(recordId));
  if (!record) {
    return;
  }
  record.aiStatus.generatedImages = false;
  record.status = 'processing';
  touchRecords();

  try {
    await runActionForRecord(
      record,
      'generate_images',
      false
    );

    record.status = 'completed';
    completedRecordIds.value.add(String(recordId));

    record.aiStatus.generatedImages = true;
    touchRecords();

  } catch (e) {
    record.aiStatus.generatedImages = true;
    record.status = 'failed';
    touchRecords();
  }
}

async function findPreviewURLForImages() {
  if (props.meta.outputImageFields){
    for (const fieldName of props.meta.outputImageFields) {
      try {
        const res = await callAdminForthApi({
          path: `/plugin/${props.meta.pluginInstanceId}/compile_old_image_link`,
          method: 'POST',
          body: {
          image: "test",
          columnName: fieldName,
          },
        });
        if (res?.ok) {
          isImageHasPreviewUrl.value[fieldName] = true;
        } else {
          isImageHasPreviewUrl.value[fieldName] = false;
        }
      } catch (e) {
        console.error("Error finding preview URL for field", fieldName, e);
      }
    }
  }
}

function click() {
  openDialog();
}

function saveSettings() {
  const promptsToSaveGenerateImages = Object.fromEntries(
    Object.entries(generationPrompts.value.generateImages).filter(
      ([key, value]) => value !== props.meta.generationPrompts.imageGenerationPrompts[key].prompt
    )
  );

  const promptsToSaveAnalyzeImages = Object.fromEntries(
    Object.entries(generationPrompts.value.imageFieldsPrompts).filter(
      ([key, value]) => value !== props.meta.generationPrompts.imageFieldsPrompts[key]
    )
  );

  const promptsToSaveAnalyzeNoImages = Object.fromEntries(
    Object.entries(generationPrompts.value.plainFieldsPrompts).filter(
      ([key, value]) => value !== props.meta.generationPrompts.plainFieldsPrompts[key]
    )
  );

  const promptsToSave = {
    ...(Object.keys(promptsToSaveAnalyzeNoImages).length > 0 ? { plainFieldsPrompts: promptsToSaveAnalyzeNoImages } : {}),
    ...(Object.keys(promptsToSaveAnalyzeImages).length > 0 ? { imageFieldsPrompts: promptsToSaveAnalyzeImages } : {}),
    ...(Object.keys(promptsToSaveGenerateImages).length > 0 ? { generateImages: promptsToSaveGenerateImages } : {}),
  };

  console.log('Saving prompts:', promptsToSave);

  localStorage.setItem(`bulkAiFlowGenerationPrompts_${props.meta.pluginInstanceId}`, JSON.stringify(promptsToSave));
  popupMode.value = 'confirmation';
}

async function getGenerationPrompts() {
  const calculatedGenerationPrompts: any = {};
  const savedPrompts = localStorage.getItem(`bulkAiFlowGenerationPrompts_${props.meta.pluginInstanceId}`);
  if (props.meta.generationPrompts.plainFieldsPrompts) {
    calculatedGenerationPrompts.plainFieldsPrompts = {
      ...props.meta.generationPrompts.plainFieldsPrompts
    };
  }
  if (props.meta.generationPrompts.imageFieldsPrompts) {
    calculatedGenerationPrompts.imageFieldsPrompts = {
      ...props.meta.generationPrompts.imageFieldsPrompts
    };
  }
  if (props.meta.generationPrompts.imageGenerationPrompts) {
    let imageFields = {};
    for (const [key, value] of Object.entries(props.meta.generationPrompts.imageGenerationPrompts)) {
      // value might be typed as unknown; cast to any to access prompt safely
      imageFields[key] = (value as any).prompt;
    }
    calculatedGenerationPrompts.generateImages = imageFields;
  }
  if (savedPrompts && props.meta.askConfirmationBeforeGenerating) {
    
    generationPrompts.value = checkAndAddNewFieldsToPrompts(JSON.parse(savedPrompts), calculatedGenerationPrompts);
    
    return;
  }
  generationPrompts.value = calculatedGenerationPrompts;
}

function resetPromptToDefault(categoryKey, promptKey) {
  console.log('Resetting prompt:', categoryKey, promptKey);
  console.log('Default prompt:', props.meta.generationPrompts);
  if (categoryKey === 'generateImages') {
    generationPrompts.value[categoryKey][promptKey] = props.meta.generationPrompts.imageGenerationPrompts[promptKey].prompt;
    return;
  }
  console.log('Resetting prompt to the:', props.meta.generationPrompts[categoryKey][promptKey]);
  generationPrompts.value[categoryKey][promptKey] = props.meta.generationPrompts[categoryKey][promptKey];
}

function clickSettingsButton() {
  getGenerationPrompts();
  popupMode.value = 'settings';
}


function checkAndAddNewFieldsToPrompts(savedPrompts, defaultPrompts) {
  for (const categoryKey in defaultPrompts) {
    if (!savedPrompts.hasOwnProperty(categoryKey)) {
      savedPrompts[categoryKey] = defaultPrompts[categoryKey];
    } else {
      for (const promptKey in defaultPrompts[categoryKey]) {
        if (!savedPrompts[categoryKey].hasOwnProperty(promptKey)) {
          savedPrompts[categoryKey][promptKey] = defaultPrompts[categoryKey][promptKey];
        }
      }
    }
  }
  //remove deprecated fields
  for (const categoryKey in savedPrompts) {
    if (!defaultPrompts.hasOwnProperty(categoryKey)) {
      delete savedPrompts[categoryKey];
    } else {
      for (const promptKey in savedPrompts[categoryKey]) {
        if (!defaultPrompts[categoryKey].hasOwnProperty(promptKey)) {
          delete savedPrompts[categoryKey][promptKey];
        }
      }
    }
  }
  return savedPrompts;
}

async function regenerateCell(recordInfo: any) {
  if (coreStore.isInternetError) {
    adminforth.alert({
      message: t('Cannot regenerate column while internet connection is lost. Please check your connection and try again.'),
      variant: 'danger',
      timeout: 'unlimited',
    });
    return;
  }
  const record = recordsById.get(String(recordInfo.recordId));
  if (!record) {
    return;
  }
  if (!record.regeneratingFieldsStatus[recordInfo.fieldName]) {
    record.regeneratingFieldsStatus[recordInfo.fieldName] = false;
  }
  record.regeneratingFieldsStatus[recordInfo.fieldName] = true;
  touchRecords();
  const actionType = props.meta.outputFieldsForAnalizeFromImages?.includes(recordInfo.fieldName)
    ? 'analyze'
    : props.meta.outputPlainFields?.includes(recordInfo.fieldName)
      ? 'analyze_no_images'
      : null;
  if (!actionType) {
    console.error(`Field ${recordInfo.fieldName} is not configured for analysis.`);
    record.regeneratingFieldsStatus[recordInfo.fieldName] = false;
    touchRecords();
    return;
  }
  
  let generationPromptsForField = {};
  if (actionType === 'analyze') {
    generationPromptsForField = generationPrompts.value.imageFieldsPrompts || {};
    record.aiStatus.analyzedImages = false;
  } else if (actionType === 'analyze_no_images') {
    generationPromptsForField = generationPrompts.value.plainFieldsPrompts || {};
    record.aiStatus.analyzedNoImages = false;
  }
  
  let jobId;
  let res;
  try {
    res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
      method: 'POST',
      body: {
        fieldToRegenerate: recordInfo.fieldName,
        recordId: recordInfo.recordId,
        action: actionType,
        actionType: "regenerate_cell",
        prompt: generationPromptsForField[recordInfo.fieldName] || null,
      },
      silentError: true,
    });
  } catch (e) {
    record.regeneratingFieldsStatus[recordInfo.fieldName] = false;
    console.error(`Error during cell regeneration for record ${recordInfo.recordId}, field ${recordInfo.fieldName}:`, e);
  }
  if ( res.ok === false) {
    adminforth.alert({
      message: res.error,
      variant: 'danger',
    });
    isError.value = true;
    errorMessage.value = t(`Failed to regenerate field`);
    record.regeneratingFieldsStatus[recordInfo.fieldName] = false;
    return;
  }
  jobId = res.jobId;
  res = {}
  do {
    res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get-job-status`,
      method: 'POST',
      body: { jobId },
      silentError: true,
    });
    if (actionType === 'analyze') {
      await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.fillFieldsFromImages));
    } else if (actionType === 'analyze_no_images') {
      await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.fillPlainFields));
    }
  } while (res.job?.status === 'in_progress');
  if (res.job?.status === 'failed' || !res.ok || !res) {
    adminforth.alert({
      message: t(`Regeneration action failed for record: ${recordInfo.recordId}. Error: ${res.job?.error || 'Unknown error'}`),
      variant: 'danger',
      timeout: 'unlimited',
    });
    if (actionType === 'analyze') {
      record.imageToTextErrorMessages[recordInfo.fieldName] = res.job?.error || 'Unknown error';
      record.aiStatus.analyzedImages = true;
    } else if (actionType === 'analyze_no_images') {
      record.textToTextErrorMessages[recordInfo.fieldName] = res.job?.error || 'Unknown error';
      record.aiStatus.analyzedNoImages = true;
    }
    record.regeneratingFieldsStatus[recordInfo.fieldName] = false;
    touchRecords();
    return;
  } else if (res.job?.status === 'completed') {
    record.data = {
      ...record.data,
      ...res.job.result,
    };
    if (actionType === 'analyze') {
      record.imageToTextErrorMessages[recordInfo.fieldName] = '';
      record.aiStatus.analyzedImages = true;
    } else if (actionType === 'analyze_no_images') {
      record.textToTextErrorMessages[recordInfo.fieldName] = '';
      record.aiStatus.analyzedNoImages = true;
    }
    record.regeneratingFieldsStatus[recordInfo.fieldName] = false;
    touchRecords();
  }
}

const beforeUnloadHandler = (event) => {
  if (isDataSaved.value) return;
  event.preventDefault();
  event.returnValue = '';
};

async function saveCurrentGenerated() {
  const errorText = 'Failed to save some records. Not all data may be saved';
  const generatedIds = new Set(completedRecordIds.value);
  if (generatedIds.size < 1) {
    return;
  }
  const recordsToSave = Array.from(generatedIds)
    .map(id => recordsById.get(String(id)))
    .filter((record): record is RecordState => Boolean(record))
    .filter(record => record.isChecked === true);
  if (recordsToSave.length < 1) {
    return;
  }
  try {
    isSavingCurrent.value = true;
    const [reqData, checkedRecords] = await prepareDataForRecords(recordsToSave);
    await uploadImagesForRecords(reqData, checkedRecords);

    const limit = pLimit(props.meta.concurrencyLimit || 10);
    const saveTasks = checkedRecords.map((record, index) =>
      limit(async () => {
        const res = await callAdminForthApi({
          path: `/plugin/${props.meta.pluginInstanceId}/update_fields`,
          method: 'POST',
          body: {
            selectedIds: [record.id],
            fields: [reqData[index]],
            saveImages: !record.imageGenerationFailed,
          },
        });
        return { recordId: String(record.id), res };
      })
    );

    const saveResults = await Promise.all(saveTasks);
    const failedResults = saveResults.filter(item => item.res?.ok === false || item.res?.error);
    const savedIds = saveResults
      .filter(item => item.res?.ok !== false && !item.res?.error)
      .map(item => item.recordId);

    if (failedResults.length > 0) {
      failedResults.forEach(item => {
        adminforth.alert({
          message: item.res?.error || t(errorText),
          variant: 'danger',
          timeout: 'unlimited',
        });
      });
      isError.value = true;
      errorMessage.value = t(errorText);
    }

    if (savedIds.length > 0) {
      recordIds.value = recordIds.value.filter(id => !savedIds.includes(String(id)));
      for (let index = 0; index < savedIds.length; index++) {
        const id = savedIds[index];
        recordsById.delete(id);
        uncheckedRecordIds.delete(id);
        completedRecordIds.value.delete(id);
      }
      adminforth.alert({
        message: t('Successfully saved generated data for {count} records', { count: savedIds.length }),
        variant: 'success',
      });
      touchRecords();
    }
    if (recordIds.value.length === 0) {
      confirmDialog.value.close();
      return;
    }
  } catch (error) {
    console.error('Error saving data:', error);
    isError.value = true;
    errorMessage.value = t(errorText);
  } finally {
    isSavingCurrent.value = false;
  }
  await nextTick();
  tableRef.value.refresh();
  props.updateList();
}

const generationStatusClass = computed(() => {
  if (isGenerationPaused.value) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-400'
  }

  if (displayedProcessedCount.value === totalRecords.value) {
    return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-400'
  }

  return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-400'
})

</script>
