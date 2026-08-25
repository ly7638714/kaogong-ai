import { describe, it, expect } from 'vitest'
import { detectBanKuai } from '../api/detect'

describe('detectBanKuai 板块识别', () => {
  it('识别政治理论', () => {
    expect(detectBanKuai('深入贯彻二十大精神')).toBe('政治理论')
    expect(detectBanKuai('下列属于习近平新时代中国特色社会主义思想内容的是')).toBe('政治理论')
  })
  it('识别常识判断', () => {
    expect(detectBanKuai('二十四节气中的大雪发生在几月')).toBe('常识判断')
    expect(detectBanKuai('下列关于宪法的说法正确的是')).toBe('常识判断')
  })
  it('识别定义判断', () => {
    expect(detectBanKuai('根据上述定义，下列属于行政垄断的是')).toBe('定义判断')
  })
  it('识别类比推理', () => {
    expect(detectBanKuai('医生对于手术相当于律师对于（ ）')).toBe('类比推理')
  })
  it('识别判断推理', () => {
    expect(detectBanKuai('最能削弱上述论证的是')).toBe('判断推理')
    expect(detectBanKuai('由此可以推出')).toBe('判断推理')
  })
  it('识别言语理解', () => {
    expect(detectBanKuai('这段文字意在说明')).toBe('言语理解')
    expect(detectBanKuai('填入划线处最恰当的成语是')).toBe('言语理解')
  })
  it('识别图形推理', () => {
    expect(detectBanKuai('请找出图形呈现的规律')).toBe('图形推理')
  })
  it('识别资料分析', () => {
    expect(detectBanKuai('2023年同比增长率是多少')).toBe('资料分析')
  })
  it('识别数量关系', () => {
    expect(detectBanKuai('甲乙合作完成工程需要几天')).toBe('数量关系')
    expect(detectBanKuai('概率是多少')).toBe('数量关系')
  })
  it('无法识别返回空字符串', () => {
    expect(detectBanKuai('你好')).toBe('')
    expect(detectBanKuai('')).toBe('')
    expect(detectBanKuai(null)).toBe('')
    expect(detectBanKuai(undefined)).toBe('')
  })
})
