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

import { parseQrCode, DEFAULT_CONFIG, SPARK_CONFIG } from './engine/draw-engine.js'
import { generatePlayerId, randomHex, slotInfoById } from './engine/state-helpers.js'
import {
  CARD_META, HISTORY_EVENT_TYPES,
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

// ── Phase 4: Mascot zone logic ──────────────────────────────────────────
// Scanner, active reveal, debug panel = gambling zone → mascot hidden.
// Everything else = loyalty zone → mascot visible.
const mascotZone = computed(() =>
  activeTab.value === 'scanner' || reveal.value || debugPanelOpen.value
    ? 'gambling' : 'loyalty'
)

// ── Phase 4: Trigger wrapper — routes mascotState/mascotPhrase to Tama ──
// Reads mascotState/mascotPhrase from evaluateTriggers() results and
// dispatches to tama.trigger(). engine/triggers.js stays untouched.
function fireTriggersWithMascot(triggers, pushToastFn, pushActivityFn) {
  fireTriggers(triggers, pushToastFn, pushActivityFn)
  for (const t of triggers) {
    if (t.mascotState) {
      tama.trigger(t.mascotState, {
        message: t.mascotPhrase || undefined,
      })
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
  prevPartitionSnapshot = { ...next }
}, { deep: true })

watch(scannedCount, (next, prev) => {
  fireTriggersWithMascot(evaluateTriggers('scan_count_change', {}, { scannedCount: prev }, { scannedCount: next }), pushToast, null)
})

// ── Drop helpers ─────────────────────────────────────────────────────────
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
    evaluateTriggers('scan_success', { result: scan.result, stickerName: scan.sticker.name }),
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
  pushToast({
    kind: 'success',
    title: 'Подарок получен',
    detail: gift.name,
    icon: 'Check',
  })
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
  pushToast({
    kind: 'success',
    title: 'Подарок возвращён',
    detail: gift.name,
    charges: refund,
    icon: 'RefreshCw',
  })
  claimingGift.value = null
}

// ── UI handlers ──────────────────────────────────────────────────────────
function onTabChange(id) { activeTab.value = id }
function onToggleDebug() {
  if (!debugMode.value) debugMode.value = true
  debugPanelOpen.value = !debugPanelOpen.value
}
function onOpenStats() { statsOpen.value = true }
function onSelectGift(slot) {
  // From CollectionScreen — open details modal
  selectedGift.value = slot
}
function onClaimGift(gift) {
  // From GiftsScreen — open claim modal
  claimingGift.value = gift
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

    <TopBar :debug-mode="debugMode" @toggle-debug="onToggleDebug" @open-stats="onOpenStats" />

    <!-- Active effects sticky badge -->
    <div
      v-if="(activeEffects.luckActive || activeEffects.doubleActive || activeEffects.forcePoolC) && activeTab !== 'scanner'"
      class="sticky top-[60px] z-20"
      style="background: #000000; color: #FFFFFF; border-bottom: 1px solid #000000"
    >
      <div class="px-4 py-1.5 max-w-[440px] mx-auto flex items-center gap-2">
        <Sparkles :size="12" color="#FFFFFF" />
        <span class="font-mono text-[10px] uppercase tracking-[0.15em]">
          Сила готова к следующему скану
        </span>
      </div>
    </div>

    <main class="max-w-[440px] mx-auto relative z-10 pt-16">
      <ScannerScreen    v-if="activeTab === 'scanner'"    :debug-mode="debugMode" @scan="handleScan" />
      <CollectionScreen v-else-if="activeTab === 'collection'" @select-gift="onSelectGift" />
      <GiftsScreen      v-else-if="activeTab === 'gifts'"      @claim-gift="onClaimGift" />
      <PowersScreen     v-else-if="activeTab === 'powers'" />
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
    <TabBar :active-tab="activeTab" :cart-ping="cartBadgePing" :coll-ping="collBadgePing" @change="onTabChange" />

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
          style="background: rgba(26,26,26,0.96); backdrop-filter: blur(8px); border-bottom: 1px solid #C8C8C8"
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

    <!-- Phase 3: DebugPanel -->
    <DebugPanel
      :open="debugPanelOpen && debugMode"
      :scan-log="scanLog"
      :scanned-qrs="scannedQrs"
      :server-seed="serverSeed"
      :client-seed="clientSeed"
      :nonce="nonce"
      @close="debugPanelOpen = false"
      @force-scan="handleForceScan"
      @reset-partition="handleResetPartition"
    />

    <!-- Phase 3B: AboutModal -->
    <AboutModal :open="aboutOpen" @close="aboutOpen = false" />
  </div>
</template>
