# 🏠 行测 AI 问答助手 · 装修路线图（Roadmap）

> 定位：项目**功能已完整、可正常使用**，但工程观感偏"毛坯房"（单文件 CSS、大量 alert、无 lint/测试/脚手架规范）。
> 本路线图把"专业化装修"拆成可独立验收、可回滚的 P0–P4 五个阶段，按性价比递增顺序推进。
> 配套开发说明见 [`README.md`](README.md)，使用者说明见 [`使用说明.md`](使用说明.md)。

---

## 现状盘点（"毛坯"具体表现）

| 维度 | 现状 | 问题 |
|---|---|---|
| 工程化 | 无 ESLint / Prettier / TypeScript / 测试 / `.env` 规范，scripts 仅 `dev/build/preview` | 无约束，改代码心里没底，无法自动化验证 |
| 样式 | `styles.css` 单文件约 25KB；CSS 变量体系已具备但不全；`FloatPanel` 用 scoped、其余组件样式混在全局 | 结构松散，改一处易波及全站 |
| 反馈 | 大量 `alert()`；`toast` 已实现但未普及；`loading/骨架屏` 缺 | 弹窗生硬，无加载态，最"毛坯" |
| 路由/状态 | 页面用 `v-show` 切换（无 URL）；状态用手写 `reactive` | 无法深链/分享；无撤销等高级交互 |
| 稳健性 | 无错误边界、无全局异常捕获、无请求重试 | API 出错只能 alert |
| 发布 | 手动复制 dist → 发布物/安卓 | 易漏同步（已出过 APK 过期问题） |

---

## P0 · 视觉与体验软装修（约 1–2 天 · 不动业务逻辑，风险最低）

- [x] `PROJECT_ROADMAP.md` 落盘（本文档）
- [x] **设计 token 化**：`styles.css` 补全 `--radius` / `--shadow` / `--space-*` / 字号层级，按钮/卡片/弹窗统一圆角与阴影
- [x] **alert → toast 统一**：新增公共 `useToast()` / `toast.js`，替换全部 `alert()`（含 App/FloatPanel/WrongPage/Settings 等）；`confirm()` 保留
- [x] **loading 骨架屏**：对话流式中"正在思考"加骨架/光标动效；列表页（错题/知识库）加轻量骨架
- [x] **空态/错误态统一**：复用 `.empty`，补充"请求失败·重试"公共按钮
- [ ] **图标系统**：散落 emoji 统一为固定映射（可选引入 `lucide-vue-next`）
- [x] **移动端细节**：补 `env(safe-area-inset-*)` 安全区、`enterkeyhint`
- [x] **玻璃霓虹精装修**（后补）：渐变底 + 漂浮光球 + 粒子网格动态背景；卡片/按钮/页签/输入玻璃拟态；霓虹发光、渐变文字、消息动效、呼吸光标（纯 CSS 零依赖，三端已同步）
- [x] **考场沉浸式 UI**（后补）：**青蓝军武/航天总控风**重配色 + 考试倒计时状态栏 + 考场氛围音(Web Audio 合成) + 答题卡/批改笔迹徽标 + 作答耗时统计 + HUD 扫描线/角标
- [x] **3D 知识星球大改版**（后补）：引入 **Three.js**，全屏 WebGL 主星球+六大板块行星轨道图，数据驱动行星规模/发光/脉冲；UI 重组为 **3D 背景 + HUD 浮层**；three 独立分块 + WebGL 降级保护

验收：全站无 `alert()`；深浅色/5 强调色下观感一致；加载有反馈。

---

## P1 · 工程化基建（约 1–2 天 · 让项目"规范化"）

- [x] **ESLint + Prettier + EditorConfig**：一次性配置，`npm run lint` / `npm run format`
- [x] **scripts 补全**：`lint` / `format` / `format:check`
- [x] **环境变量规范**：新增 `.env.example`，整理可配置项
- [x] **目录规整**：`api.js` 拆为 `api/client.js`（模型对话）、`api/detect.js`（板块识别）、`api/tasks.js`（智能训练）、`api/sys.js`（提示词）；`api.js` 作聚合再导出层，对外接口不变
- [x] **组件规范文档**：`CONVENTIONS.md`（命名、props/emits、API 层、发布、安全约定）
- [x] **发布同步脚本**：`scripts/sync-dist.ps1`（一键 build → 同步 02_发布物/04_安卓 → 清旧 hash → 打 zip），根治漏同步

