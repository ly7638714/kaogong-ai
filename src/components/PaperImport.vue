<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { store, saveWqs } from '../store'
import { activeCfg, chatOnce, supportsVision } from '../api'
import { extractChoices, answerLetter } from '../utils/quiz'
import { showToast } from '../utils/toast'

const emit = defineEmits(['close'])
const ALL_MODULES = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论', '图形推理', '类比推理', '定义判断']
const imgs = ref([])
const textFiles = ref([])
const papers = ref([])
try { papers.value = JSON.parse(localStorage.getItem('xc_papers') || '[]') || [] } catch (e) {}
const results = ref([])
try { results.value = JSON.parse(localStorage.getItem('xc_paper_results') || '[]') || [] } catch (e) {}

const srcMode = ref('import')
const mixMode = ref('mix')
const modules = ref([])
const perQ = ref(60)
const qLimit = ref(0)

const phase = ref('config') // config | extract | doing | result
const extracting = ref(false)
const curPaper = ref(null)
const questions = ref([])
const cur = ref(0)
const marks = ref([])
const qLeft = ref(60)
const qElapsed = ref(0)
const totalLeft = ref(0)
const totalElapsed = ref(0)
let timers = { q: null, t: null }
const startAt = ref(0)

const VISION_SYS = '你是公考真题整理助手。把图片中的行测题目逐题提取，严格只输出 JSON 数组，不要多余文字。'
const VISION_PROMPT =
  '[{"no":1,"subject":"判断推理","stem":"题干原文","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"B","analysis":"解析(若有)"}]'
const TEXT_SYS =
  '你是公考真题整理助手。把下面的题目逐题整理成 JSON 数组，每题含 no/subject/stem/options/answer/analysis，题干与选项完整保留，无法识别的跳过，严格只输出 JSON 数组。'

const fmt = (s) => {
  const m = Math.floor(Math.max(0, s) / 60)
  const ss = Math.max(0, s) % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}
const q = computed(() => (cur.value >= 0 ? questions.value[cur.value] : null))
const score = computed(() => marks.value.filter((m) => m && m.ok).length)
const rate = computed(() => (questions.value.length ? Math.round((score.value / questions.value.length) * 100) : 0))
const avgRate = computed(() => {
  const done = results.value.filter((r) => r.n > 0)
  if (!done.length) return 0
  return Math.round(done.reduce((a, b) => a + b.rate, 0) / done.length)
})

function norm(qs) {
  return (qs || [])
    .map((x, i) => {
      const optsObj = x.options || {}
      let opts = Array.isArray(x.options)
        ? x.options.map((o, k) => ({ k: 'ABCD'[k] || 'A', t: typeof o === 'string' ? o : (o && o.t) }))
        : Object.keys(optsObj).map((k) => ({ k: k.toUpperCase(), t: optsObj[k] }))
      opts = opts.filter((o) => o.t).slice(0, 4)
      return {
        no: x.no || i + 1,
        subject: x.subject || '未分类',
        stem: x.stem || '',
        options: opts,
        answer: String(x.answer || '').toUpperCase(),
        analysis: x.analysis || ''
      }
    })
    .filter((x) => x.stem)
}
function shuffle(a) {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
function applyConfig(qs) {
  let list = qs.slice()
  const hasSel = modules.value.length && !modules.value.includes('全部')
  if (hasSel) list = list.filter((x) => modules.value.includes(x.subject))
  if (mixMode.value === 'mix') list = shuffle(list)
  else {
    const order = modules.value.length ? modules.value : ALL_MODULES
    list.sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject))
  }
  if (qLimit.value > 0) list = list.slice(0, qLimit.value)
  return list
}
function makePaper(name, qs) {
  return { id: Date.now() + Math.random(), name, ts: Date.now(), questions: qs }
}
function savePapers() {
  try { localStorage.setItem('xc_papers', JSON.stringify(papers.value)) } catch (e) {}
}
function saveResults() {
  try { localStorage.setItem('xc_paper_results', JSON.stringify(results.value)) } catch (e) {}
}

