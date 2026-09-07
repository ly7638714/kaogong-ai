// platform.test.js —— 宿主桥 platform.js 的纯环境降级单测（node 环境：无 plus/navigator/document）
// 目的：确保所有能力在非原生环境安全降级、绝不抛异常，且导出结构稳定。
import { describe, it, expect } from 'vitest'
import {
  isPlusHost, isAndroidUA, isIOSUA, hostKind, platformInfo,
  downloadsAbsRoot, toAbsolute, writeTextFile, writeBlobFile,
  setClipboard, getClipboard, shareText,
  onHardwareBack, emitHardwareBack, exitApp, installPlusBackBehavior, uninstallPlusBackBehavior,
  vibrate, nativeToast, openExternal, statusbarHeight, runtimeVersion, exposePlatform
} from '../utils/platform'

describe('platform.js · 宿主识别（node 无宿主）', () => {
  it('识别为非 plus 宿主 / browser', () => {
    expect(isPlusHost()).toBe(false)
    expect(hostKind()).toBe('browser')
    const info = platformInfo()
    expect(info.isApp).toBe(false)
    expect(info.kind).toBe('browser')
  })
  it('UA 探测安全返回 false', () => {
    expect(isAndroidUA()).toBe(false)
    expect(isIOSUA()).toBe(false)
  })
})

describe('platform.js · 文件能力降级', () => {
  it('downloadsAbsRoot 返回空串', () => {
    expect(downloadsAbsRoot()).toBe('')
  })
  it('toAbsolute 原样返回相对路径', () => {
    expect(toAbsolute('_downloads/x.txt')).toBe('_downloads/x.txt')
    expect(toAbsolute('')).toBe('')
  })
  it('writeTextFile 在非原生环境 reject', async () => {
    await expect(writeTextFile('a/b.txt', 'hi')).rejects.toThrow('非原生宿主')
  })
  it('writeBlobFile 在非原生环境 reject', async () => {
    await expect(writeBlobFile('a.png', new Blob(['x']))).rejects.toThrow('非原生宿主')
  })
})

describe('platform.js · 系统能力降级', () => {
  it('剪贴板写/读失败返回 false / null', async () => {
    expect(await setClipboard('测试')).toBe(false)
    expect(await getClipboard()).toBeNull()
  })
  it('分享、震动、toast、外链全部降级', async () => {
    expect(await shareText('hello')).toBe(false)
    expect(vibrate(10)).toBe(false)
    expect(nativeToast('hi')).toBe(false)
    expect(openExternal('https://example.com')).toBe(false)
  })
  it('状态栏高度 0、运行时版本空串', () => {
    expect(statusbarHeight()).toBe(0)
    expect(runtimeVersion()).toBe('')
  })
})

describe('platform.js · 返回键注册表（可独立使用）', () => {
  it('onHardwareBack 注册/注销并消费', () => {
    let consumed = false
    const off = onHardwareBack(() => { consumed = true; return true })
    expect(emitHardwareBack()).toBe(true)
    expect(consumed).toBe(true)
    off()
    consumed = false
    expect(emitHardwareBack()).toBe(false)
    expect(consumed).toBe(false)
  })
  it('安装/卸载在非原生环境是 no-op', () => {
    expect(() => installPlusBackBehavior({})).not.toThrow()
    expect(() => uninstallPlusBackBehavior()).not.toThrow()
    expect(exitApp()).toBe(false)
  })
})

describe('platform.js · 导出面稳定', () => {
  it('exposePlatform 不抛异常', () => {
    expect(() => exposePlatform()).not.toThrow()
  })
})
