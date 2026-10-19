<template>
  <span class="flex items-center gap-2">
    <IconSparkles class="w-4 h-4 shrink-0 text-lightInputIconColor dark:text-darkInputIconColor" aria-hidden="true" />
    <span class="truncate">{{ props.meta.actionName }}</span>
  </span>
  <Dialog
    ref="confirmDialog"
    :header="props.meta.actionName"
    class="w-11/12"
    :class="popupMode === 'generation' ? 'max-w-6xl' : 'max-w-2xl'"
    :buttons="popupMode === 'generation' ? generationModeButtons : confirmationModeButtons"
    :beforeCancelFunction="handleBeforeCancel"
    :closeByClickOutside="false"
    :closeByEsc="!zoomedImage"
  >
    <GenerationSetup
      v-if="popupMode === 'confirmation'"
      v-model:prompts="generationPrompts"
      v-model:overwrite="overwriteExistingValues"
      :meta="props.meta"
      :defaultPrompts="defaultPrompts"
      :savedPrompts="savedPrompts"
      @save="savePrompt"
    />
    <div v-else class="bulk-vision-table flex flex-col gap-3">
      <template v-if="recordsList.length">
        <ReviewQueue
          :records="recordsList"
          :meta="props.meta"
          :processed="displayedProcessedCount"
          :total="totalRecords"
          :isProcessing="isProcessingAny"
          :isPaused="isGenerationPaused"
          @regenerateRecord="regenerateRecord"
          @regenerateImages="regenerateImages"
          @regenerateCell="regenerateCell"
          @zoom="(url) => zoomedImage = url"
          @stop="cancelGeneration"
          @resume="resumeGeneration"
        />
        <p class="flex items-start gap-2 text-xs text-lightInputIconColor dark:text-darkInputIconColor">
          <IconInfo class="mt-px w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {{ t('Only checked records are saved. You can edit or regenerate values before saving.') }}
        </p>
      </template>
      <Skeleton v-else-if="isFetchingRecords" type="input" class="h-[20rem] w-full rounded-lg" />
      <div v-else class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-lightFormBorder px-6 py-10 text-center dark:border-darkFormBorder">
        <IconInbox class="w-6 h-6 text-lightInputPlaceholderText dark:text-darkInputPlaceholderText" aria-hidden="true" />
        <p class="text-sm text-lightInputIconColor dark:text-darkInputIconColor">{{ t('No data to save. Feel free to click "Cancel"') }}</p>
      </div>

      <p v-if="isError" class="af-error-message flex items-start gap-1.5 text-sm text-lightDanger dark:text-darkDanger">
        <IconCircleAlert class="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
        {{ errorMessage }}
      </p>
    </div>
  </Dialog>
  <ImageLightbox v-model="zoomedImage" />
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { ref, reactive, computed } from 'vue'
import pLimit from 'p-limit';
import { Dialog, Skeleton } from '@/afcl';
import { IconCircleAlert, IconInbox, IconInfo, IconSparkles } from '@iconify-prerendered/vue-lucide';
import GenerationSetup from './GenerationSetup.vue';
import ReviewQueue from './ReviewQueue.vue';
import ImageLightbox from './ImageLightbox.vue';
import adminforth from '@/adminforth';
import { useI18n } from 'vue-i18n';
import { AdminUser, type AdminForthResourceCommon } from '@/types/Common';
import { useCoreStore } from '@/stores/core';
import { useFiltersStore } from '@/stores/filters';
import { PROMPT_CATEGORY, isRegenerating, recordError, type GenerationAction, type PromptCategory, type RecordState } from './reviewModel';

const DURATION_RE = /\b\d+\.\d+s\b/g;
const RETRY_IN_RE = /Please retry in [\d.]+s\.?/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

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

type Prompts = Record<PromptCategory, Record<string, string>>;

const recordIds = ref<Array<string | number>>([]);
const recordsById = new Map<string, RecordState>();

