# 声屿独立播放器：GitHub 发布与安装

此目录是完整的 SillyTavern 第三方扩展根目录，仓库根目录必须直接包含 `manifest.json`、`index.js`、`style.css`。

## 发布到 GitHub

1. 在 GitHub 创建空仓库，例如 `SoundIsle`，不要另外初始化 README。
2. 在本目录打开终端：

```bash
git init
git add .
git commit -m "feat: initial Sound Isle standalone v1.0.0"
git branch -M main
git remote add origin https://github.com/你的用户名/SoundIsle.git
git push -u origin main
```

若克隆了本次提供的 `.bundle`，其中已有首次提交，可跳过 git init/add/commit，添加远端后 push 即可。

## 在 SillyTavern / 支持 Git 安装的 TT 中安装

依次打开 扩展 → 安装扩展 → 输入 `https://github.com/你的用户名/SoundIsle` → 安装 → 刷新 → 启用。

以后更新仓库并推送，朋友可在酒馆扩展管理里更新扩展（视宿主支持情况）。

**注意**：单独安装，不要与摩羯座完整版同时启用。首次使用请备份原有曲库设置。本项目仍需真实 TT/iOSTT 实机测试。
