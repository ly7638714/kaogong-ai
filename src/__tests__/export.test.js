import { describe, it, expect, beforeEach } from 'vitest'
import { getPayload } from '../utils/export'
import { store } from '../store'

describe('getPayload 错题导出数据组装', () => {
  beforeEach(() => {
    store.wqs = [
      {
        id: 1,
        subject: '判断推理',
        question: '削弱题',
        answer: 'D',
        reasons: ['出题人挖坑'],
        method: '先找结论主语',
        note: '削弱强度排序',
        time: '2026-08-24',
        reviewed: true,
        imgs: ['data:image/png;base64,AAAA']
      },
      { id: 2, subject: '言语理解', question: '主旨题', answer: 'A', reasons: [], time: '2026-08-24', reviewed: false, imgs: [] }
    ]
  })

  it('按板块分组并含复盘字段与图片（wrong）', () => {
    const pay = getPayload('wrong')
    expect(pay.title).toBe('行测 · 错题集（按板块整理）')
    // 首个 items 是板块标题
    expect(pay.items[0].type).toBe('h')
    expect(pay.items[0].text).toContain('判断推理')
    // 随后是该板块的错题 msg 块（含复盘字段与原图）
    const msgBlock = pay.items.find((x) => x.type === 'msg' && x.imgs && x.imgs.length)
    expect(msgBlock).toBeTruthy()
    expect(msgBlock.text).toContain('削弱题')
    expect(msgBlock.text).toContain('答案：D')
    expect(msgBlock.text).toContain('错因：出题人挖坑')
    expect(msgBlock.imgs[0]).toBe('data:image/png;base64,AAAA')
    expect(pay.plain).toContain('削弱题')
  })

  it('无错题时返回 null', () => {
    store.wqs = []
    expect(getPayload('wrong')).toBeNull()
  })
})
