<template>
    <Table
      :columns="tableHeaders"
      :data="tableColumns"
      :pageSize="6"
      >
      <!-- HEADER TEMPLATE -->
      <template #header:checkboxes="{ item }">
        {{ $t('MARK FOR SAVE') }}
      </template>
      <!-- CHECKBOX CELL TEMPLATE -->
      <template #cell:checkboxes="{ item }">
        <div class="max-w-[100px] flex items-center justify-center">
          <Checkbox
            v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])].isChecked"
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
      <template v-for="n in customFieldNames" :key="n" #[`cell:${n}`]="{ item, column }">
        <div v-if="(isAnalyzing(item, n) && !(props.regeneratingFieldsStatus[item[props.primaryKey]] && props.regeneratingFieldsStatus[item[props.primaryKey]][n])) && !isInColumnImage(n)" @mouseenter="(() => { hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = true})" @mouseleave="(() => { hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = false})">
          <div class="flex gap-1 justify-end">
            <Tooltip v-if="checkForError(item, n)">
              <IconExclamationCircleSolid class="my-2 w-5 h-5 text-red-500" />
              <template #tooltip> 
                {{ checkForError(item, n) }}
              </template>
            </Tooltip>
            <Tooltip>
              <IconRefreshOutline class="my-2 w-5 h-5 hover:text-blue-500" :class="{ 'opacity-50 cursor-not-allowed hover': shouldDisableRegenerateFieldIcon(item, n) }" @click="regerenerateFieldIconClick(item, n)"/>
              <template #tooltip> 
                {{ shouldDisableRegenerateFieldIcon(item, n) ? $t("Can't analyze image without source image") : $t('Regenerate') }}
              </template>
            </Tooltip>
          </div>
          <div v-if="isInColumnEnum(n)" class="flex flex-col items-start justify-end min-h-[90px]">
              <Select
                class="min-w-[150px]"
                :options="convertColumnEnumToSelectOptions(props.meta.columnEnums, n)"
                v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :teleportToTop="true"
                :teleportToBody="false"
              >
              </Select>
              <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
                <template #tooltip>
                  {{  oldData[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }}
                </template>
              </Tooltip>
          </div>
            <div v-else-if="typeof selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] === 'string' || typeof selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] === 'object'" class="flex flex-col items-start justify-end min-h-[90px]">
            <Textarea
              class="min-w-[150px] h-full"
              type="text"
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
            >
            </Textarea>
            <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
              <template #tooltip>
                <p class="max-w-[200px]">{{  oldData[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }}</p>
              </template>
            </Tooltip>
            </div>
          <div v-else-if="typeof selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] === 'boolean'" class="flex flex-col items-center justify-end min-h-[90px]">
            <Toggle
              class="p-2"
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
            >
            </Toggle>
            <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
              <template #tooltip>
                {{  oldData[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }}
              </template>
            </Tooltip>
          </div>
          <div v-else class="flex flex-col items-start justify-end min-h-[90px]">
            <Input
              type="number"
              v-model="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
              class="w-full min-w-[80px]"
              :fullWidth="true"
            />
            <Tooltip>
                <div class="mt-2 flex items-center justify-start gap-1 hover:text-blue-500" :class="{ 'opacity-0': !hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }">
                  <p class="text-sm ">{{ $t('old value') }}</p>
                </div>
              <template #tooltip>
                {{  oldData[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }}
              </template>
            </Tooltip>
          </div>
        </div>

        <div v-if="isAiResponseReceivedImage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])]" @mouseenter="(() => { hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = true})" @mouseleave="(() => { hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = false})">
          <div v-if="isInColumnImage(n)">
            <div class="mt-2 mb-2 flex items-center justify-start gap-2">
              <div v-if="isValidUrl(selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n])" class="flex flex-col items-center relative">
              <img 
                :src="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                class="w-20 h-20 object-cover rounded cursor-pointer border hover:border-blue-500 transition"
                @click="() => {openGenerationCarousel[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = true}"
              />
              <p
                v-if="isImageHasPreviewUrl[n]"
                class="absolute mt-20 text-sm hover:text-blue-500 hover:underline hover:cursor-pointer flex items-center gap-1"
                :class="{ 'opacity-0': !hovers[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] }"
                @click="() => {openImageCompare[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = true}"  
              >
                {{ $t('old image') }}
              </p>
              </div>
              <div v-else class="flex items-center justify-center text-center w-20 h-20">
                <Tooltip v-if="imageGenerationErrorMessage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] === 'No source images found'">
                  <p
                  >
                    {{ $t("Can't generate image.") }}
                  </p>
                  <template #tooltip>
                    {{ imageGenerationErrorMessage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] }}
                  </template>
                </Tooltip>
                <Tooltip v-else>
                  <div>
                    <IconRefreshOutline
                      @click="() => {regenerateImages(item[primaryKey])}"
                      class="w-20 h-20 hover:text-blue-500 cursor-pointer transition hover:scale-105"
                    />
                  </div>
                  <template #tooltip>
                    {{ imageGenerationErrorMessage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] + '. Click to retry.' }}
                  </template>
                </Tooltip>
              </div>
            </div>
            <div>
              <GenerationCarousel
                v-if="openGenerationCarousel[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :images="carouselSaveImages[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :recordId="item[primaryKey]"
                :meta="props.meta"
                :fieldName="n"
                :carouselImageIndex="carouselImageIndex[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :regenerateImagesRefreshRate="regenerateImagesRefreshRate"
                :sourceImage="item.images && item.images.length ? item.images : null"
                :imageGenerationPrompts="imageGenerationPrompts[n]"
                @error="handleError"
                @close="openGenerationCarousel[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = false"
                @selectImage="updateSelectedImage"
                @updateCarouselIndex="updateActiveIndex"
              />
              <ImageCompare
                v-if="openImageCompare[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :meta="props.meta"
                :columnName="n"
                :oldImage="oldData[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                :newImage="selected[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n]"
                @close="openImageCompare[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])][n] = false"
              />
            </div>
          </div>
        </div>

        <div v-if="!isAiResponseReceivedImage[tableColumnsIndexes.findIndex(el => el[primaryKey] === item[primaryKey])] && isInColumnImage(n)">
            <Skeleton type="image" class="w-20 h-20" />
        </div>

        <div v-if="(!isAnalyzing(item, n) || (props.regeneratingFieldsStatus[item[props.primaryKey]] && props.regeneratingFieldsStatus[item[props.primaryKey]][n])) && !isInColumnImage(n)">
          <Skeleton class="w-full h-6" />
        </div>
      </template>
    </Table>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue'
import { Select, Input, Textarea, Table, Checkbox, Skeleton, Toggle, Tooltip } from '@/afcl'
import GenerationCarousel from './ImageGenerationCarousel.vue'
import ImageCompare from './ImageCompare.vue';
import { IconRefreshOutline, IconExclamationCircleSolid } from '@iconify-prerendered/vue-flowbite';

const props = defineProps<{
  meta: any,
  tableHeaders: any,
  tableColumns: any,
  customFieldNames: any,
  tableColumnsIndexes: any,
  selected: any,
  isAiResponseReceivedAnalizeImage: boolean[],
  isAiResponseReceivedAnalizeNoImage: boolean[],
  isAiResponseReceivedImage: boolean[],
  primaryKey: any,
  openGenerationCarousel: any,
  openImageCompare: any,
  isError: boolean,
  errorMessage: string
  carouselSaveImages: any[]
  carouselImageIndex: any[]
  regenerateImagesRefreshRate: number
  isAiGenerationError: boolean[],
  aiGenerationErrorMessage: string[],
  isAiImageGenerationError: boolean[],
  imageGenerationErrorMessage: string[],
  oldData: any[],
  isImageHasPreviewUrl: Record<string, boolean>
  imageGenerationPrompts: Record<string, any>
  isImageToTextGenerationError: boolean[],
  imageToTextErrorMessages: string[],
  isTextToTextGenerationError: boolean[],
  textToTextErrorMessages: string[],
  outputImageFields: string[],
  outputFieldsForAnalizeFromImages: string[],
  outputPlainFields: string[],
  regeneratingFieldsStatus: Record<string, Record<string, boolean>>
}>();
const emit = defineEmits(['error', 'regenerateImages', 'regenerateCell']);


const zoomedImage = ref(null);
const hovers = ref<{ [key: string]: boolean }[]>([]);

watch(() => props.tableColumnsIndexes, (newVal) => {
  if (newVal) {
    hovers.value = newVal.map(() => ({}));
  }
}, { immediate: true });

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
  props.selected[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === id)][fieldName] = image;
}

function handleError({ isError, errorMessage }) {
  emit('error', {
    isError,
    errorMessage
  });
}

function regenerateImages(recordInfo: any) {
  emit('regenerateImages', {
    recordInfo
  });
}

function updateActiveIndex(newIndex: number, id: any, fieldName: string) {
  props.carouselImageIndex[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === id)][fieldName] = newIndex;
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
    recordId: item[props.primaryKey],
    fieldName: name
  });
};

function shouldDisableRegenerateFieldIcon(item, name) {
  if (props.outputFieldsForAnalizeFromImages.findIndex( el => el === name) !== -1 &&
      props.imageToTextErrorMessages[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === item[props.primaryKey])] === 'No source images found') {
    return true;
  }
  return false;
}

function checkForError(item, name) {
  if (props.outputFieldsForAnalizeFromImages.findIndex( el => el === name) !== -1) {
    const errorMessage = props.imageToTextErrorMessages[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === item[props.primaryKey])];
    if (errorMessage) {
      return errorMessage;
    }
  }
  if (props.outputPlainFields.findIndex( el => el === name) !== -1) {
    const errorMessage = props.textToTextErrorMessages[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === item[props.primaryKey])];
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
  const isImagesAnalyzing = props.isAiResponseReceivedAnalizeImage[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === item[props.primaryKey])]
  return isImagesAnalyzing;
}

function isNoImageAnalyzing(item) {
  const isNoImageAnalyzing = props.isAiResponseReceivedAnalizeNoImage[props.tableColumnsIndexes.findIndex(el => el[props.primaryKey] === item[props.primaryKey])]
  return isNoImageAnalyzing;
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