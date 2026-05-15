// ═══════════════════════════════════════════════════════════════════════════
// Draw engine — copy-paste 1:1 from PrizeEnginePWA.jsx (134-301).
// drawPrize signature MUST remain: (input, state, config, hmacFn).
// Do NOT modify logic — этот код протестирован 19 инвариантами пилота.
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_CONFIG = Object.freeze({ baseCharges: 300, lastOneBonus: 500 });
export const LUCK_RARE_WEIGHT = 2;

// Bonus card — 4-я "auto-сила" вне draw-engine ("Мгновенный бонус").
// В UI представлена равнозначной карточкой среди 3 базовых сил (Powers carousel),
// но с другой механикой: срабатывает мгновенно при выпадении, не накапливается.
// Independent HMAC roll per scan. Не трогает 19 invariants пилота.
// Цель: видимый сигнал что система карточек работает + лёгкий поток зарядов.
// Impact: ~25 срабатываний/100 коробок × 100⚡ = 2500⚡ ≈ 3.3% призового бюджета.
export const SPARK_CONFIG = Object.freeze({ probability: 0.25, bonusCharges: 100 });
export const BONUS_CARD_LABEL = 'Мгновенный бонус';
export const QR_REGEX = /^([A-Z]{2,4})-([ABC])-(\d{4})$/;
export const ERRORS = Object.freeze({
  INVALID_QR: 'INVALID_QR',
  PARTITION_CLOSED: 'PARTITION_CLOSED',
  POOL_EMPTY_WITH_FALLBACK_FAILED: 'POOL_EMPTY_WITH_FALLBACK_FAILED',
  GOLD_FALLBACK_FAILED: 'GOLD_FALLBACK_FAILED',
  CARD_FORMAT_ERROR: 'CARD_FORMAT_ERROR'
});

export function parseQrCode(qr) {
  const m = QR_REGEX.exec(qr);
  if (!m) return { ok: false };
  return { ok: true, series: m[1], pool: m[2], sequential: parseInt(m[3], 10) };
}

export function filterCandidates(slots, effectivePool, goldClaimed) {
  return slots.filter(s =>
    s.remainingCount > 0 &&
    s.pool === effectivePool &&
    !(s.variant === 'Gold' && goldClaimed)
  );
}

export function detectGoldFallback(slots, effectivePool, goldClaimed) {
  const goldInPool = slots.find(s => s.pool === effectivePool && s.variant === 'Gold' && s.remainingCount > 0);
  return goldClaimed && goldInPool != null;
}

export function countRemainingInPool(slots, pool) {
  return slots.filter(s => s.pool === pool).reduce((a, s) => a + s.remainingCount, 0);
}

export function buildWeightedTable(candidates, luckActive) {
  const weighted = [];
  for (const c of candidates) {
    let w = c.remainingCount;
    if (luckActive && c.tier === 'Rare') w *= LUCK_RARE_WEIGHT;
    for (let i = 0; i < w; i++) weighted.push(c);
  }
  return weighted;
}

export function pickWeightedByIndex(weighted, index) {
  return weighted[index % weighted.length];
}

export function hmacHexToInt(hex) {
  return parseInt(hex.substring(0, 8), 16);
}

export function rollCard(cards, boxesRemainingBeforeDraw, input, hmacFn) {
  const totalLeft = cards.reduce((a, c) => a + c.remainingCount, 0);
  if (totalLeft === 0 || boxesRemainingBeforeDraw === 0) return 'none';
  const cardHmac = hmacFn(input.serverSeed, `${input.qrCode}|${input.playerId}|${input.nonce}|card`);
  const cardN = hmacHexToInt(cardHmac);
  const triggerProb = totalLeft / boxesRemainingBeforeDraw;
  const r = (cardN >>> 0) / 0xFFFFFFFF;
  if (r >= triggerProb) return 'none';
  const cardWeighted = [];
  for (const c of cards) {
    for (let i = 0; i < c.remainingCount; i++) cardWeighted.push(c.cardType);
  }
  if (cardWeighted.length === 0) return 'none';
  const cardPickHmac = hmacFn(input.serverSeed, `${input.qrCode}|${input.playerId}|${input.nonce}|card-pick`);
  const cardPickN = hmacHexToInt(cardPickHmac);
  return cardWeighted[cardPickN % cardWeighted.length];
}

