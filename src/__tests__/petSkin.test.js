import { describe, it, expect, beforeEach, vi } from 'vitest'
import { store } from '../store'
import { PET_SKINS, petAllSkins, petSkin, applyPetSkin, pet, petImg, petImgOf, setPetImg, clearPetImg, petSkinVoiceOf, petBindCloneVoice, petUnbindCloneVoice, petBoundVoices, petGlobalVoice, savePetGlobalVoice, petCustomData, petIsLocked, petAddCustomSkin, petRemoveCustomSkin } from '../utils/pet'

describe('动漫角色皮肤系统 PET_SKINS（精简版）', () => {
  it('四个内置锁定角色 + 自定义：薛神/章若楠/李星云/姬如雪 + 自定义', () => {
    const ids = PET_SKINS.map((s) => s.id)
    expect(ids).toEqual(['xueshen', 'zhangruonan', 'lixingyun', 'jiruxue', 'custom'])
  })

  it('每个皮肤都有形象/声线/人设', () => {
    PET_SKINS.forEach((s) => {
      expect(s.id).toBeTruthy()
      expect(s.char).toBeTruthy()
      expect(s.persona).toBeTruthy()
      expect(s.voice && s.voice.voice).toBeTruthy()
      expect(s.hair).toBeTruthy()
    })
  })

  it('薛神/李星云/姬如雪自带大模型克隆原声（内置）且锁定，章若楠内置锁定', () => {
    const lx = PET_SKINS.find((s) => s.id === 'lixingyun')
    const xs = PET_SKINS.find((s) => s.id === 'xueshen')
    const jr = PET_SKINS.find((s) => s.id === 'jiruxue')
    const zr = PET_SKINS.find((s) => s.id === 'zhangruonan')
    expect(lx.voice.clonedVoice).toBe(true)
    expect(lx.voice.voice).toBe('a6d7ba90-7cd6-5ef6-9f37-d259112f8be1')
    expect(lx.locked).toBe(true)
    expect(xs.voice.clonedVoice).toBe(true)
    expect(xs.voice.voice).toBe('9e3957f5-74b0-5efa-b1fa-6894fdb7e45f')
    expect(xs.locked).toBe(true)
    expect(jr.voice.clonedVoice).toBe(true)
    expect(jr.voice.voice).toBe('18a24e59-6e8c-57bd-aeb8-6584c7a7ada2')
    expect(jr.locked).toBe(true)
    expect(zr.locked).toBe(true)
    expect(zr.custom).toBeFalsy()
    expect(PET_SKINS.find((s) => s.id === 'custom').custom).toBe(true)
  })
})

describe('内置角色锁定：形象/声线不可改', () => {
  beforeEach(() => {
    store.cfg.petSkin = 'lixingyun'
    store.cfg.skinImgs = {}
    store.cfg.skinVoices = {}
  })
  it('四个内置 locked，自定义不锁定', () => {
    expect(petIsLocked('xueshen')).toBe(true)
    expect(petIsLocked('zhangruonan')).toBe(true)
    expect(petIsLocked('lixingyun')).toBe(true)
    expect(petIsLocked('jiruxue')).toBe(true)
    expect(petIsLocked('custom')).toBe(false)
  })
  it('锁定角色禁止上传形象', () => {
    const r = setPetImg('data:image/jpeg;base64,x')
    expect(r).toBe(false)
    expect(store.cfg.skinImgs.lixingyun).toBeUndefined()
  })
  it('锁定角色禁止清除形象', () => {
    expect(clearPetImg()).toBe(false)
  })
  it('锁定角色禁止绑定/解绑克隆声线', () => {
    expect(petBindCloneVoice('lixingyun', { engine: 'glm', voice: 'v1', name: 'x' })).toBe(null)
    expect(store.cfg.skinVoices.lixingyun).toBeUndefined()
    expect(petUnbindCloneVoice('lixingyun')).toBe(null)
  })
  it('锁定角色仍可用内置克隆原声（切到它即用）', () => {
    applyPetSkin('lixingyun')
    expect(store.cfg.ttsGm.voice).toBe('a6d7ba90-7cd6-5ef6-9f37-d259112f8be1')
  })
})

