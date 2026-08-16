# dsh-puzzle-plugin

DeepSeek Harness（DSH）WebUI 的滑块拼图小游戏插件：随时点开就玩，AI 助手能实时发话、换图、看进度。

## 功能特性

- 输入框工具行左端「🧩 拼图」小开关打开浮窗面板（标题可拖拽移动）
- 滑块拼图（华容道式）：点空格相邻的块滑动，2×2 ~ 6×6 可切换
- 新局 / 预览 / 步数 / 用时；拼完弹庆祝（随机台词），「再来一局」继续
- 面板常驻助手碎碎念（开局/完成随机台词池），助手也能用 `puzzle_talk` 实时发话
- **换图三路**：
  1. 丢图进 `puzzles/`：png / jpg / webp / gif 放进去，设置页「🔃 刷新图片」即识别
  2. 面板 / 设置页直接粘贴图片 URL（http / https / data:）
  3. 对话里让助手换：`puzzle_set_image`（图库名 或 直链 URL）

## AI 侧工具（模型可用）

| 工具 | 作用 |
|:-----|:-----|
| `puzzle_talk` | 往拼图面板发一句话（提示/鼓励/吐槽），显示在面板气泡里 |
| `puzzle_state` | 查当前局：格数/步数/用时/完成状态/当前图/可用图 |
| `puzzle_set_image` | 换图（`name` = puzzles 里的文件名，或 `url` 直链） |

## 安装

```powershell
# 从源码目录安装
dsh plugin --profile web add <插件目录>

# 或从打包好的 tgz 安装（可移植，不依赖源目录存活）
dsh plugin --profile web add dsh-puzzle-plugin-0.2.0.tgz
```

安装后重启 WebUI 生效。`dsh` 请替换为你安装的 DSH CLI 调用方式。

## 打包

```powershell
pnpm pack --pack-destination <你的插件分发目录>
```

产物 `dsh-puzzle-plugin-<版本>.tgz` 为 npm 标准 tarball。

## 配置

- 持久化到 `$DSH_HOME/dsh-puzzle-config.json`（当前图 / 默认格数），跨重启恢复
- 无 Config schema、无 settings namespace 依赖，安装即用

## 架构

- **Host 半**（`index.js` 入口 + `host/`）：`index.js` 只做组装（一次 apply 一份状态 → 注册路由/工具）；
  `host/config.js` 配置持久化、`host/images.js` 图库扫描与文件服务、`host/state.js` 可变状态（工厂模式）、
  `host/routes.js` 路由 `/dsh-puzzle/*`（images / file / state / report / talk / config / refresh）、
  `host/tools.js` 三个 AI 工具
- **Client 半**（`client.js` 产物 + `client/src/` 源码 + `client/build.mjs` 打包）：
  `conversation.input.left` 入口开关 + `shell.overlay` 浮窗面板 + `settings.section` 图库管理；
  1s 轮询拉消息/配置/图片清单；图片 cover 裁剪切片
- **零第三方依赖**（host 只用 node 内置模块，client 打包也是 node 内置 fs），无 Config schema，安装即用

## 开发

DSH client bundle 是单文件直出（无构建步骤、require 无相对路径），所以 client 源码按功能拆到
`client/src/`（data 静态内容 / core 核心逻辑 / panel 浮窗面板 / ui 小组件 / entry 入口），
改源码后必须重跑打包生成产物：

```powershell
node client/build.mjs
```

刷新页面即生效（client 半热重建）；host 半（`host/`、`index.js`）改动需重启 WebUI。

## License

MIT
