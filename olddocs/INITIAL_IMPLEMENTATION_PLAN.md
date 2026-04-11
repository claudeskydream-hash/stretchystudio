# Stretchy Studio — Implementation Plan

**Status:** In Progress · **Last Update:** 2026-04-07 · **Current Phase:** M3 (Groups & Transforms)

This document outlines the incremental engineering plan for Stretchy Studio. Following the completion of Milestone M2, the roadmap has been revised to prioritize a timeline-based animation workflow (After Effects style) over the original abstract parameter system (Live2D style).

---

## 1. Guiding Principles

1. **Ship a thin vertical slice first.** Every milestone should leave the app usable end-to-end.
2. **Timeline-first animation.** Focus on direct keyframing of transforms and mesh vertices for intuitive motion.
3. **Renderer-first thinking.** The scene graph and renderer are the spine; UI panels are leaves.
4. **State lives in Zustand.** Use separate stores for project data (`projectStore`) and playback state (`animationStore`) to keep concerns separated.
5. **No premature abstraction.** Build specific features (Groups, Timeline) before generalizing.

---

## 2. Progress & Gap Analysis

| Concern | Status (M2 Complete) | Revised Target (M3+) | Gap |
|---|---|---|---|
| **Renderer** | WebGL2, VAO per part, basic overlays | Hierarchical transform pass (3x3 matrices) | Matrix composition logic |
| **Scene model** | Flat node list, PSD layer import | Node tree (Groups -> Parts) | Reparenting & matrix stack |
| **Animation** | None (Static) | Timeline, Keyframes, Interpolation | `animationStore` & Tweening |
| **Mesh Editing** | Vertex dragging & manual add/remove | Vertex keyframing (Warp) | Snapshotting mesh state |
| **Export** | None | Spritesheet (Zip/Atlas) | Frame capture loop |
| **Physics** | None | Chain-based spring physics | Verlet integrator |

---

## 3. Target Architecture

### 3.1 Directory Layout (Updated)

```
src/
  app/layout/             # 4-zone layout (canvas, layers, inspector, timeline)
  store/                  # Zustand stores
    projectStore.js       # Scene tree (Nodes, Groups, Parts)
    editorStore.js        # Selection, tool mode, viewport
    animationStore.js     # [NEW] CurrentTime, isPlaying, poseOverrides
    historyStore.js       # Undo/redo (immer patches)
  renderer/               # WebGL2
    scenePass.js          # Transform pass (depth-first walk) + Draw pass
    partRenderer.js       # VAO per part, vertex/UV/index management
  mesh/                   # Pure algorithms (Contour, Sample, Delaunay)
    worker.js             # Off-main-thread mesh gen
  components/             # React UI (shadcn-based)
    canvas/               # Viewport + Gizmos
    layers/               # Tree-view layout panel
    inspector/            # Property editing
    timeline/             # [NEW] TrackRows, Keyframes, Playhead
  io/                     # Import/Export
    psd.js                # ag-psd wrapper
    export.js             # [NEW] Spritesheet/Zip builder
```

### 3.2 Data Flow (Playback)

```
animationStore (currentTime) ──> Interpolation Engine
                                       │
                                       ▼
                             poseOverrides (Map: nodeId -> interpolatedProps)
                                       │
                                       ▼
ScenePass (Renderer) <── reads ── [projectStore + poseOverrides]
      │
      └─> 1. Compute World Matrices (Depth-first)
      └─> 2. Upload Mesh Vertices (for Warp keyframes)
      └─> 3. Draw Calls
```

---

## 4. Completed Milestones

### ✅ M1 — Canvas Foundation
- WebGL2 renderer skeleton.
- PNG import & triangulation.
- Basic vertex dragging & undo/redo.

### ✅ M2 — Auto Mesh & PSD Import
- `ag-psd` integration for multi-layer import.
- Mesh generation sliders (Density, Padding, etc.).
- Viewport navigation (Zoom/Pan).
- Manual vertex add/remove tools.
- Layer panel with visibility/order controls.

---

## 5. Upcoming Milestones (Revised Roadmap)

### M3 — Groups & Hierarchical Transforms (Current)
**Goal:** Layers can be parented into groups with inherited transforms.
- **Group node type**: Nodes with children and local transform (X, Y, Rot, Scale, Pivot).
- **Transform pass**: Depth-first walk of node tree, composing `parent.world * node.local`.
- **Gizmos**: Move and Rotation handles on the canvas for active selection.
- **Layer Panel**: Indented hierarchy view with drag-to-reparent.

### M4 — Timeline & Keyframe Animation
**Goal:** AE-lite timeline for posing and animating.
- **Animation Store**: Track `currentTime`, `fps`, and `duration`.
- **Property Tracks**: Keyframable values for X, Y, Rotation, Scale, Opacity, and Vertex Positions.
- **Interpolation**: Linear/Easing between keyframes.
- **Pose Overrides**: Renderer applies interpolated values without mutating the base project state.
- **Vertex Keyframing**: Snapshot entire mesh state for complex warping animations.

### M5 — Spritesheet Export
**Goal:** Render animations to standard game engine formats.
- **Frame Renderer**: Offscreen capture of animation frames.
- **Export Formats**: ZIP of PNGs and packed Spritesheet (Image + JSON).

### M6 — Physics
**Goal:** Secondary motion (hair, cloth) via spring physics.
- **Verlet Integrator**: Runtime simulation on group chains.
- **Baking**: Option to write physics results back to keyframes.

### M7 — Video/GIF Export
- GIF and WebM output support using browser APIs.

---

## 6. What's Dropped (from Initial Plan)

- **Parameter System**: Replaced by direct timeline keyframing (Simpler UX).
- **Armed Recording**: No longer needed; keyframes are created at specific times.
- **5x5 Warp Grid**: Use direct vertex keyframing (More flexible).
- **Path Deformers**: Deferred to post-v1.

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Timeline Performance** | High | Interpolate only active tracks; use SharedArrayBuffer for large vertex snapshots if needed. |
| **Transform Complexity** | Med | Strict tree validation to prevent cycles; use gl-matrix for robust 3x3 operations. |
| **Memory Bloat** | Low | Prune unused keyframes; compress vertex snapshots (delta encoding). |

---

**Last Updated:** 2026-04-07
