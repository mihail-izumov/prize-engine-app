<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// TamaMascot.vue — Phase 4 Mascot Integration
//
// Ported from mascot-phase1.jsx (2313 lines React) to Vue SFC.
// Source: TAMA-MASCOT-GUIDE §2 golden rules, STRATEGY-Visual-Identity §5.
//
// Architecture:
//   Props: zone ('loyalty' | 'gambling')
//   Reads state from useTama() composable (singleton)
//   Renders: PlaceholderSVG | SleepingBox | nothing (gambling zone)
//
// Golden rules enforced:
//   1. Eye families don't mix (chevron/arc/dot/special per state)
//   2. EAR_VARIANTS: even/tiltedRight/tiltedLeft/alert/droopy
//   3. Palette: 7 tokens only (ink-black, paper-white, ash-*)
//   4. Strokeweight: 3.0/2.8/2.6/2.4/2.0-2.2
//   5. CSS keyframes, prefixed mascot-*
//   6. zone='gambling' → null
//   7. No emoji as SVG elements
// ═══════════════════════════════════════════════════════════════════════════

import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useTama, STATES } from '../composables/useTama.js'

const props = defineProps({
  zone: { type: String, default: 'loyalty' }, // 'loyalty' | 'gambling'
})

const tama = useTama()

// ── Responsive sizing (STRATEGY §5.4.2) ──────────────────────────────────
const isMobile = ref(true)
let resizeHandler = null

onMounted(() => {
  resizeHandler = () => { isMobile.value = window.innerWidth < 600 }
  resizeHandler()
  window.addEventListener('resize', resizeHandler)
})
onUnmounted(() => {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
})

const mascotSize = computed(() => isMobile.value ? 120 : 160)

// Tab-bar is ~60px. mascot bottom = safe-area + 60(tab) + 10(gap).
// 10px gap between mascot bottom edge and tab-bar top edge.
const positionStyle = computed(() => {
  if (isMobile.value) {
    return {
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 70px)',
      left: '50%',
      transform: 'translateX(-50%)',
    }
  }
  return {
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
  }
})

// Sleeping = isHidden OR current state is 'sleepy'
const isSleeping = computed(() =>
  tama.isHidden.value || tama.currentState.value === 'sleepy'
)

// Tap on mascot — routed through useTama.onMascotTap() for curiosity counter
// (SCENARIOS §5.1) + wakeUp on sleepy. Phase β.1 (sub-phase c).
// Local wrapper removed; @click below calls tama.onMascotTap() directly.

// ═══════════════════════════════════════════════════════════════════════════
// EAR VARIANTS — per-emotion ear posture (1:1 from mascot-phase1.jsx)
// ═══════════════════════════════════════════════════════════════════════════

const EAR_C1_L = [22, 36]
const EAR_C2_L = [26, 22]
const EAR_C1_R = [74, 22]
const EAR_C2_R = [78, 36]
const SHOULDER_L = [22, 48]
const SHOULDER_R = [78, 48]

function buildEarBody({ tipL, tipR, merge, c1L = EAR_C1_L, c2L = EAR_C2_L, c1R = EAR_C1_R, c2R = EAR_C2_R }) {
  const [tLx, tLy] = tipL
  const [tRx, tRy] = tipR
  const [mx, my] = merge
  return (
    `M 22 56 L 22 48 ` +
    `C ${c1L[0]} ${c1L[1]}, ${c2L[0]} ${c2L[1]}, ${tLx} ${tLy} ` +
    `L ${mx} ${my} L ${tRx} ${tRy} ` +
    `C ${c1R[0]} ${c1R[1]}, ${c2R[0]} ${c2R[1]}, 78 48 ` +
    `L 78 56 C 78 80, 70 88, 50 88 C 30 88, 22 80, 22 56 Z`
  )
}

function buildTassel(tip, shoulder, merge, ratio = 0.35) {
  const [tx, ty] = tip
  const [sx, sy] = shoulder
  const [mx, my] = merge
  const innerX = (tx + (mx - tx) * ratio).toFixed(1)
  const innerY = (ty + (my - ty) * ratio).toFixed(1)
  const outerX = (tx + (sx - tx) * ratio).toFixed(1)
  const outerY = (ty + (sy - ty) * ratio).toFixed(1)
  return `M ${tx} ${ty} L ${innerX} ${innerY} L ${outerX} ${outerY} Z`
}

function makeVariant(opts) {
  const { tipL, tipR, merge } = opts
  return {
    body: buildEarBody(opts),
    tasselL: buildTassel(tipL, SHOULDER_L, merge),
    tasselR: buildTassel(tipR, SHOULDER_R, merge),
  }
}

