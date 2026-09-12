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

// 本轮是否需要走 AI 复核。
// 稳定出题策略：AI 复核只对最多 1 个候选做一次（双模型互检可配到 2 次），
// 之后的候选由本地结构/程序验算把关。AI 结果不可解析或调用失败时不再判死，
// 防止质检模型格式漂移/网络波动把可用题反复拖到失败。
export function needAiRecheck({ aiGateOn, ttVerified, isBlank, attempt, aiReviews = 0, aiReviewLimit = 1 }) {
  if (!aiGateOn || ttVerified) return false
  if (aiReviews >= Math.max(1, Number(aiReviewLimit) || 1)) return false
  if (isBlank && attempt >= 1 && aiReviewLimit <= 1) return false
  return true
}
