# 行测名师 AI 小助理

一个从实际备考里长出来的行测工具，不是通用聊天机器人。它把薛睿、郭熙、花生十三、小P、小黑、LY 等老师讲义里的可执行做题流程拆成方法卡，再在答题时按“板块 → 细分 → 题型 → 意图”召回，让 AI 照着方法讲题，而不是凭空发挥。

当前产品形态：网页/iPad（PWA）与安卓 App。网页仓库和手机端深度开发仓库分开维护，这个目录是开发时的本地工作区。

## 两个仓库

| 形态 | 代码目录 | 远程仓库 |
| --- | --- | --- |
| 网页 / iPad | `01_源码/` | GitHub：`ly7638714/kaogong-ai`，Gitee：`KKAALY13/kaogong-ai` |
| 安卓正式版 + 7 天试用版 | `06_MobileApp-DeepDev/` | GitHub：`ly7638714/MobileApp-DeepDev` |

`06_MobileApp-DeepDev` 是独立 git 仓库，里面另有自己的 README 与构建说明。

## 网页端

```bash
cd 01_源码
npm install
npm run dev
```

日常发布：

```bash
npm run build
powershell -ExecutionPolicy Bypass -File ..\scripts\sync-dist.ps1
```

`sync-dist.ps1` 会把构建结果同步到 `02_发布物/`、`docs/`，并重建发布 zip。Cloudflare Pages 的 `/api/*` Function 在 `functions/api/`，用于给 OpenAI 兼容中转补浏览器跨域头。

正式访问地址：

- Cloudflare Pages：https://kaogong-ai.pages.dev

## 安卓端

进 `06_MobileApp-DeepDev` 后看该仓库的 README。常用两条命令：

```powershell
pwsh -File _重建WEB并同步到APP.ps1
pwsh -File _打包正式与试用APK.ps1
```

后一条会产出两个可同时安装的 APK：

- 正式版：`com.xingce.ai`
- 7 天试用版：`com.xingce.ai.trial`

试用版需要邀请码，首次输入正确邀请码后计时 7 天，到期自动锁定。

## 本地目录怎么用

下面这些目录只留在本机，不上传 GitHub/Gitee：

- `03_资料/`：原始讲义、真题 PDF、OCR 中间结果。大、可能涉版权，只做知识蒸馏原料。
- `05_工程与产品评估/`：开发过程报告、验收清单、golden 测试集。
- `行测用户数据/`、`声音自定义/`：个人使用数据与音色素材。
- `04_安卓/`、`archive_旧版本/`：旧 HBuilderX 与历史归档，仅作回收前保留，移动端已迁出。
- `02_发布物/*.apk` 与各仓库 `APK/`：本地安装包，不进 git。

上传到仓库的内容严格限制为：源码、构建发布物、Cloudflare Function、必要脚本、README/CHANGELOG/使用说明。API Key、邀请码、讲义大文件、用户数据、APK、签名证书、IDE/代理状态都按 `.gitignore` 排除。

## 主要功能

- 对话答题：自动识别板块和题型，按本地方法卡讲解；能收文字、图片、语音。
- 智能出题：AI 整卷、单题快练、真题组卷、资料速算四层训练。
- 错题闭环：判错 → 错因分类 → 二刷 → 变式 → 复盘。
- 积累与记忆：常识、时政、成语、实词，配合记忆复习。
- 其他：错题 PDF/Word 导出、本地文件夹备份、WebDAV/Gitee/GitHub 同步、萌宠、背景音乐、全局搜索。

## 使用说明

面向最终使用者的说明在 `使用说明.md`；开发细节、构建脚本和安卓适配记录分别在 `01_源码/` 与 `06_MobileApp-DeepDev/` 内。

这不是商业项目，API Key 都由每个用户自己填进本地浏览器或 App。
