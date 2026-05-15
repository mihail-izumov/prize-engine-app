<script setup>
// Full CollectionScreen — A/B/C tabs, claimed section, filter, 2-col shop grid, stickers row.
// Источник: PrizeEnginePWA.jsx (1116-1409).
import { ref, computed } from 'vue'
import { Sparkles, Zap, ChevronRight } from 'lucide-vue-next'
import PrizeIcon from '../components/PrizeIcon.vue'
import {
  SLOT_CATALOG, STICKER_CATALOG,
  UI_COLLECTION_META, UI_COLLECTION_ORDER, VARIANT_META,
  enginePoolToUiCollection, getGiftBuyPrice, getExchangePrice,
} from '../engine/constants.js'
import { fmtCharges, boxesEstimate, pluralBoxes } from '../engine/state-helpers.js'
import { useSeries } from '../composables/useSeries.js'

const emit = defineEmits(['select-gift'])

const { currentSeries } = useSeries()
const activeUI = ref('A')
const zoneFilter = ref('all') // 'all' | 'can'

// charges getter
const charges = computed(() => currentSeries.value.charges)
const collection = computed(() => currentSeries.value.collection)
const avgPerBox = 300 // DEFAULT_CONFIG.baseCharges — Profile screen в будущем будет считать актуально

const groups = computed(() => {
  const out = { A: [], B: [], C: [] }
  for (const slot of SLOT_CATALOG) {
    const ui = enginePoolToUiCollection(slot.pool)
    const entry = collection.value.prizes[slot.slotId] || { count: 0, status: 'not_received' }
    out[ui].push({
      ...slot,
      count: entry.count || 0,
      status: entry.status || 'not_received',
      buyPrice: getGiftBuyPrice(slot.tier, slot.variant),
      exchangePrice: getExchangePrice(slot.tier, slot.variant),
      uiLetter: ui,
    })
  }
  return out
})

const split = computed(() => {
  const slots = groups.value[activeUI.value] || []
  const shop = []
  const claimed = []
  for (const s of slots) {
    if (s.status === 'claimed') claimed.push(s)
    else if (s.status !== 'received') shop.push(s)
    // received = in cart → skip (visible in GiftsScreen)
  }
  shop.sort((a, b) => {
    if (a.variant === 'Gold' && b.variant !== 'Gold') return 1
    if (b.variant === 'Gold' && a.variant !== 'Gold') return -1
    return (b.buyPrice || 0) - (a.buyPrice || 0)
  })
  return { shopSlots: shop, claimedSlots: claimed }
})

const canCount = computed(() => {
  let can = 0
  for (const s of split.value.shopSlots) {
    if (s.variant === 'Gold' || s.buyPrice == null) continue
    if (charges.value >= s.buyPrice) can++
  }
  return can
})

const filteredShopSlots = computed(() => {
  if (zoneFilter.value !== 'can') return split.value.shopSlots
  return split.value.shopSlots.filter(s => {
    if (s.variant === 'Gold' || s.buyPrice == null) return true
    return charges.value >= s.buyPrice
  })
})

function stats(uiLetter) {
  const slots = groups.value[uiLetter] || []
  const claimed = slots.filter(s => s.status === 'claimed').length
  return { received: claimed, total: slots.length }
}

const stickerOwned = computed(
  () => STICKER_CATALOG.filter(s => (collection.value.stickers[s.stickerId] || 0) > 0).length
)

// Card-level helpers
function showProgress(slot) {
  return slot.status !== 'received' && slot.variant !== 'Gold' && slot.buyPrice != null
}
function canAfford(slot) {
  return slot.buyPrice != null && charges.value >= slot.buyPrice
}
function progressPct(slot) {
  if (!showProgress(slot) || slot.buyPrice <= 0) return 0
  return Math.min(100, Math.round((charges.value / slot.buyPrice) * 100))
}
function remainingCharges(slot) {
  if (!showProgress(slot)) return 0
  return Math.max(0, slot.buyPrice - charges.value)
}
</script>