const EAR_VARIANTS = {
  even: makeVariant({ tipL: [18, 4], tipR: [82, 4], merge: [50, 40] }),
  tiltedRight: makeVariant({ tipL: [18, 4], tipR: [86, 8], merge: [50, 40] }),
  tiltedLeft: makeVariant({ tipL: [14, 8], tipR: [82, 4], merge: [50, 40] }),
  alert: makeVariant({ tipL: [18, 2], tipR: [82, 2], merge: [50, 38] }),
  droopy: makeVariant({
    tipL: [10, 20], tipR: [90, 20], merge: [50, 38],
    c1L: [22, 44], c2L: [14, 32], c1R: [86, 32], c2R: [78, 44],
  }),
}

function earVariantForState(state) {
  switch (state) {
    case 'idle':
    case 'proud':
      return EAR_VARIANTS.even
    case 'pondering':
      return EAR_VARIANTS.tiltedLeft
    case 'wow':
    case 'surprised':
      return EAR_VARIANTS.alert
    case 'farewell':
      return EAR_VARIANTS.droopy
    default:
      return EAR_VARIANTS.tiltedRight
  }
}

const earVariant = computed(() => earVariantForState(tama.currentState.value))

// Unique clip-path id (avoid collisions if multiple instances)
const clipId = `tama-body-clip-${Math.random().toString(36).slice(2, 8)}`

// ═══════════════════════════════════════════════════════════════════════════
// SPARKLE / BURST helpers (coordinates for charge-up and wow effects)
// ═══════════════════════════════════════════════════════════════════════════

const SPARKLE_POSITIONS = [
  { x: 18, y: 30, delay: 0 },
  { x: 84, y: 26, delay: 150 },
  { x: 88, y: 62, delay: 300 },
  { x: 14, y: 64, delay: 450 },
]

const BURST_POSITIONS = [
  { x: 50, y: 50, tx: -22, ty: -26, delay: 0 },
  { x: 50, y: 50, tx: 24, ty: -24, delay: 80 },
  { x: 50, y: 50, tx: -28, ty: 6, delay: 160 },
  { x: 50, y: 50, tx: 28, ty: 4, delay: 240 },
  { x: 50, y: 50, tx: 0, ty: -32, delay: 320 },
]

function sparklePath(x, y) {
  return `M ${x} ${y - 4} L ${x + 1.2} ${y - 1.2} L ${x + 4} ${y} L ${x + 1.2} ${y + 1.2} L ${x} ${y + 4} L ${x - 1.2} ${y + 1.2} L ${x - 4} ${y} L ${x - 1.2} ${y - 1.2} Z`
}

// ═══════════════════════════════════════════════════════════════════════════
// SLEEPING BOX SVG DATA — paths from sleepy.svg scaled 0.0926
// ═══════════════════════════════════════════════════════════════════════════

