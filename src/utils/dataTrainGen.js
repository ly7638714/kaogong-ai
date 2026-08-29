// utils/dataTrainGen.js —— 资料分析「四层能力」训练本地生成器（零 API、确定性种子）
// 对应 LY《资料分析一本通》四层能力：
//   ①统计阅读·判题型  ②数据定位·找数据  ③公式选择·应激  ④计算执行·速算
// 四种模式统一产出：{ mode, q, options:[{k,t}], answer, explain, tip, extra }
// 唯一正确项由「构造 + 校验」双重保证，不合格换种子重试（≤8 次）
import { normalizeSvg } from './svgFix'

// ================= 确定性工具 =================
function hashIdx(n, len) {
  let x = (n ^ (n >>> 16)) * 2654435761 >>> 0
  x = (x ^ (x >>> 13)) * 2246822519 >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x % len
}
const pick = (arr, seed, off = 0) => arr[hashIdx(seed + off * 1013, arr.length)]
function shuffle(a, seed) {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = hashIdx(seed + i * 7919, i + 1)
    const t = b[i]; b[i] = b[j]; b[j] = t
  }
  return b
}
const r10 = (n) => Math.round(n / 10) * 10
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d })
const fmtV = (v) => (v < 100 ? Number(v).toFixed(1) : fmt(v))
// 宽范围确定性随机取数：同一种子永远得到同一个值；跨种子组合空间指数级扩大（不依赖固定小池子）
function rndVal(seed, off, min = 3000, max = 120000) {
  const span = max - min + 1
  let x = min + hashIdx(seed + off * 1013, span)
  if (x > 20000) x = Math.round(x / 100) * 100
  else if (x > 5000) x = Math.round(x / 10) * 10
  else if (x > 1000) x = Math.round(x / 5) * 5
  return Math.max(min, x)
}
function rndRate(seed, off, min = 0.5, max = 28) {
  const span = Math.round((max - min) * 10) + 1
  const x = min + hashIdx(seed + off * 131, span) / 10
  return Math.round(x * 10) / 10
}

// ================= 通用素材池 =================
const INDS = ['粮食产量', '社会消费品零售总额', '进出口总额', '某省生产总值', '固定资产投资', '新能源汽车销量', '铁路货运量', '城镇常住居民人均可支配收入', '规模以上工业增加值', '货物周转量', '邮政业务总量', '快递业务量', '生猪存栏量', '水产品产量', '发电量', '原油加工量', '钢材产量', '汽车产量', '房地产开发投资', '基础设施建设投资', '农林牧渔业总产值', '旅游总收入', '软件业务收入', '互联网业务收入', '港口货物吞吐量', '民航旅客运输量', '移动电话用户数', '5G基站数', '新能源汽车保有量', '社会物流总额', '粮食播种面积', '棉花产量', '糖料产量', '水果产量', '肉类总产量', '禽蛋产量', '牛奶产量', '城镇新增就业人数', '保险公司保费收入', '一般公共预算收入']
// 指标 → 自然单位（避免「收入…万头」这类不合理搭配）
const IND_UNIT = {
  粮食产量: '万吨', 社会消费品零售总额: '亿元', 进出口总额: '亿元', 某省生产总值: '亿元',
  固定资产投资: '亿元', 新能源汽车销量: '万辆', 铁路货运量: '亿吨', 城镇常住居民人均可支配收入: '元',
  规模以上工业增加值: '亿元', 货物周转量: '亿吨公里', 邮政业务总量: '亿元', 快递业务量: '亿件',
  生猪存栏量: '万头', 水产品产量: '万吨', 发电量: '亿千瓦时', 原油加工量: '万吨',
  钢材产量: '万吨', 汽车产量: '万辆', 房地产开发投资: '亿元', 基础设施建设投资: '亿元',
  农林牧渔业总产值: '亿元', 旅游总收入: '亿元', 软件业务收入: '亿元', 互联网业务收入: '亿元',
  港口货物吞吐量: '亿吨', 民航旅客运输量: '万人次', 移动电话用户数: '万户', '5G基站数': '万个',
  新能源汽车保有量: '万辆', 社会物流总额: '万亿元', 粮食播种面积: '万公顷', 棉花产量: '万吨',
  糖料产量: '万吨', 水果产量: '万吨', 肉类总产量: '万吨', 禽蛋产量: '万吨', 牛奶产量: '万吨',
  城镇新增就业人数: '万人', 保险公司保费收入: '亿元', 一般公共预算收入: '亿元'
}
const indUnit = (ind) => IND_UNIT[ind] || '亿元'
// 部分与整体的配套（保证部分 < 整体，比重有意义）
const PART_WHOLE = [
  ['夏粮产量', '粮食产量', 1497.7, 6694.9, '万吨'],
  ['猪肉产量', '肉类总产量', 5610, 9200, '万吨'],
  ['高技术制造业增加值', '规模以上工业增加值', 2380, 12100, '亿元'],
  ['网上零售额', '社会消费品零售总额', 18800, 43120, '亿元'],
  ['出口额', '进出口总额', 28900, 61600, '亿元']
]
const FRAC = { 9.1: 11, 11.1: 9, 12.5: 8, 14.3: 7, 16.7: 6, 20: 5, 25: 4, 33.3: 3 }
const FRAC_CHOICES = [
  { r: 12.5, n: 8 }, { r: 11.1, n: 9 }, { r: 14.3, n: 7 }, { r: 16.7, n: 6 },
  { r: 20, n: 5 }, { r: 25, n: 4 }, { r: 9.1, n: 11 }, { r: 33.3, n: 3 }, { r: 8.3, n: 12 },
  { r: 10, n: 10 }, { r: 7.7, n: 13 }, { r: 7.1, n: 14 }, { r: 6.7, n: 15 }, { r: 6.25, n: 16 },
  { r: 5.9, n: 17 }, { r: 5.6, n: 18 }, { r: 5, n: 20 }, { r: 4, n: 25 }, { r: 3, n: 33 }
]

