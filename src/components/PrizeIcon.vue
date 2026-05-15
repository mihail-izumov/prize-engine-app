<script setup>
import { Radio, FlaskConical, Key, Shield, Target, User, Gift, Package, Flame } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps({
  slotInfo: { type: Object, required: true },
  size: { type: Number, default: 48 },
  dim: { type: Boolean, default: false },
})

const ICON_MAP = { radio: Radio, card: FlaskConical, keychain: Key, patch: Shield, magnet: Target,
                   figure: User, plush: Gift, giftbox: Package, flame: Flame }
const Icon = computed(() => ICON_MAP[props.slotInfo?.icon] || Package)
</script>

<template>
  <div
    v-if="slotInfo"
    class="inline-flex items-center justify-center"
    :style="{
      width: size + 'px',
      height: size + 'px',
      background: dim ? '#FFFFFF' : '#FAFAFA',
      border: '1px solid #C8C8C8',
      borderRadius: '4px',
    }"
  >
    <component :is="Icon" :size="Math.round(size * 0.52)" :color="dim ? '#C8C8C8' : '#4A4A4A'" :stroke-width="1.5" />
  </div>
</template>
