<template>
    <div>
      <Table
        :columns="tableHeaders"
        :data="tableColumns"
        :pageSize="8"
        >
        <template #cell:images="{item}">
            <div class="flex flex-shrink-0 gap-2">
                <div v-for="image in item.images" :key="image">
                    <!-- RENDERING IMAGES -->
                    <div class="mt-2 flex items-center justify-center gap-2">
                        <img 
                            :src="image"  
                            class="w-20 h-20 object-cover rounded cursor-pointer border hover:border-blue-500 transition" 
                            @click="zoomImage(image)"
                        />
                    </div>
                    <div
                      v-if="zoomedImage"
                      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                      @click.self="closeZoom"
                    >
                      <img
                        :src="zoomedImage"
                        ref="zoomedImg"
                        class="max-w-full max-h-full rounded-lg object-contain cursor-grab z-75"
                      />
                    </div>
                </div>
            </div>
        </template>
        <template v-for="n in customFieldNames" :key="n" #[`cell:${n}`]="{ item, column }">
            <div v-if="isInColumnEnum(n)">
            <Select
                :options="convertColumnEnumToSelectOptions(props.meta.columnEnums, n)"
                v-model="selected[tableColumnsIndexes.findIndex(el => el.label === item.label)][n]"
            ></Select>
            </div>
            <div v-else>
              <Input
                :type="typeof selected[tableColumnsIndexes.findIndex(el => el.label === item.label)][n] === 'string' ? 'text' : 'number'"
                v-model="selected[tableColumnsIndexes.findIndex(el => el.label === item.label)][n]"
                class="w-full"
                :fullWidth="true"
              >    
              </Input>
            </div>
        </template>
      </Table>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, nextTick, toRaw, Ref, h, computed, watch, reactive } from 'vue'
import mediumZoom from 'medium-zoom'
import { Select, Input, Table } from '@/afcl'

const props = defineProps<{
    checkbox: any,
    records: any,
    meta: any,
    index: any,
    images: any,
    tableHeaders: any,
    tableColumns: any,
    customFieldNames: any,
    tableColumnsIndexes: any,
    selected: any,
}>();
const zoomedImage = ref(null)
const zoomedImg = ref(null)

onMounted(() => {
    // for (const [index, record] of props.records) {
    //   props.meta.outputFields.forEach((fieldObj, i) => {
    //       for (const key in fieldObj) {
    //         if(isInColumnEnum(key)){
    //           const colEnum = props.meta.columnEnums.find(c => c.name === key);
    //           const object = colEnum.enum.find(item => item.value === props.records[index][key]);
    //           selected.value[index][key] = object ? props.records[index][key] : null;
    //         }else {
    //           selected.value[index][key] = props.records[index][key];
    //         }
    //       }
    //   })
    // };
    // console.log('🤮🤮🤮🤮🤮Selected:', selected.value);
})

function zoomImage(img) {
  zoomedImage.value = img
}

function closeZoom() {
  zoomedImage.value = null
}

watch(zoomedImage, async (val) => {
  await nextTick()
  if (val && zoomedImg.value) {
    mediumZoom(zoomedImg.value, {
      margin: 24,
      background: 'rgba(0, 0, 0, 0.9)',
      scrollOffset: 150
    }).show()
  }
})

function isInColumnEnum(key: string): boolean {
  //console.log('Checking column enum for key:', key);
  //console.log('Available column enums:',JSON.stringify(props.meta.columnEnums));
  const colEnum = props.meta.columnEnums?.find(c => c.name === key);
  if (!colEnum) {
    //console.log(`Column enum not found for key: ${key}`);
    return false;
  }
  //console.log(`Column enum found for key: ${key}`, colEnum);
  return true;
}

function convertColumnEnumToSelectOptions(columnEnumArray: any[], key: string) {
  const col = columnEnumArray.find(c => c.name === key);
  if (!col) return [];
  //console.log(`Converting column enum for key: ${JSON.stringify(key)}`, JSON.stringify(col));
  return col.enum.map(item => ({
    label: item.label,
    value: item.value
  }));
}

function showData(str1, str2, str3, str4) {
  console.log('Str1:', str1);
  console.log('Str2:', str2);
  console.log('Str3:', str3);
  console.log('Str4:', str4);
  console.log('You clicked on record with index:', props.tableColumnsIndexes.findIndex(el => el.label === str1.label));
  // console.log('Selected:', JSON.stringify(props.selected));
}

</script>