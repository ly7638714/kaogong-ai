// 运行环境兼容垫片：旧版 Android WebView（Chromium 110）缺少 Promise.withResolvers，
// PDF.js 4.x 在加载阶段会直接调用它，缺失时表现为“选中真题后无法打开”。
export function installCompatPolyfills() {
  if (typeof Promise.withResolvers !== 'function') {
    Object.defineProperty(Promise, 'withResolvers', {
      configurable: true,
      writable: true,
      value: function withResolvers() {
        let resolve
        let reject
        const promise = new Promise((res, rej) => {
          resolve = res
          reject = rej
        })
        return { promise, resolve, reject }
      }
    })
  }
}

