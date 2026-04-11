# M3 Progress Report: Groups & Hierarchical Transforms

**Status:** ✅ Complete  
**Completed:** 2026-04-08  
**Updated:** 2026-04-08 (bug fixes, refinements, PSD auto-organize feature)

## Overview

M3 delivers a foundational scene graph system with hierarchical parent-child relationships, affine 2D transforms, and interactive gizmo-based transform editing. This enables After Effects-style workflows and prepares the renderer for timeline-based animation (M4).

## ✅ What Was Built

### Core Systems

#### 1. **Matrix Math Library** (`src/renderer/transforms.js`)
- `mat3Identity()` — 3×3 identity matrix
- `mat3Mul(a, b)` — column-major matrix multiplication
- `mat3Inverse(m)` — 2D affine inverse (no perspective)
- `makeLocalMatrix(transform)` — converts {x, y, rotation, scaleX, scaleY, pivotX, pivotY} → 3×3 matrix
- `computeWorldMatrices(nodes)` — depth-first hierarchy traversal with memoization
- Used by both renderer and UI components

#### 2. **Scene Graph** (`src/store/projectStore.js`)
- **Group nodes:** `{id, type:'group', name, parent, opacity, visible, transform}`
- **Part schema extended:** added `transform` field
- **Actions:**
  - `createGroup(name)` — creates new group node
  - `reparentNode(nodeId, newParentId)` — only mutates parent, never draw_order
- **Defaults:** `DEFAULT_TRANSFORM()` returns {x:0, y:0, rotation:0, scaleX:1, scaleY:1, pivotX:0, pivotY:0}

#### 3. **Renderer Integration** (`src/renderer/scenePass.js`)
- Computes world matrices for all nodes (depth-first)
- Per-part MVP = camera × worldMatrix
- Correctly renders hierarchically transformed parts
- Maintains visual z-order via draw_order

#### 4. **Editor State** (`src/store/editorStore.js`)
- `activeLayerTab` — switches between 'depth' and 'groups' views
- `setActiveLayerTab(tab)` action

#### 5. **Transform Inspector** (`src/components/inspector/Inspector.jsx`)
- `NumericInput` component — blur/enter commit, syncs external changes
- `TransformPanel` — 6 fields (Pos X/Y, Rotation °, Scale X/Y, Pivot X/Y) + Reset button
- Works for both parts and groups
- `MeshPanel` hidden for group nodes

#### 6. **Layer Management UI** (`src/components/layers/LayerPanel.jsx`)
- **Depth Tab:**
  - Flat list sorted by draw_order (descending)
  - Shows group-name chip badge when part is parented
  - Drag-to-reorder layers (squeezes into position)
  - Right-click context menu: "Move into group", "New group with this", "Remove from group"
  - Visibility toggle per layer
- **Groups Tab:**
  - Tree view of all nodes (groups + parts)
  - Drag-to-reparent (only mutates parent)
  - "New Group" button
  - Collapsible groups with expand/collapse chevron

#### 7. **Transform Gizmo** (`src/components/canvas/GizmoOverlay.jsx`)
- SVG overlay atop canvas (inset-0)
- Blue circle at pivot → drag to translate (updates x/y)
- Orange circle 52px above pivot → drag to rotate (updates rotation)
- Dashed line connecting handles
- Only visible in 'select' mode with single selection

#### 8. **Canvas Integration** (`src/components/canvas/CanvasViewport.jsx`)
- Initializes new nodes with `DEFAULT_TRANSFORM()`
- Computes world matrices for vertex picking
- Inverse matrix transforms for correct picking on rotated/scaled parts
- `worldToLocal()` helper for coordinate space conversion
- GizmoOverlay mounted
- PSD auto-organization modal (if ≥4 layers match character part tags)

