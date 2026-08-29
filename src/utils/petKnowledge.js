// utils/petKnowledge.js —— 萌宠「功能知识库」：让萌宠通晓本项目全部功能与用法
// 注入到萌宠对话的 system prompt（精简全量），配合名师方法论一起构成萌宠知识底座。
// 仅供本项目萌宠使用；内容与界面/入口保持同步，新增功能时在此登记。
import { store } from '../store'
import { KNOWLEDGE_CARDS } from './dataTrainLib'

// ================= 功能清单（id / 名称 / 入口 / 用途 / 怎么用 / 小技巧） =================
export const APP_FEATURES = [
  { id: 'home_tabs', name: '主页六大入口', entry: '顶部导航：💬对话 / 📚知识库 / 🗂积累 / 📊统计 / 📋错题 / 🚀看板 / 🌌3D数据 / ⚙️设置', desc: '项目所有主功能从顶部导航进入', how: '点对应按钮切换到该页面', tips: '当前所在页面可用导航高亮判断' },
  { id: 'chat_single', name: '单题快练', entry: '💬对话页 · 工具栏「⚡ 单题快练」', desc: '选板块随机出 1 题，即时批改、可再来一题、错题入库', how: '先选板块（判断推理/言语/图形/资料分析/数量/常识…），点「单题快练」→ 作答 → 看解析；可点「再来一题」', tips: '资料分析支持自定义材料形式（纯文字/表格/统计图/综合）与单题或一篇5题；AI 出题会经本地质检保证唯一正确项' },
  { id: 'chat_paper', name: '模拟组卷', entry: '💬对话页 · 工具栏「📝 模拟组卷」', desc: '按国考/省考卷面模板 AI 组卷，支持导入材料识别、错题组卷、限时作答批改', how: '选模板（或自定义）→ AI 按卷面结构出题（资料分析按一篇材料5题）→ 限时作答 → 自动批改', tips: '可用错题本一键组卷；材料导入支持文字/表格/图表识别' },
  { id: 'chat_diag', name: '学习诊断', entry: '💬对话页 · 工具栏「📊 学习诊断」', desc: '针对错题最多的薄弱板块给出诊断与学习建议', how: '点按钮后按引导完成诊断', tips: '诊断结论会结合你的错题统计' },
  { id: 'chat_solid', name: '立体图推', entry: '💬对话页 · 工具栏「🧊 立体图推」', desc: '3D 旋转查看 + 三视图/展开图/切面/补缺 + AI 出题；支持上传真题截图复刻', how: '打开后左侧 3D 画布可旋转，右侧切换视图/自定义/展开图/切面/补缺/AI出题/考点技巧', tips: '展开图可折叠验证、切面可自由切割；AI 出题会识别并复刻截图' },
  { id: 'chat_data', name: '资料速算（四层能力训练）', entry: '💬对话页 · 工具栏「📊 资料速算」', desc: 'LY 四层能力刻意训练：判题型→找数据→选公式→速算；含「理论课堂」双师知识点库（LY×小P 52卡）', how: '打开后选模式（①判题型②找数据③公式④速算）+ 难度（入门/进阶/实战）+ 速算三阶段（方法识别/方法应用/实战混合）；「📚理论课堂」可搜索/筛选知识点卡', tips: '答错会显示判别口诀与方法卡，可点「📖看这张卡」跳理论课堂；AI教练按次调用省 token；全部本地出题零额度' },
  { id: 'chat_weak', name: '攻克薄弱', entry: '💬对话页 · 工具栏「🎯 攻克薄弱」', desc: '针对错题最多的薄弱板块一键出题', how: '点按钮自动按薄弱板块出题', tips: '结合错题本统计自动选择板块' },
  { id: 'chat_guide', name: '对话使用说明书', entry: '💬对话页 · 工具栏「📖 使用说明书」', desc: '如何按板块/场景高效提问的 Q&A 说明', how: '点开浏览各场景提问示范', tips: '按「题干完整+明确诉求」提问回复质量最高' },
  { id: 'chat_timer', name: '考场计时', entry: '💬对话页 · 工具栏「⏱ 计时开/关」', desc: '按问数限时（1问=1分钟），AI 回复后统计用时', how: '点按钮即可开启/关闭考场计时', tips: '适合模拟考场节奏' },
  { id: 'chat_img', name: '发图/截图问答', entry: '💬对话页 · 输入栏 📎 发图', desc: '发送题目截图让 AI 作答；纯文字截图走文字模型，含图形/表格走视觉模型或图形增强', how: '点 📎 选图/粘贴 → 可补一句诉求 → 发送', tips: '截图要清晰横平竖直；多题截图先说明看第几题；纯文字图不触发复刻省 token' },
  { id: 'chat_figenhance', name: '图形增强', entry: '回复消息操作栏「🖼 图形增强」', desc: '用独立模型把题目截图复刻成图（图推重绘+标注）', how: '在回复操作栏点「🖼 图形增强」', tips: '图推解析会自动补画标注图；也可在设置配免费视觉模型自动读图' },
  { id: 'chat_wrong', name: '存错题', entry: '回复消息操作栏「📌 存错题」', desc: '把当前题目/截图存入错题本', how: '点「📌 存错题」→ 选板块 → 确认', tips: '截图会自动压缩控制体积' },
  { id: 'chat_variant', name: '变式题', entry: '回复消息操作栏「🔁 变式题」', desc: '基于当前题生成同考点变式题巩固', how: '点「🔁 变式题」', tips: '适合错题巩固' },
  { id: 'chat_review', name: '复盘', entry: '回复消息操作栏「📄 复盘」', desc: '对当前题做高效复盘（考点结构/错因自查/巩固动作）', how: '点「📄 复盘」', tips: '错题本二刷三刷也支持深度复盘' },
  { id: 'chat_followup', name: '追问', entry: '回复消息操作栏「💬 追问」', desc: '基于这条回复继续追问', how: '点「💬 追问」输入问题', tips: '适合分步深入理解' },
  { id: 'chat_star', name: '收藏', entry: '回复消息操作栏「📌 收藏」/「👍👎」', desc: '收藏有用回复到笔记；👍👎反馈质量', how: '点消息操作栏对应按钮即可', tips: '收藏内容可在「🗂积累」查看' },
  { id: 'chat_read', name: '消息朗读', entry: '回复消息操作栏「🔊 朗读」+ 全局朗读按钮', desc: '用真人级 TTS 朗读回复/题干/错题', how: '点「🔊」朗读该条，或用顶栏 🔊 读当前页面；⏱ 切换倍速、⏹ 停止', tips: '支持 0.75-1.5 倍速；语音设置里可换音色/克隆声线' },
  { id: 'chat_cost', name: 'AI 用量与花费', entry: '顶栏「💰 ¥」按钮', desc: '实时追踪每次调用模型/功能/图文 token 与花费、计价表、清空记录', how: '点「💰 ¥」查看明细', tips: '计价表按各模型提供商真实规则展示，不虚报' },
  { id: 'wrong_list', name: '错题本', entry: '顶部导航「📋 错题」', desc: '错题列表、二刷/三刷、复盘消化、错题组卷', how: '进入后点某题可二刷/三刷作答；支持标记已消化；可一键组卷重练', tips: '二刷/三刷再做错会触发深度复盘（找突破口）' },
  { id: 'wrong_paper', name: '错题组卷', entry: '📋错题页 / 📝模拟组卷', desc: '把错题按模板组一套卷重练', how: '在错题页或组卷里选「错题组卷」', tips: '优先组薄弱板块错题' },
  { id: 'kb_tab', name: '知识库', entry: '顶部导航「📚 知识库」', desc: '六大板块名师方法论与知识体系浏览', how: '点知识库 → 选板块查看', tips: '内容与对话 AI 的知识底座同源' },
  { id: 'stats_tab', name: '统计', entry: '顶部导航「📊 统计」', desc: '做题/正确率/板块掌握度等学习数据', how: '进入统计页查看各项学习数据', tips: '看板与 3D 数据是可视化版本' },
  { id: 'ck_tab', name: '看板', entry: '顶部导航「🚀 看板」', desc: '学习驾驶舱：各板块掌握度、励志语录、阅读/语音等', how: '点开查看与交互', tips: '含各板块细分掌握度与激励内容' },
  { id: 'd3_tab', name: '3D 数据驾驶舱', entry: '顶部导航「🌌 3D数据」', desc: '把学习数据场景化：每个板块是一颗星球，可点入查看板块数据；「数据飞行」火箭带你按最优→次优→待提升路线巡游，萌宠沿途播报数据与建议', how: '进入 3D 场景 → 点星球看详情/叉掉关闭 → 点火箭按钮体验数据飞行', tips: '萌宠在飞行中会语音播报各模块近期数据与下一步建议' },
  { id: 'export_data', name: '导出', entry: '顶栏「📤 导出」', desc: '导出学习数据/错题/对话记录等', how: '点导出按引导操作', tips: '可用于备份或打印' },
  { id: 'set_models', name: '设置·模型', entry: '顶部导航「⚙️ 设置」→ 模型与语音', desc: '配置文字模型（DeepSeek 等）、视觉模型（deepseek-v4-flash-vision-exp 等）、对话快模型（deepseek-chat）、图形增强模型', how: '填对应 Key 与模型名；图形增强支持硅基流动/Ollama', tips: '视觉模型用于发图题；快模型用于「⚡快答」秒回' },
  { id: 'set_tts', name: '设置·语音音色市场', entry: '⚙️ 设置 → 语音', desc: '四引擎：智谱 GLM-TTS（超拟人默认）/ OpenAI 兼容（CosyVoice2）/ Edge 免费神经 / 系统语音兜底；支持音色试音、改名、删除、自定义克隆', how: '选引擎 → 试音 → 用「+ 自定义」上传 3-30 秒音频克隆声线（智谱/硅基）', tips: '克隆后可在音色市场改名/删除；角色可绑定克隆声线一键切换' },
  { id: 'set_pet', name: '设置·萌宠', entry: '⚙️ 设置 → 萌宠；或萌宠面板内切换', desc: '一键切换内置角色（薛神/章若楠/李星云/姬如雪）与自定义角色；形象/声线/名字/人设联动', how: '在萌宠面板或设置选角色；自定义角色可上传形象+克隆声音', tips: '内置角色锁定不可改；自定义可新增 2、3、4… 个' },
  { id: 'pet_cap', name: '萌宠自身能力', entry: '全局悬浮萌宠（任意界面可呼出）', desc: '朗读当前页面内容、倍速、错题实时分析（为什么错/突破口）、发图问答、对话记忆模式、角色一键切换、成长养成（喂食/抚摸/升级）', how: '点萌宠气泡问它；刷题时点「🔊读题」；做错题后可让它分析错因；发图让它看图作答', tips: '萌宠通晓本项目全部功能与六大板块名师方法论，可当全能助教随时问' },
  { id: 'pet_roles', name: '四个内置角色', entry: '萌宠面板 → 形象切换', desc: '薛神（判断推理名师·讲课俏皮爱抛梗）、章若楠（温柔甜妹·治愈陪伴）、李星云（不良人·江湖侠气）、姬如雪（唤你"星云"·外冷内热）', how: '一键切换即同步形象+声线+人设', tips: '每个角色都基于「全能行测助教」底座，讲题方法一致、口吻不同' },
  { id: 'pet_voice', name: '语音阅读与倍速', entry: '全局 🔊 / ⏱ / ⏹ 按钮 + 萌宠朗读', desc: '真人级 TTS 全局朗读：题干/错题/消息/理论卡；支持 0.75-1.5 倍速、停止', how: '点 🔊 读当前内容，⏱ 循环切倍速，⏹ 停止；萌宠回复自动朗读可在设置开关', tips: '朗读会智能处理数学符号（→读"推出"、%读"百分之"）与去代码/emoji' }
]