describe('多个自定义角色（自定义2/3/4…）', () => {
  beforeEach(() => {
    store.cfg.petSkin = 'lixingyun'
    store.cfg.customSkins = []
    store.cfg.skinImgs = {}
    store.cfg.skinVoices = {}
    store.cfg.petCustom = { name: '自定义人物', persona: '你是一位由用户自定义的角色。' }
    store.cfg.globalVoice = { engine: 'glm', voice: 'tongtong', model: '' }
    store.cfg.ttsGm = { key: 'k', url: 'x', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.ttsMode = 'glm'
    pet.value.name = '李星云'
  })

  it('初始 petAllSkins 有 5 个内置（4锁定+1自定义）', () => {
    expect(petAllSkins.value.map((s) => s.id)).toEqual(['xueshen', 'zhangruonan', 'lixingyun', 'jiruxue', 'custom'])
  })

  it('新增自定义 → 自定义2，可切换、名字/人设可读写', () => {
    const e = petAddCustomSkin()
    expect(e.id).toBe('custom2')
    expect(e.name).toBe('自定义2')
    expect(petAllSkins.value.length).toBe(6)
    applyPetSkin('custom2')
    expect(store.cfg.petSkin).toBe('custom2')
    expect(pet.value.name).toBe('自定义2')
    expect(petCustomData('custom2').name).toBe('自定义2')
    petCustomData('custom2').name = '小苏'
    petCustomData('custom2').persona = '你是温柔学姐小苏。'
    expect(petCustomData('custom2').name).toBe('小苏')
  })

  it('连续新增得到 自定义2、自定义3', () => {
    petAddCustomSkin()
    const e3 = petAddCustomSkin()
    expect(e3.id).toBe('custom3')
    expect(petAllSkins.value.length).toBe(7)
  })

  it('删除自定义角色（含其形象/声线数据），内置不可删', () => {
    petAddCustomSkin()
    store.cfg.skinImgs.custom2 = 'img2'
    store.cfg.skinVoices.custom2 = { engine: 'glm', voice: 'v2', name: 'x' }
    expect(petRemoveCustomSkin('custom2')).toBe(true)
    expect(petAllSkins.value.some((s) => s.id === 'custom2')).toBe(false)
    expect(store.cfg.skinImgs.custom2).toBeUndefined()
    expect(store.cfg.skinVoices.custom2).toBeUndefined()
    expect(petRemoveCustomSkin('custom')).toBe(false)
    expect(petRemoveCustomSkin('lixingyun')).toBe(false)
  })

  it('删除当前选中的自定义后回退到首位内置（薛神）', () => {
    const e = petAddCustomSkin()
    applyPetSkin(e.id)
    expect(store.cfg.petSkin).toBe('custom2')
    petRemoveCustomSkin(e.id)
    expect(store.cfg.petSkin).toBe('xueshen')
  })

  it('自定义角色可上传形象、可绑定克隆声线（不受锁）', () => {
    petAddCustomSkin()
    store.cfg.petSkin = 'custom2'
    expect(setPetImg('img2')).toBe(true)
    expect(store.cfg.skinImgs.custom2).toBe('img2')
    expect(petBindCloneVoice('custom2', { engine: 'glm', voice: 'vc', name: 'x' })).toBeTruthy()
    expect(store.cfg.skinVoices.custom2.voice).toBe('vc')
  })
})

describe('applyPetSkin 一键切换', () => {
  beforeEach(() => {
    store.cfg.petSkin = 'lixingyun'
    store.cfg.customSkins = []
    store.cfg.globalVoice = { engine: 'glm', voice: 'tongtong', model: '' }
    store.cfg.ttsGm = { key: 'k', url: 'x', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.ttsMode = 'glm'
    pet.value.name = '李星云'
  })

  it('切到薛神：名字/皮肤/克隆原声更新', () => {
    applyPetSkin('xueshen')
    expect(store.cfg.petSkin).toBe('xueshen')
    expect(pet.value.name).toBe('薛神')
    expect(petSkin.value.id).toBe('xueshen')
    expect(petSkinVoiceOf('xueshen').cloned).toBe(true)
    expect(store.cfg.ttsGm.voice).toBe('9e3957f5-74b0-5efa-b1fa-6894fdb7e45f')
  })

  it('切到李星云：直接用内置克隆原声（无需再上传）', () => {
    applyPetSkin('lixingyun')
    expect(store.cfg.petSkin).toBe('lixingyun')
    expect(pet.value.name).toBe('李星云')
    expect(petSkinVoiceOf('lixingyun').cloned).toBe(true)
    expect(store.cfg.ttsGm.voice).toBe('a6d7ba90-7cd6-5ef6-9f37-d259112f8be1')
  })

  it('切到姬如雪：直接用内置克隆原声（无需再上传）', () => {
    applyPetSkin('jiruxue')
    expect(store.cfg.petSkin).toBe('jiruxue')
    expect(pet.value.name).toBe('姬如雪')
    expect(petSkinVoiceOf('jiruxue').cloned).toBe(true)
    expect(store.cfg.ttsGm.voice).toBe('18a24e59-6e8c-57bd-aeb8-6584c7a7ada2')
  })

  it('切到章若楠：内置锁定 + 用克隆原声', () => {
    applyPetSkin('zhangruonan')
    expect(store.cfg.petSkin).toBe('zhangruonan')
    expect(pet.value.name).toBe('章若楠')
    expect(petSkinVoiceOf('zhangruonan').cloned).toBe(true)
    expect(store.cfg.ttsGm.voice).toBe('83eac18d-fd6a-531b-9a71-67b0e6d340ee')
  })



  it('切到自定义：名字/皮肤更新，声音保持全局', () => {
    applyPetSkin('custom')
    expect(store.cfg.petSkin).toBe('custom')
    expect(pet.value.name).toBe('自定义人物')
    expect(store.cfg.ttsGm.voice).toBe('tongtong')
  })

  it('未知 id 回退首位内置（薛神）', () => {
    applyPetSkin('nope')
    expect(store.cfg.petSkin).toBe('xueshen')
    expect(petSkin.value.id).toBe('xueshen')
  })
})

describe('自定义形象（用户上传图片）', () => {
  beforeEach(() => {
    store.cfg.skinImgs = {}
    store.cfg.petImg = ''
    store.cfg.petSkin = 'custom'
  })
  it('上传后 petImg 返回该皮肤的自定义形象', () => {
    expect(petImg.value).toBe('')
    expect(setPetImg('data:image/jpeg;base64,xxx')).toBe(true)
    expect(petImg.value).toBe('data:image/jpeg;base64,xxx')
    expect(store.cfg.skinImgs.custom).toBe('data:image/jpeg;base64,xxx')
  })
  it('清除后恢复默认', () => {
    setPetImg('data:image/jpeg;base64,yyy')
    expect(clearPetImg()).toBe(true)
    expect(petImg.value).toBe('')
  })
  it('不同皮肤各自独立形象', () => {
    store.cfg.petSkin = 'custom'
    setPetImg('img-c')
    store.cfg.petSkin = 'xueshen'
    expect(petImg.value).toMatch(/^data:image\/jpeg;base64,/) // 薛神内置形象
    expect(petImgOf('custom')).toBe('img-c')
  })
})

describe('cloneCosyVoice 音色克隆', () => {
  beforeEach(() => {
    store.cfg.ttsOpenAI = { key: 'k', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' }
  })
  it('成功后返回 模型:音色名 的 voice', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, opt) => {
      expect(url).toContain('/uploads/audio/voice')
      expect(opt.headers.Authorization).toBe('Bearer k')
      return { ok: true, json: async () => ({ id: 'x' }) }
    }))
    const { cloneCosyVoice } = await import('../utils/ttsEngine')
    const r = await cloneCosyVoice({ name: 'ref.mp3' }, { name: '李星云声线' })
    expect(r.ok).toBe(true)
    expect(r.voice).toBe('FunAudioLLM/CosyVoice2-0.5B:李星云声线')
    vi.unstubAllGlobals()
  })
  it('无 Key 时给出提示', async () => {
    store.cfg.ttsOpenAI.key = ''
    const { cloneCosyVoice } = await import('../utils/ttsEngine')
    const r = await cloneCosyVoice({ name: 'a.mp3' }, {})
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('Key')
  })
})