const SLEEPY_PATHS = {
  rimOutline: 'M265.697,468.194L559.64,573.686C561.584,574.384 563.71,574.391 565.66,573.707L861.517,469.883C866.204,468.238 868.674,463.097 867.029,458.41C865.384,453.723 860.243,451.254 855.556,452.898L562.713,555.665C562.713,555.665 271.777,451.252 271.777,451.252C267.102,449.574 261.944,452.007 260.266,456.683C258.588,461.358 261.022,466.516 265.697,468.194Z',
  boxBody: 'M271.895,601.782L306.215,853.548C306.658,856.794 308.829,859.543 311.885,860.726L558.709,956.237C560.792,957.043 563.1,957.046 565.184,956.245L812.551,861.23C815.609,860.055 817.787,857.313 818.238,854.069L853.461,601.093C854.146,596.173 850.708,591.623 845.788,590.938C840.868,590.253 836.318,593.691 835.633,598.61L801.142,846.33C801.142,846.33 561.969,938.198 561.969,938.198C561.969,938.198 323.333,845.855 323.333,845.855C318.403,809.692 289.73,599.351 289.73,599.351C289.059,594.429 284.519,590.978 279.597,591.649C274.675,592.32 271.224,596.86 271.895,601.782Z',
  composite: 'M553.68,590.661L484.399,679.029C481.968,682.131 477.801,683.29 474.117,681.889L195.367,575.869C192.906,574.933 190.979,572.967 190.092,570.488C189.205,568.008 189.449,565.265 190.758,562.981L254.129,452.427C255.341,450.314 257.356,448.782 259.717,448.181L560.459,371.599C561.93,371.224 563.471,371.228 564.94,371.609L865.249,449.539C867.543,450.134 869.509,451.61 870.722,453.646L935.831,563.009C937.194,565.3 937.473,568.077 936.59,570.592C935.708,573.107 933.757,575.102 931.261,576.039L649.707,681.758C646.005,683.147 641.831,681.959 639.416,678.828L571.68,591L571.68,947.844C571.68,952.659 567.899,956.591 563.143,956.832L562.68,956.844C557.709,956.844 553.68,952.814 553.68,947.844L553.68,590.661ZM569.598,558.838L569.59,558.827L569.586,558.824C569.446,558.655 569.299,558.493 569.148,558.337L569.13,558.317L569.121,558.309C568.971,558.154 568.815,558.006 568.655,557.864L568.631,557.842L568.619,557.832C568.458,557.691 568.293,557.556 568.124,557.428L568.095,557.405L568.07,557.386L568.043,557.366L567.928,557.284L567.814,557.201L567.786,557.183L567.76,557.164L567.727,557.143C567.552,557.024 567.372,556.911 567.187,556.804L567.172,556.795L567.141,556.778C566.956,556.672 566.767,556.573 566.573,556.48L566.56,556.473L566.531,556.46C566.337,556.368 566.139,556.282 565.936,556.204L565.927,556.2L565.904,556.192L565.617,556.087C565.287,555.973 564.954,555.879 564.619,555.805L564.61,555.803L564.607,555.803C564.387,555.754 564.167,555.715 563.947,555.684L563.932,555.681L563.925,555.68C563.706,555.65 563.487,555.628 563.268,555.613L563.244,555.611L563.233,555.611C563.056,555.602 562.879,555.597 562.702,555.598C562.525,555.593 562.349,555.598 562.172,555.608L562.162,555.608L562.141,555.61C561.921,555.623 561.701,555.644 561.481,555.674L561.477,555.674L561.467,555.676C561.024,555.736 560.583,555.83 560.146,555.958L560.134,555.961L560.13,555.963C560.012,555.997 559.894,556.035 559.776,556.075L559.519,556.168L559.484,556.18L559.469,556.187C559.272,556.261 559.079,556.343 558.89,556.432L558.851,556.448L558.832,556.459C558.643,556.548 558.458,556.643 558.277,556.745L558.24,556.765L558.218,556.778C558.037,556.881 557.861,556.99 557.689,557.105L557.651,557.129L557.611,557.157L557.568,557.185L557.468,557.257L557.367,557.328L557.327,557.359L557.286,557.389L557.251,557.417C557.086,557.541 556.925,557.672 556.768,557.808L556.747,557.826L556.715,557.856C556.56,557.992 556.409,558.135 556.263,558.284L556.245,558.301L556.216,558.333C556.071,558.482 555.931,558.636 555.797,558.796L555.783,558.812L555.757,558.845L555.597,559.041L474.322,662.709C438.333,649.021 256.179,579.74 211.615,562.791L211.615,562.791L267.851,464.684C267.851,464.684 535.355,396.566 562.659,389.613C562.659,389.613 823.412,457.278 857.147,466.032C857.147,466.032 914.859,562.971 914.859,562.971C914.859,562.971 649.607,662.568 649.607,662.568C649.607,662.568 569.806,559.097 569.806,559.097L569.598,558.838Z',
  lidFill: 'M406.159,509.297L334.029,144.786L582.885,494.635L913.557,304.836L735.522,502.961L565.049,562.875L406.159,509.297Z',
  tassels: 'M989.27,257.004L633.44,143.404L581.96,304.637L937.79,418.237L989.27,257.004ZM534.59,120.905L166.63,185.132L195.74,351.861L563.69,287.634L534.59,120.905Z',
  lidEdge: 'M397.33,511.044C397.956,514.208 400.227,516.795 403.283,517.825L562.174,571.403C564.077,572.045 566.139,572.032 568.034,571.366L738.506,511.452C739.931,510.951 741.207,510.1 742.216,508.976L920.252,310.851C923.207,307.563 923.336,302.615 920.556,299.177C917.776,295.74 912.911,294.83 909.077,297.03L585.487,482.765C585.487,482.765 341.363,139.57 341.363,139.57C338.903,136.113 334.364,134.842 330.467,136.521C326.571,138.2 324.376,142.372 325.2,146.534L397.33,511.044ZM413.976,502.435C407.201,468.199 368.191,271.064 350.996,184.166C413.605,272.183 575.552,499.852 575.552,499.852C578.237,503.627 583.348,504.747 587.366,502.441C587.366,502.441 777.354,393.391 869.311,340.609C821.133,394.224 742.317,481.934 730.366,495.233C730.366,495.233 564.989,553.357 564.989,553.357L413.976,502.435Z',
}

