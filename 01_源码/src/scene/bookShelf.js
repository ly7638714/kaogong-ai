// ===== 3D 第一人称图书馆引擎（Three.js）=====
// 真人走进阅览室：WASD 移动 + 鼠标拖拽视角，靠近书架伸手拿书，翻页后放回
import * as THREE from 'three'

const PALETTE = [
  0x2f6fb3, 0x7c3aed, 0x0e9f6e, 0xc2410c, 0x7a1fa2, 0x08707c, 0xbe123c, 0x166534, 0xb45309
]

function makeSpineTexture(title, color, isRead) {
  const c = document.createElement('canvas')
  c.width = 192
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#' + color.toString(16).padStart(6, '0')
  g.fillRect(0, 0, 192, 256)
  // 已读：金色书脊光带 + 顶部书签 + ✓
  if (isRead) {
    g.fillStyle = 'rgba(251,191,36,0.22)'
    g.fillRect(0, 0, 192, 256)
    // 顶部金色书签
    g.fillStyle = '#f59e0b'
    g.fillRect(0, 0, 192, 26)
    g.fillStyle = '#fff7d6'
    g.font = 'bold 16px sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('已读 ✓', 96, 14)
  }
  g.strokeStyle = isRead ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.45)'
  g.lineWidth = isRead ? 6 : 4
  g.strokeRect(4, 4, 184, 248)
  g.fillStyle = '#eaf6ff'
  g.font = 'bold 30px "Microsoft YaHei","PingFang SC",sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const ch = String(title || '书').split('')
  ch.forEach((c0, i) => g.fillText(c0, 96, 40 + i * 44))
  return new THREE.CanvasTexture(c)
}

