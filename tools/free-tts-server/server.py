#!/usr/bin/env python3
"""免费开源中文 TTS 适配服务器（OpenAI 兼容 + 音色克隆）

为什么需要它：CosyVoice2 / GPT-SoVITS / F5-TTS 这些开源模型本身免费、中文质量
接近商用 TTS、且支持零样本音色克隆，但它们只提供各自的原生接口，不是 OpenAI
兼容格式。本服务把它们包成项目已经支持的接口，于是「设置 → 语音 → OpenAI 兼容」
直接填本机地址即可，一分钱不花。

对外接口（与项目现有「OpenAI 兼容」引擎完全对齐）：
  GET  /v1/models                     列出可用模型
  POST /v1/uploads/audio/voice        上传 3-30 秒参考音频 → 得到一个可用的音色名
                                      multipart: model / customName / file
  POST /v1/audio/speech               文本转语音（OpenAI 兼容）
                                      JSON: model / input / voice / speed / response_format
                                      voice 支持 "模型:音色名" 或直接 "音色名"
  GET  /health                        健康检查

后端通过环境变量选择（默认 cosyvoice）：
  FREE_TTS_BACKEND      cosyvoice | gpt-sovits | command
  FREE_TTS_BACKEND_URL  后端地址，如 http://127.0.0.1:50000
  FREE_TTS_CMD_TEMPLATE command 模式下的命令模板，占位符 {text} {ref} {out}

参考音频与说明存在 FREE_TTS_DATA（默认 ./data）目录，纯本地、不上传任何第三方。
"""

import hashlib
import json
import os
import pathlib
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

try:
    import httpx
except ImportError:  # pragma: no cover - 启动时给出明确提示
    print("[free-tts] 缺少依赖 httpx，请先执行：pip install -r requirements.txt", file=sys.stderr)
    raise

ROOT = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path(os.environ.get("FREE_TTS_DATA", str(ROOT / "data"))).resolve()
VOICE_DIR = DATA / "voices"
VOICE_DIR.mkdir(parents=True, exist_ok=True)

BACKEND = os.environ.get("FREE_TTS_BACKEND", "cosyvoice").strip().lower()
BACKEND_URL = os.environ.get("FREE_TTS_BACKEND_URL", "http://127.0.0.1:50000").rstrip("/")
CMD_TEMPLATE = os.environ.get("FREE_TTS_CMD_TEMPLATE", "")
SPEED_MIN, SPEED_MAX = 0.5, 2.0

MODEL_NAMES = {
    "cosyvoice": ["cosyvoice2"],
    "gpt-sovits": ["gpt-sovits"],
    "command": ["custom"],
}.get(BACKEND, ["cosyvoice2"])

app = FastAPI(title="Free Chinese TTS Adapter", version="1.0.0")
# 桌面网页 / 安卓 WebView 会以不同 Origin 访问本机服务，统一放行 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def safe_name(name: str) -> str:
    """只保留安全字符，避免路径穿越。"""
    keep = "".join(ch for ch in str(name or "") if ch.isalnum() or ch in "-_")
    return keep[:48] or hashlib.md5(str(time.time()).encode()).hexdigest()[:12]


def voice_paths(voice_id: str):
    base = VOICE_DIR / safe_name(voice_id)
    return base.with_suffix(".wav"), base.with_suffix(".json")


def save_meta(voice_id: str, meta: dict):
    _, meta_path = voice_paths(voice_id)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def load_meta(voice_id: str) -> dict:
    _, meta_path = voice_paths(voice_id)
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def parse_voice(voice: str) -> str:
    """项目传入的 voice 形如 "模型名:音色名"，这里取出音色名。"""
    v = str(voice or "").strip()
    if not v:
        return ""
    if ":" in v:
        v = v.split(":", 1)[1].strip()
    return safe_name(v) if v else ""


def to_wav(src: pathlib.Path, dst: pathlib.Path) -> bool:
    """用 ffmpeg 统一转成 24kHz 单声道 WAV（项目上传的音频可能已是 wav）。"""
    if not shutil.which("ffmpeg"):
        if src.suffix.lower() == ".wav":
            shutil.copyfile(src, dst)
            return True
        return False
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-ac", "1", "-ar", "24000", "-acodec", "pcm_s16le", str(dst),
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception:
        return False


def clamp_speed(value) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 1.0
    if not n:
        return 1.0
    return max(SPEED_MIN, min(SPEED_MAX, n))


async def synth_cosyvoice(text: str, ref_wav: pathlib.Path, prompt_text: str, speed: float) -> bytes:
    """调用本地 CosyVoice FastAPI（runtime/python/fastapi/server.py）。

    有参考文本 → inference_zero_shot（克隆最准）；没有 → inference_cross_lingual（免转录）。
    """
    url = BACKEND_URL + ("/inference_zero_shot" if prompt_text else "/inference_cross_lingual")
    with ref_wav.open("rb") as fh:
        files = {"prompt_wav": (ref_wav.name, fh, "audio/wav")}
        data = {"tts_text": text}
        if prompt_text:
            data["prompt_text"] = prompt_text
        async with httpx.AsyncClient(timeout=180.0) as client:
            r = await client.post(url, data=data, files=files)
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"CosyVoice 返回 {r.status_code}: {r.text[:200]}")
    return r.content


