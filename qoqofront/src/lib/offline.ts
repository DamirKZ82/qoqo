/**
 * Офлайн-хранилище: кэш справочников и очередь неотправленных заявок.
 *
 * Заявки лежат в очереди с собственным идентификатором, который генерирует
 * клиент. Сервер по нему узнаёт повтор и возвращает уже созданную заявку —
 * без этого обрыв связи после отправки плодил бы дубли.
 */

const DB_NAME = 'qoqo-offline'
const DB_VERSION = 1

const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'

/** Справочники, которые нужны представителю в поле. */
export const CACHED_RESOURCES = [
  'nomenclature',
  'outlets',
  'counterparties',
  'contracts',
  'warehouses',
  'units',
] as const

export type CachedResource = (typeof CACHED_RESOURCES)[number]

export interface OutboxOrder {
  /** Совпадает с id заявки: он же ключ идемпотентности на сервере. */
  id: string
  payload: Record<string, unknown>
  /** Отправлять ли сразу на склад после создания. */
  submit: boolean
  createdAt: number
  attempts: number
  lastError: string | null
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE)
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = action(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

// --- Кэш справочников ----------------------------------------------------

export async function putCache(key: string, value: unknown): Promise<void> {
  await withStore(CACHE_STORE, 'readwrite', (store) =>
    store.put({ value, savedAt: Date.now() }, key),
  )
}

export async function getCache<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const result = await withStore<{ value: T; savedAt: number } | undefined>(
    CACHE_STORE,
    'readonly',
    (store) => store.get(key),
  )
  return result ?? null
}

// --- Очередь заявок ------------------------------------------------------

export async function enqueueOrder(order: OutboxOrder): Promise<void> {
  await withStore(OUTBOX_STORE, 'readwrite', (store) => store.put(order))
}

export async function listOutbox(): Promise<OutboxOrder[]> {
  const rows = await withStore<OutboxOrder[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll())
  return (rows ?? []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeFromOutbox(id: string): Promise<void> {
  await withStore(OUTBOX_STORE, 'readwrite', (store) => store.delete(id))
}

export async function markOutboxError(id: string, message: string): Promise<void> {
  const row = await withStore<OutboxOrder | undefined>(OUTBOX_STORE, 'readonly', (store) =>
    store.get(id),
  )
  if (!row) return
  await enqueueOrder({ ...row, attempts: row.attempts + 1, lastError: message })
}

/** Поддерживается ли офлайн в этом браузере. */
export function isOfflineSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}