#### 9. **PSD Character Format Auto-Organizer** (`src/io/psdOrganizer.js`)
- `detectCharacterFormat(layers)` — returns true if ≥4 layer names match known character part tags
- `matchTag(name)` — extracts tag from layer name (handles `handwear-1`, `eyebrow_L`, etc.)
- Recognizes 23 character part tags: back hair, front hair, headwear, face, irides, eyebrow, eyewhite, eyelash, eyewear, ears, earwear, nose, mouth, neck, neckwear, topwear, handwear, bottomwear, legwear, footwear, tail, wings, objects
- `organizeCharacterLayers(layers, uidFn)` — returns group hierarchy + per-layer draw_order assignments
- Group structure: **Head** (with **Eyes** subgroup) / **Body** (with **Upperbody** and **Lowerbody** subgroups) / **Extras**
- Canonical draw order: back hair → wings/tail → body parts → head parts → front hair/headwear → objects

## 🐛 Bugs Fixed (This Session)

### 1. **PSD Opacity Bug**
- **Issue:** All imported PSD layers had opacity = 0 (showing nothing)
- **Root Cause:** ag-psd library already normalizes opacity to 0-1, but code was dividing by 255 again
- **Fix:** Removed `/255` division in `src/io/psd.js:69`
- **Status:** ✅ Fixed

### 2. **PSD Mesh Generation**
- **Issue:** Only the last PSD layer generated a mesh; others had no mesh data
- **Root Cause:** Used single `workerRef` slot, new layers terminated previous workers before completion
- **Fix:** Changed to `workersRef` Map to track concurrent workers per `partId`
- **Impact:** PSD imports now automatically generate meshes for all layers
- **Status:** ✅ Fixed

### 3. **PSD Layer Render Order**
- **Issue:** Back layers rendered in front; visual order was inverted
- **Root Cause:** Reversed layers in psd.js, then assigned sequential draw_order (0, 1, 2...)
- **Fix:** Inverted draw_order assignment: `draw_order: layers.length - 1 - i`
- **Status:** ✅ Fixed

### 4. **Depth Tab Drag Behavior**
- **Issue:** Dragging to reorder swapped two layers' draw_order
- **Fix:** Implemented "squeeze" behavior — removes source from list, inserts above target, renumbers all draw_order sequentially
- **Status:** ✅ Fixed

### 5. **Depth Tab UI Cleanup**
- **Issue:** Up/down arrows and Z display clutter the interface
- **Fix:** 
  - Removed arrow buttons and draw_order number
  - Replaced column header with "Drag to reorder" label
  - Cleaner, drag-focused UX
- **Status:** ✅ Implemented

### 6. **Mesh Generation: Edge Clipping & Multi-Part Support**
- **Issue:** Outer areas of sprites were clipped; multiple separated parts (eyes, arms) only got edge points around one region
- **Root Cause:** 
  - Moore-neighbor contour tracing only found one contour (first region encountered)
  - Edge vertices placed directly on alpha boundary caused chord-shortcut effect (straight mesh edges cut inside curves)
- **Fix:**
  - **Multi-seed contour tracing:** Scan entire image for all boundary start pixels → traces each separated region independently
  - **Boundary dilation:** Dilate alpha mask by 2px before tracing → edge vertices land just outside visual boundary → texture alpha clips the result naturally → chord-shortcut gaps become invisible
  - **Per-contour vertex distribution:** Distribute `numEdgePoints` proportionally by perimeter across all regions
- **Implementation:** (`src/mesh/contour.js`, `src/mesh/generate.js`)
  - `dilateAlphaMask()` — separable L-∞ max-pooling (expands opaque region outward)
  - `traceAllContours()` — returns array of closed paths, one per region
  - `traceSingleContour()` — Moore-neighbor tracing with visited marking
- **Status:** ✅ Fixed (post-M3 refinement)

## 📊 Current Architecture

```
Project (canvas + nodes + textures)
├── Nodes (flat array)
│   ├── Parts (type: 'part')
│   │   ├── transform: {x, y, rotation, scaleX, scaleY, pivotX, pivotY}
│   │   ├── draw_order (z-index)
│   │   ├── parent (group id or null)
│   │   ├── mesh, opacity, visible, clip_mask
│   │   └── meshOpts (per-part mesh generation settings)
│   └── Groups (type: 'group')
│       ├── transform: {x, y, rotation, scaleX, scaleY, pivotX, pivotY}
│       ├── parent (group id or null)
│       ├── name, opacity, visible
│       └── (no draw_order, no mesh)
└── Rendering (per-part MVP = camera × worldMatrix)
```