// State class name for animation binding
const stateClass = computed(() => `s-${tama.currentState.value}`)
const lookUpClass = computed(() => tama.onboardingLookUp.value ? 'mascot-look-up' : '')
</script>

<template>
  <!-- Zone='gambling' → mascot NOT rendered (STRATEGY §5.2.2) -->
  <template v-if="props.zone !== 'gambling'">
    <!-- ═══════════ SLEEPING MODE ═══════════ -->
    <div
      v-if="isSleeping"
      class="fixed z-50"
      :style="{ ...positionStyle, transition: 'bottom 240ms ease' }"
    >
      <button
        class="sleeping-box-btn block cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98]"
        :style="{ width: mascotSize + 'px', height: mascotSize + 'px', padding: 0, background: 'none', border: 0 }"
        aria-label="Разбудить Таму"
        title="Разбудить Таму"
        @click="tama.onMascotTap()"
      >
        <svg
          viewBox="0 0 100 100"
          :width="mascotSize"
          :height="mascotSize"
          aria-hidden="true"
          class="overflow-visible"
        >
          <!-- Ground shadow -->
          <ellipse cx="50" cy="95" rx="28" ry="2.5" fill="black" opacity="0.15" />

          <!-- Floating Z's -->
          <g>
            <text x="58" y="12" font-size="13" font-weight="800" fill="black" class="z-float-1">z</text>
            <text x="66" y="5" font-size="10" font-weight="800" fill="black" class="z-float-2">z</text>
          </g>

          <!-- Breathing wrapper -->
          <g class="sleep-breath-group">
            <g transform="scale(0.0926)" style="fill-rule: evenodd">
              <path :d="SLEEPY_PATHS.rimOutline" fill="black" />
              <path :d="SLEEPY_PATHS.boxBody" fill="black" />
              <path :d="SLEEPY_PATHS.composite" fill="black" />
              <path :d="SLEEPY_PATHS.lidFill" fill="white" />
              <defs>
                <clipPath id="sleepy-lid-clip">
                  <path :d="SLEEPY_PATHS.lidFill" />
                </clipPath>
              </defs>
              <g clip-path="url(#sleepy-lid-clip)">
                <path :d="SLEEPY_PATHS.tassels" fill="black" fill-rule="evenodd" />
              </g>
              <path :d="SLEEPY_PATHS.lidEdge" fill="black" />
            </g>
          </g>
        </svg>
      </button>
    </div>

    <!-- ═══════════ AWAKE MODE ═══════════ -->
    <div
      v-else
      class="fixed z-50 pointer-events-none"
      :style="{ ...positionStyle, transition: 'bottom 240ms ease' }"
    >
      <div class="relative">
        <!-- ── Speech Bubble (STRATEGY-Visual-Identity §6.3: japanese envelope) ── -->
        <!-- Two-layer construction:
             1. Outer = positioning (mobile: centered; desktop: offset right
                so the bubble sits above the mascot's right edge).
             2. Inner = scale + fade animation (per §6.3.2, 200ms ease-out).
             Tail position tracks placement — centered on mobile, offset right
             on desktop — so it visually points down toward the mascot. -->
        <div
          v-if="tama.bubble.value"
          class="absolute bottom-full mb-2 pointer-events-auto"
          :class="isMobile ? 'left-1/2' : 'right-2'"
          :style="isMobile ? { transform: 'translateX(-50%)' } : {}"
        >
          <div
            role="status"
            aria-live="polite"
            class="cursor-pointer"
            :class="tama.bubbleVisible.value ? 'bubble-enter' : 'bubble-exit'"
            :style="{ transformOrigin: isMobile ? '50% 100%' : '85% 100%' }"
            @click="tama.dismissBubble()"
          >
            <div
              class="relative px-3 py-2"
              :style="{
                background: '#FFFFFF',
                border: '2.5px solid #000000',
                borderRadius: '3px',
                maxWidth: 'min(320px, calc(100vw - 32px))',
                minWidth: '120px',
              }"
            >
              <div class="text-sm font-semibold leading-tight" style="color: #000000">
                {{ tama.bubble.value.message }}
              </div>
              <div
                v-if="tama.bubble.value.subtitle"
                class="text-xs mt-0.5 leading-snug"
                style="color: #4A4A4A"
              >
                {{ tama.bubble.value.subtitle }}
              </div>

              <!-- Tail: japanese envelope cut (diagonal notch, not triangle) -->
              <svg
                viewBox="-1 -2 22 16"
                width="18"
                height="14"
                class="absolute"
                :class="isMobile ? 'left-1/2 -translate-x-1/2' : 'right-6'"
                style="bottom: -13px; overflow: visible"
                aria-hidden="true"
              >
                <!-- White mask covering bubble border -->
                <path d="M 3 -2 L 3 0 L 9 10 L 11 10 L 17 0 L 17 -2 Z" fill="white" />
                <!-- Stroked diagonal cut — sharp, no rounded tip (envelope feel) -->
                <path
                  d="M 3 0 L 10 10 L 17 0"
                  fill="none"
                  stroke="black"
                  stroke-width="2.5"
                  stroke-linejoin="miter"
                />
              </svg>
            </div>
          </div>
        </div>

        <!-- ── Sleep button (crescent moon) ── -->
        <button
          class="absolute -bottom-1 -right-1 z-10 w-9 h-9 rounded-full flex items-center justify-center pointer-events-auto"
          style="background: #000000; border: 2px solid #000000; box-shadow: 0 2px 6px rgba(0,0,0,0.25)"
          aria-label="Уложить Таму спать"
          title="Уложить Таму спать"
          @click="tama.goToSleep()"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M 19 14.5 A 7.5 7.5 0 1 1 9.5 5 A 6 6 0 0 0 19 14.5 Z" fill="white" />
          </svg>
        </button>

        <!-- ── Mascot SVG ── -->
        <div
          class="pointer-events-auto"
          :class="[stateClass, lookUpClass]"
          :style="{ width: mascotSize + 'px', height: mascotSize + 'px' }"
          @click="tama.onMascotTap()"
        >
          <div class="wrap absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              :width="mascotSize"
              :height="mascotSize"
              aria-hidden="true"
              class="overflow-visible"
            >
              <!-- Ground shadow (OUTSIDE body group — stays planted) -->
              <ellipse class="ground-shadow" cx="50" cy="92" rx="28" ry="2.5" fill="black" opacity="0.15" />

              <!-- Body group — breathes / hops / shakes -->
              <g class="body" style="transform-origin: 50% 100%">
                <!-- Body path with ear variant -->
                <defs>
                  <clipPath :id="clipId">
                    <path :d="earVariant.body" />
                  </clipPath>
                </defs>
                <path :d="earVariant.body" fill="white" stroke="black" stroke-width="3" />
                <!-- Black ear tassels, clipped -->
                <g :clip-path="`url(#${clipId})`">
                  <path :d="earVariant.tasselL" fill="black" />
                  <path :d="earVariant.tasselR" fill="black" />
                </g>

                <!-- Cheek dots (tamagotchi: cheeks ≥ eyes) -->
                <circle cx="30" cy="62" r="3.8" fill="black" opacity="0.15" />
                <circle cx="70" cy="62" r="3.8" fill="black" opacity="0.15" />

                <!-- ═══════ FACE: eyes + mouth per state ═══════ -->

                <!-- IDLE eyes: chevron family > < -->
                <g v-if="tama.currentState.value === 'idle'" class="eyes">
                  <path d="M 37 50 L 41 53 L 37 56" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 63 50 L 59 53 L 63 56" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </g>

                <!-- WOW eyes: large bold chevrons -->
                <g v-else-if="tama.currentState.value === 'wow'">
                  <path d="M 35 46 L 44 52 L 35 58" stroke="black" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 65 46 L 56 52 L 65 58" stroke="black" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </g>

                <!-- CHARGE-UP eyes: arc family ⌢ ⌢ -->
                <g v-else-if="tama.currentState.value === 'charge-up'">
                  <path d="M 35 53 Q 40 47 45 53" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                  <path d="M 55 53 Q 60 47 65 53" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                </g>

                <!-- WAVE eyes: happy carets ^ ^ -->
                <g v-else-if="tama.currentState.value === 'wave'" class="eyes">
                  <path d="M 35 54 L 40 49 L 45 54" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 55 54 L 60 49 L 65 54" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </g>

                <!-- PROUD eyes: smug closed arcs -->
                <g v-else-if="tama.currentState.value === 'proud'">
                  <path d="M 35 52 Q 40 48 45 52" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                  <path d="M 55 52 Q 60 48 65 52" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                </g>

                <!-- PONDERING eyes: arcs + accent strokes -->
                <g v-else-if="tama.currentState.value === 'pondering'">
                  <path d="M 35 52 Q 40 47 45 52" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                  <line x1="33" y1="45" x2="36" y2="47" stroke="black" stroke-width="2" stroke-linecap="round" />
                  <path d="M 55 52 Q 60 47 65 52" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                  <line x1="67" y1="45" x2="64" y2="47" stroke="black" stroke-width="2" stroke-linecap="round" />
                </g>

                <!-- FAREWELL eyes: warm closed arcs -->
                <g v-else-if="tama.currentState.value === 'farewell'">
                  <path d="M 35 52 Q 40 48 45 52" stroke="black" stroke-width="2.4" fill="none" stroke-linecap="round" />
                  <path d="M 55 52 Q 60 48 65 52" stroke="black" stroke-width="2.4" fill="none" stroke-linecap="round" />
                </g>

                <!-- DELIGHT eyes: heart-shape, pulsing -->
                <g v-else-if="tama.currentState.value === 'delight'">
                  <g class="heart-left">
                    <path d="M 40 49 C 36 46, 33 50, 36 53 C 38 55, 40 56, 40 57 C 40 56, 42 55, 44 53 C 47 50, 44 46, 40 49 Z" fill="black" />
                  </g>
                  <g class="heart-right">
                    <path d="M 60 49 C 56 46, 53 50, 56 53 C 58 55, 60 56, 60 57 C 60 56, 62 55, 64 53 C 67 50, 64 46, 60 49 Z" fill="black" />
                  </g>
                </g>

                <!-- SURPRISED eyes: tight chevrons >_< -->
                <g v-else-if="tama.currentState.value === 'surprised'">
                  <path d="M 38 51 L 41 53 L 38 55" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 62 51 L 59 53 L 62 55" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </g>

                <!-- SMUG-WINK eyes: asymmetric arcs -->
                <g v-else-if="tama.currentState.value === 'smug-wink'">
                  <path d="M 36 51 Q 40 48 44 51" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />
                  <path d="M 55 52 Q 60 54 65 52" stroke="black" stroke-width="2.8" fill="none" stroke-linecap="round" />
                </g>

                <!-- BIG-EYES: wide chevrons + X-sparkle accents -->
                <g v-else-if="tama.currentState.value === 'big-eyes'">
                  <path d="M 35 47 L 44 52 L 35 57" stroke="black" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 65 47 L 56 52 L 65 57" stroke="black" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 28 40 L 32 44 M 32 40 L 28 44" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" />
                  <path d="M 68 40 L 72 44 M 72 40 L 68 44" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" />
                </g>

                <!-- ═══════ MOUTH per state ═══════ -->

                <!-- WOW mouth: open oval -->
                <ellipse v-if="tama.currentState.value === 'wow'" cx="50" cy="67" rx="4.8" ry="5.8" fill="black" />

                <!-- CHARGE-UP mouth: wide smile -->
                <path v-else-if="tama.currentState.value === 'charge-up'" d="M 42 64 Q 50 72 58 64" stroke="black" stroke-width="2.4" fill="none" stroke-linecap="round" />

                <!-- WAVE mouth: smile -->
                <path v-else-if="tama.currentState.value === 'wave'" d="M 44 64 Q 50 70 56 64" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round" />

                <!-- PROUD mouth: confident curve -->
                <path v-else-if="tama.currentState.value === 'proud'" d="M 44 66 Q 50 69 56 66" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round" />

                <!-- PONDERING mouth: flat line -->
                <line v-else-if="tama.currentState.value === 'pondering'" x1="46" y1="66" x2="54" y2="66" stroke="black" stroke-width="2.2" stroke-linecap="round" />

                <!-- FAREWELL mouth: warm smile -->
                <path v-else-if="tama.currentState.value === 'farewell'" d="M 43 65 Q 50 69 57 65" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round" />

                <!-- DELIGHT mouth: wide joyful -->
                <path v-else-if="tama.currentState.value === 'delight'" d="M 40 64 Q 50 73 60 64" stroke="black" stroke-width="2.6" fill="none" stroke-linecap="round" />

                <!-- SURPRISED mouth: tiny circle -->
                <circle v-else-if="tama.currentState.value === 'surprised'" cx="50" cy="65" r="1.6" fill="black" />

                <!-- SMUG-WINK mouth: asymmetric -->
                <path v-else-if="tama.currentState.value === 'smug-wink'" d="M 44 66 Q 48 64 52 65 L 58 66" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round" />

                <!-- BIG-EYES mouth: small smile -->
                <path v-else-if="tama.currentState.value === 'big-eyes'" d="M 45 64 Q 50 68 55 64" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round" />

                <!-- IDLE mouth: gentle curve -->
                <path v-else d="M 46 64 Q 50 67 54 64" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" />

                <!-- ═══════ WAVE ARMS (jumping-jack) ═══════ -->
                <template v-if="tama.currentState.value === 'wave'">
                  <g class="arm-r-jj" style="transform-origin: 78px 62px">
                    <path d="M 78 62 Q 88 56 90 48" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" />
                  </g>
                  <g class="arm-l-jj" style="transform-origin: 22px 62px">
                    <path d="M 22 62 Q 12 56 10 48" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" />
                  </g>
                </template>
              </g>

              <!-- Sparkles for charge-up -->
              <g v-if="tama.currentState.value === 'charge-up'">
                <g
                  v-for="sp in SPARKLE_POSITIONS"
                  :key="`sp-${sp.x}-${sp.y}`"
                  :style="{
                    animation: `mascot-spark 1.1s ease-out infinite ${sp.delay}ms`,
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }"
                >
                  <path :d="sparklePath(sp.x, sp.y)" fill="black" />
                </g>
              </g>

              <!-- Burst for wow -->
              <g v-if="tama.currentState.value === 'wow'">
                <circle
                  v-for="b in BURST_POSITIONS"
                  :key="`burst-${b.delay}`"
                  :cx="b.x"
                  :cy="b.y"
                  r="2.5"
                  fill="black"
                  :style="{
                    animation: `mascot-burst 0.9s ease-out infinite ${b.delay}ms`,
                    '--tx': b.tx + 'px',
                    '--ty': b.ty + 'px',
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style>
/* ═══════════════════════════════════════════════════════════════════════════
   MASCOT KEYFRAMES — prefixed mascot-* per TAMA-MASCOT-GUIDE §2 Rule 5.
   Moved from React inline MASCOT_CSS const to Vue <style> block.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Body breathing & blink ─────────────────────────────────────── */