> 📌 说明：由于 Prettier 会把 Vue 模板内联的多语句 `@click="a;b"` 折行导致编译报错，已在 `.prettierignore` 排除 `src/**/*.vue`（由 ESLint + 手写维护模板），Prettier 只格式化 JS/CSS/JSON/MD 等。

验收：`npm run lint` 零告警；`sync-dist` 一键同步三端。

---

## P2 · 交互与功能专业化（约 2–3 天 · 用户体验质变）

- [x] **Markdown 渲染增强**：代码块加**复制按钮**（`⧉ 复制`，点击变 `✅ 已复制`）+ 样式打磨
- [x] **流式输出增强**：**停止生成按钮**（`AbortController`，busy 时发送键变红色 ⏹ 停止）、思考中动画/光标（P0 已做）
- [x] **对话可管理**：单条 **复制**（AI/用户消息）、用户消息 **↻ 重发**、失败消息 **↻ 重试**（P0 已做）
- [x] **设置页 loading**：连接测试 loading（`testBusy`，按钮禁用+文案"检测中…"）、AI 整理导出忙碌 toast
- [x] **键盘快捷键**：`Ctrl/Cmd+K` 聚焦搜索、`Esc` 收起搜索、`Ctrl/Cmd+1..5` 切换页签
- [x] **URL 深链**：轻量 hash 路由（`#/ck #/chat #/kb #/ths #/stat #/wq`），启动读 hash、切页写 hash、hashchange 双向同步，与面板返回栈（pushState）兼容，无需引入 vue-router

> 📌 说明：**对话按天分组**因需给 `store.msgs` 每条约增加时间戳并迁移持久化格式，为兼容既有 `localStorage` 数据暂缓，待后续 v2 数据层重构时一并处理。

---

## P3 · 架构与质量加固（约 3–5 天 · 可选渐进）

- [x] **Vitest 单元测试**：核心纯函数优先——`detectBanKuai`(10)、`supportsVision`/`activeCfg`(9)、`chatStream`(5，mock fetch)、`getPayload`(2)，共 26 用例全绿
- [ ] **TypeScript 渐进迁移**：先 `jsconfig` 严格检查，再逐个迁 `.ts`（或先用 JSDoc）——可选，暂缓
- [x] **错误边界 + 全局异常捕获**：`window.onerror` + `unhandledrejection` + Vue `app.config.errorHandler` → toast（节流）+ localStorage 滚动日志（`utils/errorLog.js`），设置「关于」可查看/清空
- [ ] **Pinia（可选）**：当前 `reactive` 规模够用，不推荐现在引入

---

## P4 · 发布与运维收尾（约 1 天）

- [x] **CI 全流程（代码侧）**：`lint → test → build → 部署`；触发分支兼容 `main`/`master`；部署仍需配置远程仓库/开启 Pages
- [x] **CHANGELOG.md + 版本号**：新增根目录 CHANGELOG.md；package.json / 应用「关于」版本对齐 v3.1.0
- [ ] **APK 重新打包**：同步最新资源后在 HBuilderX 云打包替换过期 APK
- [ ] **部署上线**：配置远程仓库、推送 main、获取永久网址

---

## 执行顺序建议

```
P0（软装修，立即见效）→ P1（工程化地基）→ P2（交互质变）→ P3（质量加固，可选）→ P4（发布收尾）
```

每一步独立可验收、可回滚；优先 P0→P1→P2，P3/P4 按需渐进。当前阶段：**P0–P3 均已完成并提交，且追加了"玻璃霓虹"UI 精装修、3D 知识星球、考场沉浸式 UI**；2026-08-28 追加 **P3 错误边界 + P2 URL 深链 + P4 CI/CHANGELOG/版本号（v3.1.0）**，并修复 lint 回归至零告警。剩余可选/需外部环境项：图标系统（lucide）、TypeScript 渐进迁移、Pinia（不推荐）；P4 收尾仍需 **HBuilderX 重打 APK** 与 **配置远程仓库部署上线**（本机/网络就绪后执行）。
> ⚠️ 提示：已同步最新 web 资源到 02_发布物/04_安卓 及发布包 zip；`02_发布物/` 仅保留最新 APK（v2.3.0），历史 APK 已归档到 `archive_旧版本/APK历史版本/`；待代码稳定后需在 HBuilderX 重新云打包替换最新版。
