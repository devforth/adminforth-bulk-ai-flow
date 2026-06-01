<template>
  <div class="overflow-auto pr-2" style="max-height: calc(100vh - 260px);">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 p-1">
      <div 
        v-for="item in paginatedRecords" 
        :key="item.id"
        class="bg-white border border-gray-200 rounded-default p-4 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between gap-4"
      >
        <div class="flex flex-col h-full">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="flex items-center gap-3 w-full min-w-0">
              <Checkbox 
                v-model="item.isChecked" 
                class="shrink-0"
              />
              <!-- CRITICAL WRAPPER -->
              <div class="flex-1 min-w-0 w-0">
                <h3 class="font-bold text-gray-900 w-full truncate overflow-hidden whitespace-nowrap">
                  {{ item.label || item.data?.name || $t('Item Record') }}
                </h3>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {{ cardValueMode?.[String(item.id)] === 'old' ? $t('old value') : $t('new value') }}
                </span>
                <button
                  @click="toggleCardValueMode(item.id)"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  :class="cardValueMode?.[String(item.id)] === 'old' ? 'bg-lightPrimary dark:bg-darkPrimary' : 'bg-gray-200 dark:bg-gray-700'"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform dark:bg-gray-200"
                    :class="cardValueMode?.[String(item.id)] === 'old' ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>
              <div class="text-right text-gray-400 text-sm">
                ID: {{ item.id }}
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3 flex-grow">
            <div
              class="w-full flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 h-full max-h-[260px] max-w-[428.5px] rounded-default text-center "
            >
              <!-- HAS IMAGES -->
              <template v-if="item.images?.length">
                <template
                  v-for="(image, index) in item.images"
                  :key="image || index"
                >
                  <img
                    v-if="image && isValidUrl(image)"
                    :src="image"
                    class="w-full h-full object-cover rounded-default cursor-pointer border hover:border-blue-500 transition"
                    @click="zoomImage(image)"
                  />

                  <div
                    v-else
                    class="text-xs text-red-500 flex flex-col items-center justify-center h-full p-2"
                  >
                    <IconExclamationCircleSolid class="w-6 h-6 mb-1" />
                    <p>{{ $t('Invalid source image') }}</p>
                  </div>
                </template>
              </template>

              <!-- EMPTY ARRAY -->
              <template v-else-if="item.images?.length === 0">
                <div class="text-gray-400 h-[260px] flex flex-col items-center justify-center h-full">
                  <svg
                    class="w-8 h-8 mb-2 stroke-1 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p class="text-xs font-medium">{{ $t('No images found') }}</p>
                </div>
              </template>

              <!-- NO DATA -->
              <template v-else>
                <div class="text-gray-400 flex flex-col items-center justify-center h-full">
                  <svg
                    class="w-8 h-8 mb-2 stroke-1 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p class="text-xs font-medium">{{ $t('No image found') }}</p>
                </div>
              </template>
            </div>
            
            <div class="flex flex-col gap-3">
              <div 
                v-for="n in customFieldNames" 
                :key="n"
                class="flex flex-col relative"
                @mouseenter="(() => { setHover(item.id, n, true) })" 
                @mouseleave="(() => { setHover(item.id, n, false) })"
              >
                <div class="flex justify-between items-center mb-1">
                  <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {{ n.replace(/([A-Z])/g, ' $1').trim() }}
                  </label>
                  
                  <div class="flex gap-1 items-center" v-if="!isInColumnImage(n)">
                    <Tooltip v-if="checkForError(item, n)">
                      <IconExclamationCircleSolid class="w-4 h-4 text-red-500" />
                      <template #tooltip>{{ checkForError(item, n) }}</template>
                    </Tooltip>
                    <Tooltip>
                      <IconRefreshOutline 
                        class="w-4 h-4 text-gray-400 hover:text-blue-500 cursor-pointer transition" 
                        :class="{ 'opacity-30 cursor-not-allowed': shouldDisableRegenerateFieldIcon(item, n) }" 
                        @click="regerenerateFieldIconClick(item, n)"
                      />
                      <template #tooltip> 
                        {{ shouldDisableRegenerateFieldIcon(item, n) ? $t("Can't analyze image without source image") : $t('Regenerate') }}
                      </template>
                    </Tooltip>
                  </div>
                </div>

                <div v-if="isInColumnImage(n)">
                  <div v-if="item.aiStatus?.generatedImages" class="flex flex-col gap-2">
                    <div v-if="isValidUrl(item.data?.[n])" class="flex items-center gap-3 relative">
                      <img 
                        :src="item.data?.[n]" 
                        class="w-full max-h-[260px] object-contain rounded-default"
                        style="image-rendering: auto;"
                      />
                      <p
                        v-if="isImageHasPreviewUrl[n]"
                        class="text-xs text-blue-500 hover:underline cursor-pointer transition-opacity"
                        :class="{ 'opacity-0': !isHovered(item.id, n) }"
                        @click="() => { item.openImageCompare[n] = true }"  
                      >
                        {{ $t('old image') }}
                      </p>
                    </div>
                    <div v-else class="w-16 h-16 border rounded-default flex items-center justify-center bg-gray-50">
                      <Tooltip v-if="item.imageGenerationErrorMessage === 'No source images found'">
                        <p class="text-xs text-red-400 p-1 text-center">{{ $t("Can't generate") }}</p>
                        <template #tooltip>{{ item.imageGenerationErrorMessage }}</template>
                      </Tooltip>
                      <Tooltip v-else>
                        <IconRefreshOutline @click="() => { regenerateImages(item.id) }" class="w-6 h-6 text-gray-400 hover:text-blue-500 cursor-pointer" />
                        <template #tooltip>{{ item.imageGenerationErrorMessage + '. Click to retry' }}</template>
                      </Tooltip>
                    </div>

                    <GenerationCarousel
                      v-if="item.openGenerationCarousel?.[n]"
                      :images="item.carouselSaveImages?.[n]"
                      :recordId="item.id"
                      :meta="props.meta"
                      :fieldName="n"
                      :carouselImageIndex="item.carouselImageIndex?.[n]"
                      :regenerateImagesRefreshRate="regenerateImagesRefreshRate"
                      :sourceImage="item.images && item.images.length ? item.images : null"
                      :imageGenerationPrompts="imageGenerationPrompts[n]"
                      @error="handleError"
                      @close="item.openGenerationCarousel[n] = false"
                      @selectImage="updateSelectedImage"
                      @updateCarouselIndex="updateActiveIndex"
                    />
                    <ImageCompare
                      v-if="item.openImageCompare?.[n]"
                      :meta="props.meta"
                      :columnName="n"
                      :oldImage="item.oldData?.[n]"
                      :newImage="item.data?.[n]"
                      @close="item.openImageCompare[n] = false"
                    />
                  </div>
                  <div v-else>
                    <Skeleton type="image" class="w-16 h-16 rounded-default" />
                  </div>
                </div>

                <div v-else-if="(isAnalyzing(item, n) && !item.regeneratingFieldsStatus?.[n])">
                  <div v-if="isInColumnEnum(n)">
                    <Select
                      v-if="cardValueMode?.[String(item.id)] !== 'old'"
                      class="w-full"
                      :options="convertColumnEnumToSelectOptions(props.meta.columnEnums, n)"
                      v-model="item.data[n]"
                      :teleportToTop="true"
                    />
                    
                    <input
                      v-else
                      type="text"
                      :value="item.oldData?.[n] || item.oldData?.[n] === 0 ? item.oldData[n] : $t('no old value')"
                      disabled
                      class="w-full h-10 px-3 border border-gray-200 rounded-default bg-gray-50 text-gray-400 text-sm focus:outline-none"
                    />
                  </div>
                  
                  <div v-else-if="typeof item.data?.[n] === 'string' || typeof item.data?.[n] === 'object'">
                    <textarea
                      :value="cardValueMode?.[String(item.id)] === 'old' ? (item.oldData?.[n] || item.oldData?.[n] === 0 ? item.oldData[n] : $t('no old value')) : item.data[n]"
                      @input="(e) => { if (cardValueMode?.[String(item.id)] !== 'old') item.data[n] = e.target.value }"
                      :disabled="cardValueMode?.[String(item.id)] === 'old'"
                      class="w-full min-h-[42px] text-sm p-2 border border-gray-200 rounded-default focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>

                  <div v-else-if="typeof item.data?.[n] === 'boolean'" class="flex items-center h-10">
                    <Toggle v-model="item.data[n]" />
                  </div>

                  <div v-else>
                    <input
                      :type="cardValueMode?.[String(item.id)] === 'old' && !item.oldData?.[n] && item.oldData?.[n] !== 0 ? 'text' : 'number'"
                      :value="cardValueMode?.[String(item.id)] === 'old' ? (item.oldData?.[n] || item.oldData?.[n] === 0 ? item.oldData[n] : $t('no old value')) : item.data[n]"
                      @input="(e) => { if (cardValueMode?.[String(item.id)] !== 'old') item.data[n] = Number(e.target.value) }"
                      :disabled="cardValueMode?.[String(item.id)] === 'old'"
                      class="w-full h-10 px-3 border border-gray-200 rounded-default focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 text-sm"
                    />
                  </div>
                </div>

                <div v-else>
                  <Skeleton class="w-full h-10 rounded-default" />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="border-t border-gray-100 flex justify-end shrink-0">
          <button @click="() => regenerateImages(item.id)" class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-default hover:bg-gray-50 flex items-center gap-1.5 transition">
            <IconRefreshOutline class="w-3.5 h-3.5" /> {{ $t('Regenerate') }}
          </button>
        </div>
      </div>
    </div>

    

    <transition name="fade">
      <div v-if="zoomedImage" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" @click.self="closeZoom">
        <transition name="zoom">
          <img v-if="zoomedImage" :src="zoomedImage" class="max-w-[90vw] max-h-[90vh] rounded-default object-contain shadow-2xl" />
        </transition>
      </div>
    </transition>

    <div v-show="totalItems > 0" class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between px-1 py-2 bg-transparent">
      <p class="text-sm text-gray-500">
        {{ $t('Showing') }}
        <span class="font-semibold text-gray-900">{{ fromIndex }}</span>
        {{ $t('to') }}
        <span class="font-semibold text-gray-900">{{ toIndex }}</span>
        {{ $t('of') }}
        <span class="font-semibold text-gray-900">{{ totalItems }}</span>
      </p>

      <div class="inline-flex items-center gap-1 rounded-default border border-gray-200 bg-white px-2 py-1 shadow-sm">
        <button
          class="inline-flex items-center justify-center rounded-default px-3 py-1 text-sm font-medium text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage <= 1"
          @click="previousPage"
        >
          {{ $t('Prev') }}
        </button>

        <template v-for="page in pageButtons" :key="page">
          <button
            class="inline-flex items-center justify-center rounded-default px-3 py-1 text-sm font-medium transition"
            :class="page === currentPage ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
        </template>

        <button
          class="inline-flex items-center justify-center rounded-default px-3 py-1 text-sm font-medium text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage >= totalPages"
          @click="nextPage"
        >
          {{ $t('Next') }}
        </button>
      </div>
    </div>
  </div>
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

