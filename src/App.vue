<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// App.vue — Phase 4 layout.
// Phase 2 orchestration preserved. Phase 3 additions preserved.
// Phase 4 additions:
//   • TamaMascot integration (useTama composable + TamaMascot.vue)
//   • fireTriggersWithMascot — wrapper that routes mascotState/mascotPhrase
//     from trigger configs to tama.trigger(), without touching engine/triggers.js
//   • mascotZone computed: scanner/reveal/debug → 'gambling', else → 'loyalty'
// ═══════════════════════════════════════════════════════════════════════════
import { ref, reactive, computed, watch } from 'vue'
import { Sparkles, ArrowLeft } from 'lucide-vue-next'

import TopBar from './components/TopBar.vue'
import TabBar from './components/TabBar.vue'
import ToastStack from './components/ToastStack.vue'
import RevealOverlay from './components/RevealOverlay.vue'
import ModalGiftDetails from './components/ModalGiftDetails.vue'
import ModalGiftClaim from './components/ModalGiftClaim.vue'
import DropAnimation from './components/DropAnimation.vue'
import DebugPanel from './components/DebugPanel.vue'
import AboutModal from './components/AboutModal.vue'
import TamaMascot from './components/TamaMascot.vue'

import ScannerScreen from './screens/ScannerScreen.vue'
import CollectionScreen from './screens/CollectionScreen.vue'
import GiftsScreen from './screens/GiftsScreen.vue'
import PowersScreen from './screens/PowersScreen.vue'
import ProfileScreen from './screens/ProfileScreen.vue'

import { usePartition } from './composables/usePartition.js'
import { useSeries } from './composables/useSeries.js'
import { useReveal } from './composables/useReveal.js'
import { useCards } from './composables/useCards.js'
import { useToast } from './composables/useToast.js'
import { useTama } from './composables/useTama.js'
import { useFirstTimeFlags } from './composables/useFirstTimeFlags.js'
import { useAgenda } from './composables/useAgenda.js'

import { parseQrCode, DEFAULT_CONFIG, SPARK_CONFIG } from './engine/draw-engine.js'
import { generatePlayerId, randomHex, slotInfoById } from './engine/state-helpers.js'
import {
  CARD_META, HISTORY_EVENT_TYPES, CARD_ACTIVATION_THRESHOLD,
  getGiftBuyPrice, getExchangePrice,
} from './engine/constants.js'
import { evaluateTriggers, fireTriggers } from './engine/triggers.js'

// ── State ────────────────────────────────────────────────────────────────
const activeTab = ref('scanner')
const debugMode = ref(false)
const selectedGift = ref(null)  // for ModalGiftDetails
const claimingGift = ref(null)  // for ModalGiftClaim

// Drop animations
const dropAnim = ref(null)        // { slotInfo, target: 'cart' | 'collection' }

// Player identity
const playerId = generatePlayerId()
const serverSeed = randomHex(32)
const clientSeed = randomHex(16)
const nonce = ref(0)
const scannedCount = ref(0)

// Phase 3 — debug & overlays
const scanLog = ref([])
const scannedQrs = reactive(new Set())
const debugPanelOpen = ref(false)
// Phase 4: which tab is active inside DebugPanel — used by mascotZone to
// keep the mascot rendered while on the 'mascot' debug tab (so the developer
// can visually verify each trigger). DebugPanel emits 'tab-change'.
const debugActiveTab = ref('qrs')
const statsOpen = ref(false)
const aboutOpen = ref(false)
const cartBadgePing = ref(0)
const collBadgePing = ref(0)

// ── Composables ──────────────────────────────────────────────────────────
const { partitionState, applyStateUpdates, resetPartition } = usePartition()
const { activeSeries, currentSeries, setActiveSeries, updateSeries, resetAllSeries } = useSeries()
const { reveal, startReveal, closeReveal, performScan } = useReveal()
const { activeEffects, creditCard, consumeEffects, refundKeysOnPoolFallback } = useCards()
const { pushToast } = useToast()
const tama = useTama()
const { markFlagSeen, hasSeenFlag } = useFirstTimeFlags()
// Phase β.1 (sub-phase d): agenda layer — priority queue of delayed mascot
//   messages. Wired below via idle-timer on [activeTab, reveal] and via
//   evaluatePartitionAgenda hook in the partition watcher.
const agenda = useAgenda()

