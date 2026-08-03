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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Токен истёк или отозван — выкидываем на вход, но только из закрытой части.
    const isAuthError = error?.response?.status === 401
    const onPublicPage = ['/', '/login', '/set-password'].includes(window.location.pathname)
    if (isAuthError && !onPublicPage) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)

/** Достаёт текст ошибки из ответа FastAPI. */
export function errorMessage(error: unknown, fallback = 'Не удалось выполнить операцию'): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    if (error.code === 'ERR_NETWORK') return 'Сервер недоступен. Проверьте, запущен ли бэкенд.'
  }
  return fallback
}
