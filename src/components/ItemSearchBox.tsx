import { useMemo, useState } from 'react'
import { assetUrl, itemDisplayName, type CatalogItem } from '../types'
import type { MatchIndex } from '../lib/match'

interface Props {
  index: MatchIndex | null
  onSelect: (item: CatalogItem) => void
}

export default function ItemSearchBox({ index, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    if (!index || query.trim().length === 0) return []
    return index.search(query, 6)
  }, [index, query])

  return (
    <div className="search">
      <input
        className="search__input"
        value={query}
        placeholder="识别失败？直接搜物品名手动查价"
        onChange={(event) => setQuery(event.target.value)}
      />
      {results.length > 0 && (
        <ul className="search__results">
          {results.map(({ item, score }) => {
            const thumb = assetUrl(item.thumb)
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelect(item)
                    setQuery('')
                  }}
                >
                  {thumb ? <img src={thumb} alt="" /> : <span className="card__thumb card__thumb--empty" />}
                  <span>
                    {itemDisplayName(item)}
                    {item.nameEn && item.nameZh ? <em>{item.nameEn}</em> : null}
                  </span>
                  <span className="search__score">{Math.round(score * 100)}%</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
