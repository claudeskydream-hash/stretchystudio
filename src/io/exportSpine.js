/**
 * exportSpine.js
 * 
 * Logic to export the Stretchy Studio project to Spine 4.0 JSON format.
 */

/**
 * Main entry point for Spine export.
 * Returns a ZIP blob containing the skeleton.json and images.
 */
export async function exportToSpine({ project, onProgress }) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  onProgress?.('Preparing skeleton data...');
  const skeletonData = buildSpineJson(project);
  zip.file('skeleton.json', JSON.stringify(skeletonData, null, 2));

  onProgress?.('Collecting textures...');
  const imagesFolder = zip.folder('images');
  const atlasPages = [];

  for (const node of project.nodes) {
    if (node.type !== 'part') continue;

    const tex = project.textures.find(t => t.id === node.id) || project.textures.find(t => t.id === node.textureId);
    if (!tex || !tex.source) continue;

    try {
      const response = await fetch(tex.source);
      const blob = await response.blob();
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      const region = sanitizeName(node.name);
      const filename = `${region}.${ext}`;
      imagesFolder.file(filename, blob);

      // Read true pixel dimensions so the atlas region matches the source image.
      let w = node.imageWidth ?? 0;
      let h = node.imageHeight ?? 0;
      try {
        const bmp = await createImageBitmap(blob);
        w = bmp.width;
        h = bmp.height;
        bmp.close?.();
      } catch { /* fall back to node dimensions */ }

      atlasPages.push({ page: `images/${filename}`, region, w, h });
      onProgress?.(`Packing image: ${filename}`);
    } catch (err) {
      console.warn(`[Spine Export] Failed to fetch texture for ${node.name}:`, err);
    }
  }

  // skeleton.atlas lets Spine auto-resolve every region attachment to its image
  // on Import Data — no manual "images path" setup needed in the editor.
  zip.file('skeleton.atlas', buildSpineAtlas(atlasPages));

  onProgress?.('Generating ZIP...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return zipBlob;
}

/**
 * Builds the Spine 4.0 JSON structure.
 *
 * Coordinate system:
 *   SS  — Y-down, origin top-left, transforms are stored in parent-local space
 *         (computeWorldMatrices gives true world canvas positions via mat[6/7])
 *   Spine — Y-up. Each bone's x/y is in the parent bone's local space (no rotation for setup pose).
 *
 * Conversion for a canvas of height H:
 *   spineWorldX = canvasWorldX
 *   spineWorldY = H - canvasWorldY
 *
 * Bone offset from parent:
 *   boneX = childSpineWorldX - parentSpineWorldX
 *   boneY = childSpineWorldY - parentSpineWorldY
 */
