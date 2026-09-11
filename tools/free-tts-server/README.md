# 免费开源中文 TTS（可克隆）本地适配服务

把**免费、开源、支持音色克隆**的中文 TTS 接进本项目，取代按字数付费的云端 TTS。

支持的后端（选一个装即可）：

| 后端 | 协议 | 中文质量 | 克隆方式 | 说明 |
|---|---|---|---|---|
| **CosyVoice2-0.5B**（阿里 FunAudioLLM） | Apache-2.0 | 接近商用 TTS | 零样本克隆（3–10 秒） | 推荐；与硅基流动付费的 `FunAudioLLM/CosyVoice2-0.5B` 是同一个模型 |
| **GPT-SoVITS** | MIT | 很自然、很像 | 少样本克隆 | 国内社区最流行，显存占用低 |
| 任意命令行模型 | 视模型而定 | — | — | 用 `FREE_TTS_CMD_TEMPLATE` 接入 |

> 为什么必须自建：能在浏览器里跑的免费模型（Kokoro-82M、Piper）**不支持音色克隆**，中文质量也达不到商用 TTS；带克隆的开源模型是 PyTorch/GPU 级，只能在电脑或服务器上跑。

---

## 一、启动本地服务

### 1. 装依赖

```bash
cd tools/free-tts-server
python -m pip install -r requirements.txt
```

建议安装 FFmpeg（把上传的 mp3/m4a 参考音频统一转 wav）。

### 2. 先跑开源 TTS 本体（二选一）

**A. CosyVoice2（推荐）**

```bash
git clone https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
git submodule update --init --recursive
python -m pip install -r requirements.txt
python runtime/python/fastapi/server.py --port 50000 --model_dir pretrained_models/CosyVoice2-0.5B
```

**B. GPT-SoVITS**

```bash
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS
python api_v2.py -a 127.0.0.1 -p 50000
```

### 3. 启动本适配服务

Windows（PowerShell）：
```powershell
$env:FREE_TTS_BACKEND="cosyvoice"
$env:FREE_TTS_BACKEND_URL="http://127.0.0.1:50000"
python server.py
```

Linux / macOS：
```bash
FREE_TTS_BACKEND=cosyvoice FREE_TTS_BACKEND_URL=http://127.0.0.1:50000 python server.py
```

看到这行就成功了：
```
[free-tts] 在项目「设置 → 语音 → OpenAI 兼容」里填：http://127.0.0.1:9099/v1
```

---

## 二、在项目里接上（不用改代码）

打开 **设置 → 语音 → OpenAI 兼容**：

| 字段 | 填什么 |
|---|---|
| 服务地址 | `http://127.0.0.1:9099/v1` |
| Key | 随便填（本地服务不校验，例如 `local`） |
| 模型 | `cosyvoice2` 或 `gpt-sovits` |

然后在 **设置 → 萌宠 → 克隆角色原声** 上传 3–30 秒参考音频并克隆，切到该萌宠即可用你的声音朗读。朗读、读题、微课讲稿全部走这条链路，**0 费用**。

---

## 三、手机怎么用

- **安卓 APK**：手机与电脑同一 Wi-Fi，地址换成电脑局域网 IP，例如 `http://192.168.1.8:9099/v1`。
  Windows 放行端口：`netsh advfirewall firewall add rule name="free-tts" dir=in action=allow protocol=TCP localport=9099`
- **网页版 / iOS PWA**：浏览器禁止 HTTPS 页面调用 `http://局域网IP`（混合内容）。
  - 本机自用：地址填 `http://127.0.0.1:9099/v1`（服务需在同一台机器）；
  - 手机用网页版：给本服务套 HTTPS（如 Caddy 反代 + 域名），或直接用安卓 APK。

---

## 四、接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/v1/models` | 可用模型列表 |
| POST | `/v1/uploads/audio/voice` | 上传参考音频（multipart：`model` / `customName` / `file` / 可选 `prompt_text`） |
| GET | `/v1/voices` | 已保存的音色 |
| DELETE | `/v1/voices/{id}` | 删除音色 |
| POST | `/v1/audio/speech` | 文本转语音（OpenAI 兼容） |

`prompt_text` 是参考音频对应的文字：填了克隆最准；留空会自动改用 CosyVoice 的免转录模式。

---

## 五、常见问题

**Q：一直转圈 / 报 502？** 上游模型没起来。先访问 `http://127.0.0.1:50000/docs` 确认 CosyVoice / GPT-SoVITS 正常。

**Q：声音不像？** 参考音频选 5–15 秒、干净无背景音；填上 `prompt_text`（参考音频的原话）效果明显更好。

**Q：没有显卡能跑吗？** CosyVoice2-0.5B 在 CPU 上也能跑，只是慢；有 6GB 以上显存体验最好。

**Q：要花钱吗？** 模型与代码均为开源（CosyVoice2 = Apache-2.0，GPT-SoVITS = MIT），本地推理只有电费。
