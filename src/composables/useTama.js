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
//   tama.replayOnboarding()
//
// Reactive reads:
//   tama.currentState    — ref<string>
//   tama.bubble          — ref<{ message, subtitle, key } | null>
//   tama.bubbleVisible   — ref<boolean>
//   tama.isHidden        — ref<boolean>
//   tama.onboardingLookUp — ref<boolean>
//   tama.history         — ref<Array<{ from, to, ts, hadBubble }>> (max 5, newest first)
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
const HISTORY_LIMIT         = 5
const PERSIST_KEY           = 'mascot:isHidden:v1'
const FIRST_TIME_KEY        = 'mascot:isFirstTimeUser:v1'
const ONBOARDING_INTERVAL_MS = 4500

// ═══════════════════════════════════════════════════════════════════════════
// TAMA PHRASES — patchable content. Edit only these, rest stays untouched.
//
// Storage convention (Phase β.1):
//   - State-keyed banks (idle, wave, sleepy, charge_up, etc) — fallback fired
//     by `trigger(state)` when no phraseKey overrides.
//   - Trigger-id-keyed banks (first_card_luck, near_tier_rare, etc) — fired
//     when `phraseKey` is passed OR when first arg of randomPhrase matches
//     a trigger_id directly. trigger_id snake_case matches TRIGGER_CONFIG.id.
//   - Curiosity tap banks (curiosity_tap_1, _few, _many, _pestering,
//     _warning) — used by onMascotTap routing per SCENARIOS §5.1.
//
// Template vars supported (interpolation via {var} placeholders):
//   {amount}            — заряды amount (например +300)
//   {balance}           — текущий баланс
//   {next_tier_gap}     — сколько до следующего тира
//   {tier_name}         — Rare / Epic / Legendary / UltraRare
//   {power_name}        — Везения / Двойки / Ключ
//   {cards_have}        — текущее количество карт
//   {cards_need}        — нужно для активации (=CARD_ACTIVATION_THRESHOLD)
//   {ip_name}           — имя серии (Stranger Things, Pokemon, etc)
//   {days_away}         — дней до истечения зарядов
//   {gift_name}         — название приза
//   {slots_left}        — слотов осталось до закрытия партии (agenda)
//
// Tone of voice: deadpan, "ты", 1-2 строки, без эмодзи, без энтузиазма.
// ═══════════════════════════════════════════════════════════════════════════

