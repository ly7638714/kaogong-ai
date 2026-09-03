// intentProbe —— 轻量意图/易混判别探测（P0-1；纯函数、可与 askAssist 互补）
import { detectBanKuai } from '../api/detect'
import { normalizePlate } from '../kb/cards-index'

// 问法方向：选是 / 选非
export function detectAskDir(text) {
  const t = String(text || '')
  if (/选非|错误的是|不能推出|不正确的是|不属于|不符合|没有提及|无法推出|下列.*错误/.test(t)) return '非'
  if (/选是|正确的是|能够推出|符合|属于|可以推出/.test(t)) return '是'
  return ''
}

// 子意图：出题/变式/对答案/错因/辨析/方法/讲解/其他
export function detectIntent(text) {
  const t = String(text || '')
  if (/出一?道|来一?道|出题|让我(做|选|答)|做(一|几)道|直接选|给我出|有选项/.test(t)) return 'quiz'
  if (/变式|再来一题|换一题|再出一题|类似的题/.test(t)) return 'variant'
  if (/选[A-D][a-d]?[，,]|我选|答案是|对吗|对不对|是不是选|判.*对错|对错/.test(t)) return 'verify'
  if (/为什么错|错在哪|错因|掉[坑进]|哪里错|为何错|分析.*错/.test(t)) return 'error'
  if (/和上一题|与上一题|两题|对比|比较|辨析|区别|差异|哪个更|选哪个|到底选/.test(t)) return 'compare'
  if (/怎么做这类|方法|思路|套路|技巧|口诀|规律|做题技巧|这类题怎么|看到什么想什么/.test(t)) return 'method'
  if (/讲解|解析一下|讲讲|解释|展开讲/.test(t)) return 'explain'
  return 'solve'
}

// 四维探测：板块(细分)+细分sub(尽力从题型词)/意图/问法方向/是否图片题
export function probe(text, opts = {}) {
  const t = String(text || '').trim()
  const plateRaw = opts.plate || detectBanKuai(t)
  const plate6 = normalizePlate(plateRaw) || ''
  const intent = opts.intent || detectIntent(t)
  const askDir = detectAskDir(t)
  // 细分题型：命中 437 卡 type 风格词的首个显式段（如“削弱型/中心理解/两期比重/逻辑填空”等）
  let sub = ''
  const m = t.match(/(削弱型|加强型|前提型|论证缺陷|真假话|翻译推理|分析推理|空间重构|截面图|三视图|立体拼合|逻辑填空|中心理解|细节判断|语句排序|语句衔接|意图判断|标题填入|态度理解|两期比重|基期|增长率|增长量|平均数|比重|隔年|年均|拉平|混合|利润率|浓度|工程|行程|概率|排列组合|容斥|牛吃草|数字推理|图形推理|定义判断|类比推理)/)
  if (m) sub = m[1]
  return { text: t, plateRaw, plate6, sub, intent, askDir, hasImg: !!(opts.hasImg) }
}

