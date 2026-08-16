// dsh-puzzle —— Host 半 · 模型侧工具
// 职责：注册三个 ctx.tools 工具（抄 dsh-character-emote 原始定义写法）：
//   puzzle_talk        往拼图面板发话（走 state 消息队列）
//   puzzle_state       查当前游戏状态/配置/可用图
//   puzzle_set_image   换图（puzzles 图片名 或 直链 URL）
// 只依赖 state（createPluginState 产物）+ images.scanImages + config.writeConfig。
import { scanImages } from './images.js'
import { writeConfig } from './config.js'

const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

function registerTools(ctx, state) {
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
      return { ok: true, queued: state.pushMessage(String(args.message || '')) }
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
        ...state.getReport(),
        image: state.config.image,
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
        state.config.image = { source: 'url', name: null, url: args.url }
        writeConfig(state.config)
        return { ok: true, source: 'url', image: state.config.image, images: list.map((i) => i.name) }
      }
      if (args && typeof args.name === 'string' && args.name) {
        const hit = list.find((i) => i.name === args.name)
        if (!hit) {
          return { ok: false, source: 'name', error: 'puzzles 里没有这张图: ' + args.name, images: list.map((i) => i.name) }
        }
        state.config.image = { source: 'file', name: hit.name, url: hit.url }
        writeConfig(state.config)
        return { ok: true, source: 'file', image: state.config.image, images: list.map((i) => i.name) }
      }
      return { ok: false, error: 'need name or url', images: list.map((i) => i.name) }
    },
  })
}

export { registerTools }
