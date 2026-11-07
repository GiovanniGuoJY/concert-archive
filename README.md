# 音乐会研习与曲目赏析文库 (Concert Repertoire Archive)

基于纯静态前端与 JSON 数据驱动的古典音乐会研习与现场曲目解析归档平台。

## 特性

- 🎼 **数据与界面完全解耦**：所有音乐会研习数据存储在 `data/concerts/` 独立 JSON 文件中，按需异步加载。
- ⚡ **30 秒极速速查模式**：支持一键切换速查模式，提取音乐厅听觉核心锚点。
- 🎧 **现场录音回顾播放器**：支持按乐章绑定现场录音，点击乐章即可在页面底部常驻播放器中流式收听。
- 🌓 **双重美学主题**：羊皮纸暖白（Parchment）与曜石沉黑（Obsidian）双主题自适应切换。
- 🚀 **自动化流水线**：由 AI 代理一键生成音乐学解析 JSON 并自动提交推送到 GitHub Pages。

## 目录结构

```text
.
├── index.html                  # 页面结构
├── js/
│   └── app.js                  # 数据渲染与交互逻辑
├── data/
│   ├── concerts-index.json     # 全局音乐会目录索引
│   └── concerts/               # 单场音乐会研习 JSON 详情
│       └── 2027-01-09-sz-marathon.json
├── audio/                      # 现场录音文件存储目录
└── README.md
```