// ── Phase β.1: session-streak counter (G5 — scan_success > 3 / 30min)
//   In-memory only, reset on app reload (matching SCENARIOS J spec).
//   Window: 30 minutes. After fire — flag for current session prevents re-fire.
const SESSION_STREAK_WINDOW_MS = 30 * 60 * 1000
const sessionScanTimes = ref([]) // timestamps of recent scans
let sessionStreakFiredThisSession = false

// ── Phase 4: Debug full-screen mode ─────────────────────────────────────
// When debug is open, the debug page takes over the entire viewport.
// TopBar, TabBar, sticky active-effects badge all hide; debug has its own
// navigation (sticky header + X close). Used by template v-if guards.
const isDebugFullScreen = computed(() => debugPanelOpen.value && debugMode.value)

// ── Phase 4: Mascot zone logic ──────────────────────────────────────────
// Scanner, active reveal, debug panel = gambling zone → mascot hidden.
// Exception: when the debug panel is open AND user is on the 'mascot' tab,
// keep the mascot visible — that tab exists specifically to test mascot
// reactions visually. This is a deliberate softening of TAMA-MASCOT-GUIDE
// Rule 6 ("Tama отсутствует в gambling-зонах") for the debug tool only,
// not production UX.
const mascotZone = computed(() => {
  // The Mascot debug tab is the visual verification tool — it MUST show
  // the mascot regardless of what the underlying screen is. Without this
  // override, activeTab='scanner' (the default landing tab) would force
  // 'gambling' and the developer couldn't see mascot reactions even after
  // switching to the Mascot tab. Highest priority.
  if (debugPanelOpen.value && debugActiveTab.value === 'mascot') return 'loyalty'

  // Normal gambling zones — scanner screen, active reveal animation.
  if (activeTab.value === 'scanner' || reveal.value) return 'gambling'

  // Debug panel open on any non-mascot tab — hide mascot to avoid noise.
  if (debugPanelOpen.value) return 'gambling'

  return 'loyalty'
})

// ── Phase 4: Trigger wrapper — routes mascotState/mascotPhrase to Tama ──
// Reads __mascotState/__mascotPhrase from evaluateTriggers() results and
// fires tama.trigger() in addition to the regular toast pipeline.
// NB: evaluateTriggers() prefixes meta fields with double-underscore
// (see engine/triggers.js line 487-488) — using bare `mascotState` here
// silently no-ops, the mascot would never react to in-app events.
//
// Phase β.1 (sub-phase b): also handles markFlag — calls markFlagSeen() for
// every triggered entry that declared a one-shot flag (string or function-
// resolved at evaluateTriggers time, see triggers.js). This is the SINGLE
// centralised marking point per owner's instruction: don't scatter
// markFlagSeen across handlers.
//
// Phase β.1 (sub-phase c): forwards __phraseKey (=trigger_id) and __vars
// (resolved) to tama.trigger. useTama.randomPhrase prefers TAMA_PHRASES[
// phraseKey] over state-default, so trigger entries automatically get their
// dedicated phrase bank without explicit phraseKey config. Static
// __mascotPhrase (legacy from sub-phase b) is still passed as message and
// serves as fallback if no TAMA_PHRASES bank exists for the trigger_id.
function fireTriggersWithMascot(triggers, pushToastFn, pushActivityFn) {
  fireTriggers(triggers, pushToastFn, pushActivityFn)
  for (const t of triggers) {
    if (t.__mascotState) {
      tama.trigger(t.__mascotState, {
        message: t.__mascotPhrase || undefined,
        phraseKey: t.__phraseKey,
        vars: t.__vars,
      })
    }
    if (t.__markFlag) {
      markFlagSeen(t.__markFlag)
    }
  }
}

// ── Passive observers ────────────────────────────────────────────────────
let prevSeriesSnapshot = { ...currentSeries.value }
watch(currentSeries, (next) => {
  fireTriggersWithMascot(evaluateTriggers('collection_change', {}, prevSeriesSnapshot, next), pushToast, null)
  fireTriggersWithMascot(evaluateTriggers('charges_change',    {}, prevSeriesSnapshot, next), pushToast, null)
  prevSeriesSnapshot = { ...next }
}, { deep: true })

