// dsh-puzzle —— Host 半 · 配置持久化
// 职责：$DSH_HOME/dsh-puzzle-config.json 的读写 + 字段消毒（当前图/默认格数，跨重启恢复）。
// 纯函数，无可变状态；被 state.js / routes.js / tools.js 复用。
import { homedir } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DSH_HOME = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME) || join(homedir(), '.dsh')
const CONFIG_FILE = join(DSH_HOME, 'dsh-puzzle-config.json')

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

export { DSH_HOME, CONFIG_FILE, CONFIG_DEFAULTS, sanitizeConfig, readConfig, writeConfig }
