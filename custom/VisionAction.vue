<template>
  <div class="flex items-end justify-start gap-2 cursor-pointer">
    <div class="flex items-center justify-center text-white bg-gradient-to-r h-[18px] from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 font-medium rounded-md text-sm px-1 text-center">
      AI
    </div>
    <p class="text-justify max-h-[18px] truncate max-w-[60vw] md:max-w-none">{{ props.meta.actionName }}</p>
  </div>
  <Dialog 
    ref="confirmDialog"
    header="Bulk AI Flow"
    class="[scrollbar-gutter:stable] !max-w-full w-fit h-fit"
    :class="popupMode === 'generation' ? 'lg:w-[1600px] !lg:max-w-[1600px]' 
      : popupMode === 'settings' ? 'lg:w-[1000px] !lg:max-w-[1000px]' 
        : 'lg:w-[500px] !lg:max-w-[500px]'"
    :beforeCloseFunction="closeDialog"
    :closable="false"
    :askForCloseConfirmation="popupMode === 'generation' ? true : false"
    closeConfirmationText="Are you sure you want to close without saving?"
    :buttons="popupMode === 'generation' ? [
        { 
          label: checkedCount > 1 ? 'Save fields' : 'Save field', 
          options: { 
            disabled: isLoading || checkedCount < 1 || isCriticalError || isFetchingRecords || isGeneratingImages || isAnalizingFields || isAnalizingImages, 
            loader: isLoading, class: 'w-fit' 
          }, 
          onclick: async (dialog) => { await saveData(); dialog.hide(); } 
        },
        { 
          label: 'Cancel', 
          options: {
            class: 'bg-white hover:!bg-gray-100 !text-gray-900 hover:!text-gray-800 dark:!bg-gray-800 dark:!text-gray-100 dark:hover:!bg-gray-700 !border-gray-200'
          }, 
          onclick: (dialog) => confirmDialog.tryToHideModal() 
        },
      ] : popupMode === 'settings' ? [
          {
            label: 'Save settings',
            options: {
              class: 'w-fit'
            },
            onclick: (dialog) => { saveSettings(); }
          },
        ] : 
          [
            {
              label: 'Edit prompts',
              options: {
                class: 'w-fit ml-auto'
              },
              onclick: (dialog) => { clickSettingsButton(); }
            },
          ]"
    :click-to-close-outside="false"
  >
    <div class="[scrollbar-gutter:stable] bulk-vision-table flex flex-col items-center max-w-[1560px] md:max-h-[75vh] gap-3 md:gap-4 w-full h-full overflow-y-auto">
      <div v-if="records && props.checkboxes.length && popupMode === 'generation'" class="w-full overflow-x-auto">
        <VisionTable
          :checkbox="props.checkboxes"
          :records="records"
          :meta="props.meta"
          :images="images"
          :tableHeaders="tableHeaders"
          :tableColumns="tableColumns"
          :customFieldNames="customFieldNames"
          :tableColumnsIndexes="tableColumnsIndexes"
          :selected="selected"
          :oldData="oldData"
          :isAiResponseReceivedAnalizeImage="isAiResponseReceivedAnalizeImage"
          :isAiResponseReceivedAnalizeNoImage="isAiResponseReceivedAnalizeNoImage"
          :isAiResponseReceivedImage="isAiResponseReceivedImage"
          :primaryKey="primaryKey"
          :openGenerationCarousel="openGenerationCarousel"
          :openImageCompare="openImageCompare"
          @error="handleTableError"
          :carouselSaveImages="carouselSaveImages"
          :carouselImageIndex="carouselImageIndex"
          :regenerateImagesRefreshRate="props.meta.refreshRates?.regenerateImages"
          :isAiGenerationError="isAiGenerationError"
          :aiGenerationErrorMessage="aiGenerationErrorMessage"
          :isAiImageGenerationError="isAiImageGenerationError"
          :imageGenerationErrorMessage="imageGenerationErrorMessage"
          @regenerate-images="regenerateImages"
          :isImageHasPreviewUrl="isImageHasPreviewUrl"
          :imageGenerationPrompts="generationPrompts.generateImages"
          :isImageToTextGenerationError="isImageToTextGenerationError"
          :imageToTextErrorMessages="imageToTextErrorMessages"
          :isTextToTextGenerationError="isTextToTextGenerationError"
          :textToTextErrorMessages="textToTextErrorMessages"
          :outputImageFields="props.meta.outputImageFields"
          :outputFieldsForAnalizeFromImages="props.meta.outputFieldsForAnalizeFromImages"
          :outputPlainFields="props.meta.outputPlainFields"
          :regeneratingFieldsStatus="regeneratingFieldsStatus"
          @regenerate-cell="regenerateCell"
        />
        <div class="text-red-600 flex items-center w-full">
          <p v-if="isError === true">{{ errorMessage }}</p>
        </div>
      </div>
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
              {{ formatLabel(promptKey) }} prompt:
              <Textarea 
                v-model="generationPrompts[key][promptKey]" 
                class="w-full h-64 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              ></Textarea>
              <p class="text-red-500 hover:underline hover:cursor-pointer mt-2" @click="resetPromptToDefault(key, promptKey)">reset to default</p>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="flex flex-col gap-2">
        <Button @click="runAiActions" class="px-5 py-2.5 my-20 bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 rounded-md text-white border-none">
          Start generation
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { Ref, ref, watch } from 'vue'
import { Dialog, Button, Textarea } from '@/afcl';
import VisionTable from './VisionTable.vue'
import adminforth from '@/adminforth';
import { useI18n } from 'vue-i18n';
import { AdminUser, type AdminForthResourceCommon } from '@/types/Common';
import { useCoreStore } from '@/stores/core';

