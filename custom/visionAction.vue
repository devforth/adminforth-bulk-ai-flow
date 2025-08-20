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
                class="relative max-w-[95vw] h-[90vh] bg-white dark:bg-gray-900 rounded-md shadow-2xl overflow-hidden"
                @click.stop
            >
                <div class="flex flex-col gap-4 w-full h-full p-6 overflow-y-auto">
                    <!-- <div v-for="(fieldObj, i) in props.meta.outputFields" :key="i" class="flex justify-start gap-4 text-lg">
                        <p class="font-bold w-64 w-full text-center">Field ID:</p>
                            <p class="font-bold w-64 w-full text-center">Source Images</p>
                        <div v-for="(val, key) in fieldObj" :key="key" class="max-w-64 w-full text-center">
                            <p>{{ formatLabel(key) }}</p>
                        </div>
                    </div> -->

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
                        />
                </div>
            </div>
        </div>
    </Dialog>



</template>

<script lang="ts" setup>
import { callAdminForthApi } from '@/utils';
import { ref, onMounted, nextTick, Ref, h, computed, watch, reactive } from 'vue'
import { Dialog, Table } from '@/afcl';
import VisionTable from './visionRow.vue'

const props = defineProps<{
    checkboxes: any,
    meta: any,
    resource: any,
    adminUser: any,
}>();

const confirmDialog = ref(null);
const records = ref<any[]>([]);
const images = ref<any[]>([]);
const tableHeaders = ref([]);
const tableColumns = ref([]);
const customFieldNames = ref([]);
// const images = props.meta.imageFields(1);

onMounted( async () => {
    // const images = props.meta.imageFields(1);
  //console.log(JSON.stringify(props.meta));
});

const openDialog = async () => {
  confirmDialog.value.open();
//   showBaseConfig();
  await getRecords();
  await getImages();
  tableHeaders.value = generateTableHeaders(props.meta.outputFields);
  tableColumns.value = generateTableColumns();
  customFieldNames.value = tableHeaders.value.slice(2).map(h => h.fieldName);
}

const closeDialog = () => {
  confirmDialog.value.close();
}
async function showBaseConfig() {
  console.log('Base config:', JSON.stringify(props.meta));
  console.log('Checked config:', JSON.stringify(props.checkboxes));
}

function formatLabel(str) {
  return str
    .split('_')                   
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');      
}

function generateTableHeaders(outputFields) {
  const headers = [];

  headers.push({ label: 'Field name', fieldName: 'label' });
  headers.push({ label: 'Source Images', fieldName: 'images' });

  if (outputFields.length > 0) {
    const sampleField = outputFields[0];
    for (const key in sampleField) {
      headers.push({
        label: formatLabel(key),
        fieldName: key,
      });
    }
  }
  console.log('Generated table headers:', headers);
  return headers;
}

function generateTableColumns() {
    const fields = [];
    const tableData = [];
    for (const field of tableHeaders.value) {
        fields.push( field.fieldName );
    }
    console.log('Generated table columns:', fields);
    console.log("Checkboxes:", props.checkboxes);
    for (const [index, checkbox] of props.checkboxes) {
        const record = records.value[index];
        console.log('Record:', record);
        let reqFields = {};
        for (const field of fields) {
            reqFields[field] = record[field] || '';
        }
        reqFields['label'] = record.title;  //need to find a way to get the label
        reqFields['images'] = images.value[index];
        console.log('Request fields:', reqFields);
        tableData.push(reqFields);
        //tableData.push(rowData);
    }
    console.log('Generated table data:', tableData);
    return tableData;
}



async function getRecords() {
  const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_records`,
      method: 'POST',
      body: {
        record: props.checkboxes,
      },
  });

//   console.log('Records:', res.records);
//   console.log('Enum fields:', JSON.stringify(props.meta.columnEnums));
  records.value = res.records;
//   console.log('Records after assignment:', records.value);
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
//   console.log('Images after assignment:', images.value);
}

</script>