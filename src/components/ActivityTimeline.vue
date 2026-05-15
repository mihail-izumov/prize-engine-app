<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// ActivityTimeline.vue — Phase 3. Лента событий из series.history.
// Two sections:
//   1. Горизонтальный scroll с chips (последние 10, oldest→newest L→R)
//   2. Детальный текстовый список (последние 20, newest first)
//   3. Журнал активностей (ACTIVITY events — trigger milestones)
// Source: PrizeEnginePWA.jsx (2426-2574) — ProfileScreen inline sections.
// ═══════════════════════════════════════════════════════════════════════════
import { computed } from 'vue'
import { HISTORY_EVENT_TYPES, CARD_META } from '../engine/constants.js'
import { fmtCharges, slotInfoById } from '../engine/state-helpers.js'

const props = defineProps({
  history: { type: Array, default: () => [] },
  filter: { type: String, default: 'all' }, // 'all' | specific type
})

// ── Timeline chips (last 10) ────────────────────────────────────────────
const recentChips = computed(() => props.history.slice(-10))

function chipData(h) {
  let symbol = '·'
  let diffText = ''
  let tone = 'neutral' // 'pos' | 'neg' | 'neutral'

  if (h.type === HISTORY_EVENT_TYPES.TAKE) {
    symbol = '↓'; diffText = '+0'; tone = 'neutral'
  } else if (h.type === HISTORY_EVENT_TYPES.EXCHANGE) {
    symbol = '⇄'; diffText = '+' + fmtCharges(h.charges); tone = 'pos'
  } else if (h.type === HISTORY_EVENT_TYPES.BUY) {
    symbol = '🛒'; diffText = '−' + fmtCharges(h.charges); tone = 'neg'
  } else if (h.type === HISTORY_EVENT_TYPES.LAST_ONE) {
    symbol = '★'; diffText = '+' + fmtCharges(h.charges); tone = 'pos'
  } else if (h.type === HISTORY_EVENT_TYPES.SPARK_BONUS) {
    symbol = '✨'; diffText = '+' + fmtCharges(h.charges); tone = 'pos'
  } else if (h.type === HISTORY_EVENT_TYPES.POWER_USE) {
    symbol = '⚡'; diffText = '·'; tone = 'neutral'
  } else if (h.type === HISTORY_EVENT_TYPES.ACTIVITY) {
    symbol = '📋'; diffText = '·'; tone = 'neutral'
  }

  const borderColor = tone === 'pos' ? '#000000' : tone === 'neg' ? '#4A4A4A' : '#C8C8C8'
  const textColor = tone === 'pos' ? '#FFFFFF' : tone === 'neg' ? '#000000' : '#8A8A8A'
  const bg = tone === 'pos' ? '#000000' : '#FFFFFF'
  const dateColor = tone === 'pos' ? '#8A8A8A' : '#C8C8C8'

  const ts = h.ts ? new Date(h.ts) : null
  const dd = ts ? String(ts.getDate()).padStart(2, '0') : ''
  const mm = ts ? String(ts.getMonth() + 1).padStart(2, '0') : ''

  return { symbol, diffText, borderColor, textColor, bg, dateColor, dd, mm, ts }
}

// ── Detail rows (last 20, excluding ACTIVITY) ──────────────────────────
const detailEvents = computed(() =>
  props.history
    .filter(h => h.type !== HISTORY_EVENT_TYPES.ACTIVITY)
    .slice(-20)
    .reverse()
)

function eventRow(h) {
  const ts = h.ts ? new Date(h.ts) : new Date()
  const dd = String(ts.getDate()).padStart(2, '0')
  const mm = String(ts.getMonth() + 1).padStart(2, '0')
  const HH = String(ts.getHours()).padStart(2, '0')
  const MM = String(ts.getMinutes()).padStart(2, '0')
  const tsLabel = `${dd}.${mm} ${HH}:${MM}`

  let label = '—'
  let chargeChange = ''
  let chargeColor = '#4A4A4A'

  if (h.type === HISTORY_EVENT_TYPES.TAKE) {
    const info = slotInfoById(h.slotId)
    label = `${info?.name || h.slotId} → забрал`
    chargeChange = '+0 ⚡'
    chargeColor = '#8A8A8A'
  } else if (h.type === HISTORY_EVENT_TYPES.EXCHANGE) {
    const info = slotInfoById(h.slotId)
    label = `${info?.name || h.slotId} → обменял`
    chargeChange = `+${fmtCharges(h.charges)} ⚡`
    chargeColor = '#000000'
  } else if (h.type === HISTORY_EVENT_TYPES.BUY) {
    const info = slotInfoById(h.slotId)
    label = `Купил: ${info?.name || h.slotId}`
    chargeChange = `−${fmtCharges(h.charges)} ⚡`
    chargeColor = '#4A4A4A'
  } else if (h.type === HISTORY_EVENT_TYPES.LAST_ONE) {
    label = 'Бонус Last One'
    chargeChange = `+${fmtCharges(h.charges)} ⚡`
    chargeColor = '#000000'
  } else if (h.type === HISTORY_EVENT_TYPES.SPARK_BONUS) {
    label = '✨ Искра'
    chargeChange = `+${fmtCharges(h.charges)} ⚡`
    chargeColor = '#000000'
  } else if (h.type === HISTORY_EVENT_TYPES.POWER_USE) {
    label = `Активировал: ${CARD_META[h.cardType]?.label || h.cardType}`
    chargeChange = ''
  }

  return { tsLabel, label, chargeChange, chargeColor }
}

