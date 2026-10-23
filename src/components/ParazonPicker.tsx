import { useEffect, useMemo, useState } from 'react'
import { assetUrl, itemDisplayName, type CatalogItem } from '../types'
import { filterParazonItems, groupParazonItems } from '../lib/parazon'

interface Props {
  items: CatalogItem[]
  open: boolean
  onClose: () => void
  onConfirm: (selected: CatalogItem[]) => void
}

const LABELS = {
  requiem: '安魂 MOD',
  valence: '效价 / 1999 MOD',
  others: '其它帕拉松 MOD',
} as const

export default function ParazonPicker({ items, open, onClose, onConfirm }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(new Set())
    }
  }, [open])

  const groups = useMemo(
    () => groupParazonItems(filterParazonItems(items, query)),
    [items, query],
  )

  if (!open) return null

  const toggle = (slug: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const confirm = () => {
    const chosen = items.filter((item) => selected.has(item.slug))
    if (chosen.length > 0) onConfirm(chosen)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2>选择安魂 / 效价卡</h2>
          <button className="button button--icon" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="hint">
          这类卡面经常只有图案、没有文字，识别不可靠。直接点选你看到的卡，多选后一起查价。
        </p>

        <input
          className="search__input"
          value={query}
          placeholder="搜索名字（如 字节、Fass、Ris）"
          onChange={(event) => setQuery(event.target.value)}
        />

        {(['requiem', 'valence', 'others'] as const).map((key) =>
          groups[key].length > 0 ? (
            <section key={key} className="parazon-section">
              <h3>
                {LABELS[key]} <span className="badge">{groups[key].length}</span>
              </h3>
              <div className="parazon-grid">
                {groups[key].map((item) => {
                  const thumb = assetUrl(item.thumb)
                  const picked = selected.has(item.slug)
                  return (
                    <button
                      key={item.slug}
                      className={`parazon-item${picked ? ' is-picked' : ''}`}
                      onClick={() => toggle(item.slug)}
                      title={`${itemDisplayName(item)} · ${item.slug}`}
                    >
                      {thumb ? <img src={thumb} alt="" /> : <span className="parazon-item__empty" />}
                      <span>{itemDisplayName(item)}</span>
                      {picked && <em>✓</em>}
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null,
        )}

        {groups.requiem.length + groups.valence.length + groups.others.length === 0 && (
          <p className="notice">没有匹配的候选，换个关键词试试。</p>
        )}

        <div className="modal__footer modal__footer--spread">
          <span className="hint">
            已选 {selected.size} 张 · 共 {items.length} 个候选
          </span>
          <div className="modal__actions">
            <button className="button" onClick={onClose}>
              取消
            </button>
            <button className="button button--primary" disabled={selected.size === 0} onClick={confirm}>
              加入并查价
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