describe('petImgOf 各皮肤形象', () => {
  beforeEach(() => {
    store.cfg.skinImgs = {}
    store.cfg.petImg = ''
  })
  it('李星云返回内置形象（PNG）', () => {
    expect(petImgOf('lixingyun')).toMatch(/^data:image\/png;base64,/)
  })
  it('薛神返回内置形象', () => {
    expect(petImgOf('xueshen')).toMatch(/^data:image\/jpeg;base64,/)
  })
  it('自定义未上传时为空', () => {
    expect(petImgOf('custom')).toBe('')
  })
  it('全局 petImg 作为兜底', () => {
    store.cfg.petImg = 'global-img'
    expect(petImgOf('custom')).toBe('global-img')
  })
})

describe('每角色克隆声线绑定（仅自定义角色可绑）', () => {
  beforeEach(() => {
    store.cfg.petSkin = 'lixingyun'
    store.cfg.customSkins = []
    store.cfg.skinVoices = {}
    store.cfg.petCustom = { name: '自定义人物', persona: '你是一位由用户自定义的角色。' }
    store.cfg.globalVoice = { engine: 'glm', voice: 'tongtong', model: '' }
    store.cfg.ttsGm = { key: 'k', url: 'x', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.ttsOpenAI = { key: 'k2', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' }
    store.cfg.ttsMode = 'glm'
    pet.value.name = '李星云'
  })

  it('自定义角色绑定克隆声线后 applyPetSkin 启用克隆原声（智谱）', () => {
    petBindCloneVoice('custom', { engine: 'glm', voice: 'voice_clone_123', name: '自定义原声' })
    expect(petSkinVoiceOf('custom')).toMatchObject({ engine: 'glm', voice: 'voice_clone_123', cloned: true })
    applyPetSkin('custom')
    expect(store.cfg.ttsGm.voice).toBe('voice_clone_123')
    expect(store.cfg.ttsMode).toBe('glm')
  })

  it('绑定 CosyVoice2 克隆声线切换后启用 openai 引擎与 模型:音色', () => {
    petBindCloneVoice('custom', { engine: 'openai', voice: 'FunAudioLLM/CosyVoice2-0.5B:自定义声线', model: 'FunAudioLLM/CosyVoice2-0.5B', name: '自定义原声' })
    applyPetSkin('custom')
    expect(store.cfg.ttsMode).toBe('openai')
    expect(store.cfg.ttsOpenAI.voice).toBe('FunAudioLLM/CosyVoice2-0.5B:自定义声线')
    expect(store.cfg.ttsOpenAI.model).toBe('FunAudioLLM/CosyVoice2-0.5B')
  })

  it('解绑后回落到内置兜底音色', () => {
    petBindCloneVoice('custom', { engine: 'glm', voice: 'voice_clone_123', name: 'x' })
    petUnbindCloneVoice('custom')
    expect(petSkinVoiceOf('custom').cloned).toBe(false)
    expect(petSkinVoiceOf('custom').voice).toBe('tongtong')
  })

  it('petBoundVoices 只列出已绑定声线', () => {
    petBindCloneVoice('custom', { engine: 'glm', voice: 'v1', name: '自定义' })
    petAddCustomSkin()
    petBindCloneVoice('custom2', { engine: 'glm', voice: 'v2', name: '自定义2' })
    const list = petBoundVoices()
    expect(list.length).toBe(2)
    expect(list.map((x) => x.char)).toEqual(expect.arrayContaining(['自定义', '自定义2']))
  })
})

describe('cloneZhipuVoice 智谱 GLM-TTS-Clone 音色克隆', () => {
  beforeEach(() => {
    store.cfg.ttsGm = { key: 'gm-key', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' }
  })
  it('上传+克隆成功返回音色 ID', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, opt) => {
      calls.push(url)
      if (String(url).endsWith('/files')) {
        expect(opt.headers.Authorization).toBe('Bearer gm-key')
        return { ok: true, json: async () => ({ id: 'file_abc' }) }
      }
      expect(String(url)).toContain('/voice/clone')
      const b = JSON.parse(opt.body)
      expect(b.file_id).toBe('file_abc')
      expect(b.model).toBe('glm-tts-clone')
      // voice_name 必须唯一（智谱拒绝重名），显示名=输入名+唯一后缀
      expect(b.voice_name).toMatch(/^李星云原声_/)
      expect(b.input).toBeTruthy()
      expect(String(b.input).length).toBeGreaterThan(0)
      expect(b.text).toBe('李星云原声文本')
      return { ok: true, json: async () => ({ id: 'voice_clone_999' }) }
    }))
    const { cloneZhipuVoice } = await import('../utils/ttsEngine')
    const r = await cloneZhipuVoice({ name: 'ref.mp3' }, { name: '李星云原声', text: '李星云原声文本' })
    expect(r.ok).toBe(true)
    expect(r.voice).toBe('voice_clone_999')
    expect(calls.length).toBe(2)
    vi.unstubAllGlobals()
  })
  it('无智谱 Key 时给出提示', async () => {
    store.cfg.ttsGm.key = ''
    store.cfg.fig = { key: '', url: '' }
    const { cloneZhipuVoice } = await import('../utils/ttsEngine')
    const r = await cloneZhipuVoice({ name: 'a.mp3' }, {})
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('智谱')
  })
  it('克隆接口失败返回错误信息', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/files')) return { ok: true, json: async () => ({ id: 'file_abc' }) }
      return { ok: false, status: 401, json: async () => ({ error: 'Invalid ApiKey' }) }
    }))
    const { cloneZhipuVoice } = await import('../utils/ttsEngine')
    const r = await cloneZhipuVoice({ name: 'a.mp3' }, {})
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('Invalid ApiKey')
    vi.unstubAllGlobals()
  })
})

