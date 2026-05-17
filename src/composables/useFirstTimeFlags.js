// ═══════════════════════════════════════════════════════════════════════════
// useFirstTimeFlags.js — First-time / one-shot flag persistence layer.
//
// Phase β.1 infrastructure for one-shot mascot triggers.
// Pattern: module-singleton (same as useTama.js, useToast.js).
//
// Storage:
//   • localStorage keys: 'mascot:flag:<name>:v1' = '1'
//   • In-memory reactive cache (Vue reactive({})) — lazy-loaded once per
//     module load, then writes go through to both cache and localStorage.
//   • Reactive so DebugPanel info-pane (sub-phase f) updates live when a
//     flag is marked from somewhere else.
//
// API:
//   const flags = useFirstTimeFlags()
//   flags.hasSeenFlag('first_legendary')       — boolean
//   flags.markFlagSeen('first_legendary')      — idempotent, persists
//   flags.resetFlag('first_legendary')         — single flag reset
//   flags.resetAllFlags()                      — wipe all mascot:flag:*:v1
//   flags.getAllFlags()                        — [{ name, seen }, ...] for debug
//   useFirstTimeFlags.KNOWN_FLAGS              — registry of declared flag names
//
// Unknown flags (not in KNOWN_FLAGS) still work — they warn in dev mode
// for typo catching, but never throw. This keeps forward-compatibility: a
// developer can add a new flag in code BEFORE registering it here, and
// later sub-phases (b,c,d) add their own flags incrementally without
// breaking existing code paths.
//
// NOTE: markFlag mechanism for synchronous one-shot triggers is wired via
// fireTriggersWithMascot in App.vue (sub-phase b). Agenda-style one-shots
// (pre_reveal_tutorial, post_first_take, return_*) use a DIFFERENT
// persistence channel — `mascot:agenda:delivered:*` cooldown timestamps
// in useAgenda.js (sub-phase d). DO NOT MIX these two mechanisms.
// ═══════════════════════════════════════════════════════════════════════════

import { reactive } from 'vue'

// ── Storage key format ───────────────────────────────────────────────────
// 'mascot:flag:<name>:v1' — versioned for future migrations. If we ever
// need to invalidate all flags on a schema change, bump to ':v2' and the
// old keys are simply ignored (loadCache walks only the current version).
const FLAG_PREFIX  = 'mascot:flag:'
const FLAG_SUFFIX  = ':v1'

// ── KNOWN_FLAGS registry ─────────────────────────────────────────────────
// All flag names that the codebase will use, grouped by SCENARIOS §4 category.
// Add new entries here as new triggers/agendas are introduced in sub-phases
// (b)(c)(d). Unknown names still work (with dev-mode warn) — this registry is
// for auto-completion, typo-detection, and DebugPanel listing in sub-phase f.
export const KNOWN_FLAGS = Object.freeze([
  // A. Scanner / Reveal flow — sync, marked via fireTriggersWithMascot
  'first_scan_done',
  'first_take_done',
  'first_exchange_done',
  'first_legendary',
  'first_card_luck',
  'first_card_double',
  'first_card_key',
  // A12 — teaching variant, single shot
  'spark_credited',

  // C. Collection — sync via TRIGGER_CONFIG
  'first_received',
  'duplicate_received',
  'tier_row_complete:common',
  'tier_row_complete:rare',
  'tier_row_complete:epic',
  'tier_row_complete:legendary',
  'tier_row_complete:ultrarare',
  'tier_row_complete:mythic',

  // D-K. Tab-first-visit — sync, fired from App.vue onTabChange
  // NB: 'cart_first_visit' is the user-facing concept (Корзина);
  // wiring in App.vue watches activeTab === 'gifts' (tab-id mismatch
  // intentional, see triggers.js comment near this entry in sub-phase b)
  'cart_first_visit',
  'collection_first_visit',
  'powers_first_visit',
  'profile_first_visit',

  // E. Powers — first activation per power type
  'first_activate_luck',
  'first_activate_double',
  'first_activate_key',

  // F. Charges — near-tier thresholds, per exchange-price tier from NUMBERS.md §3
  //   Common=200, Rare=600, Epic=1800, Legendary=5000, UltraRare=20000
  //   (Common is the floor, no near-tier announcement before it.)
  'near_tier:rare',
  'near_tier:epic',
  'near_tier:legendary',
  'near_tier:ultrarare',
  // F4 — stub-only until charge-expiry tracking lands (backlog).
  //   test() returns false in runtime; entry exists for DebugPanel "Симулировать".
  'expiry_warning',

  // ── Migration of existing one-shots (was: fragile crossedNumber pattern).
  //   Заряды НЕ монотонны (purchase уменьшает), потому без флага игрок
  //   мог получить тост «1000 зарядов!» многократно после трат и повторного
  //   накопления. markFlag-driven теперь.
  'charges_1k_done',
  'charges_5k_done',
  'charges_10k_done',
  // Spark teacher one-shot — existing entry gets markFlag in sub-phase (b).
  'first_spark_seen',
])

