import type { RivenEntry, WeaponResolution } from '../types'
import { itemDisplayName } from '../types'

interface Props {
  entry: RivenEntry
  onPickWeapon: (weapon: WeaponResolution) => void
  onClearWeapon: () => void
  onRefresh: () => void
}

const MODE_LABEL: Record<'exact' | 'superset' | 'all', string> = {
  exact: '完全同词条',
  superset: '含这些词条且更多（不等价）',
  all: '不区分词条（仅看数量级）',
}

export default function RivenCard({ entry, onPickWeapon, onClearWeapon, onRefresh }: Props) {
  const { riven, weapon, candidates, state, tokenLabels } = entry

  return (
    <div className="card card--riven">
      <div className="card__header">
        <span className="card__thumb card__thumb--riven">裂</span>
        <div className="card__names">
          <span className="card__riven-name">{riven.rivenName || '（未读出裂罅名）'}</span>
          <em>
            {weapon ? itemDisplayName(weapon) : riven.weapon ? `卡面武器：${riven.weapon}` : '武器未知'}
          </em>
        </div>
        <div className="card__badges">
          <span className="badge badge--riven">裂罅</span>
          {riven.confidence !== 'high' && (
            <span className="badge badge--confirm">{riven.confidence === 'low' ? '低置信' : '待确认'}</span>
          )}
          {weapon && (
            <button
              className="button button--icon"
              onClick={onRefresh}
              disabled={state.status === 'loading'}
              title="刷新报价"
              aria-label="刷新裂罅报价"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      {tokenLabels.length > 0 && (
        <ul className="riven__tokens">
          {tokenLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}

      {!weapon && (
        <div className="weapon">
          <p className="hint">
            武器名不确定{candidates.length > 0 ? '，点选正确的武器即可查价：' : '，且没有找到候选，请换个角度重拍或手动搜索。'}
          </p>
          {candidates.length > 0 && (
            <div className="weapon-candidates">
              {candidates.map((candidate) => (
                <button key={candidate.slug} className="button" onClick={() => onPickWeapon(candidate)}>
                  {itemDisplayName(candidate)}
                  <em>{Math.round(candidate.score * 100)}%</em>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {weapon && (
        <div className="weapon--picked">
          <strong>{itemDisplayName(weapon)}</strong>
          {!weapon.certain && <span className="badge badge--confirm">手动确认</span>}
          <button className="button button--ghost" onClick={onClearWeapon}>
            换武器
          </button>
        </div>
      )}

      {state.status === 'loading' && <p className="hint">正在查询裂罅拍卖…</p>}
      {state.status === 'error' && <p className="notice notice--error">{state.message}</p>}

      {state.status === 'ready' && (
        <>
          <p className="riven__note">
            对比范围：<b>{MODE_LABEL[state.summary.mode]}</b>，该武器在售 {state.summary.total} 条，
            其中可比 {state.summary.matched} 条、有直售价 {state.summary.priced} 条。
          </p>

          {state.summary.mode === 'exact' || state.summary.mode === 'all' ? (
            <div className="summary">
              <div className="summary__cell summary__cell--sell">
                <span>最低价</span>
                <strong>{state.summary.min ?? '—'}p</strong>
              </div>
              <div className="summary__cell">
                <span>P25</span>
                <strong>{state.summary.p25 ?? '—'}p</strong>
              </div>
              <div className="summary__cell">
                <span>中位</span>
                <strong>{state.summary.median ?? '—'}p</strong>
              </div>
              <div className="summary__cell">
                <span>P75</span>
                <strong>{state.summary.p75 ?? '—'}p</strong>
              </div>
            </div>
          ) : (
            <p className="riven__note">
              没有完全同词条的挂牌，以下仅是「多一条词条」的参考，<b>不等价</b>，不提供价格区间。
            </p>
          )}

          {state.summary.examples.length > 0 && (
            <ul className="orders orders--riven">
              {state.summary.examples.slice(0, 4).map((auction) => (
                <li key={auction.id}>
                  <span className="orders__price">{auction.price ?? '—'}p</span>
                  <span>{auction.direct ? '直售' : '竞价'}</span>
                  <span className="orders__user">
                    {auction.rank}段/{auction.rerolls}洗 · {auction.positive.join(', ')}
                    {auction.negative.length > 0 ? ` · 负 ${auction.negative.join(', ')}` : ''}
                  </span>
                  <span className="orders__status">{auction.ownerName}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
