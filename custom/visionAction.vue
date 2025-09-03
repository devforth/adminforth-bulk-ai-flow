<template>
  <div class="flex items-end justify-start gap-2 cursor-pointer" @click="openDialog">
    <div class="flex items-center justify-center text-white bg-gradient-to-r h-[18px] from-purple-500 via-purple-600 to-purple-700 hover:bg-gradient-to-br focus:ring-4 focus:outline-none focus:ring-purple-300 dark:focus:ring-purple-800 font-medium rounded-md text-sm px-1 text-center">
      AI
    </div>
    <p class="text-justify max-h-[18px] truncate max-w-[60vw] md:max-w-none">{{ props.meta.actionName }}</p>
  </div>
  <Dialog ref="confirmDialog">
    <div
      class="fixed inset-0 z-20 flex items-center justify-center bg-black/40"
    >
      <div
        class="bulk-vision-dialog flex items-center justify-center relative w-[100vw] h-[100vh] max-h-[100vh] md:w-auto md:max-w-[95vw] md:min-w-[640px] md:h-auto md:max-h-[90vh] bg-white dark:bg-gray-900 rounded-none md:rounded-md shadow-2xl overflow-hidden"
        @click.stop
      >
        <div class="bulk-vision-table flex flex-col items-center justify-evenly gap-3 md:gap-4 w-full h-full p-4 md:p-6 overflow-y-auto overflow-x-auto">
          <button type="button" 
            @click="closeDialog"
            class="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white" >
              <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
              </svg>
          </button>

          <div v-if="records && props.checkboxes.length" class="w-full overflow-x-auto">
            <VisionTable
              :checkbox="props.checkboxes"
              :records="records"
              :index="0"
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
            />
          </div>
          <div class="flex w-full flex-col md:flex-row items-stretch md:items-end justify-end gap-3 md:gap-4">
            <div class="h-full text-red-600 font-semibold flex items-center justify-center md:mb-2">
              <p v-if="isError === true">{{ errorMessage }}</p>
            </div>
            <button type="button" class="w-full md:w-auto py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
              @click="closeDialog"
            >
              {{'Cancel'}}
            </button>
            <Button 
              class="w-full md:w-64"
              @click="saveData"
              :disabled="isLoading || checkedCount < 1 || isCriticalError"
              :loader="isLoading"
            >
            {{ checkedCount > 1 ? 'Save fields' : 'Save field' }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { Ref, ref, watch } from 'vue'
import { Dialog, Button } from '@/afcl';
import VisionTable from './visionTable.vue'
import adminforth from '@/adminforth';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { AdminUser, type AdminForthResourceCommon } from '@/types';

const route = useRoute();
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
const isAiResponseReceivedAnalize = ref([]);
const isAiResponseReceivedImage = ref([]);
const primaryKey = props.meta.primaryKey;
const openGenerationCarousel = ref([]);
const isLoading = ref(false);
const isError = ref(false);
const isCriticalError = ref(false);
const isImageGenerationError = ref(false);
const errorMessage = ref('');
const checkedCount = ref(0);

const openDialog = async () => {
  confirmDialog.value.open();
  await getRecords();
  if (props.meta.isFieldsForAnalizeFromImages || props.meta.isImageGeneration) {
    await getImages();
  }
  tableHeaders.value = generateTableHeaders(props.meta.outputFields);
  const result = generateTableColumns();
  tableColumns.value = result.tableData;
  tableColumnsIndexes.value = result.indexes;
  customFieldNames.value = tableHeaders.value.slice(props.meta.isFieldsForAnalizeFromImages ? 3 : 2).map(h => h.fieldName);
  setSelected();
  for (let i = 0; i < selected.value?.length; i++) {
    openGenerationCarousel.value[i] = props.meta.outputImageFields?.reduce((acc,key) =>{
      acc[key] = false;
      return acc;
    },{[primaryKey]: records.value[i][primaryKey]} as Record<string, boolean>);
  }
  isLoading.value = true;
  const tasks = [];
  if (props.meta.isFieldsForAnalizeFromImages) {
    tasks.push(runAiAction({
      endpoint: 'analyze',
      actionType: 'analyze',
      responseFlag: isAiResponseReceivedAnalize,
    }));
  }
  if (props.meta.isFieldsForAnalizePlain) {
    tasks.push(runAiAction({
      endpoint: 'analyze_no_images',
      actionType: 'analyze_no_images',
      responseFlag: isAiResponseReceivedAnalize,
    }));
  }
  if (props.meta.isImageGeneration) {
    tasks.push(runAiAction({
      endpoint: 'initial_image_generate',
      actionType: 'generate_images',
      responseFlag: isAiResponseReceivedImage,
    }));
  }
  await Promise.all(tasks);
  isLoading.value = false;
}
 
watch(selected, (val) => {
  //console.log('Selected changed:', val);
  checkedCount.value = val.filter(item => item.isChecked === true).length;
}, { deep: true });

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
  if (props.meta.isFieldsForAnalizeFromImages) {
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
    // Handle error appropriately
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
    // Handle error appropriately
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
  let res: any;
  let error: any = null;

  try {
    responseFlag.value = props.checkboxes.map(() => false);

    res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/${endpoint}`,
      method: 'POST',
      body: {
        selectedIds: props.checkboxes,
      },
    });

    if (actionType !== 'analyze_no_images' || !props.meta.isFieldsForAnalizeFromImages) {
      responseFlag.value = props.checkboxes.map(() => true);
    }
  } catch (e) {
    console.error(`Error during ${actionType}:`, e);
    error = `Failed to ${actionType.replace('_', ' ')}. Please, try to re-run the action.`;
  }

  if (res?.error) {
    error = res.error;
  }
  if (!res && !error) {
    error = `Error: ${actionType} request returned empty response.`;
  }

  if (error) {
    adminforth.alert({
      message: error,
      variant: 'danger',
      timeout: 'unlimited',
    });
    isError.value = true;
    if (actionType === 'generate_images') {
      isImageGenerationError.value = true;
    }
    errorMessage.value = error;
    return;
  }

  if (updateOnSuccess) {
    res.result.forEach((item: any, idx: number) => {
      const pk = selected.value[idx]?.[primaryKey];
      if (pk) {
        selected.value[idx] = {
          ...selected.value[idx],
          ...item,
          isChecked: true,
          [primaryKey]: pk,
        };
      }
    });
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
          recordPk: route?.params?.primaryKey,
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