export function calculateCharges(config, doubleActive, willBeLastOne) {
  let charges = config.baseCharges;
  if (doubleActive) charges *= 2;
  if (willBeLastOne) charges += config.lastOneBonus;
  return charges;
}

export function buildError(code, message) { return { success: false, error: code, errorMessage: message }; }
function nowIsoDatetime() { return new Date().toISOString(); }
function nowIsoDate() { return new Date().toISOString().substring(0, 10); }

export function drawPrize(input, state, config, hmacFn) {
  const parsed = parseQrCode(input.qrCode);
  if (!parsed.ok) return buildError(ERRORS.INVALID_QR, 'Невалидный формат QR-кода');
  if (state.partition.status === 'closed') return buildError(ERRORS.PARTITION_CLOSED, 'Партия уже раскрыта полностью');

  const effects = input.effects || {};
  let effectivePool = parsed.pool;
  let wasPoolFallback = false;
  if (effects.forcePoolC && parsed.pool !== 'C') {
    if (countRemainingInPool(state.slots, 'C') > 0) {
      effectivePool = 'C';
    } else {
      wasPoolFallback = true; // Sila сила key, но pool C пуст — fallback на оригинальный pool
    }
  }

  let candidates = filterCandidates(state.slots, effectivePool, state.partition.goldRareClaimed);

  // Если effectivePool пуст после фильтра — fallback на parsed.pool (правило fallback)
  if (candidates.length === 0 && effectivePool !== parsed.pool) {
    effectivePool = parsed.pool;
    candidates = filterCandidates(state.slots, effectivePool, state.partition.goldRareClaimed);
    wasPoolFallback = true;
  }

  // Gold fallback: если goldClaimed и единственный кандидат был Gold-вариант — wasGoldFallback
  const wasGoldFallback = detectGoldFallback(state.slots, effectivePool, state.partition.goldRareClaimed);

  if (candidates.length === 0) {
    return buildError(ERRORS.POOL_EMPTY_WITH_FALLBACK_FAILED, 'Pool empty even after fallback');
  }

  const luckActive = !!effects.luckActive;
  const weighted = buildWeightedTable(candidates, luckActive);
  if (weighted.length === 0) return buildError(ERRORS.POOL_EMPTY_WITH_FALLBACK_FAILED, 'No weighted candidates');

  const slotHmacHex = hmacFn(input.serverSeed, `${input.qrCode}|${input.playerId}|${input.nonce}|slot`);
  const slotN = hmacHexToInt(slotHmacHex);
  const picked = pickWeightedByIndex(weighted, slotN);

  // Last One detection — после уменьшения soldCount это будет последний
  const willBeLastOne = state.partition.soldCount + 1 === state.partition.partitionSize;
  const chargesAwarded = calculateCharges(config, !!effects.doubleActive, willBeLastOne);

  // Card roll
  const boxesRemainingBeforeDraw = state.partition.partitionSize - state.partition.soldCount;
  const cardFound = rollCard(state.cards, boxesRemainingBeforeDraw, input, hmacFn);

  // State updates (декларативно)
  const stateUpdates = {
    decrementSlot: picked.slotId,
    incrementSold: true,
    setLastOne: willBeLastOne,
    setGoldClaimed: picked.variant === 'Gold' ? true : false,
    decrementCard: cardFound !== 'none' ? cardFound : null,
    setStatus: state.partition.soldCount + 1 === state.partition.partitionSize ? 'closed' : 'active'
  };

  return {
    success: true,
    revealedSlotId: picked.slotId,
    tier: picked.tier,
    variant: picked.variant,
    pool: effectivePool,
    chargesAwarded,
    cardFound,
    wasLastOne: willBeLastOne,
    wasPoolFallback,
    wasGoldFallback,
    stateUpdates,
    fairness: {
      slotHmacHex,
      nonce: input.nonce,
      timestamp: nowIsoDatetime(),
      date: nowIsoDate()
    }
  };
}
