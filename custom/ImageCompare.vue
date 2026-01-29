<template>
  <!-- Popup Overlay -->
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50" @click.self="closePopup">
    <div class="image-compare-container shadow-sm p-4 border-white dark:border-black max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800">
      <!-- Close Button -->
      <div class="flex justify-end mb-4">
        <button type="button" 
            @click="closePopup"
            class="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white" >
            <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
            </svg>
            <span class="sr-only">{{ $t('Close modal') }}</span>
        </button>
      </div>
      <div class="flex gap-4 items-start justify-between">
        <h3 class="text-sm font-medium text-gray-700 dark:text-white mb-2">{{ $t('Old Image') }}</h3>
        <h3 class="text-sm font-medium text-gray-700 dark:text-white mb-2">{{ $t('New Image') }}</h3>
      </div>
      <div class="flex gap-4 items-center">
        <!-- Old Image -->
        <div class="flex-1">
          <div class="relative">
            <img
              v-if="isValidUrl(compiledOldImage)"
              ref="oldImg"
              :src="compiledOldImage"
              alt="Old image"
              class="w-full max-w-sm h-auto object-cover rounded-lg cursor-pointer border hover:border-blue-500 transition-colors duration-200"
            />
            <div v-else class="w-full max-w-sm h-48 bg-gray-100 rounded-lg flex items-center justify-center">
              <p class="text-gray-500">{{ $t('No old image') }}</p>
            </div>
          </div>
        </div>

        <!-- Comparison Arrow -->
        <div class="flex items-center justify-center">
          <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center dark:bg-gray-500">
            <svg class="w-4 h-4 text-blue-600 dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>

        <!-- New Image -->
        <div class="flex-1">
          <div class="relative">
            <img
              v-if="isValidUrl(newImage)"
              ref="newImg"
              :src="newImage"
              alt="New image"
              class="w-full max-w-sm h-auto object-cover rounded-lg cursor-pointer border hover:border-blue-500 transition-colors duration-200"
            />
            <div v-else class="w-full max-w-sm h-48 bg-gray-100 rounded-lg flex items-center justify-center">
              <p class="text-gray-500">{{ $t('No new image') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>


</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import mediumZoom from 'medium-zoom'
import { callAdminForthApi } from '@/utils';

const props = defineProps<{
  oldImage: string
  newImage: string
  meta: any
  columnName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const oldImg = ref<HTMLImageElement | null>(null)
const newImg = ref<HTMLImageElement | null>(null)
const oldZoom = ref<any>(null)
const newZoom = ref<any>(null)
const compiledOldImage = ref<string>('')

async function compileOldImage() {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/compile_old_image_link`,
      method: 'POST',
      body: {
        image: props.oldImage,
        columnName: props.columnName,
      },
    });
    compiledOldImage.value = res.previewUrl;
  } catch (e) {
    console.error("Error compiling old image:", e)
    return;
  }
}

function closePopup() {
  emit('close')
}

function isValidUrl(str: string): boolean {
  if (!str) return false
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

function initializeZoom() {
  // Clean up existing zoom instances
  if (oldZoom.value) {
    oldZoom.value.detach()
  }
  if (newZoom.value) {
    newZoom.value.detach()
  }

  // Initialize zoom for old image
  if (oldImg.value && isValidUrl(compiledOldImage.value)) {
    oldZoom.value = mediumZoom(oldImg.value, {
      margin: 24,
      background: 'rgba(0, 0, 0, 0.8)',
      scrollOffset: 150
    })
  }

  // Initialize zoom for new image
  if (newImg.value && isValidUrl(props.newImage)) {
    newZoom.value = mediumZoom(newImg.value, {
      margin: 24,
      background: 'rgba(0, 0, 0, 0.8)',
      scrollOffset: 150
    })
  }
}

onMounted(async () => {
  await compileOldImage()
  await nextTick()
  initializeZoom()
})

// Re-initialize zoom when images change
watch([() => props.oldImage, () => props.newImage, () => compiledOldImage.value], async () => {
  await nextTick()
  initializeZoom()
})
</script>

<style scoped>
.medium-zoom-image {
  z-index: 999999;
  background: rgba(0, 0, 0, 0.8);
  border: none;
  border-radius: 0;
}
.medium-zoom-overlay {
  z-index: 99999;
  background: rgba(0, 0, 0, 0.8);
}
html.dark .medium-zoom-overlay {
  background: rgba(17, 24, 39, 0.8);
}
body.medium-zoom--opened aside {
  filter: grayscale(1);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>