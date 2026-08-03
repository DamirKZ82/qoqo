import { api } from '../api/client'

/**
 * Отправка ошибок интерфейса на сервер.
 *
 * Одинаковые ошибки часто повторяются в цикле рендера, поэтому сообщения
 * подавляются по сигнатуре: иначе один сломанный компонент забил бы журнал
 * сотнями одинаковых записей.
 */
const reported = new Set<string>()
const MAX_UNIQUE_PER_SESSION = 25

export interface ReportOptions {
  message: string
  detail?: string
  context?: Record<string, unknown>
}

export function reportError({ message, detail, context }: ReportOptions): void {
  const signature = `${message}::${(detail ?? '').slice(0, 200)}`
  if (reported.has(signature) || reported.size >= MAX_UNIQUE_PER_SESSION) return
  reported.add(signature)

  // Ошибку отправки глушим намеренно: иначе неудачный отчёт вызвал бы новый.
  void api
    .post('/logs/client', {
      message: message.slice(0, 1000),
      detail: detail?.slice(0, 20_000),
      path: window.location.pathname + window.location.search,
      context: {
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        language: localStorage.getItem('qoqo.language') ?? navigator.language,
        ...context,
      },
    })
    .catch(() => undefined)
}

/** Ставит перехватчики на ошибки вне React: они до ErrorBoundary не доходят. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportError({
      message: event.message || 'Ошибка скрипта',
      detail: event.error instanceof Error ? event.error.stack : undefined,
      context: { source: event.filename, line: event.lineno, column: event.colno },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    reportError({
      message:
        reason instanceof Error ? reason.message : `Необработанный отказ: ${String(reason)}`,
      detail: reason instanceof Error ? reason.stack : undefined,
      context: { kind: 'unhandledrejection' },
    })
  })
}
