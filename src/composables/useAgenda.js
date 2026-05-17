// ═══════════════════════════════════════════════════════════════════════════
// useAgenda.js — Agenda Layer: delayed/proactive mascot messages.
//
// Phase β.1 (sub-phase d). Second behavior contour for Tama in addition to
// reactive triggers (TRIGGER_CONFIG via fireTriggersWithMascot).
//
// Concept:
//   Reactive triggers fire SYNCHRONOUSLY in response to user actions (scan,
//   take, exchange, tab visit). Agenda is the OPPOSITE: a priority queue of
//   "things mascot wants to say later, when player is idle on a non-gambling
//   screen". Examples:
//     - pre_reveal_tutorial: after onboarding, before first scan
//     - return_short/long/dormant: re-engagement after gap
//     - partition_almost_closed: pressure to act when partition >80% redeemed
//     - post_first_take/exchange: landing teaching after first reveal flow
//
// Pattern: module-singleton (same as useTama.js, useFirstTimeFlags.js).
//   pendingAgendas: ref([])   — sorted desc by priority
//   lastOpenTs:     ref(...)  — hydrated from localStorage on init
//
// Persistence:
//   mascot:agenda:delivered:<trigger_id>  = unix ms timestamp (cooldown)
//   mascot:last_open_ts:v1                = unix ms timestamp (for return_*)
//
// DO NOT confuse with mascot:flag:*:v1 — that is the SYNC one-shot channel
// used by reactive triggers via fireTriggersWithMascot. Agenda has its own
// channel for two reasons:
//   1. Cooldowns are TIMED (24h), not boolean-permanent like flags
//   2. Some agenda items (return_*) repeat over different lifecycle phases
//
// Idle-detection lives in App.vue (consumer of this composable):
//   watch([activeTab, reveal]) → resetIdleTimer → setTimeout(1500, deliverNext)
// useAgenda does NOT install global mousemove/scroll listeners (overkill for
// MVP per owner instruction).
// ═══════════════════════════════════════════════════════════════════════════

import { ref } from 'vue'
import { useTama } from './useTama.js'
import { useFirstTimeFlags } from './useFirstTimeFlags.js'

// ── Storage key constants ───────────────────────────────────────────────
const COOLDOWN_PREFIX = 'mascot:agenda:delivered:'
const LAST_OPEN_KEY   = 'mascot:last_open_ts:v1'

// ── Time helpers ─────────────────────────────────────────────────────────
const HOUR_MS  = 60 * 60 * 1000
const DAY_MS   = 24 * HOUR_MS

// ── Partition agenda threshold (Phase β.1 spec / SCENARIOS §7 H2) ────────
const PARTITION_ALMOST_CLOSED_THRESHOLD = 0.80

// ── Module-singleton reactive state ──────────────────────────────────────
//   pendingAgendas is sorted desc by priority. enqueue/dequeue maintain
//   sortedness so deliverNext can just inspect index 0 for highest priority.
const pendingAgendas = ref([])

// last_open_ts: persist across sessions. Updated ONCE on init, AFTER reading
// the previous value (which is used to compute gap for return_* enqueue).
let prevLastOpenTs = null
let initialized    = false

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function cooldownStorageKey(triggerId) {
  return COOLDOWN_PREFIX + triggerId
}

function readDeliveredAt(triggerId) {
  try {
    const raw = window.localStorage.getItem(cooldownStorageKey(triggerId))
    if (!raw) return null
    const ts = Number(raw)
    return Number.isFinite(ts) ? ts : null
  } catch { return null }
}

function writeDeliveredAt(triggerId, ts) {
  try {
    window.localStorage.setItem(cooldownStorageKey(triggerId), String(ts))
  } catch { /* storage denied — in-memory only */ }
}

function readLastOpenTs() {
  try {
    const raw = window.localStorage.getItem(LAST_OPEN_KEY)
    if (!raw) return null
    const ts = Number(raw)
    return Number.isFinite(ts) ? ts : null
  } catch { return null }
}