const coreStore = useCoreStore();

const { t } = useI18n();
const props = defineProps<{
  checkboxes: any,
  meta: any,
  resource: AdminForthResourceCommon,
  adminUser: AdminUser,
  updateList: {
    type: Function,
    required: true
  },
  clearCheckboxes: {
    type: Function
  }
}>();

defineExpose({
  click
});

const confirmDialog = ref(null);
const records = ref<any[]>([]);
const images = ref<any[]>([]);
const tableHeaders = ref([]);
const tableColumns = ref([]);
const tableColumnsIndexes = ref([]);
const customFieldNames = ref([]);
const selected = ref<any[]>([]);
const oldData = ref<any[]>([]);
const carouselSaveImages = ref<any[]>([]);
const carouselImageIndex = ref<any[]>([]);
const isAiResponseReceivedAnalizeImage = ref([]);
const isAiResponseReceivedAnalizeNoImage = ref([]);
const isAiResponseReceivedImage = ref([]);
const primaryKey = props.meta.primaryKey;
const openGenerationCarousel = ref([]);
const openImageCompare = ref([]);
const isLoading = ref(false);
const isFetchingRecords = ref(false);
const isError = ref(false);
const isCriticalError = ref(false);
const isImageGenerationError = ref(false);
const errorMessage = ref('');
const checkedCount = ref(0);
const isGeneratingImages = ref(false);
const isAnalizingFields = ref(false);
const isAnalizingImages = ref(false);
const isDialogOpen = ref(false);
const isAiGenerationError = ref<boolean[]>([false]);
const aiGenerationErrorMessage = ref<string[]>([]);
const isAiImageGenerationError = ref<boolean[]>([false]);

const isImageToTextGenerationError = ref<boolean[]>([false]);
const imageToTextErrorMessages = ref<string[]>([]);

const isTextToTextGenerationError = ref<boolean[]>([false]);
const textToTextErrorMessages = ref<string[]>([]);

