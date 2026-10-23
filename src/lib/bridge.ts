import { invoke } from '@tauri-apps/api/core'
import type { AppSettings, VisionResult } from '../types'

export interface ProviderTestResult {
  ok: boolean
  latencyMs: number
  sample: string
}

export interface SecretStatus {
  configured: boolean
  error: string | null
}

// 所有触碰密钥/跨域的调用都走 Rust；渲染进程只拿到结果。
export const bridge = {
  settingsLoad: () => invoke<AppSettings>('settings_load'),
  settingsSave: (settings: AppSettings) => invoke<void>('settings_save', { settings }),

  secretStatus: () => invoke<SecretStatus>('secret_status'),
  secretSet: (key: string) => invoke<void>('secret_set', { key }),
  secretClear: () => invoke<void>('secret_clear'),

  providerTest: () => invoke<ProviderTestResult>('provider_test'),
  visionRead: (imageBase64: string, mime: string, hint: string) =>
    invoke<VisionResult>('vision_read', { imageBase64, mime, hint }),

  marketGet: (path: string) => invoke<unknown>('market_get', { path }),

  dataRead: (name: string) => invoke<string | null>('data_read', { name }),
  dataWrite: (name: string, content: string) => invoke<void>('data_write', { name, content }),
  dataClear: (name: string) => invoke<void>('data_clear', { name }),
  dataDir: () => invoke<string>('data_dir'),

  logEvent: (level: 'info' | 'warn' | 'error', event: string, detail: string) =>
    invoke<void>('diagnostics_log', { level, event, detail }),
  diagnosticsExport: () => invoke<string>('diagnostics_export'),
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}
