// ═══════════════════════════════════════════════════════════════════════════
// Engine constants — tier/variant metas, UI mapping, price helpers.
// Data ultimately sourced from src/config/*.json (single source of truth).
// JS-only constants (TIER_ORDER, VARIANT_META, mapping functions) преобразованы
// в ES exports из PrizeEnginePWA.jsx (363-470).
// ═══════════════════════════════════════════════════════════════════════════

import slotsConfig from '../config/slots.json' with { type: 'json' };
import cardsConfig from '../config/cards.json' with { type: 'json' };
import chargesConfig from '../config/charges.json' with { type: 'json' };
import uiCollectionsConfig from '../config/ui-collections.json' with { type: 'json' };
import tintsConfig from '../config/tints.json' with { type: 'json' };

// ───────────────────────────────────────────────────────────────────────────
// Slot & sticker catalog (re-export from slots.json)
// ───────────────────────────────────────────────────────────────────────────

export const SLOT_CATALOG = slotsConfig.slots;
export const STICKER_CATALOG = slotsConfig.stickers;

// ───────────────────────────────────────────────────────────────────────────
// Cards
// ───────────────────────────────────────────────────────────────────────────

export const CARD_INITIAL_COUNTS = cardsConfig.initialCounts;
export const TOTAL_CARDS_PER_PARTITION = cardsConfig.totalPerPartition;
export const CARD_ACTIVATION_THRESHOLD = cardsConfig.activationThreshold;
export const CARD_META = cardsConfig.meta;
export const BONUS_CARD = cardsConfig.bonusCard;

// ───────────────────────────────────────────────────────────────────────────
// Tier / variant (player-UI-hidden, debug-only metas)
// ───────────────────────────────────────────────────────────────────────────

// TIER_ORDER — for debug-only iteration. Player UI hides tiers.
export const TIER_ORDER = ['JUNK', 'Common', 'Rare', 'Epic', 'Legendary'];

// TIER_META v2 — DEBUG-ONLY. Player UI doesn't show tiers.
// Retained for DebugPanel and scan log.
export const TIER_META = {
  JUNK:      { label: 'JUNK' },
  Common:    { label: 'Common' },
  Rare:      { label: 'Rare' },
  Epic:      { label: 'Epic' },
  Legendary: { label: 'Legendary' }
};

export const VARIANT_META = {
  Normal: { label: '' },
  Holo:   { label: 'HOLO' },
  Gold:   { label: 'GOLD 1/100' }
};

// ───────────────────────────────────────────────────────────────────────────
// UI collections A/B/C — engine→UI mapping with inversion
// (PWA-Task-v2 §2, ui-collections.json)
//   Engine A (70 boxes) → UI C (basic)
//   Engine B (25 boxes) → UI B (mid)
//   Engine C (5 boxes)  → UI A (top, rarest)
// Ichiban Kuji convention: player sees A as top, NEVER sees engine pool letter.
// ───────────────────────────────────────────────────────────────────────────

export function enginePoolToUiCollection(enginePool) {
  return uiCollectionsConfig.enginePoolToUi[enginePool] || null;
}

export function uiCollectionToEnginePool(uiLetter) {
  // Inverse lookup
  const map = uiCollectionsConfig.enginePoolToUi;
  for (const [enginePool, uiLetter2] of Object.entries(map)) {
    if (uiLetter2 === uiLetter) return enginePool;
  }
  return null;
}

// UI_COLLECTION_META — muted accents, used ONLY in reveal-overlay badge.
// In Collection screen headers (A/B/C) — pure b/w, no color.
// Anti-pattern compliance (Visual-Identity §3.1): platform UI is b/w.
export const UI_COLLECTION_META = uiCollectionsConfig.uiCollections;

// UI collection order — top first (A → B → C), Ichiban Kuji style
export const UI_COLLECTION_ORDER = uiCollectionsConfig.displayOrder;

// ───────────────────────────────────────────────────────────────────────────
// Charges price mapping (charges.json)
// JUNK = 100/80 — placeholder low floor. Gold variant — chase-only, NOT in catalog.
// ───────────────────────────────────────────────────────────────────────────

export const TIER_CHARGES_PRICE = chargesConfig.buyPrice;
export const EXCHANGE_DISCOUNT = chargesConfig.exchangeDiscount; // 0.80 (20% spread)
export const RUB_PER_CHARGE = chargesConfig.rubPerCharge;        // 0.43
export const BASE_CHARGES_PER_SCAN = chargesConfig.baseChargesPerScan; // 300
export const LAST_ONE_BONUS = chargesConfig.lastOneBonus;        // 500
export const SPARK = chargesConfig.spark;                        // { probability:0.25, bonusCharges:100, trigger:'exchange' }

/** 80% discount on exchange (20% spread = system margin). Gold returns null (chase-only). */
export function getExchangePrice(tier, variant) {
  if (variant === 'Gold') return null; // Gold нельзя обменять — только Забрать
  const buy = TIER_CHARGES_PRICE[tier];
  if (buy == null) return null;
  return Math.round(buy * EXCHANGE_DISCOUNT);
}

export function getGiftBuyPrice(tier, variant) {
  if (variant === 'Gold') return null; // Gold нельзя купить за заряды — chase-only
  return TIER_CHARGES_PRICE[tier] || null;
}

// ───────────────────────────────────────────────────────────────────────────
// Reveal-tint palette per IP (tints.json)
// In pilot: only ST. PKM/RICK added M4+.
// ───────────────────────────────────────────────────────────────────────────

export function getRevealTintForSeries(seriesId) {
  // In pilot only ST. When PKM added — REVEAL_TINT_PKM with cool greens.
  return tintsConfig[seriesId] || tintsConfig.ST; // fallback to ST
}

// ───────────────────────────────────────────────────────────────────────────
// History event types (PWA-Task-v2 §7)
// ───────────────────────────────────────────────────────────────────────────

export const HISTORY_EVENT_TYPES = {
  TAKE:         'take',         // забрал подарок: +0 ⚡, slot → received
  EXCHANGE:     'exchange',     // обменял подарок: +N ⚡, slot → not_received
  BUY:          'buy',          // купил подарок в коллекции: -N ⚡, slot → received
  LAST_ONE:     'last_one',     // бонус Last One: +500 ⚡
  POWER_USE:    'power_use',    // активация суперсилы
  SPARK_BONUS:  'spark_bonus',  // 4-я auto-сила Искра: +100 ⚡ мгновенно
  SCAN:         'scan',         // обобщающее (legacy)
  ACTIVITY:     'activity'      // trigger-тосты → журнал
};
