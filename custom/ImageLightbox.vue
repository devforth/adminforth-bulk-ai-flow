<template>
  <Teleport to="body">
    <div
      v-if="src"
      class="af-image-lightbox fixed inset-0 z-[100] flex items-center justify-center bg-black/90 cursor-zoom-out"
      @click="src = null"
    >
      <img :src="src" alt="" class="max-w-[90vw] max-h-[90vh] rounded-lg object-contain select-none" />
      <button
        type="button"
        class="absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white/40 transition-colors"
        :aria-label="t('Close')"
      >
        <IconX class="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconX } from '@iconify-prerendered/vue-lucide';

// a photo is dark in both themes, so the lightbox keeps black and white tints instead of tokens
const src = defineModel<string | null>({ required: true });

const { t } = useI18n();

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    src.value = null;
  }
}

watch(src, (value) => {
  if (value) {
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>
