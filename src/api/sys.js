// 系统提示词组装：合并通用 SYS + 专项 KB + 题型方法卡（批次7） + 自定义 sys
import { store } from '../store'
import { SYS, KB } from '../kb'
import { retrieveCards, renderCards } from '../kb/retrieve'

export function buildSys(extraMode, question) {
  let sp = (store.cfg.sys || '').trim()
  if (!sp && store.cfg.kb !== false) {
    const base = KB[store.mode] || ''
    const extra = extraMode && extraMode !== store.mode ? KB[extraMode] || '' : ''
    sp = SYS + base + extra
    // 批次7·S1：按板块+题干检索方法卡注入（零命中不注，避免噪音）
    try {
      const plate = extraMode || store.mode || ''
      const cards = retrieveCards(plate, question || '', 4)
      if (cards.length) sp += renderCards(cards)
    } catch (e) {}
  }
  return sp
}