// ── Activity journal (ACTIVITY type only, last 15) ─────────────────────
const activities = computed(() =>
  props.history
    .filter(h => h.type === HISTORY_EVENT_TYPES.ACTIVITY)
    .slice(-15)
    .reverse()
)

function activityTs(h) {
  const ts = h.ts ? new Date(h.ts) : new Date()
  const dd = String(ts.getDate()).padStart(2, '0')
  const mm = String(ts.getMonth() + 1).padStart(2, '0')
  const HH = String(ts.getHours()).padStart(2, '0')
  const MM = String(ts.getMinutes()).padStart(2, '0')
  return `${dd}.${mm} ${HH}:${MM}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Horizontal timeline chips (last 10) -->
    <div v-if="history.length > 0" class="space-y-2">
      <div class="font-mono text-[10px] uppercase tracking-[0.25em]" style="color: #8A8A8A">
        · активность · последние {{ recentChips.length }}
      </div>
      <div
        class="no-scrollbar flex items-center px-3 py-3"
        style="overflow-x: auto; background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
      >
        <template v-for="(h, i) in recentChips" :key="i">
          <div class="flex items-center flex-shrink-0">
            <div
              class="flex flex-col items-center justify-center px-2.5 py-1.5"
              :style="{
                background: chipData(h).bg,
                border: '1px solid ' + chipData(h).borderColor,
                borderRadius: '4px',
                minWidth: '56px',
              }"
            >
              <div class="font-mono text-[14px] leading-none" :style="{ color: chipData(h).textColor }">
                {{ chipData(h).symbol }}
              </div>
              <div class="font-mono text-[9px] mt-1 leading-none" :style="{ color: chipData(h).textColor }">
                {{ chipData(h).diffText }}
              </div>
              <div
                v-if="chipData(h).ts"
                class="font-mono text-[7px] mt-1 leading-none"
                :style="{ color: chipData(h).dateColor }"
              >
                {{ chipData(h).dd }}.{{ chipData(h).mm }}
              </div>
            </div>
            <!-- connector line -->
            <div
              v-if="i < recentChips.length - 1"
              style="width: 12px; height: 1px; background: #C8C8C8; flex-shrink: 0"
            ></div>
          </div>
        </template>
      </div>
    </div>

    <!-- Detail list (last 20, no ACTIVITY) -->
    <div class="space-y-2">
      <div class="font-mono text-[10px] uppercase tracking-[0.25em]" style="color: #8A8A8A">
        · детали · последние 20
      </div>
      <div
        v-if="history.length === 0"
        class="p-4 text-center text-[12px] font-mono"
        style="border: 1px dashed #C8C8C8; color: #C8C8C8; border-radius: 4px"
      >
        Пока пусто. Отсканируй первую коробку.
      </div>
      <div
        v-else
        style="border: 1px solid #C8C8C8; border-radius: 4px; overflow: hidden"
      >
        <div
          v-for="(h, i) in detailEvents"
          :key="i"
          class="flex items-center gap-3 px-3 py-2.5"
          style="background: #FFFFFF; border-bottom: 1px solid #C8C8C8"
        >
          <div class="font-mono text-[10px]" style="color: #8A8A8A; min-width: 70px">
            {{ eventRow(h).tsLabel }}
          </div>
          <div class="flex-1 min-w-0 text-[12px] truncate" style="color: #000000">
            {{ eventRow(h).label }}
          </div>
          <div class="font-mono text-[12px]" :style="{ color: eventRow(h).chargeColor }">
            {{ eventRow(h).chargeChange }}
          </div>
        </div>
      </div>
    </div>

    <!-- Activity journal (ACTIVITY events — milestones from triggers) -->
    <div v-if="activities.length > 0" class="space-y-2">
      <div class="font-mono text-[10px] uppercase tracking-[0.25em]" style="color: #8A8A8A">
        · журнал · последние 15
      </div>
      <div style="border: 1px solid #C8C8C8; border-radius: 4px; overflow: hidden">
        <div
          v-for="(h, i) in activities"
          :key="i"
          class="flex items-center gap-3 px-3 py-2.5"
          style="background: #FFFFFF; border-bottom: 1px solid #C8C8C8"
        >
          <div class="font-mono text-[10px]" style="color: #8A8A8A; min-width: 70px">
            {{ activityTs(h) }}
          </div>
          <div class="flex-1 min-w-0 text-[12px] truncate" style="color: #000000">
            {{ h.title || '—' }}
          </div>
          <div
            v-if="h.detail"
            class="font-mono text-[10px] truncate"
            style="color: #8A8A8A; max-width: 100px"
          >
            {{ h.detail }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
