import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'

/** 在 Tauri 中交给系统浏览器；纯浏览器开发时退回 window.open。 */
export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/** 打开文件所在目录；浏览器开发或导出失败时静默忽略。 */
export async function revealPath(path: string): Promise<void> {
  try {
    await revealItemInDir(path)
  } catch {
    // 浏览器开发模式下没有文件系统能力。
  }
}
