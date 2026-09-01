// 批次7·S5 数量关系本地训练生成器（种子化：同种子同题，答案构造性可验证）
// 范式对齐 dataTrainGen/tutuGen；题型对应 skill 卡 cards-shuliang
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry(seed) {
  let t = seed >>> 0
  return function () {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)]

const SHUFFLE = (opts, correctIdx, rnd) => {
  const idx = [0, 1, 2, 3]
  for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
  return { opts: idx.map((i) => opts[i]), answer: 'ABCD'[idx.indexOf(correctIdx)] }
}
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))
const distinct = (arr) => new Set(arr).size === arr.length

const GENS = [
  // 0 和差倍比：大=(和+差)/2
  (seed, rnd) => {
    const small = 3 + Math.floor(rnd() * 20)
    const diff = 2 + Math.floor(rnd() * 18)
    const big = small + diff
    const sum = big + small
    const opts = [big, sum - diff + 2, small + 1, big + diff]
    if (!distinct(opts)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `甲、乙两数之和为 ${sum}，甲比乙多 ${diff}，则甲、乙中较大的数是多少？`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `和差公式：大=(和+差)÷2=(${sum}+${diff})÷2=${big}。`,
      cardId: 'sl-hcb'
    }
  },
  // 1 基期公式：基期=现期/(1+r)
  (seed, rnd) => {
    const n = pick([4, 5, 8, 10], rnd)
    const k = 2 + Math.floor(rnd() * 30)
    // 现期=k*(n+1)（注释保留，base 变量已不参与后续计算）
    const now = k * (n + 1)
    const rPct = Math.round(10000 / n) / 100
    const opts = [k, k + n, Math.round(k * 1.2), k - 2]
    if (!distinct(opts) || opts.some((o) => o <= 0)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `某市2023年GDP为 ${now} 亿元，同比增长 ${rPct}%（≈1/${n}），则2022年GDP约为多少亿元？`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `基期=现期÷(1+r)=${now}÷(1+1/${n})=${k}亿元。百化分速算：增长率1/${n}时，基期=现期×n/(n+1)。`,
      cardId: 'sl-jjq'
    }
  },
  // 2 增长量：现期/(n+1)
  (seed, rnd) => {
    const n = pick([6, 7, 8, 9, 11, 12], rnd)
    const k = 2 + Math.floor(rnd() * 40)
    const now = k * (n + 1)
    const inc = k
    const rPct = Math.round(10000 / n) / 100
    const opts = [inc, inc + 1, now - k - 1, Math.round(inc * 1.3)]
    if (!distinct(opts)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `某地2023年产值 ${now} 亿元，同比增长 ${rPct}%（≈1/${n}），则同比增长了多少亿元？`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `增长量=现期×r/(1+r)=${now}×1/${n + 1}=${inc}亿元（百化分：现期/(n+1)）。`,
      cardId: 'sl-zll'
    }
  },
  // 3 工程：设总量=lcm
  (seed, rnd) => {
    const t1 = pick([6, 8, 10, 12], rnd)
    const t2 = pick([3, 4, 6, 8, 24], rnd)
    const lcm = (a, b) => { const g = (x, y) => (y ? g(y, x % y) : x); return (a * b) / g(a, b) }
    const L = lcm(t1, t2)
    const days = Math.round((L / (L / t1 + L / t2)) * 100) / 100
    if (!Number.isInteger(days) || days < 1) return null
    const opts = [days, days + 1, days - 1, t1 + t2]
    if (!distinct(opts) || opts.some((o) => o < 1)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `甲单独完成一项工程需 ${t1} 天，乙单独需 ${t2} 天，两人合作需要多少天完成？`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `设总量为 ${L}（最小公倍数），效率${L / t1}+${L / t2}=${L / t1 + L / t2}，合作天数=${L}÷${L / t1 + L / t2}=${days}天。`,
      cardId: 'sl-gc'
    }
  },
  // 4 经济利润：成本100特值
  (seed, rnd) => {
    const markup = pick([20, 30, 50, 80], rnd)
    const discount = pick([7, 8, 9], rnd) // 打d折=0.d
    const cost = 100
    const price = cost * (1 + markup / 100)
    const sell = price * (discount / 10)
    const rate = Math.round(((sell - cost) / cost) * 1000) / 10
    const opts = [rate, rate + 10, markup - 20 * (10 - discount), Math.round(rate * 0.8 * 10) / 10]
    if (!distinct(opts)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `某商品成本100元，按成本上浮${markup}%定价，后打${discount}折出售，利润率是多少？`,
      opts: sh.opts.map((o) => o + '%'), answer: sh.answer,
      explain: `定价=${cost}×(1+${markup}%)=${price}元，售价=${price}×${discount / 10}=${sell}元，利润率=(${sell}-${cost})/${cost}=${rate}%。`,
      cardId: 'sl-jlr'
    }
  },
  // 5 相遇：t=S/(v1+v2)
  (seed, rnd) => {
    const v1 = 40 + Math.floor(rnd() * 40)
    const v2 = 30 + Math.floor(rnd() * 30)
    const t = 1 + Math.floor(rnd() * 4)
    const S = (v1 + v2) * t
    const opts = [t, t + 1, S / v1, S / v2]
    if (!distinct(opts) || !opts.every((o) => Number.isInteger(o) && o > 0)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `甲乙两地相距 ${S} 千米，一辆车以 ${v1} 千米/时从甲地、另一辆以 ${v2} 千米/时从乙地同时相向出发，几小时后两车相遇？`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `相遇时间=路程÷速度和=${S}÷(${v1}+${v2})=${t}小时。`,
      cardId: 'sl-xc'
    }
  },
  // 6 概率：至少一次=1-(1-p)^2
  (seed, rnd) => {
    const den = pick([4, 5, 8, 10], rnd)
    const p = 1 / den
    const res = Math.round((1 - (1 - p) * (1 - p)) * 10000) / 10000
    const wrong1 = p
    const wrong2 = Math.round(p * p * 10000) / 10000
    const wrong3 = Math.round((1 - p) * 10000) / 10000
    const opts = [res, wrong1, wrong2, wrong3]
    if (!distinct(opts)) return null
    const sh = SHUFFLE(opts.map((o) => String(o)), 0, rnd)
    return {
      stem: `某射手每次射击命中率为 1/${den}，连续独立射击2次，至少命中一次的概率是多少？`,
      opts: sh.opts, answer: sh.answer,
      explain: `至少一次=1-全不中=1-(1-1/${den})²=1-${Math.round((1 - p) * 10000) / 10000}²=${res}。`,
      cardId: 'sl-gl'
    }
  },
  // 7 容斥：总数-A-B+AB
  (seed, rnd) => {
    const A = 40 + Math.floor(rnd() * 30)
    const B = 30 + Math.floor(rnd() * 25)
    const AB = 10 + Math.floor(rnd() * 15)
    const none = 5 + Math.floor(rnd() * 15)
    const total = A + B - AB + none
    const opts = [none, AB, A + B - total, total - A]
    if (!distinct(opts) || opts.some((o) => o < 0)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `某班 ${total} 人，参加数学小组的 ${A} 人，参加物理小组的 ${B} 人，两个小组都参加的 ${AB} 人，则两个小组都没参加的有多少人？`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `至少参加一个的=${A}+${B}-${AB}=${A + B - AB}人，都没参加=${total}-${A + B - AB}=${none}人。`,
      cardId: 'sl-rc'
    }
  },
  // 8 几何放缩：边长增k% → 体积(1+k%)³
  (seed, rnd) => {
    const k = pick([10, 20, 30, 50], rnd)
    const f = 1 + k / 100
    const growth = Math.round((f * f * f - 1) * 1000) / 10
    if (growth <= 0) return null
    const opts = [growth, k * 3, Math.round(k * 2 * 10) / 10, growth + 20]
    if (!distinct(opts)) return null
    const sh = SHUFFLE(opts.map((o) => o + '%'), 0, rnd)
    return {
      stem: `一个正方体棱长增加 ${k}%，则其体积增加百分之几？`,
      opts: sh.opts, answer: sh.answer,
      explain: `棱长k→体积k³：体积变为(1+${k / 100})³=${Math.round(f * f * f * 1000) / 1000}倍，增加${growth}%。`,
      cardId: 'sl-jh'
    }
  },
  // 9 整除秒杀：部分占比 a/b，总数为 b 的倍数
  (seed, rnd) => {
    const b = pick([5, 7, 8, 9], rnd)
    const a = 1 + Math.floor(rnd() * (b - 1))
    const k = 2 + Math.floor(rnd() * 15)
    const total = b * k
    const opts = [total, total + 1, total + 2, total - 1]
    if (!distinct(opts) || opts.some((o) => o <= 0)) return null
    const sh = SHUFFLE(opts, 0, rnd)
    return {
      stem: `某班男生占全班的 ${a}/${b}，则全班人数可能是以下哪个？（每人只能是完整的人）`,
      opts: sh.opts.map(fmt), answer: sh.answer,
      explain: `总人数必须是 ${b} 的倍数（${a}/${b}×总人数须为整数），只有 ${total} 满足。`,
      cardId: 'sl-zc'
    }
  }
]

