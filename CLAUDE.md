# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Stretchy Studio 是一款基于浏览器的高性能 2D 网格变形动画工具。它把静态分层插画（PSD/PNG）转化为可绑骨、可网格变形的动画，专为对接 AI 图层分解模型（**See-Through**）的工作流优化。核心理念是「时间轴优先 + 直接变形」，而非传统骨骼系统。

技术栈：React + Vite + Zustand（状态）+ Immer（不可变更新）+ WebGL2（自定义渲染管线）+ gl-matrix。

## 常用命令

```bash
pnpm install       # 安装依赖（推荐 pnpm；仓库同时有 package-lock.json 和 pnpm-lock.yaml）
pnpm dev           # 启动 Vite 开发服务器，访问 http://localhost:5173
pnpm build         # 生产构建
pnpm preview       # 预览生产构建
pnpm lint          # ESLint 检查整个项目
```

本项目**没有自动化测试框架**。`scripts/` 目录下是一次性的验证/调试脚本（Node `.mjs` 或 Python `.py`），用于人工核对导出格式（如 `inspect_cmo3.mjs`、`verify_physics.mjs`、`verify_body_analyzer.py`），需要时用 `node scripts/xxx.mjs` 或 `python scripts/xxx.py` 单独运行。

路径别名：`@` 映射到 `src/`（见 `vite.config.js` 和 `jsconfig.json`）。`onnxruntime-web` 被排除在 Vite 依赖预打包之外（DWPose ONNX 姿态检测用）。

## 架构核心

### 三层状态分离（关键！）

三个独立的 Zustand store 严格分工，改动前务必分清数据归属：

- **`store/projectStore.js`** — 持久化的 `.stretch` 项目模型，**唯一可撤销**的状态。包含 `canvas`、`textures`、扁平的 `nodes` 数组、`parameters`、`physicsRules`、`animations`。节点分 `part`（可绘制，有 `draw_order`/`mesh`/`blendShapes`）和 `group`（不绘制，仅参与变换层级）两类，schema 注释就在文件顶部。文件顶部还维护 `versionControl`（`geometryVersion`/`transformVersion` 等版本号），用于在 React 之外触发渲染。
- **`store/animationStore.js`** — 运行时播放状态，**与项目模型解耦**。动画数据本身存在 `project.animations` 里；这里只放播放头、`isPlaying`、`restPose`（进入动画模式时的姿态快照）、`draftPose`（未提交的暂存编辑，按 K 键提交为关键帧）等。这种分离保证动画工作流是非破坏性的。
- **`store/editorStore.js`** — 纯 UI 状态（选择、`toolMode`、视图缩放/平移、`overlays` 叠加层开关、`meshDefaults`、`editorMode`（`staging` vs `animation`）、骨架编辑状态）。不进撤销历史。

撤销/重做由 `store/undoHistory.js` + `store/historyStore.js` 实现（快照式），全局快捷键在 `hooks/useUndoRedo.js` 挂载。注意 `projectStore` 的 `deepClone` 会特殊处理 TypedArray（网格顶点是 `Float32Array` 等）。

### 渲染管线（`src/renderer/`）

自定义 WebGL2 管线，不依赖 React 渲染循环：

- `transforms.js` — mat3 矩阵运算、世界矩阵合成（`computeWorldMatrices` 深度优先遍历层级）、`computeEffectiveProps`。
- `scenePass.js` — 编排整个渲染 pass：算世界矩阵 → 按 `draw_order` 排序 → 构建相机 MVP（图像像素坐标 → NDC，含 Y 翻转）→ 逐 part 发起绘制。虹膜/眼白的 stencil 遮罩裁剪逻辑（按名字后缀 `-l`/`-r` 匹配左右）也在这里。
- `partRenderer.js` — GPU 缓冲管理（VAO/EBO）。
- `animationEngine.js` — 关键帧插值工具。动画数据模型为 `{ tracks: [{ nodeId, property, keyframes: [{time, value, easing}] }] }`，支持的 property 见文件头注释（`x`/`y`/`rotation`/`scaleX`/`scaleY`/`opacity`/`visible`/`mesh_verts`/`blendShape:{id}`）。
- `shaders/` — GLSL 着色器源码字符串（`mesh.js`、`background.js`）。

