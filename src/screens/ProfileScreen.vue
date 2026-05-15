<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// ProfileScreen.vue — Phase 3. Player profile / stats screen.
// Opens as full-screen overlay from TopBar charges chip click.
// Contains: charges dashboard, ActivityTimeline, provably fair, about link.
// Source: PrizeEnginePWA.jsx (2277-2855).
// ═══════════════════════════════════════════════════════════════════════════
import { ref, computed } from 'vue'
import { Zap, Package, Gift, Lock, ChevronRight, BookOpen, X, Eye, EyeOff } from 'lucide-vue-next'
import ActivityTimeline from '../components/ActivityTimeline.vue'
import { usePartition } from '../composables/usePartition.js'
import { useSeries } from '../composables/useSeries.js'
import { fmtCharges } from '../engine/state-helpers.js'
import { sha256Bytes, utf8Bytes } from '../engine/sha256.js'
import { HISTORY_EVENT_TYPES } from '../engine/constants.js'

const props = defineProps({
  scannedCount: { type: Number, default: 0 },
  clientSeed: { type: String, default: '' },
  serverSeed: { type: String, default: '' },
  nonce: { type: Number, default: 0 },
})
const emit = defineEmits(['show-about'])

const { partitionState } = usePartition()
const { currentSeries } = useSeries()

// ── Derived ─────────────────────────────────────────────────────────────
const receivedCount = computed(() => {
  const prizes = currentSeries.value.collection?.prizes
  if (!prizes) return 0
  return Object.values(prizes).filter(
    p => p && (p.status === 'received' || p.status === 'claimed')
  ).length
})

const partitionClosed = computed(
  () => partitionState.value.partition.status === 'closed'
)

// Breakdown by source — acceptance: "total earned, breakdown by source"
const breakdown = computed(() => {
  const h = currentSeries.value.history || []
  const out = { exchange: 0, spark: 0, lastOne: 0, spent: 0 }
  for (const ev of h) {
    if (ev.type === HISTORY_EVENT_TYPES.EXCHANGE) out.exchange += (ev.charges || 0)
    else if (ev.type === HISTORY_EVENT_TYPES.SPARK_BONUS) out.spark += (ev.charges || 0)
    else if (ev.type === HISTORY_EVENT_TYPES.LAST_ONE) out.lastOne += (ev.charges || 0)
    else if (ev.type === HISTORY_EVENT_TYPES.BUY) out.spent += (ev.charges || 0)
  }
  return out
})

// History type filter
const historyFilter = ref('all')
const FILTER_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: HISTORY_EVENT_TYPES.EXCHANGE, label: 'Обмен' },
  { id: HISTORY_EVENT_TYPES.TAKE, label: 'Забрал' },
  { id: HISTORY_EVENT_TYPES.BUY, label: 'Покупки' },
  { id: HISTORY_EVENT_TYPES.SPARK_BONUS, label: 'Искры' },
]
const filteredHistory = computed(() => {
  const h = currentSeries.value.history || []
  if (historyFilter.value === 'all') return h
  return h.filter(ev => ev.type === historyFilter.value)
})

// Provably fair: commit = sha256(server_seed)
const serverSeedCommit = computed(
  () => sha256Bytes(utf8Bytes(props.serverSeed))
)

const partitionIdHash = computed(
  () => sha256Bytes(utf8Bytes(partitionState.value.partition.partitionId))
)

// ── Provably Fair modal ─────────────────────────────────────────────────
const pfOpen = ref(false)
const howOpen = ref(false)
</script>

