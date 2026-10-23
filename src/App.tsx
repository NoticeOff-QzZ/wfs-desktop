import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DropZone from './components/DropZone'
import Header from './components/Header'
import ItemCard, { type ItemEntry } from './components/ItemCard'
import ItemSearchBox from './components/ItemSearchBox'
import ParazonPicker from './components/ParazonPicker'
import RivenCard, { type RivenEntry } from './components/RivenCard'
import ScreenshotPreview from './components/ScreenshotPreview'
import Settings from './components/Settings'
import { bridge, errorMessage } from './lib/bridge'
import { loadCatalog, type LoadedCatalog } from './lib/catalog'
import { buildRivenVocabulary } from './lib/rivenVocabulary'
import { clearRivenCache, getRivenPrices } from './lib/auctions'
import { clearQuoteCache, getQuote } from './lib/prices'
import { resolveItemRank } from './lib/rank'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './lib/settings'
import { normalizeName } from './lib/normalize'
import { decodePositiveSlugs, resolveWeapons } from './lib/weapons'
import type { AppSettings, CatalogItem, WeaponResolution } from './types'
import { itemDisplayName } from './types'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const AUTO_THRESHOLD = 0.86
const SUGGEST_THRESHOLD = 0.6

interface Notice {
  kind: 'info' | 'error'
  text: string
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function friendlyVisionError(error: unknown): string {
  const message = errorMessage(error)
  if (/401|403|invalid|unauthor|key/i.test(message)) return `API Key 无效或无权限：${message}`
  if (/timeout|超时/i.test(message)) return `模型请求超时：${message}`
  if (/429|限流/i.test(message)) return `请求过于频繁，被服务商限流：${message}`
  return `识别失败：${message}`
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [catalog, setCatalog] = useState<LoadedCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null)
  const [items, setItems] = useState<ItemEntry[]>([])
  const [rivens, setRivens] = useState<RivenEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const settingsRef = useRef<AppSettings | null>(null)
  settingsRef.current = settings

