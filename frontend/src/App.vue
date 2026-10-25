<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchStudios, rubles, type Filters, type Studio } from './api'
import { createReportLoader } from './reportLoader'

const filters = reactive<Filters>({ start: '2026-04-01', end: '2026-04-30', studio: '' })
const studios = ref<Studio[]>([])
const catalogError = ref('')
const { state, load } = createReportLoader()
const report = computed(() => state.value.data)
const apply = () => { void load(filters) }
async function catalog() {
  catalogError.value = ''
  try { studios.value = await fetchStudios() }
  catch { catalogError.value = 'Не удалось загрузить список студий.' }
}
onMounted(() => { void catalog(); apply() })
</script>

<template>
  <main>
    <header class="page-header"><div><p class="brand">REBOOT <span>учебная аналитика</span></p><h1>Денежный поток</h1><p class="muted">Платежи и возвраты · синтетические данные · время Москвы</p></div><span class="badge">Локальный стенд</span></header>
    <form class="panel filters" @submit.prevent="apply">
      <label>С даты<input v-model="filters.start" type="date" required></label>
      <label>По дату включительно<input v-model="filters.end" type="date" required></label>
      <label>Студия<select v-model="filters.studio"><option value="">Вся сеть</option><option v-for="s in studios" :key="s.id" :value="s.id">{{ s.title }}</option></select></label>
      <button type="submit">Показать</button>
      <p class="muted filter-hint">После изменения фильтров нажмите «Показать».</p>
    </form>
    <p v-if="catalogError" class="notice" role="alert">{{ catalogError }} <button class="text-button" @click="catalog">Повторить список</button></p>
    <section aria-live="polite" :aria-busy="state.status === 'loading'">
      <p v-if="state.status === 'loading'" class="panel">Загружаем отчёт…</p>
      <div v-else-if="state.status === 'error'" class="panel notice" role="alert">{{ state.error }} <button @click="apply">Повторить</button></div>
      <template v-else-if="report">
        <p class="report-period">Отчёт: {{ report.filters.start }} — {{ report.filters.end }} · {{ report.filters.studio || 'Вся сеть' }}</p>
        <div class="kpi-grid">
          <article class="panel kpi"><h2>Платежи</h2><strong>{{ rubles(report.summary.payments) }}</strong><p>Успешные операции за период</p></article>
          <article class="panel kpi accent"><h2>Чистый поток</h2><strong>{{ rubles(report.summary.net_cash) }}</strong><p>Платежи минус возвраты</p></article>
        </div>
        <section class="panel"><h2>Студии</h2><div class="table-scroll"><table><caption class="sr-only">Начальный отчёт по студиям</caption><thead><tr><th scope="col">Студия</th><th scope="col">Заказы</th><th scope="col">Платежи</th></tr></thead><tbody><tr v-for="s in report.studios" :key="s.id"><th scope="row">{{ s.title }}</th><td>{{ s.paid_orders }}</td><td>{{ rubles(s.payments) }}</td></tr></tbody></table></div></section>
      </template>
    </section>
    <footer>Учебный REBOOT · Чистый денежный поток не является начисленной выручкой. Данные не относятся к реальным клиентам.</footer>
  </main>
</template>
