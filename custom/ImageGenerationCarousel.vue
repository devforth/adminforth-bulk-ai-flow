
<template>
  <Dialog
    ref="dialogRef"
    :header="$t('Generate image with AI')"
    :closable="true"
    class="w-full lg:w-[1100px]"
    :beforeCloseFunction="async () => { emit('close'); return true; }"
    :buttons="dialogButtons"
    :click-to-close-outside="false"
  >
    <div class="flex flex-col gap-4">
      <Textarea
        v-model="prompt"
        :placeholder="$t('Prompt which will be passed to AI network')"
        class="w-full text-sm leading-relaxed border border-gray-200 bg-gray-50/30 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-100 rounded-xl focus:outline-none focus:border-gray-300 resize-none"
      />

      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-2">
          <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {{ $t('Source Image') }}
          </p>
          <div class="h-96 rounded-default border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
            <img
              v-if="attachmentFiles[0]"
              :src="attachmentFiles[0]"
              class="w-full h-full object-contain"
            />
            <div v-else class="flex flex-col items-center justify-center gap-2 text-gray-400">
              <svg class="w-12 h-12 text-gray-300 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <p class="text-xs font-medium">{{ $t('No source image') }}</p>
            </div>
          </div>
          <div v-if="attachmentFiles.length > 1" class="flex flex-wrap gap-1.5">
            <img
              v-for="(img, idx) in attachmentFiles"
              :key="idx"
              :src="img"
              class="w-10 h-10 object-cover rounded border border-gray-200"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {{ $t('Generated Image') }}
          </p>
          <div class="relative h-96 rounded-default border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            <div v-if="loading || loadingTimer" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80">
              <Spinner v-if="loading" class="w-8 h-8" />
              <div v-if="loadingTimer" class="mt-3">
                <div v-if="!historicalAverage" class="text-gray-800 dark:text-gray-100 text-sm font-semibold">
                  {{ formatTime(loadingTimer) }} {{ $t('passed...') }}
                </div>
                <div v-else class="w-40">
                  <ProgressBar
                    :currentValue="loadingTimer < historicalAverage ? loadingTimer : historicalAverage"
                    :minValue="0"
                    :maxValue="historicalAverage"
                    :showValues="false"
                    :progressFormatter="(_value: number, _percentage: number) => `${ formatTime(loadingTimer) } ( ~ ${ Math.floor( (
                      loadingTimer < historicalAverage ? loadingTimer : historicalAverage
                    ) / historicalAverage * 100) }% )`"
                  />
                </div>
              </div>
            </div>

            <div v-if="errorMessage" class="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
              <p class="text-red-500 dark:text-red-400 text-sm font-semibold px-4 text-center">{{ errorMessage }}</p>
            </div>

            <Swiper ref="sliderRef" :images="images" class="h-full" />
          </div>
        </div>
      </div>
    </div>
  </Dialog>

</template>

<script setup lang="ts">

import { ref, onMounted, nextTick, Ref, computed } from 'vue'
import { callAdminForthApi } from '@/utils';
import { useI18n } from 'vue-i18n';
import adminforth from '@/adminforth';
import { ProgressBar, Dialog, Textarea, Spinner } from '@/afcl';
import Swiper from './Swiper.vue';

const { t } = useI18n();
const dialogRef = ref(null)
const sliderRef = ref(null)

const prompt = ref('');
const emit = defineEmits(['close', 'selectImage', 'error', 'updateCarouselIndex']);
const props = defineProps(['meta', 'record', 'images', 'recordId', 'prompt', 'fieldName', 'isError', 'errorMessage', 'carouselImageIndex', 'regenerateImagesRefreshRate','sourceImage', 'imageGenerationPrompts']);
const images = ref([]);
const loading = ref(false);
const attachmentFiles = ref<string[]>([])

onMounted(async () => {
  for (const img of props.images || []) {
    images.value.push(img);
  }
  const temp = await getGenerationPrompt() || '';
  attachmentFiles.value = props.sourceImage || [];
  prompt.value = Object.keys(JSON.parse(temp))[0];
  await nextTick();

  const currentIndex = props.carouselImageIndex || 0;
  sliderRef.value?.slideTo(currentIndex);


  let template = '';
  if (prompt.value) {
    template = prompt.value;
  } else {
    template = 'Generate image for field {{field}} in {{resource}}. No text should be on image.';
  }
  prompt.value = template;
  dialogRef.value?.open();
});

const dialogButtons = computed(() => [
  {
    label: t('Cancel'),
    options: {
      class: 'afcl-button',
      mode: 'secondary',
    },
    onclick: () => emit('close'),
  },
  {
    label: t('Use image'),
    options: {
      class: 'afcl-button',
      disabled: loading.value || images.value.length === 0,
      loader: loading.value,
    },
    onclick: () => confirmImage(),
  },
  {
    label: t('Regenerate'),
    options: {
      class: 'afcl-button',
    },
    onclick: () => generateImages(),
  },
]);

async function confirmImage() {
  loading.value = true;

  const currentIndex = sliderRef.value?.getActiveIndex() || 0;
  const img = images.value[currentIndex];

  props.images.splice(0, props.images.length);
  for (const i of images.value) {
    props.images.push(i);
  }

  emit('updateCarouselIndex', currentIndex, props.recordId, props.fieldName);
  emit('selectImage', img, props.recordId, props.fieldName);
  emit('close');

  loading.value = false;
}

const loadingTimer: Ref<number | null> = ref(null);


const errorMessage: Ref<string | null> = ref(null);

const historicalAverage: Ref<number | null> = ref(null);


function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes % 60}m ${Math.floor(seconds % 60)}s`;
}


