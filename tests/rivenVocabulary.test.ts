import { describe, expect, it } from 'vitest'
import { buildRivenVocabulary, formatRivenName } from '../src/lib/rivenVocabulary'
import type { RivenAttribute } from '../src/types'

const ATTRIBUTES: RivenAttribute[] = [
  { slug: 'punch_through', prefix: 'Lexi', suffix: 'Nok', name: '穿透', group: 'default' },
  { slug: 'ammo_maximum', prefix: 'Ampi', suffix: 'Bin', name: '弹药最大值', group: 'default' },
  { slug: 'toxin_damage', prefix: 'Toxi', suffix: 'Tox', name: '毒素伤害', group: 'default' },
  { slug: 'cold_damage', prefix: 'Geli', suffix: 'Do', name: '冰冻伤害', group: 'default' },
  { slug: 'range', prefix: 'Laci', suffix: 'Tor', name: '攻击范围', group: 'default' },
  { slug: 'finisher_damage', prefix: 'Exi', suffix: 'Cron', name: '处决伤害', group: 'default' },
  { slug: 'electric_damage', prefix: 'Vexi', suffix: 'Lis', name: '电击伤害', group: 'default' },
]

const vocabulary = buildRivenVocabulary(ATTRIBUTES)

describe('riven vocabulary', () => {
  it('registers both word tables', () => {
    expect(vocabulary.wordCount).toBe(14)
  })

  it('splits a two-stat name', () => {
    const reading = vocabulary.read('Ampido')
    expect(reading?.tokens.map((token) => token.attribute.slug)).toEqual(['ammo_maximum', 'cold_damage'])
    expect(reading?.name).toBe('Ampido')
  })

  it('splits a three-stat name and reports full coverage', () => {
    const reading = vocabulary.read('Lexi-ampitox')
    expect(reading?.name).toBe('Lexi-ampitox')
    expect(reading?.coverage).toBe(1)
  })

  it('corrects a one-character OCR typo', () => {
    const reading = vocabulary.read('Lexi-ampjtox')
    expect(reading?.name).toBe('Lexi-ampitox')
    expect(reading?.tokens.filter((token) => token.corrected)).toHaveLength(1)
  })

  it('ignores punctuation and case', () => {
    expect(vocabulary.read('lExI-aMpItOx X |')?.name).toBe('Lexi-ampitox')
  })

  it('rejects unrelated text', () => {
    expect(vocabulary.read('Mirage Prime Set')).toBeNull()
    expect(vocabulary.read('Lexi')).toBeNull()
    expect(vocabulary.read('')).toBeNull()
  })

  it('formats names by token count', () => {
    const two = vocabulary.read('Ampido')!
    expect(formatRivenName(two.tokens)).toBe('Ampido')
    expect(formatRivenName([])).toBe('')
  })
})
