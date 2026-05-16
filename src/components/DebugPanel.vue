<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// DebugPanel.vue — Phase 3 + Phase 4.
// Full-screen overlay for dev/test.
//
// Tabs:
//   • QR        — force-scan grid (Phase 3)
//   • State     — partition meta, tiers, seeds (Phase 3)
//   • Log       — scan history (Phase 3)
//   • Mascot    — manual mascot triggers + game scenarios + state info (Phase 4)
//   • System    — page reload, hard cache reset, app version (Phase 4, iOS PWA)
//
// Emits:
//   close            — close the panel
//   force-scan       — simulate a QR scan
//   reset-partition  — reset partition state
//   tab-change(id)   — current tab id (used by App.vue to gate mascotZone:
//                      on 'mascot' tab the mascot is rendered live for
//                      visual verification, on other tabs it stays hidden)
// ═══════════════════════════════════════════════════════════════════════════
import { ref, computed, watch } from 'vue'
import { Bug, X, Trash2, RefreshCw, RotateCw, Eraser, Info } from 'lucide-vue-next'
import { usePartition } from '../composables/usePartition.js'
import { useSeries } from '../composables/useSeries.js'
import { useCards } from '../composables/useCards.js'
import { useTama, STATES as TAMA_STATES, TAMA_PHRASES, TAMA_ONBOARDING } from '../composables/useTama.js'
import {
  TIER_ORDER, TIER_META, CARD_META,
  SLOT_CATALOG, enginePoolToUiCollection,
} from '../engine/constants.js'
import {
  buildQrForBox, summarizeStateByTier,
  fmtCharges, slotInfoById,
} from '../engine/state-helpers.js'
import { TRIGGER_CONFIG } from '../engine/triggers.js'

const props = defineProps({
  scanLog: { type: Array, default: () => [] },
  scannedQrs: { type: Object, default: () => new Set() },
  serverSeed: { type: String, default: '' },
  clientSeed: { type: String, default: '' },
  nonce: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'force-scan', 'reset-partition', 'tab-change'])

const { partitionState, summary: tierSummary } = usePartition()
const { activeSeries, currentSeries } = useSeries()
const { activeEffects } = useCards()
const tama = useTama()

const activeSection = ref('qrs')

// Notify parent when tab changes — App.vue uses this to decide whether
// the mascot should be rendered live (only when 'mascot' tab is active).
// `immediate: true` fires on mount so the parent's mascotZone is in sync
// from the very first frame the debug page is shown.
watch(activeSection, (v) => emit('tab-change', v), { immediate: true })

// Build all 100 QR codes once
const allQrs = computed(() => {
  const out = []
  for (let i = 1; i <= 100; i++) out.push(buildQrForBox(i))
  return out
})

const goldSlot = computed(
  () => partitionState.value.slots.find(s => s.variant === 'Gold')
)

function onForceScan(qr) {
  emit('force-scan', qr)
}

function onReset() {
  emit('reset-partition')
}

// ═══════════════════════════════════════════════════════════════════════════
// MASCOT TAB — state buttons + game scenarios (ported from mascot-phase1.jsx
// DemoPage: ManualTriggers + GameScenario + InfoPanel)
// ═══════════════════════════════════════════════════════════════════════════

// 12 states, same order as mascot-phase1.jsx STATE_BUTTONS const (line 1981).
const MASCOT_STATE_BUTTONS = [
  { id: 'idle',       label: 'Idle' },
  { id: 'wave',       label: 'Wave' },
  { id: 'sleepy',     label: 'Sleepy' },
  { id: 'charge-up',  label: 'Charge-up' },
  { id: 'wow',        label: 'Wow' },
  { id: 'proud',      label: 'Proud' },
  { id: 'pondering',  label: 'Pondering' },
  { id: 'farewell',   label: 'Farewell' },
  { id: 'delight',    label: 'Delight ♥' },
  { id: 'surprised',  label: 'Surprised' },
  { id: 'smug-wink',  label: 'Smug wink' },
  { id: 'big-eyes',   label: 'Big eyes' },
]

function runMascotState(id) {
  tama.trigger(id)
}

// Game scenarios — copied 1:1 from mascot-phase1.jsx GameScenario (lines 2046-2062).
function runCommonScenario() {
  tama.trigger('charge-up', {
    vars: { amount: 300, balance: 1240, next_tier_gap: 480 },
    duration: 4000,
  })
}
function runLegendaryScenario() {
  tama.trigger('charge-up', {
    vars: { amount: 500, balance: 4800, next_tier_gap: 200 },
    duration: 4000,
  })
}
function runMythicScenario() {
  tama.trigger('wow', { duration: 5000 })
}

