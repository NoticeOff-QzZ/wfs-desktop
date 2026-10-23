interface Props {
  catalogCount: number
  origin: 'network' | 'cache' | null
  hasKey: boolean
  loading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}

export default function Header({ catalogCount, origin, hasKey, loading, onRefresh, onOpenSettings }: Props) {
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__logo">WF</div>
        <div>
          <h1 className="header__title">WF 截图查价</h1>
          <p className="header__subtitle">粘贴截图 → 识别物品 / 裂罅 → warframe.market 实时行情</p>
        </div>
      </div>

      <div className="header__meta">
        <span className="badge badge--platform">PC · warframe.market</span>
        <span className="badge">
          {catalogCount > 0 ? `物品库 ${catalogCount} 件` : loading ? '物品库加载中…' : '物品库未加载'}
        </span>
        {origin && <span className="badge">{origin === 'cache' ? '本地缓存' : '已更新'}</span>}
        <span className={`badge ${hasKey ? 'badge--auto' : 'badge--confirm'}`}>
          {hasKey ? 'API 已配置' : '未配置 API'}
        </span>
        <button className="button button--ghost" onClick={onRefresh} disabled={loading}>
          刷新物品库
        </button>
        <button className="button" onClick={onOpenSettings}>
          设置
        </button>
      </div>
    </header>
  )
}
