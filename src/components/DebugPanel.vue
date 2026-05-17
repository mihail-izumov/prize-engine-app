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
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue'
import { Bug, X, Trash2, RefreshCw, RotateCw, Eraser, Info } from 'lucide-vue-next'
import { usePartition } from '../composables/usePartition.js'
import { useSeries } from '../composables/useSeries.js'
import { useCards } from '../composables/useCards.js'
import { useTama, STATES as TAMA_STATES, TAMA_PHRASES, TAMA_ONBOARDING, randomFact } from '../composables/useTama.js'
import { useFirstTimeFlags, KNOWN_FLAGS } from '../composables/useFirstTimeFlags.js'
import { useAgenda, KNOWN_AGENDA_IDS } from '../composables/useAgenda.js'
import {
  TIER_ORDER, TIER_META, CARD_META,
  SLOT_CATALOG, enginePoolToUiCollection,
} from '../engine/constants.js'
import {
  buildQrForBox, summarizeStateByTier,
  fmtCharges, slotInfoById,
} from '../engine/state-helpers.js'
import { TRIGGER_CONFIG } from '../engine/triggers.js'
import {
  SCENARIOS_REGISTRY, CATEGORY_LABELS, CATEGORY_ORDER,
  KNOWN_VARS, groupByCategory, extractPhraseVars,
} from '../engine/scenarios-registry.js'

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
  ensureVisible()
  tama.trigger(id)
}

// Game scenarios — copied 1:1 from mascot-phase1.jsx GameScenario (lines 2046-2062).
function runCommonScenario() {
  ensureVisible()
  tama.trigger('charge-up', {
    vars: { amount: 300, balance: 1240, next_tier_gap: 480 },
    duration: 4000,
  })
}
function runLegendaryScenario() {
  ensureVisible()
  tama.trigger('charge-up', {
    vars: { amount: 500, balance: 4800, next_tier_gap: 200 },
    duration: 4000,
  })
}
function runMythicScenario() {
  ensureVisible()
  tama.trigger('wow', { duration: 5000 })
}

function onMascotReset() {
  // Reset also un-hides in debug context — otherwise the developer would
  // reset to "idle" but still see the sleeping-box if isHidden is true
  // from a previous session (it persists via localStorage).
  ensureVisible()
  tama.reset()
}
function onReplayOnboarding() {
  tama.replayOnboarding()
}

