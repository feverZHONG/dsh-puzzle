// dsh-puzzle —— 莉娅拼图插件 · Host 半入口（ESM）
// 职责：声明插件身份 + 组装：一次 apply 一份状态（state.js）→ 注册路由（routes.js）+ 工具（tools.js）。
// 各功能模块见 host/：config.js（配置持久化）/ images.js（图片库）/ state.js（可变状态）/
// routes.js（/dsh-puzzle/* 路由）/ tools.js（puzzle_talk / puzzle_state / puzzle_set_image）。
// 注意：不声明 Config schema（无 schemastery 依赖），配置全走 apply(ctx) + $DSH_HOME JSON。
import { createPluginState } from './host/state.js'
import { registerRoutes } from './host/routes.js'
import { registerTools } from './host/tools.js'
import { scanImages } from './host/images.js'

export const name = 'dsh-puzzle'
export const inject = ['webServer', 'tools']

export function apply(ctx) {
  console.log('[dsh-puzzle] plugin loaded (host half)')
  const state = createPluginState()
  registerRoutes(ctx, state)
  registerTools(ctx, state)
  console.log('[dsh-puzzle] loaded, puzzles=' + scanImages().length + ', grid=' + state.config.grid)
}
