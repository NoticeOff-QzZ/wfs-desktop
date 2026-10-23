import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from '../src/lib/settings'

describe('mergeSettings', () => {
  it('returns defaults for missing config', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('fills missing fields', () => {
    const merged = mergeSettings({ model: 'custom-model' })
    expect(merged.model).toBe('custom-model')
    expect(merged.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
    expect(merged.modRank).toBe(0)
  })

  it('normalises numeric fields', () => {
    const merged = mergeSettings({ timeoutSeconds: 5, modRank: -3, arcaneRank: 2.7 })
    expect(merged.timeoutSeconds).toBe(DEFAULT_SETTINGS.timeoutSeconds)
    expect(merged.modRank).toBe(0)
    expect(merged.arcaneRank).toBe(2)
  })

  it('keeps null arcane rank meaning max rank', () => {
    expect(mergeSettings({ arcaneRank: null }).arcaneRank).toBeNull()
  })
})