defineExpose({
  click
});

const confirmDialog = ref<any>(null);
const primaryKey = props.meta.primaryKey;
const promptsStorageKey = `bulkAiFlowGenerationPrompts_${props.meta.pluginInstanceId}`;
const defaultPrompts: Prompts = {
  imageFieldsPrompts: props.meta.generationPrompts.imageFieldsPrompts,
  plainFieldsPrompts: props.meta.generationPrompts.plainFieldsPrompts,
  generateImages: props.meta.generationPrompts.imageGenerationPrompts,
};
const isLoading = ref(false);
const isFetchingRecords = ref(false);
const isError = ref(false);
const errorMessage = ref('');
const isDialogOpen = ref(false);
const popupMode = ref<'generation' | 'confirmation'>('confirmation');
// prompts kept in this browser (the plugin config for the ones never saved) and the ones on the screen
const savedPrompts = ref<Prompts>(promptsWithSaved({}));
const generationPrompts = ref<Prompts>(promptsWithSaved({}));
const overwriteExistingValues = ref<boolean>(false);
const zoomedImage = ref<string | null>(null);

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
const generationFailureGroups = new Map<string, {
  actionType: GenerationAction;
  error: string;
  recordIds: Set<string>;
}>();
const recordsList = computed(() => {
  const ids = isGenerationCancelled.value
    ? recordIds.value.filter(id => completedRecordIds.value.has(String(id)))
    : recordIds.value;
  return ids.map(id => getOrCreateRecord(id));
});
const processedCount = computed(() => recordsList.value.filter(record => record.status === 'completed' || record.status === 'failed').length);
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
const isProcessingAny = computed(() => recordsList.value.some(record => record.status === 'processing'));
const checkedCount = computed(() => recordsList.value.filter(record => record.isChecked).length);
const checkedProcessedCount = computed(() => recordsList.value.filter(record => record.isChecked && completedRecordIds.value.has(String(record.id))).length);

const confirmationModeButtons = computed(() => [
  {
    label: t('Cancel'),
    options: { variant: 'secondary' },
    onclick: (dialog) => dialog.hide(true),
  },
  {
    label: t('Generate for {count} record | Generate for {count} records', totalRecords.value),
    options: {
      disabled: isFetchingRecords.value || isCheckingRateLimits.value || totalRecords.value < 1,
      loader: isCheckingRateLimits.value,
    },
    onclick: async () => { await runAiActions(); },
  },
]);

const generationModeButtons = computed(() => [
  {
    label: t('Cancel'),
    options: { variant: 'secondary' },
    onclick: (dialog) => dialog.hide(true),
  },
  ...(isProcessingAny.value ? [{
    label: t('Save processed ({count})', { count: checkedProcessedCount.value }),
    options: {
      variant: 'secondary',
      disabled: isLoading.value || isSavingCurrent.value || checkedProcessedCount.value < 1,
      loader: isSavingCurrent.value,
    },
    onclick: async () => { await saveCurrentGenerated(); },
  }] : []),
  {
    label: t('Save {count} record | Save {count} records', checkedCount.value),
    options: {
      disabled: isLoading.value || checkedCount.value < 1 || isFetchingRecords.value || isProcessingAny.value || isGenerationPaused.value,
      loader: isLoading.value,
    },
    onclick: async (dialog) => { await saveData(); closeDialog(); dialog.hide(false); },
  },
]);

async function regenerateRecord({ recordId }: { recordId: string | number }) {

  const promises = [];

  if (props.meta.isImageGeneration) {
    promises.push(regenerateImages({ recordId }));
  }

  for (const fieldName of [...props.meta.outputFieldsForAnalizeFromImages, ...props.meta.outputPlainFields]) {
    promises.push(
      regenerateCell({
        recordId,
        fieldName,
      })
    );
  }

  await Promise.allSettled(promises);
}

const isSavingCurrent = ref(false);
function checkIfDialogOpen() {
  return isDialogOpen.value === true;
}