export function buildSpineJson(project) {
  const { width: canvasW, height: canvasH } = project.canvas;
  const nodes = project.nodes;

  // ── World positions ───────────────────────────────────────────────────────
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Spine expects bone setup coordinates (x,y) to be local to the parent bone.
  // In Stretchy Studio, a node's local transform places its pivot at (x + pivotX, y + pivotY)
  // within its parent's un-transformed internal coordinate space.
  // The distance from the parent's pivot to the child's pivot in this local space is simply:
  // dx = (child.x + child.pivotX) - parent.pivotX
  // dy = (child.y + child.pivotY) - parent.pivotY
  const getLocalSpineOffset = (node) => {
    const nx = (node.transform?.x ?? 0) + (node.transform?.pivotX ?? 0);
    const ny = (node.transform?.y ?? 0) + (node.transform?.pivotY ?? 0);

    // If node has no parent, it attaches to Spine's anchor 'root' at (0,0).
    // So its local offset is just its Spine world position.
    if (!node.parent) {
      return { x: nx, y: canvasH - ny };
    }

    const parentNode = nodeMap.get(node.parent);
    if (!parentNode) {
      return { x: nx, y: canvasH - ny };
    }

    const px = parentNode.transform?.pivotX ?? 0;
    const py = parentNode.transform?.pivotY ?? 0;

    return {
      x: nx - px,
      y: -(ny - py) // Flip Y for Spine's coordinate system
    };
  };


  // ── 1. Skeleton info ──────────────────────────────────────────────────────
  const skeleton = {
    spine: "4.0",
    hash: Math.random().toString(36).slice(2),
    name: "Exported Skeleton",
    width: canvasW,
    height: canvasH,
    fps: 24,
  };

  // ── 2. Bones ──────────────────────────────────────────────────────────────
  // Spine requires every file to have a bone named exactly "root" with no parent.
  const boneNodes = nodes.filter(n => n.type !== 'part');
  const boneNameById = buildUniqueNameMap(boneNodes, new Set(['root']));
  const slotNameById = buildUniqueNameMap(partsFromNodes(nodes), new Set());
  const bones = [{ name: 'root' }];
  const processedBones = new Set(['root']);
  let remaining = [...boneNodes];

  while (remaining.length > 0) {
    const startCount = remaining.length;
    remaining = remaining.filter(node => {
      const parentName = node.parent ? (boneNameById.get(node.parent) ?? 'root') : 'root';
      if (!processedBones.has(parentName)) return true; // parent not yet processed

      const t = node.transform || {};
      const pos = getLocalSpineOffset(node);

      bones.push({
        name: boneNameById.get(node.id),
        parent: parentName,
        x: pos.x,
        y: pos.y,
        rotation: -(t.rotation || 0),   // SS CW → Spine CCW
        scaleX: t.scaleX ?? 1,
        scaleY: t.scaleY ?? 1,
      });
      processedBones.add(boneNameById.get(node.id));
      return false;
    });

    if (remaining.length === startCount) {
      // Cycle / missing parent — attach orphans directly to root
      remaining.forEach(g => {
        const pos = getLocalSpineOffset(g);
        bones.push({ name: boneNameById.get(g.id), parent: 'root', x: pos.x, y: pos.y });
        processedBones.add(boneNameById.get(g.id));
      });
      break;
    }
  }

  // ── 3. Slots ──────────────────────────────────────────────────────────────
  const parts = partsFromNodes(nodes)
    .sort((a, b) => (a.draw_order ?? 0) - (b.draw_order ?? 0));

  const slots = parts.map(part => ({
    name: slotNameById.get(part.id),
    bone: part.parent ? (boneNameById.get(part.parent) ?? 'root') : 'root',
    attachment: slotNameById.get(part.id),
  }));

  // ── 4. Skins ──────────────────────────────────────────────────────────────
  // Region attachment x/y = center of the image in the parent bone's local space.
  // We get this by taking the part's world canvas position (which is the pivot
  // point — typically image center) and expressing it relative to the parent bone.
  const skinAttachments = {};

  for (const part of parts) {
    const t = part.transform || {};
    const pos = getLocalSpineOffset(part);  // pivot offset relative to parent bone's pivot

    const attachment = {
      type: "region",
      name: slotNameById.get(part.id),
      // Bare region name. Image resolution is handled by the generated
      // skeleton.atlas, whose region names match these paths and whose pages
      // point at images/<name>.png. Spine auto-loads that atlas on Import Data.
      path: sanitizeName(part.name),
      x: pos.x,
      y: pos.y,
      rotation: -(t.rotation || 0),
      width: part.imageWidth ?? canvasW,
      height: part.imageHeight ?? canvasH,
    };

    const slotKey = slotNameById.get(part.id);
    if (!skinAttachments[slotKey]) skinAttachments[slotKey] = {};
    skinAttachments[slotKey][slotKey] = attachment;
  }

  const skins = [{ name: "default", attachments: skinAttachments }];

  // ── 5. Animations ─────────────────────────────────────────────────────────
  const animations = {};

  for (const anim of project.animations) {
    const animName = sanitizeName(anim.name);
    const spineAnim = { bones: {}, slots: {} };

    // Group tracks by node
    const tracksByNode = {};
    for (const track of anim.tracks) {
      if (!tracksByNode[track.nodeId]) tracksByNode[track.nodeId] = [];
      tracksByNode[track.nodeId].push(track);
    }

    for (const [nodeId, nodeTracks] of Object.entries(tracksByNode)) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const targetName = node.type === 'part'
        ? slotNameById.get(node.id)
        : boneNameById.get(node.id);
      if (!targetName) continue;

      const isBone = node.type !== 'part';

      if (isBone) {
        if (!spineAnim.bones[targetName]) spineAnim.bones[targetName] = {};
        const boneEntry = spineAnim.bones[targetName];

        for (const track of nodeTracks) {
          if (track.property === 'x' || track.property === 'y') {
            if (!boneEntry.translate) boneEntry.translate = [];
            for (const kf of track.keyframes) {
              const time = kf.time / 1000;
              let entry = boneEntry.translate.find(e => Math.abs(e.time - time) < 0.001);
              if (!entry) { entry = { time, x: 0, y: 0 }; boneEntry.translate.push(entry); }
              const setup = node.transform[track.property] ?? 0;
              const delta = kf.value - setup;
              if (track.property === 'x') entry.x = delta;
              else entry.y = -delta;
              applySpineCurve(entry, kf);
            }
          } else if (track.property === 'rotation') {
            if (!boneEntry.rotate) boneEntry.rotate = [];
            for (const kf of track.keyframes) {
              const setup = node.transform.rotation ?? 0;
              const entry = { time: kf.time / 1000, value: -(kf.value - setup) };
              applySpineCurve(entry, kf);
              boneEntry.rotate.push(entry);
            }
          } else if (track.property === 'scaleX' || track.property === 'scaleY') {
            if (!boneEntry.scale) boneEntry.scale = [];
            for (const kf of track.keyframes) {
              const time = kf.time / 1000;
              let entry = boneEntry.scale.find(e => Math.abs(e.time - time) < 0.001);
              if (!entry) { entry = { time, x: 1, y: 1 }; boneEntry.scale.push(entry); }
              const setup = node.transform[track.property] ?? 1;
              if (track.property === 'scaleX') entry.x = kf.value / setup;
              else entry.y = kf.value / setup;
              applySpineCurve(entry, kf);
            }
          }
        }

        // Sort timelines
        boneEntry.translate?.sort((a, b) => a.time - b.time);
        boneEntry.rotate?.sort((a, b) => a.time - b.time);
        boneEntry.scale?.sort((a, b) => a.time - b.time);

      } else {
        // Slot animations (opacity → rgba)
        if (!spineAnim.slots[targetName]) spineAnim.slots[targetName] = {};
        const slotEntry = spineAnim.slots[targetName];

        for (const track of nodeTracks) {
          if (track.property === 'opacity') {
            if (!slotEntry.rgba) slotEntry.rgba = [];
            for (const kf of track.keyframes) {
              const hexA = Math.round(kf.value * 255).toString(16).padStart(2, '0');
              const entry = { time: kf.time / 1000, color: `ffffff${hexA}` };
              applySpineCurve(entry, kf);
              slotEntry.rgba.push(entry);
            }
            slotEntry.rgba.sort((a, b) => a.time - b.time);
          }
        }
      }
    }

    convertCssCurves(spineAnim);
    animations[animName] = spineAnim;
  }

  const result = { skeleton, bones, slots, skins, animations };
  validateSpineJson(result);
  return result;
}