// ================= 选项构造（唯一正确项） =================
function buildOpts(correctList, distList, seed) {
  const pool = shuffle([...correctList, ...distList], seed)
  const letters = ['A', 'B', 'C', 'D']
  const options = pool.map((t, i) => ({ k: letters[i], t }))
  const ans = letters[pool.findIndex((v) => String(v) === String(correctList[0]))]
  return { options, answer: ans }
}
function verifyUnique(q) {
  if (!q || !q.options || q.options.length !== 4) return false
  const ts = q.options.map((o) => String(o.t))
  if (new Set(ts).size !== 4) return false
  return !!q.options.find((o) => o.k === q.answer)
}
// ================= ① 判题型（统计阅读） =================
const TYPE_BANK = {
  base: {
    name: '基期量', formula: '基期量 = 现期量 ÷ (1 + 增长率)', ask: ['上年', '基期', '增长前'],
    tip: '口诀：看到「上年/基期/增长前」→ 求基期，现期÷(1+r)；|r|≤5% 可用化除为乘。',
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), B = rndVal(seed, 2), r = rndRate(seed, 3)
      return '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + r + '%，则2023年该' + ind + '为多少' + unit + '？'
    }
  },
  now: {
    name: '现期量', formula: '现期量 = 基期量 × (1 + 增长率)', ask: ['按此增速', '预计今年', '增长到'],
    tip: '口诀：看到「今年/增长到/按增速测算」→ 求现期，基期×(1+r)。',
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), A = rndVal(seed, 2), r = rndRate(seed, 3)
      return '2023年' + ind + '为' + fmt(A) + unit + '，按同比增长' + r + '%测算，则2024年该' + ind + '约为多少' + unit + '？'
    }
  },
  inc: {
    name: '增长量', formula: '增长量 = 现期量 × 增长率 ÷ (1 + 增长率)', ask: ['增加多少', '比上年增加', '减少多少'],
    tip: '口诀：看到「增加/减少了多少」→ 求增量，Δ=B×r÷(1+r)；r≈1/n 用份数 Δ≈B/(n+1)。',
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), B = rndVal(seed, 2), r = rndRate(seed, 3)
      return '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + r + '%，则2024年该' + ind + '比上年增加多少' + unit + '？'
    }
  },
  rate: {
    name: '增长率', formula: '增长率 = (现期量 − 基期量) ÷ 基期量', ask: ['增长百分之几', '同比增速', '下降百分之几'],
    tip: '口诀：看到「增长/下降百分之几」→ 求增速，r=(现−基)÷基。',
    mk(seed) {
      const ind = pick(INDS, seed), A = rndVal(seed, 2, 3000, 30000), r = rndRate(seed, 3)
      const B = Math.round((A * (1 + r / 100)) / 10) * 10
      const unit = indUnit(ind)
      return '2023年' + ind + '为' + fmt(A) + unit + '，2024年为' + fmt(B) + unit + '，则2024年该' + ind + '同比增长约百分之几？'
    }
  },
  inter: {
    name: '间隔增长率', formula: '间隔增长率 R = r1 + r2 + r1 × r2', ask: ['比两年前', '隔一年', '连续两年'],
    tip: '口诀：看到「比两年前/隔一年」→ 间隔增长率，R=r1+r2+r1×r2，别漏交叉项。',
    mk(seed) {
      const ind = pick(INDS, seed)
      const r1 = rndRate(seed, 2, 3, 12), r2 = rndRate(seed, 3, 1, 8)
      return '2022年' + ind + '同比增长' + r1 + '%，2023年同比增长' + r2 + '%，则2024年该' + ind + '比2022年约增长百分之几？'
    }
  },
  annual: {
    name: '年均增长率', formula: '年均增长率 r̅ = (B/A)^(1/n) − 1', ask: ['年均增长', '年均增速', '平均每年增长'],
    tip: '口诀：看到「年均增长/年均增速」→ n年差n−1；翻倍用70法则（n×r≈70）。',
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const A = rndVal(seed, 2, 2000, 30000), g = pick([8, 10, 12, 15, 18], seed, 3)
      const B = Math.round(A * Math.pow(1 + g / 100, 4))
      return '2020年' + ind + '为' + fmt(A) + unit + '，2024年' + ind + '为' + fmt(B) + unit + '，则2020—2024年该' + ind + '年均增速约为百分之几？'
    }
  },
  share: {
    name: '现期比重', formula: '现期比重 = 部分量 ÷ 整体量', ask: ['占的比重', '占比', '占…'],
    tip: '口诀：看到「占…的比重/占比」→ 现期比重 A/B，先锁定部分与整体。',
    mk(seed) {
      const pw = pick(PART_WHOLE, seed, 1), part = pw[0], whole = pw[1], A = pw[2], B = pw[3]
      const unit = pw[4]
      return '2024年' + whole + '为' + fmt(B, 1) + unit + '，其中' + part + '为' + fmt(A, 1) + unit + '，则' + part + '占' + whole + '的比重约为多少？'
    }
  },
  bshare: {
    name: '基期比重', formula: '基期比重 = A/B × (1+b)/(1+a)', ask: ['上年比重', '2023年比重', '基期比重'],
    tip: '口诀：看到「上年/基期比重」→ A/B 再乘 (1+b)/(1+a)。',
    mk(seed) {
      const pw = pick(PART_WHOLE, seed, 1), part = pw[0], whole = pw[1], A = pw[2], B = pw[3]
      const a = rndRate(seed, 4), b = rndRate(seed, 5)
      const unit = pw[4]
      return '2024年' + whole + '为' + fmt(B, 1) + unit + '，同比增长' + b + '%；其中' + part + '为' + fmt(A, 1) + unit + '，同比增长' + a + '%。则2023年' + part + '占' + whole + '的比重约为多少？'
    }
  },
  shareDiff: {
    name: '两期比重差', formula: '两期比重差 = A/B × (a−b)/(1+a)', ask: ['比重比上年', '比重上升/下降', '几个百分点'],
    tip: '口诀：看到「比重比上年上升/下降几个百分点」→ 两期比重差；先看 a 与 b 大小定升降。',
    mk(seed) {
      const pw = pick(PART_WHOLE, seed, 1), part = pw[0], whole = pw[1], A = pw[2], B = pw[3]
      let a = rndRate(seed, 4), b = rndRate(seed, 5)
      if (a === b) a += 1.0
      const unit = pw[4]
      return '2024年' + whole + '为' + fmt(B, 1) + unit + '，同比增长' + b + '%；其中' + part + '为' + fmt(A, 1) + unit + '，同比增长' + a + '%。则2024年' + part + '占' + whole + '的比重比上年约上升/下降多少个百分点？'
    }
  },
  avg: {
    name: '平均数', formula: '平均数 = 总量 ÷ 个数', ask: ['平均每', '人均', '户均'],
    tip: '口诀：看到「平均每/人均/户均」→ 平均数 = 总量÷个数。',
    mk(seed) {
      const ind = pick(INDS, seed, 1)
      const total = rndVal(seed, 2, 8000, 60000), n = rndVal(seed, 3, 2000, 9000)
      const unit = indUnit(ind)
      return '2024年某省' + ind + '为' + fmt(total) + unit + '，该省常住人口' + n + '万人，则人均' + ind + '约为多少' + unit + '？'
    }
  },
  avgRate: {
    name: '平均数增长率', formula: '平均数增长率 = (a − b) ÷ (1 + b)', ask: ['平均每…增长', '人均…增长', '平均…增速'],
    tip: '口诀：看到「平均每…同比增长%」→ 平均数增长率，a 是总量增速、b 是个数增速。',
    mk(seed) {
      const ind = pick(INDS, seed, 1)
      let a = rndRate(seed, 2), b = rndRate(seed, 3)
      if (a === b) a += 1.0
      return '2024年某省' + ind + '同比增长' + a + '%，同时该省常住人口同比增长' + b + '%，则人均' + ind + '同比增长约百分之几？'
    }
  },
  mult: {
    name: '倍数', formula: '倍数 = A ÷ B', ask: ['是…的几倍', '多几倍', '倍数'],
    tip: '口诀：看到「是…的几倍」→ A/B；「多几倍/超出几倍」→ (A−B)/B。',
    mk(seed) {
      const p = pick([['出口额', '进口额', 2.95], ['网上零售额', '线下零售额', 1.53], ['新能源汽车产量', '传统汽车产量', 2.38], ['铁路货运量', '公路货运量', 4.85]], seed, 1)
      const unit = pick(['亿元', '万吨', '万辆', '亿件'], seed, 2)
      const A = rndVal(seed, 3, 10000, 80000)
      const B = Math.max(1000, Math.round(A / p[2] / 10) * 10)
      return '2024年某省' + p[0] + '为' + fmt(A) + unit + '，' + p[1] + '为' + fmt(B) + unit + '，则' + p[0] + '约是' + p[1] + '的多少倍？'
    }
  },
  mix: {
    name: '混合增长率', formula: '混合增长率介于部分增速之间，偏向基期量大的', ask: ['进出口总额增速', '总体增速', '合计增速'],
    tip: '口诀：看到「总体/合计增速」→ 混合居中，偏向基期量大的一方；口诀「居中但不居中」。',
    mk(seed) {
      const r1 = rndRate(seed, 2, 4, 20), r2 = rndRate(seed, 3, -8, 12)
      const v1 = rndVal(seed, 4, 5000, 80000), v2 = rndVal(seed, 5, 3000, 60000)
      const unit = '亿元'
      return '2024年某省出口额' + fmt(v1) + unit + '，同比增长' + r1 + '%；进口额' + fmt(v2) + unit + '，同比增长' + r2 + '%。则2024年该省进出口总额同比增速约为百分之几？'
    }
  },
  comp: {
    name: '综合分析', formula: '逐项验证：排绝对 → 找矛盾 → 验简单 → 攻坚', ask: ['以下说法正确的是', '以下说法错误的是', '能够推出的是'],
    tip: '口诀：看到「以下说法正确/错误的是」→ 综合分析；先排绝对化、找矛盾选项，从C/D开始验简单项。',
    mk(seed) {
      const ind = pick(INDS, seed)
      const tpl = hashIdx(seed + 7, 4)
      if (tpl === 0) return '【材料】2024年某省' + ind + '及相关指标运行情况……\n【提问】关于该省2024年' + ind + '情况，以下说法正确的是（　）'
      if (tpl === 1) return '【材料】2024年某省' + ind + '及相关指标运行情况……\n【提问】关于该省2024年' + ind + '情况，以下说法错误的是（　）'
      if (tpl === 2) return '【材料】2024年某省' + ind + '及相关指标运行情况……\n【提问】下列判断能够由材料推出的是（　）'
      return '【材料】2024年某省' + ind + '及相关指标运行情况……\n【提问】关于该省2024年' + ind + '情况，能够推出的是（　）'
    }
  }
}
const TYPE_DIST = {
  base: ['增长量', '现期量', '增长率'],
  now: ['基期量', '增长量', '增长率'],
  inc: ['增长率', '基期量', '现期量'],
  rate: ['增长量', '基期量', '间隔增长率'],
  inter: ['年均增长率', '增长率', '增长量'],
  annual: ['间隔增长率', '增长率', '现期量'],
  share: ['平均数', '倍数', '基期比重'],
  bshare: ['现期比重', '两期比重差', '平均数'],
  shareDiff: ['基期比重', '现期比重', '平均数增长率'],
  avg: ['现期比重', '倍数', '平均数增长率'],
  avgRate: ['平均数', '增长率', '两期比重差'],
  mult: ['现期比重', '平均数', '增长率'],
  mix: ['增长率', '间隔增长率', '现期比重'],
  comp: ['增长率', '基期量', '增长量']
}

