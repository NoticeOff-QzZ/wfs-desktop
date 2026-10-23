import type { VisionResult } from '../types'

/**
 * 只有确实可能是帕拉松卡时才自动弹出候选面板，避免普通识别失败也弹 39 张卡。
 */
export function shouldOpenParazonPicker(vision: VisionResult): boolean {
  if (vision.family === 'parazon') return true
  if (vision.family === 'requiem' && vision.items.length === 0) return true
  return /帕拉松|parazon/i.test(vision.notes)
}
