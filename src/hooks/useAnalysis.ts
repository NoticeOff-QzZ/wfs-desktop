import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldOpenParazonPicker } from '../lib/analysis'
import { clearRivenCache, getRivenPrices } from '../lib/auctions'
import { bridge, errorMessage } from '../lib/bridge'
import type { LoadedCatalog } from '../lib/catalog'
import {
  addManualItems,
  AUTO_THRESHOLD,
  buildItemEntries,
  SUGGEST_THRESHOLD,
} from '../lib/entries'
import { normalizeName } from '../lib/normalize'
import { clearQuoteCache, getQuote } from '../lib/prices'
import { buildRivenVocabulary } from '../lib/rivenVocabulary'
import { MAX_IMAGES, reorderImages } from '../lib/uploads'
import { decodePositiveSlugs, resolveWeapons } from '../lib/weapons'
import {
  itemDisplayName,
  type AppSettings,
  type CatalogItem,
  type ItemEntry,
  type RivenEntry,
  type UploadedImage,
  type VisionResult,
  type WeaponResolution,
} from '../types'

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

interface RecognizedImage {
  image: UploadedImage
  vision: VisionResult
}

type QuoteTask =
  | { kind: 'item'; imageIndex: number; entry: ItemEntry }
  | { kind: 'riven'; imageIndex: number; entry: RivenEntry; weapon: WeaponResolution }

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

function imageBase64(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
}

