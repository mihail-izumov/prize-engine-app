<script setup>
// Toast queue rendering. Icons come as string names from engine/triggers.js,
// resolved here via lucide-vue-next ICON_MAP.
import { Award, Check, Sparkles, Flame, RefreshCw, Package, Zap, Lock, X, Key } from 'lucide-vue-next'
import { useToast } from '../composables/useToast.js'
import { fmtCharges } from '../engine/state-helpers.js'

const ICON_MAP = { Award, Check, Sparkles, Flame, RefreshCw, Package, Zap, Lock, X, Key }
const { toasts, dismissToast } = useToast()

function toastStyle(t) {
  const isSuccess = t.kind === 'success'
  const isError = t.kind === 'error'
  return {
    background: isSuccess ? '#000000' : '#FFFFFF',
    color: isSuccess ? '#FFFFFF' : '#000000',
    border: '1px solid ' + (isSuccess ? '#000000' : isError ? '#DC2626' : '#C8C8C8'),
    borderRadius: '4px',
    animation: 'toastSlideUp 0.5s cubic-bezier(0.16,1,0.3,1)',
  }
}
</script>

<template>
  <div
    v-if="toasts.length > 0"
    class="fixed left-0 right-0 z-[60] pointer-events-none flex flex-col items-center gap-2 px-4"
    style="bottom: 88px"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      class="pointer-events-auto max-w-[360px] w-full px-4 py-3 flex items-center gap-3 cursor-pointer"
      :style="toastStyle(t)"
      @click="dismissToast(t.id)"
    >
      <span v-if="t.icon" class="flex-shrink-0">
        <component :is="ICON_MAP[t.icon] || Sparkles" :size="16" :stroke-width="2" />
      </span>
      <div class="flex-1 min-w-0">
        <div class="font-mono text-[11px] uppercase tracking-[0.15em] leading-tight">
          {{ t.title }}
        </div>
        <div v-if="t.detail" class="text-[11px] mt-0.5 leading-tight opacity-70">
          {{ t.detail }}
        </div>
      </div>
      <div v-if="t.charges != null" class="flex items-center gap-1 flex-shrink-0">
        <Zap :size="12" fill="currentColor" :stroke-width="2" />
        <span class="font-mono text-sm font-bold">
          {{ t.charges > 0 ? '+' : '' }}{{ fmtCharges(t.charges) }}
        </span>
      </div>
    </div>
  </div>
</template>
