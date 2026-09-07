#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地讲义抽取管线：把 03_资料 里的 txt/md/docx/pdf 文本统一归档到 03_资料/_kb_extract/，
   供后续把每个板块/老师的讲义内容碎片化成知识卡（持续“深度学习本地资料”）。
   用法：python scripts/kb_extract.py [--ocr] [--limit N]
   - txt/md：直接复制内容
   - docx：python-docx 逐段提取（无依赖时跳过并提示）
   - pdf：pdfplumber 提取文字层；加 --ocr 时对图片版用 PyMuPDF + Tesseract(chi_sim) OCR
   - --limit N：每目录最多处理 N 个文件（分批/试跑用）
   环境变量：TESSERACT=可执行文件路径（默认 PDF24 自带 tesseract）
   中文语言包放 03_资料/_kb_extract/tessdata/chi_sim.traineddata
   输出不入 git（已 .gitignore）。"""
import argparse
import io
import os
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "03_资料"
OUT = SRC / "_kb_extract"

PLATE_MAP = {
    "1_判断推理": "判断推理",
    "2_言语理解": "言语理解",
    "3_资料数量分析": "资料数量",
    "4_政治理论": "政治理论",
    "5_真题套卷": "真题套卷",
    "6_常识判断": "常识判断",
}


def docx_text(path):
    try:
        import docx
    except Exception:
        return None
    try:
        d = docx.Document(str(path))
        return "\n".join(p.text for p in d.paragraphs if p.text.strip())
    except Exception:
        return None


def pdf_text(path):
    try:
        import pdfplumber
    except Exception:
        return None
    try:
        with pdfplumber.open(str(path)) as pdf:
            return "\n".join((pg.extract_text() or "") for pg in pdf.pages)
    except Exception:
        return None


def pdf_ocr(path, tess, tdir, max_pages=12):
    try:
        import fitz
    except Exception:
        import pymupdf as fitz
    try:
        doc = fitz.open(str(path))
        out = []
        for i, pg in enumerate(doc):
            if i >= max_pages:
                break
            pix = pg.get_pixmap(matrix=fitz.Matrix(2.2, 2.2))
            tmp = path.with_name("_ocr_tmp.png")
            pix.save(str(tmp))
            r = subprocess.run(
                [tess, str(tmp), "stdout", "-l", "chi_sim", "--tessdata-dir", tdir, "--psm", "6"],
                capture_output=True, text=True, encoding="utf-8",
            )
            tmp.unlink(missing_ok=True)
            if r.returncode == 0 and r.stdout.strip():
                out.append(r.stdout.strip())
        doc.close()
        return "\n".join(out)
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ocr", action="store_true", help="对图片版 PDF 执行中文 OCR")
    ap.add_argument("--limit", type=int, default=0, help="每目录最多处理 N 个文件")
    args = ap.parse_args()
    tess = os.environ.get("TESSERACT") or r"C:\Program Files\PDF24\tesseract\tesseract.exe"
    tdir = str(OUT / "tessdata")
    OUT.mkdir(exist_ok=True)
    stats = {}
    for plate_dir, plate in PLATE_MAP.items():
        base = SRC / plate_dir
        if not base.is_dir():
            continue
        dout = OUT / plate
        dout.mkdir(exist_ok=True)
        n = 0
        for k, f in enumerate(sorted(base.rglob("*"))):
            if not f.is_file():
                continue
            if args.limit and k >= args.limit:
                break
            low = f.name.lower()
            if f.suffix.lower() == ".txt" or low.endswith(".md") or low.endswith(".markdown"):
                try:
                    text = f.read_text(encoding="utf-8", errors="ignore")
                    if len(text.strip()) >= 120:
                        (dout / (f.stem + ".txt")).write_text(text, encoding="utf-8")
                        n += 1
                except Exception:
                    pass
            elif f.suffix.lower() == ".docx":
                text = docx_text(f)
                if text and len(text.strip()) >= 120:
                    (dout / (f.stem + ".txt")).write_text(text, encoding="utf-8")
                    n += 1
            elif f.suffix.lower() == ".pdf":
                text = pdf_text(f)
                if (not text or len(text.strip()) < 120) and args.ocr:
                    text = pdf_ocr(f, tess, tdir)
                if text and len(text.strip()) >= 120:
                    (dout / (f.stem + ".txt")).write_text(text, encoding="utf-8")
                    n += 1
        stats[plate] = n
        print(f"[{plate}] {n} 个文本归档 -> {dout}")
    print(f"合计归档 {sum(stats.values())} 个文本。{'OCR 模式开启' if args.ocr else '（图片版 PDF 可加 --ocr）'}")


if __name__ == "__main__":
    main()
