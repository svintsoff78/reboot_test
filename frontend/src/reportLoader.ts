import { shallowRef } from 'vue'
import { fetchReport, type Filters, type Report } from './api'

export type ReportState =
  | { status: 'idle' | 'loading'; data: null; error: '' }
  | { status: 'success'; data: Report; error: '' }
  | { status: 'error'; data: null; error: string }

export function createReportLoader(fetcher: (filters: Filters) => Promise<Report> = fetchReport) {
  const state = shallowRef<ReportState>({ status: 'idle', data: null, error: '' })
  async function load(filters: Filters) {
    state.value = { status: 'loading', data: null, error: '' }
    try {
      const data = await fetcher({ ...filters })
      state.value = { status: 'success', data, error: '' }
    } catch (error) {
      state.value = { status: 'error', data: null,
        error: error instanceof Error ? error.message : 'Не удалось загрузить отчёт.' }
    }
  }
  return { state, load }
}
