// zlGen.js —— 资料分析·构建性本地生成器（深化(A)：确定性覆盖资料，答案程序重算）
// 单题快练自由练用：短材料自洽 + 公式可算唯一解 + 选项来自典型错解；零 AI、零额度、可进 deterministicGate 门禁。

const PCT = [5, 10, 20, 25, 40, 50]
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))
const pick = (a) => a[Math.floor(Math.random() * a.length)]
function shuffle4(a, correct) {
  const idx = [0, 1, 2, 3]
  for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
  return { opts: idx.map((i) => a[i]), answer: 'ABCD'[idx.indexOf(correct)] }
}
function mkOptions(correct, wrongs) {
  const set = new Set([String(correct)])
  ;(wrongs || []).forEach((w) => { if (w != null && String(w) !== String(correct)) set.add(String(w)) })
  let guard = 0
  while (set.size < 4 && guard++ < 12) set.add(String(Number(correct) + 10 + guard * 7)) // 兜底补唯一干扰
  const arr = [...set].slice(0, 4)
  const correctIdx = arr.indexOf(String(correct))
  if (correctIdx < 0 || arr.length !== 4 || new Set(arr).size !== 4) return null
  return shuffle4(arr, correctIdx)
}

const GENS = [
  // 增长率：给定基期与增量，增速=增量/基期（构造保证 pct 整数）
  () => {
    const pct = pick(PCT)
    const m = 3 + Math.floor(Math.random() * 7)
    const base = (100 / pct) * m
    const cur = base + m;
    const wrong = [m + '%', pct - 1 + '%', (pct + 10) + '%', Math.round((m / cur) * 100) + '%'];
    const o = mkOptions(pct + '%', wrong);
    return {
      stem: '某市2024年粮食产量 ' + fmt(base) + ' 万吨，2025年为 ' + fmt(cur) + ' 万吨，比上年增加 ' + m + ' 万吨。2025年产量同比增长约（　）。',
      opts: o.opts, answer: o.answer,
      explain: '增速=增量/基期=' + m + '/' + fmt(base) + '=' + pct + '%。',
      cardId: 'zl-zz', variant: '本地题库'
    };
  },
  // 增长量：给定基期与增速求增量
  () => {
    const pct = pick(PCT)
    const m = 3 + Math.floor(Math.random() * 7)
    const base = (100 / pct) * m;
    const wrong = [Math.round((base * (pct + 1)) / 100) + '', pct + '', (m + 1) + '', m * 2 + ''];
    const o = mkOptions(m + '', wrong);
    return {
      stem: '某省2024年社会消费品零售总额 ' + fmt(base) + ' 亿元，2025年同比增长 ' + pct + '%。2025年零售总额比上年增加约（　）亿元。',
      opts: o.opts, answer: o.answer,
      explain: '增量=基期×增速=' + fmt(base) + '×' + pct + '%=' + m + ' 亿元。',
      cardId: 'zl-zzl', variant: '本地题库'
    };
  },
  // 比重：部分占整体
  () => {
    const p = [15, 25, 30, 40, 45, 60][Math.floor(Math.random() * 6)];
    const m = 2 + Math.floor(Math.random() * 8);
    const total = (100 / p) * m;
    const part = (total * p) / 100;
    const wrong = [(total - part) + '', (part + 1) + '', Math.round((part / (total - part)) * 100) + '%', (100 - p) + '%'];
    const o = mkOptions(p + '%', wrong);
    return {
      stem: '2025年某企业营业收入 ' + fmt(total) + ' 万元，其中出口收入 ' + fmt(part) + ' 万元。出口收入占营业收入的比重约（　）。',
      opts: o.opts, answer: o.answer,
      explain: '比重=部分/整体=' + fmt(part) + '/' + fmt(total) + '=' + p + '%。',
      cardId: 'zl-bz', variant: '本地题库'
    };
  },
  // 平均数：总量/个数
  () => {
    const n = [3, 4, 5, 6][Math.floor(Math.random() * 4)];
    const per = 2 + Math.floor(Math.random() * 6);
    const total = n * per;
    const wrong = [total + '', (per + 1) + '', (n + per) + '', Math.round((per / n) * 100) / 10 + ''];
    const o = mkOptions(per + '', wrong);
    return {
      stem: '某社区' + n + '个采样点共回收问卷 ' + total + ' 份。平均每个采样点回收问卷约（　）份。',
      opts: o.opts, answer: o.answer,
      explain: '平均数=总量/个数=' + total + '/' + n + '=' + per + ' 份。',
      cardId: 'zl-pj', variant: '本地题库'
    };
  },
  // 倍数：现期/基期 = 整数倍（构造保证整除）
  () => {
    const f = [2, 3, 4, 5, 6][Math.floor(Math.random() * 5)];
    const base = 10 + Math.floor(Math.random() * 8) * 10;
    const cur = base * f;
    const wrong = [f - 1, f + 1, Math.round(((cur + base) / base) * 10) / 10, f * 10].map(String);
    const o = mkOptions(f + '', wrong);
    return {
      stem: '某市2024年一般公共预算收入 ' + base + ' 亿元，2025年为 ' + cur + ' 亿元。2025年收入是2024年的（　）倍。',
      opts: o.opts, answer: o.answer,
      explain: '倍数=现期/基期=' + cur + '/' + base + '=' + f + ' 倍（即增长 ' + (f - 1) + ' 倍）。',
      cardId: 'zl-bs', variant: '本地题库'
    };
  },
  // 隔年复合增长：(1+p1%)×(1+p2%)-1（利率对取整数结果组合）
  () => {
    const pair = pick([[20, 25], [10, 20], [50, 50], [40, 25], [50, 20], [10, 50]]);
    const p1 = pair[0], p2 = pair[1];
    const comp = Math.round(((1 + p1 / 100) * (1 + p2 / 100) - 1) * 100);
    const wrong = [p1 + p2, p2, p1, comp + 5].map(String);
    const o = mkOptions(comp + '%', wrong);
    return {
      stem: '某商品2025年价格同比增长 ' + p1 + '%，2026年又同比增长 ' + p2 + '%（均相对上年）。2026年价格较2024年增长约（　）%。',
      opts: o.opts, answer: o.answer,
      explain: '隔年复合增速=(1+' + p1 + '%)×(1+' + p2 + '%)−1=' + comp + '%。',
      cardId: 'zl-gn', variant: '本地题库'
    };
  },
  // 乘积增长率：总量=甲×乙，甲增速 a%、乙增速 b% → 总量增速 (1+a%)(1+b%)-1（利率对取整数结果组合）
  () => {
    const pair = pick([[20, 25], [10, 20], [50, 50], [40, 25], [50, 20], [10, 50]]);
    const a = pair[0], b = pair[1];
    const r = Math.round(((1 + a / 100) * (1 + b / 100) - 1) * 100);
    const wrong = [a + b, a, b, r + 10].map(String);
    const o = mkOptions(r + '%', wrong);
    return {
      stem: '某地 2024 年冬小麦播种面积为 400 万亩、亩产 500 公斤。2025 年播种面积同比增长 ' + a + '%，亩产同比增长 ' + b + '%（其他因素忽略）。2025 年该地小麦总产量同比增长约（　）%。',
      opts: o.opts, answer: o.answer,
      explain: '总产量=面积×亩产 ⇒ 增速=(1+' + a + '%)×(1+' + b + '%)−1=' + r + '%。',
      cardId: 'zl-cjzl', variant: '本地题库'
    };
  },
  // 两期比重差（方向判断）：部分增速 vs 整体增速 → 比重较上年 升/降（唯一解方向题）
  () => {
    let a = pick([-10, -5, 5, 10, 15, 20, 25, 30]);
    let b = pick([-8, -3, 0, 3, 6, 8, 12, 15, 18]);
    if (a === b) b = a > 5 ? a - 6 : a + 6;
    const dir = a > b ? '上升' : '下降';
    const o = mkOptions(dir, ['不变', '无法判断', a > b ? '下降' : '上升']);
    return {
      stem: '某市规模以上工业中，新能源汽车产业增加值 2025 年同比增长 ' + a + '%，同期该市规模以上工业增加值同比增长 ' + b + '%。则新能源汽车产业占该市规模以上工业增加值的比重较上年同期（　）。',
      opts: o.opts, answer: o.answer,
      explain: '比重变化方向看部分增速与整体增速：' + a + '% vs ' + b + '% ⇒ ' + dir + '。',
      cardId: 'zl-bzbj', variant: '本地题库'
    };
  },
  // 平均数增长率：总量增速 a%、个数增速 b% → 平均指标增速 (1+a%)/(1+b%)-1（保留 1 位小数）
  () => {
    const a = pick([12, 15, 20, 25, 30]);
    const b = pick([5, 6, 8, 10].filter((x) => x < a));
    const r = Math.round(((1 + a / 100) / (1 + b / 100) - 1) * 1000) / 10;
    const wrong = [Math.round(a - b), a, b, Math.round((r + 8) * 10) / 10].map(String);
    const o = mkOptions(r + '%', wrong);
    return {
      stem: '某港口 2025 年货物贸易总额同比增长 ' + a + '%，同期货物吞吐量同比增长 ' + b + '%。则该港口平均每吨货物的贸易额同比增速约为（　）。',
      opts: o.opts, answer: o.answer,
      explain: '平均数增速=(1+总额增速)/(1+量增速)−1=(1+' + a + '%)/(1+' + b + '%)−1≈' + r + '%。',
      cardId: 'zl-pjszl', variant: '本地题库'
    };
  }
];

export function genZlQuestion(_seed) {
  for (let i = 0; i < 8; i++) {
    try {
      const q = GENS[Math.floor(Math.random() * GENS.length)]();
      if (q && Array.isArray(q.opts) && q.opts.length === 4 && new Set(q.opts).size === 4 && /^[A-D]$/.test(q.answer)) {
        return { ...q, options: q.opts.map((x, i) => ({ k: 'ABCD'[i], t: String(x) })), opts: undefined }
      }
    } catch (e) { /* 换下一个 */ }
  }
  return null;
}

export default { genZlQuestion }