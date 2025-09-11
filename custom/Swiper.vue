<template>
  <swiper-container class="flex items-center justify-center w-full h-full">
    <swiper-slide v-for="(image, index) in images" :key="index">
        <img :src="image" class="object-contain w-full h-full" />
    </swiper-slide>
  </swiper-container>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { register } from 'swiper/element/bundle'
import { SwiperOptions } from 'swiper/types';

const props = defineProps<{images: string[]}>()
let swiperEl: any;

function getActiveIndex() {
  return swiperEl.swiper.activeIndex
}

function slideTo(index) {
  swiperEl.swiper.slideTo(index)
}

defineExpose({
  getActiveIndex,
  slideTo
})

register()
onMounted(() => {
swiperEl = document.querySelector('swiper-container')

  const swiperParams: SwiperOptions = {
    slidesPerView: 1,
    navigation: true,
    pagination: {
        type: 'fraction',
    },
    on: {
      init() {
        console.log('swiper initialized')
      },
    },
  }

  Object.assign(swiperEl, swiperParams)
  swiperEl.initialize()
  swiperEl.swiper;
})
</script>

<style>
.swiper {
  width: 100%;
  height: 100%;
}

.swiper-slide {
  text-align: center;
  font-size: 18px;
  background: #444;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