function buildType(seed) {
  const keys = Object.keys(TYPE_BANK)
  const k = keys[hashIdx(seed, keys.length)]
  const t = TYPE_BANK[k]
  const stem = t.mk(seed)
  const opts = buildOpts([t.name], TYPE_DIST[k], seed)
  const explain = '【题型判定】提问关键词「' + t.ask.join(' / ') + '」→ 该题考 **' + t.name + '**。\n\n公式：' + t.formula + '\n\n口诀：' + t.tip
  return { mode: 'type', q: stem, options: opts.options, answer: opts.answer, explain, tip: t.tip, extra: { name: t.name, formula: t.formula } }
}
// ================= ② 找数据定位（数据定位） =================
const THEMES = [
  [
    { seg: 1, theme: '农业生产形势良好', main: { ind: '粮食产量', unit: '万吨' }, sub: { ind: '夏粮产量' }, vMin: 6000, vMax: 7500, rMin: 0.5, rMax: 2, subRatio: 0.22, srMin: 0.5, srMax: 3 },
    { seg: 2, theme: '工业经济平稳运行', main: { ind: '规模以上工业增加值', unit: '亿元' }, sub: { ind: '高技术制造业增加值' }, vMin: 8000, vMax: 25000, rMin: 4, rMax: 8, subRatio: 0.18, srMin: 6, srMax: 12 },
    { seg: 3, theme: '消费市场持续恢复', main: { ind: '社会消费品零售总额', unit: '亿元' }, sub: { ind: '网上零售额' }, vMin: 30000, vMax: 60000, rMin: 5, rMax: 10, subRatio: 0.42, srMin: 8, srMax: 15 }
  ],
  [
    { seg: 1, theme: '外贸进出口稳步增长', main: { ind: '进出口总额', unit: '亿元' }, sub: { ind: '出口额' }, vMin: 40000, vMax: 80000, rMin: 6, rMax: 12, subRatio: 0.55, srMin: 8, srMax: 15 },
    { seg: 2, theme: '固定资产投资结构优化', main: { ind: '固定资产投资', unit: '亿元' }, sub: { ind: '基础设施投资' }, vMin: 60000, vMax: 120000, rMin: 3, rMax: 7, subRatio: 0.4, srMin: 5, srMax: 9 },
    { seg: 3, theme: '居民收入稳步提升', main: { ind: '居民人均可支配收入', unit: '元' }, sub: { ind: '城镇居民人均可支配收入' }, vMin: 30000, vMax: 50000, rMin: 4, rMax: 7, subRatio: 1.2, srMin: 3, srMax: 7 }
  ],
  [
    { seg: 1, theme: '能源保供成效显著', main: { ind: '一次能源生产总量', unit: '亿吨标准煤' }, sub: { ind: '原煤产量' }, vMin: 45, vMax: 55, rMin: 2, rMax: 5, subRatio: 0.98, srMin: 2, srMax: 5 },
    { seg: 2, theme: '交通运输高效运行', main: { ind: '货物周转量', unit: '亿吨公里' }, sub: { ind: '铁路货物周转量' }, vMin: 15000, vMax: 25000, rMin: 5, rMax: 9, subRatio: 0.5, srMin: 6, srMax: 10 },
    { seg: 3, theme: '邮政快递快速增长', main: { ind: '邮政业务总量', unit: '亿元' }, sub: { ind: '快递业务收入' }, vMin: 10000, vMax: 20000, rMin: 15, rMax: 22, subRatio: 0.5, srMin: 15, srMax: 22 }
  ],
  [
    { seg: 1, theme: '财政收支运行平稳', main: { ind: '一般公共预算收入', unit: '亿元' }, sub: { ind: '税收收入' }, vMin: 50000, vMax: 90000, rMin: 4, rMax: 9, subRatio: 0.8, srMin: 4, srMax: 9 },
    { seg: 2, theme: '金融信贷合理增长', main: { ind: '社会融资规模增量', unit: '亿元' }, sub: { ind: '人民币贷款增加额' }, vMin: 30000, vMax: 45000, rMin: 8, rMax: 14, subRatio: 0.6, srMin: 8, srMax: 14 },
    { seg: 3, theme: '保险业务较快增长', main: { ind: '保险公司保费收入', unit: '亿元' }, sub: { ind: '财产险保费收入' }, vMin: 40000, vMax: 60000, rMin: 6, rMax: 12, subRatio: 0.3, srMin: 5, srMax: 10 }
  ],
  [
    { seg: 1, theme: '电力供应保障有力', main: { ind: '全社会用电量', unit: '亿千瓦时' }, sub: { ind: '工业用电量' }, vMin: 70000, vMax: 90000, rMin: 4, rMax: 8, subRatio: 0.65, srMin: 4, srMax: 8 },
    { seg: 2, theme: '天然气消费持续增加', main: { ind: '天然气消费量', unit: '亿立方米' }, sub: { ind: '城市燃气消费量' }, vMin: 3500, vMax: 4500, rMin: 6, rMax: 10, subRatio: 0.5, srMin: 6, srMax: 10 },
    { seg: 3, theme: '港口生产保持平稳', main: { ind: '港口货物吞吐量', unit: '亿吨' }, sub: { ind: '外贸货物吞吐量' }, vMin: 150, vMax: 200, rMin: 3, rMax: 6, subRatio: 0.35, srMin: 3, srMax: 6 }
  ],
  [
    { seg: 1, theme: '林业生态建设推进', main: { ind: '完成造林面积', unit: '万公顷' }, sub: { ind: '人工造林面积' }, vMin: 300, vMax: 700, rMin: 2, rMax: 6, subRatio: 0.6, srMin: 2, srMax: 6 },
    { seg: 2, theme: '水产养殖稳步发展', main: { ind: '水产品总产量', unit: '万吨' }, sub: { ind: '养殖产量' }, vMin: 6000, vMax: 8000, rMin: 2, rMax: 5, subRatio: 0.75, srMin: 2, srMax: 5 },
    { seg: 3, theme: '畜牧生产总体稳定', main: { ind: '肉类总产量', unit: '万吨' }, sub: { ind: '猪肉产量' }, vMin: 8000, vMax: 10000, rMin: 2, rMax: 5, subRatio: 0.55, srMin: 3, srMax: 7 }
  ],
  [
    { seg: 1, theme: '海关特殊监管区域进出口快速增长', main: { ind: '保税物流进出口额', unit: '亿元' }, sub: { ind: '海关特殊监管区域进出口额' }, vMin: 20000, vMax: 40000, rMin: 10, rMax: 18, subRatio: 0.6, srMin: 8, srMax: 15 },
    { seg: 2, theme: '一般贸易进出口占比提升', main: { ind: '一般贸易进出口额', unit: '亿元' }, sub: { ind: '加工贸易进出口额' }, vMin: 150000, vMax: 220000, rMin: 6, rMax: 11, subRatio: 0.5, srMin: -4, srMax: 3 },
    { seg: 3, theme: '机电产品出口结构优化', main: { ind: '机电产品出口额', unit: '亿元' }, sub: { ind: '高新技术产品出口额' }, vMin: 90000, vMax: 130000, rMin: 8, rMax: 14, subRatio: 0.55, srMin: 8, srMax: 14 }
  ],
  [
    { seg: 1, theme: '原油进口量价齐升', main: { ind: '原油进口量', unit: '万吨' }, sub: { ind: '天然气进口量' }, vMin: 50000, vMax: 58000, rMin: 6, rMax: 11, subRatio: 0.26, srMin: 6, srMax: 11 },
    { seg: 2, theme: '能源对外依存度持续高位', main: { ind: '原油表观消费量', unit: '万吨' }, sub: { ind: '成品油消费量' }, vMin: 70000, vMax: 80000, rMin: 3, rMax: 7, subRatio: 0.42, srMin: 3, srMax: 7 },
    { seg: 3, theme: '电力生产结构持续优化', main: { ind: '全口径发电量', unit: '亿千瓦时' }, sub: { ind: '非化石能源发电量' }, vMin: 80000, vMax: 96000, rMin: 4, rMax: 8, subRatio: 0.34, srMin: 8, srMax: 15 }
  ],
  [
    { seg: 1, theme: '社会融资规模合理增长', main: { ind: '社会融资规模增量', unit: '亿元' }, sub: { ind: '对实体经济发放的人民币贷款' }, vMin: 30000, vMax: 45000, rMin: 8, rMax: 14, subRatio: 0.62, srMin: 8, srMax: 14 },
    { seg: 2, theme: '企业中长期贷款较快增长', main: { ind: '企业部门贷款余额', unit: '亿元' }, sub: { ind: '中长期贷款余额' }, vMin: 900000, vMax: 1200000, rMin: 10, rMax: 16, subRatio: 0.58, srMin: 10, srMax: 16 },
    { seg: 3, theme: '住户部门存款稳步增加', main: { ind: '住户存款余额', unit: '亿元' }, sub: { ind: '定期及其他存款余额' }, vMin: 1300000, vMax: 1500000, rMin: 10, rMax: 16, subRatio: 0.7, srMin: 10, srMax: 16 }
  ]
]

function buildLocateText(seed) {
  const theme = pick(THEMES, seed)
  // 确定性随机化：同种子同题，跨种子数值/增速/占比空间指数级扩大
  const segs = theme.map((seg) => {
    const v = rndVal(seed, seg.seg * 13 + 5, seg.vMin, seg.vMax)
    const r = rndRate(seed, seg.seg * 17 + 4, seg.rMin, seg.rMax)
    const subV = v < 500 ? Math.round(v * seg.subRatio) : Math.round((v * seg.subRatio) / 10) * 10
    const subR = rndRate(seed, seg.seg * 11 + 7, seg.srMin, seg.srMax)
    return { ...seg, main: { ...seg.main, v, r }, sub: { ...seg.sub, v: subV, r: subR } }
  })
  const sents = []
  for (const seg of segs) {
    const main = seg.main, sub = seg.sub
    sents.push({
      label: '第' + seg.seg + '段第1句', seg: seg.seg, sen: 1,
      ind: main.ind, unit: main.unit, v: main.v, r: main.r,
      text: main.ind + fmtV(main.v) + main.unit + '，比上年增长' + main.r + '%。'
    })
    sents.push({
      label: '第' + seg.seg + '段第2句', seg: seg.seg, sen: 2,
      ind: sub.ind, unit: main.unit, v: sub.v, r: sub.r,
      text: '其中，' + sub.ind + fmtV(sub.v) + main.unit + '，增长' + sub.r + '%。'
    })
  }
  const target = sents[hashIdx(seed + 3, sents.length)]
  const askKind = hashIdx(seed + 5, 2) === 0 ? '增速' : '数值'
  const tpl = hashIdx(seed + 6, 4)
  const kindWord = askKind === '增速' ? '同比增速' : '数值'
  const q = tpl === 0
    ? '求2024年「' + target.ind + '」的' + kindWord + '，应定位到材料中哪一句？'
    : tpl === 1
    ? '2024年「' + target.ind + '」的' + kindWord + '为多少？材料中哪一句包含该数据？'
    : tpl === 2
    ? '材料中「' + target.ind + '」的数据出现在哪一句？'
    : '要计算2024年「' + target.ind + '」的' + kindWord + '，应到材料哪一句取数？'
  const others = sents.filter((s) => s.label !== target.label).map((s) => s.label)
  const dists = shuffle(others, seed + 9).slice(0, 3)
  const opts = buildOpts([target.label], dists, seed)
  const mat = segs.map((seg) => {
    const m = seg.main, s = seg.sub
    return '**' + seg.seg + '、' + seg.theme + '**。' + m.ind + fmtV(m.v) + m.unit + '，比上年增长' + m.r + '%。其中，' + s.ind + fmtV(s.v) + m.unit + '，增长' + s.r + '%。'
  }).join('\n\n')
  const found = askKind === '增速' ? target.r + '%' : fmtV(target.v) + target.unit
  const explain = '【定位三步】①看时间：题干问 **2024年**；②看指标：**' + target.ind + '**；③看位置：材料**' + target.label + '**「' + target.text + '」→ ' + askKind + ' = **' + found + '**。\n\n口诀：先找时间 → 指标 → 单位，再回材料定位。'
  return { mode: 'locate', materialType: 'text', materialMd: '【材料】\n\n' + mat, q, options: opts.options, answer: opts.answer, explain, tip: '口诀：结构阅读三步——先看时间、再看指标、后定单位，定位到「第几段第几句」。', extra: { name: '数据定位' } }
}

