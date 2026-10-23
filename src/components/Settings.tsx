import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { bridge, errorMessage } from '../lib/bridge'
import { revealPath } from '../lib/opener'
import { DEEPSEEK_DEFAULTS, DEFAULT_SETTINGS, validateSettings } from '../lib/settings'

interface Props {
  settings: AppSettings
  hasKey: boolean
  keyError?: string | null
  onClose: () => void
  onSaved: (settings: AppSettings, hasKey: boolean) => void
  onClearCache: () => void
}

export default function Settings({ settings, hasKey, keyError, onClose, onSaved, onClearCache }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [apiKey, setApiKey] = useState('')
  const [keyConfigured, setKeyConfigured] = useState(hasKey)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const patch = (value: Partial<AppSettings>) => setDraft((current) => ({ ...current, ...value }))
  const errors = validateSettings(draft)
  const hasErrors = Object.keys(errors).length > 0

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const save = async (): Promise<boolean> => {
    setSaving(true)
    setMessage(null)
    try {
      if (hasErrors) {
        setMessage({ kind: 'error', text: '请先修正标红的配置项' })
        return false
      }
      if (apiKey.trim()) {
        await bridge.secretSet(apiKey.trim())
        setKeyConfigured(true)
        setApiKey('')
      }
      const normalized: AppSettings = {
        ...draft,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        userAgent: draft.userAgent.trim(),
      }
      await bridge.settingsSave(normalized)
      onSaved(normalized, keyConfigured || Boolean(apiKey.trim()))
      setMessage({ kind: 'ok', text: '已保存' })
      return true
    } catch (error) {
      const text = `保存失败：${errorMessage(error)}`
      setMessage({ kind: 'error', text })
      void bridge.logEvent('error', 'settings_save_failed', text).catch(() => undefined)
      return false
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const ok = await save()
      if (!ok) return
      const result = await bridge.providerTest()
      setMessage({
        kind: 'ok',
        text: `连接成功（${result.latencyMs}ms）：${result.sample || 'OK'}`,
      })
    } catch (error) {
      setMessage({ kind: 'error', text: `连接失败：${errorMessage(error)}` })
    } finally {
      setTesting(false)
    }
  }

  const clearKey = async () => {
    try {
      await bridge.secretClear()
      setKeyConfigured(false)
      setApiKey('')
      setMessage({ kind: 'ok', text: '已清除 API Key' })
      onSaved(settings, false)
    } catch (error) {
      setMessage({ kind: 'error', text: `清除失败：${errorMessage(error)}` })
    }
  }

  const exportDiagnostics = async () => {
    setExporting(true)
    setMessage(null)
    try {
      const path = await bridge.diagnosticsExport()
      await revealPath(path)
      setMessage({ kind: 'ok', text: `诊断信息已导出：${path}` })
    } catch (error) {
      const text = `导出失败：${errorMessage(error)}`
      setMessage({ kind: 'error', text })
      void bridge.logEvent('error', 'diagnostics_export_failed', text).catch(() => undefined)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id="settings-title">设置</h2>
          <button className="button button--icon" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3>模型服务</h3>
          <p className="hint">
            Key 只保存在 Windows 凭据管理器里，不会写进配置文件，也不会出现在界面与日志中。
          </p>
          {keyError && <p className="notice notice--error">读取凭据状态失败：{keyError}</p>}

          <div className="field">
            <label>服务预设</label>
            <div className="segmented">
              <button
                className={`button ${draft.providerPreset === 'deepseek' ? 'button--primary' : ''}`}
                onClick={() =>
                  patch({ providerPreset: 'deepseek', ...DEEPSEEK_DEFAULTS })
                }
              >
                DeepSeek
              </button>
              <button
                className={`button ${draft.providerPreset === 'custom' ? 'button--primary' : ''}`}
                onClick={() => patch({ providerPreset: 'custom' })}
              >
                自定义兼容
              </button>
            </div>
          </div>

          <div className="field">
            <label>Base URL</label>
            <input
              value={draft.baseUrl}
              onChange={(event) => patch({ baseUrl: event.target.value })}
              placeholder="https://api.deepseek.com"
              aria-invalid={Boolean(errors.baseUrl)}
            />
            {errors.baseUrl && <p className="field__error">{errors.baseUrl}</p>}
          </div>

          <div className="field">
            <label>模型名</label>
            <input
              value={draft.model}
              onChange={(event) => patch({ model: event.target.value })}
              placeholder="deepseek-flash"
              aria-invalid={Boolean(errors.model)}
            />
            {errors.model && <p className="field__error">{errors.model}</p>}
          </div>

          <div className="field">
            <label>
              API Key
              <span className={`badge ${keyConfigured ? 'badge--auto' : 'badge--confirm'}`}>
                {keyConfigured ? '已配置' : '未配置'}
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={keyConfigured ? '留空表示不修改' : '粘贴 API Key'}
              autoComplete="off"
            />
            {keyConfigured && (
              <button className="button button--ghost" onClick={clearKey}>
                清除已保存的 Key
              </button>
            )}
          </div>

          <div className="field">
            <label>请求超时（秒）</label>
            <input
              type="number"
              min={10}
              max={600}
              value={draft.timeoutSeconds}
              onChange={(event) => patch({ timeoutSeconds: Number(event.target.value) })}
              aria-invalid={Boolean(errors.timeoutSeconds)}
            />
            {errors.timeoutSeconds && <p className="field__error">{errors.timeoutSeconds}</p>}
          </div>
        </section>

        <section className="settings-section">
          <h3>查询偏好</h3>
          <div className="field-row">
            <div className="field">
              <label>MOD 默认等级</label>
              <input
                type="number"
                min={0}
                value={draft.modRank}
                onChange={(event) => patch({ modRank: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label>赋能默认等级</label>
              <select
                value={draft.arcaneRank === null ? 'max' : String(draft.arcaneRank)}
                onChange={(event) =>
                  patch({ arcaneRank: event.target.value === 'max' ? null : Number(event.target.value) })
                }
              >
                <option value="max">满级（rank 5）</option>
                {[0, 1, 2, 3, 4, 5].map((rank) => (
                  <option key={rank} value={rank}>
                    rank {rank}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>warframe.market User-Agent</label>
            <input
              value={draft.userAgent}
              onChange={(event) => patch({ userAgent: event.target.value })}
              aria-invalid={Boolean(errors.userAgent)}
            />
            {errors.userAgent && <p className="field__error">{errors.userAgent}</p>}
            <p className="hint">官方规则要求可识别的客户端标识，建议包含项目名与联系方式。</p>
          </div>
        </section>

        <section className="settings-section">
          <h3>数据</h3>
          <div className="field-row">
            <button className="button" onClick={onClearCache}>
              清空物品库缓存
            </button>
            <button className="button" onClick={() => void exportDiagnostics()} disabled={exporting}>
              {exporting ? '导出中…' : '导出诊断信息'}
            </button>
            <button
              className="button"
              onClick={() => {
                setDraft({ ...DEFAULT_SETTINGS })
                setMessage({ kind: 'ok', text: '已恢复默认值，记得保存' })
              }}
            >
              恢复默认设置
            </button>
          </div>
        </section>

        {message && (
          <p className={`notice ${message.kind === 'error' ? 'notice--error' : ''}`}>{message.text}</p>
        )}

        <div className="modal__footer">
          <button className="button" onClick={test} disabled={testing || saving}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button
            className="button button--primary"
            onClick={() => void save()}
            disabled={saving || hasErrors}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
