// 系统提示词组装：合并通用 SYS + 专项 KB + 题型方法卡（批次7+retrieveV2） + 自定义 sys
import { store } from '../store'
import { SYS, KB } from '../kb'
import { retrieveCards, renderCards } from '../kb/retrieve'
import { retrieveDetailed } from '../kb/retrieveV2'
import { confusableHints } from '../utils/intentProbe'
import { kbFlowHead, isMethodOverview } from '../utils/kbFlow'

export function buildSys(extraMode, question) {
  let sp = (store.cfg.sys || '').trim()
  if (!sp && store.cfg.kb !== false) {
    // S1 分层注入：默认只给板块“流程头”，问方法总览/无题干时才给整块（防长文稀释）
    const kbText = (extraMode && KB[extraMode]) ? KB[extraMode] : (KB[store.mode] || '')
    const q0 = String(question || '')
    const useFull = !q0.trim() || isMethodOverview(q0)
    sp = SYS + (kbText ? (useFull ? kbText : kbFlowHead(kbText)) : '')
    if (kbText && !useFull) sp += '\n【流程执行·按步作答】先说出正在执行该板块流程第几步（如言语①定题型→②定结构→③主题词→④对比择优→⑤答案），再逐步走完并落到本题，禁止跳步直接给结论。'
    // 批次7·S1+retrieveV2：按板块+题干检索方法卡注入（V2 强命中优先；无命中退回旧检索避免噪音）
    try {
      const plate = extraMode || store.mode || ''
      const q = question || ''
      const v2 = retrieveDetailed(plate, q, 4)
      const cards = v2.length ? v2.map((x) => x.card) : retrieveCards(plate, q, 4)
      if (cards.length) sp += renderCards(cards)
      // P0-1 易混判别：命中易混组合时给模型“勿混淆”提示，提升区分度
      const hints = confusableHints(plate, q)
      if (hints.length) sp += '\n【易混提示·作答前先判别】' + hints.join('\n')
    } catch (e) {}
  }
  return sp
}