import { assetUrl, itemDisplayName, type ItemEntry } from '../types'
import { REQUIEM_SLUGS } from '../lib/parazon'
import { openExternal } from '../lib/opener'

interface Props {
  entry: ItemEntry
  onRefresh: () => void
  onRemove: () => void
}

function rankText(entry: ItemEntry): string {
  if (entry.item.maxRank <= 0) return ''
  return `rank ${entry.rank}`
}

export default function ItemCard({ entry, onRefresh, onRemove }: Props) {
  const { item, state, rank } = entry
  const thumb = assetUrl(item.thumb)
  const maxRank = item.maxRank

  return (
    <div className="card">
      <div className="card__header">
        {thumb ? <img className="card__thumb" src={thumb} alt="" /> : <span className="card__thumb card__thumb--empty" />}
        <div className="card__names">
          <a
            href={`https://warframe.market/items/${item.slug}`}
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              void openExternal(`https://warframe.market/items/${item.slug}`)
            }}
          >
            {itemDisplayName(item)}
          </a>
          <em>
            {item.nameEn ?? item.slug}
            {maxRank > 0 ? ` · 满级 rank ${maxRank}` : ''}
          </em>
        </div>
        <div className="card__badges">
          {item.tags.includes('parazon') && (
            <span className="badge badge--manual">
              {(REQUIEM_SLUGS as readonly string[]).includes(item.slug) ? '安魂' : '帕拉松'}
            </span>
          )}
          {rankText(entry) && <span className="badge badge--manual">{rankText(entry)}</span>}
          {entry.count > 1 && <span className="badge badge--manual">×{entry.count}</span>}
          <span className={`badge ${entry.source === 'vision' ? 'badge--auto' : 'badge--manual'}`}>
            {entry.source === 'vision' ? '截图识别' : '手动添加'}
          </span>
          <button
            className="button button--icon"
            onClick={onRefresh}
            disabled={state.status === 'loading'}
            title="刷新报价"
            aria-label="刷新报价"
          >
            ↻
          </button>
          <button className="button button--icon" onClick={onRemove} title="移除" aria-label="移除物品">
            ×
          </button>
        </div>
      </div>

      {state.status === 'loading' && <p className="hint">正在查询报价…</p>}
      {state.status === 'error' && <p className="notice notice--error">{state.message}</p>}
      {state.status === 'empty' && <p className="notice">当前没有在售或求购挂单。</p>}

      {state.status === 'ready' && (
        <>
          <div className="summary">
            <div className="summary__cell summary__cell--sell">
              <span>最低卖价</span>
              <strong>{state.quote.summary.minSell ?? '—'}p</strong>
            </div>
            <div className="summary__cell">
              <span>在售数量</span>
              <strong>{state.quote.summary.sellCount}</strong>
            </div>
            <div className="summary__cell summary__cell--buy">
              <span>最高买价</span>
              <strong>{state.quote.summary.maxBuy ?? '—'}p</strong>
            </div>
            <div className="summary__cell">
              <span>价差</span>
              <strong>{state.quote.summary.spread ?? '—'}p</strong>
            </div>
          </div>

          <div className="columns">
            <div>
              <p className="columns__title columns__title--sell">在售前 3 条</p>
              <ul className="orders">
                {state.quote.sell.slice(0, 3).map((order) => (
                  <li key={order.id}>
                    <span className="orders__price">{order.platinum}p</span>
                    <span className="orders__user">{order.user?.ingameName || '匿名'}</span>
                    <span className="orders__qty">×{order.quantity}</span>
                    <span className={`orders__status orders__status--${order.user?.status ?? 'offline'}`}>
                      {order.user?.status === 'ingame' ? '游戏中' : order.user?.status === 'online' ? '在线' : '离线'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="columns__title columns__title--buy">求购前 3 条</p>
              <ul className="orders">
                {state.quote.buy.slice(0, 3).map((order) => (
                  <li key={order.id}>
                    <span className="orders__price">{order.platinum}p</span>
                    <span className="orders__user">{order.user?.ingameName || '匿名'}</span>
                    <span className="orders__qty">×{order.quantity}</span>
                    <span className={`orders__status orders__status--${order.user?.status ?? 'offline'}`}>
                      {order.user?.status === 'ingame' ? '游戏中' : order.user?.status === 'online' ? '在线' : '离线'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {maxRank > 0 && (
            <p className="hint">
              以上为 {rank === 0 ? '未升级 rank 0' : `rank ${rank}`} 的报价
              {rank === maxRank ? `（满级）` : `，满级为 rank ${maxRank}`}。
            </p>
          )}
          {entry.count > 1 && state.quote.summary.minSell !== null && (
            <p className="hint">
              数量 ×{entry.count}，按最低卖价估算总价 {state.quote.summary.minSell * entry.count}p。
            </p>
          )}
        </>
      )}
    </div>
  )
}