const imageGenerationErrorMessage = ref<string[]>([]);
const isImageHasPreviewUrl = ref<Record<string, boolean>>({});
const popupMode = ref<'generation' | 'confirmation' | 'settings'>('confirmation');
const generationPrompts = ref<any>({});
const isDataSaved = ref(false);

const regeneratingFieldsStatus = ref<Record<string, Record<string, boolean>>>({});

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
  await getRecords();
  if (props.meta.isAttachFiles) {
    await getImages();
  }
  await findPreviewURLForImages();
  tableHeaders.value = generateTableHeaders(props.meta.outputFields);
  const result = generateTableColumns();
  tableColumns.value = result.tableData;
  tableColumnsIndexes.value = result.indexes;
  customFieldNames.value = tableHeaders.value.slice((props.meta.isAttachFiles) ? 3 : 2).map(h => h.fieldName);
  setSelected();
  if (props.meta.isImageGeneration) {
    fillCarouselSaveImages();
  }
  for (let i = 0; i < selected.value?.length; i++) {
    openGenerationCarousel.value[i] = props.meta.outputImageFields?.reduce((acc,key) =>{
      acc[key] = false;
      return acc;
    },{[primaryKey]: records.value[i][primaryKey]} as Record<string, boolean>);
    openImageCompare.value[i] = props.meta.outputImageFields?.reduce((acc,key) =>{
      acc[key] = false;
      return acc;
    },{[primaryKey]: records.value[i][primaryKey]} as Record<string, boolean>);
  }
  isFetchingRecords.value = false;
  // Ensure prompts are loaded before any automatic AI action run
  if (!generationPrompts.value || Object.keys(generationPrompts.value).length === 0) {
    await getGenerationPrompts();
  }
  if (!props.meta.askConfirmationBeforeGenerating) {
    runAiActions();
  }
}
 

function runAiActions() {
  popupMode.value = 'generation';

  if (props.meta.isImageGeneration) {
    isGeneratingImages.value = true;
    runAiAction({
      endpoint: 'initial_image_generate',
      actionType: 'generate_images',
      responseFlag: isAiResponseReceivedImage,
    });
  }
  if (props.meta.isFieldsForAnalizeFromImages) {
    isAnalizingImages.value = true;
    runAiAction({
      endpoint: 'analyze',
      actionType: 'analyze',
      responseFlag: isAiResponseReceivedAnalizeImage,
    });
  }
  if (props.meta.isFieldsForAnalizePlain) {
    isAnalizingFields.value = true;
    runAiAction({
      endpoint: 'analyze_no_images',
      actionType: 'analyze_no_images',
      responseFlag: isAiResponseReceivedAnalizeNoImage,
    });
  }
}

const closeDialog = () => {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  isAiResponseReceivedAnalizeImage.value = [];
  isAiResponseReceivedAnalizeNoImage.value = [];
  isAiResponseReceivedImage.value = [];

  records.value = [];
  images.value = [];
  selected.value = [];
  tableColumns.value = [];
  tableColumnsIndexes.value = [];
  isError.value = false;
  isCriticalError.value = false;
  isImageGenerationError.value = false;
  errorMessage.value = '';
  isDialogOpen.value = false;
  popupMode.value = 'confirmation';
  isDataSaved.value = false;
}

watch(selected, (val) => {
  checkedCount.value = val.filter(item => item.isChecked === true).length;
}, { deep: true });

function fillCarouselSaveImages() {
  for (const item of selected.value) {
    const tempItem: any = {};
    const tempItemIndex: any = {};
    for (const [key, value] of Object.entries(item)) {
      if (props.meta.outputImageFields?.includes(key)) {
        tempItem[key] = [];
        tempItemIndex[key] = 0;
      }
    }
    carouselSaveImages.value.push(tempItem);
    carouselImageIndex.value.push(tempItemIndex);
  }
}