@keyframes mascot-breathe {
  0%, 100% { transform: scaleY(1); }
  50%      { transform: scaleY(1.04); }
}
@keyframes mascot-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  94%, 98%      { transform: scaleY(0.1); }
}

/* ── Wave: small bow + arm swing ─────────────────────────────────── */
@keyframes mascot-wave-body {
  0%, 100% { transform: rotate(0deg); }
  25%      { transform: rotate(-6deg); }
  75%      { transform: rotate(6deg); }
}
@keyframes mascot-jj-right {
  0%, 100% { transform: rotate(-15deg); }
  50%      { transform: rotate(20deg); }
}
@keyframes mascot-jj-left {
  0%, 100% { transform: rotate(15deg); }
  50%      { transform: rotate(-20deg); }
}

/* ── Sleepy: slow heave ──────────────────────────────────────────── */
@keyframes mascot-sleepy-breathe {
  0%, 100% { transform: scaleY(1) translateY(0); }
  50%      { transform: scaleY(1.06) translateY(2px); }
}
@keyframes mascot-z-float {
  0%        { opacity: 0; transform: translate(0, 0) scale(0.6); }
  20%       { opacity: 1; transform: translate(2px, -4px) scale(0.95); }
  60%       { opacity: 0.55; transform: translate(6px, -10px) scale(1); }
  85%, 100% { opacity: 0; transform: translate(7px, -12px) scale(1); }
}
@keyframes mascot-sleep-breath {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-2.5px) scale(1.02); }
}