const openDialog = async () => {
  popupMode.value = props.meta.askConfirmationBeforeGenerating ? 'confirmation' : 'generation';
  loadGenerationPrompts();
  isDialogOpen.value = true;
  confirmDialog.value.open();
  isFetchingRecords.value = true;
  await initializeGlobalState();
  isFetchingRecords.value = false;
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
      dangerous: true,
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
  const { ok, sessionIds } = await checkRateLimits();
  if (!ok || !sessionIds) {
    closeDialog();
    confirmDialog.value.close();
    return;
  }
  // from here a page reload loses the generated values and the generation in progress
  window.addEventListener('beforeunload', beforeUnloadHandler);
  popupMode.value = 'generation';
  isGenerationCancelled.value = false;
  isGenerationPaused.value = false;
  isActiveGeneration.value = true;
  completedRecordIds.value = new Set();
  startedRecordCount.value = 0;
  generationFailureGroups.clear();
  const limit = pLimit(props.meta.concurrencyLimit || 10);
  const tasks = recordIds.value
    .map(id => limit(() => processOneRecord(String(id), sessionIds)));
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
  if (isGenerationPaused.value || isGenerationCancelled.value) {
    resolvePause();
  }
}

async function initializeGlobalState() {
  const ids = await getListOfIds();
  recordsById.clear();
  recordIds.value = ids;
}

function resetGlobalState() {
  recordIds.value = [];
  recordsById.clear();
  generationFailureGroups.clear();
}

function getActionLabel(actionType: GenerationAction) {
  return actionType.replace('_', ' ');
}

