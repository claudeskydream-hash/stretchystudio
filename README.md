# 🧬 Stretchy Studio

**最快的方式为 "See-Through" SOTA 角色模型进行绑骨和动画制作。**

Stretchy Studio 是一款高性能的 2D 动画工具，旨在将静态图层转化为富有表现力的网格变形动画。我们专门为连接 AI 驱动的图层分解（如 **See-Through** SOTA 模型）与专业级动画而打造。

与传统的骨骼系统不同，Stretchy Studio 将 **AI 驱动的自动绑骨** 与 **以时间轴为先的直接变形工作流** 相结合。让你在几秒钟内从平面 PSD 变成一个完全绑定的角色。

[🚀 启动编辑器](https://editor.stretchy.studio) | [💬 加入 Discord](https://discord.com/invite/zB6TrHTwAb) | [🌐 访问官网](https://stretchy.studio)

---

## ✨ 核心亮点

### 📂 原生 "See-Through" 支持
专为通过 **See-Through** 等 SOTA 图层分解模型生成的角色进行了优化。导入你的分层 PSD，Stretchy Studio 会自动处理复杂的遮挡、深度分层和网格生成。

---

## 🧩 See-Through 工作流

Stretchy Studio 被设计为 [**See-Through**](https://github.com/shitagaki-lab/see-through) 模型的动画引擎。传统 2D 动画需要手动分层和修补，而 See-Through 可以使用单张静态插图自动完成这个过程。

### 什么是 See-Through？
See-Through 是一个 SOTA 框架，它可以将单张动漫插图转换为可操作的角色模型，方法是将图像分解为完全修补的、语义上独立的身体部位图层。

- **官方仓库**：[shitagaki-lab/see-through](https://github.com/shitagaki-lab/see-through)
- **学术论文**：["See-through: Single-image Layer Decomposition for Anime Characters"](https://arxiv.org/abs/2602.03749)

### 如何获取分解后的 PSD
**快速开始（推荐）**：使用 [**免费 Hugging Face 演示**](https://huggingface.co/spaces/24yearsold/see-through-demo) 快速在你的角色上运行模型。

> See-Through 专门针对**动漫和 VTuber 风格**的插图进行了训练。写实或非动漫风格可能无法正确分解。

### 📐 智能自动绑骨
绑骨不再是苦差事。使用 **AI 驱动的姿态检测**（DWPose）自动为你的角色生成骨骼，或使用我们的即时"启发式"方法在几秒钟内开始动画制作。

### 🎬 有机 "弹性" 运动
不仅仅是旋转图层——还能扭曲它们！动画化单个网格顶点来创建有机的、流畅的运动。非常适合呼吸效果、飘逸的头发以及那些微妙的 "Live2D 风格" 微表情。

### 🎯 骨骼扭曲
在任何图层上放置控制钉并拖动它们来直观地变形网格。未移动的钉子作为锚点来保持其他区域不动。非常适合眉毛抬起、嘴型和微妙的角色运动，无需触碰单个顶点。骨骼钉完全支持关键帧，并与混合形状无缝协作。

### 🔦 你可能喜欢的其他功能
- **自动眼部裁剪**：虹膜完美地保持在眼睛内部——无需复杂的遮罩。
- **真实的肢体弯曲**：内置手臂和腿部的顶点蒙皮，使弯曲效果完全符合预期。
- **Blender 风格的形状键**：一次创建复杂的变形（如微笑或眨眼），并通过影响滑块以任何方式混合它们。将骨骼钉的运动记录到形状键中，实现基于混合的高级变形。
- **同步音频轨道**：直接在时间轴中叠加背景音乐和音效。修剪、定位和同步音频片段与你的动画，获得完整的多媒体体验。
- **Spine 4.0 导出**：将你的骨骼和动画直接导出为 Spine JSON 格式，用于游戏引擎和专业制作流程。

---

## 🚀 快速开始

1. **打开应用**：访问 [editor.stretchy.studio](https://editor.stretchy.studio)。
2. **拖入素材**：将 `.stretch` 项目文件、PSD 或 PNG 文件拖入工作区。
3. **自动绑骨**：按照简化的设置向导映射图层并建立角色骨骼。
4. **制作动画**：切换到**动画模式**，开始创建关键帧！

---

## 🎨 工作流示例

### 静态角色
1. **导入**：将 PSD 拖入编辑器视口。
2. **组织**：使用"组"选项卡为图层建立父子关系并调整轴心点。
3. **网格**：在任何部位点击"生成网格"以启用有机扭曲。
4. **制作动画**：切换到**动画**模式，创建片段，开始制作关键帧！

### SOTA 工作流（如 See-Through）
1. **导入**：将分解后的 "See-Through" PSD 拖入编辑器。
2. **自动绑骨**：启动绑骨向导。Stretchy Studio 使用 AI 立即将你的图层映射到骨骼结构。
3. **调整**：调整关节位置和网格密度以处理遮挡区域（如脖子后面的头发）。
4. **制作动画**：创建流畅的、多层次的动画，充分利用 "See-Through" 深度数据。

---

## 🛠 开发者指南

## 🏗 项目结构

```bash
src/
├── app/layout/          # 4 区域 UI 布局（画布、图层、检查器、时间轴）
├── components/
│   ├── canvas/          # WebGL 视口、Gizmo 和拾取逻辑
│   ├── layers/          # 层次化绘制顺序和分组管理
│   ├── inspector/       # 节点属性和网格生成控制
│   └── timeline/        # 播放头、关键帧轨道和动画 CRUD
├── renderer/
│   ├── transforms.js    # 矩阵运算和世界矩阵合成
│   ├── scenePass.js     # 层次化绘制顺序渲染
│   └── partRenderer.js  # GPU 缓冲管理（VAO/EBO）
├── store/
│   ├── projectStore.js  # 场景树和持久化节点状态
│   ├── animationStore.js # 播放状态、插值和姿态覆盖
│   └── editorStore.js   # UI 状态、选择和视口设置
├── mesh/                # 自动三角化和网格编辑算法
└── io/                  # PSD 解析和导出工具
```

### 环境要求
- [Node.js](https://nodejs.org/)（v18+）
- [pnpm](https://pnpm.io/)（推荐）

### 安装
```bash
# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev
```
打开 `http://localhost:5173` 在本地查看应用。

---

## 💬 社区与支持

加入我们的 [Discord](https://discord.com/invite/zB6TrHTwAb) 分享你的动画作品、获取帮助或提出新功能建议！

---

## 📜 许可证

本项目基于 MIT 许可证发布——详见 [LICENSE](LICENSE) 文件。
