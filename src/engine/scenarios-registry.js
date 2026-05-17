// ═══════════════════════════════════════════════════════════════════════════
// scenarios-registry.js — debug metadata for ~50-70 mascot scenarios.
//
// Phase β.1 (sub-phase f). Source of truth: TAMA-SCENARIOS.md v0.2:
//   §4 (полный реестр A–K) — category, code, trigger_id, priority, emotion,
//      goal text, kratность, status
//   §10 (приоритизация P0–P3) — what's MVP-must vs phase-2 deferred
//
// IMPORTANT: this registry is DEBUG METADATA ONLY. It does NOT duplicate
// TRIGGER_CONFIG content (build, test, event, markFlag). Runtime behavior
// of triggers stays in engine/triggers.js. Agenda items stay in useAgenda.js.
// This file exists so DebugPanel can categorize, filter, and describe all
// scenarios in a single inspection surface — without re-encoding any logic.
//
// Field meanings:
//   code              — short scenario code from TAMA-SCENARIOS (e.g. 'A1.1')
//   category          — letter A..K (used to group accordion sections)
//   trigger_id        — the trigger / phrase_key (matches TRIGGER_CONFIG.id
//                       for reactive, KNOWN_AGENDA_IDS for agenda, or a
//                       synthetic id for onboarding/curiosity)
//   priority          — 'P0' | 'P1' | 'P2' | 'P3'  (P3 = deferred / phase 2)
//   state             — mascot state to set on simulate (one of 12 STATES,
//                       or 'silent' for null-state cases)
//   kind              — 'reactive' (in TRIGGER_CONFIG) | 'agenda' | 'onboarding'
//                     | 'curiosity' (in-engine, not in TRIGGER_CONFIG)
//   kratnost          — 'one-shot' | 'always' | 'session' | 'per-tier' | etc.
//   condition_description — human-readable When-this-fires summary
//   text_preview      — short illustrative phrase (NOT used at runtime;
//                       runtime resolution still goes through TAMA_PHRASES)
//
// Filtering:
//   Implementation status is computed AT RUNTIME by cross-referencing
//   TRIGGER_CONFIG ids + KNOWN_AGENDA_IDS — see DebugPanel.vue::isImplemented.
//   This avoids drift between this file and the actual code.
// ═══════════════════════════════════════════════════════════════════════════

// Display labels for the 11 categories — used as accordion section headers.
export const CATEGORY_LABELS = Object.freeze({
  A: 'A. Сканер',
  B: 'B. Reveal',
  C: 'C. Коллекция',
  D: 'D. Корзина',
  E: 'E. Силы',
  F: 'F. Заряды',
  G: 'G. Сканы',
  H: 'H. Партия / Series',
  I: 'I. Lifecycle',
  J: 'J. Curiosity',
  K: 'K. Прочее',
})

// Iteration order — matches accordion display order top to bottom.
export const CATEGORY_ORDER = Object.freeze(['A','B','C','D','E','F','G','H','I','J','K'])

// Recognized template vars per TAMA-SCENARIOS §2.1. Used to render Vars-edit
// input fields only for vars a particular phrase actually uses.
export const KNOWN_VARS = Object.freeze([
  'amount', 'balance', 'next_tier_gap', 'tier_name', 'power_name',
  'cards_have', 'cards_need', 'ip_name', 'days_away', 'gift_name',
  'slots_left',
])

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIOS_REGISTRY — flat list, 64 entries, derived from TAMA-SCENARIOS §4
// ═══════════════════════════════════════════════════════════════════════════
//
// Ordering within each category mirrors the §4 table top-to-bottom so cross-
// referencing the source doc is straightforward.

