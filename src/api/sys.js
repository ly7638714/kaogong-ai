// 系统提示词组装：合并通用 SYS + 专项 KB + 自定义 sys
import { store } from '../store'
import { SYS, KB } from '../kb'

export function buildSys(extraMode) {
  let sp = (store.cfg.sys || '').trim()
  if (!sp && store.cfg.kb !== false) {
    const base = KB[store.mode] || ''
    const extra = extraMode && extraMode !== store.mode ? KB[extraMode] || '' : ''
    sp = SYS + base + extra
  }
  return sp
}