let prevPartitionSnapshot = { ...partitionState.value }
watch(partitionState, (next) => {
  fireTriggersWithMascot(evaluateTriggers('partition_change', {}, prevPartitionSnapshot, next), pushToast, null)
  // Phase β.1 (sub-phase d): partition_almost_closed agenda check.
  //   evaluatePartitionAgenda fires only if redemption >= 0.80 and trigger
  //   not in cooldown (24h). Doesn't deliver — just enqueues. Delivery
  //   happens via idle-timer when player switches to a non-Scanner tab.
  agenda.evaluatePartitionAgenda(next)
  prevPartitionSnapshot = { ...next }
}, { deep: true })

watch(scannedCount, (next, prev) => {
  fireTriggersWithMascot(evaluateTriggers('scan_count_change', {}, { scannedCount: prev }, { scannedCount: next }), pushToast, null)
})

// Phase β.1 (sub-phase b): series_change watcher.
//   Эмитит два events на каждое изменение activeSeries:
//     - kind:'first_seen' (markFlag 'new_series:<id>') — new_series trigger
//     - kind:'switched' — series_switched trigger (рутина, только если был previous)
//   markFlag предотвращает повтор new_series для уже знакомой series. switched
//   fire'ит каждый раз когда oldId не пустой и отличается (без флага).
watch(activeSeries, (newId, oldId) => {
  if (!newId) return
  // first_seen — markFlag в trigger предотвращает повтор для known series
  fireTriggersWithMascot(
    evaluateTriggers('series_change', {
      seriesId: newId,
      seriesName: newId, // TODO: SERIES_META lookup когда добавится
      kind: 'first_seen',
    }),
    pushToast, null,
  )
  // switched — только при настоящем switch (был previous активный)
  if (oldId && oldId !== newId) {
    fireTriggersWithMascot(
      evaluateTriggers('series_change', {
        seriesId: newId,
        seriesName: newId,
        kind: 'switched',
      }),
      pushToast, null,
    )
  }
})

// Phase β.1 (sub-phase d): Agenda idle-timer.
//   When player switches tabs OR opens/closes reveal — start a 1500ms idle
//   timer. If still idle (no further change) — try to deliver next agenda
//   from the priority queue.
//
//   Guards:
//     1. mascotZone === 'gambling' (Scanner active OR reveal open OR debug
//        non-mascot tab) — skip enqueuing the timer at all
//     2. Inside deliverNext — re-check mascotZone (race protection: zone
//        may flip during the 1500ms wait if user opens reveal mid-timer)
//
//   flush: 'post' ensures the watcher runs AFTER Vue commits DOM updates,
//   so mascotZone (a computed) reflects the post-change value. Without this,
//   resetIdleTimer might see the OLD mascotZone (gambling for old Scanner tab)
//   and refuse to schedule even though player just switched to Collection.
let agendaIdleTimer = null
function resetAgendaIdleTimer() {
  if (agendaIdleTimer) {
    clearTimeout(agendaIdleTimer)
    agendaIdleTimer = null
  }
  // Guard #1: don't schedule if we're in gambling zone right now.
  if (mascotZone.value === 'gambling') return
  agendaIdleTimer = setTimeout(() => {
    // Guard #2: re-check at delivery time (zone may have changed).
    agenda.deliverNext(activeTab.value, mascotZone.value)
    agendaIdleTimer = null
  }, 1500)
}
watch([activeTab, reveal], resetAgendaIdleTimer, { flush: 'post' })
// Fire once on mount: covers the case "fresh launch, player lands on Scanner,
// switches to Collection" — the watch fires on the switch, but the FIRST
// session-tab-state (e.g. coming back from a 7-day gap and landing on
// non-Scanner from persisted state) needs an initial trigger too.
// resetAgendaIdleTimer() will no-op if mascotZone='gambling' (Scanner default).
resetAgendaIdleTimer()


function triggerDropToCart(slotInfo) {
  if (!slotInfo) return
  dropAnim.value = { slotInfo, target: 'cart' }
}
function triggerDropToCollection(slotInfo) {
  if (!slotInfo) return
  dropAnim.value = { slotInfo, target: 'collection' }
}
function onDropAnimComplete() {
  if (dropAnim.value?.target === 'cart') cartBadgePing.value++
  else if (dropAnim.value?.target === 'collection') collBadgePing.value++
  dropAnim.value = null
}

