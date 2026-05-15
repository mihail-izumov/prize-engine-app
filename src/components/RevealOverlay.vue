<script setup>
// 3-фазная reveal-анимация. Phase 3 показывает карточку приза, Take/Exchange.
// Источник: PrizeEnginePWA.jsx (743-976).
import { computed } from 'vue'
import {
  Sparkles, Zap, Radio, FlaskConical, Key, Shield, Target,
  User, Gift, Package, Flame,
} from 'lucide-vue-next'
import { useReveal } from '../composables/useReveal.js'
import { useSeries } from '../composables/useSeries.js'
import { fmtCharges, slotInfoById } from '../engine/state-helpers.js'
import {
  getExchangePrice, getRevealTintForSeries,
  enginePoolToUiCollection, UI_COLLECTION_META,
  VARIANT_META, CARD_META,
} from '../engine/constants.js'
import { DEFAULT_CONFIG, SPARK_CONFIG } from '../engine/draw-engine.js'

const ICON_MAP = {
  radio: Radio, card: FlaskConical, keychain: Key, patch: Shield, magnet: Target,
  figure: User, plush: Gift, giftbox: Package, flame: Flame,
}

const emit = defineEmits(['take', 'exchange'])

const { reveal, revealPhase } = useReveal()
const { activeSeries } = useSeries()

const slotInfo = computed(() => reveal.value ? slotInfoById(reveal.value.result.revealedSlotId) : null)
const tint = computed(() => getRevealTintForSeries(activeSeries.value))
const uiLetter = computed(() => reveal.value ? enginePoolToUiCollection(reveal.value.result.pool) : 'C')
const collMeta = computed(() => UI_COLLECTION_META[uiLetter.value] || UI_COLLECTION_META.C)
const isGold = computed(() => reveal.value?.result.variant === 'Gold')
const exchangePrice = computed(() => {
  if (!reveal.value) return null
  if (isGold.value) return null
  return getExchangePrice(reveal.value.result.tier, reveal.value.result.variant)
})
const variantLabel = computed(() => reveal.value ? VARIANT_META[reveal.value.result.variant]?.label : '')
const wasLastOne = computed(() => reveal.value?.result.wasLastOne === true)
const cardFound = computed(() => {
  const cf = reveal.value?.result.cardFound
  return (cf && cf !== 'none') ? cf : null
})
const prizeIcon = computed(() => slotInfo.value ? (ICON_MAP[slotInfo.value.icon] || Package) : Package)

function flash2Background() {
  // Использует tint из series — STRATEGY-VI §4: цвет ТОЛЬКО в reveal-overlay
  const center = tint.value?.flashCenter || '#FFFFFF'
  const outer = tint.value?.flashOuter || `${center}22`
  return `radial-gradient(circle at center, ${center}80, ${outer} 50%, transparent 75%)`
}
</script>

