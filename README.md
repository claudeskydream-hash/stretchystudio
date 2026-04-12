# 🧬 Stretchy Studio

**Bring your 2D illustrations to life with fluid, mesh-based animation.**

Stretchy Studio is a high-performance 2D animation tool designed for illustrators and animators. It streamlines the workflow from static artwork (PSD/PNG) to fully realized, mesh-deformable animations and spritesheets.

Unlike traditional bone-based systems, Stretchy Studio focuses on a **timeline-first, direct-deformation workflow**—giving you professional flexibility with a much lower learning curve.

[🚀 Launch the Editor](https://editor.stretchy.studio) | [💬 Join the Discord](https://discord.com/invite/zB6TrHTwAb) | [🌐 Visit the Website](https://stretchy.studio)

---

## ✨ Key Highlights

### 📂 Intelligent PSD Import
Stop wasting time organizing layers. Drag your PSD files directly into the editor. Stretchy Studio automatically recognizes over 23 character parts (like eyes, eyebrows, and limbs) and sets up your hierarchy for you instantly.

### 📐 Magic Auto-Rigging
Rigging doesn't have to be a chore. Use **AI-powered pose detection** to automatically generate a skeleton for your character, or use our instant "heuristic" method to get moving in seconds.

### 🎬 Organic "Stretchy" Motion
Don't just rotate layers—warp them! Animate individual mesh vertices to create organic, fluid motion. Perfect for breathing effects, flowing hair, and expressive facial animations.

### 🔦 Pro-Grade Features, Simply Made
- **2D Iris Trackpad**: Move eyes naturally with a dedicated, intuitive control pad.
- **Automatic Eye Clipping**: Irises stay perfectly contained within the eyes—no complex masking required.
- **Realistic Limb Bending**: Built-in vertex skinning for arms and legs so they bend exactly how they should.

---

## 🚀 Quick Start

1. **Open the App**: Head to [editor.stretchy.studio](https://editor.stretchy.studio).
2. **Drop your Art**: Drag a PSD or PNG file into the workspace.
3. **Auto-Rig**: Follow the 3-step wizard to setup your character skeleton.
4. **Animate**: Switch to **Animation mode** and start creating keyframes!

---

## 🎨 Workflow Examples

### Static Character
1. **Import**: Drag a PSD into the editor viewport.
2. **Organize**: Use the Groups tab to parent layers and adjust pivot points.
3. **Mesh**: Click "Generate Mesh" on any part to enable organic warping.
4. **Animate**: Switch to **Animation** mode, create a clip, and start keyframing!

### Rigged Character
1. **Import & Rig**: Drag a see-through character PSD to trigger the 3-step Rigging Wizard.
2. **Setup**: Choose AI-powered rigging (*DWPose*) or manual estimation, then adjust joints on canvas.
3. **Animate**: Keyframe bone rotations and vertex deformations for advanced movement.
4. **Playback**: Smoothly blend between keyframes with real-time vertex skinning.

---

## 🛠 For Developers

## 🏗 Project Structure

```bash
src/
├── app/layout/          # 4-zone UI layout (Canvas, Layers, Inspector, Timeline)
├── components/
│   ├── canvas/          # WebGL Viewport, Gizmos, and Picking logic
│   ├── layers/          # Hierarchical draw order and grouping management
│   ├── inspector/       # Node properties and mesh generation controls
│   └── timeline/        # Playhead, Keyframe tracks, and Animation CRUD
├── renderer/
│   ├── transforms.js    # Matrix math & world matrix composition
│   ├── scenePass.js     # Hierarchical draw-order rendering
│   └── partRenderer.js  # GPU buffer management (VAO/EBO)
├── store/
│   ├── projectStore.js  # Scene tree and persistent node state
│   ├── animationStore.js # Playback state, interpolation, and pose overrides
│   └── editorStore.js   # UI state, selection, and viewport settings
├── mesh/                # Auto-triangulation and mesh editing algorithms
└── io/                  # PSD parsing and export utilities
```

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (Recommended)

### Setup
```bash
# Install dependencies
pnpm install

# Run the development server
pnpm dev
```
Open `http://localhost:5173` to view the app locally.

---

## 💬 Community & Support

Join our [Discord](https://discord.com/invite/zB6TrHTwAb) to share your animations, get help, or suggest new features!
