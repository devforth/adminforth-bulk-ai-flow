<template>
  <div class="vision-table-container overflow-auto pr-2" style="max-height: calc(100vh - 260px);">
    <div class="records-grid p-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      <div 
        v-for="item in paginatedRecords" 
        :key="item.id"
        class="record-card bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-default p-4 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between gap-4"
      >
        <div class="flex flex-col h-full">
          <div class="record-card-header flex items-start justify-between gap-4 mb-4">
            <div class="flex items-center gap-3 w-full min-w-0">
              <Checkbox 
                v-model="item.isChecked" 
                class="shrink-0"
              />
              <!-- CRITICAL WRAPPER -->
              <div class="flex-1 min-w-0 w-0">
                <h3 class="font-bold text-gray-900 dark:text-white w-full truncate overflow-hidden whitespace-nowrap">
                  {{ item.label || item.data?.name || $t('Item Record') }}
                </h3>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0" v-if="hasNonImageOutputFields">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {{ cardValueMode?.[String(item.id)] === 'old' ? $t('OLD VALUE') : $t('NEW VALUE') }}
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
            </div>
          </div>

          <div class="flex flex-col gap-3 flex-grow">
            <div
              v-if="props.meta.isAttachFiles"
              class="source-images-section w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 border border-dashed border-gray-200 dark:border-gray-600 h-full max-h-[260px] max-w-[446.5px] rounded-default text-center "
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
                <div class="text-gray-400 dark:text-gray-500 flex flex-col items-center justify-center w-full h-[258px]">
                  <svg
                    class="w-20 h-20 mb-2 stroke-1 text-gray-300 dark:text-gray-600"
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
                <div class="text-gray-400 dark:text-gray-500 flex flex-col items-center justify-center h-full">
                  <svg
                    class="w-20 h-20 mb-2 stroke-1 text-gray-300 dark:text-gray-600"
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
            
            <div class="fields-section flex flex-col gap-3">
              <div
                v-for="n in customFieldNames"
                :key="n"
                class="flex flex-col relative"
                @mouseenter="(() => { setHover(item.id, n, true) })" 
                @mouseleave="(() => { setHover(item.id, n, false) })"
              >
                <div class="flex justify-between items-center mb-1">
                  <label class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ n.replace(/([A-Z])/g, ' $1').trim() }}
                  </label>
                  
                  <div class="flex gap-1 items-center" v-if="!isInColumnImage(n)">
                    <Tooltip v-if="checkForError(item, n)">
                      <IconExclamationCircleSolid class="w-4 h-4 text-red-500" />
                      <template #tooltip>{{ checkForError(item, n) }}</template>
                    </Tooltip>
                  </div>
                </div>

                <div v-if="isInColumnImage(n)">
                  <div v-if="item.aiStatus?.generatedImages" class="flex flex-col gap-2">
                    <div v-if="isValidUrl(item.data?.[n])" class="flex items-center gap-3 relative w-full">
                      <Skeleton v-if="imageLoadErrors[item.id]?.[n]" type="image" class="w-full h-[280px]" />
                      <img
                        v-else
                        :key="item.data?.[n]"
                        :src="item.data?.[n]"
                        class="w-full max-h-[280px] object-cover border cursor-pointer  hover:border-blue-500 rounded-default"
                        @error="() => { imageLoadErrors[item.id] ??= {}; imageLoadErrors[item.id][n] = true }"
                        @click="() => zoomImage(item.data?.[n])"
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
                    <div v-else>
                      <div class="text-gray-400 dark:text-gray-500 flex flex-col items-center justify-center w-full h-[258px] bg-gray-50 dark:bg-gray-700 border border-dashed border-gray-200 dark:border-gray-600">
                        <svg
                          class="w-20 h-20 mb-2 stroke-1 text-gray-300 dark:text-gray-600"
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
                    </div>

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
                    <Skeleton type="image" class="w-full h-[258px] rounded-default" />
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
                      class="w-full h-10 px-3 border border-gray-200 dark:border-gray-600 rounded-default bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-sm focus:outline-none"
                    />
                  </div>
                  
                  <div v-else-if="typeof item.data?.[n] === 'string' || typeof item.data?.[n] === 'object'">
                    <textarea
                      :value="cardValueMode?.[String(item.id)] === 'old' ? (item.oldData?.[n] || item.oldData?.[n] === 0 ? item.oldData[n] : $t('no old value')) : item.data[n]"
                      @input="(e) => { if (cardValueMode?.[String(item.id)] !== 'old') item.data[n] = e.target.value }"
                      :disabled="cardValueMode?.[String(item.id)] === 'old'"
                      class="w-full text-sm p-2 border border-gray-200 dark:border-gray-600 rounded-default bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500"
                      :class="props.meta.isAttachFiles ? 'min-h-[42px]' : 'min-h-[120px]'"
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
                      class="w-full h-10 px-3 border border-gray-200 dark:border-gray-600 rounded-default bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 text-sm"
                    />
                  </div>
                </div>

                <div v-else>
                  <Skeleton type="input" class="w-full h-10 rounded-default" />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="record-actions flex justify-end shrink-0">
          <button
            @click="() => canRegenerate(item) && regenerateRecord(item.id)"
            :disabled="!canRegenerate(item)"
            class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-default hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-700"
          >
            <IconRefreshOutline class="w-3.5 h-3.5" /> {{ $t('Regenerate') }}
          </button>
        </div>
      </div>
    </div>

    

    <transition name="fade">
      <div v-if="zoomedImage" class="zoom-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" @click.self="closeZoom">
        <transition name="zoom">
          <img v-if="zoomedImage" :src="zoomedImage" class="max-w-[90vw] max-h-[90vh] rounded-default object-contain shadow-2xl" />
        </transition>
      </div>
    </transition>

    <nav v-show="totalItems > 0" class="pagination-nav bg-lightTableBackground dark:bg-darkTableBackground py-3 flex flex-col gap-2 items-center sm:flex-row justify-center sm:justify-between px-4 mt-4 rounded-default">
      <span class="text-sm font-normal text-center text-lightTablePaginationText dark:text-darkTablePaginationText sm:mb-4 md:mb-0 block w-full md:inline md:w-auto">
        {{ $t('Showing') }}
        <span class="font-semibold text-lightTablePaginationNumeration dark:text-darkTablePaginationNumeration">{{ fromIndex }}</span>
        {{ $t('to') }}
        <span class="font-semibold text-lightTablePaginationNumeration dark:text-darkTablePaginationNumeration">{{ toIndex }}</span>
        {{ $t('of') }}
        <span class="font-semibold text-lightTablePaginationNumeration dark:text-darkTablePaginationNumeration">{{ totalItems }}</span>
      </span>
      <div class="af-pagination-container flex flex-row items-center gap-3">
        <div class="inline-flex">
          <button
            class="flex items-center py-1 px-3 gap-1 text-sm font-medium text-lightActivePaginationButtonText bg-lightActivePaginationButtonBackground border-r-0 rounded-s hover:opacity-90 dark:bg-darkActivePaginationButtonBackground dark:text-darkActivePaginationButtonText disabled:opacity-50"
            :disabled="currentPage <= 1"
            @click="previousPage"
          >
            <svg class="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5H1m0 0 4 4M1 5l4-4"/>
            </svg>
          </button>
          <button
            class="flex items-center py-1 px-3 text-sm font-medium text-lightUnactivePaginationButtonText focus:outline-none bg-lightUnactivePaginationButtonBackground border-r-0 border border-lightUnactivePaginationButtonBorder hover:bg-lightUnactivePaginationButtonHoverBackground hover:text-lightUnactivePaginationButtonHoverText dark:bg-darkUnactivePaginationButtonBackground dark:text-darkUnactivePaginationButtonText dark:border-darkUnactivePaginationButtonBorder dark:hover:text-darkUnactivePaginationButtonHoverText dark:hover:bg-darkUnactivePaginationButtonHoverBackground disabled:opacity-50"
            :disabled="currentPage <= 1"
            @click="goToPage(1)"
          >1</button>
          <input
            type="text"
            v-model="pageInput"
            :style="{ width: `${Math.max(1, pageInput.length + 4)}ch` }"
            class="min-w-10 outline-none inline-block w-auto py-1.5 px-3 text-sm text-center text-lightTablePaginationInputText border border-lightTablePaginationInputBorder bg-lightTablePaginationInputBackground dark:border-darkTablePaginationInputBorder dark:text-darkTablePaginationInputText dark:bg-darkTablePaginationInputBackground z-10"
            @keydown="onPageKeydown"
            @blur="validatePageInput"
          />
          <button
            class="flex items-center py-1 px-3 text-sm font-medium text-lightUnactivePaginationButtonText focus:outline-none bg-lightUnactivePaginationButtonBackground border-l-0 border border-lightUnactivePaginationButtonBorder hover:bg-lightUnactivePaginationButtonHoverBackground hover:text-lightUnactivePaginationButtonHoverText dark:bg-darkUnactivePaginationButtonBackground dark:text-darkUnactivePaginationButtonText dark:border-darkUnactivePaginationButtonBorder dark:hover:text-darkUnactivePaginationButtonHoverText dark:hover:bg-darkUnactivePaginationButtonHoverBackground disabled:opacity-50"
            :disabled="currentPage >= totalPages"
            @click="goToPage(totalPages)"
          >{{ totalPages }}</button>
          <button
            class="flex items-center py-1 px-3 gap-1 text-sm font-medium text-lightActivePaginationButtonText focus:outline-none bg-lightActivePaginationButtonBackground border-l-0 rounded-e hover:opacity-90 dark:bg-darkActivePaginationButtonBackground dark:text-darkActivePaginationButtonText disabled:opacity-50"
            :disabled="currentPage >= totalPages"
            @click="nextPage"
          >
            <svg class="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 5h12m0 0L9 1m4 4L9 9"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, computed, reactive } from 'vue'