// ===== 材料导入 =====
function onFiles(ev) {
  const files = Array.from(ev.target.files || [])
  for (const f of files) {
    const n = (f.name || '').toLowerCase()
    if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(n)) readImg(f)
    else if (/\.pdf$/i.test(n)) readPdf(f)
    else if (/\.(txt|tex|md|markdown)$/i.test(n)) readText(f)
    else if (/\.docx$/i.test(n)) readDocx(f)
    else showToast('暂不支持 ' + f.name, 'error')
  }
  ev.target.value = ''
}
function readImg(f) {
  const r = new FileReader()
  r.onload = (e) => imgs.value.push(e.target.result)
  r.readAsDataURL(f)
}
async function readPdf(f) {
  try {
    const buf = await f.arrayBuffer()
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
    GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
    const pdf = await getDocument({ data: buf }).promise
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const vp = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      imgs.value.push(canvas.toDataURL('image/jpeg', 0.85))
    }
    showToast('✅ 已解析 PDF ' + pdf.numPages + ' 页', 'success')
  } catch (e) {
    showToast('PDF 解析失败：' + e.message, 'error')
  }
}
async function readText(f) {
  textFiles.value.push({ name: f.name, text: await f.text() })
  showToast('✅ 已读取 ' + f.name, 'success')
}
async function readDocx(f) {
  try {
    const buf = await f.arrayBuffer()
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml').async('string')
    const txt = xml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    textFiles.value.push({ name: f.name, text: txt })
    showToast('✅ 已读取 Word（' + txt.length + ' 字）', 'success')
  } catch (e) {
    showToast('Word 解析失败：' + e.message, 'error')
  }
}
function rmImg(i) { imgs.value.splice(i, 1) }
function rmTxt(i) { textFiles.value.splice(i, 1) }

async function textToQuestions(text) {
  const c = activeCfg(false)
  if (!c || !c.key) return []
  try {
    const reply = await chatOnce(c, [{ role: 'system', content: TEXT_SYS }, { role: 'user', content: String(text).slice(0, 8000) }], 3000)
    const m = String(reply || '').match(/\[[\s\S]*\]/)
    return m ? norm(JSON.parse(m[0])) : []
  } catch (e) {
    return []
  }
}
function buildWrongQuestions() {
  const list = []
  store.wqs.forEach((wq) => {
    if (modules.value.length && !modules.value.includes('全部') && !modules.value.includes(wq.subject || '未分类')) return
    const opts = extractChoices(wq.question || '')
    list.push({
      subject: wq.subject || '未分类',
      stem: wq.question || '',
      options: opts,
      answer: answerLetter(wq.answer || ''),
      analysis: [wq.method, wq.note].filter(Boolean).join('\n'),
      fromWrong: true,
      wrongId: wq.id
    })
  })
  return list
}

async function extract() {
  if (srcMode.value === 'wrong') {
    const qs = applyConfig(buildWrongQuestions())
    if (!qs.length) {
      showToast('所选模块暂无错题，请先收纳错题', 'info')
      return
    }
    startPaper(makePaper('错题智能组卷', qs))
    return
  }
  if (!imgs.value.length && !textFiles.value.length) {
    showToast('请先导入题目材料（图片/PDF/Word/txt/tex）', 'info')
    return
  }
  extracting.value = true
  phase.value = 'extract'
  const all = []
  const c = activeCfg(true)
  try {
    if (imgs.value.length) {
      if (!c || !c.key) showToast('请先配置模型 API Key', 'error')
      else if (!supportsVision(c)) showToast('请配置可识图的视觉模型', 'error')
      else {
        for (const im of imgs.value) {
          const reply = await chatOnce(
            c,
            [
              { role: 'system', content: VISION_SYS },
              { role: 'user', content: [{ type: 'text', text: '请提取这张图片中的题目，严格按格式输出 JSON 数组：' + VISION_PROMPT }, { type: 'image_url', image_url: { url: im } }] }
            ],
            2500
          )
          const m = String(reply || '').match(/\[[\s\S]*\]/)
          if (m) {
            try { all.push(...norm(JSON.parse(m[0]))) } catch (e) {}
          }
        }
      }
    }
    for (const tf of textFiles.value) {
      const qs = await textToQuestions(tf.text)
      all.push(...qs)
    }
  } catch (e) {
    showToast('识别失败：' + e.message, 'error')
  }
  extracting.value = false
  if (!all.length) {
    showToast('未识别出题目，请重试或换更清晰的材料', 'error')
    phase.value = 'config'
    return
  }
  const paper = makePaper('导入组卷 ' + new Date().toLocaleDateString(), applyConfig(all))
  papers.value.unshift(paper)
  savePapers()
  startPaper(paper)
  showToast('✅ 已生成 ' + paper.questions.length + ' 题', 'success')
}