// ── KNOWN_FLAG_PREFIXES — для динамических флагов где имя содержит runtime
// данные (series_id, etc). Любой флаг с указанным префиксом считается known
// без warn. Это нужно для случаев типа new_series:ST, new_series:MS — series_id
// не предвидится в design-time, но семантика consistent.
export const KNOWN_FLAG_PREFIXES = Object.freeze([
  'new_series:',
])

// ── In-memory reactive state ─────────────────────────────────────────────
// Plain reactive object — Vue reactivity tracks property add/remove/change.
// Map alternative would work but plain object is simpler for DebugPanel
// rendering (Object.keys() vs Array.from(map.entries())).
const flagState = reactive({})
let cacheLoaded = false

// ── Lazy localStorage hydration ──────────────────────────────────────────
// Called on every public-API entry (cheap: no-op after first call).
// Walks localStorage once, picks all keys matching our prefix+suffix.
function loadCache() {
  if (cacheLoaded) return
  cacheLoaded = true
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key) continue
      if (!key.startsWith(FLAG_PREFIX) || !key.endsWith(FLAG_SUFFIX)) continue
      const name = key.slice(FLAG_PREFIX.length, key.length - FLAG_SUFFIX.length)
      if (window.localStorage.getItem(key) === '1') {
        flagState[name] = true
      }
    }
  } catch {
    // localStorage denied (private mode, quota, SSR) — silent degrade.
  }
}

function storageKey(name) {
  return FLAG_PREFIX + name + FLAG_SUFFIX
}

function warnIfUnknown(name) {
  // Dev-mode-only typo guard. Production stays silent to avoid console spam.
  // import.meta.env may be undefined outside Vite — guard accordingly.
  try {
    if (!import.meta?.env?.DEV) return
    if (KNOWN_FLAGS.includes(name)) return
    // Prefix-match: allow dynamic flags like 'new_series:ST' without warn.
    for (const prefix of KNOWN_FLAG_PREFIXES) {
      if (name.startsWith(prefix)) return
    }
    console.warn(`[flags] Unknown flag "${name}". Add to KNOWN_FLAGS (or KNOWN_FLAG_PREFIXES) or fix typo.`)
  } catch { /* import.meta unavailable — no-op */ }
}

// ── Public API ───────────────────────────────────────────────────────────

function hasSeenFlag(name) {
  loadCache()
  warnIfUnknown(name)
  return flagState[name] === true
}

function markFlagSeen(name) {
  loadCache()
  warnIfUnknown(name)
  // Idempotent: re-marking a seen flag is a no-op, doesn't re-hit localStorage.
  if (flagState[name] === true) return
  flagState[name] = true
  try {
    window.localStorage.setItem(storageKey(name), '1')
  } catch { /* storage denied — in-memory only this session */ }
}

function resetFlag(name) {
  loadCache()
  if (!(name in flagState)) {
    // Also try to remove from storage in case cache and storage drifted
    // (e.g. user edited localStorage by hand in DevTools).
    try { window.localStorage.removeItem(storageKey(name)) } catch { /* no-op */ }
    return
  }
  delete flagState[name]
  try { window.localStorage.removeItem(storageKey(name)) } catch { /* no-op */ }
}

function resetAllFlags() {
  loadCache()
  for (const k of Object.keys(flagState)) {
    delete flagState[k]
  }
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    // Two-pass: collect matching keys first (mutating during iteration
    // shifts indices and skips entries).
    const toRemove = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(FLAG_PREFIX) && key.endsWith(FLAG_SUFFIX)) {
        toRemove.push(key)
      }
    }
    for (const k of toRemove) window.localStorage.removeItem(k)
  } catch { /* no-op */ }
}

function getAllFlags() {
  loadCache()
  // Returns ALL known flags (seen=false for unset ones) + any unknown seen
  // flags that exist in storage but aren't in KNOWN_FLAGS. This gives the
  // DebugPanel a stable, full list for rendering toggles.
  const seenSet = new Set(Object.keys(flagState))
  const known = KNOWN_FLAGS.map(name => ({ name, seen: flagState[name] === true }))
  const extras = []
  for (const name of seenSet) {
    if (!KNOWN_FLAGS.includes(name)) {
      extras.push({ name, seen: true, unknown: true })
    }
  }
  return [...known, ...extras]
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSABLE EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export function useFirstTimeFlags() {
  loadCache()
  return {
    hasSeenFlag,
    markFlagSeen,
    resetFlag,
    resetAllFlags,
    getAllFlags,
    KNOWN_FLAGS,
  }
}
