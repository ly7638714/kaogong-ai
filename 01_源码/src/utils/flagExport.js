// flagExport.js —— 疑题反馈清单导出（深化）：Markdown 详情 / CSV(带 BOM，Excel 双击不乱码)
import { listFlagged } from './flaggedQuestions'

function qs(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 80) }
function dstr(t) { try { return new Date(Number(t) || 0).toLocaleString('zh-CN', { hour12: false }) } catch (e) { return '' } }
function csvCell(v) { const s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/"/g, '""'); return '"' + s + '"' }

export function flaggedToCsv(list) {
  const l = Array.isArray(list) ? list : listFlagged()
  const head = ['上报时间', '板块', '考点', '题型', '备注', '题干(截断)', '答案']
  const rows = l.map((x) => [
    dstr(x.t), x.plate || '', x.kpoint || '', x.variant || '', String(x.note || '').slice(0, 40), qs(x.question), String(x.answer || '').slice(0, 20)
  ].map(csvCell).join(','))
  return '\uFEFF' + head.join(',') + '\n' + (rows.length ? rows.join('\n') + '\n' : '')
}

export function flaggedToMd(list) {
  const l = Array.isArray(list) ? list : listFlagged()
  const rows = l.map((x, i) => {
    const why = String(x.note || '').slice(0, 40)
    const q = qs(x.question)
    const stTag = x.status === 'confirmed' ? ' · [已确认问题]' : x.status === 'dismissed' ? ' · [误报]' : ''
    return (i + 1) + '. 【' + (x.plate || '未分类') + '】' + (x.kpoint || x.variant || '综合') + ' — ' + why + stTag +
      (q ? '\n   > ' + q : '') +
      (x.answer ? '（答案 ' + String(x.answer).slice(0, 20) + '）' : '') +
      ' · ' + dstr(x.t)
  })
  return ['# 疑题反馈清单（已自动降权）', '', ...rows, '', '共 ' + l.length + ' 条'].join('\n')
}
