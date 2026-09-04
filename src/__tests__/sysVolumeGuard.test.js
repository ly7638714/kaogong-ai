// S4-2 sys 注入体积护栏（33 号计划）：普通单题作答必须“轻量分层”——只带板块流程头+命中卡，绝不回潮为整块 KB 全文注入
import { describe, it, expect } from 'vitest'
import { store } from '../store'
import { buildSys } from '../api/sys'
import { KB } from '../kb'
import { PLATE_MODE } from '../api/tasks'

// 固定中性提问（非方法总览、非极简），用于稳定测量
const Q = '这道题帮我按步骤讲讲，先判断题型再对比选项，最后说明为什么其他选项不对'

function compact(s) {
  return String(s || '').replace(/\s+/g, ' ')
}

describe('S4-2 注入体积护栏（防整块 KB 回潮）', () => {
  it('普通作答不注入 KB 全文且总量有界', () => {
    store.cfg.sys = ''
    store.cfg.kb = true
    store.mode = 'all'
    const SYS_LEN = buildSys('yanyu', Q).length // 各板块基线几乎一致（SYS 主导）
    expect(SYS_LEN).toBeGreaterThan(4000) // SYS 基底存在
    for (const [plate6, mode] of Object.entries(PLATE_MODE)) {
      const kb = KB[mode] || ''
      if (kb.length < 120) continue // 空/极短 KB 板块跳过（无全文可回潮）
      const sys = buildSys(mode, Q)
      // ① 绝对上限：即使命中 4 张方法卡也不允许超过该量级；一旦回潮注入整块 KB 必然超限
      expect(sys.length, plate6 + ' sys 总量').toBeLessThanOrEqual(8200)
      // ② 全文探针：KB 末尾 64 字只在“整块注入”时出现，流程头注入必不含
      const tail = compact(kb).slice(-64)
      if (tail.trim().length > 24) {
        expect(compact(sys).includes(tail.trim()), plate6 + ' 不得包含 KB 全文').toBe(false)
      }
    }
  })
  it('问“方法总览”时才允许整块 KB（仍走总览通道）', () => {
    store.cfg.sys = ''
    store.cfg.kb = true
    store.mode = 'all'
    for (const [plate6, mode] of Object.entries(PLATE_MODE)) {
      const kb = KB[mode] || ''
      if (kb.length < 400) continue
      const overQ = '请讲讲' + plate6 + '的整体方法论和体系全貌，按目录给我讲一遍'
      const normal = buildSys(mode, Q).length
      const over = buildSys(mode, overQ).length
      expect(over, plate6 + ' 总览应注入整块 KB').toBeGreaterThan(normal)
    }
  })
})