<template>
  <div class="px-5 pt-6 pb-32 space-y-6">
    <!-- Header -->
    <div class="text-center">
      <h1
        class="font-display text-3xl tracking-wide"
        style="color: #000000; font-family: 'Space Grotesk', sans-serif"
      >
        Заряды
      </h1>
    </div>

    <!-- Dashboard — two-block header + footer -->
    <div
      class="overflow-hidden"
      style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
    >
      <div class="grid grid-cols-2" style="border-bottom: 1px solid #C8C8C8">
        <!-- Charges -->
        <div class="p-4 flex flex-col items-center text-center" style="border-right: 1px solid #C8C8C8">
          <div class="flex items-center gap-1 mb-1">
            <Zap :size="14" color="#000000" fill="currentColor" />
            <span class="font-mono text-[10px] uppercase tracking-[0.25em]" style="color: #8A8A8A">
              всего
            </span>
          </div>
          <div class="font-mono text-3xl leading-none" style="color: #000000; font-weight: 600">
            {{ fmtCharges(currentSeries.charges) }}
          </div>
          <div class="font-mono text-[10px] mt-1.5 uppercase tracking-[0.2em]" style="color: #8A8A8A">
            зарядов
          </div>
        </div>
        <!-- Boxes -->
        <div class="p-4 flex flex-col items-center text-center">
          <div class="flex items-center gap-1 mb-1">
            <Package :size="14" color="#000000" :stroke-width="2" />
            <span class="font-mono text-[10px] uppercase tracking-[0.25em]" style="color: #8A8A8A">
              коробок
            </span>
          </div>
          <div class="font-mono text-3xl leading-none" style="color: #000000; font-weight: 600">
            {{ scannedCount }}
          </div>
          <div class="font-mono text-[10px] mt-1.5 uppercase tracking-[0.2em]" style="color: #8A8A8A">
            открыто
          </div>
        </div>
      </div>
      <!-- Footer: received gifts + partner -->
      <div class="px-4 py-2.5 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Gift :size="12" color="#4A4A4A" :stroke-width="2" />
          <span class="font-mono text-[11px]" style="color: #4A4A4A">
            получено подарков: {{ receivedCount }}
          </span>
        </div>
        <span class="font-mono text-[10px]" style="color: #8A8A8A">
          {{ partitionState.partition.partnerId }}
        </span>
      </div>
    </div>

    <!-- Breakdown by source -->
    <div
      class="overflow-hidden"
      style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
    >
      <div class="font-mono text-[10px] uppercase tracking-[0.25em] px-3 py-2" style="color: #8A8A8A; border-bottom: 1px solid #C8C8C8">
        · откуда заряды ·
      </div>
      <div class="grid grid-cols-2">
        <div class="px-3 py-2 flex justify-between font-mono text-[11px]" style="border-right: 1px solid #C8C8C8; border-bottom: 1px solid #C8C8C8">
          <span style="color: #8A8A8A">получено</span>
          <span style="color: #000000">{{ fmtCharges(currentSeries.totalEarned) }} ⚡</span>
        </div>
        <div class="px-3 py-2 flex justify-between font-mono text-[11px]" style="border-bottom: 1px solid #C8C8C8">
          <span style="color: #8A8A8A">потрачено</span>
          <span style="color: #4A4A4A">{{ fmtCharges(breakdown.spent) }} ⚡</span>
        </div>
        <div class="px-3 py-2 flex justify-between font-mono text-[11px]" style="border-right: 1px solid #C8C8C8; border-bottom: 1px solid #C8C8C8">
          <span style="color: #8A8A8A">обмен</span>
          <span style="color: #000000">+{{ fmtCharges(breakdown.exchange) }}</span>
        </div>
        <div class="px-3 py-2 flex justify-between font-mono text-[11px]" style="border-bottom: 1px solid #C8C8C8">
          <span style="color: #8A8A8A">искры</span>
          <span style="color: #000000">+{{ fmtCharges(breakdown.spark) }}</span>
        </div>
        <div class="px-3 py-2 flex justify-between font-mono text-[11px]" style="border-right: 1px solid #C8C8C8">
          <span style="color: #8A8A8A">last one</span>
          <span style="color: #000000">+{{ fmtCharges(breakdown.lastOne) }}</span>
        </div>
        <div class="px-3 py-2 flex justify-between font-mono text-[11px]">
          <span style="color: #8A8A8A">серия</span>
          <span style="color: #000000">{{ partitionState.partition.seriesId }}</span>
        </div>
      </div>
    </div>

    <!-- History filter chips -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
      <button
        v-for="opt in FILTER_OPTIONS"
        :key="opt.id"
        type="button"
        class="flex-shrink-0 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors"
        :style="{
          background: historyFilter === opt.id ? '#000000' : '#FFFFFF',
          color: historyFilter === opt.id ? '#FFFFFF' : '#8A8A8A',
          border: '1px solid ' + (historyFilter === opt.id ? '#000000' : '#C8C8C8'),
          borderRadius: '4px',
        }"
        @click="historyFilter = opt.id"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- Activity Timeline (filtered) -->
    <ActivityTimeline :history="filteredHistory" />

    <!-- Provably fair button -->
    <button
      type="button"
      class="w-full p-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] transition-opacity hover:opacity-70"
      style="background: #FFFFFF; color: #4A4A4A; border: 1px solid #C8C8C8; border-radius: 4px"
      @click="pfOpen = true"
    >
      <div class="flex items-center gap-2">
        <Lock :size="12" />
        Проверить честность
      </div>
      <ChevronRight :size="14" />
    </button>

    <!-- About program button -->
    <button
      type="button"
      class="w-full p-3 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-opacity hover:opacity-70"
      style="background: transparent; color: #4A4A4A; border: 1px solid #C8C8C8; border-radius: 4px"
      @click="emit('show-about')"
    >
      <BookOpen :size="12" />
      О программе лояльности
    </button>

    <!-- ═══ Modal: Provably Fair Dashboard ═══ -->
    <Teleport to="body">
      <div
        v-if="pfOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background: rgba(0,0,0,0.85)"
        @click="pfOpen = false"
      >
        <div
          class="max-w-[400px] w-full max-h-[90vh] overflow-y-auto p-5 space-y-4"
          style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between">
            <h2
              class="font-display text-lg uppercase tracking-wider"
              style="color: #000000; font-family: 'Space Grotesk', sans-serif"
            >
              Проверить честность
            </h2>
            <button type="button" style="color: #8A8A8A" @click="pfOpen = false">
              <X :size="20" />
            </button>
          </div>

          <!-- Partition dashboard -->
          <div
            class="overflow-hidden"
            style="border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <div class="grid grid-cols-2" style="border-bottom: 1px solid #C8C8C8">
              <div class="p-3 text-center" style="border-right: 1px solid #C8C8C8">
                <div class="font-mono text-[9px] uppercase tracking-[0.2em] mb-1" style="color: #8A8A8A">
                  открыто
                </div>
                <div class="font-mono text-2xl leading-none" style="color: #000000; font-weight: 600">
                  {{ partitionState.partition.soldCount }}
                </div>
                <div class="font-mono text-[9px] mt-1" style="color: #8A8A8A">
                  из {{ partitionState.partition.partitionSize }}
                </div>
              </div>
              <div class="p-3 text-center">
                <div class="font-mono text-[9px] uppercase tracking-[0.2em] mb-1" style="color: #8A8A8A">
                  осталось
                </div>
                <div class="font-mono text-2xl leading-none" style="color: #000000; font-weight: 600">
                  {{ partitionState.partition.partitionSize - partitionState.partition.soldCount }}
                </div>
                <div class="font-mono text-[9px] mt-1" style="color: #8A8A8A">
                  {{ partitionClosed ? '✓ партия закрыта' : 'коробок до закрытия' }}
                </div>
              </div>
            </div>
            <!-- Footer: partition + series -->
            <div class="px-3 py-2 flex items-center justify-between font-mono text-[10px]">
              <span style="color: #8A8A8A">партия</span>
              <span style="color: #000000">{{ partitionState.partition.partitionId }}</span>
            </div>
            <div
              class="px-3 py-2 flex items-center justify-between font-mono text-[10px]"
              style="border-top: 1px solid #C8C8C8"
            >
              <span style="color: #8A8A8A">серия</span>
              <span style="color: #000000">{{ partitionState.partition.seriesId }}</span>
            </div>
          </div>

          <!-- Explanation -->
          <div class="text-[12px] leading-relaxed" style="color: #4A4A4A">
            Каждый исход открытия коробки — это HMAC-SHA-256 от трёх параметров: серверного зерна,
            твоего клиентского зерна и счётчика. Серверное зерно мы публикуем <strong style="color: #000000">только после
            закрытия партии</strong> — пока партия активна, видна его хеш-подпись (обещание не подменять).
          </div>

          <!-- Technical data -->
          <div class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.25em]" style="color: #8A8A8A">
              технические данные
            </div>

            <!-- partition_id hash -->
            <div class="p-2.5 font-mono text-[10px]" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px">
              <div class="uppercase tracking-wider mb-1" style="color: #8A8A8A">
                hash partition_id
              </div>
              <div class="break-all" style="color: #4A4A4A">{{ partitionIdHash }}</div>
            </div>

            <!-- client_seed -->
            <div class="p-2.5 font-mono text-[10px]" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px">
              <div class="uppercase tracking-wider mb-1" style="color: #8A8A8A">
                client_seed (твой)
              </div>
              <div class="break-all" style="color: #4A4A4A">{{ clientSeed }}</div>
            </div>

            <!-- server_seed commit/reveal -->
            <div class="p-2.5 font-mono text-[10px]" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px">
              <div class="uppercase tracking-wider mb-1 flex items-center justify-between" style="color: #8A8A8A">
                <span>{{ partitionClosed ? 'server_seed (раскрыт)' : 'server_seed_commitment (hash)' }}</span>
                <span :style="{ color: partitionClosed ? '#000000' : '#8A8A8A' }">
                  {{ partitionClosed ? '✓ revealed' : 'committed' }}
                </span>
              </div>
              <div class="break-all" style="color: #4A4A4A">
                {{ partitionClosed ? serverSeed : serverSeedCommit }}
              </div>
            </div>

            <!-- nonce -->
            <div class="px-2.5 py-2 flex justify-between font-mono text-[10px]" style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px">
              <span class="uppercase tracking-wider" style="color: #8A8A8A">nonce</span>
              <span style="color: #000000">{{ nonce }}</span>
            </div>
          </div>

          <!-- "Как проверить вручную" — collapsible -->
          <div style="border: 1px solid #C8C8C8; border-radius: 4px; overflow: hidden">
            <button
              type="button"
              class="w-full p-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] transition-opacity hover:opacity-70"
              style="background: #FFFFFF; color: #4A4A4A"
              @click="howOpen = !howOpen"
            >
              <span>Как проверить вручную</span>
              <component :is="howOpen ? EyeOff : Eye" :size="14" />
            </button>
            <div
              v-if="howOpen"
              class="p-3 text-[11px] leading-relaxed space-y-2"
              style="background: #FFFFFF; color: #4A4A4A; border-top: 1px solid #C8C8C8"
            >
              <p>
                <strong style="color: #000000">Шаг 1.</strong> Возьми server_seed (после закрытия партии — раскрытый, иначе только commitment).
              </p>
              <p>
                <strong style="color: #000000">Шаг 2.</strong> Если партия закрыта — посчитай sha256(server_seed) и сравни с commitment, который видел до закрытия. Если совпадает — мы не подменили зерно.
              </p>
              <p>
                <strong style="color: #000000">Шаг 3.</strong> Чтобы проверить конкретный розыгрыш — посчитай HMAC-SHA-256(server_seed, "QR|playerId|nonce"). Первые 8 hex дают целое число; остаток от деления на сумму весов = индекс выпавшего слота.
              </p>
              <p style="color: #8A8A8A">
                Конкретные веса по тирам публикуются вместе с раскрытием партии — это часть commitment'а.
              </p>
            </div>
          </div>

          <!-- Close -->
          <button
            type="button"
            class="w-full py-3 font-mono text-[11px] uppercase tracking-[0.2em]"
            style="background: #000000; color: #FFFFFF; border: 1px solid #000000; border-radius: 4px"
            @click="pfOpen = false"
          >
            Закрыть
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
