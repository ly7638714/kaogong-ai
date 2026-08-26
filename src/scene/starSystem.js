// ===== 知识星球 · 3D 星图引擎（Three.js） =====
// 主星球 + 六大板块轨道行星 + 星尘粒子场，数据驱动规模/发光
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const COLORS = {
  bg: 0x04070f,
  main: 0x22d3ee,
  star: 0x8fd6ff
}
// 六大板块 → 行星颜色（青蓝军武盘）
export const PLATE_META = [
  { key: 'luoji', name: '逻辑判断', color: 0x22d3ee },
  { key: 'zhanggong', name: '言语理解', color: 0x3b82f6 },
  { key: 'ziliao', name: '资料分析', color: 0x818cf8 },
  { key: 'shuliang', name: '数量关系', color: 0x22c55e },
  { key: 'changshi', name: '常识判断', color: 0xf59e0b },
  { key: 'zhengzhi', name: '政治理论', color: 0xfb7185 }
]

// 主星球程序化纹理（经纬线 + 色块噪点）
function makeMainTexture() {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = '#071425'
  g.fillRect(0, 0, size, size)
  // 青蓝网格经纬线
  g.strokeStyle = 'rgba(34,211,238,0.5)'
  g.lineWidth = 2
  for (let i = 0; i <= 8; i++) {
    g.beginPath()
    g.moveTo((size / 8) * i, 0)
    g.lineTo((size / 8) * i, size)
    g.stroke()
    g.beginPath()
    g.moveTo(0, (size / 8) * i)
    g.lineTo(size, (size / 8) * i)
    g.stroke()
  }
  // 高亮色块（如考点）
  const pts = [
    [120, 140, 'rgba(34,211,238,0.5)'],
    [330, 100, 'rgba(59,130,246,0.45)'],
    [200, 330, 'rgba(129,140,248,0.4)'],
    [400, 260, 'rgba(34,197,94,0.4)']
  ]
  for (const [x, y, col] of pts) {
    g.fillStyle = col
    g.beginPath()
    g.arc(x, y, 26, 0, 2 * Math.PI)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// 生成星球 + 辉光贴图
function makeGlowSprite(color) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.25)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  return new THREE.Sprite(mat)
}

// 生成行星文字标签（CanvasSprite，跟随相机朝向）
function makeLabel(text, _color) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = size
  c.height = 96
  const g = c.getContext('2d')
  g.clearRect(0, 0, size, 96)
  g.font = 'bold 42px "Microsoft YaHei", "PingFang SC", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(34,211,238,0.8)'
  g.shadowBlur = 14
  g.fillStyle = '#d7f5ff'
  g.fillText(text, size / 2, 48)
  g.shadowBlur = 0
  g.strokeStyle = 'rgba(34,211,238,0.9)'
  g.lineWidth = 3
  g.strokeText(text, size / 2, 48)
  const tex = new THREE.CanvasTexture(c)
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false
  })
  const sp = new THREE.Sprite(mat)
  sp.scale.set(6, 2.2, 1)
  sp.renderOrder = 10
  return sp
}

