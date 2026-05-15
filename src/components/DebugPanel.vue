<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// DebugPanel.vue — Phase 3. Full-screen overlay for dev/test.
// Three tabs: QR grid (force-scan), State (partition meta, tiers, seeds), Log.
// Source: PrizeEnginePWA.jsx (3088-3491).
// ═══════════════════════════════════════════════════════════════════════════
import { ref, computed } from 'vue'
import { Bug, X, Trash2 } from 'lucide-vue-next'
import { usePartition } from '../composables/usePartition.js'
import { useSeries } from '../composables/useSeries.js'
import { useCards } from '../composables/useCards.js'
import {
  TIER_ORDER, TIER_META, CARD_META,
  SLOT_CATALOG, enginePoolToUiCollection,
} from '../engine/constants.js'
import {
  buildQrForBox, summarizeStateByTier,
  fmtCharges, slotInfoById,
} from '../engine/state-helpers.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  scanLog: { type: Array, default: () => [] },
  scannedQrs: { type: Object, default: () => new Set() },
  serverSeed: { type: String, default: '' },
  clientSeed: { type: String, default: '' },
  nonce: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'force-scan', 'reset-partition'])

const { partitionState, summary: tierSummary } = usePartition()
const { activeSeries, currentSeries } = useSeries()
const { activeEffects } = useCards()

const activeSection = ref('qrs')

// Build all 100 QR codes once
const allQrs = computed(() => {
  const out = []
  for (let i = 1; i <= 100; i++) out.push(buildQrForBox(i))
  return out
})

const goldSlot = computed(
  () => partitionState.value.slots.find(s => s.variant === 'Gold')
)

function onForceScan(qr) {
  emit('force-scan', qr)
}

