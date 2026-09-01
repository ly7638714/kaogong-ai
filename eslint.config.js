// ESLint flat config（ESLint 10 + eslint-plugin-vue 10）
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default [
  {
    // 忽略构建产物与依赖
    ignores: ['dist/**', 'dist-verify/**', 'node_modules/**', 'public/**']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // 浏览器环境
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        CustomEvent: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        ResizeObserver: 'readonly',
        // Node/现代运行时全局（含测试环境）
        ReadableStream: 'readonly',
        TextEncoder: 'readonly',
        process: 'readonly',
        // Node/浏览器通用全局（脚本/测试/WebDAV WebSocket 同步等）
        WebSocket: 'readonly',
        Buffer: 'readonly',
        DOMException: 'readonly'
      }
    },
    rules: {
      // 允许刻意留空的 catch 块（如忽略错误的 catch(e){}）
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 提示词/材料里大量中文全角空格（如题干（　）留白）在模板/字符串中是有意排版，跳过
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true }],
      // 放行误报规则的业务写法：emoji 正则字符类 / try-catch 赋值
      'no-misleading-character-class': 'off',
      'no-useless-assignment': 'off',
      // 捕获错误变量统一放行未使用（如 catch(e){} / catch(e){ return x }）
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^(_|e)$' }],
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      // 模板中的表达式不强制加括号
      'vue/no-v-html': 'off'
    }
  }
]
