// examData.js —— ExamPanel 数据外置（批次6B R3 首步）：试卷模板/子题型变体/问法题库（纯数据）
// 自 ExamPanel.vue 纯移动，未改动

export const TEMPLATES = [
  {
    id: 'gk_fj', name: '国考·副省级', total: 135, mins: 120, tag: '2025新大纲',
    note: '政治20+常识15+言语30+数量15+判断35(图推10/定义10/类比5/逻辑10)+资料20',
    modules: [
      { subject: '政治理论', count: 20, refMin: 12 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 30, refMin: 28 },
      { subject: '数量关系', count: 15, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'gk_ds', name: '国考·地市级', total: 130, mins: 120, tag: '2025新大纲',
    note: '政治20+常识15+言语30+数量10+判断35+资料20',
    modules: [
      { subject: '政治理论', count: 20, refMin: 12 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 30, refMin: 28 },
      { subject: '数量关系', count: 10, refMin: 10 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'gk_xz', name: '国考·行政执法', total: 130, mins: 120, tag: '2025新大纲',
    note: '同地市级（政治20+常识15+言语30+数量10+判断35+资料20）',
    modules: [
      { subject: '政治理论', count: 20, refMin: 12 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 30, refMin: 28 },
      { subject: '数量关系', count: 10, refMin: 10 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'lk_120', name: '省考联考·120题', total: 120, mins: 120, tag: '湖南/福建/宁夏/陕西等',
    note: '常识20+言语40+数量10+判断35+资料15',
    modules: [
      { subject: '常识判断', count: 20, refMin: 10 },
      { subject: '言语理解', count: 40, refMin: 32 },
      { subject: '数量关系', count: 10, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 10, refMin: 8 },
      { subject: '逻辑判断', count: 5, refMin: 6 },
      { subject: '资料分析', count: 15, refMin: 22 }
    ]
  },
  {
    id: 'lk_110', name: '省考联考·110题', total: 110, mins: 120, tag: '安徽/海南/广西等',
    note: '常识15+言语35+数量10+判断30+资料20',
    modules: [
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 35, refMin: 30 },
      { subject: '数量关系', count: 10, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 5, refMin: 6 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'gd_90', name: '广东·90题', total: 90, mins: 90, tag: '2025起100→90',
    note: '常识15+言语20+数量15+判断25+资料15',
    modules: [
      { subject: '常识判断', count: 15, refMin: 10 },
      { subject: '言语理解', count: 20, refMin: 20 },
      { subject: '数量关系', count: 15, refMin: 18 },
      { subject: '图形推理', count: 8, refMin: 9 },
      { subject: '定义判断', count: 6, refMin: 6 },
      { subject: '类比推理', count: 6, refMin: 6 },
      { subject: '逻辑判断', count: 5, refMin: 6 },
      { subject: '资料分析', count: 15, refMin: 17 }
    ]
  },
  {
    id: 'zj_130', name: '浙江·130题', total: 130, mins: 120, tag: '常识20/言语35/判断35/数量20/资料20',
    note: '模块题量每年略有浮动，可自行调整',
    modules: [
      { subject: '常识判断', count: 20, refMin: 10 },
      { subject: '言语理解', count: 35, refMin: 30 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '数量关系', count: 20, refMin: 18 },
      { subject: '资料分析', count: 20, refMin: 28 }
    ]
  },
  {
    id: 'js_135', name: '江苏A/B·135题', total: 135, mins: 120, tag: '2025新增政治理论10题',
    note: '政治10+常识15+言语35+数量15+判断35+资料25',
    modules: [
      { subject: '政治理论', count: 10, refMin: 6 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 35, refMin: 30 },
      { subject: '数量关系', count: 15, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 25, refMin: 30 }
    ]
  },
  {
    id: 'custom', name: '🛠 自由组卷（自定义板块）', total: 45, mins: 120, tag: '非真题模板 · 自由编辑板块/题量/时限',
    note: '自由组卷：随意增删板块、改题数与参考时限，或按你的省份/进度自行搭建卷面（不套用任何真题结构）',
    modules: [
      { subject: '常识判断', count: 10, refMin: 6 },
      { subject: '言语理解', count: 10, refMin: 9 },
      { subject: '判断推理', count: 10, refMin: 9 },
      { subject: '数量关系', count: 5, refMin: 5 },
      { subject: '资料分析', count: 10, refMin: 12 }
    ]
  }
]

export const SUB_VARIANTS = {
  '判断推理': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型', '论证缺陷型', '翻译推理', '真假话', '分析推理'],
  '逻辑判断': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型', '论证缺陷型', '翻译推理', '真假话', '分析推理'],
  '图形推理': ['位置规律', '样式规律', '属性规律', '数量规律', '组合规律', '空间重构', '截面图', '三视图', '立体拼合', '汉字字母'],
  '定义判断': ['选是题', '选非题', '多定义题', '匹配对应题'],
  '类比推理': ['二词型', '三词型', '填空型', '集合关系', '逻辑关系', '对应关系', '语法关系', '语义关系'],
  '言语理解': ['中心理解', '意图判断', '标题填入', '态度观点', '细节判断', '词句理解', '语句填空', '下文推断', '语句排序', '逻辑填空'],
  '资料分析': ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率', '乘积增长率', '两期比重差', '平均数增长率', '基期和差', '间隔基期量', '年均增量'],
  '数量关系': ['工程问题', '行程问题', '排列组合', '概率问题', '利润问题', '容斥问题', '最值问题', '几何问题', '年龄问题', '浓度问题', '数字推理', '统筹优化'],
  '常识判断': ['时政', '法律常识', '科技常识', '人文历史', '地理常识', '经济常识'],
  '政治理论': ['新思想', '党史', '马原哲学', '时政报告', '重要会议']
}

// 实测反馈③·自动轮换专属扩展题型库：只出现在「不限（自动轮换）」的轮换池，
// 不进用户自选下拉（下拉保持精简）；让子命题人按这些更细/更创新的命题角度出题，扩展覆盖面。
export const EXTRA_VARIANTS = {
  '言语理解': ['逻辑填空·虚词与关联词', '指代词理解', '语句排序·首尾锁定', '细节判断·偷换概念', '主旨句·话题一致'],
  '数量关系': ['时钟问题', '方阵问题', '分段计费问题', '鸡兔同笼'],
  '逻辑判断': ['因果论证辨析', '归纳与统计推理', '类比论证评价', '二难推理', '必要前提·否定代入', '分析推理·表格法'],
  '定义判断': ['案例归类判断', '条件要素穷举', '法律概念定义', '社会现象定义'],
  '类比推理': ['成语结构并列', '近义反义+感情色彩', '概念外延（包含/交叉）', '字词拆解双字义'],
  '资料分析': ['比值增长率', '指数与同比增长', '基期差量', '贡献率反推总量'],
  '常识判断': ['农业与生活常识', '急救与安全常识', '国防军事常识', '古代科技成就'],
  '政治理论': ['中国式现代化专题', '高质量发展专题', '新质生产力', '生态文明思想专题']
}

export const DIR_LIB = {
  '逻辑判断': ['最能削弱', '最能加强', '前提/假设', '不能推出', '最能解释'],
  '图形推理': ['填入问号处', '能由它折叠而成', '不可能是其截面', '符合三视图'],
  '定义判断': ['属于…的是', '不属于…的是'],
  '类比推理': ['逻辑关系最相似', '逻辑关系最不相似'],
  '言语理解': ['这段文字意在', '主旨是', '标题是', '接下来最可能'],
  '资料分析': ['能推出的是', '不能推出的是', '占…的比重约'],
  '数量关系': ['问…是多少', '至少/至多'],
  '常识判断': ['正确的是', '错误的是'],
  '政治理论': ['正确的是', '错误的是']
}

