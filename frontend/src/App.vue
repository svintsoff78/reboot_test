<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { fetchStudios, rubles, type Filters, type Metrics, type Studio } from './api'
import { createReportLoader } from './reportLoader'
import { periodLabel, validatePeriod } from './format'
import DailyChart from './DailyChart.vue'
import OperationsTable from './OperationsTable.vue'

const filters = reactive<Filters>({ start: '2026-04-01', end: '2026-04-30', studio: '' })
const studios = ref<Studio[]>([])
const catalogError = ref('')
const formError = ref('')
const { state, applied, load, retry } = createReportLoader()
const report = computed(() => state.value.data)
/** Какие операции раскрыты: по клику на карточку «Платежи» или «Возвраты». */
const details = ref<'payment' | 'refund' | null>(null)
const operationsHeading = ref<HTMLElement | null>(null)

const studioTitles = computed<Record<string, string>>(() => Object.fromEntries(
  [...studios.value, ...(report.value?.studios ?? [])].map(s => [s.id, s.title])))
const studioName = (id: string) => (id ? studioTitles.value[id] ?? id : 'Вся сеть')
const dirty = computed(() => !!applied.value && (applied.value.start !== filters.start
  || applied.value.end !== filters.end || applied.value.studio !== filters.studio))
const isEmpty = computed(() => !!report.value && report.value.operations.length === 0)

function apply() {
  formError.value = validatePeriod(filters)
  if (formError.value) return
  void load({ ...filters })
}
/** Клик по студии или «Вся сеть»: меняет общий фильтр, сохраняя применённый период. */
function selectStudio(id: string) {
  if (applied.value) { filters.start = applied.value.start; filters.end = applied.value.end }
  filters.studio = id
  apply()
}
function setPeriod(start: string, end: string) { filters.start = start; filters.end = end; apply() }
async function openDetails(kind: 'payment' | 'refund') {
  details.value = details.value === kind ? null : kind
  if (details.value) { await nextTick(); operationsHeading.value?.focus() }
}
async function catalog() {
  catalogError.value = ''
  try { studios.value = await fetchStudios() }
  catch { catalogError.value = 'Не удалось загрузить список студий.' }
}
onMounted(() => { void catalog(); apply() })

const kpis: { key: keyof Metrics; title: string; hint: string; money: boolean; drill?: 'payment' | 'refund' }[] = [
  { key: 'paid_orders', title: 'Оплаченные заказы', hint: 'Заказы с успешным платежом в периоде', money: false },
  { key: 'payments', title: 'Платежи', hint: 'Показать операции', money: true, drill: 'payment' },
  { key: 'refunds', title: 'Возвраты', hint: 'Показать операции', money: true, drill: 'refund' },
  { key: 'net_cash', title: 'Чистый денежный поток', hint: 'Платежи минус возвраты, не выручка', money: true },
  { key: 'td_buyers', title: 'ТД-покупатели', hint: 'Уникальные клиенты, купившие пробное', money: false },
]
const show = (value: number, money: boolean) => (money ? rubles(value) : value.toLocaleString('ru-RU'))
</script>

