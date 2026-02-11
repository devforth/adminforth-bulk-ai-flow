<template>
    <Table
      :columns="tableHeaders"
      :data="tableDataProvider"
      :pageSize="pageSize"
      makeHeaderSticky
      makePaginationSticky
      >
      <!-- HEADER TEMPLATE -->
      <template #header:checkboxes="{ item }">
        {{ $t('MARK FOR SAVE') }}
      </template>
      <!-- CHECKBOX CELL TEMPLATE -->
      <template #cell:checkboxes="{ item }">
        <div class="max-w-[100px] flex items-center justify-center">
          <Checkbox
            v-model="item.isChecked"
          />
        </div>
      </template>
      <!-- IMAGE CELL TEMPLATE -->
      <template #cell:images="{item}">
        <div class="flex flex-shrink-0 gap-2">
          <div v-if="item.images.length" v-for="image in item.images" :key="image">
            <div class="mt-2 flex items-center justify-center gap-2">
              <img
                  v-if="isValidUrl(image)" 
                  :src="image"  
                  class="w-20 h-20 object-cover rounded cursor-pointer border hover:border-blue-500 transition my-2" 
                  @click="zoomImage(image)"
              />
              <div v-else class="w-20 h-20">
                <p>{{ $t('Invalid source image') }}</p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-center text-center w-20 h-20" v-else>
            <p>{{ $t('No images found') }}</p>
          </div>
          <transition name="fade">
            <div
              v-if="zoomedImage"
              class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              @click.self="closeZoom"
            >
              <transition name="zoom">
                <img
                  v-if="zoomedImage"
                  :src="zoomedImage"
                  class="max-w-full max-h-full rounded-lg object-contain cursor-grab z-75"
                />
              </transition>
            </div>
          </transition>
        </div>
      </template>
      <!-- CUSTOM FIELD TEMPLATES -->
      <template v-for="n in customFieldNames" :key="n" #[`cell:${n}`]="{ item }">
        <div v-if="(isAnalyzing(item, n) && !item.regeneratingFieldsStatus?.[n]) && !isInColumnImage(n)" @mouseenter="(() => { setHover(item.id, n, true) })" @mouseleave="(() => { setHover(item.id, n, false) })">
          <div class="flex gap-1 justify-end">
            <Tooltip v-if="checkForError(item, n)">
              <IconExclamationCircleSolid class="my-2 w-5 h-5 text-red-500" />
              <template #tooltip> 
                {{ checkForError(item, n) }}
              </template>
            </Tooltip>
            <Tooltip>
              <IconRefreshOutline class="my-2 w-5 h-5 hover:text-blue-500 cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed hover': shouldDisableRegenerateFieldIcon(item, n) }" @click="regerenerateFieldIconClick(item, n)"/>
              <template #tooltip> 
                {{ shouldDisableRegenerateFieldIcon(item, n) ? $t("Can't analyze image without source image") : $t('Regenerate') }}
              </template>
            </Tooltip>
          </div>
          <div v-if="isInColumnEnum(n)" class="flex flex-col items-start justify-end min-h-[90px]">
              <Select
                class="min-w-[150px]"
                :options="convertColumnEnumToSelectOptions(props.meta.columnEnums, n)"
                v-model="item.data[n]"
                :teleportToTop="true"
                :teleportToBody="false"
              >
              </Select>
              <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !isHovered(item.id, n) }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
                <template #tooltip>
                  {{  item.oldData?.[n] ?? "No old value" }}
                </template>
              </Tooltip>
          </div>
            <div v-else-if="typeof item.data?.[n] === 'string' || typeof item.data?.[n] === 'object'" class="flex flex-col items-start justify-end min-h-[90px]">
            <Textarea
              class="min-w-[150px] h-full"
              type="text"
              v-model="item.data[n]"
            >
            </Textarea>
            <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !isHovered(item.id, n) }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
              <template #tooltip>
                <p class="max-w-[200px]">{{  item.oldData?.[n] ?? "No old value" }}</p>
              </template>
            </Tooltip>
            </div>
          <div v-else-if="typeof item.data?.[n] === 'boolean'" class="flex flex-col items-center justify-end min-h-[90px]">
            <Toggle
              class="p-2"
              v-model="item.data[n]"
            >
            </Toggle>
            <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !isHovered(item.id, n) }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
              <template #tooltip>
                {{  item.oldData?.[n] ?? "No old value" }}
              </template>
            </Tooltip>
          </div>
          <div v-else class="flex flex-col items-start justify-end min-h-[90px]">
            <Input
              type="number"
              v-model="item.data[n]"
              class="w-full min-w-[80px]"
              :fullWidth="true"
            />
            <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !isHovered(item.id, n) }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
              <template #tooltip>
                {{  item.oldData?.[n] ?? "No old value" }}
              </template>
            </Tooltip>
          </div>
        </div>

        <div v-if="item.aiStatus.generatedImages" @mouseenter="(() => { setHover(item.id, n, true) })" @mouseleave="(() => { setHover(item.id, n, false) })">
          <div v-if="isInColumnImage(n)">
            <div class="mt-2 mb-2 flex items-center justify-start gap-2">
              <div v-if="isValidUrl(item.data?.[n])" class="flex flex-col items-center relative">
              <img 
                :src="item.data?.[n]"
                class="w-20 h-20 object-cover rounded cursor-pointer border hover:border-blue-500 transition"
                @click="() => {item.openGenerationCarousel[n] = true}"
              />
              <p
                v-if="isImageHasPreviewUrl[n]"
                class="absolute mt-20 text-sm hover:text-blue-500 hover:underline hover:cursor-pointer flex items-center gap-1"
                :class="{ 'opacity-0': !isHovered(item.id, n) }"
                @click="() => {item.openImageCompare[n] = true}"  
              >
                {{ $t('old image') }}
              </p>
              </div>
              <div v-else class="flex items-center justify-center text-center w-20 h-20">
                <Tooltip v-if="item.imageGenerationErrorMessage === 'No source images found'">
                  <p
                  >
                    {{ $t("Can't generate image.") }}
                  </p>
                  <template #tooltip>
                    {{ item.imageGenerationErrorMessage }}
                  </template>
                </Tooltip>
                <Tooltip v-else>
                  <div>
                    <IconRefreshOutline
                      @click="() => {regenerateImages(item.id)}"
                      class="w-20 h-20 hover:text-blue-500 cursor-pointer transition hover:scale-105"
                    />
                  </div>
                  <template #tooltip>
                    {{ item.imageGenerationErrorMessage + '. Click to retry.' }}
                  </template>
                </Tooltip>
              </div>
            </div>
            <div>
              <GenerationCarousel
                v-if="item.openGenerationCarousel[n]"
                :images="item.carouselSaveImages[n]"
                :recordId="item.id"
                :meta="props.meta"
                :fieldName="n"
                :carouselImageIndex="item.carouselImageIndex[n]"
                :regenerateImagesRefreshRate="regenerateImagesRefreshRate"
                :sourceImage="item.images && item.images.length ? item.images : null"
                :imageGenerationPrompts="imageGenerationPrompts[n]"
                @error="handleError"
                @close="item.openGenerationCarousel[n] = false"
                @selectImage="updateSelectedImage"
                @updateCarouselIndex="updateActiveIndex"
              />
              <ImageCompare
                v-if="item.openImageCompare[n]"
                :meta="props.meta"
                :columnName="n"
                :oldImage="item.oldData?.[n]"
                :newImage="item.data?.[n]"
                @close="item.openImageCompare[n] = false"
              />
            </div>
          </div>
        </div>

        <div v-if="!item.aiStatus.generatedImages && isInColumnImage(n)">
            <Skeleton type="image" class="w-20 h-20" />
        </div>

        <div v-if="(!isAnalyzing(item, n) || item.regeneratingFieldsStatus?.[n]) && !isInColumnImage(n)">
          <Skeleton class="w-full h-6" />
        </div>
      </template>
    </Table>
