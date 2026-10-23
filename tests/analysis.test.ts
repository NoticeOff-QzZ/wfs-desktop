import { describe, expect, it } from 'vitest'
import { shouldOpenParazonPicker } from '../src/lib/analysis'
import type { VisionResult } from '../src/types'

function vision(overrides: Partial<VisionResult>): VisionResult {
  return {
    family: 'normal',
    items: [],
    rivens: [],
    notes: '',
    raw: '',
    ...overrides,
  }
}

describe('shouldOpenParazonPicker', () => {
  it('opens for an explicit parazon family', () => {
    expect(shouldOpenParazonPicker(vision({ family: 'parazon' }))).toBe(true)
  })

  it('opens for an empty requiem grid', () => {
    expect(shouldOpenParazonPicker(vision({ family: 'requiem' }))).toBe(true)
  })

  it('does not open for a requiem result that already has cards', () => {
    const result = vision({
      family: 'requiem',
      items: [{ name: 'Fass', count: 1, confidence: 'high' }],
    })
    expect(shouldOpenParazonPicker(result)).toBe(false)
  })

  it('opens when notes mention parazon', () => {
    expect(shouldOpenParazonPicker(vision({ notes: '可能是帕拉松卡' }))).toBe(true)
    expect(shouldOpenParazonPicker(vision({ notes: '可能是 parazon' }))).toBe(true)
  })

  it('stays closed for an ordinary empty result', () => {
    expect(shouldOpenParazonPicker(vision({ notes: '画面太暗' }))).toBe(false)
  })
})