<template>
  <main>
    <header class="page-header"><div><p class="brand">REBOOT <span>учебная аналитика</span></p><h1>Денежный поток</h1><p class="muted">Платежи и возвраты · синтетические данные · время Москвы</p></div><span class="badge">Локальный стенд</span></header>

    <form class="panel filters" novalidate @submit.prevent="apply">
      <label>С даты<input v-model="filters.start" type="date" required :aria-invalid="!!formError" aria-describedby="filter-error"></label>
      <label>По дату включительно<input v-model="filters.end" type="date" required :aria-invalid="!!formError" aria-describedby="filter-error"></label>
      <label>Студия<select v-model="filters.studio"><option value="">Вся сеть</option><option v-for="s in studios" :key="s.id" :value="s.id">{{ s.title }}</option></select></label>
      <button type="submit">Показать</button>
      <div class="presets" role="group" aria-label="Быстрый выбор периода">
        <button type="button" class="chip" @click="setPeriod('2026-04-01', '2026-04-30')">Апрель 2026</button>
        <button type="button" class="chip" @click="setPeriod('2026-05-01', '2026-05-31')">Май 2026</button>
        <button type="button" class="chip" @click="setPeriod('2026-04-01', '2026-05-31')">Апрель–май</button>
      </div>
      <p id="filter-error" class="filter-hint" :class="formError ? 'form-error' : 'muted'" :role="formError ? 'alert' : undefined">
        {{ formError || (dirty ? 'Фильтры изменены — нажмите «Показать», чтобы применить.' : 'Даты по Москве, обе включительно, не более 93 дней.') }}
      </p>
    </form>
    <p v-if="catalogError" class="notice panel" role="alert">{{ catalogError }} <button class="text-button" @click="catalog">Повторить список</button></p>

    <section aria-live="polite" :aria-busy="state.status === 'loading'">
      <p v-if="applied" class="report-period">
        <strong>{{ periodLabel(applied.start, applied.end) }}</strong> · {{ studioName(applied.studio) }}
        <button v-if="applied.studio && state.status !== 'loading'" type="button" class="text-button" @click="selectStudio('')">← Вся сеть</button>
      </p>
      <p v-if="state.status === 'loading'" class="panel">Загружаем отчёт…</p>
      <div v-else-if="state.status === 'error'" class="panel notice" role="alert">{{ state.error }} <button @click="retry">Повторить</button></div>
      <div v-else-if="isEmpty" class="panel empty">
        <h2>Нет операций</h2>
        <p>За выбранный период {{ applied?.studio ? 'в этой студии' : 'в сети' }} не было успешных платежей и возвратов.</p>
        <button v-if="applied?.studio" type="button" @click="selectStudio('')">Показать всю сеть</button>
      </div>
      <template v-else-if="report">
        <div class="kpi-grid">
          <article v-for="k in kpis" :key="k.key" class="panel kpi" :class="{ accent: k.key === 'net_cash', active: k.drill && details === k.drill }">
            <h2>{{ k.title }}</h2>
            <button v-if="k.drill" type="button" class="metric-button" :aria-expanded="details === k.drill" aria-controls="operations"
                    @click="openDetails(k.drill)">{{ show(report.summary[k.key], k.money) }}</button>
            <strong v-else :class="{ negative: report.summary[k.key] < 0 }">{{ show(report.summary[k.key], k.money) }}</strong>
            <p>{{ k.drill && details === k.drill ? 'Скрыть операции' : k.hint }}</p>
          </article>
        </div>

        <section v-if="details" id="operations" class="panel">
          <div class="section-heading">
            <h2 ref="operationsHeading" tabindex="-1">{{ details === 'payment' ? 'Платежи' : 'Возвраты' }}: операции</h2>
            <button type="button" class="text-button" @click="details = null">Закрыть</button>
          </div>
          <OperationsTable :operations="report.operations" :kind="details" :studio-titles="studioTitles"
                           :expected="details === 'payment' ? report.summary.payments : report.summary.refunds" />
        </section>

        <section class="panel">
          <h2>Платежи и возвраты по дням</h2>
          <DailyChart :daily="report.daily" />
        </section>

        <section class="panel">
          <div class="section-heading">
            <h2>Сравнение студий</h2>
            <button v-if="applied?.studio" type="button" class="text-button" @click="selectStudio('')">← Вся сеть</button>
          </div>
          <p class="muted">Нажмите на студию, чтобы отфильтровать весь отчёт.</p>
          <div class="table-scroll">
            <table>
              <caption class="sr-only">Показатели студий за период</caption>
              <thead><tr><th scope="col">Студия</th><th scope="col">Оплаченные заказы</th><th scope="col">Платежи</th><th scope="col">Возвраты</th><th scope="col">Чистый поток</th><th scope="col">ТД-покупатели</th></tr></thead>
              <tbody>
                <tr v-for="s in report.studios" :key="s.id" :class="{ selected: s.id === applied?.studio }">
                  <th scope="row">
                    <button v-if="s.id !== applied?.studio" type="button" class="text-button" @click="selectStudio(s.id)">{{ s.title }}</button>
                    <span v-else>{{ s.title }} <span class="muted">(выбрана)</span></span>
                  </th>
                  <td>{{ s.paid_orders }}</td><td>{{ rubles(s.payments) }}</td><td>{{ rubles(s.refunds) }}</td>
                  <td :class="{ negative: s.net_cash < 0 }">{{ rubles(s.net_cash) }}</td><td>{{ s.td_buyers }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{{ applied?.studio ? 'Итого по студии' : 'Итого по сети' }}</th>
                  <td>{{ report.summary.paid_orders }}</td><td>{{ rubles(report.summary.payments) }}</td><td>{{ rubles(report.summary.refunds) }}</td>
                  <td :class="{ negative: report.summary.net_cash < 0 }">{{ rubles(report.summary.net_cash) }}</td><td>{{ report.summary.td_buyers }}*</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="muted footnote">* Уникальные ТД-покупатели сети считаются отдельно: клиент, купивший пробное в нескольких студиях, учтён в каждой из них, но в итоге — один раз. Поэтому итог может быть меньше суммы строк.</p>
        </section>
      </template>
    </section>
    <footer>Учебный REBOOT · Чистый денежный поток не является начисленной выручкой. Данные не относятся к реальным клиентам.</footer>
  </main>
</template>