<template>
  <div
    v-if="reveal && revealPhase"
    class="fixed inset-0 z-50 flex items-center justify-center p-6"
    style="background: rgba(0,0,0,0.96)"
  >
    <!-- PHASE 1: charging — monochrome pulsing core -->
    <div
      v-if="revealPhase === 'charging'"
      class="flex flex-col items-center gap-6"
      style="animation: fadeIn 0.3s ease"
    >
      <div class="relative">
        <div
          class="w-40 h-40 rounded-full"
          style="border: 2px solid #4A4A4A; animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite"
        />
        <div
          class="absolute inset-4 rounded-full"
          style="border: 2px solid #C8C8C8; animation: spin 1.2s linear infinite"
        />
        <div
          class="absolute inset-10 rounded-full"
          style="background: rgba(255,255,255,0.10); animation: pulse 1.5s ease-in-out infinite"
        />
        <div class="absolute inset-0 flex items-center justify-center">
          <Sparkles
            :size="40"
            color="#FFFFFF"
            :stroke-width="1.5"
            style="animation: pulse 1.5s ease-in-out infinite"
          />
        </div>
      </div>
      <div
        class="font-mono text-[11px] uppercase tracking-[0.3em]"
        style="color: #8A8A8A; animation: pulse 1.5s ease-in-out infinite"
      >
        открытие коробки
      </div>
    </div>

    <!-- PHASE 2: flash — radial color burst по IP tint -->
    <div
      v-else-if="revealPhase === 'flash'"
      class="fixed inset-0"
      :style="{
        background: flash2Background(),
        animation: 'flashBurst 0.4s ease-out',
      }"
    />

    <!-- PHASE 3: show — gift card + Take/Exchange -->
    <div
      v-else-if="revealPhase === 'show'"
      class="relative max-w-[340px] w-full"
      style="animation: revealBounce 0.6s cubic-bezier(0.34,1.56,0.64,1)"
    >
      <!-- Last One banner -->
      <div v-if="wasLastOne" class="mb-4 text-center">
        <div
          class="inline-block px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em]"
          style="background: #FFFFFF; color: #000000; border-radius: 2px"
        >
          ★ Last One · +{{ DEFAULT_CONFIG.lastOneBonus }} бонус
        </div>
      </div>

      <!-- Gift card — dark surface tinted by IP -->
      <div
        class="relative p-6"
        :style="{
          background: tint.cardSurface || '#1A1A1A',
          border: '2px solid ' + (tint.cardBorder || '#4A4A4A'),
          borderRadius: '4px',
        }"
      >
        <!-- Top row: UI collection badge + variant badge -->
        <div class="flex items-center justify-between mb-3">
          <div
            class="inline-flex items-center justify-center w-8 h-8 font-mono text-base font-bold"
            :style="{
              background: collMeta.accentHex,
              color: tint.badgeText || '#000000',
              borderRadius: '2px',
            }"
          >
            {{ collMeta.label }}
          </div>
          <span
            v-if="variantLabel"
            class="px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
            style="background: #FFFFFF; color: #000000; border-radius: 2px"
          >
            {{ variantLabel }}
          </span>
        </div>

        <!-- Icon -->
        <div class="flex justify-center py-6">
          <div
            class="inline-flex items-center justify-center"
            style="width: 160px; height: 160px; background: #000000; border: 1px solid #4A4A4A; border-radius: 4px"
          >
            <component :is="prizeIcon" :size="72" color="#FFFFFF" :stroke-width="1.5" />
          </div>
        </div>

        <!-- Name -->
        <div class="text-center">
          <div
            class="font-display text-xl leading-tight tracking-wide"
            style="color: #FFFFFF; font-family: 'Space Grotesk', sans-serif"
          >
            {{ slotInfo?.name }}
          </div>
        </div>

        <!-- Price chip -->
        <div v-if="exchangePrice != null" class="mt-4 flex justify-center">
          <div
            class="inline-flex items-center gap-2 px-4 py-2"
            style="background: #FFFFFF; color: #000000; border-radius: 999px"
          >
            <Zap :size="20" color="#000000" fill="currentColor" :stroke-width="2" />
            <span class="font-mono" style="font-size: 24px; font-weight: 700; letter-spacing: 0.02em">
              {{ fmtCharges(exchangePrice) }}
            </span>
          </div>
        </div>

        <!-- Instant bonus indicator -->
        <div v-if="exchangePrice != null" class="mt-3 flex justify-center">
          <span
            v-if="cardFound"
            class="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
            style="background: rgba(255,255,255,0.15); color: #FFFFFF; border-radius: 999px"
          >
            <Sparkles :size="12" />
            {{ CARD_META[cardFound].label }}
          </span>
          <span
            v-else
            class="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
            style="background: rgba(255,255,255,0.15); color: #FFFFFF; border-radius: 999px"
          >
            <Zap :size="12" fill="currentColor" />
            +{{ SPARK_CONFIG.bonusCharges }} Мгновенный бонус
          </span>
        </div>
      </div>

      <!-- Take / Exchange -->
      <div class="mt-5 grid grid-cols-2 gap-2">
        <div class="flex flex-col items-center gap-1.5">
          <button
            type="button"
            class="w-full py-3 font-display text-sm uppercase tracking-[0.15em] transition-opacity hover:opacity-80"
            style="background: transparent; color: #FFFFFF; border: 1px solid #FFFFFF; border-radius: 4px"
            @click="emit('take')"
          >
            Забрать
          </button>
          <span class="font-mono text-[9px] text-center leading-tight" style="color: #8A8A8A">
            Подарок попадёт в корзину
          </span>
        </div>
        <div v-if="!isGold" class="flex flex-col items-center gap-1.5">
          <button
            type="button"
            class="w-full py-3 font-display text-sm uppercase tracking-[0.15em] transition-opacity hover:opacity-90"
            style="background: #FFFFFF; color: #000000; border: 1px solid #FFFFFF; border-radius: 4px"
            @click="emit('exchange')"
          >
            Копить ⚡
          </button>
          <span class="font-mono text-[9px] text-center leading-tight" style="color: #8A8A8A">
            Обменять на заряды
          </span>
        </div>
        <div
          v-else
          class="py-3 font-mono text-[10px] uppercase tracking-[0.15em] flex items-center justify-center text-center leading-tight"
          style="background: transparent; color: #8A8A8A; border: 1px solid #4A4A4A; border-radius: 4px"
        >
          эксклюзив<br/>не обменивается
        </div>
      </div>
    </div>
  </div>
</template>