function onMascotReset() {
  tama.reset()
}
function onReplayOnboarding() {
  tama.replayOnboarding()
}

// History entries reverse-formatted for display (newest first is already
// the natural order in tama.history — matches React reducer behavior).
const mascotHistory = computed(() => tama.history.value)
const currentStateMeta = computed(() => TAMA_STATES[tama.currentState.value])

// ─── Phrase Bank ───
// Reference list: every phrase Tama can say, grouped by state.
// Order matches MASCOT_STATE_BUTTONS for visual continuity.
// 'waking' is a pseudo-state used only after wakeUp() — included separately.
const phraseBank = computed(() => {
  const main = MASCOT_STATE_BUTTONS.map(b => ({
    id: b.id,
    label: b.label,
    phrases: TAMA_PHRASES[b.id] || [],
  }))
  return [
    ...main,
    { id: 'waking',     label: 'Waking (after sleep)', phrases: TAMA_PHRASES.waking || [] },
    { id: 'onboarding', label: 'Onboarding (first visit)', phrases: TAMA_ONBOARDING || [] },
  ]
})

// ─── Trigger Map ───
// Reads TRIGGER_CONFIG from engine/triggers.js. Each entry shows:
//   • event (`when` field) — what real-world action fires this
//   • trigger id — human-readable trigger name
//   • mascot state — what Tama does, or '—' if explicitly silent (null)
//   • phrase — what Tama says (or '—' if silent)
// Grouped by `when` so visually related triggers cluster together.
const triggerMap = computed(() => {
  const groups = {}
  for (const t of TRIGGER_CONFIG) {
    if (!groups[t.when]) groups[t.when] = []
    groups[t.when].push({
      id: t.id,
      mascotState: t.mascotState,
      mascotPhrase: t.mascotPhrase,
    })
  }
  // Stable order matching where they appear in TRIGGER_CONFIG.
  const order = []
  const seen = new Set()
  for (const t of TRIGGER_CONFIG) {
    if (!seen.has(t.when)) {
      seen.add(t.when)
      order.push(t.when)
    }
  }
  return order.map(when => ({ when, triggers: groups[when] }))
})

// Friendly label for event types — what does the `when` field mean in plain RU.
const WHEN_LABELS = {
  scan_error:         'Скан с ошибкой',
  scan_success:       'Успешный скан',
  take:               'Забрать приз',
  exchange:           'Обмен на заряды',
  spark:              'Spark-бонус',
  purchase:           'Покупка за заряды',
  power_activate:     'Активация карты силы',
  collection_change:  'Изменение коллекции',
  scan_count_change:  'Веха по числу сканов',
  charges_change:     'Веха по зарядам',
  partition_change:   'Изменение партии',
}
function whenLabel(when) {
  return WHEN_LABELS[when] || when
}

// Trigger phrase preview — fires the trigger's mascot reaction from the map.
// Lets developer click on any trigger row to see Tama react with the configured
// state + phrase, without scrolling back to the manual triggers section.
function previewTrigger(trigger) {
  if (!trigger.mascotState) return // silent triggers do nothing
  tama.trigger(trigger.mascotState, {
    message: trigger.mascotPhrase || undefined,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM TAB — iOS PWA helpers (standalone mode has no browser reload UI)
// ═══════════════════════════════════════════════════════════════════════════

// Hardcoded app version. When package.json gets a real version field, swap
// this for a vite-define injection — for now this is the simplest path that
// works in static asset builds without extra plumbing.
const APP_VERSION = 'v1.0.0-phase4'

const hardReloadBusy = ref(false)

function softReload() {
  window.location.reload()
}

async function hardReload() {
  if (hardReloadBusy.value) return
  hardReloadBusy.value = true
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) {
        try { await r.unregister() } catch (e) { /* ignore */ }
      }
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      for (const k of keys) {
        try { await caches.delete(k) } catch (e) { /* ignore */ }
      }
    }
  } finally {
    // Always reload, even if SW/cache cleanup partially failed
    window.location.reload()
  }
}
</script>