export const TAMA_PHRASES = {
  // ── STATE-KEYED BANKS (existing, untouched per Phase β.1 constraints) ──
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

  // ═════════════════════════════════════════════════════════════════════
  // TRIGGER-ID-KEYED BANKS — Phase β.1 sub-phase (c)
  // ═════════════════════════════════════════════════════════════════════

  // ── A. Scanner first-time entries ────────────────────────────────────
  first_legendary: [
    'Legendary. Только в Pool C — 5% коробок.',
    'Это из Pool C. Там их пять процентов.',
    'Pool C ответил. Тут Legendary живут.',
    'Поймал Pool C. Редкая зона.',
  ],
  first_spark: [
    'Искра. Мелочи сверху обмена, не каталог.',
    'Spark-бонус. Это мимо каталога — просто плюс.',
    'Искра дала +100. Это сбоку.',
    'Бонус-искра. Случается 25% обменов.',
  ],
  first_card_luck: [
    'Карта {power_name}. Собери ещё {cards_need} — и активируй ×2 шанс Rare.',
    'Это {power_name}. Накопи {cards_need} — будет ×2 Rare на скане.',
    'Нашёл {power_name}. Три штуки — и сила в кармане.',
    'Первая {power_name}. Ещё {cards_need} — открывается ×2 шанс.',
  ],
  first_card_double: [
    'Карта {power_name}. Собери ещё {cards_need} — следующий скан удвоит заряды.',
    'Это {power_name}. Накопи {cards_need} — будет ×2 заряды на следующем.',
    'Первая {power_name}. Три штуки — и заряды летят вдвое.',
    'Поймал {power_name}. Ещё {cards_need} — и удвоение готово.',
  ],
  first_card_key: [
    'Ключ Хокинса. Собери ещё {cards_need} — гарантия Pool C на следующем.',
    'Это {power_name}. Накопи {cards_need} — и Pool C обеспечен.',
    'Первая {power_name}. Три штуки — гарантированный Pool C.',
    'Нашёл {power_name}. Ещё {cards_need} — и топ-коллекция твоя.',
  ],

  // ── C. Collection tier rows / duplicates / first visit ───────────────
  tier_row_complete_common: [
    'Ряд Common закрыт.',
    'Common — собран весь ряд.',
    'Закрыл Common. Дальше.',
  ],
  tier_row_complete_rare: [
    'Rare ряд закрыт. Уже не каждый собирает.',
    'Rare — полный комплект. Это уровень.',
    'Закрыл Rare. Считай достижением.',
    'Rare-ряд. Не у всех такой.',
  ],
  tier_row_complete_epic: [
    'Epic ряд. Это серьёзно.',
    'Epic — закрыто. Уже редкость.',
    'Полный Epic. Уровень.',
    'Закрыл Epic-ряд. Многие застревают здесь.',
  ],
  tier_row_complete_legendary: [
    'Legendary ряд. Серьёзно.',
    'Полный Legendary. Это история.',
    'Legendary закрыт. Раз в год бывает.',
    'Все Legendary в коллекции. Smug-приз заслужен.',
  ],
  duplicate_received: [
    'Уже такой есть. Обменяй на заряды — норм.',
    'Дубль. Можешь оставить или вернуть.',
    'Этого ты уже видел. На заряды — без потерь.',
    'Twin приз. Обмен или коллекция — решай.',
  ],
  collection_first_visit: [
    'Здесь твоя коллекция. Tap по призу — детали.',
    'Коллекция. Pool A — топ, B — средний, C — стандарт.',
    'Это твои призы. Status показывает где они.',
    'Коллекция. Tap чтобы посмотреть детали.',
  ],

  // ── D. Cart — claim flow, first received, first visit ────────────────
  cart_first_visit: [
    'Common 200, Epic 1800, Legendary 5000. Обменивай заряды на призы.',
    'Каталог. Цены в зарядах. Уровни от Common до Legendary.',
    'Корзина. Тут призы которые ждут забора.',
    'Каталог обмена. Common с 200⚡, Legendary с 5000⚡.',
  ],
  claim_open: [
    'Покажи код на стойке партнёра.',
    'Подойди к стойке. QR — на экране.',
    'Код готов. Сотрудник его сканирует.',
  ],
  claim_done: [
    'Приз твой. Ещё что-то?',
    'Получил. Норм.',
    'Готово. Приз у тебя.',
    'Забрал. Уровень коллекции +1.',
  ],
  return_done: [
    'Назад в копилку.',
    'Возврат принят.',
    'Прибавилось.',
  ],
  first_received: [
    'В Корзине ждут призы. Tap чтобы получить код выдачи.',
    'Первый received. Идёшь забирать — в Корзину.',
    'Приз в Корзине. Code для стойки там.',
    'Корзина теперь с призом. Tap — код выдачи.',
  ],

  // ── E. Powers — first activations, errors, first visit ───────────────
  first_activate_luck: [
    'Везение активировано. ×2 шанс Rare на следующем скане.',
    'Luck готова. Следующий скан — ×2 Rare.',
    'Везение в работе. На следующей коробке.',
  ],
  first_activate_double: [
    'Двойка. На следующем скане заряды удвоятся.',
    'Double готова. Следующий скан — ×2 charges.',
    'Двойка активна. Жди следующего скана.',
  ],
  first_activate_key: [
    'Ключ. Следующий скан — гарантия Pool C.',
    'Key готов. Pool C на следующей коробке.',
    'Ключ Хокинса активен. Топ-коллекция обеспечена.',
  ],
  power_triggered: [
    '{power_name} сработала.',
    'Сила {power_name} применилась.',
    'Эффект {power_name}: всё по плану.',
    'Сработка. {power_name} применена.',
  ],
  power_insufficient: [
    'Карт мало.',
    'Ещё немного.',
    'Не хватает в комплект.',
  ],
  power_already_active: [
    'Уже активирована. Сработает на следующем скане.',
    'Эта сила в очереди. Сработает на скане.',
    'Активна. Ждёт следующего сканирования.',
  ],
  powers_first_visit: [
    'Три силы. Везение ×2 Rare, Двойка ×2 зарядов, Ключ — Pool C.',
    'Карты силы. Собрал три одинаковых — активируй.',
    'Силы. Везение, Двойка, Ключ. Каждая — три карты.',
    'Powers. Накопи три — открывается активация.',
  ],

  // ── F. Charges — zero balance, near-tier, expiry ──────────────────────
  charges_zero: [
    'Счёт пуст. Время сканировать.',
    'Баланс ноль. Сканер ждёт.',
    'Пусто. Иди за коробкой.',
  ],
  near_tier_rare: [
    'Ещё {next_tier_gap}⚡ — и хватит на {tier_name}.',
    'До {tier_name} осталось {next_tier_gap}⚡.',
    '{next_tier_gap}⚡ до {tier_name}. Близко.',
  ],
  near_tier_epic: [
    'Ещё {next_tier_gap}⚡ — и {tier_name} в кармане.',
    'До {tier_name} {next_tier_gap}⚡. Дотерпи.',
    '{next_tier_gap}⚡ до {tier_name}. Стоит того.',
  ],
  near_tier_legendary: [
    'До {tier_name} ещё {next_tier_gap}⚡. Это серьёзная цель.',
    '{next_tier_gap}⚡ до {tier_name}. Уже почти.',
    'Legendary в {next_tier_gap}⚡. Держи курс.',
  ],
  near_tier_ultrarare: [
    'До {tier_name} {next_tier_gap}⚡. Знаем, дорого. Но возможно.',
    '{next_tier_gap}⚡ до UltraRare. Это марафон.',
  ],
  expiry_warning: [
    'Зайди потратить.',
    'Заряды на таймере.',
    'Скоро сгорит.',
  ],

  // ── AGENDA BANKS (Phase β.1 sub-phase d) ─────────────────────────────────
  //   Fired from useAgenda.deliverNext via tama.trigger(state, {phraseKey,vars}).
  //   NOT in TRIGGER_CONFIG — agenda is a separate behavior contour with
  //   priority queue + idle-detection + cooldown persistence in
  //   mascot:agenda:delivered:<id>. Per owner remarks:
  //     - pre_reveal_tutorial: max 2 actions per phrase, not rude
  //     - return_*: deadpan, no "давно не виделись"/"помню тебя" emotional filler
  //     - post_first_exchange #3: teach breakage-friendly return path
  pre_reveal_tutorial: [
    'Когда отсканируешь — увидишь приз. Заберёшь или обменяешь на заряды.',
    'Скан → приз. Забрать или обменять — твой выбор.',
    'Сканер сверху. После скана две кнопки — выберешь.',
  ],
  post_first_take: [
    'Забрал. Приз в Корзине, там код выдачи.',
    'В Корзине ждёт. Покажешь код на стойке.',
    'Готово. Корзина — твой склад выдачи.',
  ],
  post_first_exchange: [
    '+{amount} зарядов. {balance} всего. До Epic — {next_tier_gap}.',
    'Обмен прошёл. {balance}⚡ на счету.',
    '{amount}⚡ зачислены. В Корзине можно вернуть призы за заряды.',
  ],
  partition_almost_closed: [
    'Партия почти закрыта. {slots_left} слотов осталось.',
    'Скоро закроется. {slots_left} штук — и всё.',
    'Финал партии близко. {slots_left} слотов.',
  ],
  return_short: [
    'Вернулся.',
    'Опять ты. Норм.',
    'Привет. Продолжим.',
  ],
  return_long: [
    'Долго не был. Заряды на месте.',
    'Прошла неделя. {balance}⚡ на счету — не потерял.',
    'С возвращением. Серии ждут.',
  ],
  return_dormant: [
    'Месяц прошёл. Партия сменилась.',
    'Долго не было. Заряды копятся 12 месяцев — успеешь.',
    'Вернулся? Тогда смотри что нового.',
  ],

  // ── Migrated existing charges entries — owner remark 6 ────────────────
  //   Old phrases implied current balance ("Тысяча зарядов!"). New phrases
  //   reflect that balance can drop after purchase — "накопил X за всё время".
  charges_1k: [
    'Норм старт.',
    'Первая отметка.',
    'Уже что-то.',
  ],
  charges_5k: [
    'Уже хватает на Legendary.',
    'Серьёзный счёт.',
    'Накопилось.',
  ],
  charges_10k: [
    'Открыто всё.',
    'Каталог в кармане.',
    'Серьёзный масштаб.',
  ],

  // ── G. Scan streak ────────────────────────────────────────────────────
  session_streak_3: [
    'Третий подряд. Удача любит горячих.',
    'Стрик 3+. Хороший заход.',
    'Три подряд за полчаса. Серия.',
  ],

  // ── H. Series ─────────────────────────────────────────────────────────
  new_series: [
    'Новая серия. {ip_name}.',
    '{ip_name} открылся. Новый каталог.',
    'Серия {ip_name} активна.',
  ],
  series_switched: [
    '{ip_name}.',
    'Сменили на {ip_name}.',
    'Теперь {ip_name}. Понял.',
  ],

  // ── K. Navigation ─────────────────────────────────────────────────────
  profile_first_visit: [
    'Тут статистика и история.',
    'Профиль. Здесь твои числа.',
    'Stats overlay. История сканов и trade.',
  ],

  // ═════════════════════════════════════════════════════════════════════
  // CURIOSITY TAP BANKS — Phase β.1 sub-phase (c), SCENARIOS §5.1
  // ═════════════════════════════════════════════════════════════════════

  curiosity_tap_1: [
    'Что?',
    'Я тут.',
    'Слушаю.',
  ],
  curiosity_tap_few: [
    'Снова ты.',
    'И?',
    'Что-то по делу?',
  ],
  curiosity_tap_many: [
    'Хм.',
    'Ты что-то ищешь?',
    'Заняться нечем?',
  ],
  curiosity_tap_pestering: [
    'Ну хватит.',
    'Это не интересно.',
    'Я устал.',
  ],
  curiosity_tap_warning: [
    'Ты серьёзно?',
    'Ладно, продолжай.',
  ],
  // curiosity_tap_easter — отдельный массив CURIOSITY_FACTS ниже.
}