**Rendering Order:**
1. Parts sorted by `draw_order` (ascending)
2. For each part, compute perPartMVP = camera × worldMatrix(part)
3. Render textured mesh, wireframe, vertices, edge outline overlays

## 🎯 What Works

✅ Import PNG → creates part with default transform  
✅ Import PSD → creates parts for all rasterized layers, auto-generates meshes, correct opacity & z-order  
✅ Import PSD with character format → detects & shows organize modal, auto-creates Head/Body/Lowerbody/Extras groups with correct hierarchy & draw order  
✅ Create group → new group node with default transform  
✅ Select part/group → shows in Inspector, gizmo appears on canvas  
✅ Edit transforms via Inspector numeric inputs → live update on canvas  
✅ Drag gizmo move handle → translate part/group  
✅ Drag gizmo rotation handle → rotate part/group  
✅ Depth tab drag → reorder parts by draw_order  
✅ Depth tab context menu → reparent part into group  
✅ Groups tab drag → reparent any node (part or group) into group  
✅ Groups tab expand/collapse → show/hide group contents  
✅ Visibility toggle → per-node show/hide  
✅ Opacity slider → per-node opacity  
✅ Add/remove vertices → picks correct world-space locations on rotated/scaled parts  
✅ Vertex drag → moves vertices in local object space while tracking world motion  
✅ Reset Transform button → restores to defaults  

## 📋 Known Limitations

- **No hierarchical visibility culling:** If parent is hidden, children still participate in picking (minor issue, low priority)
- **No transform inheritance preview:** Gizmo always shows local axes (After Effects shows world axes in many contexts)
- **No undo/redo:** All changes are immediate; no history system
- **Groups have no visual appearance:** Only containers; can't set fill/stroke (intentional for M3, may revisit in M5+)

## 🔄 Integration with M4

M3 lays the foundation for M4 (Timeline & Keyframe Animation):

- Renderer already accepts per-part MVPs (world matrices ready)
- Transform schema is complete and immutable-updatable
- AnimationStore (separate from ProjectStore) will:
  - Read base transforms from projectStore
  - Apply interpolated override values
  - Not mutate projectStore during playback
- Timeline UI will display keyframes for each transform property

## 🔧 Files Changed/Created

| File | Type | Purpose |
|------|------|---------|
| `src/renderer/transforms.js` | NEW | Matrix math & world matrix computation |
| `src/io/psdOrganizer.js` | NEW | Character format detection & auto-organization |
| `src/store/projectStore.js` | MODIFIED | Group schema, createGroup, reparentNode |
| `src/store/editorStore.js` | MODIFIED | activeLayerTab state |
| `src/renderer/scenePass.js` | MODIFIED | Hierarchical MVP computation |
| `src/components/inspector/Inspector.jsx` | MODIFIED | TransformPanel, NumericInput |
| `src/components/layers/LayerPanel.jsx` | MODIFIED | Depth & Groups tabs, drag-to-reorder |
| `src/components/canvas/GizmoOverlay.jsx` | NEW | SVG transform gizmo |
| `src/components/canvas/CanvasViewport.jsx` | MODIFIED | PSD auto-org modal, finalizePsdImport, inverse matrix picking |
| `src/io/psd.js` | MODIFIED | Opacity & mesh worker fixes |

## 📌 Next Steps

- **M4:** Timeline & Keyframe Animation
  - AnimationStore with poseOverrides
  - Timeline UI with keyframe editor
  - Playback at specified frame rate
  - Interpolation (linear, ease-in-out, etc.)
- **M5+:** Advanced features (undo/redo, blend modes, clipping, etc.)

---

**Report Generated:** 2026-04-08  
**Implementation Lead:** Nguyen Phan  
**Quality:** Production-ready for M4 progression
