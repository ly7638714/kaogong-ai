// modelRegistry.js —— 三类大模型（文本/视觉/图像增强）注册表
// ──────────────────────────────────────────────────────────────
// 职责：
//  1. 单一真相源：服务商 id → 名称、API 地址、模型清单（按发布日新→旧排序）
//  2. 三类模型分离：text 文本、vision 视觉（看图/OCR/多模态对话）、fig 图像增强（开源/免费 VLM，复刻原图）
//  3. "custom" 服务商：URL 与模型名由用户手填；不强制内置清单
//  4. 内置 + 用户自定义 合并（mergedModelsOf）
//
// 更新机制：
//  - 内置清单随版本发版刷新（REGISTRY_VERSION 标识快照时间）
//  - 用户在 UI「➕ 手动添加」的模型也参与下拉（cfg.customModels），新模型不等发版
//
// ⚠️ 数据真实性声明（2026-09-02 经联网核验整理）：
//  - 各服务商模型名/发布时间均来自官方/权威第三方公开信息（厂商官网、模型文档、价格页）
//  - 已退役/停用模型不列入主清单（OpenAI GPT-4o/4.1、DeepSeek chat/reasoner、Claude 3.x、
//    Kimi moonshot-v1 系列、Gemini 2.0-flash 等），避免小白选了调不通
//  - 图像增强(图)卡 = 图片理解/复刻类开源 VLM；OpenAI gpt-image 属"生成"模型且非 chat 协议，不列
//  - 个别快照 id（厂商带日期后缀，如 qwen3.7-max-2026-05-20）通常可省略日期直接用基名

export const REGISTRY_VERSION = '2026.09-r2'

// ── 类别元数据（供展示）──
export const CAT_META = {
  text:   { label: '💬 文本大模型',  d: '纯文字题（常识/言语/数量/资料/判断）的 AI 大脑；推荐 DeepSeek，便宜且中文好。' },
  vision: { label: '👁️ 视觉大模型',  d: '图片/截图题（图推/资料表格/数学公式）必须配此模型才能看图；DeepSeek 可直接复用同一个 Key。' },
  fig:    { label: '🖼 图像增强大模型（可选）', d: '可选增强：用独立开源/免费视觉模型把题目截图复刻成图贴进回复，辅助看懂图推/几何/表格题；不影响主问答。' }
}

