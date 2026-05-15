<script setup>
import { ref } from 'vue'
import { Camera, Bug } from 'lucide-vue-next'
import { parseQrCode } from '../engine/draw-engine.js'
import { usePartition } from '../composables/usePartition.js'

const props = defineProps({
  debugMode: { type: Boolean, default: false },
})
const emit = defineEmits(['scan'])

const { isClosed } = usePartition()

const manualCode = ref('')
const error = ref(null)

function submit() {
  const trimmed = manualCode.value.trim().toUpperCase()
  if (!parseQrCode(trimmed).ok) {
    error.value = 'Неверный формат кода. Пример: ST-A-0027'
    return
  }
  error.value = null
  emit('scan', trimmed)
  manualCode.value = ''
}

function onInput(e) {
  manualCode.value = e.target.value
  error.value = null
}

function onKeyDown(e) {
  if (e.key === 'Enter') submit()
}
</script>

<template>
  <div class="px-5 pt-6 pb-32 space-y-6">
    <!-- Hero -->
    <div class="text-center space-y-2">
      <h1
        class="font-display text-3xl tracking-wide"
        style="color: #000000; font-family: 'Space Grotesk', sans-serif"
      >
        Открой коробку
      </h1>
      <p class="text-[13px] max-w-[280px] mx-auto leading-relaxed" style="color: #8A8A8A">
        Наведи камеру на QR-код с коробки или введи его вручную
      </p>
    </div>

    <!-- Camera placeholder -->
    <div
      class="relative aspect-square overflow-hidden"
      style="background: #FFFFFF; border: 2px dashed #C8C8C8; border-radius: 4px"
    >
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div
          class="w-20 h-20 flex items-center justify-center"
          style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
        >
          <Camera :size="32" color="#8A8A8A" :stroke-width="1.5" />
        </div>
        <div
          class="font-mono text-[10px] uppercase tracking-[0.2em] text-center leading-relaxed"
          style="color: #C8C8C8"
        >
          Камера подключится<br/>в production-сборке
        </div>
      </div>
      <!-- corner brackets -->
      <div class="absolute top-3 left-3 w-6 h-6"
           style="border-left: 2px solid #000000; border-top: 2px solid #000000"></div>
      <div class="absolute top-3 right-3 w-6 h-6"
           style="border-right: 2px solid #000000; border-top: 2px solid #000000"></div>
      <div class="absolute bottom-3 left-3 w-6 h-6"
           style="border-left: 2px solid #000000; border-bottom: 2px solid #000000"></div>
      <div class="absolute bottom-3 right-3 w-6 h-6"
           style="border-right: 2px solid #000000; border-bottom: 2px solid #000000"></div>
      <!-- scan line -->
      <div
        class="absolute inset-x-3 top-1/2 h-px"
        style="background: #000000; opacity: 0.7; animation: pulse 1.5s ease-in-out infinite"
      ></div>
    </div>

    <!-- Manual input -->
    <div class="space-y-2">
      <label
        class="block font-mono text-[10px] uppercase tracking-[0.2em] pl-1"
        style="color: #8A8A8A"
      >
        Ввести код вручную
      </label>
      <div class="flex gap-2">
        <input
          type="text"
          :value="manualCode"
          @input="onInput"
          @keydown="onKeyDown"
          placeholder="ST-A-0001"
          :disabled="isClosed"
          class="flex-1 px-4 py-3 font-mono text-sm focus:outline-none"
          style="background: #FFFFFF; border: 1px solid #C8C8C8; color: #000000; border-radius: 4px"
        />
        <button
          type="button"
          @click="submit"
          :disabled="isClosed || !manualCode.trim()"
          class="px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] transition-opacity"
          :style="{
            background: (isClosed || !manualCode.trim()) ? '#FFFFFF' : '#000000',
            color: (isClosed || !manualCode.trim()) ? '#C8C8C8' : '#FFFFFF',
            border: '1px solid ' + ((isClosed || !manualCode.trim()) ? '#C8C8C8' : '#000000'),
            borderRadius: '4px',
            cursor: (isClosed || !manualCode.trim()) ? 'not-allowed' : 'pointer',
          }"
        >
          Ввод
        </button>
      </div>
      <div v-if="error" class="text-xs font-mono pl-1" style="color: #000000">{{ error }}</div>
      <div v-if="isClosed" class="text-xs font-mono pl-1" style="color: #4A4A4A">
        Партия раскрыта полностью. Сбрось в debug-панели.
      </div>
    </div>

    <div
      v-if="debugMode"
      class="mt-4 p-3"
      style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
    >
      <div class="flex items-center gap-2">
        <Bug :size="14" color="#4A4A4A" />
        <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
          Тест-режим активен (DebugPanel — Фаза 3)
        </span>
      </div>
    </div>
  </div>
</template>