// ── Scan ─────────────────────────────────────────────────────────────────
function handleScan(qrCode) {
  const parsed = parseQrCode(qrCode)
  if (!parsed.ok) {
    fireTriggersWithMascot(evaluateTriggers('scan_error', { error: 'INVALID_QR' }), pushToast, null)
    return
  }
  setActiveSeries(parsed.series)

  const effectsSnapshot = { ...activeEffects.value }
  const scan = performScan({
    qrCode, playerId, serverSeed, nonce: nonce.value,
    partitionState: partitionState.value, effects: effectsSnapshot,
  })
  if (!scan.ok) {
    fireTriggersWithMascot(evaluateTriggers('scan_error', { error: scan.error, errorMessage: scan.errorMessage }), pushToast, null)
    return
  }

  // Phase β.1 (sub-phase e): mark first_scan_done explicitly.
  //   Audit finding: KNOWN_FLAGS declares 'first_scan_done' but no TRIGGER_CONFIG
  //   entry marks it. Without this line, pre_reveal_tutorial agenda would
  //   re-enqueue on every launch (initAgenda checks !hasSeenFlag('first_scan_done')).
  //   markFlagSeen is idempotent — writes localStorage only on the first call.
  markFlagSeen('first_scan_done')

  applyStateUpdates(scan.result.stateUpdates)
  consumeEffects()
  if (effectsSnapshot.forcePoolC && scan.result.wasPoolFallback) refundKeysOnPoolFallback()

  updateSeries(parsed.series, (cur) => ({
    ...cur,
    collection: {
      ...cur.collection,
      stickers: {
        ...cur.collection.stickers,
        [scan.sticker.stickerId]: (cur.collection.stickers[scan.sticker.stickerId] || 0) + 1,
      },
    },
  }))

  if (scan.result.wasLastOne) {
    updateSeries(parsed.series, (cur) => ({
      ...cur,
      charges: cur.charges + DEFAULT_CONFIG.lastOneBonus,
      totalEarned: cur.totalEarned + DEFAULT_CONFIG.lastOneBonus,
      history: [...cur.history, {
        type: HISTORY_EVENT_TYPES.LAST_ONE,
        ts: new Date().toISOString(),
        charges: DEFAULT_CONFIG.lastOneBonus,
      }],
    }))
  }

  nonce.value += 1
  scannedCount.value += 1

  // Phase β.1 (sub-phase b): session-streak tracking.
  //   Tracks scan timestamps in 30min rolling window. After 3+ — session_streak_3
  //   trigger fires (single-event scan_success carries sessionStreak in payload).
  const now = Date.now()
  sessionScanTimes.value = [
    ...sessionScanTimes.value.filter(ts => now - ts < SESSION_STREAK_WINDOW_MS),
    now,
  ]
  // (sessionStreak passed into the scan_success emit above via re-emit below.)
  // Mark as fired BEFORE the emit if streak>=3 — prevents repeat fires.
  const willFireStreak = sessionScanTimes.value.length >= 3 && !sessionStreakFiredThisSession
  if (willFireStreak) sessionStreakFiredThisSession = true

  // Phase β.1: power_triggered event — fired AFTER scan_success/error so the
  //   surprise reaction lands after the reveal-open trigger chain.
  //   We check effectsSnapshot (captured before consumeEffects()) — any
  //   active flag means a power was consumed by this scan.
  if (effectsSnapshot.luckActive || effectsSnapshot.doubleActive || effectsSnapshot.forcePoolC) {
    const cardType = effectsSnapshot.forcePoolC ? 'keys'
                   : effectsSnapshot.luckActive ? 'luck'
                   : 'double'
    const cardLabel = CARD_META[cardType]?.label || cardType
    const effectText = cardType === 'luck' ? '×2 шанс Rare применён'
                     : cardType === 'double' ? '×2 заряды применены'
                     : 'Pool C гарантирован'
    fireTriggersWithMascot(
      evaluateTriggers('power_triggered', { cardType, cardLabel, effectText }),
      pushToast, null,
    )
  }

  // Phase 3 — populate scan log for DebugPanel
  scannedQrs.add(qrCode)
  scanLog.value = [...scanLog.value, {
    qrCode,
    revealedSlotId: scan.result.revealedSlotId,
    tier: scan.result.tier,
    variant: scan.result.variant,
    pool: scan.result.pool,
    chargesAwarded: scan.result.chargesAwarded || 0,
    cardFound: scan.result.cardFound || 'none',
    effects: { ...effectsSnapshot },
    wasLastOne: scan.result.wasLastOne || false,
    wasPoolFallback: scan.result.wasPoolFallback || false,
    sparkFired: scan.sparkFired || false,
    slotHmacHex: scan.result.fairness?.slotHmacHex || '',
  }]

  fireTriggersWithMascot(
    evaluateTriggers('scan_success', {
      result: scan.result,
      stickerName: scan.sticker.name,
      // Phase β.1: session-streak passthrough — session_streak_3 trigger
      //   reads these from event data (test() needs both).
      sessionStreak: sessionScanTimes.value.length,
      sessionStreakFiredThisSession: !willFireStreak, // true after we just set it
    }),
    pushToast, null,
  )

  startReveal({
    result: scan.result, sparkFired: scan.sparkFired,
    seriesId: parsed.series, qrCode,
  })
}

