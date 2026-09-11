import { describe, it, expect, beforeEach, vi } from 'vitest'
import { store } from '../store'
import { chatOnce } from '../api/client'
import { rdCfg, speechScriptKind, speakReadyText } from '../utils/speechScript'

vi.mock('../api/client', () => ({ chatOnce: vi.fn(async () => '') }))

function cfg() {
  store.cfg.rd = { on: true, prov: 'ds', key: 'k', url: 'https://api.test/chat/completions', model: 'flash' }
}

describe('speechScript 语音阅读讲稿改写', () => {
  beforeEach(() => {
    cfg()
    vi.mocked(chatOnce).mockReset()
    vi.mocked(chatOnce).mockResolvedValue('来，这里先记住结论：先找矛盾关系。')
  })

  it('配置缺失/关闭时直接返回原文且不调 LLM', async () => {
    store.cfg.rd = { on: false, key: '', url: '', model: '' }
    const src = '这道题的关键是先找矛盾关系，再判断真假。'
    await expect(speakReadyText(src)).resolves.toBe(src)
    expect(rdCfg()).toBeNull()
    expect(vi.mocked(chatOnce)).not.toHaveBeenCalled()
  })

  it('已经很短且完整的句子不再花一次 LLM 改写', async () => {
    const src = '图形题先看黑点移动方向。'
    await expect(speakReadyText(src)).resolves.toBe(src)
    expect(vi.mocked(chatOnce)).not.toHaveBeenCalled()
  })

  it('题干/选项场景提示保留数字、选项和逻辑关系', async () => {
    const raw =
      '所有参加培训的人都通过了考试，但有些人没通过。以下哪项最能解释这一矛盾？A、有些人没参加培训。B、通过名单有误。'
    await speakReadyText(raw)
    const msgs = vi.mocked(chatOnce).mock.calls[0][1]
    expect(msgs[0].content).toContain('短句为主')
    expect(msgs[1].content).toContain('这是题干/选项/判题内容')
    expect(msgs[1].content).toContain(raw)
  })

  it('讲稿生成前剔除依据卡和来源标注，只把正文交给阅读模型', async () => {
    const main = '先把结论和论据翻译出来，再比较选项方向。看到转折先确认重点，看到因果先找结论，看到并列要完整覆盖，最后再回文检查主体和范围。'
    const raw = main + main + '\n📚 依据卡：[判断推理·削弱题型]\n来源：薛睿论证推理'
    await speakReadyText(raw)
    const msgs = vi.mocked(chatOnce).mock.calls[0][1]
    expect(msgs[1].content).toContain('先把结论和论据翻译出来')
    expect(msgs[1].content).not.toContain('依据卡')
    expect(msgs[1].content).not.toContain('薛睿论证推理')
  })

  it('解析/理论卡使用老师口头讲题提示', async () => {
    const raw = '解析：真假话问题先找矛盾，再看其余两句的真假。'
    await speakReadyText(raw)
    const msgs = vi.mocked(chatOnce).mock.calls[0][1]
    expect(msgs[1].content).toContain('这是理论卡或解析')
  })

  it('动画微课使用教案式讲课稿提示，并要求紧扣当前知识点', async () => {
    const raw = '知识点：真假话。本幕标题：先找矛盾关系。画面讲解：两句话必有一真一假。'
    await speakReadyText(raw, { kind: 'lesson' })
    const msgs = vi.mocked(chatOnce).mock.calls[0][1]
    expect(msgs[1].content).toContain('教案式口播稿')
    expect(msgs[1].content).toContain('必须紧扣当前知识点')
  })

  it('普通答疑回复保留有用讲解但不机械念稿', async () => {
    const raw =
      '很多同学容易把充分条件和必要条件弄反，其实突破口是先看箭头的方向，再看谁推谁。这道题里如果前件推出后件，那么逆否命题才是等价关系，很多同学就是在这里被绕进去的。如果分不清，就先把箭头画出来，再一步步推导，检查自己有没有把方向看反。'
    await speakReadyText(raw)
    const msgs = vi.mocked(chatOnce).mock.calls[0][1]
    expect(msgs[1].content).toContain('这是 AI 答疑回复')
  })

  it('LLM 失败时退回原文，不阻塞朗读', async () => {
    vi.mocked(chatOnce).mockRejectedValue(new Error('timeout'))
    const raw = '这是一段超过九十字的解析文本。'.repeat(8)
    await expect(speakReadyText(raw)).resolves.toBe(raw)
  })

  it('speechScriptKind 能从文本识别题干与解析', () => {
    expect(speechScriptKind('A、甲 B、乙 C、丙', '')).toBe('quiz')
    expect(speechScriptKind('解析：先看首尾句', '')).toBe('explain')
    expect(speechScriptKind('随便聊聊今天的复习计划', '')).toBe('chat')
    expect(speechScriptKind('题干', 'wrong')).toBe('quiz')
    expect(speechScriptKind('知识点', 'kb')).toBe('explain')
    expect(speechScriptKind('知识点', 'lesson')).toBe('lesson')
  })
})
