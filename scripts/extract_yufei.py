#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""雨菲·四海 两本 PDF 的成语/实词知识提取管线（独立于 codex 的 kb_extract.py）。

数据源（扫描版，无文字层 → 需 OCR）：
  - 03_资料/2_言语理解/词汇·雨菲四海/雨菲言语·27言语带背800词.pdf   (174 页)
  - 03_资料/2_言语理解/词汇·雨菲四海/言语理解易混词B5.pdf           (226 页)
辅助源（有文字层，直接抽）：
  - 03_资料/2_言语理解/词汇·雨菲四海/800词随堂笔记/*.pdf

输出（均位于已被 .gitignore 忽略的 03_资料/_kb_extract/ 下，不入 git）：
  - _kb_extract/yufei/800词/page_NNN.txt     每页 OCR 文本
  - _kb_extract/yufei/易混词B5/page_NNN.txt  每页 OCR 文本
  - _kb_extract/yufei/notes_800词/<名>.txt   随堂笔记全文（清洁源，作释义校验/补全）

用法：
  python scripts/extract_yufei.py              # 全量
  python scripts/extract_yufei.py --limit 3   # 每本 PDF 仅前 3 页（试跑）
"""
import argparse
import io
import os
import subprocess
import sys
from pathlib import Path
import fitz  # pymupdf，用于渲染页面为 PNG 字节流

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "03_资料" / "2_言语理解" / "词汇·雨菲四海"
OUT = ROOT / "03_资料" / "_kb_extract" / "yufei"
TESS = r"C:\Program Files\PDF24\tesseract\tesseract.exe"
TDIR = str(ROOT / "03_资料" / "_kb_extract" / "tessdata")

# (书名, 输出子目录)
SCANNED = [
    ("雨菲言语·27言语带背800词.pdf", "800词"),
    ("言语理解易混词B5.pdf", "易混词B5"),
]


def ocr_page(doc, i):
    """渲染第 i 页为 PNG 字节流，直传 tesseract stdin（不落盘临时文件，规避批量删除保护）。"""
    pg = doc[i]
    pix = pg.get_pixmap(matrix=fitz.Matrix(3.0, 3.0))
    data = pix.tobytes("png")
    # psm 3 = 全自动版面切分；失败回退 psm 6
    r = subprocess.run(
        [TESS, "-", "stdout", "-l", "chi_sim", "--tessdata-dir", TDIR, "--psm", "3"],
        input=data, capture_output=True,
    )
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.decode("utf-8", errors="ignore").strip()
    r = subprocess.run(
        [TESS, "-", "stdout", "-l", "chi_sim", "--tessdata-dir", TDIR, "--psm", "6"],
        input=data, capture_output=True,
    )
    return r.stdout.decode("utf-8", errors="ignore").strip() if r.returncode == 0 else ""


def ocr_pdf(path, out_dir, limit):
    import fitz
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(path))
    n = doc.page_count
    print(f"[OCR] {path.name}: {n} 页 -> {out_dir}")
    for i in range(min(n, limit)):
        txt = ocr_page(doc, i)
        (out_dir / f"page_{i+1:03d}.txt").write_text(txt or "", encoding="utf-8")
        if (i + 1) % 20 == 0 or i + 1 == min(n, limit):
            print(f"    ... {i+1}/{min(n, limit)} 页")
    doc.close()


def notes_pdf(path, out_dir):
    import pdfplumber
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / (path.stem + ".txt")
    try:
        with pdfplumber.open(str(path)) as pdf:
            parts = [(pg.extract_text() or "") for pg in pdf.pages]
        out.write_text("\n".join(parts), encoding="utf-8")
        print(f"[NOTES] {path.name}: {len(pdf.pages) if 'pdf' in dir() else ''} 页 -> {out.name}")
    except Exception as e:
        print(f"[NOTES] 失败 {path.name}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=99999, help="每本扫描 PDF 最多处理页数（试跑用）")
    ap.add_argument("--book", default="", help="只处理指定书名关键词（如 易混词B5 / 800词），默认全部")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    for fname, sub in SCANNED:
        if args.book and args.book not in fname:
            continue
        p = SRC / fname
        if not p.is_file():
            print(f"[跳过] 未找到 {fname}")
            continue
        ocr_pdf(p, OUT / sub, args.limit)

    notes_dir = SRC / "800词随堂笔记"
    if notes_dir.is_dir():
        for nf in sorted(notes_dir.glob("*.pdf")):
            # 跳过带 (1) 的重复副本与广告图
            if "(1)" in nf.name or nf.suffix.lower() != ".pdf":
                continue
            notes_pdf(nf, OUT / "notes_800词")
    print("完成。输出目录：", OUT)


if __name__ == "__main__":
    main()