<template>
  <!--
    Full-screen page replacing the active screen content (rendered from
    App.vue's <main> via v-if). NOT a modal — TopBar and TabBar stay
    visible, mascot floats over this content at fixed z-50 when on the
    Mascot tab. No overlay backdrop, no max-h-mascot trick — those were
    needed when this was a modal, now unnecessary.
  -->
  <div class="w-full">
    <!-- DEV MODE banner — единственный красный в платформенном UI -->
    <div
      class="px-4 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.3em]"
      style="background: #DC2626; color: #000000"
    >
      ⚠ Режим разработки · debug
    </div>

    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-3"
      style="background: #FFFFFF; border-bottom: 1px solid #C8C8C8"
      >
        <div class="flex items-center gap-2">
          <Bug :size="16" color="#000000" />
          <span class="font-mono text-xs uppercase tracking-[0.2em]" style="color: #000000">
            Debug · {{ activeSeries }}
          </span>
        </div>
        <button type="button" style="color: #8A8A8A" @click="emit('close')">
          <X :size="20" />
        </button>
      </div>

      <!-- Tab switcher -->
      <div class="flex flex-wrap" style="border-bottom: 1px solid #C8C8C8">
        <button
          v-for="t in [
            { id: 'qrs', label: 'QR' },
            { id: 'state', label: 'State' },
            { id: 'log', label: `Log · ${scanLog.length}` },
            { id: 'mascot', label: 'Mascot' },
            { id: 'system', label: 'Sys' },
          ]"
          :key="t.id"
          type="button"
          class="flex-1 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors"
          style="min-width: 50px"
          :style="{
            color: activeSection === t.id ? '#000000' : '#8A8A8A',
            borderBottom: activeSection === t.id ? '2px solid #000000' : '2px solid transparent',
          }"
          @click="activeSection = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Content area. No internal scroll — window scrolls naturally
           (we're not a modal anymore). pb is dynamic:
           • non-mascot tabs: pb-28 (112px) clears the fixed TabBar (~94px
             with iPhone safe-area).
           • mascot tab: pb-[200px] additionally clears the mascot, which
             floats fixed at ~170px from viewport bottom on Mascot tab.
             Without this, the last content rows would visually overlap
             the mascot's head. -->
      <div
        class="px-4 pt-4"
        :class="activeSection === 'mascot' ? 'pb-[200px]' : 'pb-28'"
      >

        <!-- ═══ QRS TAB ═══ -->
        <div v-if="activeSection === 'qrs'" class="space-y-4">
          <div class="text-[11px] leading-relaxed" style="color: #8A8A8A">
            Коснись QR чтобы симулировать скан. Серые — уже раскрыты.
            <br>В debug видны engine pool letters (A/B/C). В player UI — UI letters инвертированы.
          </div>

          <!-- Active effects reminder -->
          <div
            v-if="activeEffects.luckActive || activeEffects.doubleActive || activeEffects.forcePoolC"
            class="p-2"
            style="background: #FFFFFF; border: 1px solid #000000; border-radius: 2px"
          >
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-mono text-[9px] uppercase tracking-wider" style="color: #000000">Armed:</span>
              <span v-if="activeEffects.luckActive" class="font-mono text-[10px]" style="color: #4A4A4A">luck</span>
              <span v-if="activeEffects.doubleActive" class="font-mono text-[10px]" style="color: #4A4A4A">double</span>
              <span v-if="activeEffects.forcePoolC" class="font-mono text-[10px]" style="color: #4A4A4A">keys→C</span>
            </div>
          </div>

          <!-- Pool A — engine A → UI C -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                Engine A · Standard · 70 коробок · UI:C
              </span>
              <span class="font-mono text-[10px]" style="color: #8A8A8A">0001-0070</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="qr in allQrs.slice(0, 70)"
                :key="qr"
                type="button"
                :disabled="scannedQrs.has(qr)"
                class="aspect-square font-mono text-[9px] transition-all"
                :style="{
                  background: scannedQrs.has(qr) ? '#FFFFFF' : '#EEEEEE',
                  color: scannedQrs.has(qr) ? '#C8C8C8' : '#000000',
                  textDecoration: scannedQrs.has(qr) ? 'line-through' : 'none',
                  border: '1px solid ' + (scannedQrs.has(qr) ? '#EEEEEE' : '#C8C8C8'),
                  borderRadius: '2px',
                  cursor: scannedQrs.has(qr) ? 'not-allowed' : 'pointer',
                }"
                @click="onForceScan(qr)"
              >
                {{ qr.split('-')[2] }}
              </button>
            </div>
          </div>

          <!-- Pool B — engine B → UI B -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                Engine B · Collector · 25 коробок · UI:B
              </span>
              <span class="font-mono text-[10px]" style="color: #8A8A8A">0071-0095</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="qr in allQrs.slice(70, 95)"
                :key="qr"
                type="button"
                :disabled="scannedQrs.has(qr)"
                class="aspect-square font-mono text-[9px] transition-all"
                :style="{
                  background: scannedQrs.has(qr) ? '#FFFFFF' : '#EEEEEE',
                  color: scannedQrs.has(qr) ? '#C8C8C8' : '#000000',
                  textDecoration: scannedQrs.has(qr) ? 'line-through' : 'none',
                  border: '1px solid ' + (scannedQrs.has(qr) ? '#EEEEEE' : '#000000'),
                  borderRadius: '2px',
                  cursor: scannedQrs.has(qr) ? 'not-allowed' : 'pointer',
                }"
                @click="onForceScan(qr)"
              >
                {{ qr.split('-')[2] }}
              </button>
            </div>
          </div>

          <!-- Pool C — engine C → UI A -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #000000">
                Engine C · Hunter · 5 коробок · UI:A
              </span>
              <span class="font-mono text-[10px]" style="color: #8A8A8A">0096-0100</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="qr in allQrs.slice(95, 100)"
                :key="qr"
                type="button"
                :disabled="scannedQrs.has(qr)"
                class="aspect-square font-mono text-[9px] transition-all"
                :style="{
                  background: scannedQrs.has(qr) ? '#FFFFFF' : '#000000',
                  color: scannedQrs.has(qr) ? '#C8C8C8' : '#FFFFFF',
                  textDecoration: scannedQrs.has(qr) ? 'line-through' : 'none',
                  border: '1px solid ' + (scannedQrs.has(qr) ? '#EEEEEE' : '#000000'),
                  borderRadius: '2px',
                  cursor: scannedQrs.has(qr) ? 'not-allowed' : 'pointer',
                }"
                @click="onForceScan(qr)"
              >
                {{ qr.split('-')[2] }}
              </button>
            </div>
          </div>
        </div>

        <!-- ═══ STATE TAB ═══ -->
        <div v-if="activeSection === 'state'" class="space-y-4">
          <!-- Player state -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Player ({{ activeSeries }})
            </div>
            <div class="grid grid-cols-2 gap-1 font-mono text-[10px]">
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">charges</span>
                <span style="color: #000000">{{ fmtCharges(currentSeries.charges) }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">earned</span>
                <span style="color: #000000">{{ fmtCharges(currentSeries.totalEarned) }}</span>
              </div>
            </div>
          </section>

          <!-- Partition meta -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Partition meta
            </div>
            <div class="grid grid-cols-2 gap-1 font-mono text-[10px]">
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">series</span>
                <span style="color: #000000">{{ partitionState.partition.seriesId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">wave</span>
                <span style="color: #000000">{{ partitionState.partition.waveId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">partner</span>
                <span style="color: #000000">{{ partitionState.partition.partnerId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">park</span>
                <span style="color: #000000">{{ partitionState.partition.parkId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">partition</span>
                <span style="color: #000000">{{ partitionState.partition.partitionId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">sold</span>
                <span style="color: #000000">{{ partitionState.partition.soldCount }}/100</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">status</span>
                <span style="color: #000000">{{ partitionState.partition.status }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">gold</span>
                <span :style="{ color: partitionState.partition.goldRareClaimed ? '#000000' : '#4A4A4A' }">
                  {{ partitionState.partition.goldRareClaimed ? 'claimed' : 'available' }}
                </span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">lastone</span>
                <span :style="{ color: partitionState.partition.lastOneGiven ? '#000000' : '#4A4A4A' }">
                  {{ partitionState.partition.lastOneGiven ? 'given' : 'pending' }}
                </span>
              </div>
            </div>
          </section>

          <!-- Tiers remaining -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Тиры (осталось)
            </div>
            <div class="space-y-1">
              <div
                v-for="tier in TIER_ORDER"
                :key="tier"
                class="flex items-center gap-2 p-2"
                style="background: #FFFFFF; border-radius: 2px"
              >
                <div class="w-2 h-2" style="background: #4A4A4A"></div>
                <span class="font-mono text-[11px] flex-1" style="color: #000000">
                  {{ TIER_META[tier].label }}
                </span>
                <span class="font-mono text-[11px]" style="color: #000000">
                  {{ tierSummary[tier] || 0 }} / {{ SLOT_CATALOG.filter(s => s.tier === tier).reduce((a, s) => a + s.count, 0) }}
                </span>
              </div>
            </div>
          </section>

          <!-- Gold slot -->
          <section v-if="goldSlot" class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Gold slot
            </div>
            <div class="p-2" style="background: #FFFFFF; border: 1px solid #000000; border-radius: 2px">
              <div class="font-mono text-[10px]" style="color: #000000">
                {{ goldSlot.slotId }} · remaining: {{ goldSlot.remainingCount }}
              </div>
            </div>
          </section>

          <!-- Cards remaining (partition supply, not player inventory) -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Карточки (остаток партии)
            </div>
            <div class="grid grid-cols-3 gap-1">
              <div
                v-for="c in partitionState.cards"
                :key="c.cardType"
                class="p-2"
                style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px"
              >
                <div class="font-mono text-[10px]" style="color: #4A4A4A">{{ CARD_META[c.cardType]?.label }}</div>
                <div class="font-mono text-sm" style="color: #000000">
                  {{ c.remainingCount }} / {{ c.initialCount }}
                </div>
              </div>
            </div>
          </section>

          <!-- Seeds — full reveal in debug always -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Provably fair · raw seeds
            </div>
            <div class="space-y-1 font-mono text-[9px]">
              <div class="p-2" style="background: #FFFFFF; border-radius: 2px">
                <div style="color: #8A8A8A">server_seed (full)</div>
                <div class="break-all" style="color: #000000">{{ serverSeed }}</div>
              </div>
              <div class="p-2" style="background: #FFFFFF; border-radius: 2px">
                <div style="color: #8A8A8A">client_seed</div>
                <div class="break-all" style="color: #000000">{{ clientSeed }}</div>
              </div>
              <div class="p-2 flex justify-between" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">nonce</span>
                <span style="color: #000000">{{ nonce }}</span>
              </div>
            </div>
          </section>

          <!-- Reset -->
          <button
            type="button"
            class="w-full mt-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
            style="background: #FFFFFF; color: #DC2626; border: 1px solid #DC2626; border-radius: 4px"
            @click="onReset"
          >
            <Trash2 :size="14" />
            Сбросить партию
          </button>
        </div>

        <!-- ═══ LOG TAB ═══ -->
        <div v-if="activeSection === 'log'" class="space-y-1.5">
          <div
            v-if="scanLog.length === 0"
            class="text-center text-[11px] py-8"
            style="color: #C8C8C8"
          >
            Лог пуст. Отсканируй первый QR.
          </div>
          <template v-else>
            <div
              v-for="(entry, i) in [...scanLog].reverse()"
              :key="i"
              class="p-2 font-mono text-[9px] space-y-0.5"
              style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px"
            >
              <div class="flex items-center justify-between">
                <span style="color: #4A4A4A">
                  #{{ scanLog.length - i }} · {{ entry.qrCode }}
                </span>
                <span style="color: #000000">
                  {{ TIER_META[entry.tier]?.label || entry.tier }}
                  <template v-if="entry.variant !== 'Normal'"> · {{ entry.variant }}</template>
                </span>
              </div>
              <div class="truncate" style="color: #8A8A8A">
                → {{ entry.revealedSlotId }} · engine:{{ entry.pool }} · UI:{{ enginePoolToUiCollection(entry.pool) }}
              </div>
              <div class="flex gap-2 flex-wrap" style="color: #8A8A8A">
                <span>+{{ entry.chargesAwarded }}⚡</span>
                <span
                  v-if="entry.cardFound && entry.cardFound !== 'none'"
                  style="color: #000000"
                >card:{{ entry.cardFound }}</span>
                <span v-if="entry.effects?.luckActive" style="color: #4A4A4A">+luck</span>
                <span v-if="entry.effects?.doubleActive" style="color: #4A4A4A">+double</span>
                <span v-if="entry.effects?.forcePoolC" style="color: #4A4A4A">+keys</span>
                <span v-if="entry.wasLastOne" style="color: #000000">★LAST</span>
                <span v-if="entry.wasPoolFallback" style="color: #DC2626">pool-fallback</span>
              </div>
              <div class="truncate" style="color: #C8C8C8">
                hmac:{{ entry.slotHmacHex?.substring(0, 16) }}…
              </div>
            </div>
          </template>
        </div>

        <!-- ═══ MASCOT TAB ═══ -->
        <!-- Ported from mascot-phase1.jsx DemoPage (lines 1981-2299):
             GameScenario + ManualTriggers + InfoPanel.
             ConsumerHookProof skipped — React-Context-specific test,
             trivially passes for Vue's module-singleton composable. -->
        <div v-if="activeSection === 'mascot'" class="space-y-5">

          <!-- ─── Strategy note (mini-spec §10.3 requires this) ─── -->
          <div
            class="p-3"
            style="background: #FFFFFF; border-left: 2px solid #000000"
          >
            <div class="text-[11px] leading-relaxed" style="color: #4A4A4A">
              <strong style="color: #000000">Обрати внимание:</strong> на крупном Legendary маскот
              не делает отдельную супер-реакцию (как на Mythic). Он подсвечивает
              прогресс зарядов, чтобы стимулировать <em>продолжать копить</em>,
              а не сразу обменивать. Это намеренный паттерн — STRATEGY §6.7 (breakage).
            </div>
          </div>

          <!-- ─── Игровой сценарий — 3 кнопки ─── -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Игровой сценарий
            </div>
            <div class="grid grid-cols-1 gap-2">
              <button
                type="button"
                class="text-left p-3 transition-colors"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
                @click="runCommonScenario"
              >
                <div class="font-semibold text-sm" style="color: #000000">
                  Симулировать Common
                </div>
                <div class="text-[11px] mt-0.5" style="color: #8A8A8A">
                  → charge-up, +300 зарядов
                </div>
              </button>
              <button
                type="button"
                class="text-left p-3 transition-colors"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
                @click="runLegendaryScenario"
              >
                <div class="font-semibold text-sm" style="color: #000000">
                  Симулировать Legendary
                </div>
                <div class="text-[11px] mt-0.5" style="color: #8A8A8A">
                  → charge-up (намеренно, не wow)
                </div>
              </button>
              <button
                type="button"
                class="text-left p-3 transition-colors"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
                @click="runMythicScenario"
              >
                <div class="font-semibold text-sm" style="color: #000000">
                  Симулировать Mythic
                </div>
                <div class="text-[11px] mt-0.5" style="color: #8A8A8A">
                  → wow
                </div>
              </button>
            </div>
          </section>

          <!-- ─── Ручные триггеры — 12 состояний ─── -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Ручные триггеры
            </div>
            <div class="text-[11px] leading-relaxed mb-2" style="color: #8A8A8A">
              Клик → автоматическая случайная фраза из <code style="background: #EEEEEE; padding: 1px 4px; border-radius: 2px; color: #000000">TAMA_PHRASES</code>.
              Темп-состояния возвращаются в idle через defaultDuration.
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="b in MASCOT_STATE_BUTTONS"
                :key="b.id"
                type="button"
                class="px-3 py-2.5 text-sm font-medium transition-colors"
                :style="{
                  background: tama.currentState.value === b.id ? '#000000' : '#FFFFFF',
                  color: tama.currentState.value === b.id ? '#FFFFFF' : '#000000',
                  border: '2px solid #000000',
                  borderRadius: '4px',
                }"
                @click="runMascotState(b.id)"
              >
                {{ b.label }}
              </button>
            </div>
          </section>

          <!-- ─── Info panel — current state, bubble, hidden, history ─── -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Отладка
            </div>
            <div
              class="p-3 space-y-2.5"
              style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
            >
              <!-- Current state -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  Current
                </div>
                <div class="flex-1">
                  <code class="px-1.5 py-0.5 rounded text-xs" style="background: #000000; color: #FFFFFF">
                    {{ tama.currentState.value }}
                  </code>
                  <span
                    v-if="currentStateMeta"
                    class="text-xs ml-2"
                    style="color: #8A8A8A"
                  >
                    ({{ currentStateMeta.label }})
                  </span>
                </div>
              </div>

              <!-- Bubble -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  Bubble
                </div>
                <div class="flex-1">
                  <span
                    v-if="tama.bubble.value"
                    class="text-xs"
                    style="color: #000000"
                  >
                    "{{ tama.bubble.value.message }}"
                    <span v-if="tama.bubble.value.subtitle" style="color: #8A8A8A">
                      / {{ tama.bubble.value.subtitle }}
                    </span>
                    <span
                      v-if="!tama.bubbleVisible.value"
                      class="ml-1 text-[9px] uppercase"
                      style="color: #C8C8C8"
                    >
                      (hidden)
                    </span>
                  </span>
                  <span v-else class="text-xs" style="color: #C8C8C8">—</span>
                </div>
              </div>

              <!-- Hidden flag -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  Hidden
                </div>
                <div class="flex-1">
                  <span class="text-xs" style="color: #000000">
                    {{ tama.isHidden.value ? 'yes' : 'no' }}
                  </span>
                </div>
              </div>

              <!-- Onboarding look-up flag (diagnostic) -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  LookUp
                </div>
                <div class="flex-1">
                  <span class="text-xs" style="color: #000000">
                    {{ tama.onboardingLookUp.value ? 'yes (phrase 4)' : 'no' }}
                  </span>
                </div>
              </div>

              <!-- History -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  History
                </div>
                <div class="flex-1">
                  <span
                    v-if="mascotHistory.length === 0"
                    class="text-xs"
                    style="color: #C8C8C8"
                  >
                    пусто
                  </span>
                  <ul v-else class="text-xs space-y-0.5 font-mono">
                    <li
                      v-for="(h, i) in mascotHistory"
                      :key="`${h.ts}-${i}`"
                      class="flex items-center gap-1.5"
                    >
                      <span style="color: #8A8A8A">{{ h.from }}</span>
                      <span style="color: #C8C8C8">→</span>
                      <span class="font-semibold" style="color: #000000">{{ h.to }}</span>
                      <span
                        v-if="h.hadBubble"
                        class="text-[9px] uppercase ml-1"
                        style="color: #C8C8C8"
                      >
                        +bubble
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Actions -->
              <div
                class="flex flex-wrap gap-2 pt-2"
                style="border-top: 1px solid #EEEEEE"
              >
                <button
                  type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
                  style="background: #FFFFFF; color: #000000; border: 1px solid #000000; border-radius: 4px"
                  @click="onMascotReset"
                >
                  <RotateCw :size="12" />
                  Reset to idle
                </button>
                <button
                  type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
                  style="background: #FFFFFF; color: #000000; border: 1px solid #000000; border-radius: 4px"
                  @click="onReplayOnboarding"
                >
                  <RefreshCw :size="12" />
                  Replay onboarding
                </button>
                <button
                  v-if="tama.isHidden.value"
                  type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
                  style="background: #FFFFFF; color: #000000; border: 1px solid #000000; border-radius: 4px"
                  @click="tama.wakeUp()"
                >
                  Wake up
                </button>
              </div>
            </div>
          </section>

          <!-- ─── Phrase Bank ─── -->
          <!-- All phrases Tama can say, grouped by state. Reference only,
               clicking a state header fires that state for visual preview. -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Банк фраз
            </div>
            <div class="text-[11px] leading-relaxed mb-2" style="color: #8A8A8A">
              Все реплики из <code style="background: #EEEEEE; padding: 1px 4px; border-radius: 2px; color: #000000">TAMA_PHRASES</code>.
              При триггере выбирается случайная.
            </div>
            <div
              v-for="group in phraseBank"
              :key="group.id"
              class="p-3"
              style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
            >
              <div class="flex items-center justify-between mb-1.5">
                <code class="px-1.5 py-0.5 rounded text-xs" style="background: #000000; color: #FFFFFF">
                  {{ group.id }}
                </code>
                <span class="text-[10px]" style="color: #8A8A8A">
                  {{ group.label }} · {{ group.phrases.length }}
                </span>
              </div>
              <ul v-if="group.phrases.length" class="space-y-0.5 text-xs">
                <li
                  v-for="(p, i) in group.phrases"
                  :key="i"
                  class="flex items-start gap-2"
                  style="color: #000000"
                >
                  <span class="font-mono shrink-0" style="color: #C8C8C8">{{ i + 1 }}.</span>
                  <span class="leading-snug">"{{ p }}"</span>
                </li>
              </ul>
              <div v-else class="text-xs italic" style="color: #C8C8C8">
                нет фраз (молчаливое состояние)
              </div>
            </div>
          </section>

          <!-- ─── Trigger Map ─── -->
          <!-- Reads TRIGGER_CONFIG from engine/triggers.js. Each row maps
               event → state → phrase, grouped by `when` event type.
               Tap a row to preview Tama's reaction (uses configured phrase,
               not a random one from TAMA_PHRASES). -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Карта триггеров
            </div>
            <div class="text-[11px] leading-relaxed mb-2" style="color: #8A8A8A">
              Событие → состояние → фраза. Источник: <code style="background: #EEEEEE; padding: 1px 4px; border-radius: 2px; color: #000000">engine/triggers.js</code>.
              Клик по строке — превью реакции маскота.
            </div>
            <div
              v-for="group in triggerMap"
              :key="group.when"
              class="overflow-hidden"
              style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
            >
              <!-- Group header — event type with friendly label -->
              <div
                class="px-3 py-1.5 flex items-center justify-between"
                style="background: #EEEEEE; border-bottom: 1px solid #C8C8C8"
              >
                <code class="text-xs" style="color: #000000">{{ group.when }}</code>
                <span class="text-[10px]" style="color: #8A8A8A">
                  {{ whenLabel(group.when) }}
                </span>
              </div>

              <!-- Rows -->
              <button
                v-for="trig in group.triggers"
                :key="trig.id"
                type="button"
                class="w-full text-left px-3 py-2 transition-colors flex flex-col gap-0.5"
                :disabled="!trig.mascotState"
                :style="{
                  borderTop: '1px solid #EEEEEE',
                  cursor: trig.mascotState ? 'pointer' : 'default',
                  opacity: trig.mascotState ? 1 : 0.55,
                }"
                @click="previewTrigger(trig)"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <code class="text-[11px] font-mono" style="color: #000000">{{ trig.id }}</code>
                  <span style="color: #C8C8C8">→</span>
                  <code
                    v-if="trig.mascotState"
                    class="px-1.5 py-0.5 rounded text-[10px]"
                    style="background: #000000; color: #FFFFFF"
                  >
                    {{ trig.mascotState }}
                  </code>
                  <span
                    v-else
                    class="text-[10px] italic"
                    style="color: #8A8A8A"
                  >
                    тишина
                  </span>
                </div>
                <div
                  v-if="trig.mascotPhrase"
                  class="text-[11px] leading-snug"
                  style="color: #4A4A4A"
                >
                  "{{ trig.mascotPhrase }}"
                </div>
                <div
                  v-else-if="trig.mascotState"
                  class="text-[10px] italic"
                  style="color: #8A8A8A"
                >
                  фраза случайная из TAMA_PHRASES.{{ trig.mascotState }}
                </div>
              </button>
            </div>
          </section>
        </div>

        <!-- ═══ SYSTEM TAB ═══ -->
        <!-- iOS PWA in standalone mode has no browser reload UI.
             Three actions: soft reload, hard reload (SW unregister + cache
             nuke + reload), and app version display. -->
        <div v-if="activeSection === 'system'" class="space-y-4">
          <div class="text-[11px] leading-relaxed" style="color: #8A8A8A">
            Системные действия для PWA в standalone-режиме (iOS не даёт UI-перезагрузки).
          </div>

          <!-- Soft reload -->
          <button
            type="button"
            class="w-full text-left p-3 transition-colors flex items-start gap-3"
            style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
            @click="softReload"
          >
            <RotateCw :size="18" color="#000000" class="mt-0.5 shrink-0" />
            <div class="flex-1">
              <div class="font-semibold text-sm" style="color: #000000">
                Обновить страницу
              </div>
              <div class="text-[11px] mt-0.5" style="color: #8A8A8A">
                <code style="background: #EEEEEE; padding: 1px 4px; border-radius: 2px; color: #4A4A4A">window.location.reload()</code>
              </div>
            </div>
          </button>

          <!-- Hard reload -->
          <button
            type="button"
            class="w-full text-left p-3 transition-colors flex items-start gap-3"
            :disabled="hardReloadBusy"
            :style="{
              background: '#FFFFFF',
              border: '2px solid #000000',
              borderRadius: '4px',
              opacity: hardReloadBusy ? 0.6 : 1,
              cursor: hardReloadBusy ? 'wait' : 'pointer',
            }"
            @click="hardReload"
          >
            <Eraser :size="18" color="#000000" class="mt-0.5 shrink-0" />
            <div class="flex-1">
              <div class="font-semibold text-sm" style="color: #000000">
                Сбросить кэш и обновить
              </div>
              <div class="text-[11px] mt-0.5 leading-snug" style="color: #8A8A8A">
                Снимает регистрацию service worker, очищает <code style="background: #EEEEEE; padding: 1px 4px; border-radius: 2px; color: #4A4A4A">caches</code>, перезагружает.
              </div>
              <div v-if="hardReloadBusy" class="text-[10px] mt-1" style="color: #4A4A4A">
                Чищу…
              </div>
            </div>
          </button>

          <!-- Version -->
          <div
            class="p-3 flex items-start gap-3"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <Info :size="18" color="#8A8A8A" class="mt-0.5 shrink-0" />
            <div class="flex-1">
              <div class="text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
                Версия приложения
              </div>
              <div class="font-mono text-sm mt-0.5" style="color: #000000">
                {{ APP_VERSION }}
              </div>
            </div>
          </div>

          <!-- Diagnostic info — sw status, cache count, user agent -->
          <div
            class="p-3 space-y-1.5"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <div class="text-[10px] uppercase tracking-wider mb-1" style="color: #8A8A8A">
              Среда выполнения
            </div>
            <div class="font-mono text-[10px] flex flex-wrap gap-x-2 gap-y-0.5" style="color: #4A4A4A">
              <span>standalone:</span>
              <span style="color: #000000">
                {{ typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches ? 'yes' : 'no' }}
              </span>
            </div>
            <div class="font-mono text-[10px] flex flex-wrap gap-x-2 gap-y-0.5" style="color: #4A4A4A">
              <span>service-worker:</span>
              <span style="color: #000000">
                {{ typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'supported' : 'no' }}
              </span>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