export const SCENARIOS_REGISTRY = Object.freeze([

  // ── A. Сканер (13) ───────────────────────────────────────────────────────
  { code: 'A1.1', category: 'A', trigger_id: 'pre_reveal_tutorial',
    priority: 'P0', state: 'wave', kind: 'agenda', kratnost: 'one-shot',
    condition_description: 'После онбординга, до первого скана. Fires on first non-Scanner idle.',
    text_preview: 'Когда отсканируешь — увидишь приз. Заберёшь или обменяешь на заряды.' },
  { code: 'A1.2', category: 'A', trigger_id: 'post_first_take',
    priority: 'P0', state: 'charge-up', kind: 'agenda', kratnost: 'one-shot',
    condition_description: 'После первого Take, при возврате на non-gambling экран.',
    text_preview: 'Забрал. Приз в Корзине, там код выдачи.' },
  { code: 'A1.3', category: 'A', trigger_id: 'post_first_exchange',
    priority: 'P0', state: 'farewell', kind: 'agenda', kratnost: 'one-shot',
    condition_description: 'После первого Exchange, при возврате на non-gambling экран.',
    text_preview: '+{amount} зарядов. {balance} всего. До Epic — {next_tier_gap}.' },
  { code: 'A2',   category: 'A', trigger_id: 'last_one_bonus',
    priority: 'P0', state: 'wow', kind: 'reactive', kratnost: 'always',
    condition_description: 'Скан → Mythic / UltraRare / Last One bonus.',
    text_preview: 'Last One! +500⚡. Партия закрылась на тебе.' },
  { code: 'A3',   category: 'A', trigger_id: 'first_legendary',
    priority: 'P1', state: 'charge-up', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первый Legendary за всю историю игрока (только Pool C).',
    text_preview: 'Legendary. Только в Pool C — 5% коробок.' },
  { code: 'A5',   category: 'A', trigger_id: 'sticker_dropped',
    priority: 'P3', state: 'silent', kind: 'reactive', kratnost: 'always',
    condition_description: 'Скан → JUNK. Намеренно молчим (без подсветки «мусора»).',
    text_preview: '(silent — без bubble)' },
  { code: 'A6',   category: 'A', trigger_id: 'scan_invalid_qr',
    priority: 'P1', state: 'pondering', kind: 'reactive', kratnost: 'always',
    condition_description: 'Скан невалидного QR (v0.2: sleepy → pondering).',
    text_preview: 'Не наш QR.' },
  { code: 'A7',   category: 'A', trigger_id: 'scan_already_used',
    priority: 'P1', state: 'pondering', kind: 'reactive', kratnost: 'always',
    condition_description: 'Скан уже использованного QR (v0.2: sleepy → pondering).',
    text_preview: 'Эта коробка уже открыта.' },
  { code: 'A8',   category: 'A', trigger_id: 'scan_partition_closed',
    priority: 'P0', state: 'farewell', kind: 'reactive', kratnost: 'always',
    condition_description: 'Скан в закрытую партию.',
    text_preview: 'Партия закрыта. Жди новую.' },
  { code: 'A9',   category: 'A', trigger_id: 'scan_other_error',
    priority: 'P2', state: 'pondering', kind: 'reactive', kratnost: 'always',
    condition_description: 'Прочая ошибка скана (не invalid_qr, не already_used).',
    text_preview: 'Попробуй ещё раз.' },
  { code: 'A12',  category: 'A', trigger_id: 'spark_credited',
    priority: 'P1', state: 'proud', kind: 'reactive', kratnost: 'always',
    condition_description: 'Spark fired (25% probability per exchange). First-time teaches concept.',
    text_preview: 'Искра. Мелочи сверху обмена.' },
  { code: 'A13',  category: 'A', trigger_id: 'first_card_luck',
    priority: 'P0', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первая карта Везения (cardFound === \'luck\').',
    text_preview: 'Карта Везения. Собери ещё {cards_need} — активируй ×2 Rare.' },
  { code: 'A14',  category: 'A', trigger_id: 'first_card_double',
    priority: 'P0', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первая карта Двойки (cardFound === \'double\').',
    text_preview: 'Карта Двойки. Собери ещё {cards_need} — ×2 заряды на скане.' },
  { code: 'A15',  category: 'A', trigger_id: 'first_card_key',
    priority: 'P0', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первая карта Ключа Хокинса (cardFound === \'key\').',
    text_preview: 'Карта Ключа. Собери ещё {cards_need} — Pool C на следующем скане.' },
  { code: 'A16',  category: 'A', trigger_id: 'card_credited',
    priority: 'P2', state: 'proud', kind: 'reactive', kratnost: 'always',
    condition_description: 'Card-приз — рутина (N-я карта после первой).',
    text_preview: 'И ещё карта силы! {cards_have}/{cards_need}.' },

  // ── B. Reveal (2) ────────────────────────────────────────────────────────
  { code: 'B1', category: 'B', trigger_id: 'take_done',
    priority: 'P1', state: 'charge-up', kind: 'reactive', kratnost: 'always',
    condition_description: 'Take — рутина (не первый раз). Маскот внутри reveal НЕ появляется.',
    text_preview: '{tier_name}. В коллекции.' },
  { code: 'B2', category: 'B', trigger_id: 'exchange_done',
    priority: 'P1', state: 'farewell', kind: 'reactive', kratnost: 'always',
    condition_description: 'Exchange — рутина. Маскот внутри reveal НЕ появляется.',
    text_preview: '+{amount}. {balance}.' },

  // ── C. Коллекция (10) ────────────────────────────────────────────────────
  { code: 'C1',  category: 'C', trigger_id: 'first_in_collection_A',
    priority: 'P1', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первый приз в пуле A (70% коробок).',
    text_preview: 'Pool A — стандарт, 70% коробок.' },
  { code: 'C2',  category: 'C', trigger_id: 'first_in_collection_B',
    priority: 'P1', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первый приз в пуле B (25% коробок).',
    text_preview: 'Pool B — коллекторский, 25%.' },
  { code: 'C3',  category: 'C', trigger_id: 'first_in_collection_C',
    priority: 'P0', state: 'wow', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первый приз в пуле C (5% коробок, Legendary+).',
    text_preview: 'Pool C — Hunter, 5%. Только тут Legendary+.' },
  { code: 'C4',  category: 'C', trigger_id: 'collection_5',
    priority: 'P2', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Веха: коллекция = 5 уникальных призов.',
    text_preview: '5/18. Норм.' },
  { code: 'C5',  category: 'C', trigger_id: 'collection_10',
    priority: 'P2', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Веха: коллекция = 10.',
    text_preview: '10/18. Половина.' },
  { code: 'C6',  category: 'C', trigger_id: 'collection_15',
    priority: 'P2', state: 'proud', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Веха: коллекция = 15. Осталось 3.',
    text_preview: 'Осталось 3.' },
  { code: 'C7',  category: 'C', trigger_id: 'collection_full',
    priority: 'P0', state: 'wow', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Полная коллекция 18/18.',
    text_preview: 'Коллекция собрана. Жди новую серию.' },
  { code: 'C8',  category: 'C', trigger_id: 'tier_row_complete_common',
    priority: 'P1', state: 'proud', kind: 'reactive', kratnost: 'per-tier',
    condition_description: 'Полный ряд одного тира (Common/Rare/Epic/Legendary).',
    text_preview: '{tier_name} ряд закрыт.' },
  { code: 'C9',  category: 'C', trigger_id: 'duplicate_received',
    priority: 'P3', state: 'pondering', kind: 'reactive', kratnost: 'first-time-only',
    condition_description: 'Получен дубль уже имеющегося slot. Учитель 1 раз.',
    text_preview: 'Уже такой есть. Обменяй на заряды.' },
  { code: 'C10', category: 'C', trigger_id: 'collection_first_visit',
    priority: 'P1', state: 'big-eyes', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первое посещение Collection-таба (screen_visit event).',
    text_preview: 'Здесь твоя коллекция. Tap по призу — детали.' },

  // ── D. Корзина (5) ───────────────────────────────────────────────────────
  { code: 'D1', category: 'D', trigger_id: 'cart_first_visit',
    priority: 'P0', state: 'big-eyes', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первое посещение Cart-таба. Объясняет тиры экономики.',
    text_preview: 'Common 200, Epic 1800, Legendary 5000 — здесь меняешь заряды на призы.' },
  { code: 'D2', category: 'D', trigger_id: 'claim_open',
    priority: 'P2', state: 'pondering', kind: 'reactive', kratnost: 'always',
    condition_description: 'Tap «Получить» на cart-айтеме. Без toast (suppress).',
    text_preview: 'Покажи код на стойке партнёра.' },
  { code: 'D3', category: 'D', trigger_id: 'claim_done',
    priority: 'P2', state: 'proud', kind: 'reactive', kratnost: 'always',
    condition_description: 'Подтверждение получения в claim-модалке.',
    text_preview: 'Приз твой. Ещё что-то?' },
  { code: 'D4', category: 'D', trigger_id: 'return_done',
    priority: 'P2', state: 'farewell', kind: 'reactive', kratnost: 'always',
    condition_description: 'Возврат приза в заряды (через cart-таб).',
    text_preview: '+{amount}⚡ вернулись. Норм.' },
  { code: 'D5', category: 'D', trigger_id: 'first_received',
    priority: 'P0', state: 'delight', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первый exchange-приз попадает в Корзину как received-slot.',
    text_preview: 'В Корзине ждут призы. Tap чтобы получить код.' },

  // ── E. Силы (9) ──────────────────────────────────────────────────────────
  { code: 'E1.luck',   category: 'E', trigger_id: 'first_activate_luck',
    priority: 'P0', state: 'smug-wink', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первая активация Везения (3 карты собраны).',
    text_preview: 'Везение активировано. ×2 шанс Rare на следующем скане.' },
  { code: 'E1.double', category: 'E', trigger_id: 'first_activate_double',
    priority: 'P0', state: 'smug-wink', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первая активация Двойки.',
    text_preview: 'Двойка активирована. ×2 заряды на следующем скане.' },
  { code: 'E1.key',    category: 'E', trigger_id: 'first_activate_key',
    priority: 'P0', state: 'smug-wink', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первая активация Ключа Хокинса.',
    text_preview: 'Ключ активирован. Pool C на следующем скане.' },
  { code: 'E2', category: 'E', trigger_id: 'power_activated',
    priority: 'P1', state: 'smug-wink', kind: 'reactive', kratnost: 'always',
    condition_description: 'Активация силы — рутина (не первый раз для типа).',
    text_preview: '{power_name} готова.' },
  { code: 'E3', category: 'E', trigger_id: 'power_triggered',
    priority: 'P0', state: 'surprised', kind: 'reactive', kratnost: 'always',
    condition_description: 'Активная сила сработала на скане.',
    text_preview: '{power_name} сработала.' },
  { code: 'E4', category: 'E', trigger_id: 'power_insufficient',
    priority: 'P2', state: 'pondering', kind: 'reactive', kratnost: 'always',
    condition_description: 'Попытка активации без достаточного числа карт.',
    text_preview: 'Нужно {cards_need}. Сейчас {cards_have}.' },
  { code: 'E5', category: 'E', trigger_id: 'power_already_active',
    priority: 'P2', state: 'pondering', kind: 'reactive', kratnost: 'always',
    condition_description: 'Попытка повторной активации того же типа.',
    text_preview: 'Уже активирована. Сработает на следующем скане.' },
  { code: 'E6', category: 'E', trigger_id: 'purchase_done',
    priority: 'P1', state: 'charge-up', kind: 'reactive', kratnost: 'always',
    condition_description: 'Покупка карты силы из коллекции/gallery.',
    text_preview: 'Карта добавлена. Активируй когда соберёшь {cards_need}.' },
  { code: 'E7', category: 'E', trigger_id: 'powers_first_visit',
    priority: 'P1', state: 'big-eyes', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первое посещение Powers-таба.',
    text_preview: 'Три силы. Везение, Двойка, Ключ — разные эффекты.' },

  // ── F. Заряды (6) ────────────────────────────────────────────────────────
  { code: 'F1', category: 'F', trigger_id: 'charges_1k',
    priority: 'P1', state: 'proud', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Веха 1000⚡ накоплено за всё время (post-fix B-1: lifetime, не balance).',
    text_preview: 'Тысяча накопилась. За всё время.' },
  { code: 'F2', category: 'F', trigger_id: 'charges_5k',
    priority: 'P0', state: 'proud', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Веха 5000⚡ накоплено.',
    text_preview: 'Пять тысяч в сумме. Можно крутые подарки.' },
  { code: 'F3', category: 'F', trigger_id: 'charges_10k',
    priority: 'P1', state: 'wow', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Веха 10000⚡ накоплено.',
    text_preview: 'Десять тысяч за всё. Открыты все варианты.' },
  { code: 'F4', category: 'F', trigger_id: 'charges_zero',
    priority: 'P3', state: 'sleepy', kind: 'reactive', kratnost: 'always',
    condition_description: 'Баланс упал до 0 после трат.',
    text_preview: 'Счёт пуст. Время сканировать.' },
  { code: 'F5', category: 'F', trigger_id: 'near_tier_rare',
    priority: 'P0', state: 'charge-up', kind: 'reactive', kratnost: 'per-tier',
    condition_description: 'Баланс зашёл в [X-200, X) для одного из exchange-тиров (Rare/Epic/Legendary/UltraRare).',
    text_preview: 'Ещё {next_tier_gap}⚡ — и хватит на {tier_name}.' },
  { code: 'F6', category: 'F', trigger_id: 'expiry_warning',
    priority: 'P1', state: 'pondering', kind: 'agenda', kratnost: 'one-shot',
    condition_description: 'Заряды истекают через 30 дней (agenda, симулируется через DebugPanel).',
    text_preview: 'Через {days_away} дн. сгорят {amount}⚡. Зайди потратить.' },

  // ── G. Сканы (5) ─────────────────────────────────────────────────────────
  { code: 'G1', category: 'G', trigger_id: 'first_scan_done',
    priority: 'P1', state: 'wow', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первый успешный скан игрока (markFlag explicit in handleScan).',
    text_preview: 'Первый скан. Поехали.' },
  { code: 'G2', category: 'G', trigger_id: 'scan_10',
    priority: 'P2', state: 'proud', kind: 'reactive', kratnost: 'one-shot',
    condition_description: '10-й успешный скан.',
    text_preview: '10. Ты тут серьёзно.' },
  { code: 'G3', category: 'G', trigger_id: 'scan_50',
    priority: 'P2', state: 'proud', kind: 'reactive', kratnost: 'one-shot',
    condition_description: '50-й успешный скан.',
    text_preview: '50 коробок. Уважение.' },
  { code: 'G4', category: 'G', trigger_id: 'scan_100',
    priority: 'P1', state: 'wow', kind: 'reactive', kratnost: 'one-shot',
    condition_description: '100-й успешный скан.',
    text_preview: '100. Тебя видно из космоса.' },
  { code: 'G5', category: 'G', trigger_id: 'session_streak_3',
    priority: 'P2', state: 'charge-up', kind: 'reactive', kratnost: 'per-session',
    condition_description: '3 скана за 30мин в одной сессии (in-memory counter).',
    text_preview: 'Третий подряд. Удача любит горячих.' },

  // ── H. Партия / Series (3) ───────────────────────────────────────────────
  { code: 'H1', category: 'H', trigger_id: 'partition_closed',
    priority: 'P0', state: 'farewell', kind: 'reactive', kratnost: 'one-shot-per-partition',
    condition_description: 'Партия закрылась (все слоты opened).',
    text_preview: 'Партия закрыта. Жди новую серию.' },
  { code: 'H2', category: 'H', trigger_id: 'partition_almost_closed',
    priority: 'P0', state: 'pondering', kind: 'agenda', kratnost: 'one-shot',
    condition_description: 'Партия ≥ 80% redemption (agenda, fire на следующем non-Scanner idle).',
    text_preview: 'Партия почти закрыта. {slots_left} слотов осталось.' },
  { code: 'H3', category: 'H', trigger_id: 'new_series',
    priority: 'P1', state: 'wave', kind: 'reactive', kratnost: 'one-shot-per-series',
    condition_description: 'Первый скан новой серии (markFlag dynamic: new_series:<seriesId>).',
    text_preview: 'Новая серия. {ip_name}.' },

  // ── I. App lifecycle (4) ─────────────────────────────────────────────────
  { code: 'I1', category: 'I', trigger_id: 'onboarding',
    priority: 'P0', state: 'wave', kind: 'onboarding', kratnost: 'one-shot-lifetime',
    condition_description: 'Первый запуск приложения. 5 фраз TAMA_ONBOARDING.',
    text_preview: '(5-phrase sequence — см. TAMA_ONBOARDING)' },
  { code: 'I2', category: 'I', trigger_id: 'return_short',
    priority: 'P1', state: 'wave', kind: 'agenda', kratnost: 'one-per-day',
    condition_description: 'Возврат после 24-48ч (gap ∈ [1d, 7d]).',
    text_preview: 'Опять ты. Норм.' },
  { code: 'I3', category: 'I', trigger_id: 'return_long',
    priority: 'P0', state: 'wave', kind: 'agenda', kratnost: 'session-once',
    condition_description: 'Возврат после 7+ дней (gap ∈ [7d, 30d]).',
    text_preview: 'Долго не был. Заряды на месте.' },
  { code: 'I4', category: 'I', trigger_id: 'return_dormant',
    priority: 'P1', state: 'pondering', kind: 'agenda', kratnost: 'session-once',
    condition_description: 'Возврат после 30+ дней.',
    text_preview: 'Месяц прошёл. Партия сменилась.' },

  // ── J. Curiosity easter egg (6) ──────────────────────────────────────────
  { code: 'J1', category: 'J', trigger_id: 'curiosity_tap_1',
    priority: 'P0', state: 'idle', kind: 'curiosity', kratnost: 'per-tap',
    condition_description: '1-й tap по маскоту в idle.',
    text_preview: 'Что? / Я тут. / Слушаю.' },
  { code: 'J2', category: 'J', trigger_id: 'curiosity_tap_few',
    priority: 'P0', state: 'idle', kind: 'curiosity', kratnost: 'per-tap',
    condition_description: 'Tap'+'ы #2-3.',
    text_preview: 'Снова ты. / И? / Что-то по делу?' },
  { code: 'J3', category: 'J', trigger_id: 'curiosity_tap_many',
    priority: 'P0', state: 'pondering', kind: 'curiosity', kratnost: 'per-tap',
    condition_description: 'Tap\'ы #4-5.',
    text_preview: 'Хм. / Ты что-то ищешь?' },
  { code: 'J4', category: 'J', trigger_id: 'curiosity_tap_pestering',
    priority: 'P0', state: 'sleepy', kind: 'curiosity', kratnost: 'per-tap',
    condition_description: 'Tap\'ы #6-7.',
    text_preview: 'Ну хватит. / Это не интересно.' },
  { code: 'J5', category: 'J', trigger_id: 'curiosity_tap_warning',
    priority: 'P0', state: 'surprised', kind: 'curiosity', kratnost: 'per-tap',
    condition_description: 'Tap\'ы #8-9.',
    text_preview: 'Ты серьёзно? / Ладно, продолжай.' },
  { code: 'J6', category: 'J', trigger_id: 'curiosity_easter_egg',
    priority: 'P0', state: 'smug-wink', kind: 'curiosity', kratnost: 'per-tap',
    condition_description: 'Tap #10 и далее — случайный факт из CURIOSITY_FACTS (12 шт.), без повторов подряд.',
    text_preview: '(random fact — см. CURIOSITY_FACTS)' },

  // ── K. Прочее (1) ────────────────────────────────────────────────────────
  { code: 'K1', category: 'K', trigger_id: 'profile_first_visit',
    priority: 'P1', state: 'big-eyes', kind: 'reactive', kratnost: 'one-shot',
    condition_description: 'Первое открытие Profile / Stats overlay.',
    text_preview: 'Тут статистика и история.' },
])

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS for DebugPanel
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group registry entries by category, preserving CATEGORY_ORDER.
 * Returns: [{ key, label, entries: [...] }, ...]
 */
export function groupByCategory(entries = SCENARIOS_REGISTRY) {
  const buckets = Object.fromEntries(CATEGORY_ORDER.map(k => [k, []]))
  for (const e of entries) {
    if (buckets[e.category]) buckets[e.category].push(e)
  }
  return CATEGORY_ORDER.map(k => ({
    key: k,
    label: CATEGORY_LABELS[k],
    entries: buckets[k],
  })).filter(g => g.entries.length > 0)
}

/**
 * Extract var names referenced by a phrase template, e.g. "+{amount}⚡, {balance}"
 * → ['amount', 'balance']. Used to render Vars-edit inputs only for vars the
 * phrase actually uses.
 */
export function extractPhraseVars(template) {
  if (!template || typeof template !== 'string') return []
  const re = /\{(\w+)\}/g
  const seen = new Set()
  let m
  while ((m = re.exec(template)) !== null) {
    if (KNOWN_VARS.includes(m[1])) seen.add(m[1])
  }
  return Array.from(seen)
}
