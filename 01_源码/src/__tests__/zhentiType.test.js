import { describe, it, expect } from 'vitest'
import { classifyZhentiType, ZHENTI_RULES } from '../utils/zhentiType'

describe('classifyZhentiType 真题题型规则分类', () => {
  it('六大科目均有规则覆盖且不抛错', () => {
    const subs = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']
    for (const s of subs) {
      expect(() => classifyZhentiType(s, '某题题干')).not.toThrow()
      expect(ZHENTI_RULES[s].length).toBeGreaterThan(0)
    }
  })

  it('判断推理：图形/定义/类比/逻辑', () => {
    expect(classifyZhentiType('判断推理', '从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定规律性：')).toBe('图形推理')
    expect(classifyZhentiType('判断推理', '根据上述定义，下列属于行政强制措施的是：')).toBe('定义判断')
    expect(classifyZhentiType('判断推理', '与“军事演习：作战能力”在逻辑关系上最相近的是：')).toBe('类比推理')
    expect(classifyZhentiType('判断推理', '踢皮球：互相推诿')).toBe('类比推理')
    expect(classifyZhentiType('判断推理', '以下哪项如果为真，最能削弱上述论证？')).toBe('逻辑判断')
    // 未命中 → 科目兜底逻辑判断
    expect(classifyZhentiType('判断推理', '甲乙丙丁四人参加比赛，每人报一个项目。')).toBe('逻辑判断')
  })

  it('言语理解：逻辑填空/语句/中心/细节/标题', () => {
    expect(classifyZhentiType('言语理解', '依次填入画横线部分最恰当的一组词语是：')).toBe('逻辑填空')
    expect(classifyZhentiType('言语理解', '填入画横线部分最恰当的一句是：')).toBe('语句填空')
    expect(classifyZhentiType('言语理解', '将以上6个句子重新排列，语序正确的是：')).toBe('语句排序')
    expect(classifyZhentiType('言语理解', '这段文字主要强调的是：')).toBe('中心理解')
    expect(classifyZhentiType('言语理解', '根据这段文字，下列说法正确的是：')).toBe('细节判断')
    expect(classifyZhentiType('言语理解', '最适合做这段文字标题的是：')).toBe('标题填入')
  })

  it('资料分析：综合判断/比重/增长/平均数/倍数/基期', () => {
    expect(classifyZhentiType('资料分析', '能够从上述资料中推出的是：')).toBe('综合判断')
    expect(classifyZhentiType('资料分析', '2019年，该省第三产业增加值占GDP的比重比上年：')).toBe('比重')
    expect(classifyZhentiType('资料分析', '2018年全国电化学储能电站年末总能量同比增长100%以上的年份有几个？')).toBe('增长')
    expect(classifyZhentiType('资料分析', '2017年该省居民人均可支配收入约为多少元？')).toBe('平均数')
    expect(classifyZhentiType('资料分析', '2015年我国钟表全行业产值约是2013年的多少倍？')).toBe('倍数')
    expect(classifyZhentiType('资料分析', '2016年该市粮食总产量在以下哪个范围？')).toBe('综合')
  })

  it('数量关系与常识/政治', () => {
    expect(classifyZhentiType('数量关系', '一项工程甲单独完成需要3小时，乙单独完成需要6小时，两人合作需要多久？')).toBe('工程问题')
    expect(classifyZhentiType('数量关系', '甲乙两地相距120公里，两车相向而行速度分别为40和60，多久相遇？')).toBe('行程问题')
    expect(classifyZhentiType('数量关系', '从5名同学中选2名参加比赛，有多少种选法？')).toBe('排列组合')
    expect(classifyZhentiType('常识判断', '根据《中华人民共和国宪法》，下列属于公民基本权利的是：')).toBe('法律')
    expect(classifyZhentiType('常识判断', '“七一勋章”获得者都来自人民，他们的事迹可学可做。')).toBe('政治')
    expect(classifyZhentiType('政治理论', '关于党的二十大报告，下列说法正确的是：')).toBe('时政')
  })

  it('空/异常输入不抛错并归综合', () => {
    expect(classifyZhentiType('', '')).toBe('综合')
    expect(classifyZhentiType('未知科目', '随便一段话')).toBe('综合')
    expect(classifyZhentiType('判断推理', '')).toBe('综合')
  })
})
