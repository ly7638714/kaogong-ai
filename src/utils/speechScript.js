// speechScript.js —— 「语音阅读·讲稿改写」工具（v3.8.88）
// 用途：朗读/听题前，用用户独立配置的「语音阅读 LLM」(store.cfg.rd) 把原文
//（题干/解析/错题/理论卡/长消息）改写成口语化、适合听的「讲稿」再交给 TTS 朗读。
// 设计：
//  - 默认关（cfg.rd.on=false）→ rdCfg() 返回 null → 行为与以前完全一致（直接朗读原文）
//  - 开启但 Key/URL/模型缺失 → 退回原文；LLM 调用失败/超时 → 退回原文（绝不影响朗读可用性）
//  - 复用 chatOnce（OpenAI 兼容协议 + 成本记录 + 自动重试），非流式、小预算、短超时
import { store } from '../store'
import { chatOnce } from '../api/client'

// 当前是否启用并可用
export function rdCfg() {
  const c = (store.cfg && store.cfg.rd) || {}
  if (!c.on) return null
  if (!c.url || !c.model || !c.key) return null
  return c
}

const SCRIPT_SYS =
  '你是公考行测「听题主播」。把给我的原文改写成适合直接朗读的口语化讲稿：' +
  '用自然口语（可在句首加“来，看这道题”这类过渡词，但别每句都套模板）；' +
  '把题干要点、选项、正确答案、关键数字、易错点讲清楚；' +
  '把“/”“→”“%”等符号读成中文（如“百分之”）；去掉 Markdown 符号、代码、表格、URL、emoji；' +
  '不增编内容、不加多余寒暄。'

// 改写上限（字符）：readCtx 一般已截到 ~1400 字，这里多留余量
const MAX_CHARS = 1800

// 把原文转成“可直接朗读的讲稿”；不可用/失败一律返回原文
export async function speakReadyText(raw, maxChars = MAX_CHARS) {
  const src = String(raw || '').trim()
  if (!src) return src
  const c = rdCfg()
  if (!c) return src
  const snippet = src.replace(/[#*`>_|~\\]/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, maxChars)
  if (!snippet) return src
  try {
    const r = await chatOnce(
      c,
      [
        { role: 'system', content: SCRIPT_SYS },
        { role: 'user', content: '请把下面内容改写成能直接朗读的口语讲稿（原样保留题目数字/选项与正确答案）：\n' + snippet }
      ],
      600, // 输出上限：讲稿控制在数百字内，控制成本与延迟
      25000 // 超时 25s：超过就退回原文，不阻塞朗读
    )
    const out = String(r || '').trim()
    return out && out.length > 4 ? out : src
  } catch (e) {
    return src
  }
}