// Force the mascot visible before any debug-triggered state change.
// This is debug-specific: the developer clicks a button to SEE the
// reaction. If isHidden was true (persisted from a previous session
// where the user tapped the sleep button), the mascot would silently
// stay in the sleeping-box even after trigger() changes currentState —
// because the render switch uses isHidden first, currentState second.
function ensureVisible() {
  if (tama.isHidden.value) tama.isHidden.value = false
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
  ensureVisible()
  tama.trigger(trigger.mascotState, {
    message: trigger.mascotPhrase || undefined,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase β.1 sub-phase f — NEW: scenario accordion + filters + info pane
// ═══════════════════════════════════════════════════════════════════════════

// Wire the composables required by the new sub-phase f UI. flags/agenda are
// singletons so calling here doesn't double-init; we just take handles.
const flagsApi = useFirstTimeFlags()
const agendaApi = useAgenda()

// ── Filter state ─────────────────────────────────────────────────────────
//   priorityFilter — Set of active P-pills. Empty Set means "show all".
//   showUnimpl     — boolean toggle for ✱ Unimplemented filter
//   searchQuery    — case-insensitive substring match on trigger_id +
//                    text_preview + code
const priorityFilter = ref(new Set())
const showUnimpl = ref(false)
const searchQuery = ref('')

function togglePriority(p) {
  const s = new Set(priorityFilter.value)
  if (s.has(p)) s.delete(p); else s.add(p)
  priorityFilter.value = s
}
function clearFilters() {
  priorityFilter.value = new Set()
  showUnimpl.value = false
  searchQuery.value = ''
}

// ── Implementation status check ──────────────────────────────────────────
//   Source of truth: TRIGGER_CONFIG ids + KNOWN_AGENDA_IDS + special-cases
//   (onboarding lives in TAMA_ONBOARDING; curiosity_* are in-engine in
//   useTama). Anything else => unimplemented (✱).
const TRIGGER_CONFIG_IDS = new Set(TRIGGER_CONFIG.map(t => t.id))
const SPECIAL_IMPLEMENTED = new Set([
  'onboarding',
  'curiosity_tap_1', 'curiosity_tap_few', 'curiosity_tap_many',
  'curiosity_tap_pestering', 'curiosity_tap_warning',
  'curiosity_easter_egg',
])
function isImplemented(entry) {
  if (TRIGGER_CONFIG_IDS.has(entry.trigger_id)) return true
  if (KNOWN_AGENDA_IDS.includes(entry.trigger_id)) return true
  if (SPECIAL_IMPLEMENTED.has(entry.trigger_id)) return true
  return false
}

// ── Filtered + grouped scenarios for accordion ───────────────────────────
const filteredEntries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const pSet = priorityFilter.value
  return SCENARIOS_REGISTRY.filter(e => {
    if (pSet.size > 0 && !pSet.has(e.priority)) return false
    if (showUnimpl.value && isImplemented(e)) return false
    if (q) {
      const hay = (e.trigger_id + ' ' + (e.text_preview || '') + ' ' + e.code).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})
const filteredGroups = computed(() => groupByCategory(filteredEntries.value))
const filteredTotal = computed(() => filteredEntries.value.length)

// ── Vars-edit state ──────────────────────────────────────────────────────
//   Per-entry editable vars map. Keyed by entry.code to disambiguate among
//   ~66 entries. Defaults pre-populated so phrases preview cleanly without
//   user editing first.
const DEFAULT_VAR_VALUES = Object.freeze({
  amount: '300', balance: '1200', next_tier_gap: '600',
  tier_name: 'Epic', power_name: 'Везения',
  cards_have: '2', cards_need: '3',
  ip_name: 'ST', days_away: '30', gift_name: 'приз',
  slots_left: '8',
})
const varsState = reactive({}) // { [entry.code]: { var: value, ... } }
function ensureVarsState(entry) {
  if (varsState[entry.code]) return varsState[entry.code]
  const vars = extractPhraseVars(entry.text_preview)
  const bag = {}
  for (const v of vars) bag[v] = DEFAULT_VAR_VALUES[v] ?? ''
  varsState[entry.code] = bag
  return bag
}
function varsForEntry(entry) {
  return extractPhraseVars(entry.text_preview)
}

// Numeric coercion: most known vars are numeric. tier_name/power_name/ip_name/
// gift_name stay as strings.
const STRING_VARS = new Set(['tier_name', 'power_name', 'ip_name', 'gift_name'])
function coerceVar(name, value) {
  if (STRING_VARS.has(name)) return value
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

// ── Simulate entry ───────────────────────────────────────────────────────
//   Routes by entry.kind:
//     onboarding         → tama.replayOnboarding()
//     curiosity (J6)     → tama.trigger('smug-wink', { message: randomFact() })
//     curiosity (J1-J5)  → tama.trigger(state, { phraseKey, vars })
//     reactive / agenda  → tama.trigger(state, { phraseKey: trigger_id, vars })
//   Silent entries (state === 'silent') — disabled, no-op.
function simulateEntry(entry) {
  if (entry.state === 'silent') return
  ensureVisible()
  if (entry.kind === 'onboarding') {
    tama.replayOnboarding()
    return
  }
  if (entry.trigger_id === 'curiosity_easter_egg') {
    tama.trigger('smug-wink', { message: randomFact() })
    return
  }
  // Build vars from edit state (coerced)
  const editBag = ensureVarsState(entry)
  const vars = {}
  for (const k of Object.keys(editBag)) {
    vars[k] = coerceVar(k, editBag[k])
  }
  tama.trigger(entry.state, {
    phraseKey: entry.trigger_id,
    vars,
  })
}

// ── First-time flags toggle list ─────────────────────────────────────────
//   Read live from getAllFlags(). On checkbox toggle: resetFlag if unchecking,
//   markFlagSeen if checking. UI reflects the underlying singleton state.
//   nowTick used as dep so the list re-evaluates after toggles (since
//   getAllFlags returns an object, Vue's reactivity may not pick up internal
//   changes unless we tick).
const nowTick = ref(0)
const flagsListLive = computed(() => {
  // Read nowTick to register dep
  void nowTick.value
  const allFlags = flagsApi.getAllFlags() // { name: bool }
  // Show every KNOWN_FLAG + any flag actually set with a dynamic prefix
  const knownSet = new Set(KNOWN_FLAGS)
  const result = []
  // Known flags first, alphabetized
  const sortedKnown = [...KNOWN_FLAGS].sort()
  for (const name of sortedKnown) {
    result.push({ name, seen: !!allFlags[name] })
  }
  // Dynamic flags (e.g. new_series:ST) — flags returned from getAllFlags that
  // aren't in KNOWN_FLAGS
  for (const name of Object.keys(allFlags)) {
    if (!knownSet.has(name) && allFlags[name]) {
      result.push({ name, seen: true, dynamic: true })
    }
  }
  return result
})

function toggleFlag(flag) {
  if (flag.seen) {
    flagsApi.resetFlag(flag.name)
  } else {
    flagsApi.markFlagSeen(flag.name)
  }
  nowTick.value++
}
function resetAllFlagsClick() {
  flagsApi.resetAllFlags()
  nowTick.value++
}

// ── Agenda queue inspection ──────────────────────────────────────────────
//   pendingAgendas — live from useAgenda (ref).
//   deliveredAgendaFlags — list of { trigger_id, deliveredAt, cooldown_h,
//     remainingMs }. Cooldown_h is derived per-trigger by looking up the
//     known item shape. Defaults to 24h (the value used by all our agenda
//     enqueue calls in (d) and (e)).
const DEFAULT_AGENDA_COOLDOWN_H = 24

function fmtCooldown(remainingMs) {
  if (!Number.isFinite(remainingMs)) return '∞'
  if (remainingMs <= 0) return 'готов'
  const h = Math.floor(remainingMs / 3600_000)
  const m = Math.floor((remainingMs % 3600_000) / 60_000)
  const s = Math.floor((remainingMs % 60_000) / 1000)
  if (h > 0) return h + 'ч ' + m + 'м'
  if (m > 0) return m + 'м ' + s + 'с'
  return s + 'с'
}
function fmtTimestamp(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

const deliveredAgendaFlagsLive = computed(() => {
  void nowTick.value // dep
  const raw = agendaApi.getDeliveredFlags()
  return raw.map(item => {
    const remaining = agendaApi.getCooldownRemaining(item.trigger_id, DEFAULT_AGENDA_COOLDOWN_H)
    return {
      ...item,
      cooldown_h: DEFAULT_AGENDA_COOLDOWN_H,
      remainingMs: remaining,
      remainingLabel: fmtCooldown(remaining),
      timestampLabel: fmtTimestamp(item.deliveredAt),
    }
  })
})

function resetAgendaCooldownsClick() {
  agendaApi.resetCooldowns()
  nowTick.value++
}
function resetSingleAgendaCooldown(triggerId) {
  agendaApi.resetSingleCooldown(triggerId)
  nowTick.value++
}

// ── Curiosity counter reset ──────────────────────────────────────────────
function resetCuriosity() {
  tama.curiosityTaps.value = 0
}

// ── Sleep / Wake direct buttons (Quick actions row 1) ────────────────────
function sleepNow() {
  tama.goToSleep()
}
function wakeNow() {
  ensureVisible()
  tama.wakeUp()
}

// ── Live tick for cooldown countdown ─────────────────────────────────────
//   Updates every 1s while DebugPanel mounted. The tick increments nowTick
//   which acts as a reactive dep for cooldown-remaining computeds.
//   Cleanup on unmount avoids leaks if the panel is destroyed while open.
let tickInterval = null
onMounted(() => {
  tickInterval = setInterval(() => { nowTick.value++ }, 1000)
})
onUnmounted(() => {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null }
})

// Priority pill colors — visual hierarchy from P0 (critical, black) to P3 (deferred, grey).
const PRIORITY_STYLES = Object.freeze({
  P0: { bg: '#000000', fg: '#FFFFFF' },
  P1: { bg: '#4A4A4A', fg: '#FFFFFF' },
  P2: { bg: '#8A8A8A', fg: '#FFFFFF' },
  P3: { bg: '#C8C8C8', fg: '#000000' },
})
function priorityStyle(p) { return PRIORITY_STYLES[p] || PRIORITY_STYLES.P3 }

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
    App.vue's <main> via v-if). TopBar and TabBar are hidden by App.vue
    while this is mounted; debug provides its own navigation (sticky
    header with X close + sticky tabs + fixed-bottom DEV indicator).
  -->
  <div class="w-full" style="background: #FFFFFF">
    <!-- ─── Sticky top: safe-area + header + tab switcher ───────────────
         padding-top: env(safe-area-inset-top) paints the iPhone notch
         area with white so it visually merges with the debug header.
         Stays glued to viewport top during scroll (z-40, below mascot
         z-50 and plinth z-49, but above content). -->
    <div
      class="sticky z-40"
      style="
        top: 0;
        background: #FFFFFF;
        padding-top: env(safe-area-inset-top, 0px);
        border-bottom: 1px solid #C8C8C8;
      "
    >
      <!-- Header — Debug · series name + X close button -->
      <div
        class="flex items-center justify-between px-4 py-3"
        style="border-bottom: 1px solid #C8C8C8"
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
      <div class="flex flex-wrap">
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
    </div>

      <!-- Content area. No internal scroll — window scrolls naturally.
           pb is dynamic to clear fixed-bottom elements:
           • Non-mascot tabs: pb-24 (96px) clears the red DEV banner alone
             (~61px on iPhone: 27px inner + safe-area-inset-bottom 34px).
           • Mascot tab: pb-[280px] clears the full plinth+banner stack
             (~241px on iPhone) with ~40px breathing room so last content
             row sits comfortably above the plinth top edge. -->
      <div
        class="px-4 pt-4"
        :class="activeSection === 'mascot' ? 'pb-[280px]' : 'pb-24'"
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

        <!-- ═══ MASCOT TAB — Phase β.1 sub-phase f redesign ═══ -->
        <!--
          Structure (top → bottom):
            1. Quick actions sticky top (Reset state / Replay onb / Wake /
               Sleep / Reset curiosity / Reset flags / Reset agenda)
            2. Filter bar (P0-P3 pills, ✱ Unimplemented, search input)
            3. Accordion: 11 categories A-K (collapsible <details>)
            4. Info pane (Mascot state, Curiosity, Agenda queue, Flags)
            5. Reference (Phrase bank, 12-state buttons, Game scenarios) —
               collapsed by default since accordion makes them redundant.

          Source of truth for scenarios: src/engine/scenarios-registry.js
          (derived from TAMA-SCENARIOS.md v0.2 §4 + §10).
        -->
        <div v-if="activeSection === 'mascot'" class="space-y-3">

          <!-- ─── 1. Quick actions (sticky) ─── -->
          <div
            class="sticky top-0 -mx-3 px-3 py-2 space-y-2 z-10"
            style="background: #FAFAFA; border-bottom: 1px solid #C8C8C8"
          >
            <!-- Row 1: state actions -->
            <div class="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="onMascotReset"
              >
                Reset state
              </button>
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="onReplayOnboarding"
              >
                Replay onb.
              </button>
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="wakeNow"
              >
                Wake
              </button>
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="sleepNow"
              >
                Sleep
              </button>
            </div>
            <!-- Row 2: persistence resets -->
            <div class="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="resetCuriosity"
              >
                Reset curiosity
              </button>
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="resetAllFlagsClick"
              >
                Reset all flags
              </button>
              <button
                type="button"
                class="px-2 py-1.5 text-[11px] font-medium"
                style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px; color: #000000"
                @click="resetAgendaCooldownsClick"
              >
                Reset agenda
              </button>
            </div>

            <!-- Row 3: filter pills + search -->
            <div class="flex items-center gap-1 flex-wrap">
              <button
                v-for="p in ['P0','P1','P2','P3']"
                :key="p"
                type="button"
                class="px-2 py-1 text-[10px] font-mono"
                :style="{
                  background: priorityFilter.has(p) ? priorityStyle(p).bg : '#FFFFFF',
                  color: priorityFilter.has(p) ? priorityStyle(p).fg : '#000000',
                  border: '1px solid #000000',
                  borderRadius: '3px',
                }"
                @click="togglePriority(p)"
              >
                {{ p }}
              </button>
              <button
                type="button"
                class="px-2 py-1 text-[10px] font-mono"
                :style="{
                  background: showUnimpl ? '#000000' : '#FFFFFF',
                  color: showUnimpl ? '#FFFFFF' : '#000000',
                  border: '1px solid #000000',
                  borderRadius: '3px',
                }"
                @click="showUnimpl = !showUnimpl"
              >
                ✱ Unimpl
              </button>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="search..."
                class="flex-1 min-w-[80px] px-2 py-1 text-[11px] font-mono"
                style="background: #FFFFFF; border: 1px solid #000000; border-radius: 3px; color: #000000"
              />
              <button
                v-if="priorityFilter.size || showUnimpl || searchQuery"
                type="button"
                class="px-2 py-1 text-[10px]"
                style="background: #EEEEEE; border: 1px solid #C8C8C8; border-radius: 3px; color: #4A4A4A"
                @click="clearFilters"
              >
                ✕
              </button>
            </div>
            <div class="text-[10px] font-mono" style="color: #4A4A4A">
              Найдено: {{ filteredTotal }} / {{ SCENARIOS_REGISTRY.length }}
            </div>
          </div>

          <!-- ─── 2. Accordion: 11 categories A-K ─── -->
          <details
            v-for="group in filteredGroups"
            :key="group.key"
            class="overflow-hidden"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
            open
          >
            <summary
              class="px-3 py-2 cursor-pointer text-xs font-semibold"
              style="background: #EEEEEE; color: #000000; user-select: none"
            >
              {{ group.label }}
              <span class="font-normal" style="color: #4A4A4A">
                · {{ group.entries.length }}
              </span>
            </summary>
            <!-- Rows inside category -->
            <div
              v-for="entry in group.entries"
              :key="entry.code + ':' + entry.trigger_id"
              class="px-3 py-2 space-y-1"
              style="border-top: 1px solid #EEEEEE"
            >
              <!-- Header: code · priority · trigger_id · impl-marker -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono text-[10px]" style="color: #8A8A8A">
                  {{ entry.code }}
                </span>
                <span
                  class="px-1.5 py-0.5 text-[9px] font-mono"
                  :style="{
                    background: priorityStyle(entry.priority).bg,
                    color: priorityStyle(entry.priority).fg,
                    borderRadius: '2px',
                  }"
                >
                  {{ entry.priority }}
                </span>
                <code class="text-[11px] font-mono" style="color: #000000">
                  {{ entry.trigger_id }}
                </code>
                <span
                  v-if="!isImplemented(entry)"
                  class="text-[10px]"
                  style="color: #8A8A8A"
                  title="Не реализовано"
                >
                  ✱
                </span>
              </div>
              <!-- Meta: emotion · kratnost · kind -->
              <div class="text-[10px] font-mono" style="color: #4A4A4A">
                <span>Эмоция: </span>
                <code style="color: #000000">{{ entry.state }}</code>
                <span> · {{ entry.kratnost }} · {{ entry.kind }}</span>
              </div>
              <!-- Text preview -->
              <div
                v-if="entry.text_preview"
                class="text-[11px] leading-snug italic"
                style="color: #000000"
              >
                "{{ entry.text_preview }}"
              </div>
              <!-- Condition description -->
              <div class="text-[10px] leading-snug" style="color: #8A8A8A">
                {{ entry.condition_description }}
              </div>

              <!-- Vars edit (only if phrase has interpolation vars) -->
              <details
                v-if="varsForEntry(entry).length > 0"
                class="text-[10px]"
              >
                <summary
                  class="cursor-pointer font-mono py-0.5"
                  style="color: #4A4A4A"
                  @click="ensureVarsState(entry)"
                >
                  Vars ▼ ({{ varsForEntry(entry).join(', ') }})
                </summary>
                <div class="mt-1 space-y-1 pl-3" style="border-left: 1px solid #EEEEEE">
                  <div
                    v-for="v in varsForEntry(entry)"
                    :key="v"
                    class="flex items-center gap-2"
                  >
                    <label class="w-24 shrink-0 font-mono text-[10px]" style="color: #4A4A4A">
                      {{ v }}
                    </label>
                    <input
                      :value="ensureVarsState(entry)[v]"
                      @input="ensureVarsState(entry)[v] = $event.target.value"
                      type="text"
                      class="flex-1 px-1.5 py-0.5 text-[10px] font-mono"
                      style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px; color: #000000"
                    />
                  </div>
                </div>
              </details>

              <!-- Action buttons -->
              <div class="flex gap-1.5 pt-1">
                <button
                  type="button"
                  class="px-2.5 py-1 text-[11px] font-medium"
                  :disabled="entry.state === 'silent'"
                  :style="{
                    background: entry.state === 'silent' ? '#EEEEEE' : '#000000',
                    color: entry.state === 'silent' ? '#8A8A8A' : '#FFFFFF',
                    border: '1px solid #000000',
                    borderRadius: '3px',
                    cursor: entry.state === 'silent' ? 'not-allowed' : 'pointer',
                    opacity: entry.state === 'silent' ? 0.55 : 1,
                  }"
                  @click="simulateEntry(entry)"
                >
                  Симулировать
                </button>
                <span
                  v-if="entry.state === 'silent'"
                  class="text-[10px] italic self-center"
                  style="color: #8A8A8A"
                >
                  silent — без bubble
                </span>
              </div>
            </div>
          </details>

          <!-- No-results message -->
          <div
            v-if="filteredGroups.length === 0"
            class="p-3 text-center text-[11px] italic"
            style="background: #FFFFFF; border: 1px dashed #C8C8C8; border-radius: 4px; color: #8A8A8A"
          >
            Ничего не найдено. Сбрось фильтры.
          </div>

          <!-- ─── 3. Info pane ─── -->
          <details
            class="overflow-hidden"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
            open
          >
            <summary
              class="px-3 py-2 cursor-pointer text-xs font-semibold"
              style="background: #EEEEEE; color: #000000; user-select: none"
            >
              Состояние маскота
            </summary>
            <div class="p-3 space-y-2.5">
              <!-- Current state -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  Current
                </div>
                <div class="flex-1">
                  <code class="px-1.5 py-0.5 rounded text-xs" style="background: #000000; color: #FFFFFF">
                    {{ tama.currentState.value }}
                  </code>
                  <span v-if="currentStateMeta" class="ml-2 text-[10px]" style="color: #8A8A8A">
                    {{ currentStateMeta.label }}
                  </span>
                </div>
              </div>
              <!-- Bubble -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  Bubble
                </div>
                <div class="flex-1 text-xs" style="color: #000000">
                  <span v-if="tama.bubble.value">
                    "{{ tama.bubble.value.message }}"
                    <span v-if="tama.bubble.value.subtitle" style="color: #8A8A8A">
                      / {{ tama.bubble.value.subtitle }}
                    </span>
                  </span>
                  <span v-else class="italic" style="color: #C8C8C8">—</span>
                  <span
                    v-if="tama.bubbleVisible.value"
                    class="ml-2 px-1.5 py-0.5 text-[9px]"
                    style="background: #000000; color: #FFFFFF; border-radius: 2px"
                  >
                    visible
                  </span>
                </div>
              </div>
              <!-- Hidden -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  Hidden
                </div>
                <div class="flex-1 text-xs">
                  <code class="px-1.5 py-0.5 rounded" style="background: #EEEEEE; color: #000000">
                    {{ tama.isHidden.value }}
                  </code>
                </div>
              </div>
              <!-- History last 5 -->
              <div class="flex items-start gap-3 text-sm">
                <div class="w-24 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style="color: #8A8A8A">
                  History
                </div>
                <div class="flex-1 space-y-0.5">
                  <div
                    v-if="mascotHistory.length === 0"
                    class="text-[11px] italic"
                    style="color: #C8C8C8"
                  >
                    — пусто —
                  </div>
                  <ul v-else class="text-[11px] font-mono space-y-0.5">
                    <li
                      v-for="(h, i) in mascotHistory.slice(0, 5)"
                      :key="i"
                      class="flex items-center gap-1.5"
                      style="color: #000000"
                    >
                      <span style="color: #C8C8C8">{{ i + 1 }}.</span>
                      <span style="color: #8A8A8A">{{ h.from }}</span>
                      <span style="color: #C8C8C8">→</span>
                      <span class="font-semibold" style="color: #000000">{{ h.to }}</span>
                      <span
                        v-if="h.hadBubble"
                        class="text-[9px] uppercase ml-0.5"
                        style="color: #C8C8C8"
                      >
                        ●
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </details>

          <!-- ─── 4. Curiosity counter live ─── -->
          <details
            class="overflow-hidden"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <summary
              class="px-3 py-2 cursor-pointer text-xs font-semibold"
              style="background: #EEEEEE; color: #000000; user-select: none"
            >
              Curiosity counter · {{ tama.curiosityTaps.value }}
            </summary>
            <div class="p-3 space-y-2">
              <div class="text-[11px] leading-snug" style="color: #4A4A4A">
                Счётчик тапов по маскоту в idle. После 10+ начинают идти факты из
                <code style="background: #EEEEEE; padding: 1px 3px; border-radius: 2px; color: #000000">CURIOSITY_FACTS</code>.
                Сбрасывается на refresh приложения (в localStorage не пишется).
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
                  Текущее:
                </span>
                <code class="px-2 py-0.5 text-sm" style="background: #000000; color: #FFFFFF; border-radius: 3px">
                  {{ tama.curiosityTaps.value }}
                </code>
                <button
                  type="button"
                  class="ml-auto px-2 py-1 text-[10px] font-medium"
                  style="background: #FFFFFF; border: 1px solid #000000; border-radius: 3px; color: #000000"
                  @click="resetCuriosity"
                >
                  Reset
                </button>
              </div>
            </div>
          </details>

          <!-- ─── 5. Agenda queue (pending + delivered) ─── -->
          <details
            class="overflow-hidden"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <summary
              class="px-3 py-2 cursor-pointer text-xs font-semibold"
              style="background: #EEEEEE; color: #000000; user-select: none"
            >
              Agenda queue · pending {{ agendaApi.pendingAgendas.value.length }} · delivered {{ deliveredAgendaFlagsLive.length }}
            </summary>
            <div class="p-3 space-y-3">
              <!-- Pending list -->
              <div class="space-y-1">
                <div class="text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
                  Pending ({{ agendaApi.pendingAgendas.value.length }})
                </div>
                <div
                  v-if="agendaApi.pendingAgendas.value.length === 0"
                  class="text-[11px] italic"
                  style="color: #C8C8C8"
                >
                  — очередь пуста —
                </div>
                <ul v-else class="space-y-0.5 text-[11px] font-mono">
                  <li
                    v-for="item in agendaApi.pendingAgendas.value"
                    :key="item.trigger_id"
                    class="flex items-center gap-2"
                    style="color: #000000"
                  >
                    <span
                      class="px-1 py-0.5 text-[9px]"
                      style="background: #000000; color: #FFFFFF; border-radius: 2px"
                    >
                      p{{ item.priority }}
                    </span>
                    <code style="color: #000000">{{ item.trigger_id }}</code>
                    <span style="color: #8A8A8A">·</span>
                    <code style="color: #4A4A4A">{{ item.mascot_state }}</code>
                  </li>
                </ul>
              </div>
              <!-- Delivered list with cooldown countdown -->
              <div class="space-y-1">
                <div class="text-[10px] uppercase tracking-wider" style="color: #8A8A8A">
                  Delivered ({{ deliveredAgendaFlagsLive.length }})
                </div>
                <div
                  v-if="deliveredAgendaFlagsLive.length === 0"
                  class="text-[11px] italic"
                  style="color: #C8C8C8"
                >
                  — ничего не доставлено —
                </div>
                <ul v-else class="space-y-1 text-[11px] font-mono">
                  <li
                    v-for="item in deliveredAgendaFlagsLive"
                    :key="item.trigger_id"
                    class="flex items-center gap-2"
                    style="color: #000000"
                  >
                    <code style="color: #000000">{{ item.trigger_id }}</code>
                    <span style="color: #8A8A8A">@ {{ item.timestampLabel }}</span>
                    <span style="color: #4A4A4A">cd: {{ item.remainingLabel }}</span>
                    <button
                      type="button"
                      class="ml-auto px-1.5 py-0.5 text-[9px]"
                      style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px; color: #4A4A4A"
                      @click="resetSingleAgendaCooldown(item.trigger_id)"
                    >
                      reset
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </details>

          <!-- ─── 6. First-time flags toggle list ─── -->
          <details
            class="overflow-hidden"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <summary
              class="px-3 py-2 cursor-pointer text-xs font-semibold"
              style="background: #EEEEEE; color: #000000; user-select: none"
            >
              First-time flags · {{ flagsListLive.filter(f => f.seen).length }} / {{ flagsListLive.length }} set
            </summary>
            <div class="p-3 space-y-1">
              <div class="text-[11px] leading-snug mb-2" style="color: #4A4A4A">
                Persistence: <code style="background: #EEEEEE; padding: 1px 3px; border-radius: 2px; color: #000000">mascot:flag:&lt;name&gt;:v1</code>.
                Toggle для отдельного reset/mark.
              </div>
              <label
                v-for="flag in flagsListLive"
                :key="flag.name"
                class="flex items-center gap-2 py-0.5 text-[11px] font-mono cursor-pointer"
                style="color: #000000"
              >
                <input
                  type="checkbox"
                  :checked="flag.seen"
                  @change="toggleFlag(flag)"
                  class="shrink-0"
                />
                <code style="color: #000000">{{ flag.name }}</code>
                <span
                  v-if="flag.dynamic"
                  class="text-[9px] px-1 py-0.5"
                  style="background: #EEEEEE; color: #4A4A4A; border-radius: 2px"
                >
                  dyn
                </span>
              </label>
            </div>
          </details>

          <!-- ─── 7. Reference: phrase bank + direct state buttons ─── -->
          <!-- Collapsed by default — accordion makes these mostly redundant,
               but keep for visual state-preview convenience. -->
          <details
            class="overflow-hidden"
            style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 4px"
          >
            <summary
              class="px-3 py-2 cursor-pointer text-xs font-semibold"
              style="background: #EEEEEE; color: #000000; user-select: none"
            >
              Reference (phrase bank · state buttons · scenarios)
            </summary>
            <div class="p-3 space-y-4">
              <!-- 12-state direct buttons -->
              <section class="space-y-1.5">
                <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                  12 состояний (visual preview)
                </div>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="b in MASCOT_STATE_BUTTONS"
                    :key="b.id"
                    type="button"
                    class="px-2 py-1.5 text-[10px] font-medium"
                    :style="{
                      background: tama.currentState.value === b.id ? '#000000' : '#FFFFFF',
                      color: tama.currentState.value === b.id ? '#FFFFFF' : '#000000',
                      border: '1px solid #000000',
                      borderRadius: '3px',
                    }"
                    @click="runMascotState(b.id)"
                  >
                    {{ b.label }}
                  </button>
                </div>
              </section>
              <!-- Game scenarios -->
              <section class="space-y-1.5">
                <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                  Игровой сценарий
                </div>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    class="px-2 py-1.5 text-[10px] font-medium"
                    style="background: #FFFFFF; border: 1px solid #000000; border-radius: 3px; color: #000000"
                    @click="runCommonScenario"
                  >
                    Common
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1.5 text-[10px] font-medium"
                    style="background: #FFFFFF; border: 1px solid #000000; border-radius: 3px; color: #000000"
                    @click="runLegendaryScenario"
                  >
                    Legendary
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1.5 text-[10px] font-medium"
                    style="background: #FFFFFF; border: 1px solid #000000; border-radius: 3px; color: #000000"
                    @click="runMythicScenario"
                  >
                    Mythic
                  </button>
                </div>
              </section>
              <!-- Phrase Bank -->
              <section class="space-y-1.5">
                <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                  Phrase bank (TAMA_PHRASES + onboarding)
                </div>
                <div
                  v-for="group in phraseBank"
                  :key="group.id"
                  class="p-2"
                  style="background: #FAFAFA; border: 1px solid #EEEEEE; border-radius: 3px"
                >
                  <div class="flex items-center justify-between mb-1">
                    <code class="px-1 py-0.5 text-[10px]" style="background: #000000; color: #FFFFFF; border-radius: 2px">
                      {{ group.id }}
                    </code>
                    <span class="text-[10px]" style="color: #8A8A8A">
                      {{ group.phrases.length }}
                    </span>
                  </div>
                  <ul v-if="group.phrases.length" class="space-y-0.5 text-[10px]">
                    <li
                      v-for="(p, i) in group.phrases"
                      :key="i"
                      class="flex items-start gap-1"
                      style="color: #000000"
                    >
                      <span class="font-mono shrink-0" style="color: #C8C8C8">{{ i + 1 }}.</span>
                      <span class="leading-snug">"{{ p }}"</span>
                    </li>
                  </ul>
                  <div v-else class="text-[10px] italic" style="color: #C8C8C8">
                    — пусто —
                  </div>
                </div>
              </section>
            </div>
          </details>
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

    <!-- ─── Fixed bottom area: plinth (Mascot tab only) + DEV indicator ──
         Single fixed container at bottom: 0 — plinth stacks directly on
         top of the red banner with no gap by construction. z-49 sits
         below the mascot (z-50) so the mascot visually rides on top of
         the plinth. Container's own background is white (matches plinth
         for non-mascot tabs where plinth is hidden — only red banner
         shows at viewport bottom). -->
    <div
      class="fixed left-0 right-0 flex flex-col"
      style="bottom: 0; z-index: 49"
    >
      <!-- White plinth — behind mascot, only on Mascot tab.
           180px height covers mascot SVG full vertical span:
             • Mobile: bottom at safe-area+70, size 120 → top at ~224
             • Charge-up scale 1.0→1.15 adds ~9px overshoot upward
             • Desktop: bottom at safe-area+16, size 160 → top at ~176
           Plus red-banner ~27+safe-area below = total container ~241+safe
           on iPhone — fully contains the mascot in all states. -->
      <div
        v-if="activeSection === 'mascot'"
        style="
          height: 180px;
          background: #FFFFFF;
          border-top: 1px solid #E0E0E0;
          border-bottom: 1px solid #E0E0E0;
        "
        aria-hidden="true"
      ></div>

      <!-- Red "DEV MODE" indicator at the very bottom.
           padding-bottom includes safe-area-inset-bottom so the text
           sits above the iPhone home indicator. -->
      <div
        class="text-center font-mono text-[10px] uppercase tracking-[0.3em]"
        style="
          background: #DC2626;
          color: #000000;
          padding: 6px 16px calc(env(safe-area-inset-bottom, 0px) + 6px);
        "
      >
        ⚠ Режим разработки · debug
      </div>
    </div>
  </div>
</template>
