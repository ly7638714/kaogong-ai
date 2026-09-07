#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 OCR 文本解析 + 清洗为结构化 JSON，并由 JSON 生成 src/ku/yufeiLexicon.js。

流程：
  1) parse_800  : 800词主书 -> (word, def)，词级纠错 + 4字/2字分类 + 去重
  2) parse_yihun : 易混词B5 -> 200 组易混对（待内容页格式确认后启用）
  3) gen_js     : 读取 _parsed_*.json，写出 src/ku/yufeiLexicon.js

用法：
  python scripts/parse_yufei.py --only 800
  python scripts/parse_yufei.py --only yihun
  python scripts/parse_yufei.py --only gen
  python scripts/parse_yufei.py            # 全做
"""
import argparse
import glob
import io
import json
import os
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
Y = ROOT / "03_资料" / "_kb_extract" / "yufei"
OUT_JS = ROOT / "01_源码" / "src" / "ku" / "yufeiLexicon.js"

# 参考集：常见公考成语 + 项目已有 CHENGYU/SHICI（运行时动态并入）
from idiom_ref import COMMON, VALID_ALTS  # noqa: E402


def _load_existing_words():
    """从 FloatPanel.vue 读取已有 CHENGYU/SHICI 的词头，作为已校验基准。"""
    p = ROOT / "01_源码" / "src" / "components" / "FloatPanel.vue"
    if not p.exists():
        return set()
    txt = p.read_text(encoding="utf-8")
    return set(re.findall(r"t:\s*'([^']+)'", txt))


KNOWN = set(COMMON) | set(VALID_ALTS) | _load_existing_words()
KNOWN4 = [w for w in KNOWN if len(w) == 4]


def _edit_dist(a, b):
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            tmp = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = tmp
    return dp[n]


def correct_word(w):
    """词头纠错：先查人工 WORD_FIX，再精确命中保留；与已知成语编辑距离=1（单字误识）则纠错；否则保留原词。"""
    w = WORD_FIX.get(w, w)
    if w in KNOWN:
        return w
    if len(w) == 4:
        # 只接受“恰好 1 个替换”的候选，降低误纠风险
        best = None
        best_d = 99
        for k in KNOWN4:
            if abs(len(k) - 4) > 1:
                continue
            d = _edit_dist(w, k)
            # 仅当差异恰好为 1 个替换（非增删）时考虑
            if d == 1 and sum(1 for i in range(4) if w[i] != k[i]) == 1:
                if d < best_d:
                    best_d = d
                    best = k
        if best:
            return best
    return w

# 800词：每条 = 【词】释义（词 2~6 字，闭合符可能是 】或 ]）
RE_800 = re.compile(r"【\s*([\u4e00-\u9fff]{2,6})\s*[】\]]\s*(.+)")

# 易混词B5：每条 = 词：释义（或 词:释义），随后可有 例句：。组头为“第X组”。
RE_DEF = re.compile(r"^([\u4e00-\u9fff]{2,6})\s*[：:]\s*(.+)$")
RE_EX = re.compile(r"^例句\s*[：:]\s*(.+)$")
RE_HDR = re.compile(r"第[一二三四五六七八九十百零]+组")
# 习题/解析区标记，遇到即停止把后续行并入释义
QUIZ_MARKERS = ("依次填入", "的一项是", "画线部分", "本组学习", "第一空", "第二空",
                "第三空", "第四空", "解析", "答案", "A.", "B.", "C.", "D.",
                "A．", "B．", "C．", "D．", "说法错误的是", "正确的是")

# 词级纠错（OCR 对成语/实词本身的常见误识，词是检索关键，必须修准）
WORD_FIX = {
    # 800词 主书
    "长驱直和人": "长驱直入",
    "贺回吞囊": "囫囵吞枣",
    "暴珍天物": "暴殄天物",
    "安分守已": "安分守己",
    "按图索又": "按图索骥",
    "销钞烈烈": "轰轰烈烈",
    "画龙点晴": "画龙点睛",
    "画虎类犬": "画虎类犬",
    # 易混词B5
    "相得益彭": "相得益彰",
    "珠联友合": "珠联璧合",
    "担襟见肘": "捉襟见肘",
    "浅尝辑止": "浅尝辄止",
    "举足罗二": "举足轻重",
    "相去其远": "相去甚远",
    "了如指风": "了如指掌",
    "信手牛来": "信手拈来",
    "游牙有余": "游刃有余",
    "未雨岗组": "未雨绸缪",
    "展见不鲜": "屡见不鲜",
    "循规蹈短": "循规蹈矩",
    "照猫画虎": "照猫画虎",
    "故步自封": "故步自封",
    "墨守成规": "墨守成规",
    "千篇一律": "千篇一律",
    "如数家珍": "如数家珍",
    "层出不穷": "层出不穷",
    "不一而足": "不一而足",
    "责无旁贷": "责无旁贷",
    "义不容辞": "义不容辞",
    # 800词 主书（多字/双字误识，编辑距离>1，需显式校正）
    "差强人疙": "差强人意",
    "凤兴夜宁": "夙兴夜寐",
    "紫目结舌": "瞠目结舌",
    "吻众取宠": "哗众取宠",
    "东施效客": "东施效颦",
    "饮焰止渴": "饮鸩止渴",
    "咯之以鼻": "嗤之以鼻",
    "来势油油": "来势汹汹",
    "一言九易": "一言九鼎",
    "不局一顾": "不屑一顾",
    "周然失色": "黯然失色",
    "阿读奉承": "阿谀奉承",
    "爱民分明": "爱憎分明",
    "氢苗助长": "揠苗助长",
    "吾古不变": "亘古不变",
    "时目结舌": "瞠目结舌",
    "独树一织": "独树一帜",
    "妙笔生花": "妙笔生花",
    "至孜以求": "孜孜以求",
    "嘱目": "瞩目",
    "美轮美负": "美轮美奂",
    "万光养上": "韬光养晦",
}

# 释义内的安全多字替换（仅替换明确无误的误识串，避免单字误伤）
DEF_FIX = [
    ("太踊", "糟蹋"),
    ("规答", "规矩"),
    ("说慎", "谨慎"),
    ("荫急", "松懈"),
    ("二这", "择其"),
    ("拒次要", "据次要"),
    ("学风亚渤", "学风严谨"),
    ("亚渤", "严谨"),
    ("交全人", "交人"),
    ("玉生", "王生"),
    ("这次时间", "长期积累"),
    ("不驯", "不训"),
    ("谟", "谋"),
]


def fix_def(d):
    for a, b in DEF_FIX:
        d = d.replace(a, b)
    return d


def classify(w):
    return "成语" if len(w) >= 3 else "实词"


def parse_800():
    out = []
    files = sorted(glob.glob(str(Y / "800词" / "page_*.txt")))
    for f in files:
        page = int(re.search(r"page_(\d+)", f).group(1))
        for line in open(f, encoding="utf-8").read().splitlines():
            m = RE_800.match(line.strip())
            if not m:
                continue
            w = m.group(1).strip()
            d = m.group(2).strip().rstrip("。.，,；;")
            if len(w) < 2 or not d or len(d) > 120:
                continue
            if re.search(r"第.组$", w) or w in ("第一组", "第二组", "成语", "实词"):
                continue
            if re.search(r"\d\s*[、，]", d):
                continue  # 组头 "5 源远流…"
            w = WORD_FIX.get(w, w)
            w = correct_word(w)
            d = fix_def(d)
            out.append({"word": w, "def": d, "page": page, "type": classify(w)})
    # 去重（保留首次出现）
    seen = set()
    uniq = []
    for x in out:
        if x["word"] in seen:
            continue
        seen.add(x["word"])
        uniq.append(x)
    return uniq


def parse_yihun():
    """易混词B5：按“第X组”聚合成员词，提取各自 释义/例句，并在 yf 中交叉引用同组词。

    关键难点：每组定义之后紧接“单选题/解析”练习区，含大量成语干扰项。解析策略：
      * 仅从“词：释义”行提取成员词（组头词 OCR 残缺且易混入练习项，不再挖掘）；
      * 命中习题/解析标记即进入 quiz_mode，直到下一个“第X组”才解除，彻底隔离练习区；
      * 4 字成语要求纠错后在已知成语集中（或释义足够长），2~3 字实词要求非停用词且释义够长，
        过滤“例句/比喻言论/小技巧”等噪声。
    """
    files = sorted(glob.glob(str(Y / "易混词B5" / "page_*.txt")))
    groups = []
    gid = 0
    last_hdr = None
    cur = None
    last_word = None
    quiz_mode = False

    STOP = set("例句 本组 辨析 注意 提示 答案 训练 解析 小题 选项 横线 填入 恰当 "
               "错误 正确 下列 依次 根据 文章 文意 排除 保留 符合 通过 前文 后文 "
               "对应 反推 对策 问题 空格 文段 语境 综上 因此 所以 然而 但是 而且 "
               "并且 比如 例如 可见 总之 事实上 实际上 换言之 也就是说 不仅如此 "
               "与此同时 在此基础上 由此 据此 其 这 那 我们 你们 他们 它们 自己 "
               "大家 什么 怎么 为什么 如何 哪些 哪个 多少 几项 一项 二项 多项 "
               "词语 概括 标题 下文 接语 作者 意在 主要 适合 成语".split())

    def is_quiz(s):
        if any(mk in s for mk in QUIZ_MARKERS):
            return True
        if re.match(r"^[A-D][．.、]", s):
            return True
        if "项，" in s or "项。" in s or "符合文意" in s or "排除。" in s or "保留。" in s:
            return True
        return False

    def new_group(hdr_text, line):
        nonlocal gid, cur, last_word, last_hdr, quiz_mode
        quiz_mode = False
        if hdr_text != last_hdr:
            gid += 1
            groups.append({"hdr": hdr_text, "members": {}, "hdr_members": set()})
            cur = groups[-1]["members"]
            last_hdr = hdr_text
            last_word = None
        else:
            cur = groups[-1]["members"]
        # 组头行常列出全部成员（如 “索然无味 (14次) 乏善可陈 (17次)”），
        # 纠错后仅保留已知成语，用于补全同组交叉引用（即便其释义行未被抽到）。
        for w in re.findall(r"([\u4e00-\u9fff]{2,6})\s*[（(]\s*\d+\s*次", line):
            wc = correct_word(w)
            if wc in KNOWN:
                cur_parent = groups[-1]
                cur_parent["hdr_members"].add(wc)

    def accept(w, d):
        if w in STOP:
            return False
        if len(w) == 4:
            return len(d) >= 4 or (correct_word(w) in KNOWN)
        if 2 <= len(w) <= 3:
            return len(d) >= 4
        return False

    for f in files:
        for line in open(f, encoding="utf-8").read().splitlines():
            s = line.strip()
            if not s:
                continue
            mh = RE_HDR.search(s)
            if mh:
                new_group(mh.group(0), s)
                continue
            if cur is None:
                continue
            # 练习/解析区：进入 quiz_mode 并忽略，直到下一组头
            if is_quiz(s) or ('"' in s or "“" in s or "”" in s):
                quiz_mode = True
                last_word = None
                continue
            if quiz_mode:
                continue
            # 例句
            me = RE_EX.match(s)
            if me and last_word:
                cur[last_word]["ex"] = (cur[last_word]["ex"] + me.group(1)).strip()
                continue
            # 释义行
            md = RE_DEF.match(s)
            if md:
                w0 = md.group(1).strip()
                d = md.group(2).strip().rstrip("。.，,；;")
                if len(d) < 2 or len(d) > 160:
                    continue
                wc = correct_word(w0)
                if not accept(wc, d):
                    last_word = None
                    continue
                if wc not in cur:
                    cur[wc] = {"def": "", "ex": ""}
                cur[wc]["def"] = (cur[wc]["def"] + d).strip()
                last_word = wc
                continue
            # 释义续行
            if last_word and not re.match(r"^[\u4e00-\u9fff]{1,6}[：:]", s) and not is_quiz(s):
                if not any(mk in s for mk in QUIZ_MARKERS):
                    cur[last_word]["def"] = (cur[last_word]["def"] + s).strip()

    out = []
    for g in groups:
        members = g["members"]
        names = list(members.keys())
        full = set(names) | set(g.get("hdr_members", set()))
        for w, info in members.items():
            if not info["def"]:
                continue
            others = [x for x in full if x != w and classify(x) == classify(w)]
            yf = ""
            if others:
                yf = "与「" + "」「".join(others) + "」易混辨析"
                if info["ex"]:
                    yf += "；例句：" + info["ex"]
            else:
                if info["ex"]:
                    yf = "例句：" + info["ex"]
            out.append({
                "word": w,
                "def": info["def"],
                "type": classify(w),
                "yf": yf,
                "group": g["hdr"],
            })
    return out


def gen_js():
    c = json.load(open(str(Y / "_parsed_800ci.json"), encoding="utf-8")) if (Y / "_parsed_800ci.json").exists() else []
    y = json.load(open(str(Y / "_parsed_yihun.json"), encoding="utf-8")) if (Y / "_parsed_yihun.json").exists() else []
    # 归一化并合并：800词 -> cat:'高频'；易混词B5 -> cat:'易混'(含 yf 交叉引用)。
    # 同词去重时优先保留易混词B5 条目（信息更完整）。
    c_norm = [{"word": x["word"], "def": x["def"], "type": x["type"], "cat": "高频", "yf": x.get("yf", "")} for x in c]
    y_norm = [{"word": x["word"], "def": x["def"], "type": x["type"], "cat": "易混", "yf": x.get("yf", "")} for x in y]
    merged = {}
    for x in c_norm:
        merged[x["word"]] = x
    for x in y_norm:
        merged[x["word"]] = x
    items = list(merged.values())
    chengyu = [x for x in items if x["type"] == "成语"]
    shici = [x for x in items if x["type"] == "实词"]

    def esc(s):
        return s.replace("\\", "\\\\").replace("'", "\\'")

    def entry(x):
        parts = [f"  {{ t: '{esc(x['word'])}', cat: '{x['cat']}', yishi: '{esc(x['def'])}'"]
        if x.get("yf"):
            parts[0] += ","
            parts.append(f" yf: '{esc(x['yf'])}'")
        parts.append(" },")
        return "".join(parts)

    lines = []
    lines.append("// 雨菲·四海 两本 PDF 的成语/实词知识库（融合进「积累板块」成语积累 / 实词积累）")
    lines.append("// 由 scripts/extract_yufei.py(OCR) + 人工级精校 + scripts/parse_yufei.py(gen) 产出。")
    lines.append("// 字段与 CHENGYU/SHICI 一致；易混词对 cat:'易混' 且 yf 双向交叉引用。")
    lines.append("")
    lines.append("export const YUFEN_CHENGYU = [")
    lines += [entry(x) for x in chengyu]
    lines.append("]")
    lines.append("")
    lines.append("export const YUFEN_SHICI = [")
    lines += [entry(x) for x in shici]
    lines.append("]")
    lines.append("")
    OUT_JS.write_text("\n".join(lines), encoding="utf-8")
    print(f"[gen] 写出 {OUT_JS}: 成语 {len(chengyu)} 条, 实词 {len(shici)} 条")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["800", "yihun", "gen", "all"], default="all")
    args = ap.parse_args()
    if args.only in ("800", "all"):
        r = parse_800()
        json.dump(r, open(str(Y / "_parsed_800ci.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"[800词] 解析去重后 {len(r)} 条（成语 {sum(1 for x in r if x['type']=='成语')} / 实词 {sum(1 for x in r if x['type']=='实词')}）")
    if args.only in ("yihun", "all"):
        r = parse_yihun()
        json.dump(r, open(str(Y / "_parsed_yihun.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"[易混词B5] 解析 {len(r)} 条（成语 {sum(1 for x in r if x['type']=='成语')} / 实词 {sum(1 for x in r if x['type']=='实词')}），分 {len(set(x['group'] for x in r))} 个组头")
    if args.only in ("gen", "all"):
        gen_js()


if __name__ == "__main__":
    main()
