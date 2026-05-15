<script setup>
// Drop projectile overlay. target='cart' → animates to gifts tab (right of center),
// target='collection' → animates to collection tab (left of center).
// CSS keyframes уже в main.css: dropToCartProjectile, dropToCartBackdrop, dropToCollectionProjectile.
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { Radio, FlaskConical, Key, Shield, Target, User, Gift, Package, Flame } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps({
  active: { type: Boolean, default: false },
  slotInfo: { type: Object, default: null },
  target: { type: String, default: 'cart' }, // 'cart' | 'collection'
})
const emit = defineEmits(['complete'])

const ICON_MAP = {
  radio: Radio, card: FlaskConical, keychain: Key, patch: Shield, magnet: Target,
  figure: User, plush: Gift, giftbox: Package, flame: Flame,
}
const Icon = computed(() => ICON_MAP[props.slotInfo?.icon] || Package)
const projectileAnim = computed(
  () => props.target === 'collection'
    ? 'dropToCollectionProjectile 0.9s cubic-bezier(0.4,0,0.2,1) forwards'
    : 'dropToCartProjectile 0.9s cubic-bezier(0.4,0,0.2,1) forwards'
)

let timer = null
function startTimer() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('complete'), 900)
}
watch(() => props.active, (v) => { if (v) startTimer() })
onMounted(() => { if (props.active) startTimer() })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <template v-if="active && slotInfo">
    <div
      class="fixed inset-0 z-[70] pointer-events-none"
      style="background: rgba(0,0,0,0.7); animation: dropToCartBackdrop 0.9s cubic-bezier(0.4,0,0.2,1) forwards"
    />
    <div
      class="fixed z-[71] pointer-events-none flex items-center justify-center"
      :style="{
        top: '50%',
        left: '50%',
        width: '88px',
        height: '88px',
        background: '#FFFFFF',
        border: '2px solid #000000',
        borderRadius: '4px',
        animation: projectileAnim,
      }"
    >
      <component :is="Icon" :size="44" color="#000000" :stroke-width="1.75" />
    </div>
  </template>
</template>
