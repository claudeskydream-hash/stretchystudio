# Stretchy Studio — Revised Roadmap (M3 onwards)

## Context

The original M3–M9 plan was modelled after Live2D Cubism's architecture: abstract parameters, armed recording mode, deformer trees driven by parameter interpolation. This is powerful but has a steep learning curve — it targets VTuber/Live2D power users.

The revised goal is **much simpler**: import PSD layers → group them → hop on an After Effects-style timeline → keyframe transforms and mesh warps → export a spritesheet. Target user is a 2D animator or illustrator who already knows what keyframes are, not someone who needs to learn what a "parameter" is.

Key changes from original plan:
- **Drop** the parameter system entirely (M5 original) — no abstract sliders, no armed recording, no keyed states
- **Drop** warp deformer's 5×5 control-point grid — use direct vertex-position keyframes instead (already have vertex dragging)
- **Drop** path deformer, 2D parameter grids (M9), `.stretch` format
- **Replace** complex export pipeline with simple spritesheet-first export
- **Keep** groups + transforms, mesh warping, physics, spritesheet/GIF/video export

---

## Revised Milestones

### M3 — Groups & Hierarchical Transforms

**Goal:** Layers can be parented into groups. Groups have a pivot + transform (translate/rotate/scale). Moving/rotating a group moves all children.

**What to build:**
1. **Group node type** in projectStore: `{ id, type: 'group', name, parent, transform: { x, y, rotation, scaleX, scaleY, pivotX, pivotY }, visible, opacity }`
   - **No `draw_order`** — groups are never drawn. Render order is determined solely by `part` nodes' `draw_order` values, which are untouched by grouping/ungrouping.
2. **Part node gets transform** too: same `transform` object (default identity), for per-layer translate/rotate/scale independent of mesh warp.
3. **Transform pass** in ScenePass: depth-first walk of node tree, compose `parent.world × node.local` into a transient `node._worldMatrix` (3×3 affine, not persisted). Render pass sorts all `type === 'part'` nodes by `draw_order` as before, but passes `part._worldMatrix` instead of the shared MVP.
4. **Layer panel — two tabs:**
   - **Depth tab** (default): flat list of `part` nodes sorted by `draw_order` descending, same as current. If a part has a parent group, a clickable group-name chip/badge is shown inline. Clicking the chip selects the group node (without switching tabs). Right-click context menu per row:
     - *Move into group →* (submenu of existing groups + "New group…")
     - *Remove from group* (if currently parented)
   - **Groups tab**: tree view of all nodes. Drag-and-drop to reparent layers in/out of groups — only mutates `node.parent`, never `draw_order`. Group rows are collapsible. A "New group" button in the toolbar creates an empty group. Selecting a node in either tab syncs selection state; if the selected node is inside a collapsed group in the Groups tab, the group auto-expands to reveal it.
5. **Canvas manipulation**: select a group/part → show transform gizmo (move handle at pivot, rotation arc handle). Drag to update `node.transform` live.
6. **Inspector**: shows transform fields (x, y, rotation °, scale %, pivotX, pivotY) for selected node. Editable number inputs + drag-to-change.

**Files to modify:**
- `src/store/projectStore.js` — add `transform` to part node schema; add group node schema (no draw_order)
- `src/renderer/scenePass.js` — add pre-pass for depth-first world matrix composition; pass per-part `_worldMatrix` to draw calls
- `src/renderer/partRenderer.js` — accept per-part world matrix instead of shared MVP
- `src/components/canvas/CanvasViewport.jsx` — gizmo overlay (move handle, rotation handle)
- `src/components/layers/LayerPanel.jsx` — two-tab layout (Depth / Groups), group badge chip, context menu, drag-to-reparent in Groups tab
- `src/components/inspector/Inspector.jsx` — transform panel

**Exit criteria:** Create a group, put layers in it, rotate the group → all children rotate around pivot. Depth tab still shows layers in their original draw_order; no reordering occurs. Clicking a group chip in Depth selects the group. Drag a layer into/out of a group in Groups tab → draw_order unchanged, transform inheritance updates immediately.

---

### M4 — Timeline & Keyframe Animation

**Goal:** AE-lite timeline. Each node has tracks per animatable property. Set keyframes by posing, scrub to preview, loop playback.

**What to build:**
1. **Animation data model** in project:
   ```
   project.animations = [{
     id, name, duration (ms), fps,
     tracks: [{
       nodeId,
       property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'mesh_verts',
       keyframes: [{ time (ms), value, easing: 'linear' | 'ease' }]
     }]
   }]
   project.activeAnimationId
   ```
2. **Timeline panel** (bottom): replaces the placeholder. Shows:
   - Left column: layer names (same order as Layers panel, collapsed per node)
   - Right: horizontal track with keyframe diamonds (◆) at their time positions
   - Scrubber/playhead: drag to seek
   - Transport: Play ▶ / Pause ⏸ / Stop ⏹, loop toggle, FPS display
3. **Keyframe workflow**:
   - Press **K** (or click "Add Keyframe" button) while scrubber is at a time position → snapshots current `node.transform` (and `mesh.vertices` for parts) into a keyframe on all selected nodes' changed properties
   - Alternatively: auto-keyframe mode (toggle) — any transform drag while timeline is active auto-records a keyframe