// ═══════════════════════════════════════════════════════════════════════════
// CURIOSITY FACTS — Easter egg массив для тапа #10+ (SCENARIOS §5.2)
// 12 фактов, копированы дословно из спеки. Tone: deadpan, инсайды.
// randomFact() выбирает без повтора подряд.
// ═══════════════════════════════════════════════════════════════════════════

export const CURIOSITY_FACTS = [
  "Pool C — 5% коробок. Только тут Legendary.",
  "Везение даёт 2× шанс Rare. Это много.",
  "Mythic — один на квартал на всю сеть.",
  "Заряды копятся 12 месяцев. Не теряй.",
  "Партия закрывается когда выдадут все призы.",
  "Gold-вариант в коробке — 1-5% шанс. Лимитирован.",
  "3 одинаковых Везения — и сила готова.",
  "Ультра-Рара 20 тысяч зарядов. Знаем, дорого.",
  "Pool A — стандарт. Pool B — коллекционер. Pool C — охотник.",
  "Mythic выкупаем по параллельному импорту. Легально.",
  "Twin приз в коллекции? Обменяй на заряды. Норм.",
  "Ты можешь видеть hash до раздачи. Provably fair.",
]

export const TAMA_ONBOARDING = [
  'Привет. Я Тама.',
  'Вижу, у тебя есть коробка.',
  'Открой — посмотрим, что внутри.',
  'Сканер вон там ↑',
  'А я подожду здесь, пока ты вернёшься.',
]

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pick a random phrase from TAMA_PHRASES, interpolating {var} placeholders.
 *
 * Phase β.1 (sub-phase c) — signature extended with optional phraseKey:
 *   - phraseKey (3rd arg): trigger_id override. If TAMA_PHRASES[phraseKey]
 *     exists and is non-empty, that bank wins.
 *   - state (1st arg): default lookup. State-name normalization: kebab → snake
 *     ('charge-up' → 'charge_up'). For trigger_id-keyed banks (already snake),
 *     no transform.
 *
 * Acceptance test:
 *   randomPhrase('first_card_luck', { cards_have: 1, cards_need: 2,
 *     power_name: 'Везения' })
 *   → either valid phrase from TAMA_PHRASES.first_card_luck with vars
 *     interpolated, OR fallback to TAMA_PHRASES.first_card_luck (since
 *     'first_card_luck' is also a valid first-arg key).
 *
 * @param {string} state — state name OR trigger_id (snake_case keys preferred)
 * @param {Object} [vars] — template substitution vars (default: {})
 * @param {string|null} [phraseKey] — explicit trigger_id override (default: null)
 * @returns {string | undefined} — interpolated phrase or undefined if bank empty
 */
