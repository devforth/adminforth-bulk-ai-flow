<template>
  <div class="flex items-end justify-start gap-2 cursor-pointer" @click="openDialog">
    <div class="flex items-center justify-center text-white bg-gradient-to-r h-[18px] from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 font-medium rounded-md text-sm px-1 text-center">
      AI
    </div>
    <p class="text-justify max-h-[18px] truncate max-w-[60vw] md:max-w-none">{{ props.meta.actionName }}</p>
  </div>
  <Dialog 
    ref="confirmDialog"
    header="Bulk AI Flow"
    class="!max-w-full w-full lg:w-[1600px] !lg:max-w-[1600px]"
    :beforeCloseFunction="closeDialog"
    :buttons="[
      { label: checkedCount > 1 ? 'Save fields' : 'Save field', options: { disabled: isLoading || checkedCount < 1 || isCriticalError || isFetchingRecords || isGeneratingImages || isAnalizingFields || isAnalizingImages, loader: isLoading, class: 'w-fit sm:w-40' }, onclick: (dialog) => { saveData(); dialog.hide(); } },
      { label: 'Cancel', onclick: (dialog) => dialog.hide() },
    ]"
  >
    <div class="bulk-vision-table flex flex-col items-center max-w-[1560px] md:max-h-[90vh] gap-3 md:gap-4 w-full h-full overflow-y-auto">
      <div v-if="records && props.checkboxes.length" class="w-full overflow-x-auto">
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
          :isAiResponseReceivedAnalize="isAiResponseReceivedAnalize"
          :isAiResponseReceivedImage="isAiResponseReceivedImage"
          :primaryKey="primaryKey"
          :openGenerationCarousel="openGenerationCarousel"
          @error="handleTableError"
          :carouselSaveImages="carouselSaveImages"
          :carouselImageIndex="carouselImageIndex"
          :regenerateImagesRefreshRate="props.meta.refreshRates?.regenerateImages"
        />
      </div>
      <div class="text-red-600 flex items-center w-full">
        <p v-if="isError === true">{{ errorMessage }}</p>
      </div>
    </div>
  </Dialog>
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { Ref, ref, watch } from 'vue'
import { Dialog, Button } from '@/afcl';
import VisionTable from './VisionTable.vue'
import adminforth from '@/adminforth';
import { useI18n } from 'vue-i18n';
import { AdminUser, type AdminForthResourceCommon } from '@/types';

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

const confirmDialog = ref(null);
const records = ref<any[]>([]);
const images = ref<any[]>([]);
const tableHeaders = ref([]);
const tableColumns = ref([]);
const tableColumnsIndexes = ref([]);
const customFieldNames = ref([]);
const selected = ref<any[]>([]);
const carouselSaveImages = ref<any[]>([]);
const carouselImageIndex = ref<any[]>([]);
const isAiResponseReceivedAnalize = ref([]);
const isAiResponseReceivedImage = ref([]);
const primaryKey = props.meta.primaryKey;
const openGenerationCarousel = ref([]);
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

const openDialog = async () => {
  isDialogOpen.value = true;
  confirmDialog.value.open();
  isFetchingRecords.value = true;
  await getRecords();
  if (props.meta.isAttachFiles) {
    await getImages();
  }
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
  }
  isFetchingRecords.value = false;
  
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
      responseFlag: isAiResponseReceivedAnalize,
    });
  }
  if (props.meta.isFieldsForAnalizePlain) {
    isAnalizingFields.value = true;
    runAiAction({
      endpoint: 'analyze_no_images',
      actionType: 'analyze_no_images',
      responseFlag: isAiResponseReceivedAnalize,
    });
  }
}
 
const closeDialog = () => {
  confirmDialog.value.close();
  isAiResponseReceivedAnalize.value = [];
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
}

watch(selected, (val) => {
  //console.log('Selected changed:', val);
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
    isAiResponseReceivedAnalize.value[index] = true;
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
    errorMessage.value = `Failed to fetch records. Please, try to re-run the action.`;
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
    errorMessage.value = `Failed to fetch images. Please, try to re-run the action.`;
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
    adminforth.alert({ message: 'No items selected', variant: 'warning' });
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
      errorMessage.value = `Failed to save data. You are not allowed to save.`;
    } else {
      console.error('Error saving data:', res);
      isError.value = true;
      errorMessage.value = `Failed to save data. Please, try to re-run the action.`;
    }
  } catch (error) {
    console.error('Error saving data:', error);
    isError.value = true;
    errorMessage.value = `Failed to save data. Please, try to re-run the action.`;
  } finally {
    isLoading.value = false;
  }
}


async function runAiAction({
  endpoint,
  actionType,
  responseFlag,
  updateOnSuccess = true,
}: {
  endpoint: string;
  actionType: 'analyze' | 'analyze_no_images' | 'generate_images';
  responseFlag: Ref<boolean[]>;
  updateOnSuccess?: boolean;
}) {
  let hasError = false;
  let errorMessage = '';
  const jobsIds: { jobId: any; recordId: any; }[] = [];
  responseFlag.value = props.checkboxes.map(() => false);
  let isRateLimitExceeded = false;
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
      message: `Rate limit exceeded for "${actionType.replace('_', ' ')}" action. Please try again later.`,
      variant: 'danger',
      timeout: 'unlimited',
    });
      return;
    }
  } catch (e) {
    adminforth.alert({
      message: `Error checking rate limit for "${actionType.replace('_', ' ')}" action.`,
      variant: 'danger',
      timeout: 'unlimited',
    });
    isRateLimitExceeded = true;
  }
  if (isRateLimitExceeded) {
    return;
  };
  //creating jobs
  const tasks = props.checkboxes.map(async (checkbox, i) => {
    try {
      const res = await callAdminForthApi({
        path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
        method: 'POST',
        body: {
          actionType: actionType,
          recordId: checkbox,
        },
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
      errorMessage = `Failed to ${actionType.replace('_', ' ')}. Please, try to re-run the action.`;
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
      });
      //check for errors
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
        if (actionType !== 'analyze_no_images' || !props.meta.isFieldsForAnalizeFromImages) {
          responseFlag.value[index] = true;
        }
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
        if (actionType !== 'analyze_no_images' || !props.meta.isFieldsForAnalizeFromImages) {
          responseFlag.value[index] = true;
        }
        if (index !== -1) {
          jobsIds.splice(jobsIds.findIndex(j => j.jobId === jobId), 1);
        }
        adminforth.alert({
          message: `Generation action "${actionType.replace('_', ' ')}" failed for record: ${recordId}. Error: ${jobResponse.job?.error || 'Unknown error'}`,
          variant: 'danger',
          timeout: 'unlimited',
        });
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

</script>