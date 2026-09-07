// anchorSet.js —— 锚点题读取（35号批次4-B）
// 数据：src/data/anchorSet.json（构建脚本 scripts/buildAnchorSet.mjs，真题固定抽样、永不更换）
// 用途：单人纵向 θ 的绝对校正（doc 35 §3.3）与「我进步了多少」的可信自测——锚点题=固定真题，
//       作答结果构成与 b 无关的纯能力观测序列。真实调用方（锚点自测 UI）待累计数据到位后接入。
import anchorData from './anchorSet.json'

export const ANCHOR_META = (anchorData && anchorData._meta) || {}
// 某板块固定 10 道锚点：[{ paper, n }]
export function anchorsOf(plate) {
  return (anchorData && anchorData.anchors && anchorData.anchors[plate]) || []
}
// 全部板块锚点（flat）
export function allAnchors() {
  const out = []
  Object.keys((anchorData && anchorData.anchors) || {}).forEach((pl) => {
    anchorsOf(pl).forEach((a) => out.push({ plate: pl, paper: a.paper, n: a.n }))
  })
  return out
}
export default { anchorsOf, allAnchors, ANCHOR_META }
