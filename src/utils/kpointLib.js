// utils/kpointLib.js —— 考点词典（判断/言语/资料细粒度；数量/常识/政治复用题型分类）
// 用途：统计页「细分题型 → 考点」下钻；读取时计算（惰性），不改存储结构。
import { classifyZhentiType, ZHENTI_RULES } from './zhentiType'

const KP_RULES = {
  '判断推理': [
    ['图推·对称', /对称/],
    ['图推·空间重构', /展开图|正方体|立体图形|折叠|截面/],
    ['图推·数量类', /封闭|笔画|线条|交点/],
    ['图推·位置样式', /平移|旋转|翻转|叠加|遍历/],
    ['定义·要件分析', /定义/],
    ['类比·语义逻辑', /语义|近义|反义|逻辑关系|最为接近/],
    ['逻辑·削弱加强', /削弱|加强|支持|质疑/],
    ['逻辑·翻译推理', /如果|只有|除非|且|或|不[^\n]{0,4}不/],
    ['逻辑·真假话', /真假|只有.{0,8}(真|假)/],
    ['逻辑·分析推理', /排列|匹配|对应|每个人都|每人|比赛|分配/]
  ],
  '言语理解': [
    ['填空·语境', /语境|呼应|对应|照应/],
    ['填空·成语', /成语/],
    ['填空·词语搭配', /搭配|实词|词语/],
    ['中心·转折', /但|然而|不过|可是|却/],
    ['中心·因果', /因此|所以|导致|使得/],
    ['中心·总分', /首先|其次|最后|一方面|另一方面/],
    ['中心·并列', /同时|此外|也|还/],
    ['语句·排序', /排序|语序/],
    ['语句·衔接', /衔接|横线/],
    ['细节·是非', /正确|错误|相符|不符/],
    ['标题·提炼', /标题/]
  ],
  '资料分析': [
    ['增长·增长率', /增长率|增速|增幅|同比增长率/],
    ['增长·增长量', /增长量|增加(了|多|少)|减少/],
    ['增长·基期', /基期|上年同期|上一年/],
    ['比重·两期比重', /比重.{0,12}(上升|下降|高|低)/],
    ['比重·现期比重', /占.{0,20}比重|占比/],
    ['平均数·均值', /平均|人均|每/],
    ['倍数·现期倍数', /倍数|多少倍|几倍/],
    ['综合·判断', /推出|正确|错误/]
  ]
}

function norm(s) {
  return String(s || '').replace(/\s+/g, '')
}

export function kpointOf(subject, text) {
  const t = norm(text)
  if (!t) return (subject || '') + '·综合'
  if (subject === '数量关系' || subject === '常识判断' || subject === '政治理论') {
    return subject + '·' + classifyZhentiType(subject, t)
  }
  const rules = KP_RULES[subject] || []
  for (const [kp, re] of rules) {
    if (re.test(t)) return kp
  }
  return (subject || '') + '·综合'
}

// —— 35号批次1-A：考点枚举（供 AI 出题 prompt 取值约束 / 后续下拉框）——
// 细粒度覆盖三大板块（判断/言语/资料沿用 KP_RULES 词表）；数量/常识/政治复用真题题型词表；
// 兜底恒含「<板块>·综合」，保证 prompt 永远给得出合法取值。
function buildEnums() {
  const enums = {}
  Object.keys(KP_RULES).forEach((plate) => {
    enums[plate] = KP_RULES[plate].map(([kp]) => kp)
  })
  Object.keys(ZHENTI_RULES).forEach((plate) => {
    if (!enums[plate]) enums[plate] = ZHENTI_RULES[plate].map(([type]) => plate + '·' + type)
  })
  // 判断推理四子板块沿用主板块的细粒度词表（AI 自标可输出 图推·对称 / 逻辑·削弱加强 风格），避免只给「·综合」
  ;['图形推理', '定义判断', '类比推理', '逻辑判断'].forEach((sub) => {
    enums[sub] = (enums['判断推理'] || []).slice()
  })
  return enums
}
const KPOINT_ENUM = buildEnums()

export function kpointEnum(plate) {
  const list = (KPOINT_ENUM[plate] || []).slice()
  const fallback = String(plate || '') + '·综合'
  if (!list.includes(fallback)) list.push(fallback)
  return list
}
// 生成 prompt 用枚举文本（同板块以「/」分隔）
export function kpointEnumText(plate) {
  return kpointEnum(plate).join(' / ')
}

export { KP_RULES, KPOINT_ENUM }
