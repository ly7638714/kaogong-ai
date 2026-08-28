<template>
  <!-- 用户上传的真实形象优先 -->
  <span v-if="img" class="pet-avatar-img" :style="{ width: size + 'px', height: size + 'px', backgroundImage: 'url(' + img + ')' }" :title="skin.name"></span>
  <!-- 原创 Q 版角色头像 -->
  <svg v-else viewBox="0 0 120 120" class="pet-avatar" :style="{ width: size + 'px', height: size + 'px' }" :aria-label="skin.name">
    <defs>
      <linearGradient :id="gid + '-hair'" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="lighten(skin.hair, 22)" />
        <stop offset="1" :stop-color="skin.hair" />
      </linearGradient>
      <radialGradient :id="gid + '-face'" cx="0.4" cy="0.35" r="1">
        <stop offset="0" stop-color="#fff4e6" />
        <stop offset="1" :stop-color="skin.skin || '#ffe3c9'" />
      </radialGradient>
      <linearGradient :id="gid + '-coat'" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="lighten(skin.coat, 18)" />
        <stop offset="1" :stop-color="skin.coat" />
      </linearGradient>
    </defs>

    <!-- 后发（长发/马尾/焰发） -->
    <g v-if="skin.hairBack" :fill="`url(#${gid}-hair)`">
      <path v-for="(p, i) in skin.hairBack" :key="i" :d="p" />
    </g>
    <path v-else d="M30 48 C28 72 34 92 60 96 C86 92 92 72 90 48 C84 62 74 70 60 72 C46 70 36 62 30 48 Z" :fill="`url(#${gid}-hair)`" />

    <!-- 身体 / 衣领 -->
    <path d="M36 98 C36 84 46 78 60 78 C74 78 84 84 84 98 L84 122 L36 122 Z" :fill="`url(#${gid}-coat)`" />
    <path :d="skin.collarPath || 'M52 78 C54 86 66 86 68 78 Z'" :fill="skin.collar || '#ffffff'" />
    <path v-if="skin.collarLine" :d="skin.collarLine" stroke="#ffffff" stroke-opacity=".35" stroke-width="2" fill="none" />
    <rect v-if="skin.tie" x="56" y="84" width="8" height="18" rx="2" :fill="skin.tie" />

    <!-- 脸 -->
    <ellipse cx="60" cy="58" rx="27" ry="25" :fill="`url(#${gid}-face)`" />

    <!-- 眼睛（按角色） -->
    <g v-if="skin.eyemask">
      <rect x="37" y="48" width="46" height="17" rx="8.5" :fill="skin.eyemask" />
      <path d="M45 56.5 L53 56.5 L49 61.5 Z" fill="#111" />
      <path d="M67 56.5 L75 56.5 L71 61.5 Z" fill="#111" />
    </g>
    <g v-else-if="skin.eyeStyle !== 'closed'">
      <!-- 大眼（Q版） -->
      <g v-for="ex in [48, 72]" :key="ex">
        <ellipse :cx="ex" cy="60" rx="5.6" ry="7.4" :fill="skin.eye || '#333'" />
        <ellipse :cx="ex" cy="58" rx="3.4" ry="4.6" :fill="lighten(skin.eye || '#333', 30)" />
        <circle :cx="ex - 1.6" cy="55.5" r="2.2" fill="#fff" />
        <circle :cx="ex + 1.6" cy="63.5" r="1.1" fill="#fff" opacity=".85" />
      </g>
      <!-- 眉毛 -->
      <path v-if="skin.brows" :d="skin.brows" stroke="#7a5a3a" stroke-width="2.4" fill="none" stroke-linecap="round" />
    </g>
    <g v-else>
      <path d="M42 60 Q48 56.5 54 60 M66 60 Q72 56.5 78 60" stroke="#333" stroke-width="2.6" fill="none" stroke-linecap="round" />
    </g>

    <!-- 腮红 -->
    <ellipse cx="43" cy="68" rx="4.4" ry="2.8" :fill="skin.blush || 'rgba(255,120,140,.5)'" />
    <ellipse cx="77" cy="68" rx="4.4" ry="2.8" :fill="skin.blush || 'rgba(255,120,140,.5)'" />

    <!-- 嘴 -->
    <path v-if="skin.mouth === 'open'" d="M53 71 Q60 80 67 71 Z" fill="#c96a5a" />
    <path v-else-if="skin.mouth === 'smirk'" d="M50 71 Q60 77 70 70 Q62 76 50 71 Z" fill="none" stroke="#b06050" stroke-width="2.4" stroke-linecap="round" />
    <path v-else d="M55 72 Q60 76.5 65 72" stroke="#b06050" stroke-width="2.2" fill="none" stroke-linecap="round" />

    <!-- 前发（分层刘海 + 高光） -->
    <g :fill="`url(#${gid}-hair)`">
      <path :d="skin.bangs || 'M33 54 C34 36 44 28 60 28 C76 28 86 36 87 54 C82 46 76 42 72 48 C66 42 54 42 48 48 C44 42 38 46 33 54 Z'" />
      <path :d="skin.bangs2 || 'M34 51 C38 44 45 40 51 46 C57 41 63 41 69 46 C75 40 82 44 86 51 C83 57 74 61 60 61 C46 61 37 57 34 51 Z'" opacity=".9" />
      <path :d="skin.hairHigh || 'M42 34 C46 31 52 30 56 31 C50 36 46 40 42 46 Z'" opacity=".5" />
    </g>

    <!-- 呆毛 / 发饰 / 特征配件 -->
    <path v-if="skin.ahoge" d="M60 28 C60 18 66 13 74 10 C68 16 67 22 65 28 Z" :fill="skin.hair" />
    <g v-if="skin.accessory">
      <path v-if="skin.accessory === 'circlet'" d="M36 36 C36 30 48 26 60 26 C72 26 84 30 84 36 C84 32 72 30 60 30 C48 30 36 32 36 36 Z" :fill="skin.accent || '#f59e0b'" />
      <path v-if="skin.accessory === 'circlet'" d="M48 29 C52 34 56 34 60 29 C56 26 52 26 48 29 Z" :fill="skin.accent || '#f59e0b'" />
      <path v-if="skin.accessory === 'circlet'" d="M60 29 C64 34 68 34 72 29 C68 26 64 26 60 29 Z" :fill="skin.accent || '#f59e0b'" />
      <circle v-if="skin.accessory === 'band'" cx="60" cy="30" r="4.5" :fill="skin.accent || '#ef4444'" />
      <path v-if="skin.accessory === 'hairpin'" d="M40 34 C50 24 70 24 80 34 C70 30 50 30 40 34 Z" :fill="skin.accent || '#d4a017'" />
      <path v-if="skin.accessory === 'ear'" d="M20 56 C14 58 12 66 18 72 C24 68 25 62 24 58 Z" :fill="skin.skin || '#ffe3c9'" stroke="#e8b48c" stroke-width="1.5" />
      <path v-if="skin.accessory === 'ear'" d="M100 56 C106 58 108 66 102 72 C96 68 95 62 96 58 Z" :fill="skin.skin || '#ffe3c9'" stroke="#e8b48c" stroke-width="1.5" />
      <path v-if="skin.accessory === 'ear'" d="M20 56 C18 50 22 48 26 50 C24 54 23 56 24 58 Z" fill="#1f2430" />
      <path v-if="skin.accessory === 'ear'" d="M100 56 C102 50 98 48 94 50 C96 54 97 56 96 58 Z" fill="#1f2430" />
      <path v-if="skin.accessory === 'horn'" d="M36 34 C34 24 40 18 46 16 C44 24 44 30 42 34 Z" :fill="skin.accent || '#f59e0b'" />
      <path v-if="skin.accessory === 'horn'" d="M84 34 C86 24 80 18 74 16 C76 24 76 30 78 34 Z" :fill="skin.accent || '#f59e0b'" />
      <path v-if="skin.accessory === 'flame'" d="M34 40 C28 30 32 20 42 18 C38 26 40 30 44 32 C40 36 36 40 34 40 Z" :fill="skin.accent || '#f97316'" />
      <path v-if="skin.accessory === 'flame'" d="M86 40 C92 30 88 20 78 18 C82 26 80 30 76 32 C80 36 84 40 86 40 Z" :fill="skin.accent || '#f97316'" />
      <g v-if="skin.accessory === 'glasses'">
        <circle cx="48" cy="58" r="11" fill="rgba(255,255,255,.25)" :stroke="skin.glasses || '#2f3a45'" stroke-width="2.5" />
        <circle cx="72" cy="58" r="11" fill="rgba(255,255,255,.25)" :stroke="skin.glasses || '#2f3a45'" stroke-width="2.5" />
        <path d="M59 58 L61 58" :stroke="skin.glasses || '#2f3a45'" stroke-width="2.5" />
        <path d="M37 56 L29 51" :stroke="skin.glasses || '#2f3a45'" stroke-width="2.5" stroke-linecap="round" />
        <path d="M83 56 L91 51" :stroke="skin.glasses || '#2f3a45'" stroke-width="2.5" stroke-linecap="round" />
      </g>
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { petSkin, petImgOf, PET_SKINS } from '../utils/pet'
const { skinId } = defineProps({ size: { type: Number, default: 40 }, skinId: { type: String, default: '' } })
const skin = computed(() => (skinId ? PET_SKINS.find((s) => s.id === skinId) || petSkin.value : petSkin.value))
const img = computed(() => petImgOf(skinId || petSkin.value.id))
const gid = computed(() => 'petav' + Math.random().toString(36).slice(2, 8))
function lighten(hex, amt) {
  try {
    let h = String(hex || '#888').replace('#', '')
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    const n = parseInt(h, 16)
    const r = Math.min(255, ((n >> 16) & 255) + amt)
    const g = Math.min(255, ((n >> 8) & 255) + amt)
    const b = Math.min(255, (n & 255) + amt)
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
  } catch (e) {
    return hex
  }
}
</script>
