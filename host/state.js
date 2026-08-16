// dsh-puzzle —— Host 半 · 可变状态
// 职责：一次 apply 一份的可变状态：莉娅消息队列（seq 自增、上限 50）、
// 客户端上报的游戏报告快照、配置（读自 $DSH_HOME JSON）。
// 用工厂 createPluginState() 而非模块级单例：多实例/重载不串状态；
// 只暴露方法读写，避免外部持有过期引用（pushMessage/applyReport 会重建数组/对象）。
import { readConfig } from './config.js'

function createPluginState() {
  let messages = []
  let seq = 0
  let lastReport = { grid: 0, moves: 0, elapsed: 0, solved: false, running: false }
  const config = readConfig()

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

  return {
    config,
    listMessages: () => messages.map((m) => ({ seq: m.seq, text: m.text })),
    getReport: () => lastReport,
    applyReport,
    pushMessage,
  }
}

export { createPluginState }
