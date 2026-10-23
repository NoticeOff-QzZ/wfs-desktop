import { distance } from 'fastest-levenshtein'
import type { RivenAttribute } from '../types'

export interface RivenStatToken {
  word: string
  kind: 'prefix' | 'suffix'
  attribute: RivenAttribute
  corrected: boolean
}

export interface RivenReading {
  raw: string
  name: string
  tokens: RivenStatToken[]
  coverage: number
}

interface VocabWord {
  word: string
  kind: 'prefix' | 'suffix'
  attribute: RivenAttribute
}

export interface RivenVocabulary {
  readonly attributes: RivenAttribute[]
  readonly wordCount: number
  read(text: string): RivenReading | null
}

const MIN_NAME_LENGTH = 4
const MIN_TOKENS = 2
const MIN_COVERAGE = 0.8
const FUZZY_MAX_DISTANCE = 1
const FUZZY_MIN_WORD_LENGTH = 3

export function lettersOnly(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((segment) => segment.length >= 2)
    .join('')
}

export function buildRivenVocabulary(attributes: RivenAttribute[]): RivenVocabulary {
  const words: VocabWord[] = []
  let longest = 0

  for (const attribute of attributes) {
    for (const kind of ['prefix', 'suffix'] as const) {
      const word = lettersOnly(kind === 'prefix' ? attribute.prefix : attribute.suffix)
      if (!word) continue
      words.push({ word, kind, attribute })
      longest = Math.max(longest, word.length)
    }
  }

  const byLength = new Map<number, VocabWord[]>()
  for (const entry of words) {
    const bucket = byLength.get(entry.word.length) ?? []
    bucket.push(entry)
    byLength.set(entry.word.length, bucket)
  }

  const matchAt = (
    text: string,
    position: number,
  ): { entry: VocabWord; length: number; corrected: boolean } | null => {
    for (let length = Math.min(longest, text.length - position); length >= 2; length -= 1) {
      const slice = text.slice(position, position + length)
      const bucket = byLength.get(length) ?? []

      const exact = bucket.find((candidate) => candidate.word === slice)
      if (exact) return { entry: exact, length, corrected: false }

      if (length >= FUZZY_MIN_WORD_LENGTH) {
        const near = bucket.find(
          (candidate) => distance(candidate.word, slice) <= FUZZY_MAX_DISTANCE,
        )
        if (near) return { entry: near, length, corrected: true }
      }
    }
    return null
  }

  const read = (text: string): RivenReading | null => {
    const raw = text.trim()
    const compact = lettersOnly(raw)
    if (compact.length < MIN_NAME_LENGTH) return null

    const tokens: RivenStatToken[] = []
    let position = 0
    let unexplained = 0

    while (position < compact.length) {
      const match = matchAt(compact, position)
      if (!match) {
        unexplained += 1
        position += 1
        continue
      }
      tokens.push({
        word:
          match.entry.kind === 'prefix'
            ? match.entry.attribute.prefix ?? ''
            : match.entry.attribute.suffix ?? '',
        kind: match.entry.kind,
        attribute: match.entry.attribute,
        corrected: match.corrected,
      })
      position += match.length
    }

    const coverage = 1 - unexplained / compact.length
    if (tokens.length < MIN_TOKENS || coverage < MIN_COVERAGE) return null
    return { raw, name: formatRivenName(tokens), tokens, coverage }
  }

  return { attributes, wordCount: words.length, read }
}

export function formatRivenName(tokens: RivenStatToken[]): string {
  if (tokens.length === 0) return ''
  const lower = tokens.map((token) => token.word.toLowerCase())
  const head = lower[0].charAt(0).toUpperCase() + lower[0].slice(1)
  if (tokens.length === 2) return `${head}${lower[1]}`
  return `${head}-${lower.slice(1).join('')}`
}