4. **Playback engine**: rAF loop reads `currentTime`, interpolates between bracketing keyframes (linear first, then ease-in-out). Applies interpolated values to a **pose overlay** — does NOT mutate projectStore; instead, renderer reads from a separate `poseStore` during playback.
5. **Mesh warp keyframes**: `mesh_verts` property stores a flat `Float32Array` snapshot of all vertex positions. Interpolated per-vertex during playback. This is how tail-wag / leg-bend works: pose 1 = rest, pose 2 = bent → timeline lerps vertex positions.
6. **Multiple animations**: dropdown to switch clips (idle, blink, wave, etc.).

**Files to create:**
- `src/store/animationStore.js` — currentTime, isPlaying, activeAnimationId, poseOverrides
- `src/components/timeline/Timeline.jsx` — full timeline panel
- `src/components/timeline/TrackRow.jsx` — per-node track with keyframe diamonds
- `src/components/timeline/Playhead.jsx` — scrubber

**Files to modify:**
- `src/renderer/scenePass.js` — read poseOverrides during draw if playing
- `src/app/layout/EditorLayout.jsx` — activate timeline panel

**Exit criteria:** Import PSD, group the head, rotate group to position 1 → K, scrub to frame 20, rotate to position 2 → K → Play → head rotates back and forth. Mesh warp a tail: drag vertices to bent position → K, drag back → K → Play → tail wags.

---

### M5 — Spritesheet Export

**Goal:** Render animation to frames → download as zip of PNGs or packed spritesheet image + JSON.

**What to build:**
1. **Frame renderer**: Offscreen WebGL canvas (or reuse main canvas), step through animation time, call `gl.readPixels` each frame, encode as PNG blob.
2. **Export UI**: Dialog in header bar. Options:
   - Animation clip to export (dropdown)
   - FPS override (default: animation FPS)
   - Background: transparent / white / custom color
   - Format: **Zip of PNG frames** (default) | Spritesheet image + JSON atlas
3. **Zip output** (JSZip, already in deps): `frame_0000.png`, `frame_0001.png`, …
4. **Spritesheet mode**: shelf-pack frames into a power-of-2 atlas, output `spritesheet.png` + `spritesheet.json` (frame rects — compatible with Phaser/Unity/Godot).

**Files to create:**
- `src/io/export.js` — frame capture loop + zip/atlas builder

**Files to modify:**
- `src/app/layout/EditorLayout.jsx` — Export button in header

**Exit criteria:** Click Export → choose zip → download `frames.zip` → open → correct frame sequence with transparency.

---

### M6 — Physics

**Goal:** Assign spring physics to a group chain. Play button enables live simulation. Physics preview integrates with playback.

**What to build:**
1. **Physics group**: assign ordered list of groups/parts as a chain. Per-chain: gravity (direction + strength), stiffness, damping, wind (direction + noise).
2. **Verlet integrator**: runs on rAF alongside playback. Each chain node has position + previous position. Constraint: max distance from parent anchor. Applies result as transform offsets on top of animated pose.
3. **Physics inspector panel**: add/remove nodes to chain, tweak gravity/stiffness/damping sliders.
4. **Play modes**: 
   - "Preview" (P key): plays animation + physics live
   - "Bake": runs simulation, writes result as keyframes into the active animation (destructive, with undo)

**Exit criteria:** Attach physics to a hair-strand group chain → press Play → hair jiggles with gravity and motion.

---

### M7 — GIF / Video Export *(deferred, post-M6)*

- GIF: use `gif.js` worker (existing popular lib, MIT)
- WebM: MediaRecorder API on a canvas stream
- Both build on the frame renderer from M5

---

## What's Dropped from Original Plan

| Original | Status | Reason |
|---|---|---|
| Parameters system (M5) | **Dropped** | Replaced by direct keyframing — lower learning curve |
| Armed recording mode | **Dropped** | Part of parameter system |
| Warp deformer 5×5 grid | **Dropped** | Direct vertex keyframes achieve same result more intuitively |
| Path deformer | **Dropped** | Scope reduction |
| `.stretch` format + atlas packer | **Deferred** | Spritesheet export covers immediate need |
| 2D parameter grids (M9) | **Dropped** | Out of scope for this goal |
| Standalone player library | **Deferred** | No immediate use case without the parameter system |

---

## Key Architecture Notes

- **Pose separation**: During playback, interpolated values go into `animationStore.poseOverrides` (a Map of nodeId → {x, y, rotation, ...}). The renderer reads overrides instead of `projectStore` values. This avoids polluting the project model with playback state.
- **Mesh warp keyframes**: Stored as `Float32Array` snapshots. Lerped per-vertex. Already have `uploadPositions()` on PartRenderer for hot-path GPU updates — playback calls this.
- **Transform composition**: World matrix computed each frame from node tree + poseOverrides. No caching in M3 (simple scenes). Add caching in M4 if perf requires.
- **Existing infra reused**: `updateProject` / immer for edits, `versionControl` dirty flags for renderer, `dispatchMeshWorker` for remesh, shadcn Slider/Switch/Button for all UI.
