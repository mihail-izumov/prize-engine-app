// ═══════════════════════════════════════════════════════════════════════════
// useToast — очередь тостов с auto-dismiss (4 секунды по умолчанию).
// Используется trigger system для уведомлений игрока.
// React equivalent: useState([toasts]) + setTimeout cleanup.
// ═══════════════════════════════════════════════════════════════════════════

import { ref } from 'vue'

const DEFAULT_DURATION_MS = 4000
let nextId = 1

// Module-level singleton.
const toasts = ref([])

export function useToast() {
  /**
   * Добавляет toast в очередь. Auto-dismiss через durationMs.
   * @param {Object} toast — { kind, title, detail, charges, icon }
   * @param {number} [durationMs]
   * @returns {number} id для ручного dismiss
   */
  function pushToast(toast, durationMs = DEFAULT_DURATION_MS) {
    const id = nextId++
    const item = { id, ...toast, createdAt: Date.now() }
    toasts.value = [...toasts.value, item]
    if (durationMs > 0) {
      setTimeout(() => dismissToast(id), durationMs)
    }
    return id
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function clearToasts() {
    toasts.value = []
  }

  return {
    toasts,
    pushToast,
    dismissToast,
    clearToasts,
  }
}
