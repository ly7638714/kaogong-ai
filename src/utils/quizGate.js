// quizGate.js —— 出题闸门判定纯函数（39号矩阵 §4 组合铁律，供组合级单测）
// 目的：把 useExamGen 里散落的“放宽兜底 / AI复核需否”判定抽成可单测的纯函数，
//       固化「strictGen+AI否决禁放行 / calcBad禁复活 / 真假话禁放宽 / 填空类复核上限放行」。
// 约定：本文件只导出纯函数、不读 store/不写状态；useExamGen 调用它并保持行为一致。

// 放宽兜底是否允许（对应 39号 §4-1/2/5）：
// - lastParsedOk：最近一次版本已过本地唯一单选质检（唯一单选是底线，不过绝不收）
// - calcBad：数量/资料验算程序复核未过 → 禁复活数值错误题
// - isTruthTable：真假话必须程序真值表硬校验，禁放宽
// - qcHardFail：AI 复核“内容真否决”→ 宁判失败重出，不把争议题发给用户（调用失败不算，不置此位）
export function canRelaxDecision({ hasLastParsed, lastOk, calcBad, isTruthTable, qcHardFail }) {
  if (!hasLastParsed) return false
  if (!lastOk) return false
  if (calcBad) return false
  if (isTruthTable) return false
  if (qcHardFail) return false
  return true
}

// 本轮是否需要走 AI 复核（对应 39号 §4-4：填空类本地质检过 + attempt>=1 → 跳过复核防误杀）
export function needAiRecheck({ aiGateOn, ttVerified, isBlank, attempt }) {
  return !!(aiGateOn && !ttVerified && !(isBlank && attempt >= 1))
}
