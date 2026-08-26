// API 聚合层：统一从各子模块再导出，保持对外接口不变
// 子模块：client(模型对话) / detect(板块识别) / tasks(智能训练) / sys(系统提示词)
export { supportsVision, activeCfg, chatStream, chatOnce, aiPolish } from './api/client'
export { detectBanKuai } from './api/detect'
export { PLATE_MODE, buildTaskSys, buildMaterialPrompt, buildGroupPrompt } from './api/tasks'
export { buildSys } from './api/sys'
