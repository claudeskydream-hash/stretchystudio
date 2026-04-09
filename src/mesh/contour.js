/**
 * Pure contour tracing and smoothing algorithms.
 * No DOM, no globals. Takes plain typed arrays / objects.
 */

// ─── Alpha mask building & dilation ──────────────────────────────────────────

/**
 * Build a binary alpha mask and dilate it by `radius` pixels (L-∞ / separable).
 * Dilation expands the opaque region outward so edge vertices land just outside
 * the visual boundary. The texture alpha then clips the rendered result, so the
 * chord-shortcut effect (straight mesh edges cutting inside a curve) becomes
 * invisible — the mesh always covers the full image content.
 *
 * @param {Uint8ClampedArray} data      - Raw RGBA pixel data
 * @param {number}            width
 * @param {number}            height
 * @param {number}            threshold - Alpha threshold for "inside"
 * @param {number}            radius    - Dilation radius in pixels (0 = no change)
 * @returns {Uint8Array}                 Binary mask (1 = inside after dilation)
 */
export function dilateAlphaMask(data, width, height, threshold, radius) {
  // Build initial binary mask from alpha channel
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data[i * 4 + 3] >= threshold ? 1 : 0;
  }

  if (radius <= 0) return mask;

  // Horizontal max-pooling pass (dilate left/right)
  const tmp = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let nx = x0; nx <= x1 && !found; nx++) {
        if (mask[y * width + nx]) found = true;
      }
      tmp[y * width + x] = found ? 1 : 0;
    }
  }

  // Vertical max-pooling pass (dilate up/down)
  const dilated = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      for (let ny = y0; ny <= y1 && !found; ny++) {
        if (tmp[ny * width + x]) found = true;
      }
      dilated[y * width + x] = found ? 1 : 0;
    }
  }

  return dilated;
}

// ─── Multi-region contour tracing ─────────────────────────────────────────────

const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

/**
 * Trace a single closed boundary starting at (startX, startY).
 * Marks all visited boundary pixels in `visited` to prevent re-tracing.
 *
 * @param {Uint8Array} mask
 * @param {number}     width
 * @param {number}     height
 * @param {number}     startX
 * @param {number}     startY
 * @param {Uint8Array} visited  - shared visited array, mutated in place
 * @returns {Array<[number,number]>}
 */
function traceSingleContour(mask, width, height, startX, startY, visited) {
  const contour = [[startX, startY]];
  visited[startY * width + startX] = 1;

  let curX = startX, curY = startY;
  let prevDir = 6; // start by looking left (same convention as before)

  const maxSteps = width * height * 2;
  for (let steps = 0; steps < maxSteps; steps++) {
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dir = (prevDir + 6 + i) % 8;
      const [dx, dy] = DIRS[dir];
      const nx = curX + dx, ny = curY + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (mask[ny * width + nx]) {
        prevDir = dir;
        curX = nx;
        curY = ny;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (curX === startX && curY === startY) break;
    visited[curY * width + curX] = 1;
    contour.push([curX, curY]);
  }

  return contour;
}

/**
 * Trace all closed boundary contours in a binary mask.
 * Returns one contour per connected opaque region.
 *
 * @param {Uint8Array} mask   - Binary mask from erodeAlphaMask
 * @param {number}     width
 * @param {number}     height
 * @returns {Array<Array<[number,number]>>}  Array of closed contour point lists
 */
export function traceAllContours(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const contours = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      // Start pixel: inside, left neighbor outside, not yet traced
      if (mask[idx] && !mask[idx - 1] && !visited[idx]) {
        const contour = traceSingleContour(mask, width, height, x, y, visited);
        if (contour.length >= 3) contours.push(contour);
      }
    }
  }

  return contours;
}

// ─── Arc-length resampling ────────────────────────────────────────────────────

/**
 * Resample a closed contour so points are uniformly spaced.
 *
 * @param {Array<[number,number]>} contour
 * @param {number}                 numPoints - Target sample count
 * @returns {Array<[number,number]>}
 */
export function resampleContour(contour, numPoints) {
  if (contour.length < 2) return contour;

  const arcLengths = [0];
  for (let i = 1; i < contour.length; i++) {
    const dx = contour[i][0] - contour[i - 1][0];
    const dy = contour[i][1] - contour[i - 1][1];
    arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const last = contour.length - 1;
  const dx0 = contour[0][0] - contour[last][0];
  const dy0 = contour[0][1] - contour[last][1];
  const totalLength = arcLengths[last] + Math.sqrt(dx0 * dx0 + dy0 * dy0);

  const result = [];
  const step = totalLength / numPoints;
  let seg = 0;

  for (let i = 0; i < numPoints; i++) {
    const targetLen = i * step;
    while (seg < arcLengths.length - 1 && arcLengths[seg + 1] < targetLen) seg++;

    const t = (seg < arcLengths.length - 1)
      ? Math.min(1, (targetLen - arcLengths[seg]) / (arcLengths[seg + 1] - arcLengths[seg]))
      : 0;

    const p0 = contour[seg];
    const p1 = contour[(seg + 1) % contour.length];
    result.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]);
  }

  return result;
}

// ─── Laplacian smoothing ─────────────────────────────────────────────────────

/**
 * Smooth contour using Laplacian (neighbour-average) relaxation.
 *
 * @param {Array<[number,number]>} points
 * @param {number}                 numPasses
 * @returns {Array<[number,number]>}
 */
export function smoothContour(points, numPasses = 3) {
  let result = points.slice();
  for (let p = 0; p < numPasses; p++) {
    result = result.map((pt, i) => {
      const prev = result[(i - 1 + result.length) % result.length];
      const next = result[(i + 1) % result.length];
      return [(prev[0] + pt[0] * 2 + next[0]) / 4, (prev[1] + pt[1] * 2 + next[1]) / 4];
    });
  }
  return result;
}
