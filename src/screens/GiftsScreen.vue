<script setup>
import { computed } from 'vue'
import { Gift, ChevronRight } from 'lucide-vue-next'
import PrizeIcon from '../components/PrizeIcon.vue'
import {
  SLOT_CATALOG, VARIANT_META, enginePoolToUiCollection,
} from '../engine/constants.js'
import { useSeries } from '../composables/useSeries.js'

const emit = defineEmits(['claim-gift'])

const { currentSeries } = useSeries()

const receivedGifts = computed(() => {
  const out = []
  for (const slot of SLOT_CATALOG) {
    const entry = currentSeries.value.collection.prizes[slot.slotId]
    if (entry && entry.status === 'received' && entry.count > 0) {
      out.push({
        ...slot,
        count: entry.count,
        uiLetter: enginePoolToUiCollection(slot.pool),
      })
    }
  }
  return out
})
</script>

<template>
  <div class="px-5 pt-6 pb-32 space-y-5">
    <div class="text-center">
      <h1
        class="font-display text-3xl tracking-wide"
        style="color: #000000; font-family: 'Space Grotesk', sans-serif"
      >
        Корзина
      </h1>
      <p class="text-[13px] mt-2 leading-relaxed max-w-[320px] mx-auto" style="color: #8A8A8A">
        Подарки, которые ты выбрал. Чтобы получить их физически — покажи QR-код у партнёра.
      </p>
    </div>

    <div
      v-if="receivedGifts.length === 0"
      class="p-8 text-center space-y-3"
      style="border: 1px dashed #C8C8C8; border-radius: 4px"
    >
      <Gift :size="32" color="#C8C8C8" :stroke-width="1.5" class="mx-auto" />
      <div class="font-mono text-[11px] uppercase tracking-[0.15em]" style="color: #8A8A8A">
        Корзина пока пуста
      </div>
      <div class="text-[12px] leading-relaxed" style="color: #8A8A8A">
        Открой коробки и выбери «Забрать», чтобы добавить подарки сюда.
        Или копи заряды и обменивай их на подарки в каталоге.
      </div>
    </div>

    <div v-else class="space-y-2">
      <button
        v-for="gift in receivedGifts"
        :key="gift.slotId"
        type="button"
        class="w-full text-left flex items-center gap-3 p-3 transition-opacity hover:opacity-90"
        style="background: #FFFFFF; border: 1px solid #000000; border-radius: 4px"
        @click="emit('claim-gift', gift)"
      >
        <PrizeIcon :slot-info="gift" :size="48" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <div
              class="inline-flex items-center justify-center w-5 h-5 font-mono text-[10px] font-bold flex-shrink-0"
              style="background: #000000; color: #FFFFFF; border-radius: 2px"
            >
              {{ gift.uiLetter }}
            </div>
            <span
              v-if="VARIANT_META[gift.variant]?.label"
              class="font-mono text-[8px] px-1 py-0.5 uppercase tracking-wider"
              style="background: #000000; color: #FFFFFF; border-radius: 2px"
            >
              {{ VARIANT_META[gift.variant].label }}
            </span>
            <span v-if="gift.count > 1" class="font-mono text-[9px]" style="color: #8A8A8A">
              ×{{ gift.count }}
            </span>
          </div>
          <div class="text-[13px] leading-tight mt-1 truncate" style="color: #000000">
            {{ gift.name }}
          </div>
          <div class="font-mono text-[10px] mt-0.5 uppercase tracking-wider" style="color: #8A8A8A">
            ждёт получения
          </div>
        </div>
        <ChevronRight :size="16" color="#000000" />
      </button>
    </div>
  </div>
</template>
