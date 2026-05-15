// ═══════════════════════════════════════════════════════════════════════════
// State helpers — pure functions for building & updating partition/series state.
// Copy-paste 1:1 from PrizeEnginePWA.jsx (476-602), converted to ES modules.
// These live in engine/ (not composables/) because they are pure JS without
// Vue API — used both by composables AND by Operator Console / tests.
// ═══════════════════════════════════════════════════════════════════════════

import {
  SLOT_CATALOG,
  STICKER_CATALOG,
  CARD_INITIAL_COUNTS,
  TIER_ORDER,
} from './constants.js';
import { sha256Bytes, utf8Bytes } from './sha256.js';
import { DEFAULT_CONFIG } from './draw-engine.js';

export function buildInitialPartitionState() {
  return {
    partition: {
      partitionId: 'st-p001',
      seriesId: 'ST',
      waveId: 'W1',
      partnerId: 'bumbastic',
      parkId: 'bb-1',
      partitionSize: 100,
      soldCount: 0,
      goldRareClaimed: false,
      lastOneGiven: false,
      status: 'active'
    },
    slots: SLOT_CATALOG.map(s => ({
      slotId: s.slotId,
      tier: s.tier,
      variant: s.variant,
      pool: s.pool,
      remainingCount: s.count,
      initialCount: s.count
    })),
    cards: [
      { cardType: 'luck',   remainingCount: CARD_INITIAL_COUNTS.luck,   initialCount: CARD_INITIAL_COUNTS.luck },
      { cardType: 'double', remainingCount: CARD_INITIAL_COUNTS.double, initialCount: CARD_INITIAL_COUNTS.double },
      { cardType: 'keys',   remainingCount: CARD_INITIAL_COUNTS.keys,   initialCount: CARD_INITIAL_COUNTS.keys }
    ]
  };
}

// Multi-IP state initial for series (PWA-Task-v2 §8).
// В пилоте только ST. При scane другой series — initSeriesState вызывается lazy.
export function buildInitialSeriesState(seriesId) {
  return {
    charges: 0,
    totalEarned: 0,
    collection: {
      // prizes: { [slotId]: { count, status: 'received' | 'not_received' } }
      prizes: {},
      stickers: {},
      // exchanged: история обменов (для совместимости со старым debug)
      exchanged: {}
    },
    history: [] // последние события: { type, ts, slotId?, charges?, ... }
  };
}

export function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let s = '';
  for (const b of arr) s += b.toString(16).padStart(2, '0');
  return s;
}

export function generatePlayerId() { return 'pl_' + randomHex(6); }

export function slotInfoById(slotId) {
  return SLOT_CATALOG.find(s => s.slotId === slotId);
}

export function buildQrForBox(sequential) {
  // Pool A: 0001-0070, Pool B: 0071-0095, Pool C: 0096-0100
  let pool;
  if (sequential <= 70) pool = 'A';
  else if (sequential <= 95) pool = 'B';
  else pool = 'C';
  return `ST-${pool}-${String(sequential).padStart(4, '0')}`;
}

export function pickRandomSticker(seedStr) {
  const hash = sha256Bytes(utf8Bytes(seedStr));
  const idx = parseInt(hash.substring(0, 4), 16) % STICKER_CATALOG.length;
  return STICKER_CATALOG[idx];
}

export function summarizeStateByTier(slots) {
  const out = {};
  for (const tier of TIER_ORDER) out[tier] = 0;
  for (const s of slots) out[s.tier] = (out[s.tier] || 0) + s.remainingCount;
  return out;
}

export function applyStateUpdates(prevState, updates) {
  const next = {
    ...prevState,
    partition: { ...prevState.partition },
    slots: prevState.slots.map(s => ({ ...s })),
    cards: prevState.cards.map(c => ({ ...c }))
  };
  if (updates.decrementSlot) {
    const slot = next.slots.find(s => s.slotId === updates.decrementSlot);
    if (slot && slot.remainingCount > 0) slot.remainingCount -= 1;
  }
  if (updates.incrementSold) next.partition.soldCount += 1;
  if (updates.setLastOne) next.partition.lastOneGiven = true;
  if (updates.setGoldClaimed) next.partition.goldRareClaimed = true;
  if (updates.setStatus) next.partition.status = updates.setStatus;
  if (updates.decrementCard) {
    const card = next.cards.find(c => c.cardType === updates.decrementCard);
    if (card && card.remainingCount > 0) card.remainingCount -= 1;
  }
  return next;
}

// Форматирование чисел с пробелом в тысячах
export function fmtCharges(n) {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU').replace(/,/g, ' ');
}

// Оценка «ещё ~N коробок» — для прогресс-бара карточек.
// Fallback = DEFAULT_CONFIG.baseCharges (300) — для новых игроков с пустой/короткой историей.
// ВАЖНО: НЕ вводим новых констант экономики (см. HANDOFF-PWA-v3 §5.2).
export function boxesEstimate(remainingCharges, avgPerBox) {
  if (remainingCharges == null || remainingCharges <= 0) return 0;
  const avg = (avgPerBox != null && avgPerBox > 0) ? avgPerBox : DEFAULT_CONFIG.baseCharges;
  return Math.ceil(remainingCharges / avg);
}

export function pluralBoxes(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'коробка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'коробки';
  return 'коробок';
}
