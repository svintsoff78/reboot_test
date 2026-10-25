<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { rubles, type Daily } from './api'
import { longDate, shortDate } from './format'

const props = defineProps<{ daily: Daily[] }>()

const W = 720, H = 240, PAD = { top: 12, right: 8, bottom: 26, left: 8 }
const plotH = H - PAD.top - PAD.bottom
const step = computed(() => (W - PAD.left - PAD.right) / Math.max(props.daily.length, 1))
const barW = computed(() => Math.max(Math.min(step.value * 0.36, 14), 1))
const max = computed(() => Math.max(1, ...props.daily.flatMap(d => [d.payments, d.refunds])))
const y = (value: number) => PAD.top + plotH - (value / max.value) * plotH
const ticks = computed(() => [1, 0.5].map(k => ({ y: y(max.value * k), label: rubles(Math.round(max.value * k)) })))
const labelEvery = computed(() => Math.ceil(props.daily.length / 10))

// Выбранный день: наведение мышью или стрелки клавиатуры при фокусе на графике.
const active = ref<number | null>(null)
watch(() => props.daily, () => { active.value = null })
const activeDay = computed(() => (active.value === null ? null : props.daily[active.value]))

function onKey(event: KeyboardEvent) {
  const last = props.daily.length - 1
  const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
  if (event.key in moves) active.value = Math.min(last, Math.max(0, (active.value ?? -moves[event.key]) + moves[event.key]))
  else if (event.key === 'Home') active.value = 0
  else if (event.key === 'End') active.value = last
  else return
  event.preventDefault()
}
</script>

<template>
  <div>
    <p class="legend muted"><span class="blue-dot">■</span> Платежи <span class="red-dot">■</span> Возвраты</p>
    <p class="chart-readout" aria-live="polite">
      <template v-if="activeDay">
        <strong>{{ longDate(activeDay.date) }}</strong>: платежи {{ rubles(activeDay.payments) }},
        возвраты {{ rubles(activeDay.refunds) }}, чистый поток {{ rubles(activeDay.net_cash) }}
      </template>
      <span v-else class="muted">Наведите на столбец или выберите график и листайте дни стрелками ← →.</span>
    </p>
    <div class="chart-scroll">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" tabindex="0"
           aria-label="График платежей и возвратов по дням. Стрелки влево и вправо выбирают день; точные значения есть в таблице ниже."
           @keydown="onKey" @mouseleave="active = null" @blur="active = null">
        <g v-for="t in ticks" :key="t.y">
          <line :x1="PAD.left" :x2="W - PAD.right" :y1="t.y" :y2="t.y" class="grid" />
          <text :x="W - PAD.right" :y="t.y - 4" text-anchor="end" class="tick">{{ t.label }}</text>
        </g>
        <line :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top + plotH" :y2="PAD.top + plotH" class="axis" />
        <g v-for="(d, i) in daily" :key="d.date" @mouseenter="active = i">
          <rect :x="PAD.left + i * step" :y="PAD.top" :width="step" :height="plotH"
                :class="['hit', { 'hit-active': active === i }]" />
          <rect :x="PAD.left + i * step + step / 2 - barW" :y="y(d.payments)" :width="barW"
                :height="PAD.top + plotH - y(d.payments)" class="bar-payments" />
          <rect :x="PAD.left + i * step + step / 2" :y="y(d.refunds)" :width="barW"
                :height="PAD.top + plotH - y(d.refunds)" class="bar-refunds" />
          <text v-if="i % labelEvery === 0" :x="PAD.left + i * step + step / 2" :y="H - 8"
                text-anchor="middle" class="tick">{{ shortDate(d.date) }}</text>
          <title>{{ longDate(d.date) }}: платежи {{ rubles(d.payments) }}, возвраты {{ rubles(d.refunds) }}</title>
        </g>
      </svg>
    </div>
    <details>
      <summary>Точные значения по дням</summary>
      <div class="table-scroll">
        <table>
          <caption class="sr-only">Платежи, возвраты и чистый поток по дням (Москва)</caption>
          <thead><tr><th scope="col">Дата</th><th scope="col">Платежи</th><th scope="col">Возвраты</th><th scope="col">Чистый поток</th></tr></thead>
          <tbody>
            <tr v-for="d in daily" :key="d.date">
              <th scope="row">{{ longDate(d.date) }}</th><td>{{ rubles(d.payments) }}</td>
              <td>{{ rubles(d.refunds) }}</td><td :class="{ negative: d.net_cash < 0 }">{{ rubles(d.net_cash) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>
