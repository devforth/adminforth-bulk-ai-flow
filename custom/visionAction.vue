<template>
  <div @click="openDialog">
      <p class="">{{ props.meta.actionName }}</p>
  </div>
  <Dialog ref="confirmDialog">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click="closeDialog"
    >
      <div
        class="flex items-center justify-center relative max-w-[95vw] min-w-[640px] max-h-[90vh] bg-white dark:bg-gray-900 rounded-md shadow-2xl overflow-hidden"
        @click.stop
      >
        <div class="flex flex-col items-center justify-evenly gap-4 w-full h-full p-6 overflow-y-auto">
          <VisionTable
            v-if="records && props.checkboxes.length"
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
            :isAiResponseReceived="isAiResponseReceived"
            :isAiResponseReceivedImage="isAiResponseReceivedImage"
            :primaryKey="primaryKey"
            :openGenerationCarousel="openGenerationCarousel"
          />
          <div class="flex w-full items-end justify-end">
            <Button 
              class="w-64"
              @click="saveData"
              :disabled="isLoading"
              :loader="isLoading"
            >
            {{ props.checkboxes.length > 1 ? 'Save fields' : 'Save field' }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { ref, watch } from 'vue'
import { Dialog, Button } from '@/afcl';
import VisionTable from './visionTable.vue'
import adminforth from '@/adminforth';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { type AdminUser, type AdminForthResourceCommon } from '@/types';

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
const isAiResponseReceived = ref([]);
const isAiResponseReceivedImage = ref([]);
const primaryKey = props.meta.primaryKey;
const openGenerationCarousel = ref([]);
const isLoading = ref(false);

const openDialog = async () => {
  confirmDialog.value.open();
  await getRecords();
  await getImages();
  tableHeaders.value = generateTableHeaders(props.meta.outputFields);
  const result = generateTableColumns();
  tableColumns.value = result.tableData;
  tableColumnsIndexes.value = result.indexes;
  customFieldNames.value = tableHeaders.value.slice(3).map(h => h.fieldName);
  setSelected();
  for (let i = 0; i < selected.value?.length; i++) {
  openGenerationCarousel.value[i] = props.meta.outputImageFields?.reduce((acc,key) =>{

    acc[key] = false;
    return acc;
  },{[primaryKey]: records.value[i][primaryKey]} as Record<string, boolean>);
  }
  isLoading.value = true;
  await Promise.all([
    //analyzeFields(),
    generateImages()
  ]);
  isLoading.value = false;
}
 
// watch(selected, (val) => {
//   console.log('Selected changed:', val);
// }, { deep: true });

const closeDialog = () => {
  confirmDialog.value.close();
  isAiResponseReceived.value = [];
  isAiResponseReceivedImage.value = [];

  records.value = [];
  images.value = [];
  selected.value = [];
  tableColumns.value = [];
  tableColumnsIndexes.value = [];
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
  headers.push({ label: 'Source Images', fieldName: 'images' });

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
    isAiResponseReceived.value[index] = true;
  });
}

function isInColumnEnum(key: string): boolean {
  const colEnum = props.meta.columnEnums?.find(c => c.name === key);
  if (!colEnum) {
    return false;
  }
  return true;
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

  return [checkedItemsIDs, checkedItems];
}

async function convertImages(fieldName, img) {
  let imgBlob;
  if (img.startsWith('data:')) {
    const base64 = img.split(',')[1];
    const mimeType = img.split(';')[0].split(':')[1];
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    imgBlob = new Blob([byteArray], { type: mimeType });
  } else {
    imgBlob = await fetch(
      `/adminapi/v1/plugin/${props.meta.outputImagesPluginInstanceIds[fieldName]}/cors-proxy?url=${encodeURIComponent(img)}`
    ).then(res => { return res.blob() });
  }
  return imgBlob;
}


async function analyzeFields() {
  try {
    isAiResponseReceived.value = props.checkboxes.map(() => false);

    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/analyze`,
      method: 'POST',
      body: {
        selectedIds: props.checkboxes,
      },
    });

    isAiResponseReceived.value = props.checkboxes.map(() => true);

    res.result.forEach((item, idx) => {
      const pk = selected.value[idx]?.[primaryKey]

      if (pk) {
        selected.value[idx] = {
          ...selected.value[idx],
          ...item,
          isChecked: true,
          [primaryKey]: pk
        }
      }
    })
  } catch (error) {
    console.error('Failed to get records:', error);

  }
}

async function saveData() {
  if (!selected.value?.length) {
    adminforth.alert({ message: 'No items selected', variant: 'warning' });
    return;
  }
  try {
    isLoading.value = true;
    const [checkedItemsIDs, reqData] = await prepareDataForSave();

    const imagesToUpload = [];
    for (const item of reqData) {
      for (const [key, value] of Object.entries(item)) {
        if(props.meta.outputImageFields?.includes(key)) {
          const p = uploadImage(value, item[primaryKey], key).then(result => {
            item[key] = result;
          });
          imagesToUpload.push(p);
        }
      }
    }
    await Promise.all(imagesToUpload);

    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/update_fields`,
      method: 'POST',
      body: {
        selectedIds: checkedItemsIDs,
        fields: reqData,
      },
    });

    if(res.ok) {
      confirmDialog.value.close();
      props.updateList();
      props.clearCheckboxes();
    } else {
      console.error('Error saving data:', res);
    }
  } catch (error) {
    console.error('Error saving data:', error);
  } finally {
    isLoading.value = false;
  }
}

async function generateImages() {
  isAiResponseReceivedImage.value = props.checkboxes.map(() => false);
  let res;
  let error = null;

  try {
    res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/initial_image_generate`,
      method: 'POST',
      body: {
        selectedIds: props.checkboxes,
      },
    });
  } catch (e) {
    console.error('Error generating images:', e);
  }
  isAiResponseReceivedImage.value = props.checkboxes.map(() => true);

  if (res?.error) {
    error = res.error;
  }
  if (!res) {
    error = 'Error generating images, something went wrong';
  }

  if (error) { 
    adminforth.alert({
      message: error,
      variant: 'danger',
      timeout: 'unlimited',
    });
  } else {
    res.result.forEach((item, idx) => {
      const pk = selected.value[idx]?.[primaryKey]
      if (pk) {
        selected.value[idx] = {
          ...selected.value[idx],
          ...item,
          [primaryKey]: pk
        }
      }
    })
  }
}


async function uploadImage(imgBlob, id, fieldName) {
  const file = new File([imgBlob], `generated_${fieldName}_${id}.${imgBlob.type}`, { type: imgBlob.type });
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
    return null;
  }
}

</script>