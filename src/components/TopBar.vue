<script setup>
import { Bug, Zap } from 'lucide-vue-next'
import { useSeries } from '../composables/useSeries.js'
import { fmtCharges } from '../engine/state-helpers.js'

const props = defineProps({
  debugMode: { type: Boolean, default: false },
  title: { type: String, default: 'ST inspired by' },
})
const emit = defineEmits(['toggle-debug', 'open-stats'])

const { currentSeries } = useSeries()
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 z-30"
    style="
      padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 0;
      background: transparent;
      pointer-events: none;
    "
  >
    <div
      class="max-w-[440px] mx-auto"
      style="
        background: rgba(255,255,255,0.97);
        backdrop-filter: blur(12px);
        border: 1px solid #E0E0E0;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        pointer-events: auto;
      "
    >
      <div class="flex items-center justify-between px-4 py-3">
        <span class="font-display text-sm tracking-wide text-ink-black">{{ title }}</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-1.5 transition-colors"
            :style="{
              background: debugMode ? '#EEEEEE' : '#FFFFFF',
              color: debugMode ? '#DC2626' : '#8A8A8A',
              border: '1px solid ' + (debugMode ? '#DC2626' : '#C8C8C8'),
              borderRadius: '4px',
            }"
            title="Тест-режим"
            @click="emit('toggle-debug')"
          >
            <Bug :size="14" />
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5"
            style="background: #000000; color: #FFFFFF; border-radius: 6px"
            @click="emit('open-stats')"
          >
            <Zap :size="14" color="#FFFFFF" fill="currentColor" />
            <span class="font-mono text-sm font-semibold">{{ fmtCharges(currentSeries.charges) }}</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