async def synth_gpt_sovits(text: str, ref_wav: pathlib.Path, prompt_text: str, speed: float) -> bytes:
    """调用 GPT-SoVITS 的 api_v2.py（/tts）。"""
    payload = {
        "text": text,
        "text_lang": "zh",
        "ref_audio_path": str(ref_wav),
        "prompt_text": prompt_text,
        "prompt_lang": "zh",
        "media_type": "wav",
        "streaming_mode": False,
        "speed_factor": speed,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(BACKEND_URL + "/tts", json=payload)
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"GPT-SoVITS 返回 {r.status_code}: {r.text[:200]}")
    return r.content


async def synth_command(text: str, ref_wav: pathlib.Path, prompt_text: str, speed: float) -> bytes:
    """万能逃生舱：把任意命令行模型包进来，模板里用 {text} {ref} {out} 占位。"""
    if not CMD_TEMPLATE:
        raise HTTPException(status_code=500, detail="command 模式需要设置 FREE_TTS_CMD_TEMPLATE")
    with tempfile.TemporaryDirectory() as tmp:
        out = pathlib.Path(tmp) / "out.wav"
        cmd = CMD_TEMPLATE.format(text=shlex.quote(text), ref=shlex.quote(str(ref_wav)), out=shlex.quote(str(out)))
        proc = subprocess.run(cmd, shell=True, capture_output=True)
        if proc.returncode != 0 or not out.exists():
            detail = proc.stderr.decode("utf-8", "ignore")[:300] or "命令执行失败"
            raise HTTPException(status_code=502, detail=detail)
        return out.read_bytes()


SYNTH = {"cosyvoice": synth_cosyvoice, "gpt-sovits": synth_gpt_sovits, "command": synth_command}


@app.get("/health")
async def health():
    return {
        "ok": True,
        "backend": BACKEND,
        "backend_url": BACKEND_URL,
        "voices": len(list(VOICE_DIR.glob("*.wav"))),
        "models": MODEL_NAMES,
    }


@app.get("/v1/models")
async def list_models():
    return {"object": "list", "data": [{"id": m, "object": "model", "owned_by": "local"} for m in MODEL_NAMES]}


@app.post("/v1/uploads/audio/voice")
async def upload_voice(
    model: str = Form(""),
    customName: str = Form(""),
    prompt_text: str = Form(""),
    file: UploadFile = File(...),
):
    """保存参考音频。项目克隆流程正是调用这个路径，因此无需改动前端。"""
    voice_id = safe_name(customName or file.filename or f"voice{int(time.time())}")
    wav_path, _ = voice_paths(voice_id)
    suffix = pathlib.Path(file.filename or "ref.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = pathlib.Path(tmp.name)
    try:
        if not to_wav(tmp_path, wav_path):
            raise HTTPException(status_code=400, detail="参考音频转换失败：请安装 ffmpeg，或直接上传 wav")
    finally:
        tmp_path.unlink(missing_ok=True)
    save_meta(voice_id, {"prompt_text": prompt_text.strip(), "model": model, "created": int(time.time())})
    return {"id": voice_id, "name": voice_id, "uri": f"local://{voice_id}", "prompt_text": prompt_text.strip()}


@app.get("/v1/voices")
async def list_voices():
    out = []
    for wav in sorted(VOICE_DIR.glob("*.wav")):
        meta = load_meta(wav.stem)
        out.append({"id": wav.stem, "name": wav.stem, "prompt_text": meta.get("prompt_text", "")})
    return {"data": out}


@app.delete("/v1/voices/{voice_id}")
async def delete_voice(voice_id: str):
    wav, meta = voice_paths(voice_id)
    wav.unlink(missing_ok=True)
    meta.unlink(missing_ok=True)
    return {"ok": True}


@app.post("/v1/audio/speech")
async def speech(req: Request):
    body = await req.json()
    text = str(body.get("input") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="input 为空")
    voice_id = parse_voice(body.get("voice"))
    if not voice_id:
        raise HTTPException(status_code=400, detail="请先克隆一个音色，或传入 voice")
    wav_path, _ = voice_paths(voice_id)
    if not wav_path.exists():
        raise HTTPException(status_code=404, detail=f"音色 {voice_id} 不存在，请先上传参考音频")
    meta = load_meta(voice_id)
    speed = clamp_speed(body.get("speed"))
    fn = SYNTH.get(BACKEND)
    if not fn:
        raise HTTPException(status_code=500, detail=f"未知后端 {BACKEND}")
    audio = await fn(text, wav_path, str(meta.get("prompt_text") or ""), speed)
    if not audio:
        raise HTTPException(status_code=502, detail="后端没有返回音频")
    return Response(content=audio, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("FREE_TTS_PORT", "9099"))
    print(f"[free-tts] 后端={BACKEND} 上游={BACKEND_URL} 端口={port}")
    print(f"[free-tts] 在项目「设置 → 语音 → OpenAI 兼容」里填：http://127.0.0.1:{port}/v1")
    uvicorn.run(app, host="0.0.0.0", port=port)
