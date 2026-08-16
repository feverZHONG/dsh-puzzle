# puzzles/ —— 本地拼图图库（不入 git/GitHub 仓库）

本目录是**本地图库**：把 png / jpg / jpeg / webp / gif 放进来，在 WebUI
设置 → 插件 → 莉娅拼图 →「🔃 刷新图片」（或重启 WebUI）即进入图库。

- **默认图是代码内置的占位图**（SVG data URL，无本地图片文件）；`puzzles/` 下的图仅供本地游玩，
  **不会进入 git/GitHub 仓库**（`.gitignore` 已排除图片扩展名）
- **不丢图也行**：面板里直接粘贴图片 URL（http / https / data:），或让助手用 `puzzle_set_image` 换图
