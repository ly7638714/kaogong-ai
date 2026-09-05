// batchReview（AI 批量复盘纯函数）回归
import { describe, it, expect } from 'vitest'
import { batchReviewSys, batchReviewUser, parseBatchLine, parseBatchText, batchReviewMd, qFullMd, BATCH_MAX } from '../utils/batchReview'
describe('batchReview', () => {
  it('sys 含输出格式约束', () => {
    const s = batchReviewSys()
    expect(s).toContain('第N题')
    expect(s).toContain('错因')
  })
  it('batchReviewUser 组装题干/答案/错因', () => {
    const q = { subject: '判断推理', question: '某题题干 A. x B. y', answer: 'B', reasons: ['偷换概念'], wrongCount: 2 }
    const u = batchReviewUser(q, 0)
    expect(u).toContain('第1题')
    expect(u).toContain('正确答案：B')
    expect(u).toContain('偷换概念')
  })
  it('parseBatchLine 解析竖线四段', () => {
    const p = parseBatchLine('第3题 | 论点论据没分清 | 先圈结论再找论据 | 重做1道削弱题')
    expect(p.idx).toBe(2)
    expect(p.reason).toBe('论点论据没分清')
    expect(p.action).toContain('削弱')
  })
  it('parseBatchText 容错：跳题号回退顺序 + 代码围栏剔除', () => {
    const raw = '```\n第2题 | 错因2 | 修正2 | 动作2\n```\n第5题 | 错因5 | 修正5 | 动作5\n自由行无题号 | 兜底 | 修正 | 动作'
    const rows = parseBatchText(raw, 5)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].idx).toBe(1)
  })
  it('batchReviewMd 生成可导出报告', () => {
    const qs = [{ subject: '资料分析', question: '材料…问基期？', answer: 'C' }]
    const md = batchReviewMd([{ idx: 0, reason: '公式用错', fix: '先判基期/现期', action: '重算3题' }], qs)
    expect(md).toContain('# 🤖 AI 批量复盘报告')
    expect(md).toContain('公式用错')
    expect(BATCH_MAX).toBe(20)
  })
  it('qFullMd 保留题干/选项/答案/笔记并标注图形', () => {
    const q = { question: '```svg\n<svg/>\n```\n问基期？', options: [{ k: 'A', t: '100' }], answer: 'C', method: '先判基期', note: '别用现期' }
    const md = qFullMd(q)
    expect(md).toContain('问基期')
    expect(md).toContain('A. 100')
    expect(md).toContain('**正确答案：**C')
    expect(md).toContain('**秒杀：**先判基期')
    expect(md).toContain('含图形')
  })
})
