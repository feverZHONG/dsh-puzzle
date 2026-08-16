// 莉娅拼图插件 —— Host 半（ESM，函数形式）
// 功能：
//   1. puzzles/ 目录扫描图片（把图丢进插件目录 puzzles/ 即识别，点「刷新图片」或重启都行）
//   2. 路由 /dsh-puzzle/* —— images 列表 / 图片文件（basename 白名单）/ state（莉娅消息+配置+游戏报告）/
//      report（Client 上报游戏状态）/ talk（发话进面板）/ config（读写配置）/ refresh（重扫图片）
//   3. 工具（模型侧，抄 dsh-character-emote 的 ctx.tools.register 原始定义写法）：
//      puzzle_talk —— 往拼图面板发话；puzzle_state —— 查当前游戏状态/配置/可用图；
//      puzzle_set_image —— 换图（puzzles 图片名 或 直链 URL）
//   4. 配置持久化 $DSH_HOME/dsh-puzzle-config.json（当前图/默认格数，跨重启恢复，端口变化不受影响）
// 注意：不声明 Config schema（无 schemastery 依赖），配置全走 apply(ctx) + $DSH_HOME JSON。
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = fileURLToPath(new URL('.', import.meta.url))
const PUZZLES_DIR = join(PLUGIN_ROOT, 'puzzles')
const DSH_HOME = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME) || join(homedir(), '.dsh')
const CONFIG_FILE = join(DSH_HOME, 'dsh-puzzle-config.json')

export const name = 'dsh-puzzle'
export const inject = ['webServer', 'tools']

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const CONFIG_DEFAULTS = { image: null, grid: 3 }

function sanitizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const image = c.image && typeof c.image === 'object'
    ? {
        source: c.image.source === 'url' ? 'url' : 'file',
        name: typeof c.image.name === 'string' ? c.image.name : null,
        url: typeof c.image.url === 'string' ? c.image.url : null,
      }
    : null
  const grid = Number.isInteger(c.grid) && c.grid >= 2 && c.grid <= 6 ? c.grid : 3
  return { image, grid }
}