  const vocabulary = useMemo(
    () => (catalog ? buildRivenVocabulary(catalog.rivenAttributes) : null),
    [catalog],
  )
  const attributeNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const attribute of catalog?.rivenAttributes ?? []) names.set(attribute.slug, attribute.name)
    return names
  }, [catalog])
  const attributeSlugByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const attribute of catalog?.rivenAttributes ?? []) {
      map.set(normalizeName(attribute.name), attribute.slug)
    }
    return map
  }, [catalog])
  const parazonItems = useMemo(
    () => (catalog?.items ?? []).filter((item) => item.tags.includes('parazon')),
    [catalog],
  )

  const refreshCatalog = useCallback(async (force: boolean) => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      setCatalog(await loadCatalog(force))
    } catch (error) {
      setCatalogError(errorMessage(error))
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const [loaded, keyConfigured] = await Promise.all([
        loadSettings().catch(() => null),
        bridge.secretStatus().catch(() => false),
      ])
      if (loaded) setSettings(loaded)
      setHasKey(keyConfigured)
      if (!keyConfigured) {
        setSettingsOpen(true)
        setNotice({ kind: 'info', text: '首次使用请先在设置里填写视觉模型的 API Key。' })
      }
    })()
    void refreshCatalog(false)
  }, [refreshCatalog])

  const refreshItem = useCallback(async (entry: ItemEntry, force = false) => {
    setItems((current) =>
      current.map((item) =>
        item.key === entry.key ? { ...item, state: { status: 'loading' as const } } : item,
      ),
    )
    const state = await getQuote(entry.item.slug, entry.rank, { force })
    setItems((current) => current.map((item) => (item.key === entry.key ? { ...item, state } : item)))
  }, [])

  const refreshRiven = useCallback(
    async (key: string, weapon: WeaponResolution, positiveSlugs: string[], force = false) => {
      setRivens((current) =>
        current.map((entry) =>
          entry.key === key ? { ...entry, state: { status: 'loading' as const } } : entry,
        ),
      )
      const state = await getRivenPrices(weapon.slug, positiveSlugs, { force })
      setRivens((current) => current.map((entry) => (entry.key === key ? { ...entry, state } : entry)))
    },
    [],
  )

  const analyze = useCallback(
    async (dataUrl: string, mime: string) => {
      const current = settingsRef.current
      const loadedCatalog = catalog
      if (!current) return
      if (!loadedCatalog) {
        setNotice({ kind: 'error', text: '物品库还没加载好，请稍后重试。' })
        return
      }

      setBusy('正在识别截图…')
      setNotice(null)
      setItems([])
      setRivens([])
      try {
        const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
        const vision = await bridge.visionRead(base64, mime, '')

        const family = vision.family ?? ''
        if (family === 'parazon') {
          // 效价 / 其它帕拉松卡面只有图案，模型给的任何名字都不可信，直接走手动候选。
          setItems([])
          setRivens([])
          setNotice({ kind: 'info', text: '这张图里的帕拉松卡没有可读文字，请从候选里点选。' })
          setPickerOpen(true)
          return
        }

        if (vision.items.length === 0 && vision.rivens.length === 0) {
          setNotice({
            kind: 'info',
            text: vision.notes
              ? `没有认出物品：${vision.notes}。可以试试下方的安魂 / 效价候选。`
              : '没有认出物品。可以裁切到只有物品名再试，或用下方的安魂 / 效价候选手动选择。',
          })
          setPickerOpen(true)
          return
        }

        const unresolved: string[] = []
        const itemEntries: ItemEntry[] = []
        for (const [index, entry] of vision.items.entries()) {
          const [best] = loadedCatalog.index.search(entry.name, 1)
          if (!best || best.score < SUGGEST_THRESHOLD) {
            unresolved.push(entry.name)
            continue
          }
          const rank = resolveItemRank(best.item, current)
          itemEntries.push({
            key: `item:${best.item.id}:${rank}:${index}`,
            item: best.item,
            rank,
            state: { status: 'loading' },
            source: 'vision',
          })
        }

        const rivenEntries: RivenEntry[] = vision.rivens.map((riven, index) => {
          const positiveSlugs = vocabulary
            ? decodePositiveSlugs(riven, vocabulary, attributeSlugByName)
            : []
          const candidates = resolveWeapons(riven.weapon || riven.rivenName, loadedCatalog.weaponIndex, {
            autoThreshold: AUTO_THRESHOLD,
            suggestThreshold: SUGGEST_THRESHOLD,
            limit: 6,
          })
          const certain = candidates.find((candidate) => candidate.certain) ?? null
          return {
            key: `riven:${index}`,
            riven,
            positiveSlugs,
            tokenLabels: positiveSlugs.map((slug) => attributeNames.get(slug) ?? slug),
            candidates,
            weapon: certain,
            state: certain ? { status: 'loading' } : { status: 'idle' },
          }
        })

        setItems(itemEntries)
        setRivens(rivenEntries)
        setNotice(
          unresolved.length > 0
            ? { kind: 'info', text: `这些名字没匹配上物品库：${unresolved.join('、')}` }
            : null,
        )

        for (const entry of itemEntries) void refreshItem(entry)
        for (const entry of rivenEntries) {
          if (entry.weapon) void refreshRiven(entry.key, entry.weapon, entry.positiveSlugs)
        }
      } catch (error) {
        setNotice({ kind: 'error', text: friendlyVisionError(error) })
      } finally {
        setBusy(null)
      }
    },
    [attributeNames, attributeSlugByName, catalog, refreshItem, refreshRiven, vocabulary],
  )

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setNotice({ kind: 'error', text: '只支持图片文件（png / jpg / webp / gif）。' })
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setNotice({
          kind: 'error',
          text: `图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 10MB。`,
        })
        return
      }

      try {
        const dataUrl = await readAsDataUrl(file)
        setImage({ dataUrl, name: file.name || '剪贴板图片' })
        if (!hasKey) {
          setSettingsOpen(true)
          setNotice({ kind: 'error', text: '先配置 API Key 才能识别截图。' })
          return
        }
        await analyze(dataUrl, file.type)
      } catch (error) {
        setNotice({ kind: 'error', text: errorMessage(error) })
      }
    },
    [analyze, hasKey],
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const entry = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith('image/'),
      )
      const file = entry?.getAsFile()
      if (file) {
        event.preventDefault()
        void handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  const addManual = useCallback(
    (item: CatalogItem) => {
      const current = settingsRef.current
      if (!current) return
      const rank = resolveItemRank(item, current)
      setItems((previous) => {
        const exists = previous.find((entry) => entry.item.slug === item.slug && entry.rank === rank)
        if (exists) return previous
        const entry: ItemEntry = {
          key: `item:${item.id}:${rank}:manual`,
          item,
          rank,
          state: { status: 'loading' },
          source: 'manual',
        }
        void refreshItem(entry)
        return [...previous, entry]
      })
    },
    [refreshItem],
  )

  const pickWeapon = useCallback(
    (key: string, weapon: WeaponResolution) => {
      setRivens((current) =>
        current.map((entry) => (entry.key === key ? { ...entry, weapon } : entry)),
      )
      const target = rivens.find((entry) => entry.key === key)
      if (target) void refreshRiven(key, weapon, target.positiveSlugs)
    },
    [refreshRiven, rivens],
  )

  const clearWeapon = useCallback((key: string) => {
    setRivens((current) =>
      current.map((entry) =>
        entry.key === key ? { ...entry, weapon: null, state: { status: 'idle' } } : entry,
      ),
    )
  }, [])

  const clearCache = useCallback(async () => {
    await bridge.dataClear('catalog.json').catch(() => undefined)
    clearQuoteCache()
    clearRivenCache()
    setCatalog(null)
    setNotice({ kind: 'info', text: '缓存已清空，正在重新拉取物品库…' })
    await refreshCatalog(true)
  }, [refreshCatalog])

  const hasResults = items.length > 0 || rivens.length > 0

  return (
    <div className="app">
      <Header
        catalogCount={catalog?.items.length ?? 0}
        origin={catalog?.origin ?? null}
        hasKey={hasKey}
        loading={catalogLoading}
        onRefresh={() => void refreshCatalog(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="layout">
        <section className="panel">
          <DropZone onFile={(file) => void handleFile(file)} hasImage={Boolean(image)} />

          {busy && (
            <div className="progress">
              <div className="progress__label">{busy}</div>
              <div className="progress__bar">
                <div className="progress__fill progress__fill--indeterminate" />
              </div>
            </div>
          )}

          {notice && <p className={`notice ${notice.kind === 'error' ? 'notice--error' : ''}`}>{notice.text}</p>}
          {catalogError && <p className="notice notice--error">物品库加载失败：{catalogError}</p>}

          <ScreenshotPreview image={image ? { url: image.dataUrl, name: image.name } : null} />
        </section>

        <section className="panel">
          <ItemSearchBox index={catalog?.index ?? null} onSelect={addManual} />
          <div className="toolbar">
            <span className="hint">安魂 / 效价卡没有文字，认不出？</span>
            <button className="button" onClick={() => setPickerOpen(true)}>
              从候选里选
            </button>
          </div>

          {!hasResults ? (
            <p className="hint">识别到的物品与报价会显示在这里。</p>
          ) : (
            <div className="results">
              {items.map((entry) => (
                <ItemCard
                  key={entry.key}
                  entry={entry}
                  onRefresh={() => void refreshItem(entry, true)}
                  onRemove={() => setItems((current) => current.filter((item) => item.key !== entry.key))}
                />
              ))}
              {rivens.map((entry) => (
                <RivenCard
                  key={entry.key}
                  entry={entry}
                  onPickWeapon={(weapon) => pickWeapon(entry.key, weapon)}
                  onClearWeapon={() => clearWeapon(entry.key)}
                  onRefresh={() => {
                    if (entry.weapon) {
                      void refreshRiven(entry.key, entry.weapon, entry.positiveSlugs, true)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        行情来自 warframe.market 公开接口 · 识别由你配置的视觉模型完成 · 本站只读公开数据
      </footer>

      <ParazonPicker
        items={parazonItems}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(selected) => {
          for (const item of selected) addManual(item)
          setPickerOpen(false)
        }}
      />

      {settingsOpen && (
        <Settings
          settings={settings ?? DEFAULT_SETTINGS}
          hasKey={hasKey}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next, nextHasKey) => {
            setSettings(next)
            setHasKey(nextHasKey)
            void saveSettings(next).catch(() => undefined)
          }}
          onClearCache={() => void clearCache()}
        />
      )}
    </div>
  )
}
