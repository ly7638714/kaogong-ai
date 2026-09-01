// mastery.js —— 掌握度收编（批次6-6A）：以 StatsPage 雷达公式为基准，四页面统一口径
// 公式：错题越少、复盘越勤越高；无数据 → 0（与看板"—"语义一致的"暂无数据"）
export function masteryOfPlate(subject, wqs, opts = {}) {
  const plates = opts.plates || [subject]
  const wq = (wqs || []).filter((q) => plates.includes(q.subject || ''))
  const wrongN = wq.length
  const revN = wq.filter((q) => q.reviewed || q.digested).length
  if (wrongN === 0) return 0
  return Math.round(Math.min(100, Math.max(5, 100 - wrongN * 12 + revN * 3)))
}
// 六板块平均掌握度（看板/统计总览用）
export const MASTERY_PLATES = [
  { key: '判断推理', plates: ['判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', plates: ['言语理解'] },
  { key: '资料分析', plates: ['资料分析'] },
  { key: '数量关系', plates: ['数量关系'] },
  { key: '常识判断', plates: ['常识判断'] },
  { key: '政治理论', plates: ['政治理论'] }
]
export function overallEstimate(wqs) {
  const vals = MASTERY_PLATES.map((p) => masteryOfPlate(p.key, wqs, { plates: p.plates })).filter((v) => v > 0)
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}
