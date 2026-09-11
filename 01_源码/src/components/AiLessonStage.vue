<script setup>
import { computed } from 'vue'

const props = defineProps({
  scene: { type: Object, default: null },
  playing: { type: Boolean, default: false },
  sceneIndex: { type: Number, default: 0 }
})

const type = computed(() => (props.scene && props.scene.type) || 'flow')
const points = computed(() => {
  const p = (props.scene && props.scene.points) || []
  return Array.from({ length: 4 }, (_, i) => String(p[i] || '').slice(0, 36))
})
const title = computed(() => (props.scene && props.scene.title) || '')
const body = computed(() => (props.scene && props.scene.body) || '')
const uid = Math.random().toString(36).slice(2, 8)
const example = computed(() => (props.scene && props.scene.example) || null)
const exampleOpts = computed(() => {
  const ex = example.value || {}
  const o = ex.opts || []
  return Array.from({ length: 4 }, (_, i) => String(o[i] || '').slice(0, 28))
})
const exampleAnswer = computed(() => String((example.value && example.value.answer) || ''))
const examplePath = computed(() => String((example.value && example.value.path) || ''))
</script>

<template>
  <div class="als-stage" :class="{ playing }">
    <svg viewBox="0 0 960 430" role="img" :aria-label="title">
      <defs>
        <linearGradient :id="'alsBg' + uid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0b1624" />
          <stop offset="1" stop-color="#15263b" />
        </linearGradient>
        <filter :id="'alsGlow' + uid"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="960" height="430" rx="18" :fill="'url(#alsBg' + uid + ')'" />
      <rect x="22" y="22" width="560" height="386" rx="14" fill="rgba(255,255,255,.025)" stroke="rgba(148,163,184,.18)" />
      <rect x="600" y="35" width="330" height="350" rx="16" fill="rgba(15,23,42,.62)" stroke="rgba(148,163,184,.22)" />

      <!-- 动画教师角色：连续眨眼、口型、摆臂和指示动作 -->
      <g class="als-teacher">
        <ellipse cx="765" cy="390" rx="92" ry="12" fill="rgba(0,0,0,.28)" />
        <g>
          <animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" dur="2.8s" repeatCount="indefinite" />
          <path d="M690 370 Q700 270 765 260 Q830 270 840 370 Z" fill="#2563eb" />
          <path d="M711 302 Q765 342 819 302 L808 369 Q765 392 722 369 Z" fill="#1d4ed8" />
          <circle cx="765" cy="216" r="45" fill="#f3c7a7" stroke="#0f172a" stroke-width="3" />
          <path d="M724 207 Q738 163 766 169 Q802 175 806 216 Q779 192 742 200 Q734 206 724 207" fill="#263244" />
          <ellipse cx="748" cy="216" rx="5" ry="7" fill="#0f172a"><animate attributeName="ry" values="7;7;1;7" dur="3.1s" repeatCount="indefinite" /></ellipse>
          <ellipse cx="784" cy="216" rx="5" ry="7" fill="#0f172a"><animate attributeName="ry" values="7;7;1;7" dur="3.1s" repeatCount="indefinite" /></ellipse>
          <path d="M747 245 Q765 260 784 245" fill="none" stroke="#9f1239" stroke-width="4" stroke-linecap="round">
            <animate attributeName="d" values="M747 245 Q765 258 784 245;M747 245 Q765 267 784 245;M747 245 Q765 258 784 245" dur=".42s" repeatCount="indefinite" />
          </path>
          <g transform="translate(805 285)">
            <animateTransform attributeName="transform" type="rotate" values="0 805 285;18 805 285;34 805 285;8 805 285;0 805 285" dur="3.2s" repeatCount="indefinite" />
            <path d="M0 0 L86 -28" stroke="#f3c7a7" stroke-width="18" stroke-linecap="round" />
            <path d="M78 -28 L118 -44" stroke="#fbbf24" stroke-width="7" stroke-linecap="round" />
            <circle cx="119" cy="-45" r="4" fill="#fbbf24" />
          </g>
          <g transform="translate(720 285)">
            <animateTransform attributeName="transform" type="rotate" values="0 720 285;-12 720 285;8 720 285;0 720 285" dur="3.6s" repeatCount="indefinite" />
            <path d="M0 0 L-58 42" stroke="#f3c7a7" stroke-width="18" stroke-linecap="round" />
          </g>
          <rect x="742" y="318" width="46" height="24" rx="9" fill="rgba(15,23,42,.78)" stroke="rgba(255,255,255,.25)" />
          <text x="765" y="335" text-anchor="middle" fill="#fff" font-size="14">{{ type === 'trap' ? '避坑' : type === 'compare' ? '对比' : type === 'checkpoint' ? '检验' : '讲解' }}</text>
        </g>
      </g>

      <text x="52" y="62" fill="#67e8f9" font-size="18" font-weight="700">AI 动画微课 · 第 {{ sceneIndex + 1 }} 幕</text>
      <text x="52" y="92" fill="#f8fafc" font-size="25" font-weight="800">{{ title }}</text>
      <text x="52" y="124" fill="#cbd5e1" font-size="17">{{ body.slice(0, 42) }}</text>

      <!-- 场景动画：每类知识点不是整页淡入，而是按时间线逐步出现 / 移动 / 连线 / 高亮 -->
      <g v-if="type === 'hook'" class="als-scene">
        <circle cx="195" cy="242" r="66" fill="none" stroke="#38bdf8" stroke-width="4" stroke-dasharray="10 8">
          <animateTransform attributeName="transform" type="rotate" from="0 195 242" to="360 195 242" dur="7s" repeatCount="indefinite" />
        </circle>
        <circle cx="195" cy="242" r="38" fill="#0ea5e9" opacity=".23"><animate attributeName="r" values="30;46;30" dur="2.2s" repeatCount="indefinite" /></circle>
        <text x="195" y="250" text-anchor="middle" fill="#f8fafc" font-size="22" font-weight="800">考点</text>
        <path d="M290 242 C350 180 395 300 470 234" fill="none" stroke="#fbbf24" stroke-width="5" stroke-dasharray="8 7"><animate attributeName="stroke-dashoffset" values="0;-30" dur="1s" repeatCount="indefinite" /></path>
        <text x="472" y="240" fill="#fbbf24" font-size="19">先识别结构</text>
        <text x="360" y="328" fill="#cbd5e1" font-size="16">{{ points[0] || '不要先看选项' }}</text>
      </g>

      <g v-else-if="type === 'process'" class="als-scene">
        <g v-for="(p, i) in points" :key="i">
          <rect :x="70 + i * 128" y="222" width="102" height="72" rx="12" fill="rgba(34,211,238,.12)" stroke="#22d3ee" stroke-width="2">
            <animate attributeName="opacity" values="0;1" dur=".45s" :begin="(i * .55) + 's'" fill="freeze" />
          </rect>
          <text :x="121 + i * 128" y="253" text-anchor="middle" fill="#67e8f9" font-size="19" font-weight="800">{{ i + 1 }}</text>
          <text :x="121 + i * 128" y="278" text-anchor="middle" fill="#e2e8f0" font-size="13">{{ p.slice(0, 8) }}</text>
          <path v-if="i < 3" :d="'M' + (176 + i * 128) + ' 258 L' + (198 + i * 128) + ' 258'" stroke="#fbbf24" stroke-width="5" marker-end="url(#arrow)">
            <animate attributeName="opacity" values="0;1" dur=".35s" :begin="(i * .55 + .25) + 's'" fill="freeze" />
          </path>
        </g>
      </g>

      <g v-else-if="type === 'deep'" class="als-scene">
        <rect x="70" y="180" width="480" height="160" rx="16" fill="rgba(56,189,248,.08)" stroke="#38bdf8" stroke-width="2" />
        <text x="96" y="218" fill="#7dd3fc" font-size="20" font-weight="800">深度拆解：为什么这样判</text>
        <g v-for="(p, i) in points.slice(0, 3)" :key="i">
          <circle :cx="102" :cy="252 + i * 31" r="6" fill="#38bdf8"><animate attributeName="r" values="5;9;5" dur="1.8s" :begin="(i * .22) + 's'" repeatCount="indefinite" /></circle>
          <text :x="122" :y="258 + i * 31" fill="#e2e8f0" font-size="15">{{ p.slice(0, 30) }}</text>
        </g>
        <path d="M565 260 C610 205 635 320 680 250" fill="none" stroke="#fbbf24" stroke-width="4" stroke-dasharray="7 6"><animate attributeName="stroke-dashoffset" values="0;-26" dur="1s" repeatCount="indefinite" /></path>
        <text x="682" y="255" fill="#fbbf24" font-size="14">因果/结构</text>
      </g>

      <g v-else-if="type === 'example'" class="als-scene">
        <rect x="65" y="172" width="500" height="182" rx="16" fill="rgba(251,191,36,.08)" stroke="#fbbf24" stroke-width="2" />
        <text x="90" y="207" fill="#fbbf24" font-size="19" font-weight="800">例题走一遍</text>
        <text x="90" y="239" fill="#f8fafc" font-size="15">{{ (example && example.q || body).slice(0, 31) }}</text>
        <g v-for="(o, i) in exampleOpts" :key="i">
          <text :x="92" :y="272 + i * 25" :fill="exampleAnswer === 'ABCD'[i] ? '#6ee7b7' : '#cbd5e1'" font-size="14">{{ 'ABCD'[i] }}. {{ o }}</text>
          <circle v-if="exampleAnswer === 'ABCD'[i]" :cx="70" :cy="267 + i * 25" r="8" fill="#34d399"><animate attributeName="r" values="7;11;7" dur="1.4s" repeatCount="indefinite" /></circle>
        </g>
        <g v-if="examplePath">
          <rect x="590" y="208" width="260" height="116" rx="14" fill="rgba(52,211,153,.09)" stroke="#34d399" />
          <text x="610" y="238" fill="#6ee7b7" font-size="16" font-weight="800">正确路径</text>
          <text x="610" y="268" fill="#e2e8f0" font-size="13">{{ examplePath.slice(0, 27) }}</text>
          <text x="610" y="294" fill="#e2e8f0" font-size="13">{{ examplePath.slice(27, 54) }}</text>
        </g>
      </g>

      <g v-else-if="type === 'compare'" class="als-scene">
        <rect x="72" y="190" width="205" height="150" rx="14" fill="rgba(52,211,153,.12)" stroke="#34d399" />
        <text x="174" y="224" text-anchor="middle" fill="#6ee7b7" font-size="20" font-weight="800">正确方向</text>
        <text x="174" y="258" text-anchor="middle" fill="#e2e8f0" font-size="15">{{ points[0] || '主体一致' }}</text>
        <text x="174" y="287" text-anchor="middle" fill="#e2e8f0" font-size="15">{{ points[1] || '方向一致' }}</text>
        <rect x="350" y="190" width="205" height="150" rx="14" fill="rgba(251,113,133,.12)" stroke="#fb7185" />
        <text x="452" y="224" text-anchor="middle" fill="#fb7185" font-size="20" font-weight="800">干扰项</text>
        <text x="452" y="258" text-anchor="middle" fill="#e2e8f0" font-size="15">{{ points[2] || '偷换主体' }}</text>
        <text x="452" y="287" text-anchor="middle" fill="#e2e8f0" font-size="15">{{ points[3] || '范围扩大' }}</text>
        <circle cx="320" cy="265" r="28" fill="#fbbf24"><animate attributeName="cx" values="286;354;286" dur="2.8s" repeatCount="indefinite" /></circle>
        <text x="320" y="272" text-anchor="middle" fill="#0f172a" font-size="20" font-weight="900">VS</text>
      </g>

      <g v-else-if="type === 'trap'" class="als-scene">
        <path d="M312 184 L382 305 H242 Z" fill="rgba(251,191,36,.18)" stroke="#fbbf24" stroke-width="5" />
        <text x="312" y="278" text-anchor="middle" fill="#fbbf24" font-size="54" font-weight="900">!</text>
        <g v-for="(p, i) in points.slice(0, 3)" :key="i">
          <rect :x="430" :y="180 + i * 54" width="178" height="38" rx="10" fill="rgba(251,113,133,.1)" stroke="#fb7185">
            <animate attributeName="opacity" values="0;1" dur=".4s" :begin="(i * .6) + 's'" fill="freeze" />
          </rect>
          <text :x="444" :y="205 + i * 54" fill="#fecdd3" font-size="14">{{ p.slice(0, 13) }}</text>
        </g>
      </g>

      <g v-else-if="type === 'checkpoint'" class="als-scene">
        <rect x="98" y="180" width="330" height="148" rx="16" fill="rgba(34,211,238,.1)" stroke="#22d3ee" stroke-width="3" />
        <text x="126" y="218" fill="#67e8f9" font-size="20" font-weight="800">暂停检查</text>
        <text x="126" y="256" fill="#f8fafc" font-size="18">{{ body.slice(0, 26) }}</text>
        <text x="126" y="292" fill="#94a3b8" font-size="15">先回答，再继续播放</text>
        <circle cx="390" cy="256" r="54" fill="#22d3ee" opacity=".16"><animate attributeName="r" values="42;62;42" dur="1.8s" repeatCount="indefinite" /></circle>
        <text x="390" y="265" text-anchor="middle" fill="#67e8f9" font-size="28">?</text>
      </g>

      <g v-else class="als-scene">
        <rect x="65" y="185" width="500" height="152" rx="16" fill="rgba(167,139,250,.1)" stroke="rgba(167,139,250,.75)" stroke-width="3" />
        <text x="94" y="226" fill="#c4b5fd" font-size="20" font-weight="800">方法落地</text>
        <g v-for="(p, i) in points" :key="i">
          <circle :cx="102" :cy="258 + i * 30" r="5" fill="#34d399"><animate attributeName="r" values="4;7;4" dur="1.7s" :begin="(i * .2) + 's'" repeatCount="indefinite" /></circle>
          <text :x="120" :y="264 + i * 30" fill="#e2e8f0" font-size="14">{{ p.slice(0, 24) }}</text>
        </g>
      </g>
    </svg>
    <div class="als-caption"><b>{{ title }}</b><span>{{ body }}</span></div>
  </div>
</template>

<style scoped>
.als-stage { width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid rgba(148,163,184,.25); background: #0b1624; }
.als-stage svg { display: block; width: 100%; height: auto; }
.als-stage.playing .als-scene { filter: drop-shadow(0 0 5px rgba(34,211,238,.22)); }
.als-caption { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px 12px; background: rgba(15,23,42,.88); }
.als-caption b { color: #67e8f9; flex: 0 0 auto; }
.als-caption span { color: #cbd5e1; line-height: 1.65; }
@media (max-width: 640px) { .als-caption { flex-direction: column; gap: 4px; } .als-stage svg { min-height: 250px; } }
</style>