const DEFAULT_PAGE_SIZE = 7;
const initialPageSize = props.meta?.pageSize ?? DEFAULT_PAGE_SIZE;
console.log(props.meta?.pageSize);

const pagination = reactive({ offset: 0, limit: initialPageSize });
const zoomedImage = ref(null);
const hovers = ref<Record<string, Record<string, boolean>>>({});
const tableRef = ref(null);
const cardValueMode = ref<Record<string, 'old' | 'new'>>({});

defineExpose({
  refresh() {
    if (tableRef.value) {
      tableRef.value.refreshTable();
    }
  }
});

const paginatedRecords = computed(() => props.records.slice(pagination.offset, pagination.offset + pagination.limit));

const totalItems = computed(() => props.records.length);
const currentPage = computed(() => Math.floor(pagination.offset / pagination.limit) + 1);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pagination.limit)));
const fromIndex = computed(() => totalItems.value === 0 ? 0 : Math.min(pagination.offset + 1, totalItems.value));
const toIndex = computed(() => Math.min(pagination.offset + pagination.limit, totalItems.value));
const pageButtons = computed(() => {
  const pages = [];
  const current = currentPage.value;
  const total = totalPages.value;
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);

  for (let number = start; number <= end; number += 1) {
    pages.push(number);
  }
  return pages;
});
const tableDataProvider = async ({ offset, limit }) => {
  pagination.offset = offset;
  pagination.limit = limit;
  return {
    data: paginatedRecords.value,
    total: props.records.length,
  };
};

