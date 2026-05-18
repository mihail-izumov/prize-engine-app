<script setup>
// Toast queue rendering. Icons come as string names from engine/triggers.js,
// resolved here via lucide-vue-next ICON_MAP.
//
// β.2(α): toast container moved from bottom:88px to top:safe-area to stop
// overlapping the mascot speech bubble at the bottom of the viewport.
//
// β.2(α.bis): slide-OUT polish without <TransitionGroup>. Local mirror
// `visibleToasts` + `leavingIds` array lets us defer DOM removal by 350ms
// so the slide-up animation plays before the row disappears. Works
// uniformly for click-dismiss AND auto-dismiss (useToast internal
// setTimeout) — both paths remove from useToast.toasts, which the watcher
// observes. The enter vs leave animation is driven inline via toastStyle()
// (no class swap, no !important override) to keep the bundle delta tight.
// useToast.js itself is untouched per HANDOFF §1 hard constraints.
//
// z-[52] sits above TamaMascot (z-50) but below ModalGiftClaim/Details (z-[55]).
import { ref, watch } from 'vue'
import { Award, Check, Sparkles, Flame, RefreshCw, Package, Zap, Lock, X, Key } from 'lucide-vue-next'
import { useToast } from '../composables/useToast.js'
import { fmtCharges } from '../engine/state-helpers.js'

const ICON_MAP = { Award, Check, Sparkles, Flame, RefreshCw, Package, Zap, Lock, X, Key }
const { toasts, dismissToast } = useToast()

const visibleToasts = ref([])
const leavingIds = ref([])

watch(toasts, (next) => {
  for (const t of visibleToasts.value) {
    if (!next.some(n => n.id === t.id)) {
      leavingIds.value = [...leavingIds.value, t.id]
      setTimeout(() => {
        visibleToasts.value = visibleToasts.value.filter(v => v.id !== t.id)
        leavingIds.value = leavingIds.value.filter(x => x !== t.id)
      }, 350)
    }
  }
  for (const t of next) {
    if (!visibleToasts.value.some(v => v.id === t.id)) {
      visibleToasts.value = [...visibleToasts.value, t]
    }
  }
})

function toastStyle(t) {
  const isSuccess = t.kind === 'success'
  const isError = t.kind === 'error'
  const leaving = leavingIds.value.includes(t.id)
  return {
    background: isSuccess ? '#000000' : '#FFFFFF',
    color: isSuccess ? '#FFFFFF' : '#000000',
    border: '1px solid ' + (isSuccess ? '#000000' : isError ? '#DC2626' : '#C8C8C8'),
    borderRadius: '4px',
    animation: leaving
      ? 'toastSlideOut 0.35s cubic-bezier(0.4,0,0.6,1) forwards'
      : 'toastSlideDown 0.5s cubic-bezier(0.16,1,0.3,1)',
  }
}
</script>

<template>
  <div
    v-if="visibleToasts.length > 0"
    class="fixed left-0 right-0 z-[52] pointer-events-none flex flex-col items-center gap-2 px-4"
    :style="{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }"
  >
    <div
      v-for="t in visibleToasts"
      :key="t.id"
      class="pointer-events-auto max-w-[360px] w-full px-4 py-3 flex items-center gap-3 cursor-pointer"
      :style="toastStyle(t)"
      @click="!leavingIds.includes(t.id) && dismissToast(t.id)"
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