// 压缩为注入用文本（标题+入口+用途，控制 token）
export function petFeatureText() {
  return APP_FEATURES.map((f) => {
    return '【' + f.name + '】入口：' + f.entry + '。用途：' + f.desc + '。使用：' + f.how + (f.tips ? '。提示：' + f.tips : '')
  }).join('\n')
}

// 当前界面感知：从 store 推导用户正在使用什么
export function petDetectUi() {
  const t = String(store.tab || '')
  const panel = (store.uiCtx && store.uiCtx.panel) || ''
  const exam = store.examOpen
  const parts = []
  if (panel === 'solid') parts.push('🧊立体图推面板')
  else if (panel === 'data') parts.push('📊资料速算（四层训练/理论课堂）')
  else if (panel === 'exam') parts.push(exam ? '📝模拟组卷/考场' : '📝模拟组卷')
  if (!parts.length) {
    if (t === 'chat') parts.push('💬对话主页')
    else if (t === 'kb') parts.push('📚知识库')
    else if (t === 'stats') parts.push('📊统计')
    else if (t === 'wrong') parts.push('📋错题本')
    else if (t === 'ck') parts.push('🚀看板')
    else if (t === '3d') parts.push('🌌3D数据驾驶舱')
    else if (t === 'accum' || t === 'notes') parts.push('🗂积累')
    else parts.push('应用主页')
  }
  const MODE_CN = { luoji: '判断推理', leibi: '类比推理', dingyi: '定义判断', zhanggong: '言语理解', yanyu: '言语理解', tutu: '图形推理', ziliao: '资料分析', shuliang: '数量关系', zhengzhi: '政治理论', changshi: '常识判断' }
  const modeName = store.mode && store.mode !== 'all' ? '（当前专项板块：' + (MODE_CN[store.mode] || store.mode) + '）' : ''
  return '用户当前正在使用：' + parts.join('、') + modeName
}

// 资料速算「理论课堂」52 卡索引（层 + 标题 + 口诀节选），供萌宠在资料分析场景引用
export function DATA_TRAIN_INDEX() {
  const groups = {}
  for (const c of KNOWLEDGE_CARDS) {
    if (!groups[c.layer]) groups[c.layer] = []
    groups[c.layer].push(c)
  }
  const LAYER_NAME = { type: '①判题型', locate: '②找数据', formula: '③公式', calc: '④速算' }
  const lines = []
  for (const layer of ['type', 'locate', 'formula', 'calc']) {
    const cards = groups[layer] || []
    lines.push('【' + (LAYER_NAME[layer] || layer) + '】' + cards.map((c) => c.title + '（' + c.tip.replace(/口诀：/, '') + '）').join('；'))
  }
  return lines.join('\n')
}
