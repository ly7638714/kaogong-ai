# 📐 开发规范（CONVENTIONS）

> 本项目的代码风格与工程约定，配合 ESLint / Prettier 使用。
> 命令：`npm run lint` / `npm run format`（在 01_源码 下）。

---

## 一、代码风格（由 Prettier/ESLint 强制）

- 缩进：2 空格；无分号（`semi:false`）；单引号；`printWidth:120`。
- 提交前必须 `npm run lint` 通过（`--max-warnings=0`，0 error 0 warning）。
- 如想自动格式化整个源码：`npm run format`。

## 二、文件组织

```
src/
├── api/            后端/模型对接（分层）
│   ├── client.js   双模型路由 + 流式/单次对话 + AI 整理（低层 fetch）
│   ├── detect.js   板块自动识别（detectBanKuai）
│   ├── tasks.js    智能训练（出题/变式/诊断提示词） + PLATE_MODE 映射
│   └── sys.js      系统提示词组装（buildSys）
├── api.js          聚合再导出层（对外接口，其他模块 `from '../api'`）
├── components/     页面组件（PascalCase.vue）
├── utils/          纯工具（chat/export/renderMd/toast/tts）
├── store.js        全局状态（reactive）
├── kb.js           知识库（SYS + KB 专项 + MODE_NAMES），只放数据/文案
└── styles.css      全局样式 + 设计 token
```

## 三、组件规范（Vue 3 Composition API，`<script setup>`）

- **命名**：组件文件名 PascalCase（如 `ChatPage.vue`）；`<script setup>` 顶层。
- **props**：用 `defineProps` + 必要时 `withDefaults`；不用 `require-default` 强制（已关闭该规则）。
- **事件**：`defineEmits` 声明，命名用 kebab 转发（如 `@export-review`）。
- **状态**：全局用 `store`（`store.js` 的 reactive）；组件本地用 `ref`/`computed`。
- **样式**：全局样式放 `styles.css`（用设计 token）；组件独有且复杂可加 `<style scoped>`（参考 FloatPanel）。优先复用全局 token：`--radius-*`、`--shadow-*`、`--space-*`、`--accent` 等。
- **用户反馈**：一律用 `showToast(msg, type)`（`utils/toast`），**禁止 `alert()`**；破坏性操作（删除/清空）用 `confirm()` 确认。
- **加载/空态**：加载用 `.skel` 骨架或 `busy` 态；空态复用 `.empty` 结构。
- **emoji**：允许，但同一功能的图标保持固定映射；新图标优先从 `📌🔁📄📊📚🧠🏛️🛡️📜🌍` 等已有集合选。

## 四、API 层约定

- 其他模块**只能**从 `../api`（聚合层）导入，不要直接 `import` 进 `api/client.js` 等子模块内部函数——保持聚合层为唯一对外出口。
- 新增模型相关函数进 `api/client.js`，板块识别进 `api/detect.js`，训练任务进 `api/tasks.js`，提示词拼装进 `api/sys.js`。

## 五、发布同步（防漏）

- 改完代码后，在仓库**根目录**运行：
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/sync-dist.ps1
  ```
  它会自动：`build` → 同步新版到 `02_发布物/` 与 `04_安卓/行测AI助手/` → 清理旧 hash → 重建发布包 zip。
- 若改了 `kb.js`/`api/*`（提示词），**必须**重跑同步，否则网页版/APK 不生效。
- `01_源码/dist` 已被 gitignore（以 `02_发布物` 为准提交）。
- APK 需在 HBuilderX 另做云打包替换。

## 六、安全

- 禁止把 API Key 写进源码/`.env` 提交；`.env.example` 只作说明。
- 敏感文件：`deepseek_API.txt`、`hermes-config/.env`、`*.pem/*.key/*.keystore/*.jks` 均已 gitignore。