export function useAnalysis({ catalog, settings, hasKey, onOpenSettings }: UseAnalysisOptions) {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [items, setItems] = useState<ItemEntry[]>([])
  const [rivens, setRivens] = useState<RivenEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const settingsRef = useRef<AppSettings | null>(null)
  const imagesRef = useRef<UploadedImage[]>([])
  const querySeqRef = useRef(0)
  const busyRef = useRef(false)
  const pendingQueryRef = useRef(false)
  const imageIdRef = useRef(0)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const replaceImages = useCallback((next: UploadedImage[]) => {
    imagesRef.current = next
    setImages(next)
  }, [])

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

  const addFiles = useCallback(
    async (files: File[]) => {
      if (busyRef.current) {
        setNotice({ kind: 'info', text: '查询进行中，请先中止查询再调整截图。' })
        return
      }

      const candidates = files.filter(Boolean)
      if (candidates.length === 0) return

      const available = MAX_IMAGES - imagesRef.current.length
      if (available <= 0) {
        setNotice({ kind: 'error', text: `最多上传 ${MAX_IMAGES} 张截图。` })
        return
      }

      let invalidCount = 0
      let oversizeCount = 0
      const accepted: File[] = []
      for (const file of candidates) {
        if (!file.type.startsWith('image/')) {
          invalidCount += 1
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          oversizeCount += 1
          continue
        }
        accepted.push(file)
      }

      const selected = accepted.slice(0, available)
      const overflowCount = accepted.length - selected.length
      if (selected.length === 0) {
        const reasons: string[] = []
        if (invalidCount > 0) reasons.push('只支持图片文件（png / jpg / webp / gif）')
        if (oversizeCount > 0) reasons.push('单张图片上限 10MB')
        setNotice({
          kind: 'error',
          text: reasons.length > 0 ? reasons.join('；') : `最多上传 ${MAX_IMAGES} 张截图。`,
        })
        return
      }

      const loaded: UploadedImage[] = []
      let failedCount = 0
      for (const file of selected) {
        if (busyRef.current) return
        try {
          imageIdRef.current += 1
          loaded.push({
            id: `image-${imageIdRef.current}`,
            dataUrl: await readAsDataUrl(file),
            name: file.name || '剪贴板图片',
            mime: file.type,
          })
        } catch {
          failedCount += 1
        }
      }

      if (busyRef.current) return
      if (loaded.length === 0) {
        setNotice({ kind: 'error', text: '图片读取失败，请重试。' })
        return
      }

      const remaining = MAX_IMAGES - imagesRef.current.length
      if (remaining <= 0) {
        setNotice({ kind: 'error', text: `最多上传 ${MAX_IMAGES} 张截图。` })
        return
      }
      const added = loaded.slice(0, remaining)
      replaceImages([...imagesRef.current, ...added])

      const messages: string[] = []
      if (overflowCount > 0) messages.push(`最多 ${MAX_IMAGES} 张，已忽略 ${overflowCount} 张`)
      if (added.length < loaded.length) {
        messages.push(`队列已满，已忽略 ${loaded.length - added.length} 张`)
      }
      if (invalidCount > 0) messages.push(`${invalidCount} 个非图片文件已忽略`)
      if (oversizeCount > 0) messages.push(`${oversizeCount} 张图片超过 10MB`)
      if (failedCount > 0) messages.push(`${failedCount} 张图片读取失败`)
      setNotice({
        kind: messages.length > 0 ? 'error' : 'info',
        text: `已添加 ${added.length} 张截图${messages.length > 0 ? `；${messages.join('；')}` : ''}。点击“开始查询”后按当前顺序处理。`,
      })
    },
    [replaceImages],
  )

  const removeImage = useCallback(
    (id: string) => {
      if (busyRef.current) {
        setNotice({ kind: 'info', text: '查询进行中，请先中止查询再调整截图。' })
        return
      }
      const next = imagesRef.current.filter((image) => image.id !== id)
      if (next.length === imagesRef.current.length) return
      replaceImages(next)
      if (next.length === 0) pendingQueryRef.current = false
      setNotice({ kind: 'info', text: '已移除截图。' })
    },
    [replaceImages],
  )

  const moveImage = useCallback(
    (from: number, to: number) => {
      if (busyRef.current) {
        setNotice({ kind: 'info', text: '查询进行中，请先中止查询再调整顺序。' })
        return
      }
      const next = reorderImages(imagesRef.current, from, to)
      if (next === imagesRef.current) return
      replaceImages(next)
      setNotice({ kind: 'info', text: '已调整截图顺序，查询将按当前顺序执行。' })
    },
    [replaceImages],
  )

  const loadItemQuote = useCallback(
    async (entry: ItemEntry, force = false, requestId?: number) => {
      const isCurrent = () => requestId === undefined || requestId === querySeqRef.current
      if (!isCurrent()) return

      setItems((current) =>
        current.map((item) =>
          item.key === entry.key ? { ...item, state: { status: 'loading' as const } } : item,
        ),
      )
      const state = await getQuote(entry.item.slug, entry.rank, { force })
      if (!isCurrent()) return
      setItems((current) =>
        current.map((item) => (item.key === entry.key ? { ...item, state } : item)),
      )
      if (state.status === 'error') {
        void bridge
          .logEvent('warn', 'quote_failed', `${entry.item.slug}: ${state.message}`)
          .catch(() => undefined)
      }
    },
    [],
  )

  const loadRivenQuote = useCallback(
    async (
      key: string,
      weapon: WeaponResolution,
      positiveSlugs: string[],
      force = false,
      requestId?: number,
    ) => {
      const isCurrent = () => requestId === undefined || requestId === querySeqRef.current
      if (!isCurrent()) return

      setRivens((current) =>
        current.map((entry) =>
          entry.key === key ? { ...entry, state: { status: 'loading' as const } } : entry,
        ),
      )
      const state = await getRivenPrices(weapon.slug, positiveSlugs, { force })
      if (!isCurrent()) return
      setRivens((current) =>
        current.map((entry) => (entry.key === key ? { ...entry, state } : entry)),
      )
      if (state.status === 'error') {
        void bridge
          .logEvent('warn', 'riven_quote_failed', `${weapon.slug}: ${state.message}`)
          .catch(() => undefined)
      }
    },
    [],
  )

  const refreshItem = useCallback(
    (entry: ItemEntry, force = false) => {
      if (busyRef.current) return Promise.resolve()
      return loadItemQuote(entry, force)
    },
    [loadItemQuote],
  )

  const refreshRiven = useCallback(
    (key: string, weapon: WeaponResolution, positiveSlugs: string[], force = false) => {
      if (busyRef.current) return Promise.resolve()
      return loadRivenQuote(key, weapon, positiveSlugs, force)
    },
    [loadRivenQuote],
  )

  const runQuery = useCallback(
    async (queryImages: UploadedImage[], requestId: number, currentSettings: AppSettings) => {
      const isCurrent = () => requestId === querySeqRef.current
      const loadedCatalog = catalog
      if (!loadedCatalog) return

      const issues: string[] = []
      const recognized: RecognizedImage[] = []
      let hasFailure = false
      let openPicker = false

      try {
        for (let index = 0; index < queryImages.length; index += 1) {
          if (!isCurrent()) return
          const image = queryImages[index]
          setBusy(`正在识别第 ${index + 1}/${queryImages.length} 张截图…`)

          try {
            const vision = await bridge.visionRead(imageBase64(image.dataUrl), image.mime, '')
            if (!isCurrent()) return

            if (vision.family === 'parazon') {
              openPicker = true
              issues.push(`第 ${index + 1} 张：帕拉松卡面没有可读文字，请从候选里点选`)
              continue
            }

            if (vision.items.length === 0 && vision.rivens.length === 0) {
              if (shouldOpenParazonPicker(vision)) openPicker = true
              issues.push(
                vision.notes
                  ? `第 ${index + 1} 张：没有认出物品（${vision.notes}）`
                  : `第 ${index + 1} 张：没有认出物品`,
              )
              continue
            }

            recognized.push({ image, vision })
          } catch (error) {
            if (!isCurrent()) return
            hasFailure = true
            const message = friendlyVisionError(error)
            issues.push(`第 ${index + 1} 张：${message}`)
            void bridge
              .logEvent('error', 'vision_failed', `image=${index + 1} ${message}`)
              .catch(() => undefined)
          }
        }

        if (!isCurrent()) return

        const recognizedItems = recognized.flatMap((entry, imageIndex) =>
          entry.vision.items.map((item) => ({ item, imageIndex })),
        )
        const { entries: itemEntries, unresolved, sourceImageIndex } = buildItemEntries(
          recognizedItems.map((entry) => entry.item),
          loadedCatalog.index,
          currentSettings,
          recognizedItems.map((entry) => entry.imageIndex),
        )

        const rivenImageIndex = new Map<string, number>()
        const rivenEntries: RivenEntry[] = recognized.flatMap(({ image, vision }, imageIndex) =>
          vision.rivens.map((riven, index) => {
            const positiveSlugs = vocabulary
              ? decodePositiveSlugs(riven, vocabulary, attributeSlugByName)
              : []
            const candidates = resolveWeapons(
              riven.weapon || riven.rivenName,
              loadedCatalog.weaponIndex,
              {
                autoThreshold: AUTO_THRESHOLD,
                suggestThreshold: SUGGEST_THRESHOLD,
                limit: 6,
              },
            )
            const certain = candidates.find((candidate) => candidate.certain) ?? null
            const key = `riven:${image.id}:${index}`
            rivenImageIndex.set(key, imageIndex)
            return {
              key,
              riven,
              positiveSlugs,
              tokenLabels: positiveSlugs.map((slug) => attributeNames.get(slug) ?? slug),
              candidates,
              weapon: certain,
              state: certain ? { status: 'loading' } : { status: 'idle' },
            }
          }),
        )

        setItems(itemEntries)
        setRivens(rivenEntries)
        if (unresolved.length > 0) {
          issues.push(`未匹配物品库：${unresolved.join('、')}`)
        }

        void bridge
          .logEvent(
            'info',
            'vision_completed',
            `images=${recognized.length}/${queryImages.length} items=${itemEntries.length} rivens=${rivenEntries.length}`,
          )
          .catch(() => undefined)

        const quoteTasks: QuoteTask[] = [
          ...itemEntries.map((entry) => ({
            kind: 'item' as const,
            imageIndex: sourceImageIndex.get(entry.key) ?? 0,
            entry,
          })),
          ...rivenEntries
            .filter((entry): entry is RivenEntry & { weapon: WeaponResolution } => Boolean(entry.weapon))
            .map((entry) => ({
              kind: 'riven' as const,
              imageIndex: rivenImageIndex.get(entry.key) ?? 0,
              entry,
              weapon: entry.weapon,
            })),
        ].sort((a, b) => a.imageIndex - b.imageIndex)
        const totalQuotes = quoteTasks.length
        let doneQuotes = 0

        for (const task of quoteTasks) {
          if (!isCurrent()) return
          doneQuotes += 1
          if (task.kind === 'item') {
            setBusy(`正在查价 ${doneQuotes}/${totalQuotes}：${itemDisplayName(task.entry.item)}`)
            await loadItemQuote(task.entry, false, requestId)
          } else {
            setBusy(`正在查价 ${doneQuotes}/${totalQuotes}：${itemDisplayName(task.weapon)}`)
            await loadRivenQuote(
              task.entry.key,
              task.weapon,
              task.entry.positiveSlugs,
              false,
              requestId,
            )
          }
          if (!isCurrent()) return
        }

        const hasResults = itemEntries.length > 0 || rivenEntries.length > 0
        if (issues.length > 0) {
          setNotice({
            kind: hasFailure ? 'error' : 'info',
            text: issues.join('；'),
          })
        } else if (!hasResults) {
          setNotice({ kind: 'info', text: '没有识别到可查询的物品或裂罅。' })
        } else {
          setNotice(null)
        }
        setPickerOpen(openPicker)
      } catch (error) {
        if (!isCurrent()) return
        const message = `查询失败：${errorMessage(error)}`
        setNotice({ kind: 'error', text: message })
        setItems((current) =>
          current.map((entry) =>
            entry.state.status === 'loading' ? { ...entry, state: { status: 'idle' } } : entry,
          ),
        )
        setRivens((current) =>
          current.map((entry) =>
            entry.state.status === 'loading' ? { ...entry, state: { status: 'idle' } } : entry,
          ),
        )
        void bridge.logEvent('error', 'query_failed', message).catch(() => undefined)
      } finally {
        if (isCurrent()) {
          busyRef.current = false
          setBusy(null)
        }
      }
    },
    [attributeNames, attributeSlugByName, catalog, loadItemQuote, loadRivenQuote, vocabulary],
  )

  const startQuery = useCallback(async () => {
    if (busyRef.current) return

    const queryImages = [...imagesRef.current]
    if (queryImages.length === 0) {
      setNotice({ kind: 'info', text: '请先添加至少一张截图。' })
      return
    }
    if (!settings) {
      onOpenSettings()
      setNotice({ kind: 'error', text: '设置还没加载好，请稍后重试。' })
      return
    }
    if (!catalog) {
      setNotice({ kind: 'error', text: '物品库还没加载好，请稍后重试。' })
      return
    }
    if (!hasKey) {
      pendingQueryRef.current = true
      onOpenSettings()
      setNotice({ kind: 'info', text: '配置 API Key 后会自动开始查询。' })
      return
    }

    pendingQueryRef.current = false
    const requestId = ++querySeqRef.current
    busyRef.current = true
    setBusy('准备查询…')
    setNotice(null)
    setItems([])
    setRivens([])
    setPickerOpen(false)
    await runQuery(queryImages, requestId, settings)
  }, [catalog, hasKey, onOpenSettings, runQuery, settings])

  const cancelQuery = useCallback(() => {
    if (!busyRef.current) return

    querySeqRef.current += 1
    busyRef.current = false
    pendingQueryRef.current = false
    setBusy(null)
    setItems((current) =>
      current.map((entry) =>
        entry.state.status === 'loading' ? { ...entry, state: { status: 'idle' } } : entry,
      ),
    )
    setRivens((current) =>
      current.map((entry) =>
        entry.state.status === 'loading' ? { ...entry, state: { status: 'idle' } } : entry,
      ),
    )
    setNotice({ kind: 'info', text: '已停止查询。' })
    void bridge
      .logEvent('info', 'query_cancelled', `images=${imagesRef.current.length}`)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
      if (files.length > 0) {
        event.preventDefault()
        void addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  useEffect(() => {
    if (!pendingQueryRef.current || !hasKey || !catalog || !settings) return
    pendingQueryRef.current = false
    void startQuery()
  }, [catalog, hasKey, settings, startQuery])

  const addManualMany = useCallback(
    (selected: CatalogItem[]) => {
      if (busyRef.current) {
        setNotice({ kind: 'info', text: '查询进行中，请先中止查询。' })
        return
      }
      const current = settingsRef.current
      if (!current) return

      const results = addManualItems(items, selected, current)
      const next = results.at(-1)?.entries ?? items
      setItems(next)
      for (const result of results) {
        if (result.created) void loadItemQuote(result.created)
      }
    },
    [items, loadItemQuote],
  )

  const addManual = useCallback((item: CatalogItem) => addManualMany([item]), [addManualMany])

  const pickWeapon = useCallback(
    (key: string, weapon: WeaponResolution) => {
      if (busyRef.current) return
      setRivens((current) =>
        current.map((entry) => (entry.key === key ? { ...entry, weapon } : entry)),
      )
      const target = rivens.find((entry) => entry.key === key)
      if (target) void loadRivenQuote(key, weapon, target.positiveSlugs)
    },
    [loadRivenQuote, rivens],
  )

  const clearWeapon = useCallback((key: string) => {
    if (busyRef.current) return
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
    images,
    items,
    rivens,
    busy,
    notice,
    pickerOpen,
    setPickerOpen,
    setNotice,
    setItems,
    addFiles,
    removeImage,
    moveImage,
    startQuery,
    cancelQuery,
    addManual,
    addManualMany,
    pickWeapon,
    clearWeapon,
    refreshItem,
    refreshRiven,
    clearCaches,
  }
}
