// genBudget.js —— 出题时间预算（深化·速度护栏）
// 规则：单次生成/重试/质检/流式共用一份预算；用户配置 genTimeoutSec（秒，默认45，可配10..90），
// 越界一律收敛到 [10, 90]（纯函数、可单测，杜绝 NaN/负数/超大值拖垮重试兜底）。
export const GEN_TIMEOUT_DEFAULT = 45 // 秒
export const GEN_TIMEOUT_MIN = 10
export const GEN_TIMEOUT_MAX = 90

export function clampTimeoutSec(sec) {
  const s = Number(sec)
  if (!Number.isFinite(s) || s <= 0) return GEN_TIMEOUT_DEFAULT
  return Math.max(GEN_TIMEOUT_MIN, Math.min(GEN_TIMEOUT_MAX, Math.round(s)))
}

// 单次尝试预算（毫秒）：clamp 后 ×1000
export function genTimeoutMs(sec) {
  return clampTimeoutSec(sec) * 1000
}

// 整题硬性总预算（毫秒）：默认 = 2 次尝试预算（如45s单次 → 90s整题止损），始终 ≥ 单次预算×1.5 防退化
export function genDeadlineMs(sec) {
  const ms = genTimeoutMs(sec)
  return Math.round(ms * 2)
}