### 网格生成（`src/mesh/`）

按需在 **Web Worker** 中生成低多边形网格，避免阻塞主线程：`worker.js` 是入口，接收 `{imageData, opts}`，调用 `generate.js`（内部用 `contour.js` 轮廓追踪 + `delaunay.js` Delaunator 三角化 + `sample.js` 采样）。注意 Worker 无法传输 Set，`edgeIndices` 以普通数组回传。

### 导入/导出（`src/io/`）

- **导入**：`psd.js`（ag-psd 解析）→ `psdOrganizer.js`（`matchTag` 识别 23+ 角色部位标签，组织成 Head/Body/Extras 层级）→ `armatureOrganizer.js`（自动绑骨，最大的 io 文件，含骨架检测）。`splitLR.js` 处理左右分离。
- **导出**：
  - `exportSpine.js` — Spine 4.0 JSON（含 Y-up 坐标转换、图片打包）。
  - `exportAnimation.js` — PNG/WEBP/JPG 帧序列。
  - `io/live2d/` — Live2D Cubism 导出子系统（**正在开发中**，见下）。
- **持久化**：`projectFile.js`（`.stretch` 文件序列化）、`projectDb.js`（IndexedDB）。

### Live2D 导出子系统（`src/io/live2d/`）

活跃开发中、复杂度最高的模块。入口 `index.js` / `exporter.js`，生成 Cubism 全套文件：`model3.json`（清单）、`moc3`（二进制模型，`moc3writer.js`）、`cdi3.json`、`motion3.json`（动画曲线）、纹理图集（`textureAtlas.js`/`caffPacker.js`）。还有 `cmo3` 工程文件写出、`bodyAnalyzer.js` 身体分析、warp deformer 相关逻辑。**大量设计文档和逆向工程笔记在 `docs/live2d-export/`**（`MOC3_FORMAT.md`、`CMO3_FORMAT.md`、`WARP_DEFORMERS.md`、以及 `SESSION_NN_FINDINGS.md` 系列会话记录），改动此模块前应先读相关文档。

### UI 布局

单页应用：`App.jsx` → `app/layout/EditorLayout.jsx`（四区布局：画布 / 图层 / 检查器 / 时间轴）。`components/` 下按功能分区（`canvas/`、`layers/`、`inspector/`、`timeline/`、`armature/`、`parameters/`、`physics/`、`export/` 等）。`components/ui/` 是 shadcn/Radix UI 组件（配置见 `components.json`）。

## 文档位置

- `docs/` — 当前设计与实现文档（各特性的 `*_implementation.md`、`PROJECT_STATUS.md`、`JUMPSTART.md`）。
- `docs/live2d-export/` — Live2D 导出的深度技术文档与会话笔记。
- `olddocs/` — 早期归档文档（`rigger_*`、旧路线图），历史参考。
- 根目录还有若干专项笔记：`WARP_EXPORT_AUDIT.md`、`WARP_IMPLEMENTATION_COMPLETE.md`、`StretchyStudio_Spine_Export_Fix.md`。

## 约定与注意事项

- **See-Through 工作流是一等公民**：绑骨/图层组织逻辑假设输入是 See-Through 分解出的动漫风格 PSD（语义化部位图层，带左右后缀命名）。
- **群组不绘制**：只有 `part` 有 `draw_order`；渲染顺序完全由 part 的 `draw_order` 决定，`group` 仅参与变换继承。
- **网格数据是 TypedArray**：`vertices`/`uvs`/`triangles`/`edgeIndices` 用 `Float32Array`/`Uint16Array` 等，克隆和序列化时需特殊处理。
- **暂存模式 vs 动画模式**（`editorStore.editorMode`）：`staging` 是绑骨/网格/形状键编辑；`animation` 是时间轴关键帧。两种模式下选择、Gizmo、骨架叠加层的行为不同。
- 项目使用 JS + JSDoc（非 TypeScript），关键 store 和 io 文件的顶部注释就是最权威的 schema 说明。
