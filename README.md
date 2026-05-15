# Prize Engine — Vue 3 SPA

Standalone Vite + Vue 3 SPA для пилота блайндбоксов Apr-Jun 2026.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → ./dist
```

Node 18+ (проверено на 22.22.2).

## Состояние: Фаза 1 + Фаза 2 завершены ✓

### Что работает

- **Scan → Reveal → Take/Exchange** — полная orchestration с 3-фазной анимацией, HMAC spark, Last One bonus, Gold/pool fallback
- **Collection screen** — A/B/C переключатель, claimed-секция, фильтр «Что взять», 2-col grid с прогресс-баром, stickers strip
- **Gifts screen** — корзина received-item'ов, ModalGiftClaim с QR + claim code + Подарок получен / Вернуть
- **Powers screen** — карты-силы (luck/double/keys), активация при K-2
- **Modals** — GiftDetails (с покупкой за заряды), GiftClaim (с return refund)
- **Drop animations** — to-cart (Take/Purchase) и to-collection (MarkClaimed), 900ms
- **TabBar** — 4 таба с badge counts на Корзина/Коллекции
- **Toast система** — 29 триггеров, passive observers (collection/charges/scan-count/partition)
- **Active effects sticky badge** — индикатор готовой силы

### Что НЕ в текущих фазах

- Камера / WebRTC (Фаза 3+)
- Badge ping animation на TabBar при drop — анимация в main.css есть, integration в Фазе 3
- DebugPanel + scan log (Фаза 3)
- ActivityTimeline + Profile screen + Stats overlay + AboutModal (Фаза 3)
- PWA manifest + service worker (Фаза 3)
- Mascot Tama (Фаза 4)

## Структура

```
src/
├── main.js
├── App.vue                    # orchestration (scan/take/exchange/purchase/claim/return)
├── styles/main.css            # 7 tokens + 14 keyframes + grain + fonts
├── config/                    # 5 JSON, source of truth
├── engine/                    # pure JS, без Vue API
│   ├── sha256.js
│   ├── draw-engine.js
│   ├── constants.js
│   ├── state-helpers.js
│   └── triggers.js
├── composables/               # Vue 3 hooks (module-level singletons)
│   ├── usePartition.js
│   ├── useSeries.js
│   ├── useReveal.js
│   ├── useCards.js
│   └── useToast.js
├── components/
│   ├── TopBar.vue
│   ├── TabBar.vue
│   ├── ToastStack.vue
│   ├── RevealOverlay.vue
│   ├── PrizeIcon.vue          # shared icon component
│   ├── ModalGiftDetails.vue   # purchase modal (from Collection)
│   ├── ModalGiftClaim.vue     # claim modal (from Gifts)
│   └── DropAnimation.vue      # to-cart / to-collection overlay
└── screens/
    ├── ScannerScreen.vue
    ├── CollectionScreen.vue
    ├── GiftsScreen.vue
    └── PowersScreen.vue
```

## Проверки

| Тест | Результат |
|---|---|
| `npm run build` | ✓ 1753 модулей, 143 kB JS, 15 kB CSS, 0 warnings |
| Engine smoke (Фаза 1A) | ✓ 11/11 инвариантов |
| E2E Phase 1 (scan/take/exchange) | ✓ 12/12 инвариантов |
| E2E Phase 2 (purchase/claim/return) | ✓ 9/9 инвариантов |

## Жёсткие константы (KB)

| Параметр | Значение |
|---|---|
| Wholesale | 250 ₽ |
| EV призов | 130 ₽ |
| Breakage | 20% |
| Курс | 0.43 ₽/⚡ |
| Base charges | 300 ⚡ |
| Last One bonus | 500 ⚡ |
| Exchange discount | 80% |
| Spark | 25% / 100 ⚡ |
| Cards | 10 (4+4+2), K-2 |

## Расхождения с HANDOFF (зафиксированы)

1. **+1 файл `engine/state-helpers.js`** — pure helpers без Vue API.
2. **CSS FIX:** semantic tokens перенесены внутрь `:root`.
3. **4 таба, не 5** — соответствует реальному коду оригинала.

## DO / DON'T

✅ Composition API + `<script setup>`
✅ composables как module-level singletons
✅ `npm run build` перед каждой сдачей
❌ React в любом виде
❌ Options API
❌ Vue Router
❌ Менять логику draw-engine
❌ bash heredoc для кириллицы

## Next: Фаза 3

См. HANDOFF-Vue-SPA-v3.md §6 Фаза 3:
- Profile screen + ActivityTimeline + Stats overlay
- DebugPanel + scan log
- AboutModal
- Badge ping integration с drop animations (key bump через ref)
- PWA manifest + service worker

Acceptance Фазы 3: установка PWA на iOS Safari работает, debug-режим полностью функционален.
