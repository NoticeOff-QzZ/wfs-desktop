import { useCallback, useEffect, useState } from 'react'
import { bridge, errorMessage } from '../lib/bridge'
import { loadCatalog, type LoadedCatalog } from '../lib/catalog'

export function useCatalog() {
  const [catalog, setCatalog] = useState<LoadedCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      setCatalog(await loadCatalog(force))
    } catch (cause) {
      const message = errorMessage(cause)
      setError(message)
      void bridge.logEvent('error', 'catalog_failed', message).catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 首屏拉取物品库需要同步进入 loading 状态。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(false)
  }, [refresh])

  const reset = useCallback(() => setCatalog(null), [])

  return { catalog, loading, error, refresh, reset }
}
