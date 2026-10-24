import { useCallback, useEffect, useMemo } from 'react'
import DropZone from './components/DropZone'
import Header from './components/Header'
import ImageQueue from './components/ImageQueue'
import ItemCard from './components/ItemCard'
import ItemSearchBox from './components/ItemSearchBox'
import ParazonPicker from './components/ParazonPicker'
import RivenCard from './components/RivenCard'
import Settings from './components/Settings'
import { useAnalysis } from './hooks/useAnalysis'
import { useCatalog } from './hooks/useCatalog'
import { useSettings } from './hooks/useSettings'
import { bridge } from './lib/bridge'
import { DEFAULT_SETTINGS } from './lib/settings'
import { MAX_IMAGES } from './lib/uploads'

export default function App() {
  const catalogState = useCatalog()
  const settingsState = useSettings()
  const analysis = useAnalysis({
    catalog: catalogState.catalog,
    settings: settingsState.settings,
    hasKey: settingsState.hasKey,
    onOpenSettings: settingsState.openSettings,
  })

  const { catalog, loading: catalogLoading, error: catalogError, refresh: refreshCatalog, reset: resetCatalog } =
    catalogState
  const {
    settings,
    hasKey,
    secretError,
    settingsOpen,
    loaded: settingsLoaded,
    openSettings,
    closeSettings,
    applySaved,
  } = settingsState
  const {
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
  } = analysis

  const parazonItems = useMemo(
    () => (catalog?.items ?? []).filter((item) => item.tags.includes('parazon')),
    [catalog],
  )

  useEffect(() => {
    if (!settingsLoaded || hasKey) return
    openSettings()
    setNotice({ kind: 'info', text: '首次使用请先在设置里填写视觉模型的 API Key。' })
  }, [hasKey, openSettings, setNotice, settingsLoaded])

  useEffect(() => {
    if (!secretError) return
    setNotice({ kind: 'error', text: `读取 API Key 状态失败：${secretError}` })
  }, [secretError, setNotice])

  const clearCache = useCallback(async () => {
    await bridge.dataClear('catalog.json').catch(() => undefined)
    clearCaches()
    resetCatalog()
    setNotice({ kind: 'info', text: '缓存已清空，正在重新拉取物品库…' })
    await refreshCatalog(true)
  }, [clearCaches, refreshCatalog, resetCatalog, setNotice])

  const hasResults = items.length > 0 || rivens.length > 0

  return (
    <div className="app">
      <Header
        catalogCount={catalog?.items.length ?? 0}
        origin={catalog?.origin ?? null}
        hasKey={hasKey}
        loading={catalogLoading}
        onRefresh={() => void refreshCatalog(true)}
        onOpenSettings={openSettings}
      />

      <main className="layout">
        <section className="panel">
          <DropZone
            onFiles={(files) => void addFiles(files)}
            hasImage={images.length > 0}
            remaining={MAX_IMAGES - images.length}
            disabled={Boolean(busy)}
          />

          <ImageQueue
            images={images}
            disabled={Boolean(busy)}
            onRemove={removeImage}
            onMove={moveImage}
          />

          <div className="query-actions">
            <span className="hint">
              {images.length === 0
                ? '添加截图后点击“开始查询”'
                : `将按 1 → ${images.length} 的顺序逐张识别并查价`}
            </span>
            <div className="query-actions__buttons">
              {busy && (
                <button className="button button--danger" onClick={cancelQuery}>
                  中止查询
                </button>
              )}
              <button
                className="button button--primary"
                onClick={() => void startQuery()}
                disabled={Boolean(busy) || images.length === 0}
              >
                开始查询
              </button>
            </div>
          </div>

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
        </section>

        <section className="panel">
          <ItemSearchBox index={catalog?.index ?? null} onSelect={addManual} />
          <div className="toolbar">
            <span className="hint">安魂 / 效价卡没有文字，认不出？</span>
            <button className="button" onClick={() => setPickerOpen(true)} disabled={Boolean(busy)}>
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

      {pickerOpen && (
        <ParazonPicker
          items={parazonItems}
          open
          onClose={() => setPickerOpen(false)}
          onConfirm={(selected) => {
            addManualMany(selected)
            setPickerOpen(false)
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          settings={settings ?? DEFAULT_SETTINGS}
          hasKey={hasKey}
          keyError={secretError}
          onClose={closeSettings}
          onSaved={(next, _nextHasKey) => {
            applySaved(next, _nextHasKey)
          }}
          onClearCache={() => void clearCache()}
        />
      )}
    </div>
  )
}
