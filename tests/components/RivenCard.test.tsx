// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RivenCard from '../../src/components/RivenCard'
import type { RivenEntry, RivenPriceSummary } from '../../src/types'

function entry(summary: RivenPriceSummary): RivenEntry {
  return {
    key: 'riven:0',
    riven: {
      weapon: '冰凇',
      rivenName: 'Crita-visitis',
      positiveTexts: ['暴击几率', '暴击伤害'],
      confidence: 'high',
    },
    positiveSlugs: ['critical_chance', 'critical_damage'],
    tokenLabels: ['暴击几率', '暴击伤害'],
    candidates: [],
    weapon: { slug: 'verglas', nameZh: '冰凇', nameEn: 'Verglas', score: 1, certain: true },
    state: { status: 'ready', summary },
  }
}

const baseSummary: RivenPriceSummary = {
  weaponSlug: 'verglas',
  total: 10,
  mode: 'exact',
  matched: 3,
  priced: 3,
  approximate: false,
  min: 100,
  p25: 120,
  median: 150,
  p75: 180,
  max: 200,
  examples: [],
  fetchedAt: 1,
}

describe('RivenCard', () => {
  it('shows a price range for exact matches', () => {
    render(
      <RivenCard
        entry={entry(baseSummary)}
        onPickWeapon={vi.fn()}
        onClearWeapon={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('完全同词条')).toBeInTheDocument()
    expect(screen.getByText('最低价')).toBeInTheDocument()
    expect(screen.getByText('100p')).toBeInTheDocument()
  })

  it('marks supersets as non-equivalent and hides the range', () => {
    render(
      <RivenCard
        entry={entry({ ...baseSummary, mode: 'superset', approximate: true })}
        onPickWeapon={vi.fn()}
        onClearWeapon={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText(/含这些词条且更多（不等价）/)).toBeInTheDocument()
    expect(screen.queryByText('最低价')).not.toBeInTheDocument()
  })
})