// ── 服务商 ──
// id 即 cfg 中 prov 字段；custom 由用户完全手填 url+model
export const PROVIDERS = {
  text: {
    ds:      { label: 'DeepSeek（纯文本·便宜·中文好）',       url: 'https://api.deepseek.com/chat/completions' },
    zhipu:   { label: '智谱 GLM（GLM-5.2/5/5V-Turbo）',        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
    openai:  { label: 'OpenAI（GPT-5.6/5.5/5.4）',             url: 'https://api.openai.com/v1/chat/completions' },
    qwen:    { label: '通义千问 DashScope（Qwen3.8/3.7/3.6）', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
    doubao:  { label: '豆包 Doubao（火山方舟）',               url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
    moonshot:{ label: '月之暗面 Moonshot（Kimi）',             url: 'https://api.moonshot.ai/v1/chat/completions' },
    stepfun: { label: '阶跃星辰 Stepfun（Step-3）',            url: 'https://api.stepfun.com/v1/chat/completions' },
    gemini:  { label: 'Google Gemini（官方 OpenAI 兼容端点）', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
    openrouter: { label: 'OpenRouter 聚合（Claude/Gemini/DeepSeek…一把 Key）', url: 'https://openrouter.ai/api/v1/chat/completions' },
    custom:  { label: '自定义 API（兼容 OpenAI 协议）',        url: '' }
  },
  vision: {
    ds:       { label: 'DeepSeek 视觉（多模态）',           url: 'https://api.deepseek.com/chat/completions' },
    zhipu:    { label: '智谱 GLM-5V / 5.3-Flash（视觉）',   url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
    openai:   { label: 'OpenAI GPT-5.6/5.5/5.4 视觉',       url: 'https://api.openai.com/v1/chat/completions' },
    qwen:     { label: '通义 Qwen（3.7 起原生多模态）',     url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
    doubao:   { label: '豆包 Doubao 视觉',                  url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
    moonshot: { label: '月之暗面 Kimi（K3/K2.6 原生视觉）', url: 'https://api.moonshot.ai/v1/chat/completions' },
    stepfun:  { label: '阶跃星辰 Stepfun 视觉',             url: 'https://api.stepfun.com/v1/chat/completions' },
    gemini:   { label: 'Google Gemini（视觉强·官方兼容端点）', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
    openrouter:{ label: 'OpenRouter 聚合（Claude/Gemini 视觉）', url: 'https://openrouter.ai/api/v1/chat/completions' },
    custom:   { label: '自定义 API（兼容 OpenAI 协议）',     url: '' }
  },
  fig: {
    sf:      { label: '硅基流动 SiliconFlow（开源·免费额度·推荐）', url: 'https://api.siliconflow.cn/v1/chat/completions' },
    zhipu:   { label: '智谱 GLM-5V / 4V（免费额度）',             url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
    qwen:    { label: '通义 Qwen-VL / Qwen3.7（免费额度）',        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
    openai:  { label: 'OpenAI GPT-5.5（视觉）',                    url: 'https://api.openai.com/v1/chat/completions' },
    moonshot:{ label: '月之暗面 Kimi（K2.6 视觉）',                url: 'https://api.moonshot.ai/v1/chat/completions' },
    doubao:  { label: '豆包 Doubao-Seed（视觉）',                  url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
    ollama:  { label: 'Ollama 本地（完全免费离线）',               url: 'http://localhost:11434/v1/chat/completions' },
    lmstudio:{ label: 'LM Studio 本地（http://localhost:1234）',    url: 'http://localhost:1234/v1/chat/completions' },
    jan:     { label: 'Jan 本地（http://localhost:1337）',          url: 'http://localhost:1337/v1/chat/completions' },
    custom:  { label: '自定义 API（兼容 OpenAI 协议）',             url: '' }
  }
}

// ── 模型清单（按发布日 新→旧 排；缺 pub 放尾部）──
// id=实际请求体 model 值；pub=公网首发月；tag：free/think/vision/fast/local；note=一句话
export const MODELS = {
  // ========== ① 文本大模型 ==========
  text: {
    // DeepSeek V4（2026-04-24 发布；1M 上下文，Thinking/非 Thinking 双模；chat/reasoner 旧名已于 2026-07-24 停用）
    ds: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek-V4-Flash（快·推荐）', pub: '2026-04', tag: 'fast', note: '项目默认·便宜省 token' },
      { id: 'deepseek-v4-pro',   label: 'DeepSeek-V4-Pro（强推理·Agent）', pub: '2026-04', tag: 'think', note: '对标顶级闭源' }
    ],
    // 智谱 GLM（2026：GLM-5.2→GLM-5→GLM-5-Turbo→GLM-4.7-Flash）
    zhipu: [
      { id: 'glm-5.2',    label: 'GLM-5.2（旗舰）',     pub: '2026-06', note: '最新旗舰·长程 Agent' },
      { id: 'glm-5',      label: 'GLM-5（开源 MoE 旗舰）', pub: '2026-02', tag: 'free', note: '开源 MIT·SWE 开源第一' },
      { id: 'glm-5-turbo',label: 'GLM-5-Turbo（Agent 优化）', pub: '2026-03', tag: 'think' },
      { id: 'glm-4.7-flash', label: 'GLM-4.7-Flash（免费）', pub: '2026-01', tag: 'fast free', note: '轻量免费' }
    ],
    // OpenAI GPT-5.x（gpt-4o/4.1 已 2026-02-13 退役）
    openai: [
      { id: 'gpt-5.6-sol',  label: 'GPT-5.6 Sol（旗舰档）',  pub: '2026-06', tag: 'think', note: '1.05M 上下文·Agent 多步' },
      { id: 'gpt-5.6-terra',label: 'GPT-5.6 Terra',          pub: '2026-06', tag: 'think' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna（轻量档）', pub: '2026-06', tag: 'fast' },
      { id: 'gpt-5.5',      label: 'GPT-5.5（旗舰·原生重训）', pub: '2026-04', tag: 'think' },
      { id: 'gpt-5.5-pro',  label: 'GPT-5.5 Pro（顶配推理）', pub: '2026-04', tag: 'think' },
      { id: 'gpt-5.4',      label: 'GPT-5.4（电脑操作）',    pub: '2026-03', tag: 'think', note: '1M 上下文' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini',           pub: '2026-03', tag: 'fast' },
      { id: 'gpt-5.2',      label: 'GPT-5.2',                pub: '2025-12' },
      { id: 'gpt-5.1',      label: 'GPT-5.1',                pub: '2025-11' },
      { id: 'gpt-5',        label: 'GPT-5',                  pub: '2025-08' },
      { id: 'gpt-5-mini',   label: 'GPT-5 mini',             pub: '2025-08', tag: 'fast' }
    ],
    // 通义 Qwen（DashScope 商业版：Qwen3.8/3.7/3.6 全系支持思考模式；3.5+ 原生多模态）
    qwen: [
      { id: 'qwen3.8-max',  label: 'Qwen3.8-Max',       pub: '2026-08', tag: 'think', note: '最新旗舰（仅思考）' },
      { id: 'qwen3.8-flash',label: 'Qwen3.8-Flash',     pub: '2026-08', tag: 'fast' },
      { id: 'qwen3.7-max',  label: 'Qwen3.7-Max',       pub: '2026-05', tag: 'think', note: '1M 上下文' },
      { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus',      pub: '2026-05' },
      { id: 'qwen3.7-flash',label: 'Qwen3.7-Flash',     pub: '2026-05', tag: 'fast' },
      { id: 'qwen3.6-plus', label: 'Qwen3.6-Plus',      pub: '2026-04' },
      { id: 'qwen3.6-flash',label: 'Qwen3.6-Flash',     pub: '2026-04', tag: 'fast' },
      { id: 'qwen3.5-plus', label: 'Qwen3.5-Plus',      pub: '2026-02' },
      { id: 'qwen3.5-flash',label: 'Qwen3.5-Flash',     pub: '2026-02', tag: 'fast' },
      { id: 'qwen3-max',    label: 'Qwen3-Max（上一代）', pub: '2025-09', tag: 'think' }
    ],
    // 豆包（火山方舟；2026-07 发布 1.6，另有 seed-1.8 / 2.1-pro）
    doubao: [
      { id: 'doubao-seed-2.1-pro', label: 'Doubao-Seed-2.1-Pro（最新）', pub: '2026-08', tag: 'think' },
      { id: 'doubao-seed-1.8',     label: 'Doubao-Seed-1.8',             pub: '2026-07' },
      { id: 'doubao-seed-1.6',     label: 'Doubao-Seed-1.6（主力）',     pub: '2026-07', note: 'Thinking/非Thinking/自适应' },
      { id: 'doubao-seed-1.6-thinking', label: 'Doubao-Seed-1.6-Thinking（强思考）', pub: '2026-07', tag: 'think' },
      { id: 'doubao-seed-1.6-flash',    label: 'Doubao-Seed-1.6-Flash（极速）',    pub: '2026-07', tag: 'fast', note: 'TPOT 10ms·超便宜' }
    ],
    // Kimi（api.moonshot.ai；旧 moonshot-v1/k2.5 已于 2026-08-31 停用）
    moonshot: [
      { id: 'kimi-k3',      label: 'Kimi K3（旗舰·1M 上下文）', pub: '2026-07', tag: 'think', note: '2.8T 原生视觉' },
      { id: 'kimi-k2.6',    label: 'Kimi K2.6（开源多模态）',   pub: '2026-04', tag: 'think', note: '256K·可视觉' },
      { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code（编程）',  pub: '2026-05', tag: 'think fast' },
      { id: 'kimi-k2.7-code-highspeed', label: 'Kimi K2.7 Code Highspeed', pub: '2026-05', tag: 'fast' }
    ],
    stepfun: [
      { id: 'step-2-16k',  label: 'Step-2 16k',     pub: '2025-08', note: '阶跃主力' },
      { id: 'step-2-mini', label: 'Step-2 Mini',    pub: '2025-08', tag: 'fast' },
      { id: 'step-1v-32k', label: 'Step-1V 32k（多模态）', pub: '2024-10', tag: 'vision' }
    ],
    // Google Gemini（3.x 全系多模态；Pro 冻结在 3.1，Flash 已到 3.7）
    gemini: [
      { id: 'gemini-3.7-flash',    label: 'Gemini 3.7 Flash（最新·快）',  pub: '2026-08', tag: 'fast', note: '1M 上下文·多模态' },
      { id: 'gemini-3.6-flash',    label: 'Gemini 3.6 Flash',             pub: '2026-07', tag: 'fast' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite（最省）', pub: '2026-07', tag: 'fast free' },
      { id: 'gemini-3.5-flash',    label: 'Gemini 3.5 Flash',             pub: '2026-05', tag: 'fast' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（当前旗舰 Pro）', pub: '2026-02', tag: 'think', note: 'GPQA 94.3%·1M 上下文' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite',      pub: '2026-03', tag: 'fast free' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash（预览）',    pub: '2025-12', tag: 'fast' },
      { id: 'gemini-2.5-pro',      label: 'Gemini 2.5 Pro（旧款兜底）',   pub: '2025-03', tag: 'think' }
    ],
    // OpenRouter 聚合（Claude 原生 Messages 协议本应用不走，需经 OpenRouter 等 OpenAI 兼容网关）
    openrouter: [
      { id: 'anthropic/claude-opus-5',   label: 'Anthropic Claude Opus 5',  pub: '2026-07', tag: 'think', note: '经 OpenRouter 调用' },
      { id: 'anthropic/claude-sonnet-5', label: 'Anthropic Claude Sonnet 5',pub: '2026-06', note: '性价比均衡' },
      { id: 'anthropic/claude-fable-5',  label: 'Anthropic Claude Fable 5', pub: '2026-06', tag: 'think', note: '最高能力档' },
      { id: 'anthropic/claude-haiku-4.5',label: 'Anthropic Claude Haiku 4.5', pub: '2025-10', tag: 'fast' },
      { id: 'google/gemini-3.7-flash',   label: 'Gemini 3.7 Flash（OR）',   pub: '2026-08', tag: 'fast' },
      { id: 'google/gemini-3.1-pro',     label: 'Gemini 3.1 Pro（OR）',     pub: '2026-02', tag: 'think' },
      { id: 'openai/gpt-5.5',            label: 'GPT-5.5（OR）',            pub: '2026-04', tag: 'think' },
      { id: 'deepseek/deepseek-v4-flash',label: 'DeepSeek-V4-Flash（OR）',  pub: '2026-04', tag: 'fast' }
    ],
    custom: [] // 手填
  },

  // ========== ② 视觉大模型 ==========
  vision: {
    ds: [
      { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek-V4-Flash-Vision（视觉·默认）', pub: '2026-08', tag: 'vision', note: '2026-08-21 上线·1M 上下文' }
    ],
    zhipu: [
      { id: 'glm-5v-turbo', label: 'GLM-5V-Turbo（视觉·Agent）', pub: '2026-04', tag: 'vision', note: '项目默认视觉' },
      { id: 'glm-5.3-flash',label: 'GLM-5.3-Flash（原生多模态·开源）', pub: '2026-08', tag: 'vision free' },
      { id: 'glm-4.6v',     label: 'GLM-4.6V（原生多模态）',    pub: '2025-12', tag: 'vision' },
      { id: 'glm-4v-plus',  label: 'GLM-4V-Plus',              pub: '2024-12', tag: 'vision' },
      { id: 'glm-4v-flash', label: 'GLM-4V-Flash（免费额度）',  pub: '2024-12', tag: 'vision free' }
    ],
    // GPT-5.x 全系支持图像输入
    openai: [
      { id: 'gpt-5.6-sol',   label: 'GPT-5.6 Sol（视觉）',  pub: '2026-06', tag: 'vision think' },
      { id: 'gpt-5.5',       label: 'GPT-5.5（视觉）',      pub: '2026-04', tag: 'vision' },
      { id: 'gpt-5.4',       label: 'GPT-5.4（视觉）',      pub: '2026-03', tag: 'vision' },
      { id: 'gpt-4o',        label: 'GPT-4o（旧·部分网关仍可）', pub: '2024-05', tag: 'vision', note: '官方 2026-02 已退役' }
    ],
    // Qwen3.5+ 原生支持文本+图像+视频
    qwen: [
      { id: 'qwen3.7-max',      label: 'Qwen3.7-Max（多模态·强）', pub: '2026-05', tag: 'vision think' },
      { id: 'qwen3.7-flash',    label: 'Qwen3.7-Flash（多模态·快）', pub: '2026-05', tag: 'vision fast' },
      { id: 'qwen3.6-plus',     label: 'Qwen3.6-Plus（多模态）',    pub: '2026-04', tag: 'vision' },
      { id: 'qwen-vl-max',      label: 'Qwen-VL-Max（经典 VL）',    pub: '2024-10', tag: 'vision' },
      { id: 'qwen2.5-vl-72b-instruct', label: 'Qwen2.5-VL-72B（开源）', pub: '2025-02', tag: 'vision' }
    ],
    doubao: [
      { id: 'doubao-seed-1.6-flash', label: 'Doubao-Seed-1.6-Flash（视觉）', pub: '2026-07', tag: 'vision fast', note: '原生视觉理解' },
      { id: 'doubao-seed-1.6-vision',label: 'Doubao-Seed-1.6-Vision',       pub: '2026-07', tag: 'vision' },
      { id: 'doubao-1.5-vision-pro', label: 'Doubao-1.5-Vision-Pro',         pub: '2025-01', tag: 'vision' }
    ],
    moonshot: [
      { id: 'kimi-k3',   label: 'Kimi K3（原生视觉·旗舰）', pub: '2026-07', tag: 'vision think' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6（原生视觉·开源）', pub: '2026-04', tag: 'vision', note: '256K' }
    ],
    stepfun: [
      { id: 'step-1v-32k', label: 'Step-1V 32k', pub: '2024-10', tag: 'vision' }
    ],
    gemini: [
      { id: 'gemini-3.7-flash',       label: 'Gemini 3.7 Flash（视觉）',   pub: '2026-08', tag: 'vision fast' },
      { id: 'gemini-3.6-flash',       label: 'Gemini 3.6 Flash（视觉）',   pub: '2026-07', tag: 'vision fast' },
      { id: 'gemini-3.5-flash',       label: 'Gemini 3.5 Flash（视觉）',   pub: '2026-05', tag: 'vision fast' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（视觉·强）',  pub: '2026-02', tag: 'vision think' },
      { id: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro（旧款）',     pub: '2025-03', tag: 'vision think' }
    ],
    openrouter: [
      { id: 'anthropic/claude-opus-5',    label: 'Claude Opus 5（视觉）',   pub: '2026-07', tag: 'vision' },
      { id: 'anthropic/claude-sonnet-5',  label: 'Claude Sonnet 5（视觉）', pub: '2026-06', tag: 'vision' },
      { id: 'google/gemini-3.7-flash',    label: 'Gemini 3.7 Flash（视觉）',pub: '2026-08', tag: 'vision fast' },
      { id: 'google/gemini-3.1-pro',      label: 'Gemini 3.1 Pro（视觉）',  pub: '2026-02', tag: 'vision think' },
      { id: 'openai/gpt-5.5',             label: 'GPT-5.5（视觉）',         pub: '2026-04', tag: 'vision' }
    ],
    custom: []
  },

  // ========== ③ 图像增强（开源/免费 VLM：把截图复刻成图辅助理解）==========
  fig: {
    sf: [
      { id: 'Qwen/Qwen2.5-VL-7B-Instruct',  label: 'Qwen2.5-VL 7B（免费额度·默认）', pub: '2025-02', tag: 'vision free', note: '免费额度够日常' },
      { id: 'Qwen/Qwen2.5-VL-72B-Instruct', label: 'Qwen2.5-VL 72B（更强）',        pub: '2025-02', tag: 'vision' },
      { id: 'Qwen/Qwen2-VL-72B-Instruct',   label: 'Qwen2-VL 72B',                  pub: '2024-08', tag: 'vision' },
      { id: 'deepseek-ai/deepseek-vl2',     label: 'DeepSeek-VL2（开源）',          pub: '2024-12', tag: 'vision' }
    ],
    zhipu: [
      { id: 'glm-5v-turbo', label: 'GLM-5V-Turbo（视觉）', pub: '2026-04', tag: 'vision' },
      { id: 'glm-5.3-flash',label: 'GLM-5.3-Flash（多模态·免费）', pub: '2026-08', tag: 'vision free' },
      { id: 'glm-4v-flash', label: 'GLM-4V-Flash（免费额度）',    pub: '2024-12', tag: 'vision free' }
    ],
    qwen: [
      { id: 'qwen3.7-flash',        label: 'Qwen3.7-Flash（多模态）',   pub: '2026-05', tag: 'vision fast' },
      { id: 'qwen-vl-max',          label: 'Qwen-VL-Max',               pub: '2024-10', tag: 'vision' },
      { id: 'qwen-vl-plus',         label: 'Qwen-VL-Plus',              pub: '2024-09', tag: 'vision free' },
      { id: 'qwen2.5-vl-72b-instruct', label: 'Qwen2.5-VL-72B（开源）', pub: '2025-02', tag: 'vision' }
    ],
    openai: [
      { id: 'gpt-5.5', label: 'GPT-5.5（视觉）', pub: '2026-04', tag: 'vision' }
    ],
    moonshot: [
      { id: 'kimi-k2.6', label: 'Kimi K2.6（视觉·开源）', pub: '2026-04', tag: 'vision' }
    ],
    doubao: [
      { id: 'doubao-seed-1.6-flash', label: 'Doubao-Seed-1.6-Flash（视觉）', pub: '2026-07', tag: 'vision fast' }
    ],
    ollama: [
      { id: 'minicpm-v',       label: 'MiniCPM-V（中文好·约 5GB）', pub: '2024-08', tag: 'local', note: '推荐·中文 OCR/图推' },
      { id: 'llama3.2-vision', label: 'Llama 3.2 Vision（11B/90B）', pub: '2024-09', tag: 'local' },
      { id: 'qwen2.5-vl-7b',   label: 'Qwen2.5-VL 7B',               pub: '2025-02', tag: 'local' }
    ],
    lmstudio: [
      { id: 'qwen2.5-vl-7b', label: 'Qwen2.5-VL 7B', pub: '2025-02', tag: 'local' },
      { id: 'minicpm-v',     label: 'MiniCPM-V（中文）', pub: '2024-08', tag: 'local' }
    ],
    jan: [
      { id: 'qwen2.5-vl-7b', label: 'Qwen2.5-VL 7B', pub: '2025-02', tag: 'local' }
    ],
    custom: []
  }
}

// ── API：纯函数 ──

// 提供商信息：{ id, label, url, isCustom }
export function providerOf(prov, cat) {
  const p = (PROVIDERS[cat] || {})[prov] || { label: prov || '未选', url: '' }
  return { id: prov, label: p.label, url: p.url, isCustom: prov === 'custom' }
}

// 该服务商在该类别下的内置模型清单（已按发布日新→旧排序）
export function modelsOf(prov, cat) {
  const arr = (MODELS[cat] || {})[prov] || []
  return arr.slice().sort((a, b) => {
    const pa = a.pub || '0000-00'
    const pb = b.pub || '0000-00'
    return pb.localeCompare(pa)
  })
}

// 默认模型（最新）
export function defaultModelOf(prov, cat) {
  const list = modelsOf(prov, cat)
  return list.length ? list[0].id : ''
}

// 当前 model 是否在清单里
export function isModelKnown(prov, cat, modelId) {
  if (!modelId) return false
  return modelsOf(prov, cat).some((m) => m.id === modelId)
}

// 合并「内置 + 用户自定义」模型清单（供下拉用）
// customModels: { [cat]: { [prov]: [{id,label,pub?,tag?},...] } }
export function mergedModelsOf(prov, cat, customModels) {
  const built = modelsOf(prov, cat).map((m) => ({ ...m, src: 'built' }))
  const custom = (customModels && customModels[cat] && customModels[cat][prov]) || []
  const builtIds = new Set(built.map((m) => m.id))
  const extras = custom.filter((m) => m.id && !builtIds.has(m.id)).map((m) => ({ ...m, src: 'custom' }))
  return [...extras, ...built]
}

// ── 「对话快模型」候选（同服务商·同 Key 的 非思考/极速 档，v3.8.87）──
// 供 文字模型卡「🚀 对话快模型」下拉；必须是 该服务商、能用同一 Key 调用的非深度思考/轻量档。
// 诚实说明：各家"非思考"实现不同（DeepSeek/Gemini 靠参数关思考；智谱/千问 flash 档默认思考但更快、
// 成本低），以下均为已确认可用的轻量/极速档；不确认的不上。
const FAST_CANDS = {
  ds:        [ { id: 'deepseek-v4-flash', pub: '2026-04', note: 'V4 双模·非思考模式极速' } ],
  zhipu:     [ { id: 'glm-4.7-flash', pub: '2026-01', note: '轻量免费' } ],
  openai:    [ { id: 'gpt-5.6-luna', pub: '2026-06', note: 'Luna 轻量档' }, { id: 'gpt-5.4-mini', pub: '2026-03', note: 'Mini 档' }, { id: 'gpt-5-mini', pub: '2025-08', note: '旧 Mini 档' } ],
  qwen:      [ { id: 'qwen3.7-flash', pub: '2026-05', note: '快' }, { id: 'qwen3.6-flash', pub: '2026-04', note: '快' }, { id: 'qwen3.5-flash', pub: '2026-02', note: '快' }, { id: 'qwen-turbo', pub: '', note: '历史·非思考' }, { id: 'qwen-flash', pub: '', note: '历史·非思考' } ],
  doubao:    [ { id: 'doubao-seed-1.6-flash', pub: '2026-07', note: 'TPOT 10ms 极速' } ],
  moonshot:  [ { id: 'kimi-k2.6', pub: '2026-04', note: '可关思考' } ],
  stepfun:   [ { id: 'step-2-mini', pub: '2025-08', note: '快' } ],
  gemini:    [ { id: 'gemini-3.7-flash', pub: '2026-08', note: '默认不深度思考' }, { id: 'gemini-3.6-flash', pub: '2026-07', note: '默认不深度思考' }, { id: 'gemini-3.5-flash-lite', pub: '2026-07', note: '最省' } ],
  openrouter:[ { id: 'anthropic/claude-haiku-4.5', pub: '2025-10', note: '快·轻量' }, { id: 'anthropic/claude-sonnet-5', pub: '2026-06', note: '均衡' } ],
  custom:    []
}

// 该文字服务商的「对话快模型」候选（按发布日 新→旧）
export function fastTextOf(prov) {
  const list = (FAST_CANDS[prov] || []).map((c) => {
    const inText = (MODELS.text[prov] || []).find((m) => m.id === c.id)
    return {
      id: c.id,
      pub: c.pub || (inText && inText.pub) || '',
      note: c.note || (inText && inText.note) || '',
      label: (inText && inText.label) || c.id,
      src: 'fast'
    }
  })
  return list.sort((a, b) => {
    const pa = a.pub || '0000-00'
    const pb = b.pub || '0000-00'
    return pb.localeCompare(pa)
  })
}
