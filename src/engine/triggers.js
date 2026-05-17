// ═══════════════════════════════════════════════════════════════════════════
// TRIGGER SYSTEM v3 — copy-paste 1:1 from PrizeEnginePWA.jsx (3504-4047).
// Спецификация: TRIGGER-SYSTEM-v3.md (878 строк).
//
// Все toast'ы (и в Фазе 4 — речевые bubble маскота Tama) проходят через
// evaluateTriggers(). Handler'ы передают eventType + eventData, получают
// массив toastConfig'ов, вызывают fireTriggers(arr, pushToast). Trigger
// System сама не делает side effects (state mutation, navigation).
//
// Vue-портация:
//   • Иконки — строки ('Award', 'Check', ...), Vue-компонент резолвится
//     в ToastStack.vue через словарь lucide-vue-next.
//   • React.createElement убран, fireTriggers передаёт icon как string.
//   • Поля mascotPhrase / mascotState — для Фазы 4 (Tama integration),
//     сейчас неиспользуются renderer'ом, но фиксируют семантику.
// ═══════════════════════════════════════════════════════════════════════════

import { DEFAULT_CONFIG, SPARK_CONFIG } from './draw-engine.js';
import { SLOT_CATALOG, enginePoolToUiCollection, HISTORY_EVENT_TYPES, TIER_ORDER } from './constants.js';
import { useFirstTimeFlags } from '../composables/useFirstTimeFlags.js';

// Lazy reference — triggers.js loads before App.vue wires Vue, so we don't
// invoke useFirstTimeFlags at module-eval time. We call it inside test()
// closures which fire at trigger-evaluation time (Vue is ready by then).
function flags() { return useFirstTimeFlags(); }

// ── Helpers для passive milestone test-функций ─────────────────────────────

// Был ли в prev пуст список received-слотов в UI-коллекции (A/B/C),
// и стал ли в next непустым? — true = это первая карточка коллекции.
function firstReceivedInUI(prev, next, uiLetter) {
  if (!prev || !next || !prev.collection || !next.collection) return false;
  const wasEmpty = !SLOT_CATALOG.some(s => {
    if (enginePoolToUiCollection(s.pool) !== uiLetter) return false;
    const e = prev.collection.prizes[s.slotId];
    return e && e.status === 'received';
  });
  const isNonEmpty = SLOT_CATALOG.some(s => {
    if (enginePoolToUiCollection(s.pool) !== uiLetter) return false;
    const e = next.collection.prizes[s.slotId];
    return e && e.status === 'received';
  });
  return wasEmpty && isNonEmpty;
}

// Подсчёт received-слотов в UI-коллекции — для crossedThreshold.
function countReceivedInUI(state, uiLetter) {
  if (!state || !state.collection) return 0;
  let n = 0;
  for (const s of SLOT_CATALOG) {
    if (enginePoolToUiCollection(s.pool) !== uiLetter) continue;
    const e = state.collection.prizes[s.slotId];
    if (e && e.status === 'received') n++;
  }
  return n;
}

// Пересечение порога: был ниже, стал >= threshold (хотя бы по одной из A/B/C).
function crossedThreshold(prev, next, threshold) {
  for (const L of ['A', 'B', 'C']) {
    const before = countReceivedInUI(prev, L);
    const after = countReceivedInUI(next, L);
    if (before < threshold && after >= threshold) return { uiLetter: L };
  }
  return false;
}

// Полная коллекция (без Gold) — все non-Gold слоты received.
function isCollectionFull(state, uiLetter) {
  if (!state || !state.collection) return false;
  const slots = SLOT_CATALOG.filter(s =>
    enginePoolToUiCollection(s.pool) === uiLetter && s.variant !== 'Gold'
  );
  if (slots.length === 0) return false;
  return slots.every(s => {
    const e = state.collection.prizes[s.slotId];
    return e && e.status === 'received';
  });
}

// Пересечение числового порога снизу — для charges_change.
// Не срабатывает при покупке (charges уменьшаются).
function crossedNumber(before, after, threshold) {
  return before < threshold && after >= threshold;
}

// ── NEW helpers for sub-phase (b) ─────────────────────────────────────────

// Подсчёт received-слотов одного TIER в коллекции (через TIER_ORDER, не UI-letter).
// Используется для tier_row_complete: «полный ряд одного тира собран».
function countReceivedByTier(state, tier) {
  if (!state || !state.collection) return { received: 0, total: 0 };
  let received = 0;
  let total = 0;
  for (const s of SLOT_CATALOG) {
    if (s.tier !== tier) continue;
    if (s.variant === 'Gold') continue; // Gold не считаем для row_complete
    total++;
    const e = state.collection.prizes[s.slotId];
    if (e && e.status === 'received') received++;
  }
  return { received, total };
}

// Tier row crossed from incomplete → complete на этом изменении?
function tierRowJustCompleted(prev, next, tier) {
  const before = countReceivedByTier(prev, tier);
  const after  = countReceivedByTier(next,  tier);
  if (after.total === 0) return false;
  return before.received < after.total && after.received >= after.total;
}

// First-ever received-слот любой коллекции (D5 — «приз попал в Корзину»).
function firstReceivedAny(prev, next) {
  if (!prev || !next || !prev.collection || !next.collection) return false;
  const wasEmpty = !SLOT_CATALOG.some(s => {
    const e = prev.collection.prizes[s.slotId];
    return e && e.status === 'received';
  });
  const isNonEmpty = SLOT_CATALOG.some(s => {
    const e = next.collection.prizes[s.slotId];
    return e && e.status === 'received';
  });
  return wasEmpty && isNonEmpty;
}

// Duplicate received: какой-нибудь slot впервые получил count >= 2 на этом
// изменении (был count<2 → стал count>=2). Используется one-shot per игрок.
function justGotDuplicate(prev, next) {
  if (!prev || !next || !prev.collection || !next.collection) return false;
  for (const s of SLOT_CATALOG) {
    const e0 = prev.collection.prizes[s.slotId];
    const e1 = next.collection.prizes[s.slotId];
    const before = e0?.count || 0;
    const after = e1?.count || 0;
    if (before < 2 && after >= 2) return true;
  }
  return false;
}

