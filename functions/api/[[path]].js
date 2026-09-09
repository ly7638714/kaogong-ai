// Cloudflare Pages 中转：把 /api/* 转发到 OpenAI 兼容中转站，并补上浏览器跨域响应头。
const UPSTREAM = 'https://www.cun.ai/v1/'

function corsHeaders(origin) {
  const allowOrigin = origin ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders('*') })
}

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const rest = url.pathname.replace(/^\/api\/?\//, '')
  const target = UPSTREAM + (rest ? rest : '') + url.search
  const headers = new Headers(request.headers)
  headers.delete('host')
  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body
  const origin = request.headers.get('Origin') || '*'
  const upstream = await fetch(target, init)
  const out = new Headers(upstream.headers)
  out.set('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin)
  out.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  out.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  })
}