describe('全局音色 = 萌宠音色（一致原则）', () => {
  beforeEach(() => {
    store.cfg.petSkin = 'lixingyun'
    store.cfg.customSkins = []
    store.cfg.skinVoices = {}
    store.cfg.globalVoice = null
    store.cfg.ttsGm = { key: 'k', url: 'x', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.ttsOpenAI = { key: 'k2', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' }
    store.cfg.ttsMode = 'glm'
    pet.value.name = '李星云'
  })

  it('savePetGlobalVoice 快照当前语音设置', () => {
    store.cfg.ttsMode = 'glm'
    store.cfg.ttsGm.voice = 'doushen_teacher_1'
    const g = savePetGlobalVoice()
    expect(g).toEqual({ engine: 'glm', voice: 'doushen_teacher_1', model: '' })
    expect(store.cfg.globalVoice.voice).toBe('doushen_teacher_1')
    expect(petGlobalVoice().voice).toBe('doushen_teacher_1')
  })

  it('openai 引擎快照含模型名', () => {
    store.cfg.ttsMode = 'openai'
    store.cfg.ttsOpenAI.voice = 'FunAudioLLM/CosyVoice2-0.5B:自定义'
    store.cfg.ttsOpenAI.model = 'FunAudioLLM/CosyVoice2-0.5B'
    const g = savePetGlobalVoice()
    expect(g.engine).toBe('openai')
    expect(g.voice).toBe('FunAudioLLM/CosyVoice2-0.5B:自定义')
    expect(g.model).toBe('FunAudioLLM/CosyVoice2-0.5B')
  })

  it('用户改了全局音色后，切非克隆角色不会覆盖它', () => {
    store.cfg.ttsGm.voice = 'doushen_teacher_1'
    savePetGlobalVoice()
    applyPetSkin('custom')
    expect(store.cfg.ttsGm.voice).toBe('doushen_teacher_1')
  })

  it('自定义克隆角色切走即恢复全局音色', () => {
    store.cfg.ttsGm.voice = 'doushen_teacher_1'
    savePetGlobalVoice()
    petAddCustomSkin()
    petBindCloneVoice('custom2', { engine: 'glm', voice: 'voice_clone_c2', name: 'x' })
    applyPetSkin('custom2')
    expect(store.cfg.ttsGm.voice).toBe('voice_clone_c2')
    applyPetSkin('custom')
    expect(store.cfg.ttsGm.voice).toBe('doushen_teacher_1')
  })

  it('薛神自带克隆声线，切走恢复全局', () => {
    store.cfg.ttsGm.voice = 'doushen_teacher_1'
    savePetGlobalVoice()
    applyPetSkin('xueshen')
    expect(store.cfg.ttsGm.voice).toBe('9e3957f5-74b0-5efa-b1fa-6894fdb7e45f')
    applyPetSkin('custom')
    expect(store.cfg.ttsGm.voice).toBe('doushen_teacher_1')
  })

  it('无全局音色快照时，切非克隆角色不动声音', () => {
    store.cfg.globalVoice = null
    store.cfg.ttsGm.voice = 'some_voice'
    applyPetSkin('custom')
    expect(store.cfg.ttsGm.voice).toBe('some_voice')
  })
})

describe('薛神 · 判断推理名师（内置锁定）', () => {
  beforeEach(() => {
    store.cfg.petSkin = 'lixingyun'
    store.cfg.skinVoices = {}
    store.cfg.globalVoice = { engine: 'glm', voice: 'tongtong', model: '' }
    store.cfg.ttsGm = { key: 'k', url: 'x', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.ttsMode = 'glm'
    pet.value.name = '李星云'
  })

  it('PET_SKINS 包含薛神，自带克隆声线 + 锁定 + 眼镜', () => {
    const x = PET_SKINS.find((s) => s.id === 'xueshen')
    expect(x).toBeTruthy()
    expect(x.char).toBe('薛神')
    expect(x.voice.clonedVoice).toBe(true)
    expect(x.voice.voice).toBe('9e3957f5-74b0-5efa-b1fa-6894fdb7e45f')
    expect(x.accessory).toBe('glasses')
    expect(x.locked).toBe(true)
  })

  it('切到薛神即用自带克隆原声', () => {
    applyPetSkin('xueshen')
    expect(store.cfg.petSkin).toBe('xueshen')
    expect(pet.value.name).toBe('薛神')
    expect(petSkinVoiceOf('xueshen').cloned).toBe(true)
    expect(store.cfg.ttsGm.voice).toBe('9e3957f5-74b0-5efa-b1fa-6894fdb7e45f')
  })

  it('从薛神切回未克隆角色恢复全局音色', () => {
    applyPetSkin('xueshen')
    expect(store.cfg.ttsGm.voice).toBe('9e3957f5-74b0-5efa-b1fa-6894fdb7e45f')
    applyPetSkin('custom')
    expect(store.cfg.ttsGm.voice).toBe('tongtong')
  })
})

describe('薛神内置默认形象（图片）', () => {
  beforeEach(() => {
    store.cfg.skinImgs = {}
    store.cfg.petImg = ''
    store.cfg.petSkin = 'lixingyun'
  })
  it('未上传时返回皮肤自带形象', () => {
    const x = PET_SKINS.find((s) => s.id === 'xueshen')
    expect(x.img).toMatch(/^data:image\/jpeg;base64,/)
    expect(petImgOf('xueshen')).toBe(x.img)
  })
  it('锁定角色不可上传覆盖内置形象', () => {
    store.cfg.petSkin = 'xueshen'
    expect(setPetImg('user-img')).toBe(false)
    expect(petImgOf('xueshen')).toMatch(/^data:image\/jpeg;base64,/)
  })
  it('其他无内置形象皮肤不受影响', () => {
    expect(petImgOf('custom')).toBe('')
  })
})

describe('cloneZhipuVoice 自动转写参考音频（修复克隆音色复读英文开头）', () => {
  beforeEach(() => {
    store.cfg.ttsGm = { key: 'gm-key', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' }
  })
  it('未传 text 时自动调用 glm-asr 转写并传给克隆接口', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, opt) => {
      calls.push(String(url))
      if (String(url).endsWith('/files')) return { ok: true, json: async () => ({ id: 'file_abc' }) }
      if (String(url).includes('/audio/transcriptions')) {
        return { ok: true, json: async () => ({ segments: [{ text: '人人都道生逢乱世身不由己。' }] }) }
      }
      if (String(url).includes('/voice/clone')) {
        const b = JSON.parse(opt.body)
        expect(b.text).toBe('人人都道生逢乱世身不由己。')
        return { ok: true, json: async () => ({ voice: 'voice_clean_001' }) }
      }
      return { ok: false }
    }))
    const { cloneZhipuVoice } = await import('../utils/ttsEngine')
    const r = await cloneZhipuVoice({ name: 'ref.mp3', type: 'audio/mp3', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, { name: '测试声线' })
    expect(r.ok).toBe(true)
    expect(r.voice).toBe('voice_clean_001')
    expect(calls.some((u) => u.includes('/audio/transcriptions'))).toBe(true)
    vi.unstubAllGlobals()
  })
  it('显式传入 text 时不再调 ASR', async () => {
    let asrCalled = false
    vi.stubGlobal('fetch', vi.fn(async (url, opt) => {
      if (String(url).includes('/audio/transcriptions')) { asrCalled = true; return { ok: true, json: async () => ({ segments: [] }) } }
      if (String(url).endsWith('/files')) return { ok: true, json: async () => ({ id: 'file_abc' }) }
      if (String(url).includes('/voice/clone')) { expect(JSON.parse(opt.body).text).toBe('显式文本'); return { ok: true, json: async () => ({ voice: 'v2' }) } }
      return { ok: false }
    }))
    const { cloneZhipuVoice } = await import('../utils/ttsEngine')
    const r = await cloneZhipuVoice({ name: 'a.mp3', arrayBuffer: async () => new Uint8Array([1]).buffer }, { name: 'x', text: '显式文本' })
    expect(r.ok).toBe(true)
    expect(asrCalled).toBe(false)
    vi.unstubAllGlobals()
  })
})