</template>

<script lang="ts" setup>
import { ref, watch, computed, reactive } from 'vue'
import { Select, Input, Textarea, Table, Checkbox, Skeleton, Toggle, Tooltip } from '@/afcl'
import GenerationCarousel from './ImageGenerationCarousel.vue'
import ImageCompare from './ImageCompare.vue';
import { IconRefreshOutline, IconExclamationCircleSolid } from '@iconify-prerendered/vue-flowbite';

const props = defineProps<{
  meta: any,
  tableHeaders: any,
  records: any[],
  customFieldNames: any,
  isError: boolean,
  errorMessage: string
  regenerateImagesRefreshRate: number
  isImageHasPreviewUrl: Record<string, boolean>
  imageGenerationPrompts: Record<string, any>
  outputImageFields: string[],
  outputFieldsForAnalizeFromImages: string[],
  outputPlainFields: string[],
}>();
const emit = defineEmits(['error', 'regenerateImages', 'regenerateCell']);

const pageSize = 6;
const pagination = reactive({ offset: 0, limit: pageSize });
const zoomedImage = ref(null);
const hovers = ref<Record<string, Record<string, boolean>>>({});

const paginatedRecords = computed(() => props.records.slice(pagination.offset, pagination.offset + pagination.limit));

const tableDataProvider = async ({ offset, limit }) => {
  pagination.offset = offset;
  pagination.limit = limit;
  return {
    data: paginatedRecords.value,
    total: props.records.length,
  };
};