async function getHistoricalAverage() {
  const resp = await callAdminForthApi({
    path: `/plugin/${props.meta.pluginInstanceId}/averageDuration`,
    method: 'GET',
  });
  historicalAverage.value = resp?.averageDuration || null;
}

async function getGenerationPrompt() {
  const [key, ...rest] = props.imageGenerationPrompts.split(":");
  const value = rest.join(":").trim();

  const json = {
    [key.trim()]: value
  };

  try {
    const resp = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_image_generation_prompts`,
      method: 'POST',
      body: {
        recordId: props.recordId,
        customPrompt: JSON.stringify(json) || {},
      },
    });
    if(!resp) {
      emit('error', {
        isError: true,
        errorMessage: "Error getting generation prompts."
    });
    }
    return resp?.prompt || null;
  } catch (e) {
    emit('error', {
      isError: true,
      errorMessage: e.message
    });
  }
}

async function generateImages() {
  errorMessage.value = null;
  loading.value = true;
  loadingTimer.value = 0;
  const start = Date.now();
  const ticker = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    loadingTimer.value = elapsed;
  }, 100);

  await getHistoricalAverage();
  let resp = null;
  let error = null;
  try {
    resp = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/create-job`,
      method: 'POST',
      body: {
        actionType: 'regenerate_images',
        recordId: props.recordId,
        prompt: prompt.value,
        fieldName: props.fieldName
      },
    });
  } catch (e) {
    console.error(e);
  }

  if (resp?.error) {
    error = resp.error;
  }
  if (!resp) {
    error = t('Error creating image generation job');
  }

  if (error) {
    if (images.value.length === 0) {
      errorMessage.value = error;
    } else {
      adminforth.alert({
        message: error,
        variant: 'danger',
        timeout: 'unlimited',
      });
    }
    return;
  }

  const jobId = resp.jobId;
  let jobStatus = null;
  let jobResponse = null;
  while (jobStatus !== 'completed' && jobStatus !== 'failed') {
    jobResponse = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get-job-status`,
      method: 'POST',
      body: { jobId },
    });
    if (jobResponse?.error) {
      error = jobResponse.error;
      break;
    };
    jobStatus = jobResponse?.job?.status;
    if (jobStatus === 'failed') {
      error = jobResponse?.job?.error || t('Image generation job failed');
    }
    await new Promise((resolve) => setTimeout(resolve, props.regenerateImagesRefreshRate));
  }

  if (error) {
      adminforth.alert({
        message: error,
        variant: 'danger',
        timeout: 'unlimited',
      });
    clearInterval(ticker);
    loadingTimer.value = null;
    loading.value = false;
    return;
  }

  const respImages = jobResponse?.job?.result[props.fieldName] || [];

  images.value = [
    ...images.value,
    ...respImages,
  ];

  clearInterval(ticker);
  loadingTimer.value = null;
  loading.value = false;

  await nextTick();

  sliderRef.value?.slideTo(images.value.length-1);

  await nextTick();

  loading.value = false;
}

</script>