import { shallowRef } from 'vue'
import { fetchReport, type Filters, type Report } from './api'

export type ReportState =
  | { status: 'idle' | 'loading'; data: null; error: '' }
  | { status: 'success'; data: Report; error: '' }
  | { status: 'error'; data: null; error: string }

export type ReportFetcher = (filters: Filters, signal?: AbortSignal) => Promise<Report>

/**
 * Состояние загрузки отчёта. Экран всегда отражает последний вызов load():
 * предыдущий запрос отменяется, а его поздний ответ или ошибка игнорируются.
 */
export function createReportLoader(fetcher: ReportFetcher = fetchReport) {
  const state = shallowRef<ReportState>({ status: 'idle', data: null, error: '' })
  const applied = shallowRef<Filters | null>(null)
  let sequence = 0
  let controller: AbortController | null = null

  async function load(filters: Filters) {
    const id = ++sequence
    controller?.abort()
    controller = new AbortController()
    applied.value = { ...filters }
    state.value = { status: 'loading', data: null, error: '' }
    try {
      const data = await fetcher({ ...filters }, controller.signal)
      if (id !== sequence) return
      state.value = { status: 'success', data, error: '' }
    } catch (error) {
      if (id !== sequence) return
      state.value = { status: 'error', data: null,
        error: error instanceof Error ? error.message : 'Не удалось загрузить отчёт.' }
    }
  }

  /** Повтор последнего применённого выбора, а не текущих несохранённых полей формы. */
  function retry() {
    if (applied.value) return load(applied.value)
  }

  return { state, applied, load, retry }
}
