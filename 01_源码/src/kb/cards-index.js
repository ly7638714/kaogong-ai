// 批次7·技能卡索引：汇总六板块 S1教学卡 + S6记忆词条
import { CARDS as PD_CARDS, MEMORY as PD_MEM } from './cards-panduan'
import { CARDS as YY_CARDS, MEMORY as YY_MEM } from './cards-yanyu'
import { CARDS as ZL_CARDS, MEMORY as ZL_MEM } from './cards-ziliao'
import { CARDS as SL_CARDS, MEMORY as SL_MEM } from './cards-shuliang'
import { CARDS as CS_CARDS, MEMORY as CS_MEM } from './cards-changshi'
import { CARDS as ZZ_CARDS, MEMORY as ZZ_MEM } from './cards-zhengzhi'

export const CARDS = [...PD_CARDS, ...YY_CARDS, ...ZL_CARDS, ...SL_CARDS, ...CS_CARDS, ...ZZ_CARDS]
export const MEMORY = [...PD_MEM, ...YY_MEM, ...ZL_MEM, ...SL_MEM, ...CS_MEM, ...ZZ_MEM]

// 板块别名：detectBanKuai 输出 → 卡片 plate
export const PLATE_ALIAS = {
  判断推理: '判断推理', 逻辑判断: '判断推理', 论证推理: '判断推理', 形式逻辑: '判断推理', 分析推理: '判断推理',
  图形推理: '判断推理', 类比推理: '判断推理', 定义判断: '判断推理',
  言语理解: '言语理解', 逻辑填空: '言语理解', 片段阅读: '言语理解',
  资料分析: '资料分析',
  数量关系: '数量关系',
  常识判断: '常识判断', 常识: '常识判断',
  政治理论: '政治理论'
}

export function normalizePlate(plate) {
  return PLATE_ALIAS[plate] || plate
}