export function createLibrary(container, books, readSet) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0f18)
  scene.fog = new THREE.Fog(0x0b0f18, 26, 60)

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100)
  const camPos = new THREE.Vector3(0, 1.7, 8)
  let yaw = 0
  let pitch = 0
  camera.position.copy(camPos)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0x0b0f18)
  container.appendChild(renderer.domElement)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'

  // 灯光
  scene.add(new THREE.AmbientLight(0x4a5568, 1.2))
  const warm = new THREE.PointLight(0xffdcb0, 0.9, 30)
  warm.position.set(0, 3.6, 4)
  scene.add(warm)
  const cool = new THREE.PointLight(0x88c4ff, 0.5, 30)
  cool.position.set(-6, 3.2, -4)
  scene.add(cool)

  // ===== 阅览室空间 =====
  // 地面
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshPhongMaterial({ color: 0x2a1f16 })
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  // 墙
  const wallMat = new THREE.MeshPhongMaterial({ color: 0x1c232b, emissive: 0x10161d })
  const wallGeo = new THREE.PlaneGeometry(60, 8)
  const mkWall = (x, z, rz) => {
    const m = new THREE.Mesh(wallGeo, wallMat)
    m.position.set(x, 4, z)
    m.rotation.y = rz
    scene.add(m)
  }
  mkWall(0, -15, 0) // 后
  mkWall(-15, 0, Math.PI / 2) // 左
  mkWall(15, 0, -Math.PI / 2) // 右

  // ===== 书架布置（阅览室） =====
  const colorMap = {}
  books.forEach((b) => {
    if (colorMap[b.shelf] === undefined) colorMap[b.shelf] = PALETTE[Object.keys(colorMap).length % PALETTE.length]
  })
  const SHELFS = [
    { x: -11, z: -3, ry: Math.PI / 2 }, // 左墙书架1
    { x: -8, z: -9, ry: Math.PI / 2 }, // 左墙书架2
    { x: 0, z: 6, ry: 0 } // 中间岛书架
  ]
  const bookMeshes = []
  let bi = 0
  const SHELF_ROWS = 3
  const PER_ROW = 7
  shelvesLoop: for (let s = 0; s < SHELFS.length; s++) {
    const cfg = SHELFS[s]
    const shelfGroup = new THREE.Group()
    // 书架整体绕其中心竖轴旋转朝向
    for (let r = 0; r < SHELF_ROWS; r++) {
      for (let i = 0; i < PER_ROW; i++) {
        const b = books[bi]
        if (!b) break shelvesLoop
        const color = colorMap[b.shelf]
        const w = 0.55
        const h = 1.5 + (b.special ? 0.5 : 0)
        const d = 0.7
        const tex = makeSpineTexture(b.name, color, readSet && readSet.has(b.name))
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ map: tex }))
        const col = i
        const row = r
        const xx = (col - 3) * 0.85
        const yy = h / 2 + 0.2 + row * 1.9
        box.position.set(xx, yy, 0)
        box.userData = { book: b, color, shelfIdx: s }
        shelfGroup.add(box)
        bookMeshes.push(box)
        bi++
      }
      // 层板
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(PER_ROW * 0.85 + 0.4, 0.12, 1.2),
        new THREE.MeshPhongMaterial({ color: 0x4a3220, emissive: 0x241409 })
      )
      plank.position.set(0, 0.08 + r * 1.9, 0)
      shelfGroup.add(plank)
    }
    // 书架主体框
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(PER_ROW * 0.85 + 0.3, SHELF_ROWS * 1.9 + 0.3, 1.3),
      new THREE.MeshPhongMaterial({ color: 0x3a281a, emissive: 0x1a0f08 })
    )
    frame.position.set(0, (SHELF_ROWS * 1.9 + 0.3) / 2, 0)
    shelfGroup.add(frame)
    // 朝向与位置（书架绕中心旋转，书朝走道）
    const g = new THREE.Group()
    g.add(shelfGroup)
    g.position.set(cfg.x, 0, cfg.z)
    g.rotation.y = cfg.ry
    scene.add(g)
  }

  // ===== 第一人称控制 =====
  const keys = {}
  const speed = 0.12
  function onKeyDown(e) {
    keys[e.code] = true
  }
  function onKeyUp(e) {
    keys[e.code] = false
  }
  // 鼠标拖拽转视角
  let dragging = false
  let lastX = 0,
    lastY = 0
  function onDown(e) {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  }
  function onUp() {
    dragging = false
  }
  function onMove(e) {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    yaw -= dx * 0.005
    pitch -= dy * 0.005
    pitch = Math.max(-1.2, Math.min(1.2, pitch))
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  renderer.domElement.addEventListener('mousedown', onDown)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('mousemove', onMove)

  // 前进方向（基于 yaw）
  function move(dt) {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    // 简化 W/S->前后 A/D->左右 (无视 pitch)
    let mx = 0,
      mz = 0
    if (keys['KeyW'] || keys['ArrowUp']) {
      mx += forward.x
      mz += forward.z
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
      mx -= forward.x
      mz -= forward.z
    }
    if (keys['KeyA'] || keys['ArrowLeft']) {
      mx += right.x
      mz += right.z
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
      mx -= right.x
      mz -= right.z
    }
    const len = Math.hypot(mx, mz)
    if (len > 0.01) {
      const nx = (mx / len) * speed * dt * 60
      const nz = (mz / len) * speed * dt * 60
      const nx1 = camPos.x + nx
      const nz1 = camPos.z + nz
      // 简单边界约束
      if (nx1 > -13 && nx1 < 13) camPos.x = nx1
      if (nz1 > -13 && nz1 < 12) camPos.z = nz1
    }
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    )
    camera.position.copy(camPos)
    camera.lookAt(camPos.clone().add(dir))
  }

  // ===== 拿书/放回 =====
  let heldMesh = null
  let heldBook = null
  const heldOriginal = { pos: null, quat: null, parent: null }
  let onBookChange = null
  function pickBook(e) {
    const rect = renderer.domElement.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const py = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(px, py), camera)
    const hits = raycaster.intersectObjects(bookMeshes, false)
    return hits.length ? hits[0].object : null
  }
  function onClick(e) {
    if (heldMesh) return // 已拿书时不重复拿
    const h = pickBook(e)
    if (h) takeBook(h)
  }
  function takeBook(mesh) {
    heldMesh = mesh
    heldBook = mesh.userData.book
    heldOriginal.pos = mesh.position.clone()
    heldOriginal.quat = mesh.quaternion.clone()
    heldOriginal.parent = mesh.parent
    mesh.parent = scene
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const handPos = camPos.clone().add(dir.multiplyScalar(3))
    handPos.y = 1.6
    mesh.position.copy(handPos)
    mesh.rotation.set(0, yaw + Math.PI, 0)
    mesh.scale.setScalar(1.6)
    mesh.material.emissive.setHex(0x22d3ee)
    if (onBookChange) onBookChange(heldBook, heldMesh)
  }
  function putBack() {
    if (!heldMesh) return
    heldMesh.material.emissive.setHex(0x000000)
    heldMesh.scale.setScalar(1)
    if (heldOriginal.parent) heldOriginal.parent.add(heldMesh)
    heldMesh.position.copy(heldOriginal.pos)
    heldMesh.quaternion.copy(heldOriginal.quat)
    heldMesh = null
    heldBook = null
    if (onBookChange) onBookChange(null, null)
  }

  let lastT = performance.now()
  renderer.domElement.addEventListener('click', onClick)
  // 标记某本书已读,刷新其书脊纹理(金色已读✓)
  function setRead(name) {
    bookMeshes.forEach((m) => {
      if (m.userData.book && m.userData.book.name === name) {
        const b = m.userData.book
        const tex = makeSpineTexture(b.name, m.userData.color, true)
        m.material.map = tex
        m.material.needsUpdate = true
      }
    })
  }
  return {
    on(event, fn) {
      if (event === 'bookChange') onBookChange = fn
    },
    putBack,
    setRead,
    render() {
      const now = performance.now()
      const dt = Math.min((now - lastT) / 1000, 0.05)
      lastT = now
      move(dt)
      if (heldMesh) {
        // 跟手：始终位于相机前方 3 units
        const dir = new THREE.Vector3()
        camera.getWorldDirection(dir)
        const target = camPos.clone().add(dir.multiplyScalar(3))
        target.y = 1.6
        heldMesh.position.lerp(target, 0.3)
        heldMesh.rotation.y = yaw + Math.PI
      }
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      renderer.domElement.removeEventListener('mousedown', onDown)
      renderer.domElement.removeEventListener('click', onClick)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
      renderer.dispose()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
      // 批次5-P5-4 释放场景资源：geometry/material/texture 全量 dispose
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const mm = o.material
        if (Array.isArray(mm)) mm.forEach((x) => { if (x) { if (x.map) x.map.dispose(); x.dispose() } })
        else if (mm) { if (mm.map) mm.map.dispose(); mm.dispose() }
      })
    }
  }
}
