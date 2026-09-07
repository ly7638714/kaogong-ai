import { describe, it, expect } from 'vitest'
import { kpointOf, KP_RULES } from '../utils/kpointLib'

describe('kpointOf 考点惰性打标', () => {
  it('判断推理：图推/定义/类比/逻辑细分', () => {
    expect(kpointOf('判断推理', '从所给四个选项中选择最合适的一个填入问号处，图形呈对称规律')).toBe('图推·对称')
    expect(kpointOf('判断推理', '左边给定的是正方体的展开图，问哪一项可由其折叠而成')).toBe('图推·空间重构')
    expect(kpointOf('判断推理', '根据上述定义，下列属于正当防卫的是')).toBe('定义·要件分析')
    expect(kpointOf('判断推理', '与“军事演习：作战能力”逻辑关系最接近的是')).toBe('类比·语义逻辑')
    expect(kpointOf('判断推理', '以下哪项如果为真，最能削弱上述论证')).toBe('逻辑·削弱加强')
    expect(kpointOf('判断推理', '如果天下雨，那么地湿；地没有湿，能推出什么')).toBe('逻辑·翻译推理')
  })

  it('言语理解：填空/中心/语句/细节细分', () => {
    expect(kpointOf('言语理解', '依次填入横线处的词语，需与前后文语境呼应')).toBe('填空·语境')
    expect(kpointOf('言语理解', '填入画横线部分最恰当的一组成语是')).toBe('填空·成语')
    expect(kpointOf('言语理解', '这段文字主要想表达的是，然而现实中却恰恰相反')).toBe('中心·转折')
    expect(kpointOf('言语理解', '将以上几个句子重新排列，语序正确的是')).toBe('语句·排序')
    expect(kpointOf('言语理解', '根据这段文字，下列说法与原文相符的是')).toBe('细节·是非')
  })

  it('资料分析：增长/比重/平均数/倍数细分', () => {
    expect(kpointOf('资料分析', '2018年该省GDP同比增长率约为')).toBe('增长·增长率')
    expect(kpointOf('资料分析', '2019年第三产业增加值占GDP的比重比上年上升')).toBe('比重·两期比重')
    expect(kpointOf('资料分析', '2020年该市居民人均可支配收入约为')).toBe('平均数·均值')
    expect(kpointOf('资料分析', '2021年总量约是2015年的多少倍')).toBe('倍数·现期倍数')
  })

  it('数量/常识/政治复用题型分类并带科目前缀', () => {
    expect(kpointOf('数量关系', '一项工程甲单独完成需3小时')).toBe('数量关系·工程问题')
    expect(kpointOf('常识判断', '根据宪法，公民的基本权利包括')).toBe('常识判断·法律')
    expect(kpointOf('政治理论', '党的二十大报告指出')).toBe('政治理论·时政')
  })

  it('空/未知输入不抛错', () => {
    expect(kpointOf('', '')).toBe('·综合')
    expect(kpointOf('未知科目', '一段话')).toBe('未知科目·综合')
    expect(() => kpointOf('判断推理', '')).not.toThrow()
  })

  it('词典覆盖判断/言语/资料三科目', () => {
    expect(KP_RULES['判断推理'].length).toBeGreaterThan(5)
    expect(KP_RULES['言语理解'].length).toBeGreaterThan(5)
    expect(KP_RULES['资料分析'].length).toBeGreaterThan(4)
  })
})
