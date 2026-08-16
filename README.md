# dsh-puzzle-plugin

莉娅拼图插件：滑块拼图小游戏，随时可玩，莉娅能发话 / 换图 / 看进度。

## 玩法

- 侧栏底部「🧩 拼图」打开浮窗面板（可拖拽标题移动）
- 滑块拼图：点空格相邻的块滑动，2×2 ~ 6×6 可切，新局 / 预览 / 步数 / 用时
- 拼完弹庆祝，点「再来一局」继续

## 换图三路

1. **丢图进 `puzzles/`**：把 png / jpg / webp / gif 放进插件目录 `puzzles/`，点设置页「🔃 刷新图片」即识别
2. **面板/设置页粘贴图片 URL**（http / https / data:）
3. **让莉娅换**：对话里说一声，她会用 `puzzle_set_image`（puzzles 图片名 或 直链 URL）

## 莉娅侧工具（模型可用）

| 工具 | 作用 |
|:-----|:-----|
| `puzzle_talk` | 往拼图面板发一句话（提示/鼓励/吐槽），显示在面板气泡里 |
| `puzzle_state` | 查当前局：格数/步数/用时/完成状态/当前图/可用图 |
| `puzzle_set_image` | 换图（`name` = puzzles 里的文件名，或 `url` 直链） |

## 架构

- Host 半（`index.js`）：路由 `/dsh-puzzle/*`（images / file / state / report / talk / config / refresh）+ 三个模型工具；配置持久化到 `$DSH_HOME/dsh-puzzle-config.json`（跨重启恢复）
- Client 半（`client.js`）：`sidebar.footer.action` 开关 + `shell.overlay` 浮窗面板 + `settings.section` 图库管理；1s 轮询拉消息/配置/图片清单；图片 cover 裁剪切片
- 零第三方依赖（host 只用 node 内置模块），无 Config schema，安装即用

## 安装

```powershell
dsh plugin --profile web add <本目录>
# 重启 WebUI 生效
```

开发流程 / 踩坑见 `skills/dsh-plugin-dev/`。