function partsFromNodes(nodes) {
  return nodes.filter(n => n.type === 'part');
}

/**
 * Builds a Spine .atlas file with one full-image page per texture.
 * Region names match the attachment `path` values, and each page points at the
 * matching file under images/, so Spine links every attachment automatically.
 */
function buildSpineAtlas(pages) {
  return pages.map(({ page, region, w, h }) =>
`${page}
size: ${w},${h}
format: RGBA8888
filter: Linear,Linear
repeat: none
${region}
  rotate: false
  xy: 0, 0
  size: ${w}, ${h}
  orig: ${w}, ${h}
  offset: 0, 0
  index: -1`
  ).join('\n\n') + '\n';
}

function buildUniqueNameMap(items, reserved = new Set()) {
  const used = new Set(reserved);
  const map = new Map();

  for (const item of items) {
    const base = sanitizeName(item.name) || sanitizeName(item.id) || 'item';
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(name);
    map.set(item.id, name);
  }

  return map;
}

function validateSpineJson(data) {
  const boneNames = new Set();
  const duplicateBones = [];

  for (const bone of data.bones) {
    if (boneNames.has(bone.name)) duplicateBones.push(bone.name);
    boneNames.add(bone.name);
  }

  const missingSlotBones = data.slots
    .filter(slot => !boneNames.has(slot.bone))
    .map(slot => `${slot.name}->${slot.bone}`);

  if (duplicateBones.length || missingSlotBones.length) {
    throw new Error(
      `[Spine Export] Invalid skeleton: duplicate bones=${duplicateBones.join(', ') || 'none'}; ` +
      `missing slot bones=${missingSlotBones.join(', ') || 'none'}`
    );
  }
}

function convertCssCurves(animation) {
  for (const bone of Object.values(animation.bones)) {
    convertTimelineCurves(bone.translate, ['x', 'y']);
    convertTimelineCurves(bone.rotate, ['value']);
    convertTimelineCurves(bone.scale, ['x', 'y']);
  }

  for (const slot of Object.values(animation.slots)) {
    convertTimelineCurves(slot.rgba, ['r', 'g', 'b', 'a'], colorChannels);
  }
}

function convertTimelineCurves(timeline, valueNames, getValues = (frame) => valueNames.map(name => frame[name])) {
  if (!Array.isArray(timeline)) return;

  for (let index = 0; index < timeline.length; index += 1) {
    const frame = timeline[index];
    const cssCurve = frame._cssCurve;
    delete frame._cssCurve;

    if (!cssCurve || index === timeline.length - 1) continue;

    const next = timeline[index + 1];
    const duration = next.time - frame.time;
    if (!(duration > 0)) continue;

    const values = getValues(frame);
    const nextValues = getValues(next);
    const curve = [];
    for (let channel = 0; channel < valueNames.length; channel += 1) {
      const start = values[channel];
      const end = nextValues[channel];
      const delta = end - start;
      curve.push(
        frame.time + duration * cssCurve[0],
        start + delta * cssCurve[1],
        frame.time + duration * cssCurve[2],
        start + delta * cssCurve[3],
      );
    }
    frame.curve = curve;
  }
}

function colorChannels(frame) {
  const color = frame.color || 'ffffffff';
  return [0, 2, 4, 6].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);
}

function sanitizeName(name) {
  const s = (name ?? 'item')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s === 'root' ? 'rig_root' : s;
}

function applySpineCurve(entry, kf) {
  if (kf.easing === 'stepped') {
    entry.curve = 'stepped';
    return;
  }

  if (Array.isArray(kf.easing) && kf.easing.length === 4) {
    entry._cssCurve = kf.easing;
  } else if (kf.easing === 'ease-in') {
    entry._cssCurve = [0.42, 0, 1, 1];
  } else if (kf.easing === 'ease-out') {
    entry._cssCurve = [0, 0, 0.58, 1];
  } else if (kf.easing && kf.easing !== 'linear') {
    entry._cssCurve = [0.42, 0, 0.58, 1];
  }
}