function writeLastOpenTs(ts) {
  try { window.localStorage.setItem(LAST_OPEN_KEY, String(ts)) }
  catch { /* no-op */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// COOLDOWN LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns true if the trigger is still within its cooldown window.
 * Trigger items WITHOUT a cooldown_h (or with 0/null/undefined) are treated
 * as one-shot lifetime — any previous delivery blocks re-enqueue.
 */
function isInCooldown(triggerId, cooldown_h) {
  const deliveredAt = readDeliveredAt(triggerId)
  if (deliveredAt == null) return false
  if (!cooldown_h || cooldown_h <= 0) {
    // Permanent one-shot — any prior delivery blocks forever (until reset).
    return true
  }
  return (Date.now() - deliveredAt) < cooldown_h * HOUR_MS
}

/**
 * ms remaining until cooldown expires. Returns 0 if not in cooldown or
 * never delivered. Used by DebugPanel (sub-phase f) for countdown display.
 */
function getCooldownRemaining(triggerId, cooldown_h) {
  const deliveredAt = readDeliveredAt(triggerId)
  if (deliveredAt == null) return 0
  if (!cooldown_h || cooldown_h <= 0) {
    // Permanent one-shot — "infinite" remaining (represented as Infinity
    // so DebugPanel can show "∞" / "never" label).
    return Infinity
  }
  const remaining = cooldown_h * HOUR_MS - (Date.now() - deliveredAt)
  return Math.max(0, remaining)
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checks an agenda item's `conditions` against current app state.
 * Conditions shape:
 *   {
 *     not_in_zone: 'gambling',   // skip if mascotZone matches
 *     idle_ms: 1500,             // informational — actual idle wait is in App.vue
 *   }
 *
 * idle_ms is metadata for the App.vue idle-timer — useAgenda doesn't enforce
 * it directly because the timer fires deliverNext AFTER the idle-ms wait.
 * If item.conditions.idle_ms differs from the App.vue constant (1500), this
 * is currently informational only. Future expansion: per-item idle override.
 */
function isConditionMet(conditions, activeTab, mascotZone) {
  if (!conditions) return true
  if (conditions.not_in_zone && mascotZone === conditions.not_in_zone) {
    return false
  }
  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTITION REDEMPTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Redemption fraction of the partition: opened slots / total slots.
 * Mirrors triggers.js::redemptionFraction (kept local here to avoid
 * cross-module coupling — agenda owns its own threshold check).
 */
function redemptionFraction(partitionState) {
  if (!partitionState?.slots?.length) return 0
  const total  = partitionState.slots.length
  const opened = partitionState.slots.filter(s => s.status === 'opened').length
  return opened / total
}

function slotsLeftToClose(partitionState) {
  if (!partitionState?.slots?.length) return 0
  return partitionState.slots.filter(s => s.status !== 'opened').length
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert item maintaining desc-by-priority order. O(n) but n is bounded
 * (rarely more than 5 simultaneous pending agendas — see initAgenda cascade).
 */
function insertSorted(item) {
  const arr = pendingAgendas.value
  let i = 0
  while (i < arr.length && arr[i].priority >= item.priority) i++
  pendingAgendas.value = [...arr.slice(0, i), item, ...arr.slice(i)]
}

/**
 * Public: enqueue an agenda item with full de-dup logic.
 *   - Skipped if already in cooldown (timestamp + cooldown_h)
 *   - Skipped if already in pendingAgendas (same trigger_id)
 * Returns true if enqueued, false if skipped.
 */
function enqueueAgenda(item) {
  if (!item?.trigger_id) {
    console.warn('[agenda] enqueueAgenda: missing trigger_id', item)
    return false
  }
  // De-dup vs queue
  if (pendingAgendas.value.some(a => a.trigger_id === item.trigger_id)) {
    return false
  }
  // De-dup vs cooldown
  if (isInCooldown(item.trigger_id, item.cooldown_h)) {
    return false
  }
  insertSorted(item)
  return true
}

/**
 * Public: deliver the highest-priority eligible agenda item.
 *   - Skips items whose conditions don't match (e.g. mascotZone=gambling)
 *   - Fires tama.trigger(state, {phraseKey, vars}) for selected item
 *   - Marks delivered (writes cooldown timestamp)
 *   - Removes from queue
 *
 * NB: mascotZone check is duplicated here AND in App.vue's idle-timer
 * (which clears on resetIdleTimer if mascotZone==='gambling'). Double-guard
 * is intentional — protects against race conditions where mascotZone flips
 * to gambling during the 1500ms timeout window (e.g. user opens reveal).
 *
 * Returns the delivered item or null.
 */
function deliverNext(activeTab, mascotZone) {
  if (mascotZone === 'gambling') return null

  for (let i = 0; i < pendingAgendas.value.length; i++) {
    const item = pendingAgendas.value[i]
    if (!isConditionMet(item.conditions, activeTab, mascotZone)) continue

    // Remove from queue
    pendingAgendas.value = [
      ...pendingAgendas.value.slice(0, i),
      ...pendingAgendas.value.slice(i + 1),
    ]
    // Mark delivered
    markDelivered(item.trigger_id)
    // Fire mascot via existing trigger pipeline. Phrase resolution:
    //   phrase_key → TAMA_PHRASES[phrase_key] (with vars interpolation)
    //   falls back to state-default if bank missing (won't happen for our
    //   7 banks added in sub-phase d).
    const tama = useTama()
    tama.trigger(item.mascot_state, {
      phraseKey: item.phrase_key,
      vars: item.vars || {},
    })
    return item
  }
  return null
}

function markDelivered(triggerId) {
  writeDeliveredAt(triggerId, Date.now())
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT-DRIVEN AGENDA EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called from App.vue's watch(partitionState). Enqueues
 * partition_almost_closed if redemption ≥ 80% and not in cooldown.
 *
 * Cooldown 24h means it can re-fire next day if player still hasn't acted —
 * acceptable behavior since the message is timely pressure, not one-shot.
 */
function evaluatePartitionAgenda(partitionState) {
  const frac = redemptionFraction(partitionState)
  if (frac < PARTITION_ALMOST_CLOSED_THRESHOLD) return
  enqueueAgenda({
    priority: 7,
    trigger_id: 'partition_almost_closed',
    mascot_state: 'pondering',
    phrase_key: 'partition_almost_closed',
    vars: { slots_left: slotsLeftToClose(partitionState) },
    conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
    cooldown_h: 24,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT — lazy, runs once on first useAgenda() call
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initial enqueue cascade:
 *   1. READ prev last_open_ts (the previous session's timestamp).
 *   2. COMPUTE gap from prev to now.
 *   3. WRITE new last_open_ts = now (for next session's calculation).
 *      Order matters: must read before write or gap=0 forever.
 *   4. Enqueue return_* (mutex by tier — only one fires per launch).
 *   5. Enqueue pre_reveal_tutorial if first_scan_done flag absent.
 *
 * NB: return_* and pre_reveal_tutorial are mutually NON-exclusive. A player
 * who has never scanned and returns after 30 days sees BOTH agendas (the
 * priority-9 pre_reveal_tutorial fires first by ordering, return_dormant
 * gets its turn on the next tab switch). Acceptable per SCENARIOS §7.
 */
function initAgenda() {
  if (initialized) return
  initialized = true

  // Step 1: READ prev value
  prevLastOpenTs = readLastOpenTs()
  // Step 2: COMPUTE gap
  const now = Date.now()
  const gap = prevLastOpenTs != null ? (now - prevLastOpenTs) : 0
  // Step 3: WRITE new value (for next session)
  writeLastOpenTs(now)

  // Step 4: Return cascade (only one fires per launch, mutex by gap tier)
  if (prevLastOpenTs != null) {
    if (gap > 30 * DAY_MS) {
      enqueueAgenda({
        priority: 6,
        trigger_id: 'return_dormant',
        mascot_state: 'pondering',
        phrase_key: 'return_dormant',
        conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
        cooldown_h: 24,
      })
    } else if (gap > 7 * DAY_MS) {
      enqueueAgenda({
        priority: 6,
        trigger_id: 'return_long',
        mascot_state: 'wave',
        phrase_key: 'return_long',
        conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
        cooldown_h: 24,
      })
    } else if (gap > DAY_MS) {
      enqueueAgenda({
        priority: 5,
        trigger_id: 'return_short',
        mascot_state: 'wave',
        phrase_key: 'return_short',
        conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
        cooldown_h: 24,
      })
    }
  }

  // Step 5: pre_reveal_tutorial — only for players who haven't scanned yet.
  // first_scan_done flag is marked by TRIGGER_CONFIG entry 'scan_done' on
  // the first successful scan (centralized through fireTriggersWithMascot).
  const flags = useFirstTimeFlags()
  if (!flags.hasSeenFlag('first_scan_done')) {
    enqueueAgenda({
      priority: 9,
      trigger_id: 'pre_reveal_tutorial',
      mascot_state: 'wave',
      phrase_key: 'pre_reveal_tutorial',
      conditions: { not_in_zone: 'gambling', idle_ms: 1500 },
      cooldown_h: 24,
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG / RESET HELPERS (for sub-phase f DebugPanel)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns a snapshot of all delivered agenda items in localStorage.
 * Used by DebugPanel info-pane (sub-phase f) to display delivery history
 * + countdown until cooldown expires.
 *
 * Return shape: [{ trigger_id, deliveredAt }, ...]
 */
function getDeliveredFlags() {
  const out = []
  if (typeof window === 'undefined' || !window.localStorage) return out
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(COOLDOWN_PREFIX)) continue
      const trigger_id = key.slice(COOLDOWN_PREFIX.length)
      const ts = Number(window.localStorage.getItem(key))
      if (Number.isFinite(ts)) {
        out.push({ trigger_id, deliveredAt: ts })
      }
    }
  } catch { /* no-op */ }
  // Sort newest-first for stable display
  out.sort((a, b) => b.deliveredAt - a.deliveredAt)
  return out
}

/**
 * Wipe all cooldown timestamps. Affects all agenda triggers.
 * Used by DebugPanel "Reset agenda cooldowns" button.
 */
function resetCooldowns() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const toRemove = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(COOLDOWN_PREFIX)) toRemove.push(key)
    }
    for (const k of toRemove) window.localStorage.removeItem(k)
  } catch { /* no-op */ }
}

/**
 * Reset cooldown for a single trigger. Used by DebugPanel per-row reset.
 */
function resetSingleCooldown(triggerId) {
  try { window.localStorage.removeItem(cooldownStorageKey(triggerId)) }
  catch { /* no-op */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWN_AGENDA_IDS — registry for DebugPanel (sub-phase f)
// ═══════════════════════════════════════════════════════════════════════════
//   Mirrors KNOWN_FLAGS pattern from useFirstTimeFlags. Listed here so
//   DebugPanel can enumerate all agenda triggers even before any has fired
//   (to render rows + show "never delivered" status).
export const KNOWN_AGENDA_IDS = Object.freeze([
  'pre_reveal_tutorial',
  'post_first_take',
  'post_first_exchange',
  'partition_almost_closed',
  'return_short',
  'return_long',
  'return_dormant',
])

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSABLE EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export function useAgenda() {
  initAgenda()
  return {
    // Reactive reads
    pendingAgendas,

    // Public API
    enqueueAgenda,
    deliverNext,
    markDelivered,
    evaluatePartitionAgenda,

    // Cooldown inspection
    getCooldownRemaining,

    // Debug / reset
    getDeliveredFlags,
    resetCooldowns,
    resetSingleCooldown,
  }
}
