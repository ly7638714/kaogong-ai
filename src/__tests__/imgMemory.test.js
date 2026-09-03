import { describe, it, expect } from 'vitest'
import { splitQuestionsFromRead, makeImgNotes, attachImageRead, buildChatHistory, lastImgTopics, ensureImgNotesForHistory } from '../utils/imgMemory'

describe('P-M 图文记忆 imgMemory', () => {
  it('多题切分：显式题号才切，正文数字行不误切', () => {
    const multi = '材料：某市2024年数据如下。\n第1题：2024年该市GDP同比增速为？\nA 5% B 6% C 7% D 8%\n第2题：第三产业占比为？\nA 30% B 40% C 50% D 60%'
    const parts = splitQuestionsFromRead(multi)
    expect(parts.length).toBeGreaterThanOrEqual(3)
    expect(parts.some((x) => x.includes('第1题'))).toBe(true)
    expect(parts.some((x) => x.includes('第2题'))).toBe(true)
    expect(parts.filter((x) => !x.includes('材料')).length).toBeGreaterThanOrEqual(2)
    const single = '2024年产量5460万吨，同比增长14%……（无题号标记的一段）'
    expect(splitQuestionsFromRead(single)).toEqual([single])
  })

  it('makeImgNotes 生成多题清单与一行摘要', () => {
    const n = makeImgNotes('第1题：甲方案\n第2题：乙方案')
    expect(n.qs.length).toBe(2)
    expect(n.brief).toContain('第1题')
    expect(n.brief).toContain('第2题')
  })

  it('attachImageRead 同时写 _curImgRead 与 imgNotes', () => {
    const m = attachImageRead({}, '第1题：x\n第2题：y')
    expect(m._curImgRead).toContain('第1题')
    expect(m.imgNotes.qs.length).toBe(2)
  })

  it('buildChatHistory：旧图纪要转文字、仅最新一张带真实图、不可看图给占位', () => {
    const D = 'data:image/png;base64,AAAA'
    const msgs = [
      { role: 'user', content: { text: '', imgs: [D] }, _curImgRead: '第1题：2024年增速？\n第2题：比重？', imgNotes: makeImgNotes('第1题：2024年增速？\n第2题：比重？') },
      { role: 'assistant', content: '先答第1题：增速…' },
      { role: 'user', content: '那第2题呢？' }
    ]
    const vis = buildChatHistory(msgs, { visOk: true })
    expect(vis.length).toBe(3)
    const user0 = vis[0].content
    expect(JSON.stringify(user0)).toContain('【图片内容】')
    expect(JSON.stringify(user0)).toContain('第1题')
    const imgCount = (JSON.stringify(vis).match(/"type":"image_url"/g) || []).length
    expect(imgCount).toBe(1)
    const noVis = buildChatHistory(msgs, { visOk: false })
    expect(JSON.stringify(noVis)).not.toContain('image_url')
    expect(JSON.stringify(noVis)).toContain('【图片内容】')
  })

  it('buildChatHistory：纯图无文字且无纪要且不可看图 → 待读取占位；有纪要则优先文字', () => {
    const D = 'data:image/png;base64,AAAA'
    const msgs = [{ role: 'user', content: { text: '', imgs: [D] } }]
    const h = buildChatHistory(msgs, { visOk: false, attachImg: false })
    expect(JSON.stringify(h[0].content)).toContain('待读取')
  })

  it('lastImgTopics 输出最近截图题目目录', () => {
    const msgs = [{ role: 'user', content: { text: '', imgs: ['d:1'] }, imgNotes: makeImgNotes('第1题：GDP\n第2题：CPI') }]
    const topics = lastImgTopics(msgs, 6)
    expect(topics.length).toBe(2)
    expect(topics[0]).toContain('截图第1题')
  })

  it('ensureImgNotesForHistory 只补读最新一张无纪要的图并写回', async () => {
    const D = 'data:image/png;base64,AAAA'
    const msgs = [
      { role: 'user', content: { text: '', imgs: [D] } },
      { role: 'user', content: '追问' }
    ]
    let calls = 0
    const readFn = async () => { calls++; return { ok: true, text: '第1题：…读取内容', fig: '' } }
    const r = await ensureImgNotesForHistory(msgs, readFn)
    expect(r.changed).toBe(true)
    expect(msgs[0]._curImgRead).toContain('读取内容')
    expect(calls).toBe(1)
    const r2 = await ensureImgNotesForHistory(msgs, readFn)
    expect(r2.changed).toBe(false)
    expect(calls).toBe(1)
  })
})