watch(() => props.records, (newVal) => {
  hovers.value = Object.fromEntries((newVal || []).map(record => [String(record.id), {}]));
}, { immediate: true, deep: true });

function zoomImage(img) {
  zoomedImage.value = img
}

function closeZoom() {
  zoomedImage.value = null
}

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
  const record = props.records.find(rec => String(rec.id) === String(id));
  if (record) {
    record.data[fieldName] = image;
  }
}

function handleError({ isError, errorMessage }) {
  emit('error', {
    isError,
    errorMessage
  });
}

function regenerateImages(recordId: any) {
  emit('regenerateImages', { recordId });
}

function updateActiveIndex(newIndex: number, id: any, fieldName: string) {
  const record = props.records.find(rec => String(rec.id) === String(id));
  if (record) {
    record.carouselImageIndex[fieldName] = newIndex;
  }
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function regerenerateFieldIconClick(item, name) {
  if (shouldDisableRegenerateFieldIcon(item, name)) {
    return;
  }
  emit('regenerateCell', {
    recordId: item.id,
    fieldName: name
  });
};

function shouldDisableRegenerateFieldIcon(item, name) {
  if (props.outputFieldsForAnalizeFromImages.findIndex( el => el === name) !== -1 &&
      item.imageToTextErrorMessages?.[name] === 'No source images found') {
    return true;
  }
  return false;
}

function checkForError(item, name) {
  if (props.outputFieldsForAnalizeFromImages.findIndex( el => el === name) !== -1) {
    const errorMessage = item.imageToTextErrorMessages?.[name];
    if (errorMessage) {
      return errorMessage;
    }
  }
  if (props.outputPlainFields.findIndex( el => el === name) !== -1) {
    const errorMessage = item.textToTextErrorMessages?.[name];
    if (errorMessage) {
      return errorMessage;
    }
  }
  return false;
}

function isAnalyzing(item, name) {
  if (props.outputFieldsForAnalizeFromImages.findIndex( el => el === name) !== -1) {
    return isImagesAnalyzing(item);
  }
  if (props.outputPlainFields.findIndex( el => el === name) !== -1) {
    return isNoImageAnalyzing(item);
  }

  return false;
}

function isImagesAnalyzing(item) {
  return item.aiStatus.analyzedImages;
}

function isNoImageAnalyzing(item) {
  return item.aiStatus.analyzedNoImages;
}

function setHover(recordId: string | number, field: string, value: boolean) {
  const key = String(recordId);
  if (!hovers.value[key]) {
    hovers.value[key] = {};
  }
  hovers.value[key][field] = value;
}

function isHovered(recordId: string | number, field: string) {
  return Boolean(hovers.value?.[String(recordId)]?.[field]);
}



</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.zoom-enter-active, .zoom-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.zoom-enter-from, .zoom-leave-to {
  transform: scale(0.95);
  opacity: 0;
}
</style>