// ── Take (from reveal) ───────────────────────────────────────────────────
function handleTake() {
  if (!reveal.value) return
  const r = reveal.value.result
  const sid = activeSeries.value
  const info = slotInfoById(r.revealedSlotId)

  // Phase β.1 (sub-phase e): post_first_take agenda enqueue.
  //   No vars needed — post_first_take phrase bank uses no interpolation.
  //   Mark flag immediately + enqueue. Both pre-mutation so the agenda is in
  //   queue before activeTab change below triggers the idle-timer watcher.
  //   Subsequent takes: hasSeenFlag returns true → no-op.
  if (!hasSeenFlag('first_take_done')) {
    markFlagSeen('first_take_done')
    agenda.enqueueAgenda({
      priority: 8,
      trigger_id: 'post_first_take',
      mascot_state: 'charge-up',
      phrase_key: 'post_first_take',
      vars: {},
      conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
      cooldown_h: 24,
    })
  }

  updateSeries(sid, (cur) => {
    const prizes = { ...cur.collection.prizes }
    const existing = prizes[r.revealedSlotId] || { count: 0, status: 'not_received' }
    prizes[r.revealedSlotId] = { count: existing.count + 1, status: 'received' }
    return {
      ...cur,
      collection: { ...cur.collection, prizes },
      history: [...cur.history, {
        type: HISTORY_EVENT_TYPES.TAKE, ts: new Date().toISOString(),
        slotId: r.revealedSlotId, charges: 0,
      }],
    }
  })
  fireTriggersWithMascot(evaluateTriggers('take', { giftName: info?.name, slotId: r.revealedSlotId }), pushToast, null)
  closeReveal()
  activeTab.value = 'gifts'
  if (info) triggerDropToCart(info)
}

// ── Exchange (from reveal) ───────────────────────────────────────────────
function handleExchange() {
  if (!reveal.value) return
  const r = reveal.value.result
  if (r.variant === 'Gold') return
  const sid = activeSeries.value
  const info = slotInfoById(r.revealedSlotId)
  const exchangePrice = getExchangePrice(r.tier, r.variant)
  if (exchangePrice == null) return

  if (r.cardFound && r.cardFound !== 'none') creditCard(r.cardFound, 1)

  const sparkFired = reveal.value.sparkFired === true

  // Phase β.1 (sub-phase e): post_first_exchange agenda enqueue.
  //   CRITICAL: vars are computed from the PRE-MUTATION snapshot of charges
  //   plus the deltas about to be added. If captured post-mutation (or via
  //   computed at delivery time), values could drift — player might do more
  //   actions before reaching idle on a non-gambling tab.
  //
  //   amount = exchangePrice + spark bonus if fired (player sees the total).
  //   balance = baseline + amount (the value AFTER this exchange completes).
  //   next_tier_gap = remaining to Epic (1800⚡) from new balance. Floor at 0
  //   for the rare edge case of first-scan Legendary exchange (4000⚡) where
  //   balance already exceeds Epic — phrase #1 still renders coherently
  //   ("До Epic — 0") and variants #2 #3 don't use this var.
  if (!hasSeenFlag('first_exchange_done')) {
    markFlagSeen('first_exchange_done')
    const totalAmount = exchangePrice + (sparkFired ? SPARK_CONFIG.bonusCharges : 0)
    const baselineCharges = currentSeries.value?.charges || 0
    const newBalance = baselineCharges + totalAmount
    const gapToEpic = Math.max(0, 1800 - newBalance)
    agenda.enqueueAgenda({
      priority: 8,
      trigger_id: 'post_first_exchange',
      mascot_state: 'farewell',
      phrase_key: 'post_first_exchange',
      vars: {
        amount: totalAmount,
        balance: newBalance,
        next_tier_gap: gapToEpic,
      },
      conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
      cooldown_h: 24,
    })
  }

  if (sparkFired) {
    updateSeries(sid, (cur) => ({
      ...cur,
      charges: cur.charges + SPARK_CONFIG.bonusCharges,
      totalEarned: cur.totalEarned + SPARK_CONFIG.bonusCharges,
      history: [...cur.history, {
        type: HISTORY_EVENT_TYPES.SPARK_BONUS, ts: new Date().toISOString(),
        charges: SPARK_CONFIG.bonusCharges,
      }],
    }))
  }

  updateSeries(sid, (cur) => {
    const prizes = { ...cur.collection.prizes }
    const existing = prizes[r.revealedSlotId] || { count: 0, status: 'not_received' }
    prizes[r.revealedSlotId] = { count: existing.count, status: existing.status }
    return {
      ...cur,
      charges: cur.charges + exchangePrice,
      totalEarned: cur.totalEarned + exchangePrice,
      collection: { ...cur.collection, prizes },
      history: [...cur.history, {
        type: HISTORY_EVENT_TYPES.EXCHANGE, ts: new Date().toISOString(),
        slotId: r.revealedSlotId, charges: exchangePrice,
      }],
    }
  })

  fireTriggersWithMascot(
    evaluateTriggers('exchange', {
      giftName: info?.name, exchangePrice, sparkFired,
      cardFound: r.cardFound,
      cardLabel: r.cardFound && r.cardFound !== 'none' ? CARD_META[r.cardFound]?.label : undefined,
    }),
    pushToast, null,
  )

  // Phase β.1 (sub-phase b): card_credited event — split from 'exchange'.
  //   Owner instruction: «card_credited (выделение из exchange)». Card-related
  //   triggers (card_credited routine + first_card_<type>) now live on this
  //   dedicated event; cardsNeed exposed so first_card_* phrases can show
  //   «collect N more».
  if (r.cardFound && r.cardFound !== 'none') {
    const cardLabel = CARD_META[r.cardFound]?.label
    fireTriggersWithMascot(
      evaluateTriggers('card_credited', {
        cardFound: r.cardFound,
        cardLabel,
        cardsNeed: CARD_ACTIVATION_THRESHOLD,
      }),
      pushToast, null,
    )
  }

  closeReveal()
  activeTab.value = 'collection'
}

