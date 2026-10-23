import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldOpenParazonPicker } from '../lib/analysis'
import { bridge, errorMessage } from '../lib/bridge'
import type { LoadedCatalog } from '../lib/catalog'
import { addManualItems, AUTO_THRESHOLD, buildItemEntries, SUGGEST_THRESHOLD } from '../lib/entries'
import { clearRivenCache, getRivenPrices } from '../lib/auctions'
import { normalizeName } from '../lib/normalize'
import { clearQuoteCache, getQuote } from '../lib/prices'
import { buildRivenVocabulary } from '../lib/rivenVocabulary'
import { decodePositiveSlugs, resolveWeapons } from '../lib/weapons'
import type { AppSettings, CatalogItem, ItemEntry, RivenEntry, WeaponResolution } from '../types'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export interface Notice {
  kind: 'info' | 'error'
  text: string
}

interface UseAnalysisOptions {
  catalog: LoadedCatalog | null
  settings: AppSettings | null
  hasKey: boolean
  onOpenSettings: () => void
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

export function useAnalysis({ catalog, settings, hasKey, onOpenSettings }: UseAnalysisOptions) {
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null)
  const [items, setItems] = useState<ItemEntry[]>([])
  const [rivens, setRivens] = useState<RivenEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const settingsRef = useRef<AppSettings | null>(null)
  const analysisSeqRef = useRef(0)
  const pendingAnalysisRef = useRef<{ dataUrl: string; mime: string } | null>(null)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

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

  const refreshItem = useCallback(async (entry: ItemEntry, force = false) => {
    setItems((current) =>
      current.map((item) =>
        item.key === entry.key ? { ...item, state: { status: 'loading' as const } } : item,
      ),
    )
    const state = await getQuote(entry.item.slug, entry.rank, { force })
    setItems((current) => current.map((item) => (item.key === entry.key ? { ...item, state } : item)))
    if (state.status === 'error') {
      void bridge
        .logEvent('warn', 'quote_failed', `${entry.item.slug}: ${state.message}`)
        .catch(() => undefined)
    }
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
      if (state.status === 'error') {
        void bridge
          .logEvent('warn', 'riven_quote_failed', `${weapon.slug}: ${state.message}`)
          .catch(() => undefined)
      }
    },
    [],
  )

  const analyze = useCallback(
    async (dataUrl: string, mime: string, requestId: number) => {
      const isCurrent = () => requestId === analysisSeqRef.current
      if (!isCurrent()) return

      const current = settingsRef.current
      const loadedCatalog = catalog
      if (!current) {
        onOpenSettings()
        setNotice({ kind: 'error', text: '设置还没加载好，请稍后重试。' })
        return
      }
      if (!loadedCatalog) {
        setNotice({ kind: 'error', text: '物品库还没加载好，请稍后重试。' })
        return
      }

      setBusy('正在识别截图…')
      setNotice(null)
      setItems([])
      setRivens([])
      setPickerOpen(false)
      try {
        const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
        const vision = await bridge.visionRead(base64, mime, '')
        if (!isCurrent()) return

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
          const openPicker = shouldOpenParazonPicker(vision)
          setNotice({
            kind: 'info',
            text: vision.notes
              ? `没有认出物品：${vision.notes}。${openPicker ? '可以试试下方的安魂 / 效价候选。' : '可以手动搜索物品，或点“从候选里选”。'}`
              : `没有认出物品。${openPicker ? '可以试试下方的安魂 / 效价候选。' : '可以裁切到只有物品名再试，或手动搜索物品。'}`,
          })
          setPickerOpen(openPicker)
          return
        }

        const { entries: itemEntries, unresolved } = buildItemEntries(
          vision.items,
          loadedCatalog.index,
          current,
        )

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

        void bridge
          .logEvent(
            'info',
            'vision_completed',
            `items=${itemEntries.length} rivens=${rivenEntries.length}`,
          )
          .catch(() => undefined)

        for (const entry of itemEntries) void refreshItem(entry)
        for (const entry of rivenEntries) {
          if (entry.weapon) void refreshRiven(entry.key, entry.weapon, entry.positiveSlugs)
        }
      } catch (error) {
        if (!isCurrent()) return
        const message = friendlyVisionError(error)
        setNotice({ kind: 'error', text: message })
        void bridge.logEvent('error', 'vision_failed', message).catch(() => undefined)
      } finally {
        if (isCurrent()) setBusy(null)
      }
    },
    [
      attributeNames,
      attributeSlugByName,
      catalog,
      onOpenSettings,
      refreshItem,
      refreshRiven,
      vocabulary,
    ],
  )

  const handleFile = useCallback(
    async (file: File) => {
      const requestId = ++analysisSeqRef.current
      pendingAnalysisRef.current = null
      setBusy(null)

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
        if (requestId !== analysisSeqRef.current) return
        setImage({ dataUrl, name: file.name || '剪贴板图片' })
        if (!hasKey) {
          pendingAnalysisRef.current = { dataUrl, mime: file.type }
          onOpenSettings()
          setNotice({ kind: 'error', text: '先配置 API Key 才能识别截图。' })
          return
        }
        pendingAnalysisRef.current = null
        await analyze(dataUrl, file.type, requestId)
      } catch (error) {
        if (requestId !== analysisSeqRef.current) return
        setNotice({ kind: 'error', text: errorMessage(error) })
      }
    },
    [analyze, hasKey, onOpenSettings],
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

  useEffect(() => {
    if (!hasKey || !catalog || !settings) return
    const pending = pendingAnalysisRef.current
    if (!pending) return
    pendingAnalysisRef.current = null
    const requestId = ++analysisSeqRef.current
    void analyze(pending.dataUrl, pending.mime, requestId)
  }, [analyze, catalog, hasKey, settings])

  const addManualMany = useCallback(
    (selected: CatalogItem[]) => {
      const current = settingsRef.current
      if (!current) return

      const results = addManualItems(items, selected, current)
      const next = results.at(-1)?.entries ?? items
      setItems(next)
      for (const result of results) {
        if (result.created) void refreshItem(result.created)
      }
    },
    [items, refreshItem],
  )

  const addManual = useCallback((item: CatalogItem) => addManualMany([item]), [addManualMany])

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

  const clearCaches = useCallback(() => {
    clearQuoteCache()
    clearRivenCache()
  }, [])

  return {
    image,
    items,
    rivens,
    busy,
    notice,
    pickerOpen,
    setPickerOpen,
    setNotice,
    setItems,
    handleFile,
    addManual,
    addManualMany,
    pickWeapon,
    clearWeapon,
    refreshItem,
    refreshRiven,
    clearCaches,
  }
}
