import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings, validateSettings } from '../src/lib/settings'

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

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({})
  })

  it('rejects non-http URLs and empty required fields', () => {
    const errors = validateSettings({
      ...DEFAULT_SETTINGS,
      baseUrl: 'ftp://example.com',
      model: '  ',
      userAgent: '',
    })
    expect(errors.baseUrl).toBeTruthy()
    expect(errors.model).toBeTruthy()
    expect(errors.userAgent).toBeTruthy()
  })

  it('rejects out-of-range timeouts', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, timeoutSeconds: 5 }).timeoutSeconds).toBeTruthy()
    expect(validateSettings({ ...DEFAULT_SETTINGS, timeoutSeconds: 601 }).timeoutSeconds).toBeTruthy()
    expect(validateSettings({ ...DEFAULT_SETTINGS, timeoutSeconds: 30.5 }).timeoutSeconds).toBeTruthy()
  })
})
