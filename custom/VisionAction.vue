<template>
  <div class="flex items-end justify-start gap-2 cursor-pointer">
    <div class="flex items-center justify-center text-white bg-gradient-to-r h-[18px] from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 font-medium rounded-md text-sm px-1 text-center">
      {{t('AI')}}
    </div>
    <p class="text-justify max-h-[18px] truncate max-w-[60vw] md:max-w-none">{{ props.meta.actionName }}</p>
  </div>
  <Dialog 
    ref="confirmDialog"
    header="Bulk AI Generation"
    class="[scrollbar-gutter:stable] !max-w-full w-fit h-fit"
    :class="popupMode === 'generation' ? 'lg:w-[1600px] !lg:max-w-[1600px]' 
      : popupMode === 'settings' ? 'lg:w-[1000px] !lg:max-w-[1000px]' 
        : 'lg:w-[500px] !lg:max-w-[500px]'"
    :beforeCloseFunction="closeDialog"
    :closable="false"
    :askForCloseConfirmation="popupMode === 'generation' ? true : false"
    :closeConfirmationText="t('Are you sure you want to close without saving?')"
    :buttons="popupMode === 'generation' ? [
        { 
          label: checkedCount > 1 ? t('Save fields') : t('Save field'), 
          options: { 
            disabled: isLoading || checkedCount < 1 || isFetchingRecords || isProcessingAny, 
            loader: isLoading, class: 'w-fit' 
          }, 
          onclick: async (dialog) => { await saveData(); dialog.hide(); } 
        },
        { 
          label: t('Cancel'), 
          options: {
            class: 'bg-white hover:!bg-gray-100 !text-gray-900 hover:!text-gray-800 dark:!bg-gray-800 dark:!text-gray-100 dark:hover:!bg-gray-700 !border-gray-200'
          }, 
          onclick: (dialog) => confirmDialog.tryToHideModal() 
        },
      ] : popupMode === 'settings' ? [
          {
            label: t('Save settings'),
            options: {
              class: 'w-fit'
            },
            onclick: (dialog) => { saveSettings(); }
          },
        ] : 
          [
            // {
            //   label: t('Edit prompts'),
            //   options: {
            //     class: 'w-fit ml-auto'
            //   },
            //   onclick: (dialog) => { clickSettingsButton(); }
            // },
            {
              label: t('Cancel'),
              options: {
                class: 'w-2/5 bg-white hover:!bg-gray-100 !text-gray-900 hover:!text-gray-800 dark:!bg-gray-800 dark:!text-gray-100 dark:hover:!bg-gray-700 !border-gray-200'
              },
              onclick: (dialog) => confirmDialog.tryToHideModal()
            },
            {
              label: t('Start generation'),
              options: {
                class: 'w-3/5 px-5 py-2.5 bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 rounded-md text-white border-none'
              },
              onclick: (dialog) => { runAiActions(); }
            }
          ]"
    :click-to-close-outside="false"
  >
    <div class="bulk-vision-table flex flex-col items-center gap-3 md:gap-4 overflow-y-auto">
      <template v-if="recordsList.length && popupMode === 'generation'" >


        <div class="w-full">
          <div
            class="w-full h-[30px] rounded-md bg-gray-200 dark:bg-gray-700 overflow-hidden relative"
            role="progressbar"
            :aria-valuenow="displayedProcessedCount"
            :aria-valuemin="0"
            :aria-valuemax="totalRecords"
          >
            <div
              class="h-full bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 transition-all duration-200"
              :style="{ width: `${displayedProgressPercent}%` }"
            ></div>
            <div class="absolute inset-0 flex items-center justify-center text-sm font-medium text-white drop-shadow">
              <template v-if="isProcessingAny">
                {{ displayedProcessedCount }} / {{ totalRecords }}
              </template>
              <template v-else>
                {{ t('Processed') }}
              </template>
            </div>
          </div>
        </div>


        <VisionTable
          class="md:max-h-[75vh] max-w-[1560px] w-full h-full"
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
          @error="handleTableError"
          @regenerate-images="regenerateImages"
          @regenerate-cell="regenerateCell"
        />
        <div class="text-red-600 flex items-center w-full">
          <p v-if="isError === true">{{ errorMessage }}</p>
        </div>
      </template>
      <div 
        v-else-if="popupMode === 'settings'" 
        v-for="(promptsCategory, key) in generationPrompts" 
        :key="key" 
        class="w-full"
      >
        <div v-if="Object.keys(promptsCategory).length > 0" class="gap-4 mb-6 ml-1">
          <p class="text-start w-full text-xl font-bold mb-2">{{
           key === "plainFieldsPrompts" ? "Prompts for non-image fields" 
            : key === "generateImages" ? "Prompts for image fields" 
              : "Prompts for image analysis"
          }}</p>
          <div class="grid grid-cols-2 gap-4">
            <div v-for="(prompt, promptKey) in promptsCategory" :key="promptKey">
              {{ formatLabel(promptKey) }} {{ t('prompt') }}:
              <Textarea 
                v-model="generationPrompts[key][promptKey]" 
                class="w-full h-64 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              ></Textarea>
              <p class="text-red-500 hover:underline hover:cursor-pointer mt-2" @click="resetPromptToDefault(key, promptKey)">reset to default</p>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="flex flex-col gap-2 mt-2 w-full h-full">
        <div class="flex items-center justify-between mb-2 w-full">
          <div class="flex items-center justify-center gap-2">
            <IconShieldSolid class="w-6 h-6 text-lightPrimary dark:text-darkPrimary" />
            <p class="sm:text-base text-sm">{{ t('Overwrite existing values') }}</p>
            <Tooltip>
                <IconInfoCircleSolid class="w-5 h-5 me-2 text-lightPrimary dark:text-darkPrimary"/>
                <template #tooltip>
                  <p class="max-w-64">{{ t('When enabled, the AI will overwrite content for fields that already have data. When off - this helps to preserve existing information and avoid overwriting valuable content.') }}</p>
                </template>
            </Tooltip>
          </div>
          <Toggle
            v-model="overwriteExistingValues"
          />
        </div>
        <div :class="overwriteExistingValues === true ? 'opacity-100' : 'opacity-0'" class="flex items-center text-yellow-800 bg-yellow-100 p-2 rounded-md border border-yellow-300">
          <IconExclamationTriangle class="w-6 h-6 me-2"/>
          <p class="sm:text-base text-sm">{{ t('Warning: Existing values will be overwritten.') }}</p>
        </div>
        <p class="w-fit flex justify-start text-lightPrimary dark:text-white hover:underline cursor-pointer" @click="clickSettingsButton()">{{ t('Configure prompts') }}</p>
      </div>
    </div>
  </Dialog>
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { ref, computed, reactive } from 'vue'
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