/* ── Heart-beat (delight) ─────────────────────────────────────────── */
@keyframes mascot-heart-beat {
  0%, 40%, 100% { transform: scale(1); }
  15%           { transform: scale(1.25); }
  25%           { transform: scale(1.08); }
}

/* ── Charge-up: hop + sparkle ────────────────────────────────────── */
@keyframes mascot-charge-hop {
  0%, 100% { transform: translateY(0) scale(1); }
  40%      { transform: translateY(-10px) scale(1.05); }
  60%      { transform: translateY(-8px) scale(1.05); }
}
@keyframes mascot-spark {
  0%   { opacity: 0; transform: scale(0.4) rotate(0deg); }
  40%  { opacity: 1; transform: scale(1.1) rotate(60deg); }
  100% { opacity: 0; transform: scale(0.6) rotate(120deg); }
}

/* ── Wow: shake + burst ──────────────────────────────────────────── */
@keyframes mascot-shake {
  0%, 100% { transform: translateX(0); }
  10%      { transform: translateX(-3px) rotate(-2deg); }
  20%      { transform: translateX(3px) rotate(2deg); }
  30%      { transform: translateX(-3px) rotate(-2deg); }
  40%      { transform: translateX(3px) rotate(2deg); }
  50%      { transform: translateX(-2px); }
  60%      { transform: translateX(2px); }
  70%      { transform: translateX(0); }
}
@keyframes mascot-burst {
  0%   { opacity: 0; transform: scale(0); }
  30%  { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(1.6) translate(var(--tx, 0), var(--ty, 0)); }
}

