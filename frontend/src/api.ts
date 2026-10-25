export interface Filters { start: string; end: string; studio: string }
export interface Metrics { paid_orders: number; payments: number; refunds: number; net_cash: number; td_buyers: number }
export interface Studio { id: string; title: string }
export interface Daily { date: string; payments: number; refunds: number; net_cash: number }
export interface Operation {
  transaction_id: string; order_id: string; client_id: string; studio_id: string
  product: 'trial' | 'package'; kind: 'payment' | 'refund'; amount: number; occurred_at: string; date: string
}
export interface Report {
  filters: Filters; summary: Metrics; daily: Daily[]; studios: (Studio & Metrics)[]; operations: Operation[]
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Нет связи с сервером. Проверьте, что backend запущен.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `Сервер не ответил (код ${response.status}). Попробуйте ещё раз.`)
  }
  return response.json() as Promise<T>
}
export function fetchReport(filters: Filters, signal?: AbortSignal): Promise<Report> {
  return get<Report>(`/api/report/?${new URLSearchParams({ ...filters })}`, signal)
}
export async function fetchStudios(): Promise<Studio[]> {
  return (await get<{ studios: Studio[] }>('/api/studios/')).studios
}
export const rubles = (kopecks: number) => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 2,
}).format(kopecks / 100)
