// askModes —— 第4层：提问意图/目的 向导选项及其系统提示映射
export const ASK_MODES = [
  { key: 'solve', label: '🎯 针对性解答', desc: '直接解这道题（默认）' },
  { key: 'retell', label: '🔁 重新讲透彻', desc: '一步步把思路讲明白' },
  { key: 'wrong', label: '🧠 错题复盘', desc: '我做错了，帮我找坑' },
  { key: 'pits', label: '⚠️ 易错点/注意事项', desc: '这题这类题的坑与防法' },
  { key: 'sum', label: '📌 总结考点/方法', desc: '浓缩本考点方法与口诀' }
]
export const MODE_MAP = Object.fromEntries(ASK_MODES.map((x) => [x.key, x]))

// 按意图返回追加到 sys 的提示（与 replyProtocol/plateCoach 协同；返回''表示默认作答即可）
export function askModeSys(key) {
  if (key === 'solve' || !key) return ''
  if (key === 'wrong') {
    // 错题复盘：交给 plateCoach 的板块错因框架；这里做兜底通用
    return '\n【意图：错题复盘】请只针对我答错的那一项定位错因（用题干/选项原文作证据），再给正确判定要点与1条防法；不要从头重讲整套，不要责备。'
  }
  if (key === 'retell') return '\n【意图：重新讲透彻】请放慢节奏：先把题型判定与题干结构一句话讲清，再按本板块答题流程逐步代入本题讲解，结尾用一句话点破最关键的转折/关系/公式；可用追问式口吻确认我懂没懂。'
  if (key === 'pits') return '\n【意图：易错点/注意事项】请聚焦本(类)题的易错点与陷阱：给出3-5条“最容易错在哪、怎么防”，每条必须落到本题或本题型，不展开全部方法论。'
  if (key === 'sum') return '\n【意图：总结考点/方法】请先定位本考点在板块知识树的位置（板块→细分→题型），再浓缩核心方法与口诀(≤8条)、附1道最典型考法示意；不要逐题长讲。'
  return ''
}

// 向导第1-3层的选项由 plateMatrix 提供；此处给出“可用性”帮助函数：某板块是否有细分/题型
export function wizardHas(plateTree, plate6, sub) {
  const g = (plateTree || {})[plate6] || {}
  if (!sub) return { l2: Object.keys(g).length > 0, l3: false }
  return { l2: Object.keys(g).length > 0, l3: (g[sub] || []).length > 0 }
}

// 自动意图检测：从用户泛化口吻识别 重讲/易错/总结（solve/wrong 走既有默认与错题通道，不在此重复）
export function detectMode(text) {
  const s = String(text || '')
  if (/(重讲|讲透|慢慢讲|一步一步|再讲|没懂|听不懂|详细讲讲)/.test(s)) return 'retell'
  if (/(注意|易错|坑点|陷阱|注意事项|容易错)/.test(s)) return 'pits'
  if (/(总结|归纳|考点|方法|口诀|框架|要点)/.test(s)) return 'sum'
  return ''
}