// ── Purchase (from ModalGiftDetails in Collection) ───────────────────────
function handlePurchase(slot) {
  const buyPrice = getGiftBuyPrice(slot.tier, slot.variant)
  if (buyPrice == null) return
  const sid = activeSeries.value
  const cur = currentSeries.value
  if (!cur || cur.charges < buyPrice) return

  updateSeries(sid, (c) => {
    const prizes = { ...c.collection.prizes }
    const existing = prizes[slot.slotId] || { count: 0, status: 'not_received' }
    prizes[slot.slotId] = { count: existing.count + 1, status: 'received' }
    return {
      ...c,
      charges: c.charges - buyPrice,
      collection: { ...c.collection, prizes },
      history: [...c.history, {
        type: HISTORY_EVENT_TYPES.BUY, ts: new Date().toISOString(),
        slotId: slot.slotId, charges: buyPrice,
      }],
    }
  })

  fireTriggersWithMascot(
    evaluateTriggers('purchase', { giftName: slot.name, buyPrice, slotId: slot.slotId }),
    pushToast, null,
  )
  selectedGift.value = null
  triggerDropToCart(slot)
}

// ── Claim (from ModalGiftClaim in Gifts) — slot → claimed ───────────────
function handleMarkClaimed(gift) {
  const sid = activeSeries.value
  updateSeries(sid, (cur) => {
    const prizes = { ...cur.collection.prizes }
    const existing = prizes[gift.slotId] || { count: 0, status: 'not_received' }
    prizes[gift.slotId] = { ...existing, status: 'claimed' }
    return { ...cur, collection: { ...cur.collection, prizes } }
  })
  // Phase β.1 (sub-phase b): route through gift_action trigger (D3 claim_done).
  //   Was: direct pushToast. Now: full pipeline so mascot reacts ("Приз твой.").
  fireTriggersWithMascot(
    evaluateTriggers('gift_action', {
      action: 'claim_done',
      giftName: gift.name,
      slotId: gift.slotId,
    }),
    pushToast, null,
  )
  claimingGift.value = null
  triggerDropToCollection(gift)
}

