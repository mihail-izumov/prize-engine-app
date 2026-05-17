<script setup>
import { Dices, Flame, Key, Zap } from 'lucide-vue-next'
import { useCards } from '../composables/useCards.js'
import { CARD_META, CARD_ACTIVATION_THRESHOLD } from '../engine/constants.js'

const { cardsOwned, activeEffects, canActivate, activateCard } = useCards()

// Phase β.1 (sub-phase b): emit up to App.vue instead of firing triggers
// locally. Pre-existing bug fix — old code called fireTriggers() raw (without
// fireTriggersWithMascot) so mascot never reacted to power_activate.
// Also: insufficient/already_active cases used pushToast directly, bypassing
// the trigger pipeline. Now they go through proper power_activate_attempt
// event for centralised mascot/toast handling and one-shot tracking.
const emit = defineEmits(['power-activate-result'])

const CARDS = [
  { type: 'luck',   Icon: Dices, effect: 'luckActive',    activeLabel: '×2 шанс Rare' },
  { type: 'double', Icon: Flame, effect: 'doubleActive',  activeLabel: '×2 зарядов' },
  { type: 'keys',   Icon: Key,   effect: 'forcePoolC',    activeLabel: 'Топ-коллекция' },
]

function onActivate(cardType) {
  const r = activateCard(cardType)
  // r shape: { ok, label?, reason? } — see useCards.js activateCard().
  // Forward to App.vue with full context so the proper event can be emitted
  // through the unified pipeline (with mascot integration + markFlag tracking).
  emit('power-activate-result', {
    ok: r.ok,
    cardType,
    cardLabel: r.label || CARD_META[cardType]?.label,
    reason: r.reason,
    cardsHave: cardsOwned.value?.[cardType] ?? 0,
    cardsNeed: CARD_ACTIVATION_THRESHOLD,
  })
}
</script>

<template>
  <div class="px-5 pt-6 pb-32 space-y-6">
    <div class="text-center space-y-2">
      <h1 class="font-display text-2xl tracking-wide text-ink-black">Силы</h1>
      <p class="text-[12px] font-mono uppercase tracking-[0.2em]" style="color: #8A8A8A">
        Активируй {{ CARD_ACTIVATION_THRESHOLD }} одинаковых
      </p>
    </div>

    <div class="space-y-3">
      <div
        v-for="card in CARDS"
        :key="card.type"
        class="p-4"
        style="background: #FFFFFF; border: 2px solid #000000; border-radius: 4px"
      >
        <div class="flex items-center gap-3 mb-3">
          <div
            class="w-12 h-12 flex items-center justify-center"
            style="background: #000000; color: #FFFFFF; border-radius: 4px"
          >
            <component :is="card.Icon" :size="22" :stroke-width="1.5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-display text-base">{{ CARD_META[card.type].label }}</div>
            <div class="font-mono text-[10px] uppercase tracking-[0.15em]" style="color: #8A8A8A">
              {{ CARD_META[card.type].effect }}
            </div>
          </div>
          <div
            class="font-mono text-2xl font-bold px-3 py-1"
            style="background: #EEEEEE; color: #000000; border-radius: 4px"
          >
            {{ cardsOwned[card.type] }}
          </div>
        </div>

        <div
          v-if="activeEffects[card.effect]"
          class="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-center"
          style="background: #000000; color: #FFFFFF; border-radius: 4px"
        >
          <Zap :size="12" class="inline" fill="currentColor" />
          АКТИВНА · {{ card.activeLabel }} · следующий скан
        </div>
        <button
          v-else
          type="button"
          :disabled="!canActivate[card.type]"
          class="w-full py-2.5 font-display text-xs uppercase tracking-[0.2em] transition-opacity"
          :style="{
            background: canActivate[card.type] ? '#000000' : '#FFFFFF',
            color: canActivate[card.type] ? '#FFFFFF' : '#C8C8C8',
            border: '1px solid ' + (canActivate[card.type] ? '#000000' : '#C8C8C8'),
            borderRadius: '4px',
            cursor: canActivate[card.type] ? 'pointer' : 'not-allowed',
          }"
          @click="onActivate(card.type)"
        >
          Активировать ({{ CARD_ACTIVATION_THRESHOLD }})
        </button>
      </div>
    </div>
  </div>
</template>