watch(() => props.records.length, (newLength) => {
  const maxOffset = Math.max(0, (Math.ceil(newLength / pagination.limit) - 1) * pagination.limit);
  if (pagination.offset > maxOffset) {
    pagination.offset = maxOffset;
  }
});

watch(() => props.meta?.pageSize, (newSize) => {
  const size = Number(newSize) || DEFAULT_PAGE_SIZE;
  pagination.limit = size;
  const maxOffset = Math.max(0, (Math.ceil(props.records.length / pagination.limit) - 1) * pagination.limit);
  if (pagination.offset > maxOffset) {
    pagination.offset = maxOffset;
  }
}, { immediate: true });

watch(() => props.records, (newVal) => {
  hovers.value = Object.fromEntries((newVal || []).map(record => [String(record.id), {}]));
  const newCardValueMode = {};
  (newVal || []).forEach(record => {
    newCardValueMode[String(record.id)] = 'new';
  });
  cardValueMode.value = newCardValueMode;
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

function toggleCardValueMode(recordId: string | number) {
  const key = String(recordId);
  const currentMode = cardValueMode.value[key] || 'new';
  cardValueMode.value[key] = currentMode === 'new' ? 'old' : 'new';
}

function goToPage(page: number) {
  const clampedPage = Math.min(Math.max(page, 1), totalPages.value);
  pagination.offset = (clampedPage - 1) * pagination.limit;
}

function previousPage() {
  goToPage(currentPage.value - 1);
}

function nextPage() {
  goToPage(currentPage.value + 1);
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