function onReset() {
  emit('reset-partition')
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-stretch"
    style="background: rgba(0,0,0,0.92)"
  >
    <div
      class="flex-1 max-w-[420px] mx-auto flex flex-col"
      style="background: #FFFFFF; border-left: 1px solid #C8C8C8; border-right: 1px solid #C8C8C8"
    >
      <!-- DEV MODE banner — единственный красный в платформенном UI -->
      <div
        class="px-4 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.3em]"
        style="background: #DC2626; color: #000000"
      >
        ⚠ Режим разработки · debug
      </div>

      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3"
        style="border-bottom: 1px solid #C8C8C8"
      >
        <div class="flex items-center gap-2">
          <Bug :size="16" color="#000000" />
          <span class="font-mono text-xs uppercase tracking-[0.2em]" style="color: #000000">
            Debug · {{ activeSeries }}
          </span>
        </div>
        <button type="button" style="color: #8A8A8A" @click="emit('close')">
          <X :size="20" />
        </button>
      </div>

      <!-- Tab switcher -->
      <div class="flex" style="border-bottom: 1px solid #C8C8C8">
        <button
          v-for="t in [
            { id: 'qrs', label: 'QR' },
            { id: 'state', label: 'State' },
            { id: 'log', label: `Log · ${scanLog.length}` },
          ]"
          :key="t.id"
          type="button"
          class="flex-1 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors"
          :style="{
            color: activeSection === t.id ? '#000000' : '#8A8A8A',
            borderBottom: activeSection === t.id ? '2px solid #000000' : '2px solid transparent',
          }"
          @click="activeSection = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-4 py-4">

        <!-- ═══ QRS TAB ═══ -->
        <div v-if="activeSection === 'qrs'" class="space-y-4">
          <div class="text-[11px] leading-relaxed" style="color: #8A8A8A">
            Коснись QR чтобы симулировать скан. Серые — уже раскрыты.
            <br>В debug видны engine pool letters (A/B/C). В player UI — UI letters инвертированы.
          </div>

          <!-- Active effects reminder -->
          <div
            v-if="activeEffects.luckActive || activeEffects.doubleActive || activeEffects.forcePoolC"
            class="p-2"
            style="background: #FFFFFF; border: 1px solid #000000; border-radius: 2px"
          >
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-mono text-[9px] uppercase tracking-wider" style="color: #000000">Armed:</span>
              <span v-if="activeEffects.luckActive" class="font-mono text-[10px]" style="color: #4A4A4A">luck</span>
              <span v-if="activeEffects.doubleActive" class="font-mono text-[10px]" style="color: #4A4A4A">double</span>
              <span v-if="activeEffects.forcePoolC" class="font-mono text-[10px]" style="color: #4A4A4A">keys→C</span>
            </div>
          </div>

          <!-- Pool A — engine A → UI C -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                Engine A · Standard · 70 коробок · UI:C
              </span>
              <span class="font-mono text-[10px]" style="color: #8A8A8A">0001-0070</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="qr in allQrs.slice(0, 70)"
                :key="qr"
                type="button"
                :disabled="scannedQrs.has(qr)"
                class="aspect-square font-mono text-[9px] transition-all"
                :style="{
                  background: scannedQrs.has(qr) ? '#FFFFFF' : '#EEEEEE',
                  color: scannedQrs.has(qr) ? '#C8C8C8' : '#000000',
                  textDecoration: scannedQrs.has(qr) ? 'line-through' : 'none',
                  border: '1px solid ' + (scannedQrs.has(qr) ? '#EEEEEE' : '#C8C8C8'),
                  borderRadius: '2px',
                  cursor: scannedQrs.has(qr) ? 'not-allowed' : 'pointer',
                }"
                @click="onForceScan(qr)"
              >
                {{ qr.split('-')[2] }}
              </button>
            </div>
          </div>

          <!-- Pool B — engine B → UI B -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
                Engine B · Collector · 25 коробок · UI:B
              </span>
              <span class="font-mono text-[10px]" style="color: #8A8A8A">0071-0095</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="qr in allQrs.slice(70, 95)"
                :key="qr"
                type="button"
                :disabled="scannedQrs.has(qr)"
                class="aspect-square font-mono text-[9px] transition-all"
                :style="{
                  background: scannedQrs.has(qr) ? '#FFFFFF' : '#EEEEEE',
                  color: scannedQrs.has(qr) ? '#C8C8C8' : '#000000',
                  textDecoration: scannedQrs.has(qr) ? 'line-through' : 'none',
                  border: '1px solid ' + (scannedQrs.has(qr) ? '#EEEEEE' : '#000000'),
                  borderRadius: '2px',
                  cursor: scannedQrs.has(qr) ? 'not-allowed' : 'pointer',
                }"
                @click="onForceScan(qr)"
              >
                {{ qr.split('-')[2] }}
              </button>
            </div>
          </div>

          <!-- Pool C — engine C → UI A -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #000000">
                Engine C · Hunter · 5 коробок · UI:A
              </span>
              <span class="font-mono text-[10px]" style="color: #8A8A8A">0096-0100</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="qr in allQrs.slice(95, 100)"
                :key="qr"
                type="button"
                :disabled="scannedQrs.has(qr)"
                class="aspect-square font-mono text-[9px] transition-all"
                :style="{
                  background: scannedQrs.has(qr) ? '#FFFFFF' : '#000000',
                  color: scannedQrs.has(qr) ? '#C8C8C8' : '#FFFFFF',
                  textDecoration: scannedQrs.has(qr) ? 'line-through' : 'none',
                  border: '1px solid ' + (scannedQrs.has(qr) ? '#EEEEEE' : '#000000'),
                  borderRadius: '2px',
                  cursor: scannedQrs.has(qr) ? 'not-allowed' : 'pointer',
                }"
                @click="onForceScan(qr)"
              >
                {{ qr.split('-')[2] }}
              </button>
            </div>
          </div>
        </div>

        <!-- ═══ STATE TAB ═══ -->
        <div v-if="activeSection === 'state'" class="space-y-4">
          <!-- Player state -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Player ({{ activeSeries }})
            </div>
            <div class="grid grid-cols-2 gap-1 font-mono text-[10px]">
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">charges</span>
                <span style="color: #000000">{{ fmtCharges(currentSeries.charges) }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">earned</span>
                <span style="color: #000000">{{ fmtCharges(currentSeries.totalEarned) }}</span>
              </div>
            </div>
          </section>

          <!-- Partition meta -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Partition meta
            </div>
            <div class="grid grid-cols-2 gap-1 font-mono text-[10px]">
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">series</span>
                <span style="color: #000000">{{ partitionState.partition.seriesId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">wave</span>
                <span style="color: #000000">{{ partitionState.partition.waveId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">partner</span>
                <span style="color: #000000">{{ partitionState.partition.partnerId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">park</span>
                <span style="color: #000000">{{ partitionState.partition.parkId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">partition</span>
                <span style="color: #000000">{{ partitionState.partition.partitionId }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">sold</span>
                <span style="color: #000000">{{ partitionState.partition.soldCount }}/100</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">status</span>
                <span style="color: #000000">{{ partitionState.partition.status }}</span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">gold</span>
                <span :style="{ color: partitionState.partition.goldRareClaimed ? '#000000' : '#4A4A4A' }">
                  {{ partitionState.partition.goldRareClaimed ? 'claimed' : 'available' }}
                </span>
              </div>
              <div class="flex justify-between p-2" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">lastone</span>
                <span :style="{ color: partitionState.partition.lastOneGiven ? '#000000' : '#4A4A4A' }">
                  {{ partitionState.partition.lastOneGiven ? 'given' : 'pending' }}
                </span>
              </div>
            </div>
          </section>

          <!-- Tiers remaining -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Тиры (осталось)
            </div>
            <div class="space-y-1">
              <div
                v-for="tier in TIER_ORDER"
                :key="tier"
                class="flex items-center gap-2 p-2"
                style="background: #FFFFFF; border-radius: 2px"
              >
                <div class="w-2 h-2" style="background: #4A4A4A"></div>
                <span class="font-mono text-[11px] flex-1" style="color: #000000">
                  {{ TIER_META[tier].label }}
                </span>
                <span class="font-mono text-[11px]" style="color: #000000">
                  {{ tierSummary[tier] || 0 }} / {{ SLOT_CATALOG.filter(s => s.tier === tier).reduce((a, s) => a + s.count, 0) }}
                </span>
              </div>
            </div>
          </section>

          <!-- Gold slot -->
          <section v-if="goldSlot" class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Gold slot
            </div>
            <div class="p-2" style="background: #FFFFFF; border: 1px solid #000000; border-radius: 2px">
              <div class="font-mono text-[10px]" style="color: #000000">
                {{ goldSlot.slotId }} · remaining: {{ goldSlot.remainingCount }}
              </div>
            </div>
          </section>

          <!-- Cards remaining (partition supply, not player inventory) -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Карточки (остаток партии)
            </div>
            <div class="grid grid-cols-3 gap-1">
              <div
                v-for="c in partitionState.cards"
                :key="c.cardType"
                class="p-2"
                style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px"
              >
                <div class="font-mono text-[10px]" style="color: #4A4A4A">{{ CARD_META[c.cardType]?.label }}</div>
                <div class="font-mono text-sm" style="color: #000000">
                  {{ c.remainingCount }} / {{ c.initialCount }}
                </div>
              </div>
            </div>
          </section>

          <!-- Seeds — full reveal in debug always -->
          <section class="space-y-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em]" style="color: #4A4A4A">
              Provably fair · raw seeds
            </div>
            <div class="space-y-1 font-mono text-[9px]">
              <div class="p-2" style="background: #FFFFFF; border-radius: 2px">
                <div style="color: #8A8A8A">server_seed (full)</div>
                <div class="break-all" style="color: #000000">{{ serverSeed }}</div>
              </div>
              <div class="p-2" style="background: #FFFFFF; border-radius: 2px">
                <div style="color: #8A8A8A">client_seed</div>
                <div class="break-all" style="color: #000000">{{ clientSeed }}</div>
              </div>
              <div class="p-2 flex justify-between" style="background: #FFFFFF; border-radius: 2px">
                <span style="color: #8A8A8A">nonce</span>
                <span style="color: #000000">{{ nonce }}</span>
              </div>
            </div>
          </section>

          <!-- Reset -->
          <button
            type="button"
            class="w-full mt-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
            style="background: #FFFFFF; color: #DC2626; border: 1px solid #DC2626; border-radius: 4px"
            @click="onReset"
          >
            <Trash2 :size="14" />
            Сбросить партию
          </button>
        </div>

        <!-- ═══ LOG TAB ═══ -->
        <div v-if="activeSection === 'log'" class="space-y-1.5">
          <div
            v-if="scanLog.length === 0"
            class="text-center text-[11px] py-8"
            style="color: #C8C8C8"
          >
            Лог пуст. Отсканируй первый QR.
          </div>
          <template v-else>
            <div
              v-for="(entry, i) in [...scanLog].reverse()"
              :key="i"
              class="p-2 font-mono text-[9px] space-y-0.5"
              style="background: #FFFFFF; border: 1px solid #C8C8C8; border-radius: 2px"
            >
              <div class="flex items-center justify-between">
                <span style="color: #4A4A4A">
                  #{{ scanLog.length - i }} · {{ entry.qrCode }}
                </span>
                <span style="color: #000000">
                  {{ TIER_META[entry.tier]?.label || entry.tier }}
                  <template v-if="entry.variant !== 'Normal'"> · {{ entry.variant }}</template>
                </span>
              </div>
              <div class="truncate" style="color: #8A8A8A">
                → {{ entry.revealedSlotId }} · engine:{{ entry.pool }} · UI:{{ enginePoolToUiCollection(entry.pool) }}
              </div>
              <div class="flex gap-2 flex-wrap" style="color: #8A8A8A">
                <span>+{{ entry.chargesAwarded }}⚡</span>
                <span
                  v-if="entry.cardFound && entry.cardFound !== 'none'"
                  style="color: #000000"
                >card:{{ entry.cardFound }}</span>
                <span v-if="entry.effects?.luckActive" style="color: #4A4A4A">+luck</span>
                <span v-if="entry.effects?.doubleActive" style="color: #4A4A4A">+double</span>
                <span v-if="entry.effects?.forcePoolC" style="color: #4A4A4A">+keys</span>
                <span v-if="entry.wasLastOne" style="color: #000000">★LAST</span>
                <span v-if="entry.wasPoolFallback" style="color: #DC2626">pool-fallback</span>
              </div>
              <div class="truncate" style="color: #C8C8C8">
                hmac:{{ entry.slotHmacHex?.substring(0, 16) }}…
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