// ===== 作答 =====
function startPaper(paper) {
  curPaper.value = paper
  questions.value = paper.questions
  cur.value = 0
  marks.value = paper.questions.map(() => null)
  startAt.value = Date.now()
  totalLeft.value = paper.questions.length * perQ.value
  totalElapsed.value = 0
  qLeft.value = perQ.value
  qElapsed.value = 0
  phase.value = 'doing'
  clearTimers()
  timers.t = setInterval(() => {
    totalElapsed.value++
    totalLeft.value--
    if (totalLeft.value <= 0) finish()
  }, 1000)
  timers.q = setInterval(() => {
    qElapsed.value++
    qLeft.value--
    if (qLeft.value <= 0) timeoutQ()
  }, 1000)
}
function clearTimers() {
  if (timers.t) clearInterval(timers.t)
  if (timers.q) clearInterval(timers.q)
  timers = { q: null, t: null }
}
function timeoutQ() {
  const i = cur.value
  if (marks.value[i] != null) return
  marks.value[i] = { ok: false, pick: '', timeout: true }
  showToast('⏰ 本题超时（' + perQ.value + ' 秒），已按答错计', 'error')
  nextQ()
}
function pick(k) {
  const i = cur.value
  const qq = questions.value[i]
  if (!qq || marks.value[i] != null) return
  marks.value[i] = { ok: k === qq.answer, pick: k }
}
function selfMark(ok) {
  const i = cur.value
  if (marks.value[i] != null) return
  marks.value[i] = { ok, pick: '', self: true }
}
function nextQ() {
  if (cur.value < questions.value.length - 1) {
    cur.value++
    qLeft.value = perQ.value
    qElapsed.value = 0
  } else {
    finish()
  }
}
function finish() {
  clearTimers()
  questions.value.forEach((qq, i) => {
    if (marks.value[i] == null) marks.value[i] = { ok: false, pick: '', timeout: true }
  })
  const rec = { ts: Date.now(), name: curPaper.value.name, n: questions.value.length, score: score.value, rate: rate.value, sec: totalElapsed.value }
  results.value.unshift(rec)
  if (results.value.length > 50) results.value = results.value.slice(0, 50)
  saveResults()
  phase.value = 'result'
}
function achieveText() {
  const r = rate.value
  if (r >= 90) return '🏆 巅峰状态！继续保持'
  if (r >= 80) return '🎯 优秀！离满分一步之遥'
  if (r >= 60) return '👍 合格，把错题复盘一遍更稳'
  return '💪 再接再厉，错题都进本子重点刷'
}
function saveWrongs() {
  const wrongs = questions.value.filter((qq, i) => marks.value[i] && !marks.value[i].ok)
  if (!wrongs.length) {
    showToast('本次没有错题 🎉', 'success')
    return
  }
  wrongs.forEach((qq) => {
    if (qq.fromWrong) return // 错题组卷：已是错题，不再重复入库
    store.wqs.unshift({
      id: Date.now() + Math.random(),
      subject: qq.subject || '未分类',
      question: qq.stem + '\n\n' + (qq.options || []).map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + qq.answer,
      reasons: ['真题作答失误'],
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    })
  })
  saveWqs()
  showToast('✅ 已存入错题本 ' + wrongs.length + ' 题', 'success')
}
function delPaper(i) {
  papers.value.splice(i, 1)
  savePapers()
}
function replay() {
  phase.value = 'config'
  questions.value = []
  clearTimers()
}
function backList() {
  phase.value = 'config'
  clearTimers()
}
onUnmounted(clearTimers)
</script>