function formatLabel(str) {
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

function generateTableColumns() {
  const fields = [];
  const tableData = [];
  const indexes = [];
  for (const field of tableHeaders.value) {
    fields.push( field.fieldName );
  }
  for (const [index, checkbox] of props.checkboxes.entries()) {
    const record = records.value[index];
    let reqFields: any = {};
    for (const field of fields) {
      reqFields[field] = record[field] || '';
    }
    reqFields.label = record._label;
    reqFields.images = images.value[index];
    reqFields[primaryKey] = record[primaryKey];
    indexes.push({
      [primaryKey]: record[primaryKey],
      label: record._label,
    });
    tableData.push(reqFields);
  }
  return { tableData, indexes };
}

function setSelected() {
  selected.value = records.value.map(() => ({}));
  records.value.forEach((record, index) => {
    for (const key in props.meta.outputFields) {
      if (isInColumnEnum(key)) {
        const colEnum = props.meta.columnEnums.find(c => c.name === key);
        const object = colEnum.enum.find(item => item.value === record[key]);
        selected.value[index][key] = object ? record[key] : null;
      } else {
        selected.value[index][key] = record[key];
      }
    }
    selected.value[index].isChecked = true;
    selected.value[index][primaryKey] = record[primaryKey];
    oldData.value[index] = { ...selected.value[index] };
  });
}

function isInColumnEnum(key: string): boolean {
  const colEnum = props.meta.columnEnums?.find(c => c.name === key);
  if (!colEnum) {
    return false;
  }
  return true;
}

function handleTableError(errorData) {
  isError.value = errorData.isError;
  errorMessage.value = errorData.errorMessage;
}

async function getRecords() {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_records`,
      method: 'POST',
      body: {
        record: props.checkboxes,
      },
    });
    records.value = res.records;
  } catch (error) {
    console.error('Failed to get records:', error);
    isError.value = true;
    errorMessage.value = t(`Failed to fetch records. Please, try to re-run the action.`);
  }
}

async function getImages() {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_images`,
      method: 'POST',
      body: {
        record: records.value,
      },
    });
    images.value = res.images;
  } catch (error) {
    console.error('Failed to get images:', error);
    isError.value = true;
    errorMessage.value = t(`Failed to fetch images. Please, try to re-run the action.`);
  }
}

