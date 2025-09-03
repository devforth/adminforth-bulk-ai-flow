<template>
  <div>
    <Table
      :columns="tableHeaders"
      :data="tableColumns"
      :pageSize="8"
      >
      <!-- HEADER TEMPLATE -->
      <template #header:checkboxes="{ item }">
        MARK FOR SAVE
      </template>
      <!-- CHECKBOX CELL TEMPLATE -->
      <template #cell:checkboxes="{ item }">
        <div class="flex items-center justify-center">
          <Checkbox
            v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])].isChecked"
          />
        </div>
      </template>
      <!-- IMAGE CELL TEMPLATE -->
      <template #cell:images="{item}">
        <div class="flex flex-shrink-0 gap-2">
          <div v-for="image in item.images" :key="image">
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
      <!-- CUSTOM FIELD TEMPLATES -->
      <template v-for="n in customFieldNames" :key="n" #[`cell:${n}`]="{ item, column }">
        <div v-if="isAiResponseReceivedAnalize[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] && !isInColumnImage(n)">
          <div v-if="isInColumnEnum(n)">
            <Select
              :options="convertColumnEnumToSelectOptions(props.meta.columnEnums, n)"
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
              :teleportToTop="true"
              :teleportToBody="false"
            >
            </Select>
          </div>
          <div v-else-if="typeof selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] === 'string' || typeof selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] === 'object'">
            <Textarea
              class="w-full h-full"
              type="text"
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
            >
            </Textarea>
          </div>
          <div v-else-if="typeof selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] === 'boolean'">
            <Toggle
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
            >
            </Toggle>
          </div>
          <div v-else>
            <Input
              type="number"
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
              class="w-full "
              :fullWidth="true"
            />
          </div>
        </div>

        <div v-if="isAiResponseReceivedImage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])]">
          <div v-if="isInColumnImage(n)">
            <div class="mt-2 flex items-center justify-center gap-2">
              <img 
                  :src="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"  
                  class="w-20 h-20 object-cover rounded cursor-pointer border hover:border-blue-500 transition" 
                  @click="() => {openGenerationCarousel[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = true}"
              />
            </div>
            <div>
              <GenerationCarousel
                v-if="openGenerationCarousel[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :images="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :recordId="item[primaryKey]"
                :meta="props.meta"
                :fieldName="n"
                @error="handleError"
                @close="openGenerationCarousel[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = false"
                @selectImage="updateSelectedImage"
              />
            </div>
          </div>
        </div>

        <div v-if="!isAiResponseReceivedImage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] && isInColumnImage(n)">
            <Skeleton type="image" class="w-20 h-20" />
        </div>

        <div v-if="!isAiResponseReceivedAnalize[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] && !isInColumnImage(n)">
          <Skeleton class="w-full h-6" />
        </div>
      </template>
    </Table>
  </div>
</template>

<script lang="ts" setup>
import { ref, nextTick, watch } from 'vue'
import mediumZoom from 'medium-zoom'
import { Select, Input, Textarea, Table, Checkbox, Skeleton, Toggle } from '@/afcl'
import GenerationCarousel from './imageGenerationCarousel.vue'

const props = defineProps<{
  meta: any,
  tableHeaders: any,
  tableColumns: any,
  customFieldNames: any,
  tableColumnsIndexes: any,
  selected: any,
  isAiResponseReceivedAnalize: boolean[],
  isAiResponseReceivedImage: boolean[],
  primaryKey: any,
  openGenerationCarousel: any
  isError: boolean,
  errorMessage: string
}>();
const emit = defineEmits(['error']);


const zoomedImage = ref(null)
const zoomedImg = ref(null)


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

function isInColumnImage(key: string): boolean {
  return props.meta.outputImageFields?.includes(key) || false;
}

function convertColumnEnumToSelectOptions(columnEnumArray: any[], key: string) {
  const col = columnEnumArray.find(c => c.name === key);
  if (!col) return [];
  return col.enum.map(item => ({
    label: item.label,
    value: item.value
  }));
}

function updateSelectedImage(image: string, id: any, fieldName: string) {
  props.selected[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === id)][fieldName] = image;
}

function handleError({ isError, errorMessage }) {
  emit('error', {
    isError,
    errorMessage
  });
}

</script>