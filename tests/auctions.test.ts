import { describe, expect, it } from 'vitest'
import { parseRivenAuctions, percentile, summarizeRivenAuctions } from '../src/lib/auctions'

const RAW = {
  payload: {
    auctions: [
      {
        id: 'a1',
        is_direct_sell: true,
        buyout_price: 500,
        starting_price: 500,
        owner: { ingame_name: 'Alice', status: 'ingame' },
        item: {
          type: 'riven',
          name: 'crita-visitis',
          mod_rank: 8,
          re_rolls: 12,
          attributes: [
            { url_name: 'critical_chance', value: 194.9, positive: true },
            { url_name: 'critical_damage', value: 82.1, positive: true },
            { url_name: 'finisher_damage', value: -92.8, positive: false },
          ],
        },
      },
      {
        id: 'a2',
        is_direct_sell: false,
        buyout_price: null,
        starting_price: 50,
        owner: { ingame_name: 'Bob', status: 'offline' },
        item: {
          type: 'riven',
          name: 'acri-critaata',
          attributes: [
            { url_name: 'critical_chance', value: 100, positive: true },
            { url_name: 'critical_damage', value: 60, positive: true },
          ],
        },
      },
      {
        id: 'a3',
        is_direct_sell: true,
        buyout_price: 40,
        item: { type: 'riven', name: 'other', attributes: [{ url_name: 'range', positive: true }] },
      },
      { id: 'a4', is_direct_sell: true, buyout_price: 10, item: { type: 'lich', name: 'nope' } },
    ],
  },
}

describe('parseRivenAuctions', () => {
  const auctions = parseRivenAuctions(RAW)

  it('keeps only riven listings', () => {
    expect(auctions).toHaveLength(3)
  })

  it('uses buyout for direct sales and starting price otherwise', () => {
    expect(auctions.find((a) => a.id === 'a1')?.price).toBe(500)
    expect(auctions.find((a) => a.id === 'a2')?.price).toBe(50)
  })

  it('splits positive and negative stats', () => {
    const first = auctions[0]
    expect(first.positive).toEqual(['critical_chance', 'critical_damage'])
    expect(first.negative).toEqual(['finisher_damage'])
    expect(first.values.critical_chance).toBeCloseTo(194.9, 3)
  })

  it('tolerates empty payloads', () => {
    expect(parseRivenAuctions(null)).toEqual([])
    expect(parseRivenAuctions({})).toEqual([])
  })
})

describe('percentile', () => {
  it('returns null for an empty list', () => {
    expect(percentile([], 0.5)).toBeNull()
  })

  it('picks nearest-rank values', () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30)
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10)
  })
})

describe('summarizeRivenAuctions', () => {
  const auctions = parseRivenAuctions(RAW)

  it('uses exact matches when available', () => {
    const summary = summarizeRivenAuctions(auctions, ['critical_chance', 'critical_damage'], 'war')
    expect(summary.mode).toBe('exact')
    expect(summary.min).toBe(500)
    expect(summary.approximate).toBe(false)
  })

  it('ignores stat order and case', () => {
    expect(summarizeRivenAuctions(auctions, ['CRITICAL_DAMAGE', 'critical_chance']).matched).toBe(2)
  })

  it('marks supersets as approximate', () => {
    const summary = summarizeRivenAuctions(auctions, ['critical_chance'])
    expect(summary.mode).toBe('superset')
    expect(summary.approximate).toBe(true)
  })

  it('falls back to the whole weapon market', () => {
    const summary = summarizeRivenAuctions(auctions, ['toxin_damage'])
    expect(summary.mode).toBe('all')
    expect(summary.priced).toBe(2)
    expect(summary.min).toBe(40)
  })
})