// ── Return (from ModalGiftClaim) — refund as charges ────────────────────
function handleReturnGift(gift) {
  const sid = activeSeries.value
  const refund = getExchangePrice(gift.tier, gift.variant) || 0
  updateSeries(sid, (cur) => {
    const prizes = { ...cur.collection.prizes }
    const existing = prizes[gift.slotId]
    if (!existing || existing.count <= 0) return cur
    prizes[gift.slotId] = {
      count: Math.max(0, existing.count - 1),
      status: existing.count - 1 > 0 ? existing.status : 'not_received',
    }
    return {
      ...cur,
      charges: cur.charges + refund,
      totalEarned: cur.totalEarned + refund,
      collection: { ...cur.collection, prizes },
      history: [...cur.history, {
        type: HISTORY_EVENT_TYPES.EXCHANGE, ts: new Date().toISOString(),
        slotId: gift.slotId, charges: refund,
      }],
    }
  })
  // Phase β.1: route through gift_action trigger (D4 return_done).
  fireTriggersWithMascot(
    evaluateTriggers('gift_action', {
      action: 'return_done',
      giftName: gift.name,
      slotId: gift.slotId,
      refund,
    }),
    pushToast, null,
  )
  claimingGift.value = null
}

// ── UI handlers ──────────────────────────────────────────────────────────
function onTabChange(id) {
  activeTab.value = id
  // Switching app tabs while debug is open exits debug — TabBar acts as
  // global navigation, so user expects it to leave debug context.
  // The X button inside DebugPanel header also closes it.
  if (debugPanelOpen.value) debugPanelOpen.value = false
  // Phase β.1: emit screen_visit so *_first_visit triggers fire.
  //   trigger_id mapping: tab 'gifts' → cart_first_visit (legacy: TabBar uses
  //   'gifts' but user-facing concept = «Корзина»). See triggers.js comment.
  fireTriggersWithMascot(
    evaluateTriggers('screen_visit', { screen: id }),
    pushToast, null,
  )
}
function onToggleDebug() {
  if (!debugMode.value) debugMode.value = true
  debugPanelOpen.value = !debugPanelOpen.value
}
function onOpenStats() {
  statsOpen.value = true
  // Phase β.1: profile = stats overlay. Single virtual «screen» — see K1.
  fireTriggersWithMascot(
    evaluateTriggers('screen_visit', { screen: 'profile' }),
    pushToast, null,
  )
}
function onSelectGift(slot) {
  // From CollectionScreen — open details modal
  selectedGift.value = slot
}

// Phase β.1 (sub-phase b): power activate flow from PowersScreen via emit-up.
//   Pre-existing bug fix: PowersScreen used to call fireTriggers() raw and
//   pushToast() directly, bypassing fireTriggersWithMascot — mascot never
//   reacted. Now everything routes through the unified pipeline:
//     ok=true  → power_activate event (existing power_activated + first_activate_<type>)
//     reason   → power_activate_attempt event (power_insufficient / power_already_active)
function onPowerActivateResult(payload) {
  if (payload.ok) {
    fireTriggersWithMascot(
      evaluateTriggers('power_activate', {
        cardType: payload.cardType,
        cardLabel: payload.cardLabel,
      }),
      pushToast, null,
    )
  } else {
    fireTriggersWithMascot(
      evaluateTriggers('power_activate_attempt', {
        cardType: payload.cardType,
        cardLabel: payload.cardLabel,
        reason: payload.reason, // 'insufficient' | 'already_active'
        cardsHave: payload.cardsHave,
        cardsNeed: payload.cardsNeed,
      }),
      pushToast, null,
    )
  }
}
function onClaimGift(gift) {
  // From GiftsScreen — open claim modal
  claimingGift.value = gift
  // Phase β.1: D2 claim_open trigger (mascot говорит, тоста нет — entry build()
  //   возвращает null + __suppressToast).
  fireTriggersWithMascot(
    evaluateTriggers('gift_action', { action: 'claim_open', giftName: gift?.name }),
    pushToast, null,
  )
}

// ── Debug handlers (Phase 3) ────────────────────────────────────────────
function handleForceScan(qrCode) {
  debugPanelOpen.value = false
  handleScan(qrCode)
}
function handleResetPartition() {
  resetPartition()
  resetAllSeries()
  scanLog.value = []
  scannedQrs.clear()
  nonce.value = 0
  scannedCount.value = 0
  debugPanelOpen.value = false
}
</script>

