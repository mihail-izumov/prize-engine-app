<script setup>
import { computed } from 'vue'
import { Scan, Package, ShoppingBasket, Zap } from 'lucide-vue-next'
import { useSeries } from '../composables/useSeries.js'

const props = defineProps({
  activeTab: { type: String, required: true },
  cartPing: { type: Number, default: 0 },
  collPing: { type: Number, default: 0 },
})
const emit = defineEmits(['change'])

const TABS = [
  { id: 'scanner',    label: 'Сканер',     Icon: Scan },
  { id: 'collection', label: 'Коллекции',  Icon: Package },
  { id: 'gifts',      label: 'Корзина',    Icon: ShoppingBasket },
  { id: 'powers',     label: 'Силы',       Icon: Zap },
]

const { currentSeries } = useSeries()

const giftsCount = computed(
  () => Object.values(currentSeries.value.collection.prizes)
    .filter(p => p.status === 'received' && p.count > 0).length
)
const collectionCount = computed(
  () => Object.values(currentSeries.value.collection.prizes)
    .filter(p => p.status === 'claimed' && p.count > 0).length
)

function badge(tabId) {
  if (tabId === 'gifts')      return giftsCount.value
  if (tabId === 'collection') return collectionCount.value
  return 0
}

function pingKey(tabId) {
  if (tabId === 'gifts') return `badge-gifts-${props.cartPing}`
  if (tabId === 'collection') return `badge-collection-${props.collPing}`
  return `badge-${tabId}-0`
}

function onClick(id) {
  emit('change', id)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <nav
    class="fixed bottom-0 left-0 right-0 z-30"
    style="
      background: rgba(26,26,26,0.96);
      backdrop-filter: blur(8px);
      border-top: 1px solid #C8C8C8;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    "
  >
    <div class="max-w-[440px] mx-auto grid grid-cols-4">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="flex flex-col items-center gap-0.5 py-2.5 transition-colors relative"
        :style="{ color: activeTab === tab.id ? '#FFFFFF' : '#8A8A8A' }"
        @click="onClick(tab.id)"
      >
        <div class="relative">
          <component
            :is="tab.Icon"
            :size="18"
            :stroke-width="activeTab === tab.id ? 2 : 1.5"
          />
          <div
            v-if="badge(tab.id) > 0"
            :key="pingKey(tab.id)"
            class="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 font-mono text-[9px] font-bold badge-ping-anim"
            style="background: #000000; color: #FFFFFF; border-radius: 8px"
          >
            {{ badge(tab.id) }}
          </div>
        </div>
        <span class="text-[9px] font-mono uppercase tracking-[0.05em]">
          {{ tab.label }}
        </span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
@keyframes badge-ping {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.35); }
}
.badge-ping-anim {
  animation: badge-ping 0.4s ease;
}
</style>
