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

/** Ошибка настройки, а не сбой: её текст показываем как есть. */
export class MisconfiguredApiError extends Error {
  name = 'MisconfiguredApiError'
}

/**
 * Признак того, что вместо данных пришла страница сайта.
 *
 * Так выглядит незаданный VITE_API_URL: запрос уходит на собственный домен,
 * правило SPA-роутинга отдаёт index.html, и приходит успешный ответ с HTML
 * внутри. Ошибки нет, поэтому дальше код делает .map по строке и падает где-то
 * в глубине React — по такому следу причину не найти.
 */
function looksLikeHtmlPage(response: { headers: unknown; data: unknown }): boolean {
  const type = (response.headers as Record<string, string> | undefined)?.['content-type'] ?? ''
  return type.includes('text/html') || (typeof response.data === 'string' && /^\s*<!doctype html/i.test(response.data))
}

api.interceptors.response.use(
  (response) => {
    if (looksLikeHtmlPage(response)) {
      throw new MisconfiguredApiError(
        `Вместо данных API вернул страницу сайта (${response.config?.url}). ` +
          'Скорее всего, не задан VITE_API_URL и запрос ушёл на домен сайта. ' +
          'Переменная попадает в сборку, поэтому после её изменения нужен передеплой.',
      )
    }
    return response
  },
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
  // Настройку разворачиваем текстом: подставлять сюда общее «Не удалось»
  // означало бы спрятать единственную подсказку о причине.
  if (error instanceof MisconfiguredApiError) return error.message

  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    if (error.code === 'ERR_NETWORK') return messages.network
  }
  return fallback ?? messages.generic
}
