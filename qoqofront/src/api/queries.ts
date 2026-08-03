import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { Language } from '../i18n'
import type {
  AppSettings,
  BreakdownReport,
  ContentBlock,
  CurrentUser,
  NewsPost,
  Order,
  OrderStats,
  Page,
  PeriodGroup,
  ReportDimension,
  SalesReport,
  TopReport,
  TurnoverReport,
} from './types'

// --- Публичные данные (доступны без авторизации) -------------------------

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<AppSettings>('/settings')).data,
    staleTime: 5 * 60 * 1000,
  })
}

export function useContentBlocks(includeHidden = false) {
  return useQuery({
    queryKey: ['content', 'blocks', includeHidden],
    queryFn: async () =>
      (
        await api.get<ContentBlock[]>('/content/blocks', {
          params: { include_hidden: includeHidden },
        })
      ).data,
  })
}

export function useNews(params: { limit?: number; published_only?: boolean } = {}) {
  return useQuery({
    queryKey: ['news', params],
    queryFn: async () => (await api.get<Page<NewsPost>>('/news', { params })).data,
  })
}

// --- Пользователь --------------------------------------------------------

export function useCurrentUser(enabled: boolean) {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<CurrentUser>('/auth/me')).data,
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

// --- Справочники ---------------------------------------------------------

export interface RefParams {
  search?: string
  limit?: number
  offset?: number
  only_active?: boolean
  counterparty_id?: string
  outlet_type_id?: string
  category_id?: string
}

export function useReference<T>(resource: string, params: RefParams = {}, enabled = true) {
  return useQuery({
    queryKey: ['ref', resource, params],
    queryFn: async () => (await api.get<Page<T>>(`/${resource}`, { params })).data,
    enabled,
  })
}

export function useSaveReference(resource: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Record<string, unknown> }) => {
      const response = id
        ? await api.put(`/${resource}/${id}`, values)
        : await api.post(`/${resource}`, values)
      return response.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ref', resource] }),
  })
}

export function useDeactivateReference(resource: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/${resource}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ref', resource] }),
  })
}

// --- Заявки --------------------------------------------------------------

export interface OrderFilters {
  status?: string
  counterparty_id?: string
  outlet_id?: string
  warehouse_id?: string
  search?: string
  limit?: number
  offset?: number
}

/** Список заявок. Склад опрашивает его чаще — новые заявки должны появляться сами. */
export function useOrders(filters: OrderFilters = {}, refetchInterval?: number) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => (await api.get<Page<Order>>('/orders', { params: filters })).data,
    refetchInterval,
  })
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['orders', 'one', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: Boolean(id),
  })
}

export function useOrderStats(refetchInterval?: number) {
  return useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: async () => (await api.get<OrderStats>('/orders/stats')).data,
    refetchInterval,
  })
}

// --- Отчёты --------------------------------------------------------------

export interface ReportFilters {
  date_from: string
  date_to: string
  warehouse_id?: string
  counterparty_id?: string
  outlet_id?: string
  author_id?: string
  nomenclature_id?: string
  category_id?: string
}

export function useSalesReport(filters: ReportFilters, groupBy: PeriodGroup) {
  return useQuery({
    queryKey: ['reports', 'sales', filters, groupBy],
    queryFn: async () =>
      (await api.get<SalesReport>('/reports/sales', { params: { ...filters, group_by: groupBy } }))
        .data,
    // Пока грузятся новые цифры, показываем прежние: иначе страница мигает
    // при каждом сдвиге периода.
    placeholderData: (previous) => previous,
  })
}

export function useBreakdown(filters: ReportFilters, dimension: ReportDimension, limit = 20) {
  return useQuery({
    queryKey: ['reports', 'breakdown', filters, dimension, limit],
    queryFn: async () =>
      (await api.get<BreakdownReport>('/reports/breakdown', { params: { ...filters, dimension, limit } }))
        .data,
    placeholderData: (previous) => previous,
  })
}

export function useTopReport(filters: ReportFilters, dimension: ReportDimension, limit = 10) {
  return useQuery({
    queryKey: ['reports', 'top', filters, dimension, limit],
    queryFn: async () =>
      (await api.get<TopReport>('/reports/top', { params: { ...filters, dimension, limit } })).data,
    placeholderData: (previous) => previous,
  })
}

export function useTurnoverReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ['reports', 'turnover', filters],
    queryFn: async () =>
      (await api.get<TurnoverReport>('/reports/turnover', { params: filters })).data,
    placeholderData: (previous) => previous,
  })
}

/** Скачивает разрез целиком файлом CSV. Заголовки в файле пишет сервер. */
export async function downloadBreakdownCsv(
  filters: ReportFilters,
  dimension: ReportDimension,
  lang: Language,
): Promise<void> {
  const response = await api.get('/reports/breakdown/export', {
    params: { ...filters, dimension, lang },
    responseType: 'blob',
  })

  const url = URL.createObjectURL(response.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `qoqo-${dimension}-${filters.date_from}-${filters.date_to}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function useSaveOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Record<string, unknown> }) => {
      const response = id
        ? await api.put<Order>(`/orders/${id}`, values)
        : await api.post<Order>('/orders', values)
      return response.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useChangeOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.post<Order>(`/orders/${id}/status`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useSaveAssembly() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      lines,
    }: {
      id: string
      lines: { line_id: string; quantity_shipped: number }[]
    }) => (await api.post<Order>(`/orders/${id}/assembly`, { lines })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
}
