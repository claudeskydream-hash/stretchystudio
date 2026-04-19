# Live2D Export Fix: Head and Neck Rotation Deformers

**Date:** April 19, 2026
**Status:** Resolved
**Issue:** "Rotation neck" and "Rotation head" parameters were non-functional in exported `.cmo3` models, and initially caused anatomical misalignment (head snapping to neck base) during the fixing process.

## 1. Initial Problem: The "Bypass" Bug
When `generateRig` is enabled, the exporter creates procedural structural warps (`NeckWarp`, `FaceParallax`) to handle tracking behaviors like head tilting. 

The individual mesh parts (tagged "neck" and "face") were being parented directly to these procedural warps. This **bypassed** the user's group-based rotation deformers (e.g., `GroupRotation_head`). As a result:
*   The rotation deformers were "orphaned" (had no children).
*   Moving the corresponding sliders in Cubism Editor had no visual effect.

## 2. First Fix: Structural Chain Integration
To fix this, we modified the structural chain to include the group rotations:
*   **Original Chain (Neck):** Mesh → RigWarp → NeckWarp → Body X.
*   **Fixed Chain (Neck):** Mesh → RigWarp → NeckWarp → **GroupRotation_neck** → Body X.
*   **Fixed Chain (Face):** Mesh → RigWarp → FaceParallax → FaceRotation → **GroupRotation_head** → Body X.

This ensured the sliders moved the children. However, this introduced a coordinate space issue.

## 3. Second Problem: The "No Neck" Origin Bug
After the first fix, the character appeared to have "no neck" because the head snapped to the base of the neck.

**Cause:** 
Live2D rotation deformers use **canvas-pixel offsets** for their children's origins when the parent is another rotation deformer. Our re-parenting loop was incorrectly converting the `GroupRotation_head` origin to **normalized 0..1** coordinates (the space used by warps like `Body X`). 

When a pixel position like `(100, 200)` is converted to `0.1` and interpreted by Cubism as a pixel offset, the head moves to within `0.1` pixels of the neck pivot, effectively collapsing the neck.

## 4. Final Resolution: Adaptive Coordinate Mapping
We implemented a smarter re-parenting loop in `cmo3writer.js` that adapts to the parent deformer type:

1.  **Detection:** The loop now identifies if a rotation deformer's parent is another rotation deformer (`GroupRotation`) or a warp (`Body X`, `NeckWarp`).
2.  **Adaptive Math:**
    *   **If parent is Rotation:** Origin = `WorldPos - ParentPivotPos` (Pixels).
    *   **If parent is Warp:** Origin = `canvasToWarp(WorldPos)` (0..1).
3.  **Variable Restoration:** Fixed a critical bug where `g` was used instead of the scoped `group` variable, which caused export failures.

## 5. Summary of Impacts
*   **Rotation neck/head** now correctly affects the character.
*   **Anatomical hierarchy** is preserved: rotating the neck moves the head; rotating the head moves only the face.
*   **Hiyori compatibility** remains intact: structural tilting (`Angle Z`) and parallax work concurrently with group rotations.
