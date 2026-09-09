// buildKpointFreq.mjs —— 生成 src/data/kpointFreq.json（35号批次2-B 产物，构建期一次性）
// 数据源：public/zhenti/types.json 的 summary（真题题型分类汇总，33 卷 3800+ 题）。
// 思路：把真题分类粒度（zhentiType）经「变体别名映射」折算到出题变体（SUB_VARIANTS）权重，
//       使组卷时卷面名额 ≈ 真题考频基准（35 §2 主线三）。无法细分的板块（判断四子板块/资料/政治）
//       不出现在产物里 → 运行时退化为板块内均匀（仍优于旧实现里的一轮随机全覆盖）。
// 口径说明（如实记录，勿当精确统计）：片段阅读在真题分类里归入「中心理解」，
//       故中心/意图按 65/35 近似拆分（真实国考中意图占比略低）；其余一一对应。
import { readFile, writeFile } from 'node:fs/promises'
const ROOT = new URL('../', import.meta.url)
const TYPES = JSON.parse(await readFile(new URL('public/zhenti/types.json', ROOT), 'utf8'))
const S = TYPES.summary || {}
const t = (plate, type) => ((S[plate] && S[plate][type]) || 0)
const subjectTotal = (plate) => Object.values(S[plate] || {}).reduce((a, b) => a + b, 0)

const splitFreq = (total, parts) => {
  const r = {}
  let used = 0
  parts.forEach(([name, ratio], i) => {
    const v = i === parts.length - 1 ? total - used : Math.round(total * ratio)
    used += v
    r[name] = v
  })
  return r
}
const center = t('言语理解', '中心理解')
const yanyu = {
  ...splitFreq(center, [['中心理解', 0.65], ['意图判断', 0.35]]),
  逻辑填空: t('言语理解', '逻辑填空'),
  标题填入: t('言语理解', '标题填入'),
  细节判断: t('言语理解', '细节判断'),
  语句排序: t('言语理解', '语句排序'),
  语句填空: t('言语理解', '语句填空')
}
const shuliang = {
  工程问题: t('数量关系', '工程问题'),
  行程问题: t('数量关系', '行程问题'),
  排列组合: t('数量关系', '排列组合'),
  概率问题: t('数量关系', '概率'),
  利润问题: t('数量关系', '利润问题'),
  容斥问题: t('数量关系', '容斥')
}
const changshi = {
  时政: t('常识判断', '政治'),
  法律常识: t('常识判断', '法律'),
  科技常识: t('常识判断', '科技'),
  人文历史: t('常识判断', '人文历史'),
  地理常识: t('常识判断', '地理'),
  经济常识: t('常识判断', '经济')
}
const out = {
  _meta: {
    source: 'public/zhenti/types.json summary（真题题型分类汇总）',
    note: '变体别名折算产物；中心/意图按 65/35 拆分；仅收录可折算板块，其余运行时均匀基准',
    subjectTotal: { '言语理解': subjectTotal('言语理解'), '数量关系': subjectTotal('数量关系'), '常识判断': subjectTotal('常识判断') },
    generatedAt: new Date().toISOString().slice(0, 10)
  },
  言语理解: yanyu,
  数量关系: shuliang,
  常识判断: changshi
}
await writeFile(new URL('src/data/kpointFreq.json', ROOT), JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log('written src/data/kpointFreq.json', JSON.stringify(out).length)
