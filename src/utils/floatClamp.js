// 悬浮物落点约束（批次2.3）：避让顶部 HUD 区与底部输入区 + 视口内钳制
export const FLOAT_TOP_SAFE = 96
export const FLOAT_BOTTOM_SAFE = 78
export function floatSafeClamp(x, y, w, h, vw = window.innerWidth, vh = window.innerHeight, topSafe = FLOAT_TOP_SAFE) {
  const width = w || 54, height = h || 54
  const ts = topSafe == null ? FLOAT_TOP_SAFE : topSafe
  const nx = Math.max(4, Math.min(vw - width - 4, x == null ? 4 : x))
  const ny = Math.max(ts, Math.min(vh - height - FLOAT_BOTTOM_SAFE, y == null ? ts : y))
  return { x: nx, y: ny }
}
export function vpBucket(width) { return (width || window.innerWidth) <= 640 ? 'm' : 'd' }
