<template>
    <div>
      <Table
        :columns="tableHeaders"
        :data="tableColumns"
        :pageSize="8"
        >
        <template #header:checkboxes="{ item }">
            <Checkbox
              v-model="isAllChecked"
              @click="clickMainCheckbox"
            />
        </template>
        <template #cell:checkboxes="{ item }">
            <Checkbox
              v-model="selected[tableColumnsIndexes.findIndex(el => el.label === item.label)].isChecked"
            />
        </template>
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
            <div v-else-if="typeof selected[tableColumnsIndexes.findIndex(el => el.label === item.label)][n] === 'string'">
              <Textarea
                class="w-full h-full"
                type="text"
                v-model="selected[tableColumnsIndexes.findIndex(el => el.label === item.label)][n]"
                @click="showData(index)"
              >
              </Textarea>
            </div>
            <div v-else>
              <Input
                type="number"
                v-model="selected[tableColumnsIndexes.findIndex(el => el.label === item.label)][n]"
                class="w-full "
                :fullWidth="true"
              />
            </div>
        </template>
      </Table>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, nextTick, toRaw, Ref, h, computed, watch, reactive } from 'vue'
import mediumZoom from 'medium-zoom'
import { Select, Input, Textarea, Table, Checkbox } from '@/afcl'

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

const isAllChecked = computed(() => {
  console.log('Checking if all are checked:', props.selected.every(item => item.isChecked));
  return props.selected.every(item => item.isChecked);
});

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
  const colEnum = props.meta.columnEnums?.find(c => c.name === key);
  if (!colEnum) {
    return false;
  }
  return true;
}

function convertColumnEnumToSelectOptions(columnEnumArray: any[], key: string) {
  const col = columnEnumArray.find(c => c.name === key);
  if (!col) return [];
  return col.enum.map(item => ({
    label: item.label,
    value: item.value
  }));
}


function showData(record: any) {
  console.log('Showing data for record:', record);
}

function clickMainCheckbox() {
  if( isAllChecked.value ) {
    props.selected.forEach(item => item.isChecked = false);
  } else {
    props.selected.forEach(item => item.isChecked = true);
  }
}

</script>