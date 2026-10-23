import { useCallback, useEffect, useState } from 'react'
import { bridge } from '../lib/bridge'
import { loadSettings } from '../lib/settings'
import type { AppSettings } from '../types'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [secretError, setSecretError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const [loadedSettings, status] = await Promise.all([
        loadSettings().catch(() => null),
        bridge.secretStatus().catch(() => null),
      ])
      if (loadedSettings) setSettings(loadedSettings)
      setHasKey(status?.configured ?? false)
      setSecretError(status?.error ?? null)
      setLoaded(true)
    })()
  }, [])

  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const applySaved = useCallback((next: AppSettings, nextHasKey: boolean) => {
    setSettings(next)
    setHasKey(nextHasKey)
    setSecretError(null)
  }, [])

  return {
    settings,
    hasKey,
    secretError,
    settingsOpen,
    loaded,
    openSettings,
    closeSettings,
    applySaved,
  }
}