<template>
  <div class="min-h-screen relative" style="background: #EEEEEE">
    <div class="grain"></div>

    <TopBar
      v-if="!isDebugFullScreen"
      :debug-mode="debugMode"
      @toggle-debug="onToggleDebug"
      @open-stats="onOpenStats"
    />

    <!-- Active effects sticky badge -->
    <div
      v-if="!isDebugFullScreen && (activeEffects.luckActive || activeEffects.doubleActive || activeEffects.forcePoolC) && activeTab !== 'scanner'"
      class="sticky z-20"
      :style="{
        top: `calc(env(safe-area-inset-top, 0px) + 60px)`,
        background: '#000000',
        color: '#FFFFFF',
        borderBottom: '1px solid #000000',
      }"
    >
      <div class="px-4 py-1.5 max-w-[440px] mx-auto flex items-center gap-2">
        <Sparkles :size="12" color="#FFFFFF" />
        <span class="font-mono text-[10px] uppercase tracking-[0.15em]">
          Сила готова к следующему скану
        </span>
      </div>
    </div>

    <main
      class="max-w-[440px] mx-auto relative z-10"
      :style="{
        paddingTop: isDebugFullScreen
          ? '0'
          : `calc(env(safe-area-inset-top, 0px) + 4rem)`,
      }"
    >
      <!-- Debug mode: full-screen page that replaces the active screen.
           TopBar stays visible; TabBar stays visible (clicking any tab
           closes debug, see onTabChange). Mascot floats over debug
           content at fixed z-50 when on the Mascot debug tab (see
           mascotZone). -->
      <DebugPanel
        v-if="isDebugFullScreen"
        :scan-log="scanLog"
        :scanned-qrs="scannedQrs"
        :server-seed="serverSeed"
        :client-seed="clientSeed"
        :nonce="nonce"
        @close="debugPanelOpen = false"
        @force-scan="handleForceScan"
        @reset-partition="handleResetPartition"
        @tab-change="debugActiveTab = $event"
      />
      <template v-else>
        <ScannerScreen    v-if="activeTab === 'scanner'"    :debug-mode="debugMode" @scan="handleScan" />
        <CollectionScreen v-else-if="activeTab === 'collection'" @select-gift="onSelectGift" />
        <GiftsScreen      v-else-if="activeTab === 'gifts'"      @claim-gift="onClaimGift" />
        <PowersScreen     v-else-if="activeTab === 'powers'" @power-activate-result="onPowerActivateResult" />
      </template>
    </main>

    <RevealOverlay @take="handleTake" @exchange="handleExchange" />
    <ModalGiftDetails
      :slot="selectedGift"
      :charges="currentSeries.charges"
      @close="selectedGift = null"
      @purchase="handlePurchase"
    />
    <ModalGiftClaim
      :gift="claimingGift"
      :player-id="playerId"
      @close="claimingGift = null"
      @mark-claimed="handleMarkClaimed"
      @return-gift="handleReturnGift"
    />
    <DropAnimation
      :active="!!dropAnim"
      :slot-info="dropAnim?.slotInfo"
      :target="dropAnim?.target"
      @complete="onDropAnimComplete"
    />
    <ToastStack />
    <TamaMascot :zone="mascotZone" />
    <TabBar
      v-if="!isDebugFullScreen"
      :active-tab="activeTab"
      :cart-ping="cartBadgePing"
      :coll-ping="collBadgePing"
      @change="onTabChange"
    />

    <!-- Phase 3: Stats overlay — full-screen ProfileScreen -->
    <div
      v-if="statsOpen"
      class="fixed inset-0 z-40 overflow-y-auto"
      style="background: #FFFFFF"
    >
      <div class="max-w-[440px] mx-auto">
        <!-- Stats header with back -->
        <div
          class="sticky top-0 z-10 flex items-center px-4 py-3"
          style="
            background: rgba(26,26,26,0.96);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid #C8C8C8;
            padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
          "
        >
          <button
            type="button"
            class="flex items-center gap-1"
            style="color: #FFFFFF"
            @click="statsOpen = false"
          >
            <ArrowLeft :size="18" />
            <span class="font-mono text-[11px] uppercase tracking-[0.15em]">Назад</span>
          </button>
        </div>

        <ProfileScreen
          :scanned-count="scannedCount"
          :client-seed="clientSeed"
          :server-seed="serverSeed"
          :nonce="nonce"
          @show-about="aboutOpen = true"
        />
      </div>
    </div>

    <!-- Phase 3B: AboutModal -->
    <AboutModal :open="aboutOpen" @close="aboutOpen = false" />
  </div>
</template>
