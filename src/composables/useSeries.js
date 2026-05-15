// ═══════════════════════════════════════════════════════════════════════════
// useSeries — multi-IP state (PWA-Task-v2 §8).
//   seriesData[seriesId] = { charges, totalEarned, collection, history }
// В пилоте только ST. Когда добавится PKM (M4+) — ensureSeries() ленится.
// ═══════════════════════════════════════════════════════════════════════════

import { ref, computed } from 'vue'
import { buildInitialSeriesState } from '../engine/state-helpers.js'

// Module-level singleton.
const seriesData = ref({ ST: buildInitialSeriesState('ST') })
const activeSeries = ref('ST')

export function useSeries() {
  /** Гарантирует, что для seriesId есть запись. Возвращает её. */
  function ensureSeries(seriesId) {
    if (!seriesData.value[seriesId]) {
      seriesData.value = {
        ...seriesData.value,
        [seriesId]: buildInitialSeriesState(seriesId),
      }
    }
    return seriesData.value[seriesId]
  }

  /**
   * Обновляет состояние серии иммутабельно.
   * @param {string} seriesId
   * @param {(prev) => next} updater — pure update function
   * @returns {{ prev, next }}
   */
  function updateSeries(seriesId, updater) {
    ensureSeries(seriesId)
    const prev = seriesData.value[seriesId]
    const next = updater(prev)
    seriesData.value = { ...seriesData.value, [seriesId]: next }
    return { prev, next }
  }

  /** Переключение активной серии (вызывается при scan другой series). */
  function setActiveSeries(seriesId) {
    ensureSeries(seriesId)
    activeSeries.value = seriesId
  }

  const currentSeries = computed(
    () => seriesData.value[activeSeries.value] || buildInitialSeriesState(activeSeries.value)
  )

  /** Полная история всех серий, отсортирована по убыванию ts. Используется в Profile. */
  const fullHistory = computed(() => {
    const all = []
    for (const [seriesId, state] of Object.entries(seriesData.value)) {
      for (const ev of state.history || []) all.push({ ...ev, seriesId })
    }
    return all.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  })

  /** Reset (debug only). */
  function resetAllSeries() {
    seriesData.value = { ST: buildInitialSeriesState('ST') }
    activeSeries.value = 'ST'
  }

  return {
    seriesData,
    activeSeries,
    currentSeries,
    fullHistory,
    ensureSeries,
    updateSeries,
    setActiveSeries,
    resetAllSeries,
  }
}
