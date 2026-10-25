import { describe, expect, it } from 'vitest'
import { createReportLoader } from '../src/reportLoader'
import { rubles, type Filters, type Report } from '../src/api'

const filters: Filters = { start: '2026-06-01', end: '2026-06-01', studio: '' }
const empty: Report = { filters, summary: { paid_orders: 0, payments: 0, refunds: 0, net_cash: 0, td_buyers: 0 }, daily: [], studios: [], operations: [] }

describe('Состояние отчёта', () => {
  it('пустой отчёт остаётся успешным', async () => {
    const loader = createReportLoader(async () => empty)
    const pending = loader.load(filters)
    expect(loader.state.value.status).toBe('loading')
    await pending
    expect(loader.state.value.status).toBe('success')
    expect(loader.state.value.data?.operations).toEqual([])
  })
  it('показывает ошибку и допускает повтор', async () => {
    let fail = true
    const loader = createReportLoader(async () => { if (fail) throw new Error('Нет связи'); return empty })
    await loader.load(filters)
    expect(loader.state.value.error).toBe('Нет связи')
    expect(loader.state.value.data).toBeNull()
    fail = false
    await loader.load(filters)
    expect(loader.state.value.status).toBe('success')
  })
  it('отображает копейки как рубли', () => {
    expect(rubles(12345).replace(/\s/g, '')).toBe('123,45₽')
  })
})