<template>
  <div class="px-5 pt-6 pb-32 space-y-5">
    <!-- Header -->
    <div class="text-center">
      <h1
        class="font-display text-3xl tracking-wide"
        style="color: #000000; font-family: 'Space Grotesk', sans-serif"
      >
        Коллекции
      </h1>
    </div>

    <!-- A/B/C tile selector — horizontal scroll-snap -->
    <div
      class="overflow-x-auto pb-2 -mx-5 px-5 no-scrollbar"
      style="scroll-snap-type: x proximity; scroll-padding: 0 20px; -webkit-overflow-scrolling: touch; touch-action: pan-x"
    >
      <div class="flex gap-3" style="width: max-content">
        <button
          v-for="uiLetter in UI_COLLECTION_ORDER"
          :key="uiLetter"
          type="button"
          class="relative flex-shrink-0 flex flex-col items-center justify-center transition-all"
          :style="{
            width: '180px',
            height: '140px',
            background: activeUI === uiLetter ? '#000000' : '#FFFFFF',
            color: activeUI === uiLetter ? '#FFFFFF' : '#000000',
            border: '1px solid ' + (activeUI === uiLetter ? '#000000' : '#C8C8C8'),
            borderRadius: '4px',
            scrollSnapAlign: 'start',
          }"
          @click="activeUI = uiLetter"
        >
          <div
            class="font-display leading-none"
            style="font-family: 'Space Grotesk', sans-serif; font-size: 52px; font-weight: 700; letter-spacing: 0.02em"
          >
            {{ UI_COLLECTION_META[uiLetter].label }}
          </div>
          <div
            class="font-mono text-[10px] uppercase tracking-[0.2em] mt-2"
            :style="{ opacity: activeUI === uiLetter ? 0.85 : 0.65 }"
          >
            {{ UI_COLLECTION_META[uiLetter].description }}
          </div>
          <div
            class="absolute top-2 right-2 flex items-center justify-center font-mono"
            :style="{
              minWidth: '36px',
              height: '22px',
              padding: '0 8px',
              fontSize: '10px',
              fontWeight: 600,
              background: activeUI === uiLetter ? '#FFFFFF' : '#000000',
              color:      activeUI === uiLetter ? '#000000' : '#FFFFFF',
              borderRadius: '11px',
            }"
          >
            {{ stats(uiLetter).received }}/{{ stats(uiLetter).total }}
          </div>
        </button>
      </div>
    </div>

    <!-- Моя коллекция (claimed) -->
    <section v-if="split.claimedSlots.length > 0">
      <div class="font-mono text-xs uppercase tracking-[0.25em] mb-3" style="color: #8A8A8A">
        Моя коллекция
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="slot in split.claimedSlots"
          :key="slot.slotId"
          type="button"
          class="text-left flex flex-col items-center p-3 gap-2"
          style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          @click="emit('select-gift', slot)"
        >
          <PrizeIcon :slot-info="slot" :size="80" />
          <div class="text-[12px] leading-tight text-center" style="color: #000000">
            {{ slot.name }}
          </div>
        </button>
      </div>
    </section>

    <!-- Filter toggle -->
    <button
      v-if="canCount > 0"
      type="button"
      class="w-full py-3 font-mono text-sm uppercase tracking-[0.1em] transition-colors"
      :style="{
        background: zoneFilter === 'can' ? '#000000' : '#FFFFFF',
        color: zoneFilter === 'can' ? '#FFFFFF' : '#000000',
        border: '1px solid #000000',
        borderRadius: '4px',
      }"
      @click="zoneFilter = zoneFilter === 'can' ? 'all' : 'can'"
    >
      {{ zoneFilter === 'can' ? 'Сбросить фильтр' : `Что взять за ${fmtCharges(charges)}⚡` }}
    </button>
    <div
      v-else
      class="w-full py-3 px-4 text-center font-mono text-[11px] leading-relaxed"
      style="background: #FFFFFF; color: #8A8A8A; border: 1px solid #C8C8C8; border-radius: 4px"
    >
      Подкопи заряды, собирай суперсилы — и обменивай на подарки
    </div>

    <!-- 2-col shop grid -->
    <div class="grid grid-cols-2 gap-3">
      <button
        v-for="slot in filteredShopSlots"
        :key="slot.slotId"
        type="button"
        class="text-left flex flex-col p-3 gap-2 transition-opacity hover:opacity-90 relative overflow-hidden"
        :style="{
          background: slot.status === 'received' ? '#EEEEEE' : '#FFFFFF',
          border: '1px solid ' + (slot.status === 'received' ? '#000000' : '#C8C8C8'),
          borderRadius: '4px',
          opacity: slot.status !== 'received' && slot.variant !== 'Gold' && !canAfford(slot) ? 0.55 : 1,
        }"
        @click="emit('select-gift', slot)"
      >
        <!-- Gold shimmer -->
        <div
          v-if="slot.variant === 'Gold'"
          style="position: absolute; inset: 0; background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%); background-size: 200% 100%; animation: prizeShimmer 3s linear infinite; pointer-events: none; border-radius: 4px"
        />
        <!-- Top: variant badge -->
        <div class="flex items-start min-h-[16px] relative">
          <span
            v-if="VARIANT_META[slot.variant]?.label"
            class="font-mono text-[8px] px-1 py-0.5 uppercase tracking-wider"
            style="background: #000000; color: #FFFFFF; border-radius: 2px"
          >
            {{ VARIANT_META[slot.variant].label }}
          </span>
          <span v-else></span>
        </div>
        <!-- Icon -->
        <div class="flex justify-center py-3 relative">
          <PrizeIcon
            :slot-info="slot"
            :size="112"
            :dim="slot.status !== 'received' && !canAfford(slot) && slot.variant !== 'Gold'"
          />
        </div>
        <!-- Name -->
        <div
          class="text-[12px] leading-tight min-h-[28px] relative"
          :style="{ color: slot.status === 'received' ? '#000000' : '#4A4A4A' }"
        >
          {{ slot.name }}
        </div>
        <!-- Progress -->
        <div v-if="showProgress(slot)" class="relative" style="min-height: 26px">
          <div v-if="canAfford(slot)" class="font-mono text-[10px]" style="color: #000000">
            <span style="color: #000000">хватает</span>
            <span v-if="charges - slot.buyPrice > 0" style="color: #8A8A8A">
              · останется {{ fmtCharges(charges - slot.buyPrice) }}
            </span>
          </div>
          <template v-else>
            <div class="font-mono text-[9px] leading-tight" style="color: #8A8A8A">
              ещё {{ fmtCharges(remainingCharges(slot)) }}
              <span v-if="boxesEstimate(remainingCharges(slot), avgPerBox) > 0">
                · ~{{ boxesEstimate(remainingCharges(slot), avgPerBox) }} {{ pluralBoxes(boxesEstimate(remainingCharges(slot), avgPerBox)) }}
              </span>
            </div>
            <div
              class="mt-1.5"
              style="height: 2px; background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 1px; overflow: hidden"
            >
              <div
                style="height: 100%; background: #4A4A4A; transition: width 0.3s ease"
                :style="{ width: progressPct(slot) + '%' }"
              />
            </div>
          </template>
        </div>
        <!-- Bottom price -->
        <div class="flex items-center justify-between pt-1 relative">
          <span
            v-if="slot.status === 'received'"
            class="font-mono text-[10px] uppercase tracking-wider"
            style="color: #000000"
          >
            В корзине
          </span>
          <span
            v-else-if="slot.buyPrice != null"
            class="font-mono text-xs flex items-center gap-0.5"
            :style="{ color: canAfford(slot) ? '#000000' : '#8A8A8A' }"
          >
            <Zap :size="11" fill="currentColor" :stroke-width="2" />
            {{ fmtCharges(slot.buyPrice) }}
          </span>
          <span v-else class="font-mono text-[10px]" style="color: #8A8A8A">
            только при выпадении
          </span>
          <ChevronRight :size="14" :color="slot.status === 'received' ? '#000000' : '#8A8A8A'" />
        </div>
      </button>
      <div
        v-if="filteredShopSlots.length === 0"
        class="col-span-2 p-6 text-center font-mono text-[11px]"
        style="color: #8A8A8A; border: 1px dashed #C8C8C8; border-radius: 4px"
      >
        ничего не подходит под фильтр
      </div>
    </div>

    <!-- Stickers strip -->
    <section>
      <div class="flex items-center justify-between px-4 py-3">
        <span class="font-mono text-xs uppercase tracking-[0.25em]" style="color: #000000">
          Стикеры
        </span>
        <span class="font-mono text-sm" style="color: #000000">
          {{ stickerOwned }} / {{ STICKER_CATALOG.length }}
        </span>
      </div>
      <div
        class="flex gap-3 px-4 pb-4 overflow-x-auto no-scrollbar"
        style="scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch"
      >
        <div
          v-for="sticker in STICKER_CATALOG"
          :key="sticker.stickerId"
          class="flex-shrink-0 flex flex-col items-center gap-1"
          style="scroll-snap-align: start"
        >
          <div
            class="flex items-center justify-center"
            :style="{
              width: '144px',
              height: '144px',
              background: (collection.stickers[sticker.stickerId] || 0) > 0 ? '#EEEEEE' : '#FFFFFF',
              borderRadius: '12px',
              opacity: (collection.stickers[sticker.stickerId] || 0) > 0 ? 1 : 0.4,
            }"
          >
            <Sparkles
              :size="64"
              :color="(collection.stickers[sticker.stickerId] || 0) > 0 ? '#000000' : '#C8C8C8'"
              :stroke-width="1.5"
            />
          </div>
          <span
            v-if="(collection.stickers[sticker.stickerId] || 0) > 0"
            class="font-mono text-[9px] px-1.5 py-0.5"
            style="background: #000000; color: #FFFFFF; border-radius: 8px"
          >
            ×{{ collection.stickers[sticker.stickerId] }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>