/* ── Proud: confident bounce ──────────────────────────────────────── */
@keyframes mascot-proud-bounce {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px) scaleY(1.02); }
}

/* ── Pondering: gentle tilt ───────────────────────────────────────── */
@keyframes mascot-ponder-tilt {
  0%, 100% { transform: rotate(-2deg); }
  50%      { transform: rotate(1.5deg); }
}

/* ── Farewell: settling ───────────────────────────────────────────── */
@keyframes mascot-farewell-settle {
  0%, 100% { transform: translateY(1px); }
  50%      { transform: translateY(2px) scaleY(0.98); }
}

/* ── Bubble in/out ────────────────────────────────────────────────── */
/* Pure scale + fade per STRATEGY-Visual-Identity §6.3.2.
   Positioning (translateX(-50%) on mobile) is now applied to the OUTER
   wrapper div, so the keyframe doesn't need to bake it in. */
@keyframes mascot-bubble-in {
  0%   { opacity: 0; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes mascot-bubble-out {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.95); }
}

/* ── Shadow hop (charge-up only) ─────────────────────────────────── */
@keyframes mascot-shadow-charge-hop {
  0%, 100% { transform: scaleX(1) scaleY(1); opacity: 0.15; }
  50%      { transform: scaleX(0.75) scaleY(0.7); opacity: 0.08; }
}

