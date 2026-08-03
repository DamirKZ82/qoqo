import type { Language } from '../i18n'
import type { ContentBlock, NewsPost } from '../api/types'

/**
 * Накладывает перевод на базовую запись.
 *
 * Базовые поля — язык по умолчанию и одновременно запасной вариант: если
 * перевода поля нет, показывается исходный текст, а не пустая строка.
 *
 * Массивы совмещаются поэлементно по позиции: переведённые элементы заменяют
 * свои, непереведённый «хвост» остаётся из базовой записи. Так частично
 * переведённый список не теряет пункты.
 */
function merge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base

  if (Array.isArray(base) && Array.isArray(override)) {
    return base.map((item, index) =>
      index < override.length ? merge(item, override[index]) : item,
    ) as T
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const result: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      result[key] = key in base ? merge(base[key], value) : value
    }
    return result as T
  }

  // Пустая строка перевода — это «не переведено», а не «показать пусто».
  if (typeof override === 'string' && override.trim() === '') return base

  return override as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function apply<T extends { translations?: Record<string, unknown> }>(
  entity: T,
  language: Language,
): T {
  const override = entity.translations?.[language]
  if (!isPlainObject(override)) return entity
  return merge(entity, override)
}

export function localizeBlock(block: ContentBlock, language: Language): ContentBlock {
  return apply(block, language)
}

export function localizePost(post: NewsPost, language: Language): NewsPost {
  return apply(post, language)
}
