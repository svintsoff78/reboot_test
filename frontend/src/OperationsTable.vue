<script setup lang="ts">
import { computed } from 'vue'
import { rubles, type Operation } from './api'
import { moscowDateTime, plural } from './format'

const props = defineProps<{
  operations: Operation[]
  kind: 'payment' | 'refund'
  /** Значение карточки, с которым должна совпасть сумма строк. */
  expected: number
  studioTitles: Record<string, string>
}>()

const rows = computed(() => props.operations.filter(o => o.kind === props.kind))
const total = computed(() => rows.value.reduce((sum, o) => sum + o.amount, 0))
const title = computed(() => (props.kind === 'payment' ? 'Успешные платежи' : 'Успешные возвраты'))
const products = { trial: 'Пробное (ТД)', package: 'Пакет' }
</script>

<template>
  <p v-if="!rows.length" class="empty">За период нет операций этого типа.</p>
  <template v-else>
    <p class="muted">
      {{ rows.length }} {{ plural(rows.length, 'операция', 'операции', 'операций') }} на сумму <strong>{{ rubles(total) }}</strong>
      <span v-if="total === expected"> — совпадает с карточкой.</span>
      <span v-else class="notice-inline" role="alert"> — не совпадает с карточкой ({{ rubles(expected) }})!</span>
    </p>
    <div class="table-scroll">
      <table>
        <caption class="sr-only">{{ title }} за выбранный период</caption>
        <thead>
          <tr>
            <th scope="col">Дата и время, МСК</th><th scope="col">Транзакция</th><th scope="col">Заказ</th>
            <th scope="col">Клиент</th><th scope="col">Студия</th><th scope="col">Продукт</th><th scope="col">Сумма</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in rows" :key="o.transaction_id">
            <td>{{ moscowDateTime(o.occurred_at) }}</td><td class="mono">{{ o.transaction_id }}</td>
            <td class="mono">{{ o.order_id }}</td><td class="mono">{{ o.client_id }}</td>
            <td>{{ studioTitles[o.studio_id] ?? o.studio_id }}</td><td>{{ products[o.product] }}</td>
            <td>{{ rubles(o.amount) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><th scope="row" colspan="6">Итого</th><td>{{ rubles(total) }}</td></tr>
        </tfoot>
      </table>
    </div>
  </template>
</template>
