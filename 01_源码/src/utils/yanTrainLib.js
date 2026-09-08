// yanTrainLib.js —— 言语理解·片段阅读「文段结构四步拆解」本地训练引擎
// 四层能力：①主题词/关键词 → ②句子功能 → ③行文结构 → ④主旨意图
// 一篇文段只承载一组确定性题：同一领域反复练结构，不依赖 AI，也不出现“占位符/省略号”。
const KEYS = ['A', 'B', 'C', 'D']
function hseed(n) {
  let x = (n ^ (n >>> 16)) * 2654435761 >>> 0
  x = (x ^ (x >>> 13)) * 2246822519 >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x
}
function shuffle(a, seed) {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = hseed(seed + i * 7919) % (i + 1)
    const t = b[i]; b[i] = b[j]; b[j] = t
  }
  return b
}
function makeOpts(correct, dists, seed) {
  const pool = [correct]
  dists.forEach((d) => { const s = String(d == null ? '' : d).trim(); if (s && !pool.includes(s)) pool.push(s) })
  let n = 1
  while (pool.length < 4) { const s = correct + '·' + n++; if (!pool.includes(s)) pool.push(s) }
  const at = hseed(seed + 3) % 4
  const others = shuffle(pool.filter((x) => x !== correct), seed + 7).slice(0, 3)
  const arr = []
  for (let i = 0; i < 4; i++) arr.push(i === at ? correct : others.shift())
  return { options: KEYS.map((k, i) => ({ k, t: arr[i] })), answer: KEYS[arr.indexOf(correct)] }
}
export const YAN_STRUCTURES = [
  '总分结构：首句总起观点，后文分述支撑',
  '分总结构：前文现象/原因铺垫，尾句总结中心',
  '转折结构：转折词前是铺垫，转折后为重点',
  '问题—对策结构：先摆问题，后给对策，对策是重心',
  '因果结构：原因/现象在前，结论在后',
  '并列结构：多个方面无主次，主旨需全部兼顾',
  '递进结构：层层深入，重心在最后一层',
  '总分总结构：首尾呼应，中间展开论证'
]
export const YAN_ROLES = [
  '背景引入：交代对象或现象，为后文铺垫',
  '转折立论：先呈现旧认知/局限，再亮出真实观点',
  '原因分析：解释问题、现象或观点产生的原因',
  '对策措施：针对前文问题提出可执行做法',
  '例证支撑：用例子证明前文观点或补充细节',
  '结论总结：收束全文，重申/升华中心',
  '过渡衔接：承上启下，把前文引向新话题',
  '递进深化：在前文基础上强调更进一步的意思'
]
export const YAN_MODES = [
  { k: 'topic', t: '① 主题词/关键词', d: '高频词 + 核心对象，主题词必须能贯穿全文' },
  { k: 'sentence', t: '② 句子功能', d: '逐句判断这句话在结构里“干什么”' },
  { k: 'structure', t: '③ 行文结构', d: '总分/转折/问题对策等骨架，先抓骨架再做题' },
  { k: 'main', t: '④ 主旨意图', d: '主旨句同义替换 / 问题对策与作者倾向' }
]
export const YAN_DOMAINS = ['自动', '社会治理', '科技伦理', '数字经济', '文化保护', '生态环保', '教育健康', '经济民生', '城乡发展']
export const PASSAGES = [
  {
    id: 'p01', domain: '社会治理', title: '社区食堂的长久之计',
    theme: '社区食堂', keywords: ['社区食堂', '可持续', '多元共担'],
    structureLabel: '问题—对策结构：先摆问题，后给对策，对策是重心',
    sentences: [
      '近年来，一些社区食堂为高龄老人解决了日常“吃饭难”问题。',
      '然而，仅靠市场力量运营，社区食堂往往因客流有限、租金与人力成本偏高而难以为继。',
      '为此，多地探索“政府补一点、企业让一点、居民出一点”的多元共担模式。',
      '这种模式把公益属性与可持续运营结合起来，让服务不因单方亏损而中断。',
      '可见，社区食堂要长期办好，关键不在简单扩建，而在建立稳定、可循环的制度安排。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '转折立论：先呈现旧认知/局限，再亮出真实观点', '对策措施：针对前文问题提出可执行做法', '意义说明：解释对策带来的积极作用', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '社区食堂要长期办好，关键在建立政府、企业、居民多元共担的可持续机制。',
    intent: '作者意在说明社区食堂不应只靠市场单打独斗，而应通过制度设计兼顾公益与可持续。',
    signal: '然而/为此/可见'
  },
  {
    id: 'p02', domain: '科技伦理', title: '算法推荐的“把关”',
    theme: '算法责任', keywords: ['算法', '平台责任', '信息把关'],
    structureLabel: '问题—对策结构：先摆问题，后给对策，对策是重心',
    sentences: [
      '算法推荐已成为人们获取信息的重要入口。',
      '但部分平台为追逐流量，把低质、情绪化内容推给用户，使公共讨论空间被噪音挤占。',
      '这说明算法不是价值中立的工具，而是隐含平台选择的信息把关机制。',
      '因此，平台不能只强调技术便利，还应对推荐结果承担公共责任。',
      '健全算法伦理审查与结果可解释机制，是让技术更好服务社会的必要一步。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '转折立论：先呈现旧认知/局限，再亮出真实观点', '原因分析：解释问题、现象或观点产生的原因', '结论总结：收束全文，重申/升华中心', '递进深化：在前文基础上强调更进一步的意思'],
    mainIdea: '算法推荐内含平台选择，平台必须对推荐结果承担公共责任并健全伦理审查。',
    intent: '作者意在提醒平台不能把责任推给“技术中性”，而要主动治理算法推荐。',
    signal: '但/因此/不能只…还'
  },
  {
    id: 'p03', domain: '数字经济', title: '数字鸿沟的另一面',
    theme: '数字包容', keywords: ['数字鸿沟', '老年人', '数字包容'],
    structureLabel: '分总结构：前文现象/原因铺垫，尾句总结中心',
    sentences: [
      '扫码点餐、网上挂号、手机支付正在重塑日常生活。',
      '对不熟悉智能设备的老年人来说，这些便利也可能变成新的门槛。',
      '一些地方增设线下人工通道、保留现金窗口，就是为避免技术升级把人挡在服务之外。',
      '数字技术越深入，越不能忘记把“不会用”的少数人纳入设计起点。',
      '真正成熟的数字化，不是所有人都被迫用手机，而是所有人都能选择适合自己的方式。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '原因分析：解释问题、现象或观点产生的原因', '例证支撑：用例子证明前文观点或补充细节', '过渡衔接：承上启下，把前文引向新话题', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '数字化建设必须包含对老年等群体的服务选项，真正的成熟不是强制迁移而是人人可及。',
    intent: '作者意在强调数字包容应成为公共服务的底线，技术升级不能制造新的排斥。',
    signal: '一些地方…就是为避免/越…越'
  },
  {
    id: 'p04', domain: '文化保护', title: '让古籍走进日常',
    theme: '古籍活化', keywords: ['古籍', '数字化', '活化利用'],
    structureLabel: '总分总结构：首尾呼应，中间展开论证',
    sentences: [
      '古籍保护不只是把书“藏起来”，更要让文献价值重新进入公众视野。',
      '高清扫描和开放数据库解决了“看得到”的问题。',
      '在此基础上，编辑注释、制作短视频、开展研学，则解决“看得懂”和“用得上”的问题。',
      '活化利用不是降低学术门槛，而是给不同读者提供进入传统文化的入口。',
      '所以，数字化是手段，活化才是古籍保护更完整的目标。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '对策措施：针对前文问题提出可执行做法', '递进深化：在前文基础上强调更进一步的意思', '原因分析：解释问题、现象或观点产生的原因', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '古籍保护应走向活化利用，用数字化与公众传播让文献价值重新进入日常。',
    intent: '作者意在强调数字化只是手段，古籍的价值最终要靠活化利用来延续。',
    signal: '不只/更要/在此基础上/所以'
  },
  {
    id: 'p05', domain: '生态环保', title: '垃圾分类如何不反弹',
    theme: '垃圾分类', keywords: ['垃圾分类', '长效机制', '习惯养成'],
    structureLabel: '问题—对策结构：先摆问题，后给对策，对策是重心',
    sentences: [
      '垃圾分类推行初期，不少社区依靠志愿者值守取得了立竿见影的效果。',
      '可一旦撤走值守，分类准确率往往快速回落。',
      '这说明仅靠运动式动员无法形成稳定习惯。',
      '真正有效的方式，是把奖惩规则、回收设施与居民生活动线整合进日常制度。',
      '当分类不再需要刻意提醒，才说明环保习惯真正落了地。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '转折立论：先呈现旧认知/局限，再亮出真实观点', '原因分析：解释问题、现象或观点产生的原因', '对策措施：针对前文问题提出可执行做法', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '垃圾分类要避免反弹，必须把奖惩与设施嵌入日常制度，使分类成为稳定习惯。',
    intent: '作者意在指出运动式动员的局限，呼吁建立不依赖值守的长效机制。',
    signal: '可一旦/这说明/真正有效'
  },
  {
    id: 'p06', domain: '教育健康', title: '近视防控的公共责任',
    theme: '儿童近视防控', keywords: ['近视', '户外活动', '家校协同'],
    structureLabel: '因果结构：原因/现象在前，结论在后',
    sentences: [
      '中小学生近视率持续受到关注，电子产品使用增多是重要背景。',
      '研究表明，每天充足的户外活动能够有效降低近视发生风险。',
      '但户外活动不足往往与课业负担、家长观念和校园空间安排有关。',
      '因此，近视防控不能只归责于孩子自律，而需要学校、家庭和社会共同创造条件。',
      '把户外时间写进课程安排和家庭作息，才是更有力的公共健康措施。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '例证支撑：用例子证明前文观点或补充细节', '原因分析：解释问题、现象或观点产生的原因', '结论总结：收束全文，重申/升华中心', '递进深化：在前文基础上强调更进一步的意思'],
    mainIdea: '近视防控需要学校、家庭和社会共同为儿童创造户外活动条件，不能只靠孩子自律。',
    intent: '作者意在把近视防控从个人习惯问题提升为公共责任与制度安排。',
    signal: '研究表明/但/因此'
  },
  {
    id: 'p07', domain: '经济民生', title: '银发经济要“适老”而非“劫老”',
    theme: '银发经济', keywords: ['银发经济', '适老化', '消费权益'],
    structureLabel: '转折结构：转折词前是铺垫，转折后为重点',
    sentences: [
      '随着人口老龄化，面向老年人的产品和服务正成为新的经济增长点。',
      '一些企业围绕健康、旅游、理财开发了大量“银发产品”。',
      '然而，部分产品利用老年人信息不对称夸大功效，甚至诱导高额付费。',
      '银发经济要健康发展，不能只看到老年市场的规模，更要守住产品真实与消费公平。',
      '适老化不是把老年人当作容易被收割的对象，而是让技术和服务真正适配他们的需求。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '例证支撑：用例子证明前文观点或补充细节', '转折立论：先呈现旧认知/局限，再亮出真实观点', '对策措施：针对前文问题提出可执行做法', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '银发经济要健康发展，就须守住真实宣传与消费公平，真正适老而不是收割老人。',
    intent: '作者意在警示银发经济中的夸大与诱导问题，主张以适老化服务赢得信任。',
    signal: '然而/不能只/更要'
  },
  {
    id: 'p08', domain: '城乡发展', title: '城市更新不必处处求新',
    theme: '城市留白', keywords: ['城市更新', '留白', '公共空间'],
    structureLabel: '转折结构：转折词前是铺垫，转折后为重点',
    sentences: [
      '城市更新常被理解为拆旧建新、密度越高越好。',
      '近年来，一些城市把厂房、边角地改造成社区公园和市民活动空间，获得不少好评。',
      '这说明真正提升生活品质的，未必是更多高楼，而是合理的留白与公共空间。',
      '把寸土寸金的地段全部塞满建筑，反而会压缩人们交往与呼吸的余地。',
      '城市更新应算“宜居账”，给居民留下看得见、走得进的公共生活。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '例证支撑：用例子证明前文观点或补充细节', '转折立论：先呈现旧认知/局限，再亮出真实观点', '原因分析：解释问题、现象或观点产生的原因', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '城市更新应重视留白与公共空间，用宜居标准替代单纯的高密度开发。',
    intent: '作者意在纠正“更新=盖高楼”的惯性认识，主张为居民保留公共生活空间。',
    signal: '这说明/反而/应'
  },
  {
    id: 'p09', domain: '文化保护', title: '短视频里的传统技艺',
    theme: '传统技艺传播', keywords: ['传统技艺', '短视频', '年轻化'],
    structureLabel: '总分结构：首句总起观点，后文分述支撑',
    sentences: [
      '短视频正在成为传统技艺“被看见”的新窗口。',
      '匠人展示制作过程，能让人直观感受手艺的复杂与美感。',
      '年轻用户通过弹幕、转发参与讨论，又为技艺注入新的表达方式。',
      '当然，流量也会带来“只看热闹、不看门道”的浅层化风险。',
      '让传统技艺既被看见又不失真，需要在传播创意与专业传承之间找到平衡。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '原因分析：解释问题、现象或观点产生的原因', '递进深化：在前文基础上强调更进一步的意思', '转折立论：先呈现旧认知/局限，再亮出真实观点', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '短视频让传统技艺被更多人看见，但也需在传播创意与专业传承间保持平衡。',
    intent: '作者既肯定短视频的传播价值，也提醒防止传统技艺被浅表化消费。',
    signal: '当然/既…又不失真'
  },
  {
    id: 'p10', domain: '教育健康', title: '比“吃得饱”更重要的午餐',
    theme: '校园营养午餐', keywords: ['营养午餐', '食育', '健康饮食'],
    structureLabel: '问题—对策结构：先摆问题，后给对策，对策是重心',
    sentences: [
      '校园午餐关系学生健康，也影响课堂注意力和长期饮食习惯。',
      '许多学校已从“有没有餐”转向“餐够不够营养”。',
      '但仍有学生把油炸食品当主餐，说明单纯供餐并不等于完成了健康教育。',
      '把食材搭配、口味引导和食育课程结合起来，才能让学生真正学会选择食物。',
      '好的午餐制度，应当让孩子在吃得安全的同时，也建立起受益终身的健康味觉。'
    ],
    roles: ['背景引入：交代对象或现象，为后文铺垫', '原因分析：解释问题、现象或观点产生的原因', '转折立论：先呈现旧认知/局限，再亮出真实观点', '对策措施：针对前文问题提出可执行做法', '结论总结：收束全文，重申/升华中心'],
    mainIdea: '校园午餐不仅应保证营养供给，更要通过食育帮助学生建立健康饮食能力。',
    intent: '作者意在把校园午餐从“供餐”升级为“食育”，重视学生终身健康习惯。',
    signal: '但/并不等于/才能'
  }
]
export const THEME_POOL = PASSAGES.map((p) => p.theme)
function cleanList(list) {
  const out = []
  ;(list || []).forEach((x) => { const s = String(x == null ? '' : x).trim(); if (s && !out.includes(s)) out.push(s) })
  return out
}
function genericDists(passage, mode, seed, askKeyword = false) {
  const others = shuffle(PASSAGES.filter((p) => p.id !== passage.id), seed + 31)
  if (mode === 'topic') {
    return askKeyword ? others.map((p) => cleanList(p.keywords).join('、')).slice(0, 3) : others.map((p) => p.theme).slice(0, 3)
  }
  if (mode === 'structure') return shuffle(YAN_STRUCTURES.filter((x) => x !== passage.structureLabel), seed + 9).slice(0, 3)
  if (mode === 'sentence') {
    const used = cleanList(passage.roles)
    return shuffle(YAN_ROLES.filter((x) => !used.includes(x)), seed + 11).slice(0, 3)
  }
  const a = others[0] || passage
  const b = others[1] || passage
  return [
    '作者认为' + passage.theme + '无需长期关注，一次集中整治即可。',
    '文段只在客观介绍' + passage.theme + '的背景，不表达任何作者倾向。',
    '作者主张把' + a.theme + '与' + b.theme + '等同处理，没有必要区分差异。'
  ]
}
export function pickPassage(seed = Date.now() % 100000, domain = '自动') {
  const pool = domain && domain !== '自动' ? PASSAGES.filter((p) => p.domain === domain) : PASSAGES
  return pool[Math.max(0, hseed(seed) % pool.length)] || PASSAGES[0]
}
export function buildYanQ(passage, mode, seed = 1, sentenceIdx = -1) {
  const p = passage || PASSAGES[0]
  const modeInfo = YAN_MODES.find((m) => m.k === mode) || YAN_MODES[0]
  if (mode === 'topic') {
    const askKeyword = hseed(seed + 21) % 2 === 1
    const correct = askKeyword ? cleanList(p.keywords).join('、') : p.theme
    const opts = makeOpts(correct, genericDists(p, 'topic', seed, askKeyword), seed)
    return {
      mode, kind: askKeyword ? 'keyword' : 'theme', q: askKeyword ? '下列哪组最能概括这段文字的核心关键词？' : '这段文字的主题词/核心话题最可能是：',
      options: opts.options, answer: opts.answer, seed,
      explain: '主题词=**' + p.theme + '**；高频/关键概念=' + cleanList(p.keywords).join('、') + '。\n\n方法：先找“重复出现或贯穿全文的对象”，再看选项是否同时覆盖它。正确选项缺主题词必错，主题词被偷换也必错。',
      tip: '主题词是全文反复指向的对象，关键词是能触发定位的核心概念。',
      modeInfo, modeT: modeInfo.t
    }
  }
  if (mode === 'structure') {
    const opts = makeOpts(p.structureLabel, genericDists(p, 'structure', seed), seed)
    return {
      mode, kind: 'structure', q: '这段文字的整体行文结构最接近：', options: opts.options, answer: opts.answer, seed,
      explain: '答案：**' + p.structureLabel + '**。\n\n信号词：' + p.signal + '。\n\n拆解路径：' + p.sentences.map((s, i) => '第' + (i + 1) + '句=' + p.roles[i].split('：')[0]).join(' → ') + '。\n\n口诀：先定首尾关系，再找转折/对策/结论，骨架清晰后主旨自然出现。',
      tip: '结构决定重点句位置：转折看后、对策看做法、因果看结论、并列看总和。',
      modeInfo, modeT: modeInfo.t
    }
  }
  if (mode === 'sentence') {
    const idx = sentenceIdx >= 0 && sentenceIdx < p.sentences.length ? sentenceIdx : Math.max(0, hseed(seed + 43) % p.sentences.length)
    const correctRole = p.roles[idx]
    const opts = makeOpts(correctRole, genericDists(p, 'sentence', seed), seed)
    const s = p.sentences[idx]
    const short = s.length > 26 ? s.slice(0, 26) + '…' : s
    return {
      mode, kind: 'sentence', sentenceIdx: idx, q: '文段第' + (idx + 1) + '句“' + short + '”在文段中的作用最可能是：',
      options: opts.options, answer: opts.answer, seed,
      explain: '第' + (idx + 1) + '句（' + short + '）的作用是 **' + correctRole + '**。\n\n上下文拆解：' + p.sentences.map((ss, i) => '第' + (i + 1) + '句' + p.roles[i].split('：')[0]).join('；') + '。\n\n定位口诀：句首先问是否引入/总起；句中看是否被转折/因果/举例控制；句尾先想是否总结或对策。',
      tip: '判断句子作用不看单句美丑，看它和前后句构成了什么关系。',
      modeInfo, modeT: modeInfo.t, role: p.roles[idx]
    }
  }
  const askIntent = hseed(seed + 77) % 2 === 1
  const correct = askIntent ? p.intent : p.mainIdea
  const dists = genericDists(p, 'main', seed)
  if (askIntent) dists.unshift(p.mainIdea)
  const opts = makeOpts(correct, dists.slice(0, 3), seed)
  return {
    mode, kind: askIntent ? 'intent' : 'main', q: askIntent ? '这段文字意在说明（　）。' : '这段文字主要强调的是（　）。',
    options: opts.options, answer: opts.answer, seed,
    explain: (askIntent ? '作者意图' : '文段主旨') + '：**' + correct + '**。\n\n推理链：' + p.signal + ' → ' + p.structureLabel.split('：')[0] + ' → 重点句位置。\n\n主旨题的干扰项常错在“只概括背景、只提对策的局部、偷换主体、程度越界”，选项必须同时满足：主题词对、范围等、程度不过度。',
    tip: askIntent ? '意图题先找问题与对策，对策常承载作者意图。' : '主旨题=重点句同义替换，选项必须含主题词。',
    modeInfo, modeT: modeInfo.t
  }
}
export function verifyYanQ(q, p) {
  if (!q || !p || !q.options || q.options.length !== 4 || !q.answer) return false
  if (new Set(q.options.map((o) => o.t)).size !== 4) return false
  const ans = q.options.find((o) => o.k === q.answer)
  if (!ans || !q.explain) return false
  if (q.kind === 'theme' && String(ans.t) !== p.theme) return false
  if (q.kind === 'keyword' && String(ans.t) !== cleanList(p.keywords).join('、')) return false
  if (q.kind === 'structure' && String(ans.t) !== p.structureLabel) return false
  if (q.kind === 'sentence' && String(ans.t) !== p.roles[q.sentenceIdx]) return false
  if (q.kind === 'main' && String(ans.t) !== p.mainIdea) return false
  if (q.kind === 'intent' && String(ans.t) !== p.intent) return false
  return true
}
export const THEORY_MD = `**片段阅读 · 文段结构四步拆解法**

1. **定主题词**：全文反复出现的对象才是主题，举例里的配角不算；正确选项必须含主题词。
2. **分句功能**：句首常负责总起/背景；句中常被转折、因果、举例控制；句尾常总结、给对策或引向新话题。
3. **抓行文骨架**：总分/分总/转折/问题对策/因果/并列/递进/总分总，每种骨架都指向固定的重点位置。
4. **锁主旨意图**：中心理解找重点句同义替换；意图判断优先找问题背后的对策；细节题回文逐词比范围、程度、主体、逻辑。`
export default { PASSAGES, pickPassage, buildYanQ, verifyYanQ, YAN_MODES, YAN_DOMAINS, THEORY_MD }
