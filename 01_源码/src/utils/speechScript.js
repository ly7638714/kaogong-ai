// speechScript.js —— 「语音阅读·讲稿改写」工具（v3.8.225）
// 用途：朗读/听题前，用用户独立配置的「语音阅读 LLM」(store.cfg.rd) 把原文
//（题干/解析/错题/理论卡/长消息）改写成口语化、适合听的「讲稿」再交给 TTS 朗读。
// 设计：
//  - 默认关（cfg.rd.on=false）→ rdCfg() 返回 null → 行为与以前完全一致（直接朗读原文）
//  - 开启但 Key/URL/模型缺失 → 退回原文；LLM 调用失败/超时 → 退回原文（绝不影响朗读可用性）
//  - 内容很短且已经像一句可读的短句 → 直接返回原文，省一次 LLM 调用
//  - 复用 chatOnce（OpenAI 兼容协议 + 成本记录 + 自动重试），非流式、小预算、短超时
import { store } from '../store'
import { chatOnce } from '../api/client'
import { cleanSpeechText } from './tts/clean'

// 当前是否启用并可用
export function rdCfg() {
  const c = (store.cfg && store.cfg.rd) || {}
  if (!c.on) return null
  if (!c.url || !c.model || !c.key) return null
  return c
}

// v3.8.225：从「念稿主播」升级为「真人课堂口播」。智谱 GLM-TTS 的情绪/语调由
// 文本语境驱动，因此这里重点约束短句、语气起伏、句型和停顿，而不靠外部不可用参数硬改语速。
const SCRIPT_SYS =
  '你是资深公考行测老师，正在用自然说话给考生“听题讲解”。请把原文改写成一段可直接交给语音合成朗读的口语讲稿。' +
  '第一铁律·绝不增写：只做“书面语→口语”的等价改写，不得增加原文没有的任何词句——不要问候、不要自我介绍、不要鼓励语、不要过渡语、不要口头禅、不要总结语、不要复述原文，也不要补充背景、例子或原文没说的结论。原文没说的，一个字都不能加。' +
  '第二铁律·字数只减不增：改写后的总字数必须不超过原文，能短则短。你只做三件事：把长句拆成短句、把符号念出来、删掉书面语的冗余词。' +
  '直接输出讲稿正文，不要解释自己的改写过程，不要输出 Markdown、编号标题、代码、表格、URL 或任何“以下是讲稿”式的说明。' +
  '听感硬要求：' +
  '一、短句为主：百分之八十的句子控制在八到二十二字，最多不超过二十八字；复杂长句必须拆成两三个口语短句。' +
  '二、句末必须用句号、问号或省略号；需要换气、强调前停顿的地方用逗号；绝不允许两句挤成一整行无标点。' +
  '三、语气和节奏要像真人上课：句子长短交错，不能每句都是同等长度；把最重要的结论或最容易错的地方放在最后或单独短句里，但不额外添加提示语。' +
  '四、口语词只允许用来替换原文里的书面表达，不得新增语气填充（如“那么”“好的”“来”），也不得卖萌。' +
  '五、内容不变形：题干里的年份、数字、单位、字母、专有名词、逻辑关系和选项原文必须保留；解析、知识点允许换说法，但考点、结论和易错点不得丢失，也不得增编原文没有的结论。' +
  '六、把“/”“→”“%”“≤”等符号按口语读法写出来（如“百分之”“推出”“小于等于”），不要照抄符号。' +
  '七、相关性过滤：只保留直接回答用户问题的正文；复盘指引、知识卡/依据卡/命中卡、来源标注、学习建议、拓展延伸、系统说明等，只要用户没有明确问到，全部删除。'

const SPEECH_EXTRA_RULES = [
  { key: 'review', re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:📌|📊|🧭|💡|⚠️)?\s*(?:高效)?复盘(?:指引|总结|建议)/i, ask: /复盘|错因|复习|总结|二刷/ },
  { key: 'card', re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:📚|📖|🧠|🔖)?\s*(?:知识卡|依据卡|命中卡|参考卡|资料卡|方法卡|教材依据|卡片来源)/i, ask: /知识卡|考点|知识点|方法|依据|来源|出处/ },
  { key: 'source', re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:📊|📚|🔗)?\s*(?:组卷来源|材料来源|数据来源|资料来源|来源|出处)\s*[：:]/i, ask: /来源|出处|组卷|材料|数据/ },
  { key: 'help', re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:⚠️|💡|ℹ️)?\s*(?:系统提示|免责声明|温馨提示|使用说明|以上说明|学习建议|拓展延伸)/i, ask: /系统提示|免责声明|使用说明|学习建议|拓展/ }
]

// 自动朗读/讲稿生成前的相关性硬过滤：默认删掉回复尾部附加的复盘、卡片、来源和系统说明。
export function stripUnrelatedSpeech(text, question = '') {
  const raw = String(text || '')
  const q = String(question || '')
  let cut = raw.length
  for (const rule of SPEECH_EXTRA_RULES) {
    if (rule.ask.test(q)) continue
    const m = rule.re.exec(raw)
    if (m && m.index >= 0) cut = Math.min(cut, m.index)
  }
  return raw.slice(0, cut).trim()
}