export function genSlQuestion(seed) {
  const s = seed == null ? Math.floor(Math.random() * 1e9) : seed
  for (let i = 0; i < 8; i++) {
    const rnd = mulberry(hash(String(s) + '_' + i))
    try {
      const q = GENS[Math.floor(rnd() * GENS.length)](s + i, rnd)
      if (q && q.opts && distinct(q.opts) && q.opts.length === 4) {
        const explain = q.explain + '\n\n📌 本题为本地训练生成（构造性答案，非真题）' + (SL_CARD_NAMES[q.cardId] ? ' · 对应知识卡：' + SL_CARD_NAMES[q.cardId] : '')
        return { stem: q.stem, options: q.opts, answer: q.answer, explain, cardId: q.cardId, variant: '本地题库' }
      }
    } catch (e) { /* 换种子重试 */ }
  }
  return null
}

// 知识卡名映射（对应 src/kb/cards-shuliang.js 的 sl-* 卡）
const SL_CARD_NAMES = {
  'sl-fc': '方程思想', 'sl-hcb': '和差倍比', 'sl-jjq': '基期计算（百化分）', 'sl-zll': '增长量（百化分）',
  'sl-xc': '行程·相遇追及', 'sl-gc': '工程效率',
  'sl-jlr': '经济利润', 'sl-pl': '排列组合', 'sl-gl': '概率问题', 'sl-rc': '容斥原理',
  'sl-jh': '几何问题', 'sl-zc': '整除秒杀'
}
