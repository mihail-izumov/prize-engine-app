// ═══════════════════════════════════════════════════════════════════════════
// useTama.js — Mascot Tama state machine (Vue composable, module singleton).
//
// Ported from mascot-phase1.jsx (React MascotProvider + useReducer).
// Architecture: module-level refs → singleton (same pattern as useToast.js).
// No Pinia/Vuex per HANDOFF-Phase-4 constraints.
//
// Public API:
//   const tama = useTama()
//   tama.trigger('charge-up', { vars: { amount: 300, balance: 1240 } })
//   tama.goToSleep()
//   tama.wakeUp()
//   tama.dismissBubble()
//   tama.reset()
//
// Reactive reads:
//   tama.currentState    — ref<string>
//   tama.bubble          — ref<{ message, subtitle, key } | null>
//   tama.bubbleVisible   — ref<boolean>
//   tama.isHidden        — ref<boolean>
//   tama.onboardingLookUp — ref<boolean>
// ═══════════════════════════════════════════════════════════════════════════

import { ref, watch } from 'vue'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — 1:1 from mascot-phase1.jsx
// ═══════════════════════════════════════════════════════════════════════════

export const STATES = {
  idle:        { kind: 'permanent', label: 'Спокоен' },
  wave:        { kind: 'temp', defaultDuration: 2500, label: 'Машет' },
  sleepy:      { kind: 'permanent', label: 'Дремлет' },
  'charge-up': { kind: 'temp', defaultDuration: 4000, label: 'Заряды!' },
  wow:         { kind: 'temp', defaultDuration: 5000, label: 'Невероятно!' },
  proud:       { kind: 'temp', defaultDuration: 3500, label: 'Горд' },
  pondering:   { kind: 'permanent', label: 'Размышляет' },
  farewell:    { kind: 'temp', defaultDuration: 3500, label: 'Прощается' },
  delight:     { kind: 'temp', defaultDuration: 3500, label: 'Восторг' },
  surprised:   { kind: 'temp', defaultDuration: 2500, label: 'Ой!' },
  'smug-wink': { kind: 'temp', defaultDuration: 3000, label: 'Подмигивает' },
  'big-eyes':  { kind: 'temp', defaultDuration: 2800, label: 'Любопытство' },
}

const IDLE_TIMEOUT_MS       = 30_000
const BUBBLE_DELAY_MS       = 200
const PERSIST_KEY           = 'mascot:isHidden:v1'
const FIRST_TIME_KEY        = 'mascot:isFirstTimeUser:v1'
const ONBOARDING_INTERVAL_MS = 4500

// ═══════════════════════════════════════════════════════════════════════════
// TAMA PHRASES — patchable content. Edit only these, rest stays untouched.
// Template vars: {amount}, {balance}, {next_tier_gap}
// ═══════════════════════════════════════════════════════════════════════════

const TAMA_PHRASES = {
  idle: [
    'Тут тихо.',
    'Жду.',
    'Смотрю в окно.',
    'На счету {balance}. Всё по плану.',
    'Ну что, снова здесь.',
  ],
  wave: [
    'А, ты вернулся.',
    'Привет. Готов?',
    'Заряды на месте. Мне — тоже.',
    'Так-так. Что у нас сегодня?',
    'Появился. Хорошо.',
  ],
  sleepy: [
    // Спим тихо — фразы не подаём
  ],
  waking: [
    'А? Я проснулся.',
    'Хм. Что у нас?',
    'О, ты здесь.',
    'Снова вместе.',
    'Уже вернулся? Ладно.',
    'Ух. Снилась лапша.',
  ],
  charge_up: [
    '+{amount}. Уже близко к Epic.',
    'Ещё {next_tier_gap} — и Epic твой.',
    'Растём. {balance} на счету.',
    'Хорошо. До следующей цели — пара коробок.',
    '+{amount}. Вижу тебя в каталоге через час.',
  ],
  wow: [
    'Ого. Это уже другой уровень.',
    'Вот это заход.',
    'Такое редко видно.',
    'Серьёзно. Смотри не потеряй.',
    'Это — история.',
  ],
  proud: [
    'Смотри. Он теперь твой.',
    'Ты этого добился. Приз в зоне.',
    'Доступен. Решай.',
    'Одна цель взята. Забираем?',
    'Я так и знал.',
  ],
  pondering: [
    'Думаешь? Я тоже.',
    'Можно забрать сейчас. Можно подождать большего.',
    'Торопиться некуда.',
    'Выбор — часть удовольствия.',
    'Подумай. Я никуда.',
  ],
  farewell: [
    'Удачи. Он в пути.',
    'Ну, до следующего.',
    'Пусть радует.',
    'Отпускаю. Копим дальше.',
    'Ушёл к тебе. Мне немного грустно, но так надо.',
  ],
  delight: [
    'Это лучше, чем лапша.',
    'Я таких чувств не знал.',
    'Серьёзно? Ого.',
    'Вот это у тебя получилось.',
    'Чего стоит ждать — так этого.',
  ],
  surprised: [
    'Ой. Не ждал.',
    'Так. Что это было.',
    'Стоп. Это сейчас — что?',
    'Не. Ну ты даёшь.',
  ],
  smug_wink: [
    'Я же говорил.',
    'Между нами говоря.',
    'Так и планировалось.',
    'Момент.',
    'Именно это и нужно было.',
  ],
  big_eyes: [
    'Ух ты.',
    'Столько всего.',
    'Любопытно.',
    'Продолжай, не отвлекайся.',
    'О. Такого я ещё не видел.',
  ],
}

