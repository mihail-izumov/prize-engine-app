<script setup>
import { computed } from 'vue'
import { X, Zap } from 'lucide-vue-next'
import PrizeIcon from './PrizeIcon.vue'
import { UI_COLLECTION_META, VARIANT_META } from '../engine/constants.js'
import { fmtCharges } from '../engine/state-helpers.js'

const props = defineProps({
  slot: { type: Object, default: null },
  charges: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'purchase'])

const isReceived = computed(() => props.slot && (props.slot.status === 'received' || props.slot.status === 'claimed'))
const isGold = computed(() => props.slot?.variant === 'Gold')
const canAfford = computed(() => props.slot?.buyPrice != null && props.charges >= props.slot.buyPrice)
const collMeta = computed(() => props.slot ? UI_COLLECTION_META[props.slot.uiLetter] : null)
const variantLabel = computed(() => props.slot ? VARIANT_META[props.slot.variant]?.label : '')
</script>

<template>
  <div
    v-if="slot"
    class="fixed inset-0 z-[55] flex items-center justify-center p-5"
    style="background: rgba(0,0,0,0.85)"
    @click="emit('close')"
  >
    <div
      class="max-w-[360px] w-full p-5 space-y-4"
      style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; max-height: 90vh; overflow-y: auto"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <div
            class="inline-flex items-center justify-center w-7 h-7 font-mono text-sm font-bold"
            style="background: #000000; color: #FFFFFF; border-radius: 2px"
          >
            {{ collMeta?.label }}
          </div>
          <div>
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #000000">
              Коллекция {{ collMeta?.label }}
            </div>
            <div class="font-mono text-[9px]" style="color: #8A8A8A">
              {{ collMeta?.description }}
            </div>
          </div>
        </div>
        <button type="button" @click="emit('close')" style="color: #8A8A8A">
          <X :size="20" />
        </button>
      </div>

      <!-- Big icon -->
      <div class="flex justify-center py-4">
        <PrizeIcon :slot-info="slot" :size="120" />
      </div>

      <!-- Variant badge -->
      <div v-if="variantLabel" class="text-center">
        <span
          class="inline-block px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
          style="background: #000000; color: #FFFFFF; border-radius: 2px"
        >
          {{ variantLabel }}
        </span>
      </div>

      <!-- Name -->
      <div class="text-center">
        <h3
          class="font-display text-lg leading-tight tracking-wide"
          style="color: #000000; font-family: 'Space Grotesk', sans-serif"
        >
          {{ slot.name }}
        </h3>
      </div>

      <!-- Price block -->
      <div
        v-if="slot.buyPrice != null"
        class="p-4 flex items-center"
        style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
      >
        <div class="flex-1">
          <div class="font-mono text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
            Обмен
          </div>
          <div class="flex items-baseline gap-1 mt-0.5">
            <Zap :size="14" color="#000000" fill="currentColor" />
            <span class="font-mono text-xl" style="color: #000000">
              {{ fmtCharges(slot.buyPrice) }}
            </span>
          </div>
        </div>
        <div style="width: 1px; height: 40px; background: #C8C8C8"></div>
        <div class="flex-1 text-right">
          <div class="font-mono text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
            Заряды
          </div>
          <div
            class="font-mono text-xl mt-0.5 flex items-center justify-end gap-1"
            :style="{ color: canAfford ? '#000000' : '#8A8A8A' }"
          >
            <Zap :size="14" fill="currentColor" :stroke-width="2" />
            {{ fmtCharges(charges) }}
          </div>
        </div>
      </div>
      <div
        v-else-if="isGold"
        class="p-4 text-center"
        style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
      >
        <div class="font-mono text-[10px] uppercase tracking-wider mb-1" style="color: #8A8A8A">
          Эксклюзив
        </div>
        <div class="text-[12px] leading-relaxed" style="color: #4A4A4A">
          GOLD 1/100 — этот подарок нельзя купить за заряды.
          Достаётся только при выпадении в коробке (1 шанс на партию).
        </div>
      </div>

      <!-- Status info -->
      <div
        v-if="isReceived"
        class="p-3 text-center font-mono text-[11px] uppercase tracking-[0.15em]"
        style="background: #000000; color: #FFFFFF; border-radius: 4px"
      >
        {{ slot.status === 'claimed' ? 'В моей коллекции' : 'В корзине — ждёт получения' }}
      </div>

      <!-- CTA -->
      <div v-if="!isGold && !isReceived">
        <button
          v-if="canAfford"
          type="button"
          class="w-full py-3 font-display text-sm uppercase tracking-[0.15em] transition-opacity hover:opacity-80 flex items-center justify-center gap-1"
          style="background: #000000; color: #FFFFFF; border: 1px solid #000000; border-radius: 4px"
          @click="emit('purchase', slot)"
        >
          <span>Обменять за</span>
          <Zap :size="14" fill="currentColor" :stroke-width="2" />
          <span>{{ fmtCharges(slot.buyPrice) }}</span>
        </button>
        <div
          v-else
          class="w-full py-3 font-mono text-[11px] uppercase tracking-[0.15em] flex items-center justify-center gap-1"
          style="background: #FFFFFF; color: #8A8A8A; border: 1px solid #C8C8C8; border-radius: 4px"
        >
          <span>Подкопить</span>
          <Zap :size="11" fill="currentColor" :stroke-width="2" />
          <span>{{ fmtCharges(slot.buyPrice - charges) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
