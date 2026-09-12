/* global atob */
// 真题库加载器：public/zhenti/*.json 按需加载（不进bundle）
// 数据来源：03_资料/5_真题套卷 28卷3583题（网友回忆版，无官方答案→AI判题）；收录不全持续补充
import { classifyZhentiType } from '../utils/zhentiType'

function decodeB64Utf8(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

// Web/PWA 用 fetch；Android 原生宿主的 file:// WebView 用 xcnative 直接读随包 assets，避免本地文件跨域失败。
async function readAssetText(rel) {
  const clean = String(rel || '').replace(/^\/+/, '')
  try {
    if (typeof window !== 'undefined' && window.xcnative && typeof window.xcnative.readAssetB64 === 'function') {
      const b64 = window.xcnative.readAssetB64(clean)
      if (b64 && String(b64).indexOf('ERR:') !== 0) return decodeB64Utf8(b64)
    }
  } catch (e) {}
  const r = await fetch('./' + clean, { cache: 'no-cache' })
  if (!r.ok) throw new Error('HTTP ' + r.status + '：' + clean)
  return await r.text()
}

export async function zhentiIndex() {
  return JSON.parse(await readAssetText('zhenti/index.json'))
}

// ===== 真题卷 id 兼容（2026-09 文件名英文化：副省级→fushu 等）=====
// 存量 localStorage/历史卷记录里可能存旧中文名 id；这里做 token 级名映射，
// zhentiPaper() 首次装载失败时自动用新名重试一次，旧数据无需迁移即可自愈。
const OLD_TO_NEW = [
  ['贵州省考', 'guizhou'],
  ['副省级', 'fushu'],
  ['地市级', 'dishi'],
  ['行政执法', 'xingzheng'],
  ['省考', 'shengkao']
]
export function normalizeZhentiId(id) {
  let s = String(id || '')
  for (const [old, nw] of OLD_TO_NEW) s = s.split(old).join(nw)
  return s
}
export async function zhentiPaper(id) {
  const raw = String(id || '')
  let txt = await readAssetText('zhenti/' + raw + '.json').catch(() => null)
  if (txt == null) {
    const mapped = normalizeZhentiId(raw)
    if (mapped !== raw) txt = await readAssetText('zhenti/' + mapped + '.json').catch(() => null)
  }
  if (txt == null) throw new Error('真题卷加载失败: ' + raw)
  return JSON.parse(txt)
}

// 真题题型 sidecar（规则打标结果；缺失时回退运行时分类）
export async function zhentiTypes() {
  const txt = await readAssetText('zhenti/types.json').catch(() => null)
  return txt ? JSON.parse(txt) : null
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
