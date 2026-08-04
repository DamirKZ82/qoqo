/**
 * Сумма прописью для счетов и накладных.
 *
 * На казахстанских документах сумма прописью обязательна, поэтому считается
 * здесь, а не берётся с сервера: данные для печати и так уже на клиенте.
 */

const ONES_MALE = [
  '',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]

const ONES_FEMALE = [
  '',
  'одна',
  'две',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]

const TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
]

const TENS = [
  '',
  '',
  'двадцать',
  'тридцать',
  'сорок',
  'пятьдесят',
  'шестьдесят',
  'семьдесят',
  'восемьдесят',
  'девяносто',
]

const HUNDREDS = [
  '',
  'сто',
  'двести',
  'триста',
  'четыреста',
  'пятьсот',
  'шестьсот',
  'семьсот',
  'восемьсот',
  'девятьсот',
]

/** Склонение по числу: 1 тенге, 2 тенге, 5 тенге. */
function plural(value: number, forms: [string, string, string]): string {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

function groupToWords(value: number, female: boolean): string[] {
  const words: string[] = []
  const hundreds = Math.floor(value / 100)
  const rest = value % 100

  if (hundreds > 0) words.push(HUNDREDS[hundreds])

  if (rest >= 10 && rest < 20) {
    words.push(TEENS[rest - 10])
  } else {
    const tens = Math.floor(rest / 10)
    const ones = rest % 10
    if (tens > 0) words.push(TENS[tens])
    if (ones > 0) words.push(female ? ONES_FEMALE[ones] : ONES_MALE[ones])
  }

  return words
}

const GROUPS: { female: boolean; forms: [string, string, string] }[] = [
  { female: false, forms: ['', '', ''] },
  { female: true, forms: ['тысяча', 'тысячи', 'тысяч'] },
  { female: false, forms: ['миллион', 'миллиона', 'миллионов'] },
  { female: false, forms: ['миллиард', 'миллиарда', 'миллиардов'] },
]

function integerToWords(value: number): string {
  if (value === 0) return 'ноль'

  const chunks: number[] = []
  let rest = value
  while (rest > 0) {
    chunks.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }

  const words: string[] = []
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index]
    if (chunk === 0) continue

    const group = GROUPS[index] ?? GROUPS[0]
    words.push(...groupToWords(chunk, group.female))
    if (index > 0) words.push(plural(chunk, group.forms))
  }

  return words.join(' ')
}

/** «123 456,78» → «Сто двадцать три тысячи четыреста пятьдесят шесть тенге 78 тиын». */
export function amountInWords(value: string | number): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return ''

  // Округляем до тиын до разбора, иначе 0.1 + 0.2 даст лишнюю копейку.
  const total = Math.round(Math.abs(amount) * 100)
  const whole = Math.floor(total / 100)
  const cents = total % 100

  const words = integerToWords(whole)
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1)
  const tenge = plural(whole, ['тенге', 'тенге', 'тенге'])
  const tiyn = plural(cents, ['тиын', 'тиын', 'тиын'])

  const sign = amount < 0 ? 'минус ' : ''
  return `${sign}${capitalized} ${tenge} ${String(cents).padStart(2, '0')} ${tiyn}`
}