const coreStore = useCoreStore();
const filtersStore = useFiltersStore();

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
  return recordIds.value.map(id => getOrCreateRecord(id));
});

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
  popupMode.value = 'generation';
  if (!await checkRateLimits()) {
    return;
  }
  const limit = pLimit(props.meta.concurrencyLimit || 10);
  const tasks = recordIds.value
    .map(id => limit(() => processOneRecord(String(id))));
  await Promise.all(tasks);
}

const closeDialog = () => {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  resetGlobalState();
  isError.value = false;
  errorMessage.value = '';
  isDialogOpen.value = false;
  popupMode.value = 'confirmation';
  isDataSaved.value = false;
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

  const actions: Array<'generate_images' | 'analyze' | 'analyze_no_images'> = [];
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
  touchRecords();
}

async function checkRateLimits() {
  const actionsToCheck: Array<'generate_images' | 'analyze' | 'analyze_no_images'> = [];
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
          message: t(`Rate limit exceeded for "${actionType.replace('_', ' ')}" action. Please try again later.`),
          variant: 'danger',
          timeout: 'unlimited',
        });
        return false;
      }
    } catch (e) {
      adminforth.alert({
        message: t(`Error checking rate limit for "${actionType.replace('_', ' ')}" action.`),
        variant: 'danger',
        timeout: 'unlimited',
      });
      return false;
    }
  }
  return true;
}

async function runActionForRecord(record: RecordState, actionType: 'analyze' | 'analyze_no_images' | 'generate_images') {
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
        filterFilledFields: !overwriteExistingValues.value,
      },
      silentError: true,
    });
  } catch (e) {
    record.aiStatus[responseFlag] = true;
    throw e;
  }

  if (!checkIfDialogOpen()) {
    return;
  }

  if (createJobResponse?.error || !createJobResponse?.jobId) {
    record.aiStatus[responseFlag] = true;
    adminforth.alert({
      message: t(`Failed to ${actionType.replace('_', ' ')}. Please, try to re-run the action.`),
      variant: 'danger',
      timeout: 'unlimited',
    });
    throw new Error(createJobResponse?.error || 'Failed to create job');
  }

  await pollJob(record, createJobResponse.jobId, actionType, responseFlag);
}

async function pollJob(
  record: RecordState,
  jobId: string,
  actionType: 'analyze' | 'analyze_no_images' | 'generate_images',
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

function applyJobResult(record: RecordState, job: any, actionType: 'analyze' | 'analyze_no_images' | 'generate_images') {
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

function applyJobFailure(record: RecordState, job: any, actionType: 'analyze' | 'analyze_no_images' | 'generate_images') {
  adminforth.alert({
    message: t(`Generation action "${actionType.replace('_', ' ')}" failed for record: ${record.id}. Error: ${job?.error || 'Unknown error'}`),
    variant: 'danger',
    timeout: 'unlimited',
  });
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

async function waitForRefresh(actionType: 'analyze' | 'analyze_no_images' | 'generate_images') {
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


async function saveData() {
  const errorText = 'Failed to save some records. Not all data may be saved'
  try {
    isLoading.value = true;
  const [reqData, checkedRecords] = await prepareDataForSave();
    if (checkedRecords.length < 1) {
      adminforth.alert({ message: t('No items selected'), variant: 'warning' });
      return;
    }
    if (!checkedRecords.some(record => record.imageGenerationFailed)) {
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

function regenerateImages({ recordId }: { recordId: any }) {
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
  touchRecords();
  runActionForRecord(record, 'generate_images').catch(() => {
    record.aiStatus.generatedImages = true;
    touchRecords();
  });
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
    calculatedGenerationPrompts.plainFieldsPrompts = props.meta.generationPrompts.plainFieldsPrompts;
  }
  if (props.meta.generationPrompts.imageFieldsPrompts) {
    calculatedGenerationPrompts.imageFieldsPrompts = props.meta.generationPrompts.imageFieldsPrompts;
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

</script>