import { Select, Input, Textarea, Table, Checkbox, Skeleton, Toggle, Tooltip } from '@/afcl'
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
  overwriteExistingValues: boolean,
}>();
const emit = defineEmits(['error', 'regenerateImages', 'regenerateCell', 'regenerateRecord']);

function regenerateRecord(recordId: any) {
  emit('regenerateRecord', { recordId });
}

function canRegenerate(item: any): boolean {
  if (props.overwriteExistingValues) return true;
  for (const n of props.customFieldNames) {
    const val = item.data?.[n];
    if (val === null || val === undefined || val === '') return true;
  }
  return false;
}

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

const imageLoadErrors = ref<Record<string, Record<string, boolean>>>({})

const totalItems = computed(() => props.records.length);
const currentPage = computed(() => Math.floor(pagination.offset / pagination.limit) + 1);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pagination.limit)));
const fromIndex = computed(() => totalItems.value === 0 ? 0 : Math.min(pagination.offset + 1, totalItems.value));
const toIndex = computed(() => Math.min(pagination.offset + pagination.limit, totalItems.value));
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

const hasNonImageOutputFields = computed(() => {
  if (!props.customFieldNames) return false;
  
  for (const fieldName of props.customFieldNames) {
    const isImage = isInColumnImage(fieldName);
    if (!isImage) return true;
  }
  
  return false;
});

function convertColumnEnumToSelectOptions(columnEnumArray: any[], key: string) {
  const col = columnEnumArray.find(c => c.name === key);
  if (!col) return [];
  return col.enum.map(item => ({
    label: item.label,
    value: item.value
  }));
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

const pageInput = ref(String(currentPage.value));
watch(currentPage, (val) => { pageInput.value = String(val); });

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

function onPageKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') validatePageInput();
}

function validatePageInput() {
  const parsed = parseInt(pageInput.value);
  if (!isNaN(parsed)) goToPage(parsed);
  pageInput.value = String(currentPage.value);
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

.overflow-auto {
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}
</style>