// sameStreak.js —— 5.3 同类连做决策引擎（doc35 §5.3 建议项；纯函数可测）
// 规则：答错 → 钉住当前考点/题型继续练（换素材不换考点）；连对 3 题 → 清钉、换下一考点；
// 关闭时不干预（fallback 由调用方正常轮换）。默认关：接入单题快练前需产品确认交互。

export function createSameStreak() {
  return { plate: null, variant: null, okStreak: 0 }
}

// 一次作答后更新状态：{ enabled 关 → 不钉住 }；返回新状态
export function onSameResult(st, { subject, variant, ok, enabled }) {
  const s = st || createSameStreak()
  if (!enabled) return { plate: null, variant: null, okStreak: 0 }
  const v = String(variant || '')
  if (!ok) return { plate: String(subject || ''), variant: v, okStreak: 0 }
  const streak = s.plate === subject && s.variant === v ? s.okStreak + 1 : 1
  if (streak >= 3) return { plate: String(subject || ''), variant: null, okStreak: 0 } // 连对3题 → 换考点
  return { plate: String(subject || ''), variant: v, okStreak: streak }
}

// 下一题该用的考点：钉住则用钉住值，否则 fallback（轮换/预生成结果）
export function nextSameKey(st, fallback) {
  return st && st.variant ? st.variant : fallback
}

export default { createSameStreak, onSameResult, nextSameKey }