function buildLocateTable(seed) {
  const groups = shuffle([
    { g: '种植业', inds: ['粮食产量', '蔬菜产量'] },
    { g: '养殖业', inds: ['肉类产量', '水产品产量'] },
    { g: '工业', inds: ['钢材产量', '汽车产量'] },
    { g: '服务业', inds: ['快递业务量', '软件业务收入'] }
  ], seed).slice(0, 2)
  const cols = groups.flatMap((gr) => gr.inds) // 4 个指标
  const years = [2021, 2022, 2023, 2024]
  const baseVals = shuffle(Array.from({ length: 40 }, (_, i) => 4200 + i * 137), seed + 3).slice(0, 16)
  const rows = years.map((y, ri) => [0, 1, 2, 3].map((ci) => baseVals[ri * 4 + ci]))
  const targetYear = pick([2022, 2023, 2024], seed, 90)
  const ti = years.indexOf(targetYear)
  const ci = hashIdx(seed + 11, cols.length)
  const col = cols[ci]
  const askKind = hashIdx(seed + 12, 3) // 0/1 数值 · 2 增速（需哪两年）
  // 多级表头：组名行 + 指标行
  const head1 = '| 年份 | ' + groups.map((gr) => gr.g + ' | ').join('') + ' |'
  const head2 = '| --- | ' + cols.map((c) => c).join(' | ') + ' |'
  const sep = '| --- | ' + cols.map(() => '---').join(' | ') + ' |'
  const body = years.map((y, ri) => '| ' + y + ' | ' + rows[ri].join(' | ') + ' |').join('\n')
  const unitRow = '| 单位 | ' + cols.map(() => '万吨').join(' | ') + ' |'
  const note = '\n\n注：数据均不含港澳台地区。'
  const mat = head1 + '\n' + head2 + '\n' + sep + '\n' + body + '\n' + unitRow + note
  if (askKind === 2) {
    // 真题式问法：求增速需要哪两年的数据
    const prevY = years[ti - 1]
    const pairs = [
      targetYear + '年与' + prevY + '年',
      targetYear + '年与' + years[Math.max(0, ti - 2)] + '年',
      prevY + '年与' + years[Math.max(0, ti - 2)] + '年',
      years[ti + 1] + '年与' + targetYear + '年'
    ]
    const opts = buildOpts([pairs[0]], pairs.slice(1), seed)
    const explain = '【定位】求' + targetYear + '年「' + col + '」的同比增速 → 需要 **' + targetYear + '年（现期）与 ' + prevY + '年（基期）** 两个数据。\n\n口诀：增速 = (现期−基期)÷基期，先锁「现期年+上一年」。'
    return { mode: 'locate', materialType: 'table', materialMd: '【材料】\n\n' + mat, q: '求' + targetYear + '年「' + col + '」的同比增速，需要哪两年的数据？', options: opts.options, answer: opts.answer, explain, tip: '口诀：增速 = (现期−基期)÷基期，先锁「现期年+上一年」。', extra: { name: '数据定位' } }
  }
  const correct = rows[ti][ci]
  const dist = [
    rows[ti][(ci + 1) % 4],
    rows[(ti + 1) % 4][ci],
    rows[(ti + 3) % 4][(ci + 2) % 4]
  ]
  const opts = buildOpts([fmt(correct)], dist.map((v) => fmt(v)), seed)
  const q = askKind === 0
    ? '求' + targetYear + '年「' + col + '」的数值，应为多少万吨？'
    : '材料中「' + col + '」在' + targetYear + '年的数值约为多少万吨？'
  const explain = '【定位】行 = **' + targetYear + '年**、列 = **' + col + '**（' + (groups[0].inds.includes(col) ? groups[0].g : groups[1].g) + '组）→ 交叉单元格 = **' + fmt(correct) + '万吨**。\n\n口诀：先锁「行年份 × 列指标」，再读交叉格，别串行串列、别把组名当指标。'
  return { mode: 'locate', materialType: 'table', materialMd: '【材料】\n\n' + mat, q, options: opts.options, answer: opts.answer, explain, tip: '口诀：多级表头先找「组名→指标」层级，再按行年份读数。', extra: { name: '数据定位' } }
}

function chartSvg(labels, vals, rates) {
  const W = 620, H = 330, pl = 76, pr = 62, pt = 26, pb = 48
  const max = Math.max(...vals)
  const yMax = Math.ceil(max / 500) * 500 + 200
  const n = vals.length
  const cw = (W - pl - pr) / n
  const bw = Math.min(54, cw * 0.5)
  const rMin = Math.min(0, ...rates), rMax = Math.max(0, ...rates)
  const rSpan = Math.max(8, rMax - rMin)
  let s = ''
  // 左轴网格（数值）
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((yMax * i) / 4 / 100) * 100
    const y = H - pb - (i / 4) * (H - pt - pb)
    s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1"/><text x="' + (pl - 8) + '" y="' + (y + 4) + '" font-size="11" text-anchor="end" fill="#666">' + val + '</text>'
  }
  // 右轴（增速%）
  for (let i = 0; i <= 4; i++) {
    const rv = Math.round(((rMin + (rSpan * i) / 4)) * 10) / 10
    const y = H - pb - (i / 4) * (H - pt - pb)
    s += '<text x="' + (W - pr + 10) + '" y="' + (y + 4) + '" font-size="11" fill="#e11d2e">' + rv + '%</text>'
  }
  // 柱（数值）
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i + (cw - bw) / 2
    const h = Math.max(8, (vals[i] / yMax) * (H - pt - pb))
    const y = H - pb - h
    s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + (i === n - 1 ? '#e11d2e' : '#4f8ff7') + '" rx="4"/><text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" font-size="12" text-anchor="middle" fill="#333" font-weight="700">' + vals[i] + '</text>'
  }
  // 折线（增速%）
  const pts = []
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i + cw / 2
    const y = H - pb - ((rates[i] - rMin) / rSpan) * (H - pt - pb)
    pts.push(x + ',' + y)
    s += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#fff" stroke="#e11d2e" stroke-width="2.5"/>'
    s += '<text x="' + x + '" y="' + (y - 10) + '" font-size="12" text-anchor="middle" fill="#e11d2e" font-weight="700">' + rates[i] + '%</text>'
  }
  s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#e11d2e" stroke-width="2.5"/>'
  // 横轴年份
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i + cw / 2
    s += '<text x="' + x + '" y="' + (H - pb + 20) + '" font-size="12" text-anchor="middle" fill="#333">' + labels[i] + '</text>'
  }
  // 图例
  s += '<rect x="' + pl + '" y="8" width="10" height="10" fill="#4f8ff7"/><text x="' + (pl + 14) + '" y="17" font-size="11" fill="#333">数值(左轴)</text><line x1="' + (pl + 86) + '" y1="13" x2="' + (pl + 106) + '" y2="13" stroke="#e11d2e" stroke-width="2.5"/><text x="' + (pl + 110) + '" y="17" font-size="11" fill="#333">增速%(右轴)</text>'
  return normalizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + s + '</svg>')
}

function buildLocateChart(seed) {
  const years = [2021, 2022, 2023, 2024]
  const vals = shuffle(Array.from({ length: 24 }, (_, i) => 3600 + i * 173), seed).slice(0, 4)
  const rates = years.map((y, i) => Math.round(rndRate(seed, i * 7 + 30, -6, 16) * 10) / 10)
  const svg = chartSvg(years.map((y) => y + '年'), vals, rates)
  const askKind = hashIdx(seed + 8, 3)
  if (askKind === 1) {
    // 问：哪年增速最快（读折线）
    let mi = 0
    rates.forEach((r, i) => { if (r > rates[mi]) mi = i })
    const opts = buildOpts([years[mi] + '年'], years.filter((y, i) => i !== mi).map((y) => y + '年'), seed)
    const explain = '【读图定位】增速看**红色折线**：最高点 = **' + years[mi] + '年**（' + rates[mi] + '%）。\n\n口诀：数值看柱高、增速看折线，别混用左右轴。'
    return { mode: 'locate', materialType: 'chart', materialSvg: svg, q: '图中哪一年的同比增速最快？', options: opts.options, answer: opts.answer, explain, tip: '口诀：组合图先认双轴——柱看左轴数值、折线看右轴增速。', extra: { name: '数据定位' } }
  }
  if (askKind === 2) {
    // 问：某年增速（读折线点）
    const targetYear = pick([2022, 2023, 2024], seed, 71)
    const ti = years.indexOf(targetYear)
    const opts = buildOpts([rates[ti] + '%'], rates.filter((r, i) => i !== ti).map((r) => r + '%'), seed)
    const explain = '【读图定位】' + targetYear + '年增速 → 看**红色折线**第' + (ti + 1) + '个点 = **' + rates[ti] + '%**（右轴）。\n\n口诀：增速读折线点 + 右轴刻度。'
    return { mode: 'locate', materialType: 'chart', materialSvg: svg, q: '图中' + targetYear + '年该指标同比增速约为多少？', options: opts.options, answer: opts.answer, explain, tip: '口诀：组合图先认双轴——柱看左轴数值、折线看右轴增速。', extra: { name: '数据定位' } }
  }
  // 问：某年数值（读柱）
  const targetYear = pick([2022, 2023, 2024], seed, 70)
  const ti = years.indexOf(targetYear)
  const correct = vals[ti]
  const dist = vals.filter((v, i) => i !== ti)
  const opts = buildOpts([fmt(correct)], dist.map((v) => fmt(v)), seed)
  const explain = '【读图定位】' + targetYear + '年数值 → 第' + (ti + 1) + '根**蓝色柱** → 柱顶标签 = **' + fmt(correct) + '万吨**（左轴）。\n\n口诀：数值看柱高、增速看折线，别混用左右轴。'
  return { mode: 'locate', materialType: 'chart', materialSvg: svg, q: '图中' + targetYear + '年该指标数值约为多少万吨？', options: opts.options, answer: opts.answer, explain, tip: '口诀：组合图先认双轴——柱看左轴数值、折线看右轴增速。', extra: { name: '数据定位' } }
}

