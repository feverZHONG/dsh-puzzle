// dsh-puzzle —— Host 半 · 图片库
// 职责：puzzles/ 目录扫描（丢图即识别）+ 图片文件服务（basename 白名单）。
// 纯函数/无状态：scanImages 每次现扫，serveImageFile 现读现发；被 routes.js / tools.js 复用。
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// host/ 的上级目录 = 插件根，puzzles/ 在插件根下
const PUZZLES_DIR = fileURLToPath(new URL('../puzzles/', import.meta.url))

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

try { mkdirSync(PUZZLES_DIR, { recursive: true }) } catch { /* ignore */ }

function scanImages() {
  let names = []
  try { names = readdirSync(PUZZLES_DIR) } catch { /* ignore */ }
  return names
    .filter((n) => MIME[n.slice(n.lastIndexOf('.')).toLowerCase()])
    .map((n) => ({ name: n, url: '/dsh-puzzle/file/' + encodeURIComponent(n) }))
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

// 文件名白名单校验 + 服务：basename 回退 + 扩展名必须是图片类型，否则 404
function serveImageFile(name, res) {
  const safe = basename(name)
  if (safe !== name || !MIME[safe.slice(safe.lastIndexOf('.')).toLowerCase()]) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
    return
  }
  serveFile(join(PUZZLES_DIR, safe), res)
}

export { PUZZLES_DIR, MIME, scanImages, serveImageFile }
