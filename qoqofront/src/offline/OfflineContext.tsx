import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, errorMessage } from '../api/client'
import {
  CACHED_RESOURCES,
  enqueueOrder,
  listOutbox,
  markOutboxError,
  putCache,
  removeFromOutbox,
  type OutboxOrder,
} from '../lib/offline'

interface OfflineValue {
  online: boolean
  /** Сколько заявок ждут отправки. */
  pending: number
  /** Когда справочники в последний раз обновлялись. */
  syncedAt: number | null
  syncing: boolean
  /** Кладёт заявку в очередь; при связи она уйдёт сразу. */
  queueOrder: (order: Omit<OutboxOrder, 'createdAt' | 'attempts' | 'lastError'>) => Promise<void>
  flush: () => Promise<void>
  refreshCache: () => Promise<void>
}

const OfflineContext = createContext<OfflineValue | null>(null)

const SYNCED_AT_KEY = 'qoqo.syncedAt'

export function OfflineProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(() => {
    const stored = localStorage.getItem(SYNCED_AT_KEY)
    return stored ? Number(stored) : null
  })

  const countPending = useCallback(async () => {
    setPending((await listOutbox()).length)
  }, [])

  /** Отправляет накопленные заявки. Порядок сохраняем: он важен для номеров. */
  const flush = useCallback(async () => {
    if (!navigator.onLine) return

    for (const order of await listOutbox()) {
      try {
        const { data } = await api.post('/orders', { ...order.payload, id: order.id })
        if (order.submit) {
          await api.post(`/orders/${data.id}/status`, { status: 'new' })
        }
        await removeFromOutbox(order.id)
      } catch (cause) {
        // Оставляем в очереди: следующая попытка будет при появлении связи.
        await markOutboxError(order.id, errorMessage(cause))
        break
      }
    }

    await countPending()
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }, [countPending, queryClient])

  const refreshCache = useCallback(async () => {
    if (!navigator.onLine) return

    setSyncing(true)
    try {
      for (const resource of CACHED_RESOURCES) {
        const { data } = await api.get(`/${resource}`, { params: { limit: 500 } })
        await putCache(`ref:${resource}`, data)
      }
      const stamp = Date.now()
      localStorage.setItem(SYNCED_AT_KEY, String(stamp))
      setSyncedAt(stamp)
    } catch {
      // Молча: обновление кэша — фоновая задача, ошибку показывать незачем.
    } finally {
      setSyncing(false)
    }
  }, [])

  const queueOrder = useCallback(
    async (order: Omit<OutboxOrder, 'createdAt' | 'attempts' | 'lastError'>) => {
      await enqueueOrder({ ...order, createdAt: Date.now(), attempts: 0, lastError: null })
      await countPending()
      await flush()
    },
    [countPending, flush],
  )

  useEffect(() => {
    function goOnline() {
      setOnline(true)
      void flush()
      void refreshCache()
    }
    function goOffline() {
      setOnline(false)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    void countPending()
    if (navigator.onLine) {
      void flush()
      void refreshCache()
    }

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [countPending, flush, refreshCache])

  const value = useMemo<OfflineValue>(
    () => ({ online, pending, syncedAt, syncing, queueOrder, flush, refreshCache }),
    [online, pending, syncedAt, syncing, queueOrder, flush, refreshCache],
  )

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineValue {
  const value = useContext(OfflineContext)
  if (!value) throw new Error('useOffline вне OfflineProvider')
  return value
}