function buildLocate(seed) {
  const mtype = pick(['text', 'text', 'table', 'chart'], seed)
  if (mtype === 'text') return buildLocateText(seed)
  if (mtype === 'table') return buildLocateTable(seed)
  return buildLocateChart(seed)
}
// ================= ③ 公式应激（公式选择） =================
const FORMULA_BANK = [
  {
    id: 'base', name: '基期量', formula: '基期量 = 现期量 ÷ (1 + 增长率)', ask: ['上年', '基期', '增长前'],
    opt: '$A = \\frac{B}{1+r}$',
    dist: ['$A = B \\times (1+r)$', '$A = \\frac{B}{1-r}$', '$B = \\frac{A}{1+r}$', '$\\Delta = B \\times r$'],
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), B = rndVal(seed, 2), r = rndRate(seed, 3, 1, 5.5)
      return { q: '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + r + '%，则2023年该' + ind + '为多少' + unit + '？', d: { B, r, unit } }
    },
    path(d) {
      const ex = d.B / (1 + d.r / 100)
      const fast = d.B * (1 - d.r / 100)
      return '代入：基期 = ' + fmt(d.B) + ' ÷ (1+' + d.r + '%) = ' + fmt(d.B) + '÷' + (1 + d.r / 100).toFixed(3) + ' ≈ **' + fmt(Math.round(ex)) + d.unit + '**。\n速算：|r|=' + d.r + '%≤5%，化除为乘 → 基期 ≈ ' + fmt(d.B) + '×(1−' + d.r + '%) ≈ **' + fmt(Math.round(fast)) + d.unit + '**。'
    },
    tip: '口诀：看到「上年/基期/增长前」→ 求基期，现期÷(1+r)；|r|≤5% 化除为乘。'
  },
  {
    id: 'now', name: '现期量', formula: '现期量 = 基期量 × (1 + 增长率)', ask: ['按此增速', '预计今年', '增长到'],
    opt: '$B = A \\times (1+r)$',
    dist: ['$A = \\frac{B}{1+r}$', '$B = A \\times (1-r)$', '$B = \\frac{A}{1+r}$', '$\\Delta = A \\times r$'],
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), A = rndVal(seed, 2), r = rndRate(seed, 3)
      return { q: '2023年' + ind + '为' + fmt(A) + unit + '，按同比增长' + r + '%测算，则2024年该' + ind + '约为多少' + unit + '？', d: { A, r, unit } }
    },
    path(d) {
      const B = d.A * (1 + d.r / 100)
      return '代入：现期 = ' + fmt(d.A) + ' × (1+' + d.r + '%) = ' + fmt(d.A) + '×' + (1 + d.r / 100).toFixed(3) + ' ≈ **' + fmt(Math.round(B)) + d.unit + '**。'
    },
    tip: '口诀：看到「今年/增长到/按增速测算」→ 求现期，基期×(1+r)。'
  },
  {
    id: 'inc', name: '增长量', formula: '增长量 = 现期量 × 增长率 ÷ (1 + 增长率)', ask: ['增加多少', '比上年增加', '减少多少'],
    opt: '$\\Delta = \\frac{B \\times r}{1+r}$',
    dist: ['$r = \\frac{B-A}{A}$', '$A = \\frac{B}{1+r}$', '$\\Delta = B \\times r$', '$\\Delta = \\frac{B \\times r}{1-r}$'],
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), B = rndVal(seed, 2), r = pick([9.1, 11.1, 12.5, 14.3, 16.7, 20, 25], seed, 3)
      return { q: '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + r + '%，则2024年该' + ind + '比上年增加多少' + unit + '？', d: { B, r, unit } }
    },
    path(d) {
      const ex = (d.B * d.r) / 100 / (1 + d.r / 100)
      const n = FRAC[d.r]
      if (n) return '代入：增量 = ' + fmt(d.B) + ' × ' + d.r + '% ÷ (1+' + d.r + '%) ≈ **' + fmt(Math.round(ex)) + d.unit + '**。\n速算：' + d.r + '%≈1/' + n + ' → 增量 ≈ 现期÷(n+1) = ' + fmt(d.B) + '÷' + (n + 1) + ' ≈ **' + fmt(Math.round(d.B / (n + 1))) + d.unit + '**。'
      return '代入：增量 = ' + fmt(d.B) + ' × ' + d.r + '% ÷ (1+' + d.r + '%) ≈ **' + fmt(Math.round(ex)) + d.unit + '**。\n速算：化除为乘 → 增量 ≈ ' + fmt(d.B) + '×' + d.r + '%×(1−' + d.r + '%) ≈ **' + fmt(Math.round((d.B * d.r) / 100 * (1 - d.r / 100))) + d.unit + '**。'
    },
    tip: '口诀：看到「增加/减少多少」→ 增量 Δ=B×r÷(1+r)；r≈1/n 用份数 Δ≈B/(n+1)。'
  },
  {
    id: 'rate', name: '增长率', formula: '增长率 = (现期量 − 基期量) ÷ 基期量', ask: ['增长百分之几', '同比增速', '下降百分之几'],
    opt: '$r = \\frac{B-A}{A}$',
    dist: ['$A = \\frac{B}{1+r}$', '$\\Delta = B \\times r$', '$R = r_1 + r_2 + r_1 r_2$', '$r = \\frac{B-A}{B}$'],
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind), A = rndVal(seed, 2, 3000, 30000), r = rndRate(seed, 3)
      const B = Math.round((A * (1 + r / 100)) / 10) * 10
      return { q: '2023年' + ind + '为' + fmt(A) + unit + '，2024年为' + fmt(B) + unit + '，则2024年该' + ind + '同比增长约百分之几？', d: { A, B } }
    },
    path(d) {
      const r = ((d.B - d.A) / d.A) * 100
      return '代入：r = (' + fmt(d.B) + ' − ' + fmt(d.A) + ') ÷ ' + fmt(d.A) + ' = ' + fmt(d.B - d.A) + '÷' + fmt(d.A) + ' ≈ **' + r.toFixed(1) + '%**。'
    },
    tip: '口诀：看到「增长/下降百分之几」→ 求增速，r=(现−基)÷基。'
  },
  {
    id: 'inter', name: '间隔增长率', formula: '间隔增长率 R = r1 + r2 + r1 × r2', ask: ['比两年前', '隔一年', '连续两年'],
    opt: '$R = r_1 + r_2 + r_1 \\times r_2$',
    dist: ['$R = r_1 + r_2$', '$R = r_1 \\times r_2$', '$\\bar{r} = (\\frac{B}{A})^{\\frac{1}{n}}-1$', '$r = \\frac{B-A}{A}$'],
    mk(seed) {
      const ind = pick(INDS, seed)
      const r1 = rndRate(seed, 2, 3, 12), r2 = rndRate(seed, 3, 1, 8)
      return { q: '2022年' + ind + '同比增长' + r1 + '%，2023年同比增长' + r2 + '%，则2024年该' + ind + '比2022年约增长百分之几？', d: { r1, r2 } }
    },
    path(d) {
      const R = d.r1 + d.r2 + (d.r1 * d.r2) / 100
      return '代入：R = ' + d.r1 + '% + ' + d.r2 + '% + ' + d.r1 + '%×' + d.r2 + '% = **' + R.toFixed(1) + '%**（别漏交叉项 ' + (d.r1 * d.r2 / 100).toFixed(2) + '%）。'
    },
    tip: '口诀：看到「比两年前/隔一年」→ 间隔增长率 R=r1+r2+r1×r2。'
  },
  {
    id: 'annual', name: '年均增长率', formula: '年均增长率 r̅ = (B/A)^(1/n) − 1', ask: ['年均增长', '年均增速', '平均每年增长'],
    opt: '$\\bar{r} = (\\frac{B}{A})^{\\frac{1}{n}}-1$',
    dist: ['$r = \\frac{B-A}{A}$', '$R = r_1 + r_2 + r_1 r_2$', '$r = \\frac{B-A}{n}$', '$r = \\frac{B}{A}-1$'],
    mk(seed) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const A = rndVal(seed, 2, 2000, 30000), g = pick([8, 10, 12, 15, 18], seed, 3)
      const B = Math.round(A * Math.pow(1 + g / 100, 4))
      return { q: '2020年' + ind + '为' + fmt(A) + unit + '，2024年' + ind + '为' + fmt(B) + unit + '，则2020—2024年该' + ind + '年均增速约为百分之几？', d: { A, B, n: 4 } }
    },
    path(d) {
      const r = Math.pow(d.B / d.A, 1 / d.n) - 1
      return '代入：r̅ = (' + fmt(d.B) + '÷' + fmt(d.A) + ')^(1/' + d.n + ') − 1 ≈ **' + (r * 100).toFixed(1) + '%**（n年差n−1=' + (d.n - 1) + '）。\n速算：若接近翻倍用70法则（翻倍年数≈70÷r）。'
    },
    tip: '口诀：看到「年均增长」→ n年差n−1；翻倍用70法则。'
  },
  {
    id: 'share', name: '现期比重', formula: '现期比重 = 部分量 ÷ 整体量', ask: ['占的比重', '占比', '占…'],
    opt: '$p = \\frac{A}{B}$',
    dist: ['$p = \\frac{A}{B} \\times \\frac{1+b}{1+a}$', '$p = \\frac{A}{B} \\times \\frac{a-b}{1+a}$', '$m = \\frac{\\text{总量}}{\\text{个数}}$', '$x = \\frac{A}{B} \\times 100\\%$'],
    mk(seed) {
      const pw = pick(PART_WHOLE, seed, 1), part = pw[0], whole = pw[1], A = pw[2], B = pw[3]
      const unit = pw[4]
      return { q: '2024年' + whole + '为' + fmt(B, 1) + unit + '，其中' + part + '为' + fmt(A, 1) + unit + '，则' + part + '占' + whole + '的比重约为多少？', d: { A, B } }
    },
    path(d) {
      const p = (d.A / d.B) * 100
      return '代入：比重 = ' + fmt(d.A) + ' ÷ ' + fmt(d.B) + ' ≈ **' + p.toFixed(1) + '%**。'
    },
    tip: '口诀：看到「占…的比重/占比」→ 现期比重 A/B。'
  },
  {
    id: 'bshare', name: '基期比重', formula: '基期比重 = A/B × (1+b)/(1+a)', ask: ['上年比重', '2023年比重', '基期比重'],
    opt: '$p = \\frac{A}{B} \\times \\frac{1+b}{1+a}$',
    dist: ['$p = \\frac{A}{B}$', '$p = \\frac{A}{B} \\times \\frac{a-b}{1+a}$', '$p = \\frac{A}{B} \\times \\frac{1+a}{1+b}$', '$m = \\frac{\\text{总量}}{\\text{个数}}$'],
    mk(seed) {
      const pw = pick(PART_WHOLE, seed, 1), part = pw[0], whole = pw[1], A = pw[2], B = pw[3]
      const a = rndRate(seed, 4), b = rndRate(seed, 5)
      const unit = pw[4]
      return { q: '2024年' + whole + '为' + fmt(B, 1) + unit + '，同比增长' + b + '%；其中' + part + '为' + fmt(A, 1) + unit + '，同比增长' + a + '%。则2023年' + part + '占' + whole + '的比重约为多少？', d: { A, B, a, b } }
    },
    path(d) {
      const p = (d.A / d.B) * ((1 + d.b / 100) / (1 + d.a / 100)) * 100
      return '代入：基期比重 = ' + fmt(d.A) + '÷' + fmt(d.B) + '×(1+' + d.b + '%)÷(1+' + d.a + '%) ≈ **' + p.toFixed(1) + '%**。'
    },
    tip: '口诀：看到「上年/基期比重」→ A/B 再乘 (1+b)/(1+a)。'
  },
  {
    id: 'shareDiff', name: '两期比重差', formula: '两期比重差 = A/B × (a−b)/(1+a)', ask: ['比重比上年', '比重上升/下降', '几个百分点'],
    opt: '$\\Delta p = \\frac{A}{B} \\times \\frac{a-b}{1+a}$',
    dist: ['$p = \\frac{A}{B} \\times \\frac{1+b}{1+a}$', '$p = \\frac{A}{B}$', '$m = \\frac{a-b}{1+b}$', '$\\Delta p = \\frac{A}{B} \\times \\frac{a+b}{1+a}$'],
    mk(seed) {
      const pw = pick(PART_WHOLE, seed, 1), part = pw[0], whole = pw[1], A = pw[2], B = pw[3]
      let a = rndRate(seed, 4), b = rndRate(seed, 5)
      if (a === b) a += 1.0
      const unit = pw[4]
      return { q: '2024年' + whole + '为' + fmt(B, 1) + unit + '，同比增长' + b + '%；其中' + part + '为' + fmt(A, 1) + unit + '，同比增长' + a + '%。则2024年' + part + '占' + whole + '的比重比上年约上升/下降多少个百分点？', d: { A, B, a, b } }
    },
    path(d) {
      const delta = (d.A / d.B) * ((d.a - d.b) / (1 + d.a / 100))
      const dir = d.a > d.b ? '上升' : '下降'
      return '代入：Δ比重 = ' + fmt(d.A) + '÷' + fmt(d.B) + '×(' + d.a + '%−' + d.b + '%)÷(1+' + d.a + '%) ≈ **' + dir + Math.abs(delta).toFixed(1) + '个百分点**。\n速判：a=' + d.a + '%，b=' + d.b + '%，a' + (d.a > d.b ? '>' : '<') + 'b → 比重' + (d.a > d.b ? '上升' : '下降') + '，先定方向再算大小。'
    },
    tip: '口诀：看到「比重比上年…个百分点」→ 两期比重差；先看 a 与 b 大小定升降。'
  },
  {
    id: 'avg', name: '平均数', formula: '平均数 = 总量 ÷ 个数', ask: ['平均每', '人均', '户均'],
    opt: '$m = \\frac{\\text{总量}}{\\text{个数}}$',
    dist: ['$p = \\frac{A}{B}$', '$x = \\frac{A}{B}$', '$m = \\frac{a-b}{1+b}$', '$m = \\text{总量} \\times \\text{个数}$'],
    mk(seed) {
      const ind = pick(INDS, seed, 1)
      const total = rndVal(seed, 2, 8000, 60000), n = rndVal(seed, 3, 2000, 9000)
      const unit = indUnit(ind)
      return { q: '2024年某省' + ind + '为' + fmt(total) + unit + '，该省常住人口' + n + '万人，则人均' + ind + '约为多少' + unit + '？', d: { total, n } }
    },
    path(d) {
      const m = d.total / d.n
      return '代入：平均数 = ' + fmt(d.total) + ' ÷ ' + d.n + ' ≈ **' + fmt(Math.round(m)) + '**。'
    },
    tip: '口诀：看到「平均每/人均」→ 平均数 = 总量÷个数。'
  },
  {
    id: 'avgRate', name: '平均数增长率', formula: '平均数增长率 = (a − b) ÷ (1 + b)', ask: ['平均每…增长', '人均…增长', '平均…增速'],
    opt: '$m_r = \\frac{a-b}{1+b}$',
    dist: ['$m = \\frac{\\text{总量}}{\\text{个数}}$', '$r = \\frac{B-A}{A}$', '$\\Delta p = \\frac{A}{B} \\times \\frac{a-b}{1+a}$', '$m_r = \\frac{a-b}{1+a}$'],
    mk(seed) {
      const ind = pick(INDS, seed, 1)
      let a = rndRate(seed, 2), b = rndRate(seed, 3)
      if (a === b) a += 1.0
      return { q: '2024年某省' + ind + '同比增长' + a + '%，同时该省常住人口同比增长' + b + '%，则人均' + ind + '同比增长约百分之几？', d: { a, b } }
    },
    path(d) {
      const r = ((d.a - d.b) / (1 + d.b / 100)) * 100
      return '代入：平均数增长率 = (' + d.a + '%−' + d.b + '%)÷(1+' + d.b + '%) ≈ **' + r.toFixed(1) + '%**。'
    },
    tip: '口诀：看到「平均每…增长%」→ (a−b)/(1+b)，a 总量增速、b 个数增速。'
  },
  {
    id: 'mult', name: '倍数', formula: '倍数 = A ÷ B', ask: ['是…的几倍', '多几倍', '倍数'],
    opt: '$x = \\frac{A}{B}$',
    dist: ['$p = \\frac{A}{B} \\times 100\\%$', '$m = \\frac{\\text{总量}}{\\text{个数}}$', '$r = \\frac{B-A}{A}$', '$R = r_1 + r_2 + r_1 r_2$'],
    mk(seed) {
      const p = pick([['出口额', '进口额', 2.95], ['网上零售额', '线下零售额', 1.53], ['新能源汽车产量', '传统汽车产量', 2.38], ['铁路货运量', '公路货运量', 4.85]], seed, 1)
      const unit = pick(['亿元', '万吨', '万辆', '亿件'], seed, 2)
      const A = rndVal(seed, 3, 10000, 80000)
      const B = Math.max(1000, Math.round(A / p[2] / 10) * 10)
      return { q: '2024年某省' + p[0] + '为' + fmt(A) + unit + '，' + p[1] + '为' + fmt(B) + unit + '，则' + p[0] + '约是' + p[1] + '的多少倍？', d: { A, B } }
    },
    path(d) {
      const x = d.A / d.B
      return '代入：倍数 = ' + fmt(d.A) + ' ÷ ' + fmt(d.B) + ' ≈ **' + x.toFixed(2) + '倍**。'
    },
    tip: '口诀：看到「是…的几倍」→ A/B；「多几倍」→ (A−B)/B。'
  },
  {
    id: 'mix', name: '混合增长率', formula: '混合增长率介于部分增速之间，偏向基期量大的', ask: ['进出口总额增速', '总体增速', '合计增速'],
    opt: '$r_{\\text{混}} \\in (r_1, r_2)$，偏向基期大的一方',
    dist: ['$r = r_1$', '$r = r_2$', '$r = \\frac{r_1+r_2}{2}$', '$R = r_1 + r_2 + r_1 r_2$'],
    mk(seed) {
      const r1 = rndRate(seed, 2, 4, 20), r2 = rndRate(seed, 3, -8, 12)
      const v1 = rndVal(seed, 4, 5000, 80000), v2 = rndVal(seed, 5, 3000, 60000)
      const unit = '亿元'
      return { q: '2024年某省出口额' + fmt(v1) + unit + '，同比增长' + r1 + '%；进口额' + fmt(v2) + unit + '，同比增长' + r2 + '%。则2024年该省进出口总额同比增速约为百分之几？', d: { r1, r2, v1, v2 } }
    },
    path(d) {
      const b1 = d.v1 / (1 + d.r1 / 100), b2 = d.v2 / (1 + d.r2 / 100)
      const m = (b1 * d.r1 + b2 * d.r2) / (b1 + b2)
      const lo = Math.min(d.r1, d.r2), hi = Math.max(d.r1, d.r2)
      return '混合：总增速介于 **' + lo + '% 与 ' + hi + '%** 之间，偏向基期量大的一方；基期加权 ≈ **' + m.toFixed(1) + '%**。\n口诀：居中但不居中，先看方向排除再定性选。'
    },
    tip: '口诀：看到「总体/合计增速」→ 混合居中，偏向基期量大的一方。'
  }
]

