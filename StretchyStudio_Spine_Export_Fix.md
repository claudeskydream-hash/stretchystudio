# Stretchy Studio Spine Export Fix

Date: 2026-06-19

## Scope

Fixed Stretchy Studio's Spine JSON exporter so exported files can be read by
Spine 4.2.43 Professional.

Source file changed:

`D:\Program Files\StretchyStudio\src\io\exportSpine.js`

## Problems Found

### 1. Missing slot bones

The exporter previously created Spine bones only for nodes whose type was
`group`. Warp deformers, such as `HairBackWarp`, could therefore be referenced
by slots without being exported as bones.

Spine error:

```text
Slot bone not found: HairBackWarp
```

### 2. Invalid mesh attachments

The exporter wrote Stretchy Studio's internal mesh data directly into Spine
attachments. The internal vertex representation is not the Spine mesh JSON
format, which caused attachment parsing errors.

Spine error:

```text
Error reading attachment: back_hair, skin: default
Value cannot be converted to float
```

### 3. Invalid animation curves

The exporter wrote CSS normalized Bezier values such as:

```json
[0.42, 0, 0.58, 1]
```

directly into Spine timelines. Spine 4.2 expects absolute `(time, value)`
Bezier control points. It also expects one four-value curve per animated
component: four values for rotation, eight values for translation or scale, and
sixteen values for RGBA.

Spine error:

```text
Error reading animation: Idle
Invalid curve.
```

## Changes Made

### Bones and slots

- Every non-`part` node is exported as a Spine bone, including warp deformers.
- Bone and slot names are deduplicated.
- Parent ordering is resolved before bones are written.
- Orphaned or cyclic nodes are attached to `root`.
- Slot bone references use the generated bone-name map.

### Attachments

- Exported part attachments now use Spine `region` attachments.
- Internal Stretchy Studio mesh data is no longer emitted as invalid Spine mesh
  JSON.
- Image paths continue to use sanitized part names.

### Animation curves

- CSS easing curves are converted per keyframe segment to Spine 4.2 absolute
  Bezier control points.
- `stepped` easing remains `"stepped"`.
- Linear easing writes no curve field.
- The final keyframe in a timeline has no curve, because it has no following
  segment.

### 4. Images not auto-referenced on import (2026-06-19)

After importing `skeleton.json` into the Spine 4.2 editor, every attachment
showed as an orange placeholder with a red "missing image" mark. The exporter
packed textures into an `images/` subfolder but provided no way for Spine to
resolve them: there was no atlas, and region attachment `path` values were bare
names whose images root has to be set manually in the editor.

Spine symptom:

```text
Region attachment unlinked (red X), e.g. slot "bottomwear" path "bottomwear"
```

Fix:

- The exporter now also emits a `skeleton.atlas` file (`buildSpineAtlas()`).
- One full-image page is written per texture; the page points at
  `images/<name>.png` and the region name matches the attachment `path`.
- Real pixel dimensions are read with `createImageBitmap` so each atlas region
  matches its source image exactly.
- Region attachment `path` values stay as bare sanitized names (Spine
  convention); resolution is handled entirely by the atlas.
- On `Import Data`, Spine auto-loads the same-named `skeleton.atlas`, so every
  attachment links to its image with no manual images-path setup.

Export layout:

```text
spine_export/
  skeleton.json     # path = "back_hair"
  skeleton.atlas    # page images/back_hair.png, region back_hair
  images/back_hair.png ...
```

## Existing Files Repaired

The following files were repaired in place. Backup files with a
`.bak-before-...` suffix were preserved.

- `D:\LayaboxWorkSpace\HelthGame\temp\SpineSample\Girs\skeleton.json`
- `D:\LayaboxWorkSpace\tools\TestSpine\spine_export\skeleton.json`

## Verification Completed

- `pnpm build` completed successfully in `D:\Program Files\StretchyStudio`.
- A runtime export test confirmed that `HairBackWarp` is emitted as a bone.
- A runtime export test confirmed no duplicate bones and no missing slot-bone
  references.
- A runtime export test confirmed valid curve sizes: 4 values for rotate and
  16 values for RGBA.
- The repaired `spine_export\skeleton.json` was successfully parsed using the
  local Spine 4.2 `SkeletonJson` implementation.
  - 33 bones
  - 24 slots
  - Animations: `Parameters`, `Idle`

## Use Going Forward

1. Start Stretchy Studio with `C:\Users\Administrator\Desktop\StretchyStudio.bat`.
2. Refresh the browser page at `http://localhost:5173` so Vite loads the fixed
   exporter.
3. Export Spine again and extract the generated ZIP file.
4. Import the generated `skeleton.json` into Spine 4.2.

Do not use older ZIP exports created before these fixes. They may still contain
missing bones, invalid mesh data, or invalid curve data.
