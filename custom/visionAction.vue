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
        class="bulk-vision-dialog relative max-w-[95vw] max-h-[90vh] bg-white dark:bg-gray-900 rounded-md shadow-2xl overflow-hidden"
        @click.stop
      >
        <div class="bulk-vision-table flex flex-col items-end justify-evenly gap-4 w-full h-full p-6 overflow-y-auto">
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
            :primaryKey="primaryKey"
          />
          <Button 
            class="bulk-vision-button w-64"
            @click="saveData"
          >
          {{ props.checkboxes.length > 1 ? 'Save fields' : 'Save field' }}
          </Button>
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

const props = defineProps<{
  checkboxes: any,
  meta: any,
  resource: any,
  adminUser: any,
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
const primaryKey = props.meta.primaryKey;

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
  analyzeFields();
}
 
// watch(selected, (val) => {
//   console.log('Selected changed:', val);
// }, { deep: true });

const closeDialog = () => {
  confirmDialog.value.close();
  isAiResponseReceived.value = [];
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
      if(isInColumnEnum(key)){
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
  const res = await callAdminForthApi({
    path: `/plugin/${props.meta.pluginInstanceId}/get_records`,
    method: 'POST',
    body: {
      record: props.checkboxes,
    },
  });
  records.value = res.records;
}

async function getImages() {
  const res = await callAdminForthApi({
    path: `/plugin/${props.meta.pluginInstanceId}/get_images`,
    method: 'POST',
    body: {
      record: records.value,
    },
  });

  images.value = res.images;
}

function prepareDataForSave() {
  const checkedItems = selected.value
    .filter(item => item.isChecked === true)
    .map(item => {
      const { isChecked, primaryKey, ...itemWithoutIsCheckedAndId } = item;
      return itemWithoutIsCheckedAndId;
    });
  const checkedItemsIDs = selected.value
    .filter(item => item.isChecked === true)
    .map(item => item[primaryKey]);
  return [checkedItemsIDs, checkedItems];
}

async function analyzeFields() {
  isAiResponseReceived.value = props.checkboxes.map(() => false);

  const res = await callAdminForthApi({
    path: `/plugin/${props.meta.pluginInstanceId}/analyze`,
    method: 'POST',
    body: {
      selectedIds: props.checkboxes,
    },
  });

  isAiResponseReceived.value = props.checkboxes.map(() => true);

  selected.value.splice(
    0,
    selected.value.length,
    ...res.result.map((item, idx) => ({
      ...item,
      isChecked: true,
      [primaryKey]: selected.value[idx]?.[primaryKey],
    }))
  )
}

async function saveData() {
  const [checkedItemsIDs, reqData] = prepareDataForSave();

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
}
</script>