// ── near_tier пороги — из NUMBERS.md §3 (exchange-цены каталога).
//   Common=200, Rare=600, Epic=1800, Legendary=5000, UltraRare=20000.
//   Common — floor, без near-tier (никто не «приближается к Common»).
//   Window: balance ∈ [X-200, X) → «ещё ~одна коробка до X».
//   one-shot per tier через флаг near_tier:<tier_name>.
//
// NB: UltraRare (20000) пока недостижим в пилоте (нет UltraRare-призов в
//   SLOT_CATALOG), но entry готов — когда добавится тир, сработает.
const NEAR_TIER_THRESHOLDS = [
  { tier: 'rare',       X: 600,   tierLabel: 'Rare' },
  { tier: 'epic',       X: 1800,  tierLabel: 'Epic' },
  { tier: 'legendary',  X: 5000,  tierLabel: 'Legendary' },
  { tier: 'ultrarare',  X: 20000, tierLabel: 'UltraRare' },
];

// Балaнс зашёл в окно [X-200, X) на этом изменении.
// after < X — «правда близко», не проскочил насквозь.
function enteredNearTier(before, after, X) {
  return before < X - 200 && after >= X - 200 && after < X;
}

// Redemption fraction партии (0-1). Считаем по доле slot'ов status==='received'.
//   Источник числа — partitionState.slots (engine), не UI-collection.
//   Используется условно: H2 partition_almost_closed >= 0.80.
// Используется в этом файле через test'ы; partition_change event передаёт
// prev/next partitionState на сравнение.
function redemptionFraction(partitionState) {
  if (!partitionState?.slots?.length) return 0;
  const total = partitionState.slots.length;
  const opened = partitionState.slots.filter(s => s.status === 'opened').length;
  return opened / total;
}

// Сколько ячеек осталось до закрытия партии.
function slotsLeftToClose(partitionState) {
  if (!partitionState?.slots?.length) return 0;
  return partitionState.slots.filter(s => s.status !== 'opened').length;
}

// Tier из scan result. Для first_legendary — tier === 'Legendary'.
// Не >= потому что нет ordered comparison в JS на строках, и в pilot
// max tier = Legendary (см. TIER_ORDER). Когда добавится UR/Mythic —
// явно расширим тут.
function isLegendaryOrAbove(tier) {
  // Будущее: ['Legendary', 'UltraRare', 'Mythic'].includes(tier)
  return tier === 'Legendary';
}

// ── TRIGGER_CONFIG — 28 спека-триггеров + 1 catch-all (R2) ────────────────
// Спека: TRIGGER-SYSTEM-v3.md §4.