function buildFormula(seed) {
  const t = FORMULA_BANK[hashIdx(seed, FORMULA_BANK.length)]
  const { q, d } = t.mk(seed)
  const dists = shuffle(t.dist, seed + 1).slice(0, 3)
  const opts = buildOpts([t.opt], dists, seed)
  const explain = '【公式识别】提问关键词「' + t.ask.join(' / ') + '」→ 应选 **' + t.name + '**：' + t.formula + '\n\n【完整解题路径】\n' + t.path(d) + '\n\n口诀：' + t.tip
  return { mode: 'formula', q, options: opts.options, answer: opts.answer, explain, tip: t.tip, extra: { name: t.name, formula: t.formula } }
}
// ================= ④ 速算估算（计算执行） =================
const CALC_TYPES = {
  convert: {
    id: 'convert', name: '化除为乘', formula: '基期 ≈ 现期 × (1 − r)，|r|≤5%',
    mk(seed, lv) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const B = rndVal(seed, 2, lv === 3 ? 20000 : 3000, lv === 3 ? 150000 : 30000)
      const r = rndRate(seed, 3, 1, 5)
      return { q: '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + r + '%，则2023年该' + ind + '约为多少' + unit + '？', B, r, unit }
    },
    opts(d) {
      const c = r10(d.B * (1 - d.r / 100))
      return [c, r10(d.B), r10(d.B * (1 - 2 * d.r / 100)), r10(d.B * (1 + d.r / 100))]
    },
    explain(d) {
      return '速算：|r|=' + d.r + '%≤5% → 化除为乘：基期 ≈ 现期×(1−r) = ' + fmt(d.B) + '×' + (1 - d.r / 100).toFixed(3) + ' ≈ **' + fmt(r10(d.B * (1 - d.r / 100))) + d.unit + '**。\n陷阱：直接用现期当基期（' + fmt(r10(d.B)) + '）、多减（' + fmt(r10(d.B * (1 - 2 * d.r / 100))) + '）、方向反（' + fmt(r10(d.B * (1 + d.r / 100))) + '）。'
    },
    tip: '口诀：增速≤5%，除变乘：基期≈现期×(1−r)。'
  },
  frac: {
    id: 'frac', name: '份数思想', formula: '增量 ≈ 现期 ÷ (n+1)，r≈1/n',
    mk(seed, lv) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const B = rndVal(seed, 2, lv === 3 ? 20000 : 3000, lv === 3 ? 120000 : 30000)
      const fr = pick(FRAC_CHOICES, seed, 3)
      return { q: '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + fr.r + '%，则2024年该' + ind + '比上年增加约多少' + unit + '？', B, r: fr.r, n: fr.n, unit }
    },
    opts(d) {
      const c = r10(d.B / (d.n + 1))
      return [c, r10(d.B / (d.n - 1)), r10(d.B / (d.n + 2)), r10(d.B)]
    },
    explain(d) {
      return '速算：r=' + d.r + '%≈1/' + d.n + ' → 增量 ≈ 现期÷(n+1) = ' + fmt(d.B) + '÷' + (d.n + 1) + ' ≈ **' + fmt(r10(d.B / (d.n + 1))) + d.unit + '**。\n陷阱：用 B/n（' + fmt(r10(d.B / d.n)) + '）、B/(n+2)（' + fmt(r10(d.B / (d.n + 2))) + '）或现期当增量。'
    },
    tip: '口诀：增速≈1/n，增量≈现期/(n+1)；下降时≈现期/(n−1)。'
  },
  coef: {
    id: 'coef', name: '转化系数', formula: '增量 = 现期 × [r/(1+r)]',
    mk(seed, lv) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const B = rndVal(seed, 2, lv === 3 ? 20000 : 5000, lv === 3 ? 120000 : 50000)
      const cf = pick([{ r: 10, f: 0.0909 }, { r: 15, f: 0.1304 }, { r: 20, f: 0.1667 }, { r: 25, f: 0.2 }, { r: 5, f: 0.0476 }, { r: 33.3, f: 0.25 }], seed, 3)
      return { q: '2024年' + ind + '为' + fmt(B) + unit + '，同比增长' + cf.r + '%，则2024年该' + ind + '比上年增加约多少' + unit + '？', B, r: cf.r, f: cf.f, unit }
    },
    opts(d) {
      const c = r10(d.B * d.f)
      return [c, r10((d.B * d.r) / 100), r10(d.B * d.f * 1.05), r10(d.B * d.f * 0.95)]
    },
    explain(d) {
      return '速算：增量 = 现期×转化系数 = 现期×r/(1+r) = ' + fmt(d.B) + '×' + d.f + ' ≈ **' + fmt(r10(d.B * d.f)) + d.unit + '**。\n记忆：r=' + d.r + '% → 系数 ' + d.f + '（' + d.r + '%/(1+' + d.r + '%)）。\n陷阱：直接用现期×r（' + fmt(r10((d.B * d.r) / 100)) + '）。'
    },
    tip: '口诀：增量 = 现期×[r/(1+r)]，高频系数：10%→0.0909、15%→0.1304、20%→0.1667、25%→0.2。'
  },
  cut: {
    id: 'cut', name: '截位直除', formula: '基期 = 现期 ÷ (1+r)，按选项差距截位',
    mk(seed, lv) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const A = rndVal(seed, 2, lv === 3 ? 20000 : 5000, lv === 3 ? 100000 : 40000)
      const r = rndRate(seed, 3, 8, 23)
      return { q: '2024年' + ind + '为' + fmt(A) + unit + '，同比增长' + r + '%，则2023年该' + ind + '约为多少' + unit + '？', A, r, unit }
    },
    opts(d) {
      const ex = d.A / (1 + d.r / 100)
      return [r10(ex), r10(ex * 0.985), r10(ex * 1.015), r10(d.A * (1 - d.r / 100))]
    },
    explain(d) {
      return '速算：截位直除，1+r≈' + (1 + d.r / 100).toFixed(2) + ' → ' + fmt(d.A) + '÷' + (1 + d.r / 100).toFixed(2) + ' ≈ **' + fmt(r10(d.A / (1 + d.r / 100))) + d.unit + '**。\n按选项差距保留有效数字：首位不同截1-2位、次位差大截2位、前三同才精算。'
    },
    tip: '口诀：选项首位不同截1-2位，次位差大截2位，前三同才精算，绝不逐位死算。'
  },
  bai: {
    id: 'bai', name: '百化分', formula: '百分数 ↔ 分数（1/n）互化',
    mk(seed, _lv) {
      const fr = _lv === 1 ? { r: 12.5, n: 8 } : pick(FRAC_CHOICES, seed, 2)
      const rev = hashIdx(seed + 5, 2) === 1
      if (rev) return { q: '1/' + fr.n + ' 对应的百分数最接近？', r: fr.r, n: fr.n, rev: true }
      return { q: fr.r + '% 最接近下列哪个分数？', r: fr.r, n: fr.n, rev: false }
    },
    opts(d) {
      if (d.rev) {
        const cand = FRAC_CHOICES.map((f) => f.r).filter((r) => r !== d.r)
        const others = shuffle(cand, d.n * 1000).slice(0, 3)
        return [d.r + '%', others[0] + '%', others[1] + '%', others[2] + '%']
      }
      const cand = FRAC_CHOICES.map((f) => f.n).filter((n) => n !== d.n)
      const others = shuffle(cand, d.r * 1000).slice(0, 3)
      return ['1/' + d.n, '1/' + others[0], '1/' + others[1], '1/' + others[2]]
    },
    explain(d) {
      return d.r + '% = **1/' + d.n + '**。\n记忆链：1/8=12.5%、1/9≈11.1%、1/7≈14.3%、1/6≈16.7%、1/5=20%、1/4=25%、1/12≈8.3%、1/3≈33.3%。'
    },
    tip: '口诀：百化分高频表倒背如流——1/3≈33.3%、1/4=25%、1/5=20%、1/6≈16.7%、1/7≈14.3%、1/8=12.5%、1/9≈11.1%、1/12≈8.3%。'
  },
  split: {
    id: 'split', name: '乘法拆分', formula: 'A×r% = A×(a+b)…，把百分数拆整',
    mk(seed, lv) {
      const ind = pick(INDS, seed), unit = indUnit(ind)
      const A = rndVal(seed, 2, lv === 3 ? 10000 : 2000, lv === 3 ? 100000 : 20000)
      const r = pick([9.9, 8.8, 15.5, 22.5, 12.5], seed, 3)
      return { q: '计算：' + fmt(A) + ' × ' + r + '% ≈ ？（' + ind + '相关计算）', A, r, unit }
    },
    opts(d) {
      const c = Math.round((d.A * d.r) / 100)
      return [c, Math.round((d.A * Math.ceil(d.r)) / 100), Math.round((d.A * (d.r - 1)) / 100), Math.round((d.A * (d.r + 2)) / 100)]
    },
    explain(d) {
      const hi = Math.ceil(d.r)
      const lo = (hi - d.r).toFixed(1)
      return '拆分：' + d.r + '% = ' + hi + '% − ' + lo + '% → ' + fmt(d.A) + '×' + d.r + '% ≈ ' + fmt(d.A) + '×' + hi + '% − ' + fmt(d.A) + '×' + lo + '% ≈ **' + fmt(Math.round((d.A * d.r) / 100)) + '**。'
    },
    tip: '口诀：9.9%=10%−0.1%、15.5%=10%+5%+0.5%、22.5%=20%+2.5%。'
  },
  cmp: {
    id: 'cmp', name: '分数比较', formula: '五法则：一大一小/倍数/基准值/差分/拆1',
    mk(seed, _lv) {
      const a = rndVal(seed, 2, 400, 900)
      const b = rndVal(seed, 3, 800, 1500)
      const c = a + pick([70, 110, 150, 190], seed, 4)
      const d = Math.max(500, b - pick([60, 90, 120, 150], seed, 5))
      const swap = hashIdx(seed + 7, 2) === 1
      if (swap) return { q: '比较 ' + c + '/' + d + ' 与 ' + a + '/' + b + ' 的大小（不用计算器）', a: c, b: d, c: a, d: b, ans: '前者 > 后者' }
      return { q: '比较 ' + a + '/' + b + ' 与 ' + c + '/' + d + ' 的大小（不用计算器）', a, b, c, d, ans: '前者 < 后者' }
    },
    opts(d) {
      const others = ['前者 < 后者', '两者相等', '无法判断'].filter((x) => x !== d.ans)
      return [d.ans, others[0], others[1], others[2]]
    },
    explain(d) {
      if (d.a < d.c && d.b > d.d) return '五法则①一大一小直接看：' + d.a + '<' + d.c + '（分子小）且 ' + d.b + '>' + d.d + '（分母大）→ ' + d.a + '/' + d.b + ' < ' + d.c + '/' + d.d + '。\n所以：**前者 ' + (d.ans.indexOf('>') > -1 ? '>' : '<') + ' 后者**。'
      return '构造：' + d.a + '/' + d.b + ' vs ' + d.c + '/' + d.d + '，用五法则判定：**' + d.ans + '**。'
    },
    tip: '口诀：一大一小直接看、同大同小看倍数、基准值法、差分法、拆1比较法。'
  },
  doub: {
    id: 'doub', name: '70法则', formula: '翻倍年数 ≈ 70 ÷ 增速(%)',
    mk(seed, _lv) {
      const ind = pick(INDS, seed, 2)
      const r = pick([2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 14, 20], seed, 3)
      return { q: '某省' + ind + '年均增速为 ' + r + '%，按 70 法则，约需多少年翻一番？', r }
    },
    opts(d) {
      const n = Math.round(70 / d.r)
      return [n, Math.max(1, n - 1), n + 1, n + 2]
    },
    explain(d) {
      return '70法则：翻倍年数 ≈ 70 ÷ r = 70 ÷ ' + d.r + ' ≈ **' + Math.round(70 / d.r) + '年**（r≤10%时误差<2%）。'
    },
    tip: '口诀：翻倍年数 ≈ 70 ÷ 增速(百分数)。'
  },
  mix: {
    id: 'mix', name: '混合居中', formula: '混合增长率居中、偏向基期大的一方',
    mk(seed, _lv) {
      const r1 = rndRate(seed, 2, 4, 20), r2 = rndRate(seed, 3, -8, 12)
      const v1 = rndVal(seed, 4, 5000, 80000), v2 = rndVal(seed, 5, 3000, 60000)
      return { q: '2024年某省出口额' + fmt(v1) + '亿元，同比增长' + r1 + '%；进口额' + fmt(v2) + '亿元，同比增长' + r2 + '%。则2024年该省进出口总额同比增速最接近：', r1, r2, v1, v2 }
    },
    opts(d) {
      const b1 = d.v1 / (1 + d.r1 / 100), b2 = d.v2 / (1 + d.r2 / 100)
      const c = Math.round(((b1 * d.r1 + b2 * d.r2) / (b1 + b2)) * 10) / 10
      const simple = Math.round(((d.v1 * d.r1 + d.v2 * d.r2) / (d.v1 + d.v2)) * 10) / 10
      const mid = Math.round(((d.r1 + d.r2) / 2) * 10) / 10
      const hi = Math.max(d.r1, d.r2)
      return [c, simple, mid, hi]
    },
    explain(d) {
      const b1 = d.v1 / (1 + d.r1 / 100), b2 = d.v2 / (1 + d.r2 / 100)
      const c = Math.round(((b1 * d.r1 + b2 * d.r2) / (b1 + b2)) * 10) / 10
      const lo = Math.min(d.r1, d.r2), hi = Math.max(d.r1, d.r2)
      return '混合：总增速介于 **' + lo + '% 与 ' + hi + '%** 之间，偏向基期量大的一方（' + (b1 >= b2 ? '出口' : '进口') + '基期更大）。\n基期加权 ≈ **' + c + '%**。现期简单平均、简单中位数、端点值都是干扰项。'
    },
    tip: '口诀：总体增速居中、偏向基期大的一方；先看方向排除再定性选。'
  }
}
const CALC_POOLS = {
  1: ['convert', 'frac', 'bai', 'split', 'doub'],
  2: ['convert', 'frac', 'coef', 'bai', 'split', 'cmp', 'doub'],
  3: ['coef', 'cut', 'cmp', 'frac', 'convert', 'mix']
}

