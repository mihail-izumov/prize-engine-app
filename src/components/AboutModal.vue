<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// AboutModal.vue — Phase 3B. Юр-формула программы лояльности.
// Source: PrizeEnginePWA.jsx (2629-2681).
// ═══════════════════════════════════════════════════════════════════════════
import { X } from 'lucide-vue-next'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-center justify-center p-6"
    style="background: rgba(0,0,0,0.85)"
    @click="emit('close')"
  >
    <div
      class="max-w-[380px] w-full p-6 space-y-4"
      style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
      @click.stop
    >
      <div class="flex items-center justify-between">
        <h2
          class="font-display text-lg uppercase tracking-wider"
          style="color: #000000; font-family: 'Space Grotesk', sans-serif"
        >
          О программе лояльности
        </h2>
        <button type="button" style="color: #8A8A8A" @click="emit('close')">
          <X :size="20" />
        </button>
      </div>

      <div class="text-[13px] leading-relaxed" style="color: #4A4A4A">
        Это программа лояльности, не лотерея. Ты совершаешь действие
        (покупаешь коробку) и гарантированно получаешь подарок. У тебя
        есть выбор: забрать подарок или обменять его на заряды для покупки
        другого подарка из коллекции. Заряды нельзя обменять на деньги или
        передать другому игроку.
      </div>

      <div class="text-[11px] leading-relaxed" style="color: #8A8A8A">
        Prize Engine v0.3 · Пилот
      </div>

      <button
        type="button"
        class="w-full py-3 font-mono text-[11px] uppercase tracking-[0.2em]"
        style="background: #000000; color: #FFFFFF; border: 1px solid #000000; border-radius: 4px"
        @click="emit('close')"
      >
        Понятно
      </button>
    </div>
  </div>
</template>
