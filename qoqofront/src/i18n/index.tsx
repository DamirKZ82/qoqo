import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Fragment, type ReactNode } from 'react'

import { setApiMessages } from '../api/client'
import { setFormatUnits } from '../lib/format'
import { kk } from './kk'
import { ru, type Dictionary } from './ru'

export type Language = 'ru' | 'kk'
export type { Dictionary }

export const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'kk', label: 'Қазақша', short: 'ҚАЗ' },
]

const DICTIONARIES: Record<Language, Dictionary> = { ru, kk }
const STORAGE_KEY = 'qoqo.language'

function readStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'ru' || stored === 'kk') return stored
  // Казахская локаль в браузере — начинаем с казахского, иначе с русского.
  return navigator.language.toLowerCase().startsWith('kk') ? 'kk' : 'ru'
}

// Форматирование чисел и дат живёт вне React, поэтому локаль ставим сразу при
// загрузке модуля — до первого рендера.
function applyLanguage(language: Language): void {
  const dictionary = DICTIONARIES[language]
  setFormatUnits(dictionary.units)
  setApiMessages(dictionary.errors)
}

applyLanguage(readStoredLanguage())

interface LanguageValue {
  language: Language
  setLanguage: (value: Language) => void
  t: Dictionary
}

const LanguageContext = createContext<LanguageValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((value: Language) => {
    localStorage.setItem(STORAGE_KEY, value)
    applyLanguage(value)
    setLanguageState(value)
  }, [])

  const value = useMemo(
    () => ({ language, setLanguage, t: DICTIONARIES[language] }),
    [language, setLanguage],
  )

  return (
    <LanguageContext.Provider value={value}>
      {/* Со сменой языка меняются и форматы чисел с датами, а они считаются вне
          React. Поддерево перемонтируется целиком, чтобы не осталось строк,
          отрисованных в прошлой локали. */}
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage вне LanguageProvider')
  return value
}

/** Словарь текущего языка. */
export function useT(): Dictionary {
  return useLanguage().t
}
