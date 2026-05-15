// ═══════════════════════════════════════════════════════════════════════════
// usePartition — глобальное состояние партии (slots, cards, partition meta).
// В пилоте — single ST partition. Архитектура готова к multi-partition.
// React equivalent: useState(buildInitialPartitionState) + applyStateUpdates.
// ═══════════════════════════════════════════════════════════════════════════

import { ref, computed } from 'vue'
import {
  buildInitialPartitionState,
  applyStateUpdates as applyUpdates,
  slotInfoById as slotInfoByIdFn,
  summarizeStateByTier,
} from '../engine/state-helpers.js'

// Module-level singleton (composable как provider — один на приложение).
// Если позже потребуется per-component reset — вынести в provide/inject.
const partitionState = ref(buildInitialPartitionState())

export function usePartition() {
  /**
   * Применяет stateUpdates из drawPrize() к текущему состоянию партии.
   * Возвращает { prev, next } — для evaluateTriggers (passive observers).
   */
  function applyStateUpdates(updates) {
    const prev = partitionState.value
    const next = applyUpdates(prev, updates)
    partitionState.value = next
    return { prev, next }
  }

  /** slot.meta по slotId (имя, тир, иконка) — из SLOT_CATALOG. */
  function slotInfoById(slotId) {
    return slotInfoByIdFn(slotId)
  }

  /** Resets to a fresh partition (debug only). */
  function resetPartition() {
    partitionState.value = buildInitialPartitionState()
  }

  const summary = computed(() => summarizeStateByTier(partitionState.value.slots))
  const remaining = computed(
    () => partitionState.value.partition.partitionSize - partitionState.value.partition.soldCount
  )
  const isClosed = computed(() => partitionState.value.partition.status === 'closed')

  return {
    partitionState,
    applyStateUpdates,
    slotInfoById,
    resetPartition,
    summary,
    remaining,
    isClosed,
  }
}
