// ═══════════════════════════════════════════════════════════════════════════
// useReveal — 3-фазная reveal-анимация + performScan orchestrator.
// Тайминги из PrizeEnginePWA.jsx (4271-4278):
//   charging → flash:  900 ms
//   flash → show:      400 ms (т.е. abs 1300 ms)
//   show:              до пользовательского Take/Exchange
//
// Spark roll — HMAC-based, идентично оригиналу (4344-4348). Не Math.random.
// ═══════════════════════════════════════════════════════════════════════════

import { ref } from 'vue'
import { drawPrize, DEFAULT_CONFIG, SPARK_CONFIG } from '../engine/draw-engine.js'
import { hmacSha256 } from '../engine/sha256.js'
import { slotInfoById, randomHex, pickRandomSticker } from '../engine/state-helpers.js'
import {
  getExchangePrice,
  getRevealTintForSeries,
} from '../engine/constants.js'

const PHASE_CHARGING_MS = 900
const PHASE_FLASH_MS = 400

// Module-level singleton.
const reveal = ref(null)          // { result, sparkFired, sticker, seriesId, qrCode, ... }
const revealPhase = ref(null)     // null | 'charging' | 'flash' | 'show'

export function useReveal() {
  let timer1 = null
  let timer2 = null

  function clearTimers() {
    if (timer1) { clearTimeout(timer1); timer1 = null }
    if (timer2) { clearTimeout(timer2); timer2 = null }
  }

  /** Старт 3-фазной анимации. result уже содержит sparkFired/sticker. */
  function startReveal(payload) {
    clearTimers()
    reveal.value = payload
    revealPhase.value = 'charging'
    timer1 = setTimeout(() => {
      revealPhase.value = 'flash'
      timer2 = setTimeout(() => {
        revealPhase.value = 'show'
      }, PHASE_FLASH_MS)
    }, PHASE_CHARGING_MS)
  }

  function closeReveal() {
    clearTimers()
    reveal.value = null
    revealPhase.value = null
  }

  /**
   * Полный scan orchestration: drawPrize + spark roll (HMAC) + sticker pick.
   * Не мутирует state — возвращает данные. Вызывающий применяет:
   *   - usePartition.applyStateUpdates(result.stateUpdates)
   *   - useSeries.updateSeries — sticker, Last One bonus, effects refund
   *   - useCards.consumeEffects + refundKeysOnPoolFallback (если wasPoolFallback)
   *
   * @param {Object} params
   * @param {string} params.qrCode
   * @param {string} params.playerId
   * @param {string} params.serverSeed
   * @param {number} params.nonce
   * @param {Object} params.partitionState
   * @param {Object} [params.effects]  — { luckActive, doubleActive, forcePoolC }
   * @returns {{ ok: true, result, sparkFired, sticker, nonce } | { ok: false, error, errorMessage }}
   */
  function performScan({ qrCode, playerId, serverSeed, nonce, partitionState, effects = {} }) {
    const input = { qrCode, playerId, serverSeed, nonce, effects }
    const result = drawPrize(input, partitionState, DEFAULT_CONFIG, hmacSha256)
    if (!result.success) {
      return { ok: false, error: result.error, errorMessage: result.errorMessage }
    }
    // Spark roll — HMAC, deterministic per (qr, player, nonce)
    const sparkHmac = hmacSha256(serverSeed, `${qrCode}|${playerId}|${nonce}|spark`)
    const sparkN = parseInt(sparkHmac.substring(0, 8), 16)
    const sparkR = (sparkN >>> 0) / 0xFFFFFFFF
    const sparkFired = sparkR < SPARK_CONFIG.probability
    // Sticker — deterministic by (qr, nonce)
    const sticker = pickRandomSticker(qrCode + ':' + nonce)
    return { ok: true, result, sparkFired, sticker, nonce }
  }

  return {
    reveal,
    revealPhase,
    startReveal,
    closeReveal,
    performScan,
    getExchangePrice,
    getRevealTintForSeries,
    slotInfoById,
  }
}