function readConfig() {
  try {
    return sanitizeConfig(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')))
  } catch {
    return { ...CONFIG_DEFAULTS }
  }
}

function writeConfig(config) {
  try {
    mkdirSync(DSH_HOME, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
    return true
  } catch (e) {
    console.warn('[dsh-puzzle] config write failed: ' + ((e && e.message) || e))
    return false
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function serveFile(file, res) {
  try {
    const data = readFileSync(file)
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
    })
    res.end(data)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
}

export function apply(ctx) {
  console.log('[dsh-puzzle] plugin loaded (host half)')
  try { mkdirSync(PUZZLES_DIR, { recursive: true }) } catch { /* ignore */ }

  // ── 可变状态：可用图片 / 莉娅消息队列 / 客户端上报的游戏报告 / 配置 ──
  let images = []
  let messages = []
  let seq = 0
  let lastReport = { grid: 0, moves: 0, elapsed: 0, solved: false, running: false }
  let config = readConfig()

  function scanImages() {
    let names = []
    try { names = readdirSync(PUZZLES_DIR) } catch { /* ignore */ }
    images = names
      .filter((n) => MIME[n.slice(n.lastIndexOf('.')).toLowerCase()])
      .map((n) => ({ name: n, url: '/dsh-puzzle/file/' + encodeURIComponent(n) }))
    return images
  }

  scanImages()

  function applyReport(body) {
    const b = body && typeof body === 'object' ? body : {}
    lastReport = {
      grid: Number.isInteger(b.grid) && b.grid >= 2 && b.grid <= 6 ? b.grid : (lastReport.grid || 0),
      moves: Number.isInteger(b.moves) && b.moves >= 0 ? b.moves : 0,
      elapsed: Number.isInteger(b.elapsed) && b.elapsed >= 0 ? b.elapsed : 0,
      solved: !!b.solved,
      running: !!b.running,
    }
  }

  function pushMessage(text) {
    messages.push({ seq: ++seq, text })
    if (messages.length > 50) messages = messages.slice(-50)
    return messages.length
  }

  // ── Host 路由 ──
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
            messages: messages.map((m) => ({ seq: m.seq, text: m.text })),
            config,
            report: lastReport,
            images: scanImages(),
          })
          return
        }
        if (p === '/dsh-puzzle/report' && req.method === 'POST') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          applyReport(body)
          json(200, { ok: true })
          return
        }
        if (p === '/dsh-puzzle/talk' && req.method === 'POST') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const text = typeof body.message === 'string' ? body.message : ''
          if (!text) { json(400, { ok: false, error: 'empty message' }); return }
          json(200, { ok: true, queued: pushMessage(text) })
          return
        }
        if (p === '/dsh-puzzle/config' && req.method === 'POST') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          if (body && body.image !== undefined) config.image = sanitizeConfig({ image: body.image }).image
          if (body && body.grid !== undefined) config.grid = sanitizeConfig({ grid: body.grid }).grid
          writeConfig(config)
          json(200, { ok: true, config })
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
          const safe = basename(name)
          if (safe !== name || !MIME[safe.slice(safe.lastIndexOf('.')).toLowerCase()]) {
            res.writeHead(404, { 'content-type': 'text/plain' })
            res.end('not found')
            return
          }
          serveFile(join(PUZZLES_DIR, safe), res)
          return
        }
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
      },
    }),
    'dsh-puzzle: routes',
  )

  // ── 模型侧工具 ──
  const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

  ctx.tools.register({
    name: 'puzzle_talk',
    description: '给网页里的「莉娅拼图」游戏面板发一句话（提示、鼓励、吐槽都行），会显示在游戏面板上。',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string', description: '要发给拼图面板的话' } },
      required: ['message'],
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, queued: { type: 'integer' } },
        required: ['ok', 'queued'],
        additionalProperties: false,
      },
      render: renderJson,
    },
    async execute(args) {
      return { ok: true, queued: pushMessage(String(args.message || '')) }
    },
  })

  ctx.tools.register({
    name: 'puzzle_state',
    description: '查看「莉娅拼图」当前状态：棋盘格数、步数、用时（秒）、是否完成、是否进行中、当前图、可用图清单。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        properties: {
          grid: { type: 'integer' }, moves: { type: 'integer' }, elapsed: { type: 'integer' },
          solved: { type: 'boolean' }, running: { type: 'boolean' },
          image: { type: 'object' }, images: { type: 'array' },
        },
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute() {
      return {
        ...lastReport,
        image: config.image,
        images: scanImages().map((i) => i.name),
      }
    },
  })

  ctx.tools.register({
    name: 'puzzle_set_image',
    description: '给「莉娅拼图」换图片：puzzles 图片库里的名字（name），或直链 URL（url）。面板/设置页 1 秒内自动生效。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '插件 puzzles/ 目录里的图片文件名，如 cat.png' },
        url: { type: 'string', description: '图片直链 URL（http/https/data:）' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, source: { type: 'string' }, error: { type: 'string' } },
        required: ['ok'],
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args) {
      const list = scanImages()
      if (args && typeof args.url === 'string' && args.url) {
        config.image = { source: 'url', name: null, url: args.url }
        writeConfig(config)
        return { ok: true, source: 'url', image: config.image, images: list.map((i) => i.name) }
      }
      if (args && typeof args.name === 'string' && args.name) {
        const hit = list.find((i) => i.name === args.name)
        if (!hit) {
          return { ok: false, source: 'name', error: 'puzzles 里没有这张图: ' + args.name, images: list.map((i) => i.name) }
        }
        config.image = { source: 'file', name: hit.name, url: hit.url }
        writeConfig(config)
        return { ok: true, source: 'file', image: config.image, images: list.map((i) => i.name) }
      }
      return { ok: false, error: 'need name or url', images: list.map((i) => i.name) }
    },
  })

  console.log('[dsh-puzzle] loaded, puzzles=' + scanImages().length + ', grid=' + config.grid)
}
