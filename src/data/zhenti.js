// 真题库加载器：public/zhenti/*.json 按需加载（不进bundle）
// 数据来源：03_资料/5_真题套卷 28卷3583题（网友回忆版，无官方答案→AI判题）；收录不全持续补充
import { classifyZhentiType } from '../utils/zhentiType'
export async function zhentiIndex() {
  const r = await fetch('./zhenti/index.json')
  if (!r.ok) throw new Error('真题索引加载失败')
  return r.json()
}

export async function zhentiPaper(id) {
  const r = await fetch('./zhenti/' + id + '.json')
  if (!r.ok) throw new Error('真题卷加载失败: ' + id)
  return r.json()
}

// 真题题型 sidecar（规则打标结果；缺失时回退运行时分类）
export async function zhentiTypes() {
  const r = await fetch('./zhenti/types.json')
  if (!r.ok) return null
  return r.json()
}

// 真题记录 → ExamPanel items（板块筛选 + 材料继承：同材料组的后续题自动补齐【材料】块）
export function zhentiToItems(record, plates, limit, typesMap) {
  const items = []
  for (const [sec, qs] of Object.entries(record.sections || {})) {
    if (plates && plates.length && !plates.includes(sec)) continue
    let curMat = ''
    for (const q of qs) {
      let stem = q.stem
      const matM = stem.match(/【材料】([\s\S]*?)(?=\n|$)/)
      if (matM) curMat = matM[1]
      else if (curMat && !stem.includes('【材料】')) stem = '【材料】' + curMat + '\n' + stem
      const opts = q.opts.map((o) => {
        const m = o.match(/^([A-D])[.．、]\s*([\s\S]*)$/)
        return { k: m ? m[1] : o.slice(0, 1), t: (m ? m[2] : o).trim() }
      })
      items.push({
        subject: sec,
        difficulty: 'real',
        variant: '真题·' + (record.title || record.id).slice(0, 18),
        dir: '', dirText: '',
        stem: '【' + (record.year || '') + record.level + '真题】\n' + stem,
        options: opts,
        answer: '', // 真题回忆版无官方答案 → 作答后AI判题
        explain: '',
        designer: '',
        type: (typesMap && typesMap[String(q.n)]) || classifyZhentiType(sec, q.stem),
        picked: null, correct: null, timeout: false, err: false,
        zhenti: true, zhentiId: record.id,
        material: !!matM || !!curMat
      })
      if (limit && items.length >= limit) return items
    }
  }
  return items
}