// 改写上限（字符）：readCtx 一般已截到 ~1400 字，这里多留余量
const MAX_CHARS = 1800
// 已像一句完整可读短句时不再改写，既省一次 LLM 调用，也避免小题大做拖慢听题
const SHORT_AS_IS_MAX = 90

// 场景提示：让题干和解析不要被同一套“卖萌化”改写规则污染
function speechUserRule(kind) {
  if (kind === 'lesson') {
    return '这是动画微课中的一个教学场景。请写成老师面对学生现场讲授的教案式口播稿：先用一句话点明本场景要解决的知识点，再用大白话讲清“为什么这样做、具体怎么做、最容易错在哪里”，最后给一句能马上执行的动作提示。必须紧扣当前知识点和场景画面，不能泛泛介绍，不能加入场景中没有的新结论，也不要照读标题。'
  }
  if (kind === 'quiz') {
    return '这是题干/选项/判题内容。请像老师现场念题给考生听：关键条件和选项逐个读清，字母编号不能丢；信息太多时允许把修饰语拆成短句，但绝不能为了顺口改写数字、年份、单位或逻辑关系。'
  }
  if (kind === 'theory' || kind === 'explain') {
    return '这是理论卡或解析。请像老师口头讲题，不要机械念书面标题和“第一点、第二点”：先点破最核心的结论，再用短句讲清判断路径、适用范围和易错点。'
  }
  return '这是 AI 答疑回复。只保留与本题讲解直接相关的正文，把书面排比改成口语短句；不得添加问候、自我介绍、鼓励、过渡语、口头禅或总结语，不得复述原文，改写后字数不得超过原文。'
}

// 通过 readCtx.type / 文本特征判断朗读场景；拿不准时按通用答疑处理
export function speechScriptKind(raw, hint) {
  const t = String(hint || '')
  if (t === 'lesson') return 'lesson'
  if (/^(quiz|solid|redo|wrong|chat)/.test(t) && t !== 'chat') return 'quiz'
  if (/^(theory|explain|kb)/.test(t)) return 'explain'
  const s = String(raw || '')
  if (/[A-D]\s*[.、)）]|选项[:：]|正确答案[:：]|请你选择|以下哪[一项个]?/.test(s)) return 'quiz'
  if (/理论|知识卡|考点|方法|技巧|口诀|解析[:：]|错因|易错|陷阱/.test(s)) return 'explain'
  return 'chat'
}

// 把原文转成“可直接朗读的讲稿”；不可用/失败一律返回原文
export async function speakReadyText(raw, opts = {}) {
  // 先做一次统一正文清洗和符号/公式口语化，再交给讲稿模型；防止“依据卡”、来源标注、代码和公式原样混入朗读。
  const src = cleanSpeechText(stripUnrelatedSpeech(String(raw || '').trim(), opts.question || ''))
  if (!src) return src
  const c = rdCfg()
  if (!c) return src
  const kind = speechScriptKind(src, opts.kind)
  const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : MAX_CHARS
  // 很短的普通答疑短句直接读原文；题干/解析需要重排听感，仍走改写
  if (kind === 'chat' && src.length <= SHORT_AS_IS_MAX && /[。！？!?…]$/.test(src)) return src
  const snippet = src
    .replace(/[#*`>_|~\\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxChars)
  if (!snippet) return src
  // 输出上限跟着输入走：宁可不够写（下面会退回原文），也不给它超写的机会（超写=多花朗读钱、多花时间）
  const maxTokens = Math.min(900, Math.max(200, snippet.length + 40))
  try {
    const r = await chatOnce(
      c,
      [
        { role: 'system', content: SCRIPT_SYS },
        {
          role: 'user',
          content: '请把下面的内容改写成可直接朗读的口语讲稿。\n' + speechUserRule(kind) + (opts.question ? '\n用户原问题：' + String(opts.question).slice(0, 500) : '') + '\n只保留直接回答该问题的正文；与问题无关的复盘指引、知识卡、来源、学习建议、拓展和系统说明必须删除。\n原文：\n' + snippet
        }
      ],
      maxTokens, // 输出上限：随原文长度动态收紧，避免模型“加戏”扩写
      25000 // 超时 25s：超过就退回原文，不阻塞朗读
    )
    const out = String(r || '').trim()
    if (!out || out.length <= 4) return src
    // 护栏一：改写后不得比原文更长（否则等于加戏，抬高朗读字数/花费/时长）→ 直接读清洗后的原文
    const budget = src.length + Math.max(8, Math.round(src.length * 0.08))
    if (out.length > budget) return src
    // 护栏二：结尾必须是收束标点，否则视为被截断，退回原文，避免“念到一半”
    if (!/[。！？!?…；;]["'”’）)】」』]?$/.test(out)) return src
    return out
  } catch (e) {
    return src
  }
}