function randomPhrase(state, vars = {}, phraseKey = null) {
  // Priority: phraseKey (explicit override) → state (auto-normalized) → empty
  let list = null
  if (phraseKey && Array.isArray(TAMA_PHRASES[phraseKey]) && TAMA_PHRASES[phraseKey].length > 0) {
    list = TAMA_PHRASES[phraseKey]
  } else {
    const stateKey = String(state).replace(/-/g, '_')
    list = TAMA_PHRASES[stateKey] || []
  }
  if (list.length === 0) return undefined
  const template = list[Math.floor(Math.random() * list.length)]
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  )
}

/**
 * Interpolate {var} placeholders in a fixed string. Same regex as randomPhrase,
 * exposed for cases where trigger entries provide explicit mascotPhrase but
 * still need vars resolved (legacy fallback path in trigger() below).
 */
function interpolate(template, vars = {}) {
  if (typeof template !== 'string') return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  )
}

/**
 * Pick a random fact from CURIOSITY_FACTS, avoiding immediate repeat.
 * Used by onMascotTap at tap #10+ (Easter egg, SCENARIOS §5.2).
 *
 * @param {string|null} [prevFact] — last shown fact to avoid repeating
 * @returns {string|null} — fact or null if empty array
 */
export function randomFact(prevFact = null) {
  if (CURIOSITY_FACTS.length === 0) return null
  if (CURIOSITY_FACTS.length === 1) return CURIOSITY_FACTS[0]
  let pick
  // Safety bound — extreme edge case if Math.random unlucky
  let attempts = 0
  do {
    pick = CURIOSITY_FACTS[Math.floor(Math.random() * CURIOSITY_FACTS.length)]
    attempts++
  } while (pick === prevFact && attempts < 10)
  return pick
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
const history          = ref([])      // [{ from, to, ts, hadBubble }], max HISTORY_LIMIT

// ── Phase β.1 (sub-phase c): curiosity counter (SCENARIOS §5.1) ──────────
//   Counts taps on the mascot while in 'idle' state. Reset on app reload
//   (module re-eval). NOT persisted — per spec: "Persist counter в
//   localStorage → надоедает быстро" (§5.3 rejected alternative).
//   Counter never resets to 0 after reaching 10+ — taps just keep delivering
//   facts in "факт дня" mode.
const curiosityTaps = ref(0)
// Last shown fact (in-memory, for no-repeat-consecutive guarantee).
let lastFact = null

// Push a transition entry to history, keeping only the last HISTORY_LIMIT items.
// Matches React reducer behavior in mascot-phase1.jsx (TRIGGER, AUTO_RETURN_IDLE,
// GO_SLEEPY cases).
function pushHistory(from, to, hadBubble) {
  history.value = [
    { from, to, ts: Date.now(), hadBubble },
    ...history.value,
  ].slice(0, HISTORY_LIMIT)
}

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
        pushHistory('idle', 'sleepy', false)
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
 * @param {string|null} [opts.message] — explicit phrase. undefined = auto-pick
 *   via phraseKey/state lookup, null = suppress bubble.
 * @param {string} [opts.subtitle]
 * @param {number} [opts.duration]
 * @param {Object} [opts.vars] — template substitution vars
 * @param {string} [opts.phraseKey] — trigger_id override for TAMA_PHRASES
 *   lookup. If TAMA_PHRASES[phraseKey] exists, it overrides state-default.
 */
function trigger(newState, opts = {}) {
  if (!STATES[newState]) {
    console.warn(`[tama] Unknown state: ${newState}`)
    return
  }
  const meta = STATES[newState]
  const { message: explicitMessage, subtitle, duration, vars, phraseKey } = opts

  // Phase β.1 (sub-phase c): phrase resolution priority
  //   1. explicitMessage === null     → suppress (no bubble)
  //   2. phraseKey with valid bank    → randomPhrase from that bank
  //   3. explicitMessage string       → interpolate vars in it
  //   4. explicitMessage === undefined → randomPhrase from state-default bank
  let message
  if (explicitMessage === null) {
    message = null
  } else if (phraseKey && Array.isArray(TAMA_PHRASES[phraseKey]) && TAMA_PHRASES[phraseKey].length > 0) {
    message = randomPhrase(newState, vars || {}, phraseKey)
  } else if (typeof explicitMessage === 'string') {
    // Static fallback from trigger entry (legacy path) — still interpolate
    // vars so static phrases with placeholders work.
    message = interpolate(explicitMessage, vars || {})
  } else {
    message = randomPhrase(newState, vars || {})
  }

  // ── History ── (matches React reducer TRIGGER case)
  pushHistory(currentState.value, newState, Boolean(message))

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
          pushHistory(returnFrom, 'idle', false)
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
  // Manual sleep — push transition to history (matches React TRIGGER dispatch)
  pushHistory(currentState.value, 'sleepy', false)
  isHidden.value = true
  currentState.value = 'sleepy'
}

function wakeUp() {
  isHidden.value = false
  const phrase = randomPhrase('waking')
  // wakeUp's trigger('wave') will push its own history entry
  trigger('wave', { message: phrase, duration: 2800 })
}

// ── Phase β.1 (sub-phase c): mascot tap routing (SCENARIOS §5.1, J1-J6) ──
//   Single unified entry-point for mascot interactions. Replaces ad-hoc
//   click handlers in TamaMascot.vue.
//
// Routing logic:
//   - currentState === 'sleepy' → wakeUp() (preserve existing UX)
//   - currentState !== 'idle'   → no-op (spec: counter increments ONLY in idle)
//   - currentState === 'idle'   → curiosityTaps++ and route by tap count:
//       1     → curiosity_tap_1 (idle phrase)
//       2-3   → curiosity_tap_few (idle phrases)
//       4-5   → curiosity_tap_many (pondering)
//       6-7   → curiosity_tap_pestering (sleepy)
//       8-9   → curiosity_tap_warning (surprised)
//       10+   → CURIOSITY_FACTS random-no-repeat (smug-wink Easter egg)
//
// NB: idle is a permanent state (no auto-return). Calling trigger('idle')
// pushes history + queues bubble + auto-hides bubble after 3s. State stays
// 'idle' so the next tap continues incrementing.
function onMascotTap() {
  if (currentState.value === 'sleepy') {
    wakeUp()
    return
  }
  if (currentState.value !== 'idle') {
    // Spec §5: counter increments only in idle. Tapping a temp state
    // (wave, charge-up, proud, etc) is ignored — wait for auto-return.
    return
  }

  curiosityTaps.value += 1
  const n = curiosityTaps.value

  if (n === 1) {
    trigger('idle', { phraseKey: 'curiosity_tap_1' })
  } else if (n <= 3) {
    trigger('idle', { phraseKey: 'curiosity_tap_few' })
  } else if (n <= 5) {
    trigger('pondering', { phraseKey: 'curiosity_tap_many' })
  } else if (n <= 7) {
    trigger('sleepy', { phraseKey: 'curiosity_tap_pestering' })
  } else if (n <= 9) {
    trigger('surprised', { phraseKey: 'curiosity_tap_warning' })
  } else {
    // Easter egg: tap #10+. State 'smug-wink' + factoid override message.
    const fact = randomFact(lastFact)
    lastFact = fact
    trigger('smug-wink', { message: fact })
  }
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
  history.value = []
  // Phase β.1 (sub-phase c): clear curiosity counter on reset.
  //   In normal operation counter persists across the session (per spec).
  //   reset() is used by debug panel "Reset all" — full clean slate.
  curiosityTaps.value = 0
  lastFact = null
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

/**
 * Replay the onboarding sequence. Clears the first-time-user flag so it
 * runs as if it were the first visit, then dispatches the 5-phrase sequence.
 * Used by the Debug panel "Mascot" tab for manual verification.
 */
function replayOnboarding() {
  // Clear any pending timers / current bubble first
  if (idleTimer) clearTimeout(idleTimer)
  if (bubbleShowTimer) clearTimeout(bubbleShowTimer)
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  if (autoReturnTimer) clearTimeout(autoReturnTimer)
  bubble.value = null
  bubbleVisible.value = false
  onboardingLookUp.value = false
  // Reset persistence flag so the saveFirstTime(false) call inside runOnboarding
  // still matches semantics (we "re-experience" first-time)
  saveFirstTime(true)
  // If currently sleeping — wake up first, otherwise onboarding plays under the box
  if (currentState.value === 'sleepy' || isHidden.value) {
    isHidden.value = false
    currentState.value = 'idle'
  }
  runOnboarding()
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
    history,
    // Phase β.1 (sub-phase c): curiosity counter — reactive read for
    //   DebugPanel display.
    curiosityTaps,

    // Actions
    trigger,
    goToSleep,
    wakeUp,
    dismissBubble,
    reset,
    replayOnboarding,
    // Phase β.1 (sub-phase c): unified tap handler — replaces wakeUp() +
    //   ad-hoc click handlers in TamaMascot.vue.
    onMascotTap,
  }
}