export const TRIGGER_CONFIG = [
  // === Action triggers — scan errors ===
  {
    id: 'scan_invalid_qr',
    when: 'scan_error',
    test: (e) => e.error === 'INVALID_QR',
    build: () => ({ kind: 'error', title: 'Неверный формат QR', detail: 'пример: ST-A-0027', icon: 'X' }),
    mascotPhrase: 'Хм, не похоже на код от коробки',
    mascotState: 'pondering' // v0.2: sleepy → pondering (SCENARIOS §13 Q3)
  },
  {
    id: 'scan_partition_closed',
    when: 'scan_error',
    test: (e) => e.error === 'PARTITION_CLOSED',
    build: () => ({ kind: 'error', title: 'Партия закрыта', detail: 'все коробки уже открыты', icon: 'X' }),
    mascotPhrase: 'Эта серия закончилась',
    mascotState: 'farewell'
  },
  {
    id: 'scan_already_used',
    when: 'scan_error',
    test: (e) => e.error === 'QR_ALREADY_USED' || e.error === 'QR_ALREADY_SCANNED',
    build: () => ({ kind: 'error', title: 'Этот QR уже использован', detail: 'каждая коробка открывается один раз', icon: 'X' }),
    mascotPhrase: 'Уже её открывали',
    mascotState: 'pondering' // v0.2: sleepy → pondering (SCENARIOS §13 Q3)
  },
  {
    // R2 catch-all для error-кодов из ERRORS enum, не покрытых первыми тремя.
    id: 'scan_other_error',
    when: 'scan_error',
    test: (e) => !['INVALID_QR', 'PARTITION_CLOSED', 'QR_ALREADY_USED', 'QR_ALREADY_SCANNED'].includes(e.error),
    build: (e) => ({ kind: 'error', title: 'Скан не прошёл', detail: e.errorMessage || e.error, icon: 'X' }),
    mascotPhrase: 'Что-то пошло не так',
    mascotState: 'pondering'
  },

  // === Action triggers — scan success ===
  {
    id: 'last_one_bonus',
    when: 'scan_success',
    test: (e) => e.result && e.result.wasLastOne === true,
    build: () => ({
      kind: 'success',
      title: 'Last One!',
      detail: 'последняя коробка партии',
      charges: DEFAULT_CONFIG.lastOneBonus,
      icon: 'Award'
    }),
    delay: 200,
    mascotPhrase: 'Воу! Это последняя!',
    mascotState: 'wow'
  },
  {
    id: 'pool_fallback',
    when: 'scan_success',
    test: (e) => e.result && e.result.wasPoolFallback === true,
    build: () => ({
      kind: 'info',
      title: 'Сила «Ключ» не сработала',
      detail: '2 карточки Ключа возвращены'
    }),
    // v0.2: убрано из mascot reactions (SCENARIOS §13 Q4). Только тех-лог + тост.
    mascotPhrase: null,
    mascotState: null
  },
  {
    id: 'gold_fallback',
    when: 'scan_success',
    test: (e) => e.result && e.result.wasGoldFallback === true,
    build: () => ({ kind: 'info', title: 'Золото уже разыграно в этой партии' }),
    // v0.2: убрано из mascot reactions (SCENARIOS §13 Q4). Только тех-лог + тост.
    mascotPhrase: null,
    mascotState: null
  },
  {
    id: 'sticker_dropped',
    when: 'scan_success',
    test: () => true, // каждый успешный scan = 1 стикер
    build: (e) => ({
      kind: 'info',
      title: 'Стикер +1',
      detail: e.stickerName || 'новый стикер',
      icon: 'Sparkles'
    }),
    priority: 'low',
    mascotPhrase: null, // стикер — рутина, маскот молчит
    mascotState: null
  },

  // === Action triggers — take / exchange / purchase ===
  {
    id: 'take_done',
    when: 'take',
    test: () => true,
    build: (e) => ({
      kind: 'success',
      title: 'Подарок забран',
      detail: e.giftName || 'добавлен в коллекцию',
      icon: 'Check'
    }),
    mascotPhrase: 'Положу в твою корзину',
    mascotState: 'charge-up'
  },
  {
    id: 'exchange_done',
    when: 'exchange',
    test: () => true,
    build: (e) => ({
      kind: 'success',
      title: 'Обмен зачислен',
      detail: e.giftName || 'подарок обменян',
      charges: e.exchangePrice,
      icon: 'RefreshCw'
    }),
    mascotPhrase: 'Заряды на счету!',
    mascotState: 'farewell'
  },
  {
    id: 'spark_credited',
    when: 'exchange',
    // v0.2: рутина fire'ит только ПОСЛЕ first-time teaching entry (см. first_spark_seen).
    //   Первый spark выдаёт фразу-учитель через отдельный entry ниже, ставит флаг.
    //   Этот entry — рутинная фраза для последующих spark-событий.
    test: (e) => e.sparkFired === true && flags().hasSeenFlag('first_spark_seen'),
    build: () => ({
      kind: 'success',
      title: 'Искра',
      detail: 'мгновенный бонус',
      charges: SPARK_CONFIG.bonusCharges,
      icon: 'Flame'
    }),
    delay: 200,
    mascotPhrase: 'Бонус сверху!',
    mascotState: 'proud'
  },
  {
    id: 'card_credited',
    // v0.2: выделено из 'exchange' в отдельный event 'card_credited'.
    //   App.vue эмитит этот event после handleExchange когда cardFound !== 'none'.
    //   Рутина fire'ит ТОЛЬКО ПОСЛЕ first-time teaching entry (first_card_<type>).
    when: 'card_credited',
    test: (e) => {
      if (!e.cardFound || e.cardFound === 'none') return false;
      // Первая карта данного типа — отдельный entry-учитель ниже. Рутина после.
      return flags().hasSeenFlag(`first_card_${e.cardFound}`);
    },
    build: (e) => ({
      kind: 'success',
      title: 'Карта силы',
      detail: (e.cardLabel || e.cardFound) + ' +1',
      icon: 'Sparkles'
    }),
    delay: 400,
    mascotPhrase: 'И ещё карта силы!',
    mascotState: 'proud'
  },
  {
    id: 'purchase_done',
    when: 'purchase',
    test: () => true,
    build: (e) => ({
      kind: 'success',
      title: 'Подарок ваш',
      detail: e.giftName,
      charges: -(e.buyPrice || 0),
      icon: 'Check'
    }),
    mascotPhrase: 'В корзину!',
    mascotState: 'charge-up'
  },
  {
    id: 'power_activated',
    when: 'power_activate',
    // v0.2: рутина fire'ит ТОЛЬКО ПОСЛЕ first-time activation entry per type.
    test: (e) => flags().hasSeenFlag(`first_activate_${e.cardType}`),
    build: (e) => ({
      kind: 'success',
      title: (e.cardLabel || e.cardType) + ' активирована',
      detail: 'сила сработает на следующем скане',
      icon: 'Sparkles'
    }),
    mascotPhrase: 'Готово, ловлю момент',
    mascotState: 'smug-wink'
  },

  // === Passive milestones — collection ===
  {
    id: 'first_in_collection_A',
    when: 'collection_change',
    test: (e, prev, next) => firstReceivedInUI(prev, next, 'A'),
    build: () => ({
      kind: 'success',
      title: 'Первая в топ-коллекции A!',
      detail: 'продолжай собирать',
      icon: 'Award'
    }),
    delay: 600,
    mascotPhrase: 'Первая в топ-коллекции!',
    mascotState: 'delight'
  },
  {
    id: 'first_in_collection_B',
    when: 'collection_change',
    test: (e, prev, next) => firstReceivedInUI(prev, next, 'B'),
    build: () => ({
      kind: 'success',
      title: 'Первая в коллекции B',
      detail: 'продолжай собирать',
      icon: 'Award'
    }),
    delay: 600,
    mascotPhrase: 'Первая в B!',
    mascotState: 'delight'
  },
  {
    id: 'first_in_collection_C',
    when: 'collection_change',
    test: (e, prev, next) => firstReceivedInUI(prev, next, 'C'),
    build: () => ({
      kind: 'success',
      title: 'Первая в коллекции C',
      detail: 'продолжай собирать',
      icon: 'Award'
    }),
    delay: 600,
    mascotPhrase: 'Первая в C!',
    mascotState: 'delight'
  },
  {
    id: 'collection_5',
    when: 'collection_change',
    test: (e, prev, next) => crossedThreshold(prev, next, 5),
    build: (e, prev, next) => {
      const m = crossedThreshold(prev, next, 5);
      return {
        kind: 'success',
        title: '5 в коллекции ' + (m ? m.uiLetter : ''),
        icon: 'Award'
      };
    },
    delay: 600,
    mascotPhrase: 'Уже пятёрка!',
    mascotState: 'delight'
  },
  {
    id: 'collection_10',
    when: 'collection_change',
    test: (e, prev, next) => crossedThreshold(prev, next, 10),
    build: (e, prev, next) => {
      const m = crossedThreshold(prev, next, 10);
      return {
        kind: 'success',
        title: '10 в коллекции ' + (m ? m.uiLetter : ''),
        icon: 'Award'
      };
    },
    delay: 600,
    mascotPhrase: 'Десятка собрана!',
    mascotState: 'delight'
  },
  {
    id: 'collection_15',
    when: 'collection_change',
    test: (e, prev, next) => crossedThreshold(prev, next, 15),
    build: (e, prev, next) => {
      const m = crossedThreshold(prev, next, 15);
      return {
        kind: 'success',
        title: '15 в коллекции ' + (m ? m.uiLetter : ''),
        icon: 'Award'
      };
    },
    delay: 600,
    mascotPhrase: 'Уже 15!',
    mascotState: 'delight'
  },
  {
    id: 'collection_full',
    when: 'collection_change',
    test: (e, prev, next) => {
      for (const L of ['A', 'B', 'C']) {
        if (!isCollectionFull(prev, L) && isCollectionFull(next, L)) {
          return { uiLetter: L };
        }
      }
      return false;
    },
    build: (e, prev, next) => {
      let L = 'A';
      for (const lt of ['A', 'B', 'C']) {
        if (!isCollectionFull(prev, lt) && isCollectionFull(next, lt)) { L = lt; break; }
      }
      return {
        kind: 'success',
        title: 'Коллекция ' + L + ' собрана!',
        detail: 'остался только Gold',
        icon: 'Award'
      };
    },
    delay: 800,
    mascotPhrase: 'Полная коллекция!',
    mascotState: 'wow'
  },

  // === Passive milestones — scan count ===
  {
    id: 'scan_1',
    when: 'scan_count_change',
    test: (e, prev, next) => prev.scannedCount === 0 && next.scannedCount >= 1,
    build: () => ({ kind: 'success', title: 'Первая коробка!', icon: 'Package' }),
    delay: 400,
    mascotPhrase: 'Поехали!',
    mascotState: 'wow'
  },
  {
    id: 'scan_10',
    when: 'scan_count_change',
    test: (e, prev, next) => prev.scannedCount < 10 && next.scannedCount >= 10,
    build: () => ({ kind: 'success', title: '10-я коробка!', icon: 'Package' }),
    delay: 400,
    mascotPhrase: 'Десять подряд!',
    mascotState: 'proud'
  },
  {
    id: 'scan_50',
    when: 'scan_count_change',
    test: (e, prev, next) => prev.scannedCount < 50 && next.scannedCount >= 50,
    build: () => ({ kind: 'success', title: '50-я коробка!', icon: 'Package' }),
    delay: 400,
    mascotPhrase: 'Полтинник!',
    mascotState: 'proud'
  },
  {
    id: 'scan_100',
    when: 'scan_count_change',
    test: (e, prev, next) => prev.scannedCount < 100 && next.scannedCount >= 100,
    build: () => ({ kind: 'success', title: '100-я коробка!', icon: 'Package' }),
    delay: 400,
    mascotPhrase: 'Сотка! Респект!',
    mascotState: 'wow'
  },

  // === Passive milestones — charges ===
  {
    id: 'charges_1k',
    when: 'charges_change',
    // v0.2 migration: charges НЕ монотонны (purchase уменьшает) → crossedNumber
    //   pattern мог сработать многократно после трат и повторного накопления.
    //   markFlag-driven теперь — one-shot гарантирован за всю lifetime игрока.
    test: (e, prev, next) => crossedNumber(prev.charges, next.charges, 1000)
                              && !flags().hasSeenFlag('charges_1k_done'),
    build: () => ({ kind: 'success', title: '1 000⚡ накоплено!', icon: 'Zap' }),
    delay: 800,
    // (c) phrase via TAMA_PHRASES.charges_1k — reformulated per owner remark 6
    //   ("накопил X за всё время" вместо "текущий баланс").
    mascotState: 'proud',
    markFlag: 'charges_1k_done'
  },
  {
    id: 'charges_5k',
    when: 'charges_change',
    test: (e, prev, next) => crossedNumber(prev.charges, next.charges, 5000)
                              && !flags().hasSeenFlag('charges_5k_done'),
    build: () => ({ kind: 'success', title: '5 000⚡ накоплено!', icon: 'Zap' }),
    delay: 800,
    // (c) phrase via TAMA_PHRASES.charges_5k
    mascotState: 'proud',
    markFlag: 'charges_5k_done'
  },
  {
    id: 'charges_10k',
    when: 'charges_change',
    test: (e, prev, next) => crossedNumber(prev.charges, next.charges, 10000)
                              && !flags().hasSeenFlag('charges_10k_done'),
    build: () => ({ kind: 'success', title: '10 000⚡ накоплено!', icon: 'Zap' }),
    delay: 800,
    // (c) phrase via TAMA_PHRASES.charges_10k
    mascotState: 'wow',
    markFlag: 'charges_10k_done'
  },

  // === Passive — partition lifecycle ===
  {
    id: 'partition_closed',
    when: 'partition_change',
    test: (e, prev, next) =>
      prev.partition.status !== 'closed' && next.partition.status === 'closed',
    build: () => ({
      kind: 'info',
      title: 'Партия закрыта',
      detail: 'server_seed раскрыт — проверь честность',
      icon: 'Lock'
    }),
    delay: 400,
    mascotPhrase: 'Сезон закончен. Раскрываем зерно',
    mascotState: 'farewell'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // === NEW ENTRIES — Phase β.1 (sub-phase b) ============================
  // SCENARIOS §4 § A-K. Все one-shot через markFlag → useFirstTimeFlags.
  // Phrase в этих entries — single explicit string на (b). В (c) добавится
  // TAMA_PHRASES[trigger_id] с 3-5 фразами + {vars}; fireTriggersWithMascot
  // будет передавать phraseKey/vars. На этапе (b) фразы static.
  // ═══════════════════════════════════════════════════════════════════════

  // ── A. SCANNER — first-time teaching entries ────────────────────────────

  // A3 — First Legendary (P1, фраза-учитель про Pool C)
  {
    id: 'first_legendary',
    when: 'scan_success',
    test: (e) => e.result && isLegendaryOrAbove(e.result.tier)
                  && !flags().hasSeenFlag('first_legendary'),
    build: () => ({
      kind: 'success',
      title: 'Legendary',
      detail: 'только в Pool C — 5% коробок',
      icon: 'Award'
    }),
    delay: 300,
    mascotPhrase: 'Legendary. Они только в Pool C — 5% коробок.',
    mascotState: 'charge-up',
    markFlag: 'first_legendary'
  },

  // A12 (teacher) — First Spark. Существующий spark_credited теперь рутина.
  {
    id: 'first_spark',
    when: 'exchange',
    test: (e) => e.sparkFired === true && !flags().hasSeenFlag('first_spark_seen'),
    build: () => ({
      kind: 'success',
      title: 'Искра — мини-приз',
      detail: 'мелкий бонус мимо каталога',
      charges: SPARK_CONFIG.bonusCharges,
      icon: 'Flame'
    }),
    delay: 200,
    mascotPhrase: 'Искра. Это мелочи сверху обмена, не каталог.',
    mascotState: 'proud',
    markFlag: 'first_spark_seen'
  },

  // A13/A14/A15 — first карта силы по типам. Event card_credited.
  {
    id: 'first_card_luck',
    when: 'card_credited',
    test: (e) => e.cardFound === 'luck' && !flags().hasSeenFlag('first_card_luck'),
    build: (e) => ({
      kind: 'success',
      title: 'Первая карта Везения',
      detail: 'собери ещё ' + ((e.cardsNeed || 3) - 1) + ' — активируй ×2 Rare',
      icon: 'Sparkles'
    }),
    delay: 400,
    // (c) phrase auto-picked from TAMA_PHRASES.first_card_luck with these vars
    vars: (e) => ({
      power_name: 'Везения',
      cards_have: 1,
      cards_need: (e.cardsNeed || 3) - 1,
    }),
    mascotState: 'delight',
    markFlag: 'first_card_luck'
  },
  {
    id: 'first_card_double',
    when: 'card_credited',
    test: (e) => e.cardFound === 'double' && !flags().hasSeenFlag('first_card_double'),
    build: (e) => ({
      kind: 'success',
      title: 'Первая карта Двойки',
      detail: 'собери ещё ' + ((e.cardsNeed || 3) - 1) + ' — активируй ×2 зарядов',
      icon: 'Sparkles'
    }),
    delay: 400,
    vars: (e) => ({
      power_name: 'Двойки',
      cards_have: 1,
      cards_need: (e.cardsNeed || 3) - 1,
    }),
    mascotState: 'delight',
    markFlag: 'first_card_double'
  },
  {
    id: 'first_card_key',
    when: 'card_credited',
    // В useCards.js cardType для Ключа = 'keys'. cardFound из reveal.cardFound,
    // следует та же конвенция. Маппинг проверяется в App.vue handleExchange.
    test: (e) => (e.cardFound === 'keys' || e.cardFound === 'key')
                  && !flags().hasSeenFlag('first_card_key'),
    build: (e) => ({
      kind: 'success',
      title: 'Первая карта Ключа',
      detail: 'собери ещё ' + ((e.cardsNeed || 3) - 1) + ' — гарантия Pool C',
      icon: 'Sparkles'
    }),
    delay: 400,
    vars: (e) => ({
      power_name: 'Ключа',
      cards_have: 1,
      cards_need: (e.cardsNeed || 3) - 1,
    }),
    mascotState: 'delight',
    markFlag: 'first_card_key'
  },

  // ── C. COLLECTION — tier rows, duplicates, first-visit ──────────────────

  // C8 — Tier row complete. По одному entry на тир (читаемо в DebugPanel).
  // В пилоте TIER_ORDER = JUNK/Common/Rare/Epic/Legendary. JUNK не считаем.
  {
    id: 'tier_row_complete_common',
    when: 'collection_change',
    test: (e, prev, next) => tierRowJustCompleted(prev, next, 'Common')
                              && !flags().hasSeenFlag('tier_row_complete:common'),
    build: () => ({ kind: 'success', title: 'Ряд Common закрыт', icon: 'Award' }),
    delay: 600,
    mascotPhrase: 'Ряд Common закрыт.',
    mascotState: 'proud',
    markFlag: 'tier_row_complete:common'
  },
  {
    id: 'tier_row_complete_rare',
    when: 'collection_change',
    test: (e, prev, next) => tierRowJustCompleted(prev, next, 'Rare')
                              && !flags().hasSeenFlag('tier_row_complete:rare'),
    build: () => ({ kind: 'success', title: 'Ряд Rare закрыт', icon: 'Award' }),
    delay: 600,
    mascotPhrase: 'Rare ряд закрыт. Уже не каждый собирает.',
    mascotState: 'proud',
    markFlag: 'tier_row_complete:rare'
  },
  {
    id: 'tier_row_complete_epic',
    when: 'collection_change',
    test: (e, prev, next) => tierRowJustCompleted(prev, next, 'Epic')
                              && !flags().hasSeenFlag('tier_row_complete:epic'),
    build: () => ({ kind: 'success', title: 'Ряд Epic закрыт', icon: 'Award' }),
    delay: 600,
    mascotPhrase: 'Epic ряд. Это уровень.',
    mascotState: 'proud',
    markFlag: 'tier_row_complete:epic'
  },
  {
    id: 'tier_row_complete_legendary',
    when: 'collection_change',
    test: (e, prev, next) => tierRowJustCompleted(prev, next, 'Legendary')
                              && !flags().hasSeenFlag('tier_row_complete:legendary'),
    build: () => ({ kind: 'success', title: 'Ряд Legendary закрыт', icon: 'Award' }),
    delay: 600,
    mascotPhrase: 'Legendary ряд. Серьёзно.',
    mascotState: 'wow',
    markFlag: 'tier_row_complete:legendary'
  },

  // C9 — Duplicate received (first time only, P3 но кодим — фраза-учитель про обмен)
  {
    id: 'duplicate_received',
    when: 'collection_change',
    test: (e, prev, next) => justGotDuplicate(prev, next)
                              && !flags().hasSeenFlag('duplicate_received'),
    build: () => ({
      kind: 'info',
      title: 'Дубль приза',
      detail: 'обменяй на заряды или оставь в коллекции',
      icon: 'RefreshCw'
    }),
    delay: 500,
    mascotPhrase: 'Уже такой есть. Обменяй на заряды — норм.',
    mascotState: 'pondering',
    markFlag: 'duplicate_received'
  },

  // C10 — Collection-таб first visit. Event screen_visit от App.vue.
  {
    id: 'collection_first_visit',
    when: 'screen_visit',
    test: (e) => e.screen === 'collection' && !flags().hasSeenFlag('collection_first_visit'),
    build: () => ({
      kind: 'info',
      title: 'Твоя коллекция',
      detail: 'тап по призу — детали',
      icon: 'Award'
    }),
    mascotPhrase: 'Здесь твоя коллекция. Tap по призу — детали.',
    mascotState: 'big-eyes',
    markFlag: 'collection_first_visit'
  },

  // ── D. CART — first received, claim flow, first-visit ───────────────────

  // D1 — Cart-таб first visit. trigger_id = cart_first_visit (SCENARIOS user-
  //   facing concept «Корзина»), но wiring в App.vue смотрит на activeTab === 'gifts'
  //   (текущий tab-id, см. TabBar.vue). Mismatch намеренный — наследие нейминга.
  {
    id: 'cart_first_visit',
    when: 'screen_visit',
    test: (e) => e.screen === 'gifts' && !flags().hasSeenFlag('cart_first_visit'),
    build: () => ({
      kind: 'info',
      title: 'Каталог обмена',
      detail: 'Common 200 / Epic 1800 / Legendary 5000',
      icon: 'ShoppingBasket'
    }),
    mascotPhrase: 'Common 200, Epic 1800, Legendary 5000. Обменивай заряды на призы.',
    mascotState: 'big-eyes',
    markFlag: 'cart_first_visit'
  },

  // D2/D3/D4 — Claim modal flow. Event gift_action.
  //   P2 — рутина, без markFlag.
  {
    id: 'claim_open',
    when: 'gift_action',
    test: (e) => e.action === 'claim_open',
    build: () => null, // toast suppressed; маскот говорит, тоста нет
    mascotPhrase: 'Покажи код на стойке партнёра.',
    mascotState: 'pondering'
  },
  {
    id: 'claim_done',
    when: 'gift_action',
    test: (e) => e.action === 'claim_done',
    build: (e) => ({
      kind: 'success',
      title: 'Приз получен',
      detail: e.giftName || '',
      icon: 'Check'
    }),
    mascotPhrase: 'Приз твой. Ещё что-то?',
    mascotState: 'proud'
  },
  {
    id: 'return_done',
    when: 'gift_action',
    test: (e) => e.action === 'return_done',
    build: (e) => ({
      kind: 'success',
      title: 'Возвращён в заряды',
      detail: e.giftName || '',
      charges: e.refund || 0,
      icon: 'RefreshCw'
    }),
    vars: (e) => ({ amount: e.refund || 0, gift_name: e.giftName || '' }),
    mascotState: 'farewell'
  },

  // D5 — First-ever received prize (любой pool)
  {
    id: 'first_received',
    when: 'collection_change',
    test: (e, prev, next) => firstReceivedAny(prev, next)
                              && !flags().hasSeenFlag('first_received'),
    build: () => ({
      kind: 'success',
      title: 'Первый приз в Корзине',
      detail: 'tap чтобы получить код выдачи',
      icon: 'ShoppingBasket'
    }),
    delay: 500,
    mascotPhrase: 'В Корзине ждут призы. Tap чтобы получить код выдачи.',
    mascotState: 'delight',
    markFlag: 'first_received'
  },

  // ── E. POWERS — first activations, errors, first-visit ──────────────────

  // E1 — First activation per power. Existing power_activate event.
  {
    id: 'first_activate_luck',
    when: 'power_activate',
    test: (e) => e.cardType === 'luck' && !flags().hasSeenFlag('first_activate_luck'),
    build: (e) => ({
      kind: 'success',
      title: 'Везение активировано',
      detail: '×2 шанс Rare на следующем скане',
      icon: 'Sparkles'
    }),
    mascotPhrase: 'Везение активировано. ×2 шанс Rare на следующем скане.',
    mascotState: 'smug-wink',
    markFlag: 'first_activate_luck'
  },
  {
    id: 'first_activate_double',
    when: 'power_activate',
    test: (e) => e.cardType === 'double' && !flags().hasSeenFlag('first_activate_double'),
    build: (e) => ({
      kind: 'success',
      title: 'Двойка активирована',
      detail: '×2 заряды на следующем скане',
      icon: 'Sparkles'
    }),
    mascotPhrase: 'Двойка. На следующем скане заряды удвоятся.',
    mascotState: 'smug-wink',
    markFlag: 'first_activate_double'
  },
  {
    id: 'first_activate_key',
    when: 'power_activate',
    test: (e) => (e.cardType === 'keys' || e.cardType === 'key')
                  && !flags().hasSeenFlag('first_activate_key'),
    build: (e) => ({
      kind: 'success',
      title: 'Ключ Хокинса активирован',
      detail: 'гарантия Pool C на следующем скане',
      icon: 'Key'
    }),
    mascotPhrase: 'Ключ. Следующий скан — гарантия Pool C.',
    mascotState: 'smug-wink',
    markFlag: 'first_activate_key'
  },

  // E3 — Power triggered on scan. Event power_triggered.
  //   Эмитится App.vue handleScan когда effectsSnapshot имел active power.
  //   Не one-shot (всякий раз когда сила фактически отработала).
  {
    id: 'power_triggered',
    when: 'power_triggered',
    test: () => true,
    build: (e) => ({
      kind: 'info',
      title: (e.cardLabel || e.cardType) + ' сработала',
      detail: e.effectText || 'эффект применён',
      icon: 'Sparkles'
    }),
    delay: 200,
    vars: (e) => ({ power_name: e.cardLabel || e.cardType || 'Сила' }),
    mascotState: 'surprised'
  },

  // E4/E5 — Power activate attempt errors. Event power_activate_attempt.
  {
    id: 'power_insufficient',
    when: 'power_activate_attempt',
    test: (e) => e.reason === 'insufficient',
    build: (e) => ({
      kind: 'error',
      title: 'Недостаточно карт',
      detail: 'нужно ' + (e.cardsNeed || 3) + ', сейчас ' + (e.cardsHave || 0),
      icon: 'X'
    }),
    vars: (e) => ({
      cards_need: e.cardsNeed || 3,
      cards_have: e.cardsHave || 0,
      power_name: e.cardLabel || e.cardType || 'Сила',
    }),
    mascotState: 'pondering'
  },
  {
    id: 'power_already_active',
    when: 'power_activate_attempt',
    test: (e) => e.reason === 'already_active',
    build: () => ({
      kind: 'info',
      title: 'Сила уже активна',
      detail: 'сработает на следующем скане',
    }),
    mascotPhrase: 'Уже активирована. Сработает на следующем скане.',
    mascotState: 'pondering'
  },

  // E7 — Powers-таб first visit
  {
    id: 'powers_first_visit',
    when: 'screen_visit',
    test: (e) => e.screen === 'powers' && !flags().hasSeenFlag('powers_first_visit'),
    build: () => ({
      kind: 'info',
      title: 'Три силы',
      detail: 'Везение ×2 Rare · Двойка ×2 зарядов · Ключ → Pool C',
      icon: 'Zap'
    }),
    mascotPhrase: 'Три силы. Везение ×2 Rare, Двойка ×2 зарядов, Ключ — Pool C.',
    mascotState: 'big-eyes',
    markFlag: 'powers_first_visit'
  },

  // ── F. CHARGES — zero balance, near-tier, expiry stub ───────────────────

  // F4 — Balance at zero after spending (P3, deadpan)
  {
    id: 'charges_zero',
    when: 'charges_change',
    test: (e, prev, next) => prev.charges > 0 && next.charges === 0,
    build: () => ({
      kind: 'info',
      title: 'Счёт пуст',
      detail: 'время сканировать',
    }),
    mascotPhrase: 'Счёт пуст. Время сканировать.',
    mascotState: 'sleepy'
  },

  // F5 — near-tier per threshold from NUMBERS.md §3. Per-tier one-shot.
  ...NEAR_TIER_THRESHOLDS.map(({ tier, X, tierLabel }) => ({
    id: 'near_tier_' + tier,
    when: 'charges_change',
    test: (e, prev, next) => enteredNearTier(prev.charges, next.charges, X)
                              && !flags().hasSeenFlag('near_tier:' + tier),
    build: (e, prev, next) => ({
      kind: 'info',
      title: 'Близко к ' + tierLabel,
      detail: 'ещё ' + (X - next.charges) + '⚡',
      icon: 'Zap'
    }),
    delay: 700,
    vars: (e, prev, next) => ({
      tier_name: tierLabel,
      next_tier_gap: X - next.charges,
    }),
    mascotState: 'charge-up',
    markFlag: 'near_tier:' + tier,
  })),

  // F6 — Expiry warning (STUB).
  // TODO: requires charge-expiry tracking — backlog.
  //   В TRIGGER_CONFIG entry присутствует, но test() гарантированно false
  //   в runtime (нет event 'expiry_check' источник). Доступен через
  //   DebugPanel «Симулировать» — debug может вручную эмитить событие.
  {
    id: 'expiry_warning',
    when: 'expiry_check',
    test: (e) => Boolean(e && e.daysLeft <= 30 && e.amount > 0)
                  && !flags().hasSeenFlag('expiry_warning'),
    build: (e) => ({
      kind: 'info',
      title: 'Скоро сгорят заряды',
      detail: 'через ' + (e.daysLeft || 30) + ' дн.: ' + (e.amount || 0) + '⚡',
      icon: 'Zap'
    }),
    vars: (e) => ({
      days_away: e?.daysLeft || 30,
      amount: e?.amount || 0,
    }),
    mascotState: 'pondering',
    markFlag: 'expiry_warning'
  },

  // ── G. SCAN STREAK ──────────────────────────────────────────────────────

  // G5 — 3+ сканов за 30 мин сессии. e.sessionStreak считается в App.vue.
  //   per-session (не persist'ится — счётчик в-памяти).
  {
    id: 'session_streak_3',
    when: 'scan_success',
    test: (e) => (e.sessionStreak || 0) >= 3 && e.sessionStreakFiredThisSession !== true,
    // session-once: App.vue устанавливает sessionStreakFiredThisSession после fire
    build: () => ({
      kind: 'info',
      title: 'Стрик 3+',
      detail: 'третий подряд за 30 мин',
      icon: 'Flame'
    }),
    delay: 300,
    mascotPhrase: 'Третий подряд. Удача любит горячих.',
    mascotState: 'charge-up'
  },

  // ── H. PARTITION / SERIES ───────────────────────────────────────────────

  // H3 — New series открылась. Event series_change. Per-series-id one-shot
  //   через markFlag 'new_series:<series_id>' (динамический, prefix-match).
  //   markFlag — функция (fireTriggersWithMascot должна это поддержать).
  {
    id: 'new_series',
    when: 'series_change',
    test: (e) => e.kind === 'first_seen' && Boolean(e.seriesId)
                  && !flags().hasSeenFlag('new_series:' + e.seriesId),
    build: (e) => ({
      kind: 'info',
      title: 'Новая серия',
      detail: e.seriesName || e.seriesId,
      icon: 'Package'
    }),
    vars: (e) => ({ ip_name: e.seriesName || e.seriesId || '' }),
    mascotState: 'wave',
    markFlag: (e) => 'new_series:' + e.seriesId
  },

  // H2 — partition_almost_closed: AGENDA-only (sub-phase d). НЕ кладём в TRIGGER_CONFIG.

  // ── I. LIFECYCLE: return_short/long/dormant — AGENDA only (sub-phase d) ──

  // ── K. NAVIGATION / META ────────────────────────────────────────────────

  // K1 — Profile (Stats overlay) first visit
  {
    id: 'profile_first_visit',
    when: 'screen_visit',
    test: (e) => e.screen === 'profile' && !flags().hasSeenFlag('profile_first_visit'),
    build: () => ({
      kind: 'info',
      title: 'Профиль',
      detail: 'статистика и история',
      icon: 'Info'
    }),
    mascotPhrase: 'Тут статистика и история.',
    mascotState: 'big-eyes',
    markFlag: 'profile_first_visit'
  },

  // K3 — Series switched (рутина, не one-shot — каждый switch fire'ит)
  {
    id: 'series_switched',
    when: 'series_change',
    test: (e) => e.kind === 'switched',
    build: (e) => ({
      kind: 'info',
      title: 'Серия: ' + (e.seriesName || e.seriesId),
      icon: 'Package'
    }),
    vars: (e) => ({ ip_name: e.seriesName || e.seriesId || '' }),
    mascotState: 'wave'
  }
];

// ── TRIGGER_OVERRIDES — runtime отключение отдельных триггеров если станут noisy
// Формат: { trigger_id: false } — отключает.
export const TRIGGER_OVERRIDES = {
  // Пример: 'sticker_dropped': false
};

// ── evaluateTriggers — main entry, чистая функция, без side effects.
export function evaluateTriggers(eventType, eventData, prevState, nextState) {
  const out = [];
  for (const trig of TRIGGER_CONFIG) {
    if (trig.when !== eventType) continue;
    if (TRIGGER_OVERRIDES[trig.id] === false) continue;
    let match = false;
    try {
      match = trig.test(eventData, prevState, nextState);
    } catch (err) {
      console.warn('[trigger]', trig.id, 'test threw:', err);
      match = false;
    }
    if (match) {
      try {
        const cfg = trig.build(eventData, prevState, nextState);
        // cfg может быть null — это «маскот говорит, тоста нет» (см. claim_open).
        // Всё равно пропускаем дальше — fireTriggersWithMascot читает mascotState,
        // даже если toast cfg отсутствует.
        // markFlag — string или function(eventData). Резолвим к строке здесь.
        let resolvedFlag = null;
        if (typeof trig.markFlag === 'function') {
          try { resolvedFlag = trig.markFlag(eventData, prevState, nextState); }
          catch (err) { console.warn('[trigger]', trig.id, 'markFlag fn threw:', err); }
        } else if (typeof trig.markFlag === 'string') {
          resolvedFlag = trig.markFlag;
        }
        // Phase β.1 (sub-phase c): vars — static object OR function(event, prev, next).
        //   Resolved here so the rest of the pipeline (fireTriggersWithMascot →
        //   tama.trigger → randomPhrase) gets a plain object for interpolation.
        let resolvedVars = {};
        if (typeof trig.vars === 'function') {
          try { resolvedVars = trig.vars(eventData, prevState, nextState) || {}; }
          catch (err) { console.warn('[trigger]', trig.id, 'vars fn threw:', err); }
        } else if (trig.vars && typeof trig.vars === 'object') {
          resolvedVars = trig.vars;
        }
        out.push({
          ...(cfg || {}),
          __triggerId: trig.id,
          __delay: trig.delay,
          __mascotPhrase: trig.mascotPhrase,
          __mascotState: trig.mascotState,
          __markFlag: resolvedFlag,
          __suppressToast: cfg === null, // claim_open и подобные — без тоста
          // Phase β.1 (sub-phase c): phraseKey defaults to trig.id so any
          //   TAMA_PHRASES[trig.id] bank auto-overrides the state-default
          //   without per-entry config. trig.phraseKey explicit override
          //   for the rare case where two trigger IDs share a phrase bank.
          __phraseKey: trig.phraseKey || trig.id,
          __vars: resolvedVars,
        });
      } catch (err) {
        console.warn('[trigger]', trig.id, 'build threw:', err);
      }
    }
  }
  return out;
}

// ── fireTriggers — dispatch массива через pushToast с учётом delay.
// Vue-version: icon передаётся в pushToast как ИМЯ-СТРОКА.
// ToastStack.vue резолвит имя в lucide-vue-next компонент.
// Маскот пока игнорируется (Фаза 4).
// __suppressToast=true (см. claim_open) — пропускаем toast, но keep activity-log
// сохраняем mascot path в fireTriggersWithMascot.
export function fireTriggers(triggers, pushToastFn, pushActivityFn) {
  for (const t of triggers) {
    if (t.__suppressToast) continue;
    if (!t.title) continue; // safety: ничего не показываем без title
    const toast = {
      kind: t.kind,
      title: t.title,
      detail: t.detail,
      charges: t.charges,
      icon: t.icon // string name, resolved in ToastStack.vue
    };
    if (t.__delay) {
      setTimeout(() => pushToastFn(toast), t.__delay);
    } else {
      pushToastFn(toast);
    }
    // Журнал активностей: логируем trigger-тосты в history.
    if (pushActivityFn && t.kind !== 'error') {
      pushActivityFn({
        type: HISTORY_EVENT_TYPES.ACTIVITY,
        ts: new Date().toISOString(),
        title: t.title,
        detail: t.detail || '',
        triggerId: t.__triggerId || ''
      });
    }
  }
}
