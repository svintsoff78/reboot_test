import { describe, expect, it } from 'vitest'
import { createReportLoader } from '../src/reportLoader'
import { rubles, type Filters, type Report } from '../src/api'
import { filtersFromQuery, filtersToQuery, moscowDateTime, periodDays, periodLabel, validatePeriod } from '../src/format'

const report = (filters: Filters): Report => ({ filters,
  summary: { paid_orders: 0, payments: 0, refunds: 0, net_cash: 0, td_buyers: 0 }, daily: [], studios: [], operations: [] })
const april: Filters = { start: '2026-04-01', end: '2026-04-30', studio: '' }
const may: Filters = { start: '2026-05-01', end: '2026-05-31', studio: 'S02' }

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('Правило: экран соответствует последнему применённому выбору', () => {
  it('поздний ответ старого запроса не перезаписывает новый', async () => {
    const calls: { filters: Filters; signal?: AbortSignal; d: ReturnType<typeof deferred<Report>> }[] = []
    const loader = createReportLoader((filters, signal) => {
      const d = deferred<Report>(); calls.push({ filters, signal, d }); return d.promise
    })
    const first = loader.load(april)
    const second = loader.load(may)
    expect(calls[0].signal?.aborted).toBe(true)          // старый запрос отменён
    calls[1].d.resolve(report(may)); await second
    calls[0].d.resolve(report(april)); await first        // а если сервер всё же ответил — игнорируем
    expect(loader.state.value.status).toBe('success')
    expect(loader.state.value.data?.filters).toEqual(may)
    expect(loader.applied.value).toEqual(may)
  })

  it('ошибка устаревшего запроса не показывается поверх нового', async () => {
    const pending: ReturnType<typeof deferred<Report>>[] = []
    const loader = createReportLoader(() => { const d = deferred<Report>(); pending.push(d); return d.promise })
    const first = loader.load(april)
    const second = loader.load(may)
    pending[0].reject(new Error('Старая ошибка')); await first
    expect(loader.state.value.status).toBe('loading')
    pending[1].resolve(report(may)); await second
    expect(loader.state.value.status).toBe('success')
  })

  it('«Повторить» повторяет последний применённый выбор', async () => {
    const seen: Filters[] = []
    let fail = true
    const loader = createReportLoader(async filters => { seen.push(filters); if (fail) throw new Error('Нет связи'); return report(filters) })
    await loader.load(may)
    fail = false
    await loader.retry()
    expect(seen).toEqual([may, may])
    expect(loader.state.value.data?.filters).toEqual(may)
  })
})

describe('Правило: проверка периода совпадает с API (YYYY-MM-DD, начало ≤ конец, 1–93 дня)', () => {
  it('принимает корректные периоды, включая ровно 93 дня', () => {
    expect(validatePeriod({ start: '2026-04-01', end: '2026-04-01' })).toBe('')
    expect(periodDays('2026-04-01', '2026-07-02')).toBe(93)
    expect(validatePeriod({ start: '2026-04-01', end: '2026-07-02' })).toBe('')
  })
  it('отклоняет пустые, перевёрнутые, длинные и несуществующие даты', () => {
    expect(validatePeriod({ start: '', end: '2026-04-30' })).not.toBe('')
    expect(validatePeriod({ start: '2026-05-01', end: '2026-04-30' })).toMatch(/позже/)
    expect(validatePeriod({ start: '2026-04-01', end: '2026-07-03' })).toMatch(/93/)
    expect(validatePeriod({ start: '2026-02-30', end: '2026-03-01' })).not.toBe('')
  })
})

describe('Правило: время и деньги в интерфейсе', () => {
  it('операция на границе месяца показывается по Москве, а не по UTC/браузеру', () => {
    expect(moscowDateTime('2026-03-31T21:30:00Z')).toBe('01.04.2026, 00:30:00')
    expect(moscowDateTime('2026-05-31T23:59:59+03:00')).toBe('31.05.2026, 23:59:59')
  })
  it('понятная подпись периода', () => {
    expect(periodLabel('2026-04-01', '2026-04-30')).toBe('1 апреля 2026 г. — 30 апреля 2026 г. · 30 дней')
    expect(periodLabel('2026-04-12', '2026-04-12')).toBe('12 апреля 2026 г. · 1 день')
  })
  it('отрицательный поток и копейки сохраняются', () => {
    expect(rubles(-30_001).replace(/\s/g, '')).toBe('-300,01₽')
  })
})

describe('Правило: выбранные фильтры переживают перезагрузку страницы', () => {
  const defaults: Filters = { start: '2026-04-01', end: '2026-04-30', studio: '' }
  it('фильтры из адреса восстанавливаются, а в адрес записываются те же', () => {
    const f = { start: '2026-05-01', end: '2026-05-31', studio: 'S02' }
    expect(filtersToQuery(f)).toBe('?start=2026-05-01&end=2026-05-31&studio=S02')
    expect(filtersFromQuery(filtersToQuery(f), defaults)).toEqual(f)
    expect(filtersToQuery(defaults)).toBe('?start=2026-04-01&end=2026-04-30')
  })
  it('неверный период в адресе заменяется периодом по умолчанию, студия сохраняется', () => {
    expect(filtersFromQuery('', defaults)).toEqual(defaults)
    expect(filtersFromQuery('?start=2026-05-31&end=2026-05-01&studio=S03', defaults)).toEqual({ ...defaults, studio: 'S03' })
    expect(filtersFromQuery('?start=2026-05-01', defaults)).toEqual(defaults)
  })
})
