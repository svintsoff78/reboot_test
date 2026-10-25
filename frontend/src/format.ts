import type { Filters } from './api'

export const MAX_DAYS = 93
const DAY_MS = 86_400_000

/** Число дней периода включительно или null, если дата не в формате YYYY-MM-DD / не существует. */
export function periodDays(start: string, end: string): number | null {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time
  }
  const first = parse(start), last = parse(end)
  if (first === null || last === null) return null
  return Math.round((last - first) / DAY_MS) + 1
}

/** Та же проверка, что и в API: даты YYYY-MM-DD, начало не позже конца, не больше 93 дней. */
export function validatePeriod(filters: Pick<Filters, 'start' | 'end'>): string {
  if (!filters.start || !filters.end) return 'Укажите обе даты периода.'
  const days = periodDays(filters.start, filters.end)
  if (days === null) return 'Даты должны быть в формате ДД.ММ.ГГГГ.'
  if (days < 1) return 'Дата начала не может быть позже даты окончания.'
  if (days > MAX_DAYS) return `Период не может быть длиннее ${MAX_DAYS} дней (сейчас ${days}).`
  return ''
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const moscowTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  timeZone: 'Europe/Moscow',
})

/** Календарная дата YYYY-MM-DD без сдвига часовым поясом браузера. */
export const longDate = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`))
export const shortDate = (iso: string) => shortDay.format(new Date(`${iso}T00:00:00Z`))
/** Момент операции — всегда по Москве, независимо от часового пояса браузера. */
export const moscowDateTime = (iso: string) => moscowTime.format(new Date(iso))

export function periodLabel(start: string, end: string): string {
  const days = periodDays(start, end) ?? 0
  const range = start === end ? longDate(start) : `${longDate(start)} — ${longDate(end)}`
  return `${range} · ${days} ${plural(days, 'день', 'дня', 'дней')}`
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Фильтры из адресной строки (?start=…&end=…&studio=…); при неверном периоде — значения по умолчанию. */
export function filtersFromQuery(search: string, defaults: Filters): Filters {
  const query = new URLSearchParams(search)
  const start = query.get('start') ?? '', end = query.get('end') ?? ''
  const studio = (query.get('studio') ?? '').trim()
  if (!start && !end) return { ...defaults, studio }
  return validatePeriod({ start, end }) ? { ...defaults, studio } : { start, end, studio }
}

export function filtersToQuery(filters: Filters): string {
  const query = new URLSearchParams({ start: filters.start, end: filters.end })
  if (filters.studio) query.set('studio', filters.studio)
  return `?${query}`
}
