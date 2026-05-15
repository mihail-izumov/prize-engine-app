// ═══════════════════════════════════════════════════════════════════════════
// useCards — балансы карт-сил у игрока + активные эффекты на следующий скан.
//   cardsOwned: { luck, double, keys } — накопленные карты
//   activeEffects: { luckActive, doubleActive, forcePoolC } — заряжены, сработают
//                  на следующем performScan и сбросятся.
//
// Порог активации — K-2 (cards.json.activationThreshold = 2 одинаковых).
// При активации тратится 2 карты типа.
// "Ключ Хокинса" (keys) → forcePoolC (открывает топ-коллекцию).
// "Везение" (luck)      → luckActive (×2 Rare).
// "Двойка" (double)     → doubleActive (×2 зарядов).
// ═══════════════════════════════════════════════════════════════════════════

import { ref, computed } from 'vue'
import { CARD_ACTIVATION_THRESHOLD, CARD_META } from '../engine/constants.js'

// Module-level singleton.
const cardsOwned = ref({ luck: 0, double: 0, keys: 0 })
const activeEffects = ref({ luckActive: false, doubleActive: false, forcePoolC: false })

const CARD_TO_EFFECT = {
  luck:   'luckActive',
  double: 'doubleActive',
  keys:   'forcePoolC',
}

export function useCards() {
  /** Прибавить N карт типа cardType (rollCard результат). */
  function creditCard(cardType, n = 1) {
    if (cardType == null || cardType === 'none') return
    if (!(cardType in cardsOwned.value)) return
    cardsOwned.value = {
      ...cardsOwned.value,
      [cardType]: cardsOwned.value[cardType] + n,
    }
  }

  /** Списать одну карту (для refund / debug). */
  function debitCard(cardType, n = 1) {
    if (!(cardType in cardsOwned.value)) return
    cardsOwned.value = {
      ...cardsOwned.value,
      [cardType]: Math.max(0, cardsOwned.value[cardType] - n),
    }
  }

  /**
   * Активировать силу: тратит CARD_ACTIVATION_THRESHOLD карт, ставит эффект.
   * Возвращает { ok, label } или { ok: false, reason }.
   */
  function activateCard(cardType) {
    const meta = CARD_META[cardType]
    if (!meta) return { ok: false, reason: 'unknown_card' }
    const effect = CARD_TO_EFFECT[cardType]
    if (!effect) return { ok: false, reason: 'no_effect_mapping' }
    if (activeEffects.value[effect]) return { ok: false, reason: 'already_active' }
    const have = cardsOwned.value[cardType] || 0
    if (have < CARD_ACTIVATION_THRESHOLD) return { ok: false, reason: 'insufficient' }

    cardsOwned.value = {
      ...cardsOwned.value,
      [cardType]: have - CARD_ACTIVATION_THRESHOLD,
    }
    activeEffects.value = { ...activeEffects.value, [effect]: true }
    return { ok: true, label: meta.label, effect }
  }

  /**
   * Сбрасывает все активные эффекты после скана.
   * Возвращает копию эффектов, которые были активны (для передачи в drawPrize).
   */
  function consumeEffects() {
    const snapshot = { ...activeEffects.value }
    activeEffects.value = { luckActive: false, doubleActive: false, forcePoolC: false }
    return snapshot
  }

  /** Refund для wasPoolFallback: возврат 2 карт keys (Ключ не сработал). */
  function refundKeysOnPoolFallback() {
    cardsOwned.value = {
      ...cardsOwned.value,
      keys: cardsOwned.value.keys + CARD_ACTIVATION_THRESHOLD,
    }
  }

  const canActivate = computed(() => ({
    luck:   cardsOwned.value.luck   >= CARD_ACTIVATION_THRESHOLD && !activeEffects.value.luckActive,
    double: cardsOwned.value.double >= CARD_ACTIVATION_THRESHOLD && !activeEffects.value.doubleActive,
    keys:   cardsOwned.value.keys   >= CARD_ACTIVATION_THRESHOLD && !activeEffects.value.forcePoolC,
  }))

  function resetCards() {
    cardsOwned.value = { luck: 0, double: 0, keys: 0 }
    activeEffects.value = { luckActive: false, doubleActive: false, forcePoolC: false }
  }

  return {
    cardsOwned,
    activeEffects,
    canActivate,
    creditCard,
    debitCard,
    activateCard,
    consumeEffects,
    refundKeysOnPoolFallback,
    resetCards,
  }
}
