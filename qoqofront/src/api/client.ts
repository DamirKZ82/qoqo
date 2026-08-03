import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || ''

export const TOKEN_KEY = 'qoqo.token'

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

/** Базовый адрес сервера — для картинок из /media. */
export const mediaBase = baseURL

export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  return `${mediaBase}${path}`
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * Признак того, что пользователь вышел сам.
 *
 * Списки опрашивают сервер по таймеру, поэтому в момент выхода почти всегда
 * есть отправленный запрос. Он вернётся с 401 уже после сброса токена, и без
 * этого флага перехватчик увёл бы на форму входа, перебив переход на сайт.
 */
let signingOut = false

export function beginSignOut(): void {
  signingOut = true
  // Хвост запросов приходит в ближайшие мгновения после выхода.
  window.setTimeout(() => {
    signingOut = false
  }, 3000)
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Токен истёк или отозван — выкидываем на вход, но только из закрытой части.
    const isAuthError = error?.response?.status === 401
    const onPublicPage = ['/', '/login', '/set-password'].includes(window.location.pathname)
    if (isAuthError && !onPublicPage && !signingOut) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)

/**
 * Тексты по умолчанию для ошибок. Функция ниже вызывается и вне React, поэтому
 * строки ставит LanguageProvider, а не хук.
 */
let messages = {
  generic: 'Не удалось выполнить операцию',
  network: 'Сервер недоступен. Проверьте, запущен ли бэкенд.',
}

export function setApiMessages(next: { generic: string; network: string }): void {
  messages = next
}

/** Достаёт текст ошибки из ответа FastAPI. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    if (error.code === 'ERR_NETWORK') return messages.network
  }
  return fallback ?? messages.generic
}
