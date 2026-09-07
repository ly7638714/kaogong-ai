// attemptLog 作答事件流（35号批次1-B）回归：qid 稳定 / cls 题类键 / 读写与环形截断 / 幂等回填
const __mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in __mem ? __mem[k] : null),
  setItem: (k, v) => { __mem[k] = String(v) },
  removeItem: (k) => { delete __mem[k] },
  clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] }
}
import { describe, it, expect, beforeEach } from 'vitest'
import { qidOf, clsOf, buildAttempt, appendAttempt, readAttempts, saveAttempts, backfillFromQuizCol, resetBackfillFlag, ATTEMPT_MAX, GEN_VER } from '../utils/attemptLog'

const q = {
  subject: '资料分析', variant: '比重', difficulty: 'mid',
  stem: '2019年第三产业增加值占GDP的比重比上年上升', answer: 'C', kpoint: ''
}

describe('attemptLog qid / cls', () => {
  it('qid 稳定可复现，且对不同题干可区分', () => {
    expect(qidOf(q.stem)).toBe(qidOf(q.stem))
    expect(qidOf('甲')).not.toBe(qidOf('乙'))
  })
  it('cls 题类键 = 板块|题型|难度档|genVer', () => {
    expect(clsOf(q)).toBe('资料分析|比重|mid|' + GEN_VER)
    expect(clsOf({ subject: '判断推理', variant: '', difficulty: 'easy' })).toBe('判断推理|综合|easy|' + GEN_VER)
    expect(clsOf({ subject: '言语理解', variant: '中心理解', difficulty: 'bad' })).toBe('言语理解|中心理解|mid|' + GEN_VER)
  })
})

describe('attemptLog 读写与环形截断', () => {
  beforeEach(() => { localStorage.clear(); resetBackfillFlag() })
  it('append 后可读回，字段完整', () => {
    const ev = buildAttempt(q, { ok: false, pick: 'A', usedSec: 37, timeout: false }, 'paper', 'p1')
    appendAttempt(ev)
    const list = readAttempts()
    expect(list.length).toBe(1)
    expect(list[0]).toMatchObject({ ok: false, pick: 'A', usedSec: 37, src: 'paper', paperId: 'p1', plate: '资料分析', variant: '比重', reqDiff: 'mid' })
    expect(list[0].kpoint).toBe('比重·两期比重') // 无 AI 自标时本地兜底
    expect(list[0].cls).toBe('资料分析|比重|mid|' + GEN_VER)
    expect(list[0].qid).toBeTruthy()
    expect(list[0].answer).toBe('C')
  })
  it('超上限丢弃最旧（环形 3000）', () => {
    for (let i = 0; i < ATTEMPT_MAX + 10; i++) appendAttempt({ t: i, qid: 'q' + i })
    const list = readAttempts()
    expect(list.length).toBe(ATTEMPT_MAX)
    expect(list[0].qid).toBe('q10')
    expect(list[list.length - 1].qid).toBe('q' + (ATTEMPT_MAX + 9))
  })
  it('mark 为空/超时/空白均能落成 ok=false 事件', () => {
    appendAttempt(buildAttempt(q, { ok: false, pick: '', timeout: true, usedSec: 60 }, 'single', ''))
    const t = readAttempts()[0]
    expect(t.ok).toBe(false)
    expect(t.timeout).toBe(true)
    expect(t.usedSec).toBe(60)
    expect(t.src).toBe('single')
  })
})

describe('attemptLog 幂等回填 quizCol 存量 history', () => {
  beforeEach(() => { localStorage.clear(); resetBackfillFlag() })
  it('attempts 为空时从 xc_quiz_col 生成（qid+t 去重），二次调用不再回填', () => {
    const col = [
      { subject: '资料分析', variant: '增长率', difficulty: 'easy', stem: '2020年增速约为百分之几', answer: 'A', kpoint: '', history: [{ t: 1000, ok: true }, { t: 1001, ok: false }] },
      { subject: '资料分析', variant: '增长率', difficulty: 'easy', stem: '2020年增速约为百分之几', answer: 'A', kpoint: '', history: [{ t: 1000, ok: true }] } // 重复 qid+t 应跳过
    ]
    localStorage.setItem('xc_quiz_col', JSON.stringify(col))
    const n = backfillFromQuizCol(null)
    expect(n).toBe(2)
    const list = readAttempts()
    expect(list.length).toBe(2)
    expect(list[0]).toMatchObject({ ok: true, t: 1000, src: 'redo', variant: '增长率', reqDiff: 'easy' })
    expect(backfillFromQuizCol(null)).toBe(0)
  })
  it('attempts 非空时不再回填', () => {
    saveAttempts([{ qid: 'x', t: 1 }])
    expect(backfillFromQuizCol([{ subject: '言语理解', stem: 'x', history: [{ t: 1, ok: true }] }])).toBe(0)
  })
})