// 速算方法教学库：考点链接 → 原理 → 操作步骤 → 口诀（供 UI 方法卡与分阶段训练复用）
export const CALC_METHOD_LIB = {
  '化除为乘': { trigger: '增速 |r|≤5% 且求基期量', concept: '把除法变成乘法：基期 = 现期 ÷ (1+r) ≈ 现期 × (1−r)。原理是 r 很小时 1/(1+r) 与 (1−r) 几乎相等，误差<0.3%。', steps: ['先二八速判：看增速是否 ≤5%', '直接乘：现期 × (1−r) = 现期 − 现期×r', '对照选项差距，粗算即选'] },
  '份数思想': { trigger: '增速 r≈1/n（12.5%、20%、25%…），求增长量', concept: '把百分数看成 1/n：增量 = 现期 × r ÷ (1+r) ≈ 现期 ÷ (n+1)。这是资料分析最高频的特殊增速法。', steps: ['把 r% 化成最接近的 1/n', '增量 ≈ 现期 ÷ (n+1)', '下降时用 现期 ÷ (n−1)'] },
  '转化系数': { trigger: '已知现期+增速求增量，增速在高频表内（5/10/15/20/25%）', concept: '增量 = 现期 × [r/(1+r)]。先背下高频转化系数表，一步乘法出答案，避免先除后乘。', steps: ['查表：5%→0.0476、10%→0.0909、15%→0.1304、20%→0.1667、25%→0.2', '增量 = 现期 × 系数', '别直接用现期×r（少除了 (1+r)）'] },
  '截位直除': { trigger: '基期量计算、增速非整、选项首位/次位有差距', concept: '不逐位精算：根据选项差距决定保留几位有效数字，把分母截成 2-3 位再直除，能排到选项为止。', steps: ['看选项：首位不同截1-2位、次位差大截2位、前三同才3-4位', '分母四舍五入到对应位数', '估算商落在哪个选项区间就选哪个'] },
  '百化分': { trigger: '百分数 ↔ 分数互化（算增量/基期前的桥梁）', concept: '高频百化分表是速算的"乘法口诀表"：12.5%→1/8、20%→1/5，看到百分数先想最近分数，就能套份数法。', steps: ['背高频表：1/3≈33.3%、1/4=25%、1/5=20%、1/6≈16.7%、1/7≈14.3%、1/8=12.5%、1/9≈11.1%、1/12≈8.3%', '看到百分数先找最近分数', '再套用份数思想/化除为乘'] },
  '乘法拆分': { trigger: 'A×r% 型计算（求增量/现期估计）', concept: '把百分数拆成整十±余数：9.9%=10%−0.1%、15.5%=10%+5%+0.5%，分别乘再加减，全部心算。', steps: ['把 r% 拆成 整十 ± 余数', '分别算 A×整十 与 A×余数', '相加/相减得答案'] },
  '分数比较': { trigger: '比较两个分数大小（比重/倍数/增速比较）', concept: '不硬算：用五法则——一大一小直接看、同大同小看倍数、基准值法、差分法、拆1比较法。', steps: ['一大一小（分子大且分母小）→ 直接看', '同大同小 → 比分子倍数与分母倍数', '都接近1 → 拆1比余数；都接近1/2、1/3 → 基准值'] },
  '70法则': { trigger: '求翻倍年数/年均增速（r≤10% 精度高）', concept: '复利翻倍时间 ≈ 70 ÷ 增速(%)，是年均增速题的秒杀工具；r≤10% 时误差<2%。', steps: ['翻倍年数 ≈ 70 ÷ r', 'r≤10% 直接用', '三倍用115法则（115÷r）'] },
  '混合居中': { trigger: '总体/合计增速（两个部分增速已知）', concept: '混合增长率必在两个部分增速之间，且偏向基期量大的一方——先定区间排除端点，再定性选。', steps: ['找两个部分增速 → 得区间', '看哪边基期（现期÷(1+r)）大 → 偏向哪边', '排除端点与简单平均，选靠近大基期的'] }
}