function getGenerationFailureGroupKey(actionType: GenerationAction, error: string) {
  const normalizedError = error
    .replace(RETRY_IN_RE, 'Please retry later.')
    .replace(DURATION_RE, '<duration>')
    .replace(UUID_RE, '<uuid>');
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

// records are reactive, so the review rerenders on every result, edit and checkbox
function getOrCreateRecord(recordId: string | number): RecordState {
  const key = String(recordId);
  let record = recordsById.get(key);
  if (!record) {
    record = reactive(createEmptyRecord(recordId)) as RecordState;
    recordsById.set(key, record);
  }
  return record;
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

function cancelGeneration() {
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

function createEmptyRecord(recordId: string | number): RecordState {
  return {
    id: recordId,
    status: 'pending',
    isChecked: true,
    label: '',
    data: {},
    oldData: {},
    oldImagePreviews: {},
    images: [],
    aiStatus: {
      generatedImages: !props.meta.isImageGeneration,
      analyzedImages: !props.meta.isFieldsForAnalizeFromImages,
      analyzedNoImages: !props.meta.isFieldsForAnalizePlain,
    },
    imageGenerationErrorMessage: '',
    imageGenerationFailed: false,
    imageToTextErrorMessages: {},
    textToTextErrorMessages: {},
    regeneratingFieldsStatus: {},
    listOfImageNotGenerated: {},
  };
}

// a regeneration can fix the last error of a record or add a new one
function settleRecordStatus(record: RecordState) {
  if (!isRegenerating(record)) {
    record.status = recordError(record) ? 'failed' : 'completed';
  }
}

async function processOneRecord(recordId: string, sessionIds: string[]) {
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
  if (!record.isChecked) {
    return;
  }
  record.status = 'processing';
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
    return;
  }
  record.label = oldDataResult.record._label || record.label;
  record.oldImagePreviews = oldDataResult.imagePreviews;
  initializeRecordData(record, oldDataResult.record);
  if (props.meta.isAttachFiles) {
    await fetchImages(record, recordId);
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

  const results = await Promise.allSettled(actions.map(actionType => runActionForRecord(record, actionType, sessionIds)));
  if (!checkIfDialogOpen()) {
    return;
  }
  const hasError = results.some(result => result.status === 'rejected');
  record.status = hasError ? 'failed' : 'completed';
  completedRecordIds.value.add(String(recordId));
}

async function checkRateLimits(actions?: GenerationAction[]): Promise<{ ok: boolean; sessionIds?: string[] }> {
  let sessionIds: string[] = [];
  isCheckingRateLimits.value = true;
  const actionsToCheck: GenerationAction[] = [];
  if (actions) {
    actionsToCheck.push(...actions);
  } else {
    if (props.meta.isImageGeneration) {
      actionsToCheck.push('generate_images');
    }
    if (props.meta.isFieldsForAnalizeFromImages) {
      actionsToCheck.push('analyze');
    }
    if (props.meta.isFieldsForAnalizePlain) {
      actionsToCheck.push('analyze_no_images');
    }
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
        isCheckingRateLimits.value = false;
        return { ok: false };
      }
      sessionIds.push(rateLimitRes.sessionId);
    } catch (e) {
      adminforth.alert({
        message: t(`Error checking rate limit for "${getActionLabel(actionType)}" action.`),
        variant: 'danger',
        timeout: 'unlimited',
      });
      isCheckingRateLimits.value = false;
      return { ok: false };
    }
  }
  isCheckingRateLimits.value = false;
  return { ok: true, sessionIds };
}

async function runActionForRecord(record: RecordState, actionType: GenerationAction, sessionIds: string[], forceFilterFilledFields?: boolean) {
  if (!checkIfDialogOpen()) {
    return;
  }
  const responseFlag = actionType === 'generate_images'
    ? 'generatedImages'
    : actionType === 'analyze'
      ? 'analyzedImages'
      : 'analyzedNoImages';
  record.aiStatus[responseFlag] = false;

  let createJobResponse;
  try {
    createJobResponse = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
      method: 'POST',
      body: {
        actionType,
        recordId: record.id,
        customPrompt: JSON.stringify(generationPrompts.value[PROMPT_CATEGORY[actionType]]),
        filterFilledFields: forceFilterFilledFields !== undefined ? forceFilterFilledFields: !overwriteExistingValues.value,
        sessionIds
      },
      silentError: true,
    });
  } catch (e) {
    record.aiStatus[responseFlag] = true;
    applyJobFailure(record, actionType, e instanceof Error ? e.message : String(e));
    throw e;
  }

  if (!checkIfDialogOpen()) {
    return;
  }

  if (createJobResponse?.error || !createJobResponse?.jobId) {
    record.aiStatus[responseFlag] = true;
    applyJobFailure(record, actionType, createJobResponse?.error || `Failed to ${getActionLabel(actionType)}. Please, try to re-run the action.`);
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
    // a failed job comes back as { ok: false, error }
    if (jobResponse.error) {
      record.aiStatus[responseFlag] = true;
      applyJobFailure(record, actionType, jobResponse.error);
      throw new Error(jobResponse.error);
    }
    if (jobResponse.job.status === 'in_progress') {
      await waitForRefresh(actionType);
      continue;
    }
    applyJobResult(record, jobResponse.job, actionType);
    record.aiStatus[responseFlag] = true;
    isInProgress = false;
  }
}

function applyJobResult(record: RecordState, job: any, actionType: GenerationAction) {
  if (actionType === 'generate_images') {
    for (const fieldName of props.meta.outputImageFields) {
      const resultValue = job.result[fieldName];
      if (resultValue !== undefined) {
        record.data[fieldName] = resultValue;
      }
      const imageMeta = job.recordMeta?.[`${fieldName}_meta`];
      if (imageMeta) {
        record.listOfImageNotGenerated[fieldName] = imageMeta;
      } else {
        delete record.listOfImageNotGenerated[fieldName];
      }
    }
  } else {
    record.data = {
      ...record.data,
      ...job.result,
    };
  }
}