/* ═══════════════════════════════════════════════════════════════════════
   STATE-DRIVEN ANIMATION CLASSES
   Applied to .body (inside SVG), NOT to .wrap — so ground-shadow stays.
   ═════════════════════════════════════════════════════════════════════ */

.s-idle .body  { animation: mascot-breathe 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
.s-idle .eyes  { animation: mascot-blink 4s ease-in-out infinite; transform-origin: 50% 50%; }

.s-sleepy .body { animation: mascot-sleepy-breathe 4.5s ease-in-out infinite; transform-origin: 50% 100%; }

.s-wave .body {
  animation: mascot-wave-body 1.2s ease-in-out infinite;
  transform-origin: 50% 100%;
}
.s-wave .arm-r-jj { animation: mascot-jj-right 0.55s ease-in-out infinite; }
.s-wave .arm-l-jj { animation: mascot-jj-left 0.55s ease-in-out infinite; }

.s-charge-up .body {
  animation: mascot-charge-hop 0.5s ease-in-out infinite;
  transform-origin: 50% 100%;
}
.s-charge-up .ground-shadow {
  animation: mascot-shadow-charge-hop 0.5s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

.s-wow .body {
  animation: mascot-shake 0.6s ease-in-out infinite;
  transform-origin: 50% 100%;
}

.s-proud .body {
  animation: mascot-proud-bounce 1.6s ease-in-out infinite;
  transform-origin: 50% 100%;
}

.s-pondering .body {
  animation: mascot-ponder-tilt 4s ease-in-out infinite;
  transform-origin: 50% 100%;
}

.s-farewell .body {
  animation: mascot-farewell-settle 3s ease-in-out infinite;
  transform-origin: 50% 100%;
}

/* ── Delight heart-eyes: pulsing ─────────────────────────────────── */
.s-delight .heart-left {
  animation: mascot-heart-beat 0.72s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.s-delight .heart-right {
  animation: mascot-heart-beat 0.72s ease-in-out infinite 0.12s;
  transform-box: fill-box;
  transform-origin: center;
}

/* ── Look-up (onboarding phrase 4) ────────────────────────────────── */
.mascot-look-up .wrap {
  transform: rotate(-8deg) translateY(-2px);
  transform-origin: 50% 80%;
  transition: transform 400ms ease-out;
}

/* ── Sleeping box Z-floats ────────────────────────────────────────── */
.z-float-1 {
  animation: mascot-z-float 2.4s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.z-float-2 {
  animation: mascot-z-float 2.4s ease-in-out infinite 0.8s;
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
}
.sleep-breath-group {
  transform-origin: 50% 95%;
  transform-box: fill-box;
  animation: mascot-sleep-breath 3.2s ease-in-out infinite;
}

/* ── Bubble animations ────────────────────────────────────────────── */
.bubble-enter {
  animation: mascot-bubble-in 200ms ease-out forwards;
}
.bubble-exit {
  animation: mascot-bubble-out 200ms ease-in forwards;
}
</style>