function buildCalc(seed, level, stage) {
  const lv = Math.min(3, Math.max(1, level || 2))
  const pool = CALC_POOLS[lv]
  const id = pool[hashIdx(seed, pool.length)]
  const t = CALC_TYPES[id]
  const d = t.mk(seed, lv)
  const raw = t.opts(d)
  const opts = buildOpts([raw[0]], raw.slice(1), seed)
  const lib = CALC_METHOD_LIB[t.name] || { trigger: '', concept: '', steps: [] }
  const baseExplain = '【速算过程】\n方法：**' + t.name + '**（适用：' + lib.trigger + '）\n' + t.explain(d) + '\n\n操作步骤：\n' + lib.steps.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\n\n口诀：' + t.tip
  const base = { mode: 'calc', method: t.name, q: d.q, options: opts.options, answer: opts.answer, explain: baseExplain, tip: t.tip, extra: { name: t.name, formula: t.formula } }
  // 阶段一·方法识别：只判断该用哪种速算方法（不计算）
  if (stage === 'identify') {
    const names = Object.keys(CALC_TYPES).map((k) => CALC_TYPES[k].name).filter((n) => n !== t.name)
    const dists = shuffle(names, seed + 21).slice(0, 3)
    const mopts = buildOpts([t.name], dists, seed)
    const mexplain = '【方法识别】题干特征：**' + lib.trigger + '**\n\n该题应选 **' + t.name + '**。\n\n原理：' + lib.concept + '\n\n操作步骤：\n' + lib.steps.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\n\n口诀：' + t.tip
    return { ...base, q: d.q + '\n\n【问】估算这道题，最适合用哪种速算方法？', options: mopts.options, answer: mopts.answer, explain: mexplain, stage: 'identify' }
  }
  // 阶段二·方法应用：给方法提示，练套用
  if (stage === 'apply') {
    return { ...base, q: d.q + '\n\n【提示】请用「' + t.name + '」估算。', stage: 'apply' }
  }
  // 阶段三·实战混合：不给提示
  return { ...base, stage: 'practice' }
}
// ================= 入口 =================
export function genDataQ(mode, seed, level = 2, stage) {
  if (seed === undefined) seed = Date.now() % 100000
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = seed + attempt * 137
    const q = mode === 'type' ? buildType(s)
      : mode === 'locate' ? buildLocate(s)
      : mode === 'formula' ? buildFormula(s)
      : buildCalc(s, level, stage)
    if (q && verifyUnique(q)) return q
  }
  return null
}

// 模式元信息（供 UI 与测试复用）
export const DATA_MODES = [
  { k: 'type', t: '判题型', layer: '① 统计阅读', desc: '看提问方式秒判考点题型' },
  { k: 'locate', t: '找数据', layer: '② 数据定位', desc: '时间/指标/单位三锁定' },
  { k: 'formula', t: '公式应激', layer: '③ 公式选择', desc: '识别概念→定方向→选公式' },
  { k: 'calc', t: '速算估算', layer: '④ 计算执行', desc: '看选项差距→估算→快速选对' }
]