const TAMA_ONBOARDING = [
  'Привет. Я Тама.',
  'Вижу, у тебя есть коробка.',
  'Открой — посмотрим, что внутри.',
  'Сканер вон там ↑',
  'А я подожду здесь, пока ты вернёшься.',
]

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function randomPhrase(state, vars = {}) {
  const key = state.replace(/-/g, '_')
  const list = TAMA_PHRASES[key] || []
  if (list.length === 0) return undefined
  const template = list[Math.floor(Math.random() * list.length)]
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  )
}

// ── localStorage persistence (try/catch for restricted runtimes) ─────────

function loadHidden() {
  try { return window.localStorage.getItem(PERSIST_KEY) === '1' }
  catch { return false }
}

function saveHidden(v) {
  try { window.localStorage.setItem(PERSIST_KEY, v ? '1' : '0') }
  catch { /* no-op */ }
}

function loadFirstTime() {
  try {
    const raw = window.localStorage.getItem(FIRST_TIME_KEY)
    return raw === null ? true : raw === '1'
  }
  catch { return true }
}

function saveFirstTime(isFirst) {
  try { window.localStorage.setItem(FIRST_TIME_KEY, isFirst ? '1' : '0') }
  catch { /* no-op */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL SINGLETON STATE
// ═══════════════════════════════════════════════════════════════════════════

const currentState     = ref('idle')
const bubble           = ref(null)    // { message, subtitle, key } | null
const bubbleVisible    = ref(false)
const isHidden         = ref(false)
const onboardingLookUp = ref(false)

// ── Timers (module-level, not per-component) ─────────────────────────────
let idleTimer        = null
let bubbleShowTimer  = null
let bubbleHideTimer  = null
let autoReturnTimer  = null
let onboardingInited = false

// ═══════════════════════════════════════════════════════════════════════════
// IDLE → SLEEPY watcher
// ═══════════════════════════════════════════════════════════════════════════

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  if (currentState.value === 'idle') {
    idleTimer = setTimeout(() => {
      if (currentState.value === 'idle') {
        currentState.value = 'sleepy'
      }
    }, IDLE_TIMEOUT_MS)
  }
}

// Start watching immediately at module init
watch(currentState, resetIdleTimer, { immediate: true })

// ═══════════════════════════════════════════════════════════════════════════
// CORE API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trigger a mascot state change.
 * @param {string} newState — one of STATES keys
 * @param {Object} [opts]
 * @param {string|null} [opts.message] — explicit phrase (undefined = auto-pick)
 * @param {string} [opts.subtitle]
 * @param {number} [opts.duration]
 * @param {Object} [opts.vars] — template substitution vars
 */
function trigger(newState, opts = {}) {
  if (!STATES[newState]) {
    console.warn(`[tama] Unknown state: ${newState}`)
    return
  }
  const meta = STATES[newState]
  const { message: explicitMessage, subtitle, duration, vars } = opts

  // message: undefined → auto-pick; null → suppress; string → use as-is
  const message = explicitMessage !== undefined
    ? explicitMessage
    : randomPhrase(newState, vars || {})

  // ── Update state ──
  currentState.value = newState

  // ── Bubble: clear old, queue new ──
  if (message) {
    bubble.value = null
    bubbleVisible.value = false
    _queueBubble({ message, subtitle, key: Date.now() })
  }

  // ── Auto-return to idle for temp states ──
  if (autoReturnTimer) clearTimeout(autoReturnTimer)
  if (meta.kind === 'temp') {
    const dur = typeof duration === 'number' ? duration : meta.defaultDuration
    if (dur > 0) {
      const returnFrom = newState
      autoReturnTimer = setTimeout(() => {
        if (currentState.value === returnFrom) {
          currentState.value = 'idle'
        }
      }, dur)
    }
  }

  // ── Auto-hide bubble ──
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  if (message) {
    const bubbleLife = typeof duration === 'number' ? duration : (meta.defaultDuration || 3000)
    bubbleHideTimer = setTimeout(() => {
      bubbleVisible.value = false
      setTimeout(() => { bubble.value = null }, 250)
    }, bubbleLife)
  }
}

function _queueBubble(bubbleData) {
  if (bubbleShowTimer) clearTimeout(bubbleShowTimer)
  bubbleShowTimer = setTimeout(() => {
    bubble.value = bubbleData
    bubbleVisible.value = true
  }, BUBBLE_DELAY_MS)
}

// ── Sleep / Wake (game-layer API) ────────────────────────────────────────

function goToSleep() {
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  if (autoReturnTimer) clearTimeout(autoReturnTimer)
  if (bubbleShowTimer) clearTimeout(bubbleShowTimer)
  bubbleVisible.value = false
  bubble.value = null
  isHidden.value = true
  currentState.value = 'sleepy'
}

function wakeUp() {
  isHidden.value = false
  const phrase = randomPhrase('waking')
  trigger('wave', { message: phrase, duration: 2800 })
}

function dismissBubble() {
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  bubbleVisible.value = false
  setTimeout(() => { bubble.value = null }, 250)
}

function reset() {
  if (idleTimer) clearTimeout(idleTimer)
  if (bubbleShowTimer) clearTimeout(bubbleShowTimer)
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  if (autoReturnTimer) clearTimeout(autoReturnTimer)
  currentState.value = 'idle'
  bubble.value = null
  bubbleVisible.value = false
  onboardingLookUp.value = false
  // isHidden preserved intentionally (same as React FORCE_RESET)
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING — 5 phrases on first-time entry. Non-blocking.
// ═══════════════════════════════════════════════════════════════════════════

function runOnboarding() {
  TAMA_ONBOARDING.forEach((phrase, i) => {
    setTimeout(() => {
      // Keep mascot in 'wave' across all phrases (bypass trigger auto-return)
      currentState.value = 'wave'
      bubble.value = null
      bubbleVisible.value = false
      _queueBubble({ message: phrase, subtitle: null, key: Date.now() })

      // Phrase 4 (index 3): "Сканер вон там ↑" — head tilts up
      if (i === 3) onboardingLookUp.value = true
      else if (i === 4) onboardingLookUp.value = false
    }, i * ONBOARDING_INTERVAL_MS)
  })

  const totalMs = TAMA_ONBOARDING.length * ONBOARDING_INTERVAL_MS
  setTimeout(() => saveFirstTime(false), totalMs)

  setTimeout(() => {
    bubbleVisible.value = false
    setTimeout(() => {
      bubble.value = null
      onboardingLookUp.value = false
      if (currentState.value === 'wave') {
        currentState.value = 'idle'
      }
    }, 250)
  }, totalMs + 2500)
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE — sync isHidden to localStorage
// ═══════════════════════════════════════════════════════════════════════════

watch(isHidden, (v) => saveHidden(v))

// ═══════════════════════════════════════════════════════════════════════════
// INIT — runs once at module load
// ═══════════════════════════════════════════════════════════════════════════

function initTama() {
  if (onboardingInited) return
  onboardingInited = true

  isHidden.value = loadHidden()

  if (loadFirstTime()) {
    setTimeout(runOnboarding, 800)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSABLE EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export function useTama() {
  // Ensure init runs on first use (lazy, not at module import)
  initTama()

  return {
    // Reactive reads
    currentState,
    bubble,
    bubbleVisible,
    isHidden,
    onboardingLookUp,

    // Actions
    trigger,
    goToSleep,
    wakeUp,
    dismissBubble,
    reset,
  }
}
