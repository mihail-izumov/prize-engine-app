<script setup>
import { computed } from 'vue'
import { X, QrCode, Zap } from 'lucide-vue-next'
import PrizeIcon from './PrizeIcon.vue'
import { VARIANT_META, getExchangePrice } from '../engine/constants.js'
import { fmtCharges } from '../engine/state-helpers.js'
import { sha256Bytes, utf8Bytes } from '../engine/sha256.js'
import { usePartition } from '../composables/usePartition.js'

const props = defineProps({
  gift: { type: Object, default: null },
  playerId: { type: String, required: true },
})
const emit = defineEmits(['close', 'mark-claimed', 'return-gift'])

const { partitionState } = usePartition()

const claimCode = computed(() => {
  if (!props.gift) return ''
  const h = sha256Bytes(utf8Bytes(`${props.playerId}|${props.gift.slotId}|claim`))
  return `PRZ-${h.substring(0, 4).toUpperCase()}-${h.substring(4, 8).toUpperCase()}`
})

const partner = computed(() => partitionState.value.partition.partnerId)
const park = computed(() => partitionState.value.partition.parkId)

const validUntil = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
})

const returnPrice = computed(() => props.gift ? (getExchangePrice(props.gift.tier, props.gift.variant) || 0) : 0)
</script>

<template>
  <div
    v-if="gift"
    class="fixed inset-0 z-[55] flex items-center justify-center p-5"
    style="background: rgba(0,0,0,0.85)"
    @click="emit('close')"
  >
    <div
      class="max-w-[360px] w-full p-5 space-y-4"
      style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; max-height: 90vh; overflow-y: auto"
      @click.stop
    >
      <div class="flex items-start justify-between">
        <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #8A8A8A">
          Получение подарка
        </div>
        <button type="button" @click="emit('close')" style="color: #8A8A8A">
          <X :size="20" />
        </button>
      </div>

      <div class="flex justify-center py-3">
        <PrizeIcon :slot-info="gift" :size="80" />
      </div>

      <div class="text-center">
        <h3
          class="font-display text-base leading-tight tracking-wide"
          style="color: #000000; font-family: 'Space Grotesk', sans-serif"
        >
          {{ gift.name }}
        </h3>
      </div>

      <div class="p-4 text-center" style="background: #000000; color: #FFFFFF; border-radius: 4px">
        <div class="font-mono text-[10px] uppercase tracking-wider mb-1" style="color: #C8C8C8">
          Код получения
        </div>
        <div class="font-mono text-2xl tracking-[0.1em]" style="color: #FFFFFF">
          {{ claimCode }}
        </div>
      </div>

      <div
        class="aspect-square mx-auto flex items-center justify-center"
        style="width: 140px; background: #000000; border: 1px solid #000000; border-radius: 4px"
      >
        <QrCode :size="100" color="#FFFFFF" :stroke-width="1.5" />
      </div>

      <div class="space-y-2">
        <div class="p-3" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px">
          <div class="font-mono text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
            Где получить
          </div>
          <div class="text-[13px] mt-1" style="color: #000000">Партнёр: {{ partner }}</div>
          <div class="font-mono text-[11px] mt-0.5" style="color: #4A4A4A">Точка: {{ park }}</div>
        </div>

        <div class="p-3" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px">
          <div class="font-mono text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
            Как получить
          </div>
          <ol class="text-[12px] mt-1 space-y-1 list-decimal list-inside" style="color: #4A4A4A">
            <li>Подойди к стойке партнёра</li>
            <li>Покажи QR-код или продиктуй код {{ claimCode }}</li>
            <li>Сотрудник выдаст подарок и отметит его в системе</li>
          </ol>
        </div>

        <div class="p-3" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px">
          <div class="font-mono text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
            Срок получения
          </div>
          <div class="text-[13px] mt-1" style="color: #000000">до {{ validUntil }}</div>
        </div>
      </div>

      <div class="space-y-2">
        <button
          type="button"
          class="w-full py-3 font-display text-sm uppercase tracking-[0.15em] transition-opacity hover:opacity-90"
          style="background: #000000; color: #FFFFFF; border: 1px solid #000000; border-radius: 4px"
          @click="emit('mark-claimed', gift)"
        >
          Подарок получен
        </button>
        <button
          type="button"
          class="w-full py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-opacity hover:opacity-70 flex items-center justify-center gap-2"
          style="background: transparent; color: #4A4A4A; border: 1px solid #C8C8C8; border-radius: 4px"
          @click="emit('return-gift', gift)"
        >
          <span>Вернуть в каталог</span>
          <span style="color: #000000">+{{ fmtCharges(returnPrice) }}⚡</span>
        </button>
      </div>
    </div>
  </div>
</template>
