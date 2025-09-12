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
  if (swiperEl && swiperEl.swiper) {
    return swiperEl.swiper.activeIndex;
  }
  return 0;
}

function slideTo(index) {
  
  if (!swiperEl || !swiperEl.swiper) {
    setTimeout(() => slideTo(index), 50);
    return;
  }
  
  if (index >= 0 && index < props.images.length) {
    swiperEl.swiper.update();
    setTimeout(() => {
      swiperEl.swiper.slideTo(index, 300);
    }, 10);
  }
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
    allowTouchMove: true,
  }

  Object.assign(swiperEl, swiperParams)
  swiperEl.initialize()
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
