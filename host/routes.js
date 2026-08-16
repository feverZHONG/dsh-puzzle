// dsh-puzzle —— Host 半 · 路由
// 职责：/dsh-puzzle/* 全部 HTTP 端点：
//   GET  /dsh-puzzle(/)?      根端点（ok + 图片数）
//   GET  /dsh-puzzle/images    图片清单
//   GET  /dsh-puzzle/state    莉娅消息 + 配置 + 游戏报告 + 图片清单（client 1s 轮询）
//   POST /dsh-puzzle/report   客户端上报游戏状态
//   POST /dsh-puzzle/talk     发话进面板（模型工具 puzzle_talk 同走此队列）
//   POST /dsh-puzzle/config   读写配置（image / grid）
//   POST /dsh-puzzle/refresh  重扫图片
//   GET  /dsh-puzzle/file/<名> 图片文件（basename 白名单）
// 状态全部来自 state（createPluginState 产物），本模块只负责 HTTP 面。
import { scanImages, serveImageFile } from './images.js'
import { sanitizeConfig, writeConfig } from './config.js'

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function registerRoutes(ctx, state) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-puzzle',
      handler: async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const p = url.pathname
        const json = (code, obj) => {
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(obj))
        }

        if (p === '/dsh-puzzle' || p === '/dsh-puzzle/') {
          json(200, { ok: true, name: 'dsh-puzzle', images: scanImages().length })
          return
        }
        if (p === '/dsh-puzzle/images') {
          json(200, { ok: true, images: scanImages() })
          return
        }
        if (p === '/dsh-puzzle/state') {
          json(200, {
            ok: true,
            messages: state.listMessages(),
            config: state.config,
            report: state.getReport(),
            images: scanImages(),
          })
          return
        }
        if (p === '/dsh-puzzle/report' && req.method === 'POST') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          state.applyReport(body)
          json(200, { ok: true })
          return
        }
        if (p === '/dsh-puzzle/talk' && req.method === 'POST') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const text = typeof body.message === 'string' ? body.message : ''
          if (!text) { json(400, { ok: false, error: 'empty message' }); return }
          json(200, { ok: true, queued: state.pushMessage(text) })
          return
        }
        if (p === '/dsh-puzzle/config' && req.method === 'POST') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          if (body && body.image !== undefined) state.config.image = sanitizeConfig({ image: body.image }).image
          if (body && body.grid !== undefined) state.config.grid = sanitizeConfig({ grid: body.grid }).grid
          writeConfig(state.config)
          json(200, { ok: true, config: state.config })
          return
        }
        if (p === '/dsh-puzzle/refresh' && req.method === 'POST') {
          json(200, { ok: true, images: scanImages() })
          return
        }
        if (p.startsWith('/dsh-puzzle/file/')) {
          const raw = p.slice('/dsh-puzzle/file/'.length)
          let name
          try { name = decodeURIComponent(raw) } catch { name = raw }
          serveImageFile(name, res)
          return
        }
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
      },
    }),
    'dsh-puzzle: routes',
  )
}

export { registerRoutes }
