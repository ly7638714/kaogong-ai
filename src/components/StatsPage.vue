<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'
import { detectBanKuai } from '../api'
import { todaySeconds, totalSeconds, fmtMin, studyTick } from '../utils/study'
const stats = computed(() => ({
  tot: store.msgs.filter((m) => m.role === 'user').length,
  q: store.msgs.filter(
    (m) => m.role === 'user' && /分析|讲解|题目/.test(String((m.content && m.content.text) || m.content || ''))
  ).length,
  r: store.msgs.filter((m) => m.role === 'assistant' && /复盘|解析/.test(String(m.content))).length,
  w: store.wqs.length
}))
const banKuai = computed(() => {
  const m = {}
  store.msgs.forEach((x) => {
    if (x.role !== 'user') return
    const t = String((x.content && x.content.text) || x.content || '')
    if (!t) return
    const bk = detectBanKuai(t) || '综合'
    m[bk] = m[bk] + 1 || 1
  })
  const arr = Object.entries(m).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...arr.map((x) => x[1]))
  return { arr, max }
})
const revRate = computed(() =>
  store.wqs.length ? Math.round((store.wqs.filter((q) => q.reviewed).length / store.wqs.length) * 100) : 0
)
const detail = ref(''),
  show = ref(false)
function openStat(kind) {
  if (kind === 'w') {
    store.tab = 'wq'
    return
  }
  const ums = store.msgs.filter((m) => m.role === 'user')
  let list = []
  if (kind === 'tot')
    list = ums.slice(-10).map((m) => String((m.content && m.content.text) || m.content || '').slice(0, 60))
  else if (kind === 'q')
    list = ums
      .filter((m) => /分析|讲解|题目/.test(String((m.content && m.content.text) || m.content || '')))
      .slice(-10)
      .map((m) => String((m.content && m.content.text) || m.content || '').slice(0, 60))
  else
    list = ums
      .filter((m) => /复盘|分析|讲解/.test(String((m.content && m.content.text) || m.content || '')))
      .slice(-10)
      .map((m) => String((m.content && m.content.text) || m.content || '').slice(0, 60))
  detail.value = list.length ? list.map((t) => '· ' + t).join('\n') : '暂无记录'
  show.value = true
}
// ===== 学习趋势（近 7/14/30 天） =====
const range = ref(7)
const dayKey = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const parseTime = (s) => {
  if (!s) return null
  const d = new Date(String(s).replace(/\//g, '-'))
  return isNaN(d.getTime()) ? null : d.getTime()
}
const seriesMeta = [
  { k: 'ask', label: '提问', color: '#22d3ee' },
  { k: 'wrong', label: '错题', color: '#fb7185' },
  { k: 'review', label: '复盘', color: '#34d399' }
]
// 学习时长
const todayMin = computed(() => { studyTick.value; return fmtMin(todaySeconds()) })
const totalMin = computed(() => { studyTick.value; return fmtMin(totalSeconds()) })
const trend = computed(() => {
  const days = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = range.value - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dayKey(d.getTime())
    const ask = store.msgs.filter((m) => m.role === 'user' && dayKey(m.t) === key).length
    const wrong = store.wqs.filter((q) => dayKey(q.at || parseTime(q.time)) === key).length
    const review = store.wqs.filter((q) => q.reviewedAt && dayKey(q.reviewedAt) === key).length
    days.push({ key, label: d.getMonth() + 1 + '/' + d.getDate(), ask, wrong, review })
  }
  const max = Math.max(1, ...days.flatMap((d) => [d.ask, d.wrong, d.review]))
  const W = 600
  const H = 150
  const P = 26
  const x = (i) => (days.length <= 1 ? W / 2 : P + (i * (W - P * 2)) / (days.length - 1))
  const y = (v) => H - P - (v / max) * (H - P * 2)
  const line = (k) => days.map((d, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(d[k]).toFixed(1)).join(' ')
  const area = (k) =>
    'M' + x(0).toFixed(1) + ',' + y(0).toFixed(1) + ' ' + line(k).replace(/^M/, 'L') + ' L' + x(days.length - 1).toFixed(1) + ',' + (H - P).toFixed(1) + ' Z'
  return { days, max, x, y, line, area, W, H, P }
})
// ===== 板块掌握度雷达（6 大板块）=====
const radarPlates = [
  { key: '判断推理', label: '判断', sub: ['判断推理', '图形推理', '类比推理', '定义判断'] },
  { key: '言语理解', label: '言语', sub: ['言语理解'] },
  { key: '数量关系', label: '数量', sub: ['数量关系'] },
  { key: '资料分析', label: '资料', sub: ['资料分析'] },
  { key: '常识判断', label: '常识', sub: ['常识判断'] },
  { key: '政治理论', label: '政治', sub: ['政治理论'] }
]
const radar = computed(() => {
  const vals = radarPlates.map((p) => {
    const wq = store.wqs.filter((q) => p.sub.includes(q.subject))
    const wrongN = wq.length
    const revN = wq.filter((q) => q.reviewed || q.digested).length
    let v
    if (wrongN === 0) v = 85
    else v = Math.max(5, 100 - wrongN * 12 + revN * 3)
    return { ...p, v: Math.round(Math.min(100, v)) }
  })
  const cx = 110
  const cy = 105
  const R = 78
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / vals.length - Math.PI / 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    vals.map((_, i) => pt(i, R * f).map((x) => x.toFixed(1)).join(',')).join(' ')
  )
  const poly = vals.map((v, i) => pt(i, R * (v.v / 100)).map((x) => x.toFixed(1)).join(',')).join(' ')
  const axes = vals.map((v, i) => {
    const [x0, y0] = pt(i, R + 18)
    return { x: x0.toFixed(1), y: y0.toFixed(1), label: v.label, val: v.v }
  })
  return { rings, poly, axes, vals, W: 220, H: 220 }
})
// ===== 学习热力图（近 15 周打卡日历）=====
const heat = computed(() => {
  const weeks = []
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const todayIdx = end.getDay()
  end.setDate(end.getDate() - todayIdx)
  for (let w = 14; w >= 0; w--) {
    const week = []
    for (let d = 6; d >= 0; d--) {
      const day = new Date(end)
      day.setDate(end.getDate() - (w * 7 + d))
      const key = dayKey(day.getTime())
      const ask = store.msgs.filter((m) => m.role === 'user' && dayKey(m.t) === key).length
      const wrong = store.wqs.filter((q) => dayKey(q.at || parseTime(q.time)) === key).length
      week.push({ key, cnt: ask + wrong })
    }
    weeks.push(week)
  }
  const max = Math.max(1, ...weeks.flat().map((d) => d.cnt))
  return { weeks, max }
})
function heatColor(cnt, max) {
  if (!cnt) return 'rgba(255,255,255,0.05)'
  const a = 0.18 + Math.min(1, cnt / max) * 0.75
  return 'rgba(34,211,238,' + a.toFixed(2) + ')'
}
</script>
<template>
  <div class="page on">
    <div class="page-inner">
      <div class="sg">
        <div class="sc" @click="openStat('tot')">
          <div class="sn">{{ stats.tot }}</div>
          <div class="sl">总对话</div>
        </div>
        <div class="sc" @click="openStat('q')">
          <div class="sn">{{ stats.q }}</div>
          <div class="sl">题目分析</div>
        </div>
        <div class="sc" @click="openStat('r')">
          <div class="sn">{{ stats.r }}</div>
          <div class="sl">复盘次数</div>
        </div>
        <div class="sc" @click="openStat('w')">
          <div class="sn">{{ stats.w }}</div>
          <div class="sl">错题数</div>
        </div>
        <div class="sc" title="学习时长（页面活跃时自动累计）">
          <div class="sn">{{ todayMin }}</div>
          <div class="sl">今日学习(分)</div>
        </div>
        <div class="sc" title="累计学习时长">
          <div class="sn">{{ totalMin }}</div>
          <div class="sl">累计学习(分)</div>
        </div>
      </div>

      <div class="sec-t">📈 学习趋势</div>
      <div class="trend-card">
        <div class="trend-ranges">
          <button v-for="r in [7, 14, 30]" :key="r" class="tr-btn" :class="{ on: range === r }" @click="range = r">{{ r }}天</button>
        </div>
        <svg :viewBox="'0 0 ' + trend.W + ' ' + trend.H" class="trend-svg">
          <line
            v-for="i in 3"
            :key="'g' + i"
            :x1="0"
            :x2="trend.W"
            :y1="trend.H - trend.P - (i * (trend.H - trend.P * 2)) / 3"
            :y2="trend.H - trend.P - (i * (trend.H - trend.P * 2)) / 3"
            class="t-grid"
          />
          <path v-for="s in seriesMeta" :key="s.k" :d="trend.area(s.k)" :fill="s.color" opacity="0.08" />
          <path
            v-for="s in seriesMeta"
            :key="'l' + s.k"
            :d="trend.line(s.k)"
            :stroke="s.color"
            stroke-width="2"
            fill="none"
            stroke-linejoin="round"
          />
          <circle
            v-for="(d, i) in trend.days"
            :key="'x' + i"
            :cx="trend.x(i)"
            :cy="trend.y(d.ask)"
            r="2.5"
            fill="#22d3ee"
          />
        </svg>
        <div class="trend-legend">
          <span v-for="s in seriesMeta" :key="s.k" class="tl-item"><i :style="{ background: s.color }"></i>{{ s.label }}</span>
          <span class="tl-tip">最近 {{ range }} 天 · 今日提问 {{ trend.days.length ? trend.days[trend.days.length - 1].ask : 0 }}</span>
        </div>
      </div>

      <div class="sec-t">🔥 学习热力图（近 15 周打卡）</div>
      <div class="heat-card">
        <div class="heat-grid">
          <div v-for="(week, wi) in heat.weeks" :key="wi" class="heat-week">
            <div
              v-for="(d, di) in week"
              :key="di"
              class="heat-cell"
              :style="{ background: heatColor(d.cnt, heat.max) }"
              :title="d.key + ' · 学习 ' + d.cnt + ' 次'"
            ></div>
          </div>
        </div>
        <div class="heat-legend">
          <span>少</span>
          <i style="background: rgba(34,211,238,0.2)"></i>
          <i style="background: rgba(34,211,238,0.5)"></i>
          <i style="background: rgba(34,211,238,0.85)"></i>
          <span>多</span>
        </div>
      </div>

      <div class="sec-t">🎯 板块掌握度雷达</div>
      <div class="radar-card">
        <svg :viewBox="'0 0 ' + radar.W + ' ' + radar.H" class="radar-svg">
          <polygon
            v-for="(r, i) in radar.rings"
            :key="i"
            :points="r"
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            stroke-width="1"
          />
          <polygon :points="radar.poly" fill="rgba(34,211,238,0.22)" stroke="#22d3ee" stroke-width="1.6" />
          <text
            v-for="a in radar.axes"
            :key="a.label"
            :x="a.x"
            :y="a.y"
            text-anchor="middle"
            class="radar-label"
          >{{ a.label }} {{ a.val }}</text>
        </svg>
        <div class="radar-tip">掌握度按错题数与复盘率估算：错题越少、复盘越勤越高；全空默认 85。</div>
      </div>

      <div class="sec-t">📊 板块提问分布</div>
      <div v-if="!banKuai.arr.length" class="empty">
        <div class="empty-i">🧭</div>
        <div class="empty-t">还没有提问记录</div>
        <div class="empty-d">去对话页问几道题，这里会按板块统计你的练习分布</div>
      </div>
      <div v-else class="bk-chart">
        <div v-for="[b, n] in banKuai.arr" :key="b" class="bk-row">
          <span class="bk-name">{{ b }}</span>
          <div class="bk-bar"><div class="bk-fill" :style="{ width: (n / banKuai.max) * 100 + '%' }"></div></div>
          <span class="bk-num">{{ n }}</span>
        </div>
      </div>

      <div class="sec-t">✅ 错题复盘率</div>
      <div class="rev-prog">
        <div class="rp-inner" :style="{ width: revRate + '%' }"></div>
        <span class="rp-l">{{ revRate }}%</span>
      </div>
      <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
        已复盘 {{ store.wqs.filter((q) => q.reviewed).length }} / {{ store.wqs.length }} 题 — 复盘到位是提分关键
      </div>

      <div class="sec-t">📄 明细（点击上方卡片查看）</div>
    </div>
    <div class="ov" :class="{ show }" @click.self="show = false">
      <div class="pnl">
        <h3>📊 明细</h3>
        <pre style="white-space: pre-wrap; font-size: 13px; font-family: inherit">{{ detail }}</pre>
        <div class="pnl-btns"><button class="btn btn-gh" @click="show = false">关闭</button></div>
      </div>
    </div>
  </div>
</template>