async function prepareDataForSave() {
  const checkedItems = selected.value
    .filter(item => item.isChecked === true)
    .map(item => {
      const { isChecked, primaryKey, ...itemWithoutIsCheckedAndId } = item;
      return itemWithoutIsCheckedAndId;
    });
  const checkedItemsIDs = selected.value
    .filter(item => item.isChecked === true)
    .map(item => item[primaryKey]);

  if (isImageGenerationError.value !== true) {
    const promises = [];
    for (const item of checkedItems) {
      for (const [key, value] of Object.entries(item)) {
        if(props.meta.outputImageFields?.includes(key)) {
          const p = convertImages(key, value).then(result => {
            item[key] = result;
          });
        
          promises.push(p);
        }
      }
    }
    await Promise.all(promises);
  }
  return [checkedItemsIDs, checkedItems];
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
  if (!selected.value?.length) {
    adminforth.alert({ message: t('No items selected'), variant: 'warning' });
    return;
  }
  try {
    isLoading.value = true;
    const [checkedItemsIDs, reqData] = await prepareDataForSave();
    if (isImageGenerationError.value === false) {
      const imagesToUpload = [];
      for (const item of reqData) {
        for (const [key, value] of Object.entries(item)) {
          if(props.meta.outputImageFields?.includes(key)) {
            if (!value) {
              continue;
            }
            const p = uploadImage(value, item[primaryKey], key).then(result => {
              item[key] = result;
            });
            imagesToUpload.push(p);
          }
        }
      }
      await Promise.all(imagesToUpload);
    }

    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/update_fields`,
      method: 'POST',
      body: {
        selectedIds: checkedItemsIDs,
        fields: reqData,
        saveImages: !isImageGenerationError.value
      },
    });

    if(res.ok === true) {
      confirmDialog.value.close();
      props.updateList();
      props.clearCheckboxes();
    } else if (res.ok === false) {
      adminforth.alert({
        message: res.error,
        variant: 'danger',
        timeout: 'unlimited',
      });
      isError.value = true;
      errorMessage.value = t(`Failed to save data. You are not allowed to save.`);
    } else {
      console.error('Error saving data:', res);
      isError.value = true;
      errorMessage.value = t(`Failed to save data. Please, try to re-run the action.`);
    }
  } catch (error) {
    console.error('Error saving data:', error);
    isError.value = true;
    errorMessage.value = t(`Failed to save data. Please, try to re-run the action.`);
  } finally {
    isLoading.value = false;
    isDataSaved.value = true;
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }
}


async function runAiAction({
  endpoint,
  actionType,
  responseFlag,
  updateOnSuccess = true,
  recordsIds = props.checkboxes,
  disableRateLimitCheck = false,
}: {
  endpoint: string;
  actionType: 'analyze' | 'analyze_no_images' | 'generate_images';
  responseFlag: Ref<boolean[]>;
  updateOnSuccess?: boolean;
  recordsIds?: any[];
  disableRateLimitCheck?: boolean;
}) {
  let hasError = false;
  let errorMessage = '';
  const jobsIds: { jobId: any; recordId: any; }[] = [];
  // responseFlag.value = props.checkboxes.map(() => false);
  for (let i = 0; i < recordsIds.length; i++) {
    const index = props.checkboxes.findIndex(item => String(item) === String(recordsIds[i]));
    if (index !== -1) {
      responseFlag.value[index] = false;
    }
  }
  let isRateLimitExceeded = false;
  if (!disableRateLimitCheck){
    try {
      const rateLimitRes = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/update-rate-limits`,
        method: 'POST',
        body: {
          actionType: actionType,
        },
      });
      if (rateLimitRes?.error) {
        isRateLimitExceeded = true;
        adminforth.alert({
        message: t(`Rate limit exceeded for "${actionType.replace('_', ' ')}" action. Please try again later.`),
        variant: 'danger',
        timeout: 'unlimited',
      });
        return;
      }
    } catch (e) {
      adminforth.alert({
        message: t(`Error checking rate limit for "${actionType.replace('_', ' ')}" action.`),
        variant: 'danger',
        timeout: 'unlimited',
      });
      isRateLimitExceeded = true;
    }
    if (isRateLimitExceeded) {
      return;
    };
  }

  let customPrompt;
  if (actionType === 'generate_images') {
    customPrompt = generationPrompts.value.imageGenerationPrompts || generationPrompts.value.generateImages;
  } else if (actionType === 'analyze') {
    customPrompt = generationPrompts.value.imageFieldsPrompts;
  } else if (actionType === 'analyze_no_images') {
    customPrompt = generationPrompts.value.plainFieldsPrompts;
  }
  //creating jobs
  const tasks = recordsIds.map(async (checkbox, i) => {
    try {
      const res = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
        method: 'POST',
        body: {
          actionType: actionType,
          recordId: checkbox,
          ...(customPrompt !== undefined ? { customPrompt: JSON.stringify(customPrompt) } : {}),
        },
        silentError: true,
      });

      if (res?.error) {
        throw new Error(res.error);
      }
      
      if (!res) {
        throw new Error(`${actionType} request returned empty response.`);
      }

      jobsIds.push({ jobId: res.jobId, recordId: checkbox });
    } catch (e) {
      console.error(`Error during ${actionType} for item ${i}:`, e);
      hasError = true;
      errorMessage = t(`Failed to ${actionType.replace('_', ' ')}. Please, try to re-run the action.`);
      return { success: false, index: i, error: e };
    }
  });
  await Promise.all(tasks);

  //polling jobs
  let isInProgress = true;
  //if no jobs were created, skip polling
  while (isInProgress && isDialogOpen.value) {
    //check if at least one job is still in progress
    let isAtLeastOneInProgress = false;
    //checking status of each job
    for (const { jobId, recordId } of jobsIds) {
      //check job status
      const jobResponse = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/get-job-status`,
        method: 'POST',
        body: { jobId },
        silentError: true,
      });
      //check for errors
      if (!jobResponse) {
        isAtLeastOneInProgress = true;
        continue;
      }
      if (jobResponse?.error) {
        console.error(`Error during ${actionType}:`, jobResponse.error);
        break;
      };
      // extract job status
      let jobStatus = jobResponse?.job?.status;
      // check if job is still in progress. If in progress - skip to next job
      if (jobStatus === 'in_progress') {
        isAtLeastOneInProgress = true;
      //if job is completed - update record data
      } else if (jobStatus === 'completed') {
        // finding index of the record in selected array
        const index = selected.value.findIndex(item => String(item[primaryKey]) === String(recordId));
        //if we are generating images - update carouselSaveImages with new image
        if (actionType === 'generate_images') {
          for (const [key, value] of Object.entries(carouselSaveImages.value[index])) {
            if (props.meta.outputImageFields?.includes(key)) {
              carouselSaveImages.value[index][key] = [jobResponse.job.result[key]];
            }
          }
        }
        //marking that we received response for this record
        //if (actionType !== 'analyze_no_images' || !props.meta.isFieldsForAnalizeFromImages) {
          responseFlag.value[index] = true;
        //}
        //updating selected with new data from AI
        const pk = selected.value[index]?.[primaryKey];
        if (pk) {
          selected.value[index] = {
            ...selected.value[index],
            ...jobResponse.job.result,
            isChecked: true,
            [primaryKey]: pk,
          };
        }
        //removing job from jobsIds
        if (index !== -1) {
          jobsIds.splice(jobsIds.findIndex(j => j.jobId === jobId), 1);
        }
        // checking one more time if we have in progress jobs
        isAtLeastOneInProgress = true;
        // if job is failed - set error
      } else if (jobStatus === 'failed') {
        const index = selected.value.findIndex(item => String(item[primaryKey]) === String(recordId));
        //if (actionType !== 'analyze_no_images' || !props.meta.isFieldsForAnalizeFromImages) {
          responseFlag.value[index] = true;
        //}
        if (index !== -1) {
          jobsIds.splice(jobsIds.findIndex(j => j.jobId === jobId), 1);
        } else {
          jobsIds.splice(0, jobsIds.length);
        }
        isAtLeastOneInProgress = true;
        adminforth.alert({
          message: t(`Generation action "${actionType.replace('_', ' ')}" failed for record: ${recordId}. Error: ${jobResponse.job?.error || 'Unknown error'}`),
          variant: 'danger',
          timeout: 'unlimited',
        });
        if (actionType === 'generate_images') {
          isAiImageGenerationError.value[index] = true;
          imageGenerationErrorMessage.value[index] = jobResponse.job?.error || 'Unknown error';
        } else if (actionType === 'analyze') {
          isImageToTextGenerationError.value[index] = true;
          imageToTextErrorMessages.value[index] = jobResponse.job?.error || 'Unknown error';
        } else if (actionType === 'analyze_no_images') {
          isTextToTextGenerationError.value[index] = true;
          textToTextErrorMessages.value[index] = jobResponse.job?.error || 'Unknown error';
        }
      }
    }
    if (!isAtLeastOneInProgress) {
      isInProgress = false;
    }
    if (jobsIds.length > 0) {
      if (actionType === 'generate_images') {
        await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.generateImages));
      } else if (actionType === 'analyze') {
        await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.fillFieldsFromImages));
      } else if (actionType === 'analyze_no_images') {
        await new Promise(resolve => setTimeout(resolve, props.meta.refreshRates?.fillPlainFields));
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  if (hasError) {
    adminforth.alert({
      message: errorMessage,
      variant: 'danger',
      timeout: 'unlimited',
    });
    isError.value = true;
    if (actionType === 'generate_images') {
      isImageGenerationError.value = true;
    }
    this.errorMessage.value = errorMessage;
    return;
  }

  if (actionType === 'generate_images') {
    isGeneratingImages.value = false;
  } else if (actionType === 'analyze') {
    isAnalizingImages.value = false;
  } else if (actionType === 'analyze_no_images') {
    isAnalizingFields.value = false;
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

function regenerateImages(recordInfo: any) {
  if (coreStore.isInternetError) {
    adminforth.alert({
      message: t('Cannot regenerate images while internet connection is lost. Please check your connection and try again.'),
      variant: 'danger',
      timeout: 'unlimited',
    });
    return;
  }
  isGeneratingImages.value = true;
  runAiAction({
    endpoint: 'initial_image_generate',
    actionType: 'generate_images',
    responseFlag: isAiResponseReceivedImage,
    recordsIds: [recordInfo.recordInfo],
    disableRateLimitCheck: true,
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
  popupMode.value = 'confirmation';
  localStorage.setItem(`bulkAiFlowGenerationPrompts_${props.meta.pluginInstanceId}`, JSON.stringify(generationPrompts.value));
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
  if (categoryKey === 'generateImages') {
    generationPrompts.value[categoryKey][promptKey] = props.meta.generationPrompts.imageGenerationPrompts[promptKey].prompt;
    return;
  }
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
  if (!regeneratingFieldsStatus.value[recordInfo.recordId]) {
    regeneratingFieldsStatus.value[recordInfo.recordId] = {};
  }
  regeneratingFieldsStatus.value[recordInfo.recordId][recordInfo.fieldName] = true;
  const actionType = props.meta.outputFieldsForAnalizeFromImages?.includes(recordInfo.fieldName)
    ? 'analyze'
    : props.meta.outputPlainFields?.includes(recordInfo.fieldName)
      ? 'analyze_no_images'
      : null;
  if (!actionType) {
    console.error(`Field ${recordInfo.fieldName} is not configured for analysis.`);
    return;
  }
  
  let generationPromptsForField = {};
  if (actionType === 'analyze') {
    generationPromptsForField = generationPrompts.value.imageFieldsPrompts || {};
  } else if (actionType === 'analyze_no_images') {
    generationPromptsForField = generationPrompts.value.plainFieldsPrompts || {};
  }
  
  let res;
  try {
    res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/regenerate-cell`,
      method: 'POST',
      body: {
        fieldToRegenerate: recordInfo.fieldName,
        recordId: recordInfo.recordId,
        actionType: actionType,
        prompt: generationPromptsForField[recordInfo.fieldName] || null,
      },
      silentError: true,
    });
  } catch (e) {
    regeneratingFieldsStatus.value[recordInfo.recordId][recordInfo.fieldName] = false;
    console.error(`Error during cell regeneration for record ${recordInfo.recordId}, field ${recordInfo.fieldName}:`, e);
  }
  if ( res.ok === false) {
    adminforth.alert({
      message: res.error,
      variant: 'danger',
    });
    isError.value = true;
    errorMessage.value = t(`Failed to regenerate field`);
    regeneratingFieldsStatus.value[recordInfo.recordId][recordInfo.fieldName] = false;
    return;
  }
  const index = selected.value.findIndex(item => String(item[primaryKey]) === String(recordInfo.recordId));

  const pk = selected.value[index]?.[primaryKey];
  if (pk) {
    selected.value[index] = {
      ...selected.value[index],
      ...res.result,
      isChecked: true,
      [primaryKey]: pk,
    };
  }
  regeneratingFieldsStatus.value[recordInfo.recordId][recordInfo.fieldName] = false;
}

const beforeUnloadHandler = (event) => {
  if (isDataSaved.value) return;
  event.preventDefault();
  event.returnValue = '';
};

</script>