function applyJobFailure(record: RecordState, actionType: GenerationAction, error: string) {
  registerGenerationFailure(record, actionType, error);
  if (actionType === 'generate_images') {
    record.imageGenerationFailed = true;
    record.imageGenerationErrorMessage = error;
    return;
  }
  const [fields, messages] = actionType === 'analyze'
    ? [props.meta.outputFieldsForAnalizeFromImages, record.imageToTextErrorMessages]
    : [props.meta.outputPlainFields, record.textToTextErrorMessages];
  for (const field of fields) {
    messages[field] = error;
  }
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

async function fetchOldData(recordId: string): Promise<{ record: Record<string, any>, imagePreviews: Record<string, string | null> } | null> {
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
    return res;
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
  for (const key of props.meta.outputFields) {
    const normalizedValue = normalizeEnumValue(key, oldRecord[key] ?? null);
    newData[key] = normalizedValue;
    newOldData[key] = normalizedValue;
  }
  newData[primaryKey] = oldRecord[primaryKey] ?? record.id;
  newOldData[primaryKey] = oldRecord[primaryKey] ?? record.id;
  newOldData._label = oldRecord._label;
  record.data = newData;
  record.oldData = newOldData;
}

function normalizeEnumValue(key: string, value: any) {
  const colEnum = props.meta.columnEnums?.find(c => c.name === key);
  if (!colEnum) {
    return value;
  }
  const match = colEnum.enum.find(item => item.value === value);
  return match ? value : null;
}

async function fetchImages(record: RecordState, recordId: string) {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_images`,
      method: 'POST',
      body: { recordId },
    });
    record.images = res.images || [];
  } catch (error) {
    console.error('Failed to get images:', error);
    isError.value = true;
    errorMessage.value = t(`Failed to fetch images. Please, try to re-run the action.`);
  }
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
      if (props.meta.outputImageFields.includes(key)) {
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
      if (props.meta.outputImageFields.includes(key)) {
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
    const [reqData, checkedRecords] = await prepareDataForRecords(recordsList.value.filter(record => record.isChecked));
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
      xhr.addEventListener('loadend', () => {
        resolve(xhr.readyState === 4 && xhr.status === 200);
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
      message: t('Sorry but the file was not be uploaded. Please try again.'),
      variant: 'danger'
    });

    isError.value = true;
    errorMessage.value = t('Failed to upload images. Please, try to re-run the action.');
    return null;
  }
}

async function regenerateImages({ recordId }: { recordId: string | number }) {
  const {ok, sessionIds} = await checkRateLimits(['generate_images']);
  if (!ok || !sessionIds) {
    return;
  }
  if (coreStore.isInternetError) {
    adminforth.alert({
      message: t('Cannot regenerate images while internet connection is lost. Please check your connection and try again.'),
      variant: 'danger',
      timeout: 'unlimited',
    });
    return;
  }
  const record = recordsById.get(String(recordId))!;
  record.status = 'processing';
  record.imageGenerationFailed = false;
  record.imageGenerationErrorMessage = '';

  try {
    await runActionForRecord(
      record,
      'generate_images',
      sessionIds,
      false
    );
  } catch {
    // the error is already shown on the image fields of the record
  } finally {
    settleRecordStatus(record);
  }
}

function click() {
  openDialog();
}

// a saved prompt is kept in this browser, only the ones which differ from the plugin config are stored
function savePrompt(category: PromptCategory, field: string) {
  savedPrompts.value[category][field] = generationPrompts.value[category][field];
  const changedPrompts = Object.fromEntries(
    Object.entries(savedPrompts.value)
      .map(([category, prompts]) => [
        category,
        Object.fromEntries(Object.entries(prompts).filter(([field, prompt]) => prompt !== defaultPrompts[category][field])),
      ])
      .filter(([, prompts]) => Object.keys(prompts).length > 0),
  );
  localStorage.setItem(promptsStorageKey, JSON.stringify(changedPrompts));
}

// fields which were removed from the plugin config drop out of the saved prompts, new fields get their defaults
function promptsWithSaved(saved: Partial<Prompts>): Prompts {
  return Object.fromEntries(
    Object.entries(defaultPrompts).map(([category, prompts]) => [
      category,
      Object.fromEntries(Object.entries(prompts).map(([field, prompt]) => [field, saved[category]?.[field] ?? prompt])),
    ]),
  ) as Prompts;
}

// only a user who sees the setup screen can edit prompts, so only then the saved ones apply
function loadGenerationPrompts() {
  const saved = props.meta.askConfirmationBeforeGenerating
    ? JSON.parse(localStorage.getItem(promptsStorageKey) || '{}')
    : {};
  savedPrompts.value = promptsWithSaved(saved);
  generationPrompts.value = promptsWithSaved(saved);
}

async function regenerateCell({ recordId, fieldName }: { recordId: string | number, fieldName: string }) {
  if (coreStore.isInternetError) {
    adminforth.alert({
      message: t('Cannot regenerate column while internet connection is lost. Please check your connection and try again.'),
      variant: 'danger',
      timeout: 'unlimited',
    });
    return;
  }

  const actionType: GenerationAction = props.meta.outputFieldsForAnalizeFromImages.includes(fieldName) ? 'analyze' : 'analyze_no_images';
  const { ok, sessionIds } = await checkRateLimits([actionType]);
  if (!ok || !sessionIds) {
    return;
  }

  const record = recordsById.get(String(recordId))!;
  const errorMessages = actionType === 'analyze' ? record.imageToTextErrorMessages : record.textToTextErrorMessages;
  const refreshRate = actionType === 'analyze' ? props.meta.refreshRates.fillFieldsFromImages : props.meta.refreshRates.fillPlainFields;
  record.regeneratingFieldsStatus[fieldName] = true;

  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
      method: 'POST',
      body: {
        fieldToRegenerate: fieldName,
        recordId,
        action: actionType,
        actionType: "regenerate_cell",
        prompt: generationPrompts.value[PROMPT_CATEGORY[actionType]][fieldName] || null,
        sessionIds
      },
      silentError: true,
    });
    if (res.ok === false) {
      adminforth.alert({
        message: res.error,
        variant: 'danger',
      });
      isError.value = true;
      errorMessage.value = t(`Failed to regenerate field`);
      return;
    }

    let jobResponse;
    do {
      await new Promise(resolve => setTimeout(resolve, refreshRate));
      jobResponse = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/get-job-status`,
        method: 'POST',
        body: { jobId: res.jobId },
        silentError: true,
      });
    } while (jobResponse?.job?.status === 'in_progress');

    // a failed job comes back as { ok: false, error }
    if (!jobResponse?.ok) {
      const error = jobResponse?.error || t('Unknown error');
      adminforth.alert({
        message: t(`Regeneration action failed for record: ${recordId}. Error: ${error}`),
        variant: 'danger',
        timeout: 'unlimited',
      });
      errorMessages[fieldName] = error;
      return;
    }
    record.data = {
      ...record.data,
      ...jobResponse.job.result,
    };
    delete errorMessages[fieldName];
  } catch (e) {
    console.error(`Error during cell regeneration for record ${recordId}, field ${fieldName}:`, e);
  } finally {
    record.regeneratingFieldsStatus[fieldName] = false;
    settleRecordStatus(record);
  }
}

const beforeUnloadHandler = (event) => {
  event.preventDefault();
  event.returnValue = '';
};

async function saveCurrentGenerated() {
  const errorText = 'Failed to save some records. Not all data may be saved';
  const recordsToSave = recordsList.value.filter(record => record.isChecked && completedRecordIds.value.has(String(record.id)));
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
      for (const id of savedIds) {
        recordsById.delete(id);
        completedRecordIds.value.delete(id);
      }
      adminforth.alert({
        message: t('Successfully saved generated data for {count} records', { count: savedIds.length }),
        variant: 'success',
      });
    }
    if (recordIds.value.length === 0) {
      closeDialog();
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
  props.updateList();
}

</script>