export function createScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.bg)
  scene.fog = new THREE.Fog(COLORS.bg, 40, 110)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
  camera.position.set(0, 16, 30)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.shadowMap.enabled = false
  container.appendChild(renderer.domElement)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minDistance = 12
  controls.maxDistance = 70
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.6
  controls.enablePan = false

  // 灯光
  scene.add(new THREE.AmbientLight(0x33415d, 1.2))
  const key = new THREE.DirectionalLight(0xbfe9ff, 1.6)
  key.position.set(20, 30, 20)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x22d3ee, 0.8)
  rim.position.set(-20, -10, -20)
  scene.add(rim)

  // 星空粒子
  const starGeo = new THREE.BufferGeometry()
  const N = 3000
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 200
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const starMat = new THREE.PointsMaterial({
    color: COLORS.star,
    size: 0.22,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  // 主星球
  const mainSphere = new THREE.Mesh(
    new THREE.SphereGeometry(4.6, 64, 64),
    new THREE.MeshPhongMaterial({
      map: makeMainTexture(),
      emissive: 0x0a2a3d,
      emissiveIntensity: 0.35,
      shininess: 20
    })
  )
  scene.add(mainSphere)
  const mainGlow = makeGlowSprite(0x38bdf8)
  mainGlow.scale.setScalar(48)
  scene.add(mainGlow)

  // 轨道（六大板块）动态集合
  const orbitGroup = new THREE.Group()
  scene.add(orbitGroup)
  const planets = [] // {mesh, glow, ring, baseR, baseColor, angle, speed}

  const orbitColors = PLATE_META.map((p) => p.color)
  PLATE_META.forEach((meta, i) => {
    const ang = (i / 6) * Math.PI * 2
    const radius = 9.5 + i * 2.4
    // 轨道线
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.04, radius + 0.04, 96),
      new THREE.MeshBasicMaterial({
        color: orbitColors[i],
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide
      })
    )
    ring.rotation.x = Math.PI / 2
    orbitGroup.add(ring)
    // 行星网格
    const geo = new THREE.SphereGeometry(0.8, 32, 32)
    const mat = new THREE.MeshPhongMaterial({
      color: meta.color,
      emissive: meta.color,
      emissiveIntensity: 0.5,
      shininess: 30
    })
    const mesh = new THREE.Mesh(geo, mat)
    orbitGroup.add(mesh)
    const glow = makeGlowSprite(meta.color)
    glow.scale.setScalar(6)
    orbitGroup.add(glow)
    const label = makeLabel(meta.name, meta.color)
    orbitGroup.add(label)
    planets.push({
      mesh,
      glow,
      label,
      ring,
      baseR: radius,
      baseColor: meta.color,
      key: meta.key,
      name: meta.name,
      angle: ang,
      speed: 0.08 + Math.random() * 0.08,
      // 数据驱动
      targetScale: 1,
      scale: 1,
      targetGlow: 0.5,
      glowLevel: 0.5,
      level: 0,
      active: false,
      hover: false
    })
  })

  let lastT = performance.now(), elapsedT = 0

  // ===== 交互状态 =====
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let hoveredKey = null // 悬停行星 key
  let selectedKey = null // 点击选择 key
  let focus = null // {key, t} 聚焦缓动
  const pulses = [] // 能量环 {mesh, scale, max, alpha}
  const onPlanetEnter = []
  const onPlanetLeave = []
  const onPlanetClick = []

  // 能量环（扩散波纹）
  function spawnRing(x, z, color) {
    const geo = new THREE.RingGeometry(0.5, 0.72, 48)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    const ring = new THREE.Mesh(geo, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.2, z)
    scene.add(ring)
    pulses.push({ mesh: ring, scale: 1, max: 8 + Math.random() * 3, alpha: 0.8 })
    // 自动清理
    setTimeout(() => {
      scene.remove(ring)
      const i = pulses.indexOf(ring)
      if (i >= 0) pulses.splice(i, 1)
      mat.dispose()
      geo.dispose()
    }, 2600)
  }
  function applyFocusStep(dt) {
    if (!focus) return
    const pl = planets.find((p) => p.key === focus.key)
    if (pl) {
      const tx = Math.cos(pl.angle) * pl.baseR
      const tz = Math.sin(pl.angle) * pl.baseR
      const targetPos = new THREE.Vector3(tx * 1.25, 2, tz * 1.25)
      focus.t -= dt
      if (focus.t <= 0) {
        // 到达：对准行星
        camera.position.lerp(targetPos, Math.min(1, dt * 3))
        controls.target.lerp(new THREE.Vector3(tx, 0, tz), Math.min(1, dt * 3))
      }
    }
  }
  // 当前行星世界坐标
  function planetWorld(p) {
    const x = Math.cos(p.angle) * p.baseR
    const z = Math.sin(p.angle) * p.baseR
    return { x, z }
  }

  // 每帧更新函数：从数据源读取各行星等级/活跃度
  const api = {
    on(event, fn) {
      if (event === 'planetEnter') onPlanetEnter.push(fn)
      else if (event === 'planetLeave') onPlanetLeave.push(fn)
      else if (event === 'planetClick') onPlanetClick.push(fn)
    },
    // 聚焦某行星（按 key）
    focusTo(key) {
      focus = { key, t: 0.6 }
      selectedKey = key
    },
    clearFocus() {
      selectedKey = null
      focus = null
    },
    // 从某行星发起能量脉冲
    pulseByKey(key) {
      const p = planets.find((x) => x.key === key)
      if (p) {
        const { x, z } = planetWorld(p)
        spawnRing(x, z, p.baseColor)
      }
    },
    // 行星成长突进：短暂放大 + 强脉冲（对话联动成长动画）
    bumpByKey(key) {
      const p = planets.find((x) => x.key === key)
      if (p) {
        p.bump = 1.6
        const { x, z } = planetWorld(p)
        spawnRing(x, z, 0xffffff)
        setTimeout(() => spawnRing(x, z, p.baseColor), 180)
      }
    },
    render(targets) {
      const now = performance.now()
      const dt = Math.min((now - lastT) / 1000, 0.05)
      lastT = now
      elapsedT += dt
      mainSphere.rotation.y += dt * 0.08
      stars.rotation.y += dt * 0.01
      // 更新行星
      planets.forEach((p, i) => {
        const t = targets && targets[i]
        if (t) {
          p.targetScale = 0.7 + Math.min(0.9, (t.level || 0) * 0.18)
          p.glowLevel = 0.25 + Math.min(0.9, (t.glow || 0) * 0.5)
          p.active = !!t.active
        }
        p.scale += (p.targetScale - p.scale) * dt * 1.5
        p.angle += dt * p.speed
        const x = Math.cos(p.angle) * p.baseR
        const z = Math.sin(p.angle) * p.baseR
        p.mesh.position.set(x, 0, z)
        const interactive = p.hover || selectedKey === p.key || p.active
        // 成长突进：bump 从 1.6 衰减到 0，期间放大（等比叠加）
        const bumpPeak = (p.bump || 0)
        p.mesh.scale.setScalar(p.scale * (interactive ? 1.22 : 1) * (1 + bumpPeak * 0.35))
        p.mesh.rotation.y += dt * 0.5
        if (p.bump) p.bump = Math.max(0, p.bump - dt * 2.2)
        // 活跃/选中行星脉冲发光
        const pulse = interactive ? 1 + Math.sin(elapsedT * 4) * 0.3 : 1
        p.mesh.material.emissiveIntensity = Math.max(p.glowLevel, interactive ? 0.6 : 0) * pulse
        p.mesh.material.color.setHex(p.baseColor).lerp(new THREE.Color(0xffffff), p.scale / 2)
        p.glow.scale.setScalar(6 + p.glowLevel * 8 + (interactive ? 4 : 0))
        p.glow.position.set(x, 0, z)
        // 文字标签跟随行星，浮于上方
        p.label.position.set(x, p.scale * 2.6 + 0.2, z)
        p.label.material.opacity = p.hover || selectedKey === p.key || p.active ? 1 : 0.75
      })
      // 能量环动画
      pulses.forEach((r) => {
        r.scale += dt * 6
        r.mesh.scale.setScalar(r.scale)
        r.alpha -= dt * 0.3
        r.mesh.material.opacity = Math.max(0, r.alpha)
      })
      // 聚焦缓动
      applyFocusStep(dt)
      controls.update()
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    },
    setPauseAutoRotate(on) {
      controls.autoRotate = !on
    },
    dispose() {
      controls.dispose()
      renderer.dispose()
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('click', onPointerClick)
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }

  // ===== 鼠标交互：悬停 / 点击（射线检测） =====
  function hitTest(ev) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
    raycaster.setFromCamera(mouse, camera)
    const meshes = planets.map((p) => p.mesh)
    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length) {
      return planets.find((p) => p.mesh === hits[0].object)
    }
    return null
  }
  function onPointerMove(e) {
    const p = hitTest(e)
    const k = p ? p.key : null
    if (k !== hoveredKey) {
      if (hoveredKey) {
        const prev = planets.find((x) => x.key === hoveredKey)
        if (prev) prev.hover = false
        onPlanetLeave.forEach((fn) => fn(hoveredKey))
      }
      hoveredKey = k
      if (p) {
        p.hover = true
        renderer.domElement.style.cursor = 'pointer'
        onPlanetEnter.forEach((fn) => fn(k, p))
      } else {
        renderer.domElement.style.cursor = 'default'
      }
    }
  }
  function onPointerClick(e) {
    const p = hitTest(e)
    if (p) {
      selectedKey = p.key
      onPlanetClick.forEach((fn) => fn(p.key, p))
    }
  }
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('click', onPointerClick)

  return api
}
