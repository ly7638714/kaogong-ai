import { describe, test, expect } from 'vitest'
import { CARDS, MEMORY, normalizePlate } from '../kb/cards-index'
import { retrieveCards, renderCards } from '../kb/retrieve'

describe('批次7·六板块技能卡（S1教学卡 + S6记忆词条）', () => {
  test('六板块全覆盖且每板块≥8张教学卡', () => {
    const plates = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']
    for (const p of plates) {
      const n = CARDS.filter((c) => c.plate === p).length
      expect(n, `${p} 教学卡不足`).toBeGreaterThanOrEqual(8)
    }
  })

  test('卡片结构完整：signs≥3/steps≥3/traps≥2/例题带答案与解析路径', () => {
    CARDS.forEach((c) => {
      expect(c.id, '缺id').toBeTruthy()
      expect(c.plate, `缺plate ${c.id}`).toBeTruthy()
      expect(c.type, `缺type ${c.id}`).toBeTruthy()
      expect(c.source, `缺来源标注 ${c.id}`).toBeTruthy()
      expect(c.signs.length, `${c.id} 识别特征不足`).toBeGreaterThanOrEqual(3)
      expect(c.steps.length, `${c.id} 步骤不足`).toBeGreaterThanOrEqual(3)
      expect(c.traps.length, `${c.id} 陷阱不足`).toBeGreaterThanOrEqual(2)
      expect(c.example, `${c.id} 缺例题`).toBeTruthy()
      expect(c.example.opts.length, `${c.id} 例题选项不足`).toBeGreaterThanOrEqual(2)
      expect(c.example.answer, `${c.id} 例题缺答案`).toBeTruthy()
      expect(c.example.path, `${c.id} 例题缺解析路径`).toBeTruthy()
    })
  })

  test('卡片id唯一', () => {
    const ids = CARDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('S6记忆词条每板块≥8条', () => {
    const plates = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']
    for (const p of plates) {
      expect(MEMORY.filter((m) => m.plate === p).length, `${p} 记忆词条不足`).toBeGreaterThanOrEqual(8)
    }
  })

  test('检索：板块归一化+信号词命中', () => {
    // 逻辑判断归一到判断推理
    const hit = retrieveCards('逻辑判断', '最能削弱上述结论 因果倒置')
    expect(hit.length).toBeGreaterThan(0)
    expect(hit[0].plate).toBe('判断推理')
    // 信号词命中拉平增长率
    const lp = retrieveCards('资料分析', '上半年增速10%下半年4%，全年拉平增长率')
    expect(lp.some((c) => c.type === '拉平增长率')).toBe(true)
    // 零命中返回空（不注入噪音）
    expect(retrieveCards('资料分析', '完全无关的问题内容').length).toBe(0)
  })

  test('v3.7.97 政治新卡检索冒烟', () => {
    const cases = [
      ['政治理论', '新发展理念中协调发展解决什么问题', '新发展理念五大理念对应'],
      ['政治理论', '新发展格局国内大循环为主体', '新发展格局双循环'],
      ['政治理论', '基本经济制度 两个毫不动摇', '基本经济制度三位一体'],
      ['政治理论', '新型城镇化以人为核心 首要任务', '新型城镇化与区域协调'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.7.98 求是100题新卡检索冒烟', () => {
    const cases = [
      ['政治理论', '科技强国五大要素有哪些', '科技强国五大要素'],
      ['政治理论', '文化强国 社会效益首位', '文化强国建设'],
      ['政治理论', '教育强国 立德树人', '教育强国建设'],
      ['政治理论', '人口高质量发展 少子化', '人口高质量发展'],
      ['常识判断', '九一八事变 抗战起点', '抗战胜利80周年'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.7.99 政治新卡检索冒烟（笔记4+求是续）', () => {
    const cases = [
      ['政治理论', '全过程人民民主 根本政治制度', '全过程人民民主与制度体系'],
      ['政治理论', '中华文明五千多年文明史', '文化强国与中华文明'],
      ['政治理论', '就业是民生之本 社会保障', '保障和改善民生'],
      ['政治理论', '促进民营经济健康发展 两个毫不动摇', '促进民营经济健康发展'],
      ['政治理论', '全国统一大市场 五统一', '纵深推进全国统一大市场'],
      ['政治理论', '守正创新 魂脉 根脉', '必须坚持守正创新'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.0 政治新卡检索冒烟（笔记5/6：从严治党/法治/教科人/国安/一国两制/强军）', () => {
    const cases = [
      ['政治理论', '全面从严治党 党的建设总要求', '全面从严治党与党的建设'],
      ['政治理论', '全面依法治国 总抓手', '全面依法治国法治体系'],
      ['政治理论', '教育科技人才 第一生产力', '教育科技人才战略'],
      ['政治理论', '总体国家安全观 政治安全为根本', '总体国家安全观排坑'],
      ['政治理论', '一国两制 九二共识', '一国两制与祖国完全统一'],
      ['政治理论', '强军目标 世界一流军队', '巩固国防与强军目标'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.1 马原新卡检索冒烟（真理/认识过程/唯物史观/商品货币/剩余价值）', () => {
    const cases = [
      ['政治理论', '真理是具体的 有条件的', '真理观排坑'],
      ['政治理论', '感性认识 理性认识 两次飞跃', '认识的辩证过程排坑'],
      ['政治理论', '社会存在 社会意识 相对独立性', '唯物史观排坑'],
      ['政治理论', '商品价值量 社会必要劳动时间', '商品价值量与货币职能'],
      ['政治理论', '剩余价值 不变资本 可变资本', '剩余价值理论'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.2 求是100题续新卡检索冒烟（民族共同体/对外开放/就业/八项规定）', () => {
    const cases = [
      ['政治理论', '中华民族共同体 民族区域自治', '中华民族共同体与民族区域自治'],
      ['政治理论', '高水平对外开放 制度型开放', '高水平对外开放'],
      ['政治理论', '促进高质量充分就业 结构性矛盾', '促进高质量充分就业'],
      ['政治理论', '中央八项规定 徙木立信', '中央八项规定与作风建设'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.3 常识新卡检索冒烟（遗址文物/盛世改革/战役典故/赋税/农作物水利）', () => {
    const cases = [
      ['常识判断', '良渚遗址 三星堆 殷墟', '古代文化遗址与文物'],
      ['常识判断', '文景之治 开皇之治 康乾盛世', '古代盛世与著名改革'],
      ['常识判断', '淝水之战 破釜沉舟 纸上谈兵', '古代战役与典故'],
      ['常识判断', '初税亩 两税法 摊丁入亩', '古代赋税制度演变'],
      ['常识判断', '占城稻 玉米 曲辕犁', '农作物引进与农耕水利'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.4 常识新卡检索冒烟（选官/党史/唐宋八大家/微观经济）', () => {
    const cases = [
      ['常识判断', '九品中正 军功爵 察举制', '古代选官制度演变'],
      ['常识判断', '中共一大 南昌起义 古田会议', '党史一大至古田会议'],
      ['常识判断', '唐宋八大家 韩愈 古文运动', '唐宋八大家与古文运动'],
      ['常识判断', '替代品 机会成本 GDP', '微观经济基础概念'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.5 常识新卡检索冒烟（诸子百家/力学/光学声学/天文）', () => {
    const cases = [
      ['常识判断', '孔子 孟子 孙子兵法 董仲舒', '诸子百家代表人物与著作'],
      ['常识判断', '惯性 超重失重 压强', '物理力学与超重失重'],
      ['常识判断', '光的反射 折射 红外线 超声波', '光学与声学常识'],
      ['常识判断', '太阳系 金星 极光 文昌', '天文太阳系与地理常识'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.6 求是2026新卡检索冒烟（四中全会十五五/六个坚持/内卷式竞争）', () => {
    const cases = [
      ['政治理论', '二十届四中全会 十五五规划', '二十届四中全会与十五五开局'],
      ['政治理论', '十五五 六个坚持 战略任务', '十五五六个坚持与战略任务'],
      ['政治理论', '内卷式竞争 全国统一大市场', '内卷式竞争与国内大循环'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.7 求是2026续新卡检索冒烟（经济工作八个坚持/内需消费/海洋经济）', () => {
    const cases = [
      ['政治理论', '2026年经济工作 八个坚持', '2026经济工作八个坚持'],
      ['政治理论', '内需主导 提振消费 两新政策', '2026内需主导与提振消费'],
      ['政治理论', '海洋经济 向海图强 五个更加注重', '推动海洋经济高质量发展'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.8 求是2026续新卡检索冒烟（实体经济/全民阅读/十五五实施）', () => {
    const cases = [
      ['政治理论', '做强做优做大实体经济 制造业', '做强做优做大实体经济'],
      ['政治理论', '全民阅读 书香社会', '推动全民阅读建设书香社会'],
      ['政治理论', '十五五规划实施 产业体系跃升', '十五五规划实施与产业体系跃升'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.9 常识新卡检索冒烟（化学生物/医学急救/计算机量子/通胀通缩）', () => {
    const cases = [
      ['常识判断', '酸雨 纯碱 可燃冰 无氧呼吸', '化学与生物常识'],
      ['常识判断', 'CT X光 中暑 催吐', '医学影像与急救生活常识'],
      ['常识判断', '计算机病毒 量子计算 九章 核能', '计算机与量子科技能源'],
      ['常识判断', '通货膨胀 通货紧缩 降准降息 人民币升值', '通胀通缩与货币政策'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.11 求是2026.03新卡检索冒烟（金融强国八个坚持/现代金融体系）', () => {
    const cases = [
      ['政治理论', '金融强国 金融服务实体经济', '金融强国建设与八个坚持'],
      ['政治理论', '现代金融体系 科技金融 绿色金融', '中国特色现代金融体系六体系'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.12 时政专题新卡检索冒烟（2026两会健康中国/中央一号文件）', () => {
    const cases = [
      ['政治理论', '2026年两会 健康中国 2035', '2026两会与健康中国'],
      ['政治理论', '2026年中央一号文件 千万工程', '2026中央一号文件'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.13 时政新卡检索冒烟（新年贺词/焦裕禄式县委书记/建党105周年）', () => {
    const cases = [
      ['政治理论', '2026年新年贺词 140万亿', '2026新年贺词与2025成就'],
      ['政治理论', '焦裕禄 县委书记 心中有党', '做焦裕禄式县委书记四有'],
      ['政治理论', '建党105周年 四大倡议', '建党105周年大会'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.14 三农时政新卡检索冒烟（中央农村工作会议/农业农村现代化十五五规划）', () => {
    const cases = [
      ['政治理论', '中央农村工作会议 两条底线', '2025中央农村工作会议'],
      ['政治理论', '农业农村现代化 十五五规划 1.45万亿斤', '加快农业农村现代化十五五规划'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.15 月半时政新卡检索冒烟（制造强国/党建思想）', () => {
    const cases = [
      ['政治理论', '制造强国 专精特新 战略性新兴产业', '制造强国与现代化产业体系'],
      ['政治理论', '全国党建工作座谈会 党建思想', '全国党建工作座谈会与习近平党建思想'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.16 月半时政新卡检索冒烟（创新指数/政绩观学习教育）', () => {
    const cases = [
      ['常识判断', '全球创新指数 百强创新集群', '全球创新指数排名'],
      ['政治理论', '正确政绩观 功成不必在我 学习教育', '树立和践行正确政绩观学习教育'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.17 月半时政新卡检索冒烟（经济举措/五年规划优势）', () => {
    const cases = [
      ['政治理论', '2026年经济 国际科技创新中心 零基预算', '2026经济创新改革开放举措'],
      ['政治理论', '五年规划 现代化产业体系 先进制造业', '五年规划优势与现代化产业体系'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.18 月半时政新卡检索冒烟（海洋经济细节/未来产业布局）', () => {
    const cases = [
      ['政治理论', '海洋经济 蓝色人才 蓝色金融', '海洋经济五个更加注重与六任务'],
      ['政治理论', '未来产业 量子科技 具身智能', '前瞻布局和发展未来产业'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.19 时政专题新卡检索冒烟（十五五建议指导思想/抗战战役会议）', () => {
    const cases = [
      ['政治理论', '十五五规划建议 指导思想 四个优势', '十五五规划建议指导思想与优势'],
      ['常识判断', '淞沪会战 台儿庄大捷 百团大战', '抗日战争战役会议与救亡运动'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.20 月半时政新卡检索冒烟（新型能源/服务业/教育科技人才）', () => {
    const cases = [
      ['政治理论', '新型能源体系 能源安全 风电光伏', '新型能源体系与能源安全'],
      ['政治理论', '服务业扩能提质 生产性服务业', '推进服务业扩能提质'],
      ['政治理论', '一体推进教育科技人才发展 职普融通', '一体推进教育科技人才发展'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.21 月半时政新卡检索冒烟（中央城市工作会议/干部担当）', () => {
    const cases = [
      ['政治理论', '中央城市工作会议 人民城市 城市更新', '中央城市工作会议与人民城市理念'],
      ['政治理论', '三个区分开来 担当作为 容错', '让愿担当敢担当善担当蔚然成风'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.22 月半时政新卡检索冒烟（金融强国六大要素）', () => {
    const cases = [
      ['政治理论', '金融强国 强大的货币 中央银行', '金融强国六大关键核心要素'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.23 月半时政新卡检索冒烟（十五五建议说明/扩大内需战略之举）', () => {
    const cases = [
      ['政治理论', '十五五规划建议说明 中等发达国家 两个同步', '关于十五五规划建议的说明'],
      ['政治理论', '扩大内需是战略之举 消费短板', '扩大内需是战略之举'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.24 月半时政新卡检索冒烟（自我革命五到位/新质生产力定义）', () => {
    const cases = [
      ['政治理论', '五个进一步到位 自我革命 治权', '党的自我革命五个进一步到位'],
      ['政治理论', '新质生产力 高科技高效能高质量', '因地制宜发展新质生产力'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.25 月半时政新卡检索冒烟（民族共同体五个相/全球四大倡议）', () => {
    const cases = [
      ['政治理论', '中华民族共同体 血脉相融 信念相同', '中华民族共同体五个相'],
      ['政治理论', '全球发展倡议 全球安全倡议 全球治理倡议', '全球四大倡议'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.26 求是新卡检索冒烟（进出口平衡发展）', () => {
    const cases = [
      ['政治理论', '进出口平衡发展 出口和进口并重', '推动进出口平衡发展'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.27 求是新卡检索冒烟（以苦练内功应对外部挑战）', () => {
    const cases = [
      ['政治理论', '苦练内功 应对外部挑战 五个必须', '以苦练内功应对外部挑战'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.28 求是新卡检索冒烟（法治体系五大体系）', () => {
    const cases = [
      ['政治理论', '法律规范体系 法治实施体系 党内法规体系', '中国特色社会主义法治体系五大体系'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.29 求是新卡检索冒烟（涉外法治与高水平开放安全并重）', () => {
    const cases = [
      ['政治理论', '涉外法治 统筹开放与安全 制度型开放', '涉外法治与高水平开放安全并重'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.30 求是新卡检索冒烟（新时代人文经济学）', () => {
    const cases = [
      ['政治理论', '人文经济学 物质文明和精神文明', '新时代人文经济学'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.31 判断新卡检索冒烟（二句式搭桥方向）', () => {
    const cases = [
      ['判断推理', '前重复 后重复 搭桥方向 二句式', '二句式搭桥方向'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.32 言语新卡检索冒烟（三层分析法）', () => {
    const cases = [
      ['言语理解', '三层分析 背景层 论点层 展开层', '三层分析法'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.33 言语新卡检索冒烟（错误选项八大陷阱）', () => {
    const cases = [
      ['言语理解', '概念偷换 范围错位 时态混乱 强加比较', '错误选项八大陷阱'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.34 言语新卡检索冒烟（意图判断推一步/解释关系）', () => {
    const cases = [
      ['言语理解', '意图判断 推一步 解释关系 例子跳过', '意图判断推一步与解释关系'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.35 求是新卡检索冒烟（预期管理与稳预期）', () => {
    const cases = [
      ['政治理论', '预期管理 稳预期 消费需求短板', '预期管理与稳预期'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.36 求是新卡检索冒烟（法治价值论）', () => {
    const cases = [
      ['政治理论', '法治价值 公平正义 民为邦本', '法治价值论'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.37 求是新卡检索冒烟（全国服务业大会）', () => {
    const cases = [
      ['政治理论', '全国服务业大会 服务业优质高效 需求牵引', '全国服务业大会与服务业优质高效发展'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.38 言语新卡检索冒烟（陷阱识别三技巧）', () => {
    const cases = [
      ['言语理解', '关键词比对 绝对词敏感 时态标注', '陷阱识别三技巧'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.39 求是新卡检索冒烟（旅游强国与2026春节旅游）', () => {
    const cases = [
      ['政治理论', '旅游强国 春节旅游 出游人次', '旅游强国与2026春节旅游'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.40 求是新卡检索冒烟（哲学社会科学自主知识体系）', () => {
    const cases = [
      ['政治理论', '自主知识体系 两个结合 魂脉根脉', '构建中国哲学社会科学自主知识体系'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.41 求是新卡检索冒烟（现代化产业体系四化趋势）', () => {
    const cases = [
      ['政治理论', '产业体系整体跃升 智能化 集群化 大而不强', '现代化产业体系四化趋势'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.42 求是新卡检索冒烟（以县城为重要载体的城镇化建设）', () => {
    const cases = [
      ['政治理论', '县城城镇化 职业非农化 生活市民化 城尾乡头', '以县城为重要载体的城镇化建设'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.43 求是新卡检索冒烟（数字产业高质量发展）', () => {
    const cases = [
      ['政治理论', '数字产业 人工智能 开源 智造智服', '数字产业高质量发展'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.44 求是新卡检索冒烟（人工智能产业发展挑战）', () => {
    const cases = [
      ['政治理论', '人工智能产业 算力封锁 大模型 齿轮错位', '人工智能产业发展挑战'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.45 求是新卡检索冒烟（思想政治工作条例与基本功）', () => {
    const cases = [
      ['政治理论', '思想政治工作 生命线 政治定力 精准滴灌', '思想政治工作条例与基本功'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.46 求是新卡检索冒烟（促进房地产市场止跌回稳）', () => {
    const cases = [
      ['政治理论', '房地产市场 止跌回稳 四个取消', '促进房地产市场止跌回稳'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.47 判断新卡检索冒烟（数独拉丁方阵三武器）', () => {
    const cases = [
      ['判断推理', '拉丁方阵 数独 唯一排列法 候选数法', '数独拉丁方阵三武器'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.48 判断新卡检索冒烟（分组型推理类条件三操作）', () => {
    const cases = [
      ['判断推理', '推理类条件 顺肯 逆否 反证', '分组型推理类条件三操作'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.49 判断新卡检索冒烟（一拖五答题时间策略）', () => {
    const cases = [
      ['判断推理', '一拖五 答题时间 代入排除 综合题', '一拖五答题时间策略'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.50 判断新卡检索冒烟（一拖五五大条件一步推理）', () => {
    const cases = [
      ['判断推理', '确定类 顺序类 绑定类 隔离类 一步推理', '五大条件一步推理'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.51 判断新卡检索冒烟（标准分组反证法）', () => {
    const cases = [
      ['判断推理', '标准分组 反证 名额凑不满 公共结论', '标准分组反证法'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.52 求是新卡检索冒烟（十五五绿色低碳转型）', () => {
    const cases = [
      ['政治理论', '绿色低碳转型 碳达峰 双控 两高', '十五五绿色低碳转型'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.53 求是新卡检索冒烟（统筹发展和安全与经济安全）', () => {
    const cases = [
      ['政治理论', '统筹发展和安全 经济安全 战略物资 产供储销', '统筹发展和安全与经济安全'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.54 求是新卡检索冒烟（人工智能产业体系化协同战）', () => {
    const cases = [
      ['政治理论', '人工智能+ 算力券 耐心资本 数据油田', '人工智能产业体系化协同战'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.55 数量新卡检索冒烟（涂色计数/空瓶换酒轮流取物）', () => {
    const cases = [
      ['数量关系', '正方体涂色 至少一面涂色', '正方体涂色计数'],
      ['数量关系', '空瓶换酒 轮流取物 必胜策略', '空瓶换酒与轮流取物'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.56 数量新卡检索冒烟（数字推理五法：多级差/分数反约分/分组/幂次修正/递推倍数修正）', () => {
    const cases = [
      ['数量关系', '数字推理 单调递增 逐项作差 二级等差', '多级差与作商'],
      ['数量关系', '分数数列 分子分母 反约分 质数列', '分数数列反约分'],
      ['数量关系', '带小数点 根号 左右分组 数列', '分组数列'],
      ['数量关系', '幂次附近 平方加1 尾数法', '幂次修正数列'],
      ['数量关系', '数列 递推 倍数关系 前后两项 混合运算', '递推倍数修正'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('渲染输出包含核心要素且无异常', () => {
    const cards = retrieveCards('常识判断', '2026年中央经济工作会议 货币政策')
    const out = renderCards(cards)
    expect(out).toContain('方法卡')
    expect(out).toContain('识别')
    expect(out).toContain('步骤')
  })

  test('v3.8.57 数量关系新卡检索冒烟（经济利润最佳定价/统筹线性规划）', () => {
    const cases = [
      ['数量关系', '经济利润 最佳定价 收入最大 二次函数顶点', '经济利润·最佳定价'],
      ['数量关系', '统筹规划 线性规划 共用设备 最大利润 优先排产', '统筹规划·线性规划'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('v3.8.58 数量关系·浓度进阶检索冒烟（线段混合/反复倒水）', () => {
    const cases = [
      ['数量关系', '浓度 线段混合 浓度距离比 质量反比 十字交叉', '浓度·线段混合'],
      ['数量关系', '浓度 反复倒水 重复稀释 浓度衰减 乘方', '浓度·反复倒水置换'],
    ]
    for (const [plate, q, expectType] of cases) {
      const hits = retrieveCards(plate, q, 3).map((c) => c.type)
      expect(hits.some((t) => t.includes(expectType)), `问法「${q}」应命中「${expectType}」，实际：${hits.join('/')}`).toBe(true)
    }
  })

  test('板块别名归一化', () => {
    expect(normalizePlate('逻辑判断')).toBe('判断推理')
    expect(normalizePlate('图形推理')).toBe('判断推理')
    expect(normalizePlate('片段阅读')).toBe('言语理解')
    expect(normalizePlate('未知板块')).toBe('未知板块')
  })
})
