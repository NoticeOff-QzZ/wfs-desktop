import type { AppSettings } from '../types'
import { bridge } from './bridge'

export const DEFAULT_SETTINGS: AppSettings = {
  providerPreset: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  timeoutSeconds: 120,
  modRank: 0,
  arcaneRank: null,
  userAgent: 'wfs-desktop/0.1.0 (+contact: app owner)',
}

export const DEEPSEEK_DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
}

/** 合并磁盘配置与默认值，兼容旧版本缺字段的情况。 */
export function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  if (!raw) return { ...DEFAULT_SETTINGS }
  return {
    providerPreset: raw.providerPreset === 'custom' ? 'custom' : 'deepseek',
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl.trim() ? raw.baseUrl.trim() : DEFAULT_SETTINGS.baseUrl,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_SETTINGS.model,
    timeoutSeconds:
      Number.isFinite(Number(raw.timeoutSeconds)) && Number(raw.timeoutSeconds) >= 10
        ? Math.min(600, Math.floor(Number(raw.timeoutSeconds)))
        : DEFAULT_SETTINGS.timeoutSeconds,
    modRank: Number.isFinite(Number(raw.modRank)) ? Math.max(0, Math.floor(Number(raw.modRank))) : 0,
    arcaneRank:
      raw.arcaneRank === null || raw.arcaneRank === undefined
        ? null
        : Number.isFinite(Number(raw.arcaneRank))
          ? Math.max(0, Math.floor(Number(raw.arcaneRank)))
          : null,
    userAgent:
      typeof raw.userAgent === 'string' && raw.userAgent.trim()
        ? raw.userAgent.trim()
        : DEFAULT_SETTINGS.userAgent,
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await bridge.settingsLoad().catch(() => null)
  return mergeSettings(raw)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await bridge.settingsSave(settings)
}