<template>
  <div class="ov show sim-ov" @click.self="emit('close')">
    <div class="pnl sim-pnl pp-pnl">
      <div class="pnl-top">
        <button class="pnl-top-b" title="返回上一层" @click="emit('close')">← 返回</button>
        <span class="pnl-top-t">📥 真题组卷</span>
      </div>
      <!-- 配置 -->
      <div v-if="phase === 'config'" class="pp-config">
        <div class="pp-src">
          <button class="fp-b" :class="{ on: srcMode === 'import' }" @click="srcMode = 'import'">📂 导入材料</button>
          <button class="fp-b" :class="{ on: srcMode === 'wrong' }" @click="srcMode = 'wrong'">📋 错题集组卷</button>
        </div>

        <template v-if="srcMode === 'import'">
          <div class="pp-upload">
            <label class="btn btn-pri" style="cursor: pointer; text-align: center">
              📁 添加题目材料（图片 / PDF / Word / txt / tex，可多选）
              <input type="file" accept="image/*,.pdf,.docx,.txt,.tex,.md,.markdown" multiple style="display: none" @change="onFiles" />
            </label>
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">PDF 自动转页图、Word 提取正文、txt/tex/md 直接读入，AI 统一整理成题</div>
          </div>
          <div v-if="imgs.length" class="pp-imgs">
            <div v-for="(im, i) in imgs" :key="'i' + i" class="pp-thumb">
              <img :src="im" />
              <button class="pp-x" @click="rmImg(i)">×</button>
            </div>
          </div>
          <div v-if="textFiles.length" class="pp-txts">
            <div v-for="(t, i) in textFiles" :key="'t' + i" class="pp-txt-item">
              <span>📄 {{ t.name }}（{{ t.text.length }} 字）</span>
              <button class="pp-x" @click="rmTxt(i)">×</button>
            </div>
          </div>
        </template>

        <div class="pp-opt">
          <div class="pp-opt-l">出卷方式</div>
          <div class="pp-src">
            <button class="fp-b" :class="{ on: mixMode === 'mix' }" @click="mixMode = 'mix'">🔀 混合出卷</button>
            <button class="fp-b" :class="{ on: mixMode === 'module' }" @click="mixMode = 'module'">🗂️ 按模块出卷</button>
          </div>
          <div class="pp-opt-l" style="margin-top: 8px">包含模块（不选=全部）</div>
          <div class="pp-modules">
            <button v-for="m in ALL_MODULES" :key="m" class="pp-m" :class="{ on: modules.includes(m) }" @click="modules.includes(m) ? modules.splice(modules.indexOf(m), 1) : modules.push(m)">{{ m }}</button>
          </div>
          <div class="pp-opt-l" style="margin-top: 8px">每题限时 / 题数</div>
          <div class="pp-src">
            <select v-model="perQ" class="tb-sel"><option :value="60">每题 60 秒</option><option :value="90">每题 90 秒</option><option :value="120">每题 120 秒</option></select>
            <select v-model="qLimit" class="tb-sel"><option :value="0">全部题目</option><option :value="5">随机 5 题</option><option :value="10">随机 10 题</option><option :value="15">随机 15 题</option></select>
          </div>
        </div>

        <div class="pnl-btns">
          <button class="btn btn-gh" @click="emit('close')">关闭</button>
          <button class="btn btn-pri" :disabled="extracting" @click="extract()">
            {{ extracting ? 'AI 整理中…' : '🚀 生成卷子并开始' }}
          </button>
        </div>

        <div class="pp-list-hd">📚 我的卷子（{{ papers.length }}）</div>
        <div v-if="!papers.length" class="acc-notes-empty">还没有卷子：导入材料或选错题集 → 生成 → 交互做题</div>
        <div v-for="(p, i) in papers" :key="p.id" class="pp-item">
          <div class="pp-info">
            <div class="pp-name">{{ p.name }}</div>
            <div class="pp-meta">{{ p.questions.length }} 题 · {{ new Date(p.ts).toLocaleString() }}</div>
          </div>
          <button class="btn btn-pri" style="padding: 5px 12px" @click="startPaper(p)">✏️ 再做</button>
          <button class="btn btn-gh" style="padding: 5px 10px" @click="delPaper(i)">🗑</button>
        </div>

        <div class="pp-list-hd">🏅 考试战绩（{{ results.length }}）</div>
        <div v-if="results.length" class="pp-stats">
          平均正确率 <b>{{ avgRate }}%</b> · 已完成 <b>{{ results.length }}</b> 卷
        </div>
        <div v-if="!results.length" class="acc-notes-empty">完成卷子后这里会记录成绩与进步曲线</div>
        <div v-for="(r, i) in results.slice(0, 8)" :key="i" class="pp-item">
          <div class="pp-info">
            <div class="pp-name">{{ r.name }}</div>
            <div class="pp-meta">{{ r.n }} 题 · {{ new Date(r.ts).toLocaleString() }}</div>
          </div>
          <span class="pp-score" :class="r.rate >= 80 ? 'ok' : r.rate >= 60 ? 'mid' : 'no'">{{ r.score }}/{{ r.n }} · {{ r.rate }}%</span>
          <span class="pp-meta">⏱ {{ fmt(r.sec) }}</span>
        </div>
      </div>

      <!-- 识别中 -->
      <div v-else-if="phase === 'extract'" class="pp-extract">
        <div class="sim-loading"><span class="spin"></span> AI 正在整理题目…（图片/PDF 每张约 10-30 秒，文本约 5-15 秒）</div>
      </div>

      <!-- 作答 -->
      <div v-else-if="phase === 'doing' && q" class="sim-doing">
        <div class="pp-timer-bar">
          <span class="sim-plate">📐 {{ q.subject }}</span>
          <span class="sim-prog">第 {{ cur + 1 }} / {{ questions.length }} 题</span>
          <span class="pp-tq" :class="{ warn: qLeft <= 10 }">本题 ⏳ {{ fmt(qLeft) }} · ⏱ {{ fmt(qElapsed) }}</span>
        </div>
        <div class="pp-timer-bar total">
          <span class="pp-total">整卷 ⏳ {{ fmt(totalLeft) }} · 总用时 ⏱ {{ fmt(totalElapsed) }}</span>
        </div>
        <div class="sim-q" v-html="q.stem"></div>
        <div v-if="q.options && q.options.length" class="quiz-opts">
          <button
            v-for="o in q.options"
            :key="o.k"
            class="quiz-opt"
            :class="{ picked: marks[cur] && marks[cur].pick === o.k, right: marks[cur] && o.k === q.answer, wrong: marks[cur] && marks[cur].pick === o.k && o.k !== q.answer }"
            :disabled="marks[cur] != null"
            @click="pick(o.k)"
          >
            <span class="qk">{{ o.k }}</span><span class="qt">{{ o.t }}</span>
          </button>
        </div>
        <div v-else-if="!marks[cur]" class="pp-nochoice">
          <button class="btn btn-gh" @click="marks[cur] = { reveal: true }">👁 查看答案</button>
        </div>
        <div v-if="marks[cur] && !marks[cur].ok && marks[cur].pick !== '' && marks[cur].reveal" class="pp-nochoice">
          <div class="quiz-result no">正确答案 {{ q.answer }}</div>
          <div class="pp-selftj">
            <button class="btn btn-gh" @click="selfMark(false)">❌ 还没掌握</button>
            <button class="btn btn-pri" @click="selfMark(true)">✅ 这题会了</button>
          </div>
        </div>
        <div v-if="marks[cur] && marks[cur].ok !== undefined && !marks[cur].timeout" class="quiz-result" :class="marks[cur].ok ? 'ok' : 'no'">
          {{ marks[cur].ok ? '✅ 回答正确' : (marks[cur].self ? '❌ 还没掌握，已计错' : '❌ 回答错误，正确答案 ' + q.answer) }}
        </div>
        <div v-if="marks[cur] && marks[cur].ok !== undefined && marks[cur].analysis" class="sim-explain" v-html="marks[cur].analysis"></div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="emit('close')">退出</button>
          <button v-if="marks[cur] && (marks[cur].ok !== undefined || marks[cur].pick !== '' || marks[cur].reveal)" class="btn btn-pri" @click="nextQ()">
            {{ cur + 1 >= questions.length ? '交卷 📄' : '下一题 ▶' }}
          </button>
        </div>
      </div>

      <!-- 成绩单 -->
      <div v-else class="sim-result">
        <h3>📄 成绩单 · {{ curPaper.name }}</h3>
        <div class="sr-score">{{ score }} / {{ questions.length }}</div>
        <div class="sr-rate">{{ rate }}% · {{ achieveText() }}</div>
        <div class="sr-meta">总用时 {{ fmt(totalElapsed) }} · 平均每题 {{ questions.length ? Math.round(totalElapsed / questions.length) : 0 }} 秒</div>
        <div class="sr-list">
          <div v-for="(qq, i) in questions" :key="i" class="sr-item">
            <span class="sr-mark" :class="marks[i] && marks[i].ok ? 'ok' : 'no'">{{ marks[i] && marks[i].ok ? '✓' : '✗' }}</span>
            <span class="sr-t">{{ qq.stem.slice(0, 50) }}</span>
          </div>
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="replay()">🔁 再来一卷</button>
          <button class="btn btn-gh" @click="saveWrongs()">📌 错题入库</button>
          <button class="btn btn-gh" @click="backList()">🏠 卷子列表</button>
          <button class="btn btn-pri" @click="emit('close')">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>
