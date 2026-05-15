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
import { SLOT_CATALOG, enginePoolToUiCollection, HISTORY_EVENT_TYPES } from './constants.js';

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
    mascotState: 'sleepy'
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
    mascotState: 'sleepy'
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
    mascotPhrase: 'Топ-коллекция уже пуста',
    mascotState: 'pondering'
  },
  {
    id: 'gold_fallback',
    when: 'scan_success',
    test: (e) => e.result && e.result.wasGoldFallback === true,
    build: () => ({ kind: 'info', title: 'Золото уже разыграно в этой партии' }),
    mascotPhrase: 'Эксклюзив этой партии нашли',
    mascotState: 'pondering'
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
    test: (e) => e.sparkFired === true,
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
    when: 'exchange',
    test: (e) => e.cardFound && e.cardFound !== 'none',
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
    test: () => true,
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
    test: (e, prev, next) => crossedNumber(prev.charges, next.charges, 1000),
    build: () => ({ kind: 'success', title: '1 000⚡ накоплено!', icon: 'Zap' }),
    delay: 800,
    mascotPhrase: 'Тысяча зарядов!',
    mascotState: 'proud'
  },
  {
    id: 'charges_5k',
    when: 'charges_change',
    test: (e, prev, next) => crossedNumber(prev.charges, next.charges, 5000),
    build: () => ({ kind: 'success', title: '5 000⚡ накоплено!', icon: 'Zap' }),
    delay: 800,
    mascotPhrase: 'Пять тысяч! Можно крутые подарки!',
    mascotState: 'proud'
  },
  {
    id: 'charges_10k',
    when: 'charges_change',
    test: (e, prev, next) => crossedNumber(prev.charges, next.charges, 10000),
    build: () => ({ kind: 'success', title: '10 000⚡ накоплено!', icon: 'Zap' }),
    delay: 800,
    mascotPhrase: '10 000! Открыты все варианты!',
    mascotState: 'wow'
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
        if (cfg) {
          out.push({
            ...cfg,
            __triggerId: trig.id,
            __delay: trig.delay,
            __mascotPhrase: trig.mascotPhrase,
            __mascotState: trig.mascotState
          });
        }
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
export function fireTriggers(triggers, pushToastFn, pushActivityFn) {
  for (const t of triggers) {
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