// 易混判别提示：返回给 sys 的“注意区分”提示行（按板块×文本触发）
export function confusableHints(plate6, text) {
  const t = String(text || '')
  const out = []
  if (plate6 === '资料分析') {
    if (/(增量|增加(了|多少|到)|增长(了|多少|多)[亿万吨元]?)/.test(t) && !/增速|增长率|增幅|百分之|%|百分点|同比|回落|收窄/.test(t)) out.push('注意区分“增长量(带单位数值)”与“增长率(%)”：问“增长多少亿/吨”→增量，用 现期×r/(1+r) 或百化分；问“增速/增长了百分之几”→增长率')
    else if (/(增速|增长率|增幅|同比增长|百分点|百分之|%|回落|收窄)/.test(t)) out.push('该问含“率/增速”口径：增长率 r=(现-基)/基，别用增量现期化公式误答成带单位数值')
    if (/占.*比重|比重|占比/.test(t)) out.push('“比重=部分÷整体”，比重升降看部分与整体增速差；勿与“平均数增速((r总-r份)/(1+r份))”混淆（分子分母方向相反）')
    if (/平均|人均|每[^个]/.test(t) && /增速|同比|增长/.test(t)) out.push('平均数题先定“每X”X是分母；平均数增长率=(总量增速-份数增速)/(1+份数增速)，分子分母勿颠倒')
    if (/比前年|隔年|间隔/.test(t)) out.push('隔年/间隔增长：r=r1+r2+r1×r2（先加后乘），勿漏交叉项')
  } else if (plate6 === '判断推理') {
    if (/削弱|最能质疑|反驳/.test(t)) out.push('削弱题=找“切断题干论证链”的选项（否论据/否论点/因果倒置/另有他因），别选加强或无关')
    if (/加强|支持|前提|假设/.test(t)) out.push('加强/前提题=补“论证缺口”（搭桥/排他因）；“前提”须选必要条件，勿选单纯加强项')
    if (/真假|矛盾/.test(t)) out.push('真假话题：先找矛盾关系(必一真一假)，再按“题干只一真/一假”反推其余真假')
  } else if (plate6 === '言语理解') {
    if (/主旨|主要|中心/.test(t) && !/意在|旨在|强调/.test(t)) out.push('“主要/主旨”题：直接概括重点句（转折/结论/对策后），勿引申')
    if (/意在|旨在|强调|意图/.test(t)) out.push('“意在/旨在”意图题：概括主旨后再推一步（对策/呼吁），勿停在字面')
    if (/正确|错误|相符|不符|提及/.test(t)) out.push('细节判断题：逐项回原文比对范围/时态/主体/程度词，勿凭常识')
    if (/填入|排序|衔接|接下来/.test(t)) out.push('语句表达题：先看位置功能(首中尾)，再按话题一致+指代/关联捆绑')
  } else if (plate6 === '数量关系') {
    if (/浓度/.test(t)) out.push('浓度题：先理清溶质/溶剂/溶液；混合用“总溶质/总溶液”，两液混合可用十字交叉(质量比=浓度差反比)')
    if (/利润|售价|成本|打折/.test(t)) out.push('利润题：利润率=利润÷成本(进价)，不是售价；打折在定价上打；“赚/亏x%”都相对成本')
    if (/工程|效率|完成/.test(t)) out.push('工程题：设总量为时间公倍数→效率=总量/时间→合作效率相加；交替施工按周期+余量')
    if (/行程|相遇|追及/.test(t)) out.push('行程题画线段：相遇用路程和=速度和时间、追及用路程差=速度差时间；环形同向差一圈')
  }
  return out
}
// ===== 任务形态识别（P-A）：题量估计 + 批答/单题/泛问/排序判定 =====
export function detectQuestionCount(text, opts = {}) {
  const s = String(text || '') + '\n' + String((opts && opts.imgRead) || '')
  let n = 0
  const qn = s.match(/第[0-9一二三四五六七八九十百]+[题问]/g)
  if (qn) n += qn.length
  const groups = (s.match(/(?:^|[\n\r])\s*[A-D][.、．:：]/g) || []).length
  if (groups >= 4) n = Math.max(n, Math.round(groups / 4))
  const lineNums = s.match(/(?:^|[\n\r])\s*(?:第)?(?:[1-9]|1[0-9]|20)[.、．]/g)
  if (lineNums) n = Math.max(n, lineNums.length)
  return n
}

export function taskShape(text, opts = {}) {
  const t = String(text || '').trim()
  const body = t + '\n' + String((opts && opts.imgRead) || '')
  const n = detectQuestionCount(t, { imgRead: (opts && opts.imgRead) || '' })
  const batchWords = /(几道|全部|这些题|这套|所有题|逐一|逐题|全做|一起|都做)/.test(t)
  const vague = /(怎么做|怎么解|怎么做这类|方法|套路|口诀|不明白|不会|帮我看看|求(解|助|讲解)|讲讲|不懂)/.test(t)
  const hasRef = /(这(一|道|题|个)|第[一二三四五六七八九十百\d]+题)/.test(t)
  const sortQ = /(排序|重新排列|语序正确)/.test(body)
  const kind = (n >= 2 || batchWords) ? 'batchN' : ((vague && !hasRef) ? 'genericHow' : 'deepOne')
  return { kind, n: n || (batchWords ? 4 : 1), sort: sortQ }
}