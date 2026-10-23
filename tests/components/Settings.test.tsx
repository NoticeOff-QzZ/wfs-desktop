// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from '../../src/components/Settings'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

const bridgeMock = vi.hoisted(() => ({
  secretSet: vi.fn(() => Promise.resolve()),
  settingsSave: vi.fn(() => Promise.resolve()),
  secretClear: vi.fn(() => Promise.resolve()),
  diagnosticsExport: vi.fn(() => Promise.resolve('C:\\diagnostics.txt')),
  logEvent: vi.fn(() => Promise.resolve()),
  providerTest: vi.fn(),
}))

vi.mock('../../src/lib/bridge', () => ({
  bridge: bridgeMock,
  errorMessage: (error: unknown) => String(error),
}))

vi.mock('../../src/lib/opener', () => ({
  revealPath: vi.fn(() => Promise.resolve()),
}))

function renderSettings(overrides: Partial<React.ComponentProps<typeof Settings>> = {}) {
  const onSaved = vi.fn()
  const props: React.ComponentProps<typeof Settings> = {
    settings: DEFAULT_SETTINGS,
    hasKey: false,
    onClose: vi.fn(),
    onSaved,
    onClearCache: vi.fn(),
    ...overrides,
  }
  render(<Settings {...props} />)
  return { onSaved }
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves settings exactly once', async () => {
    const { onSaved } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(bridgeMock.settingsSave).toHaveBeenCalledTimes(1))
    expect(bridgeMock.secretSet).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('saves a new key together with settings', async () => {
    const { onSaved } = renderSettings()

    fireEvent.change(screen.getByPlaceholderText('粘贴 API Key'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(bridgeMock.secretSet).toHaveBeenCalledWith('sk-test'))
    expect(bridgeMock.settingsSave).toHaveBeenCalledTimes(1)
    expect(onSaved.mock.calls[0]?.[1]).toBe(true)
  })

  it('blocks saving when validation fails', () => {
    renderSettings()

    fireEvent.change(screen.getByPlaceholderText('deepseek-flash'), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByText('模型名不能为空')).toBeInTheDocument()
    expect(bridgeMock.settingsSave).not.toHaveBeenCalled()
  })

  it('shows credential manager errors', () => {
    renderSettings({ keyError: '凭据服务不可用' })
    expect(screen.getByText('读取凭据状态失败：凭据服务不可用')).toBeInTheDocument()
  })
})
