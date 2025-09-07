import { Delaunay } from 'd3-delaunay';
import { VoronoiCell } from './model/VoronoiCell.js';

// Global configuration: scales the baseline pixel radii sampled for seeds.
// Set to 0.5 to make starting sizes 50% smaller across all minerals.
export const BASELINE_RADIUS_GLOBAL_SCALE = 0.5;

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function computeCentroid(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

function computePrincipalAxisOrientationDeg(points, centroid) {
  // PCA on polygon vertices to approximate orientation of long axis
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p[0] - centroid[0];
    const dy = p[1] - centroid[1];
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const term = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  const lambda1 = 0.5 * (trace + term);
  const lambda2 = 0.5 * (trace - term);
  const major = lambda1 >= lambda2 ? lambda1 : lambda2;

  // eigenvector for major eigenvalue
  let vx;
  let vy;
  if (Math.abs(sxy) > 1e-6 || Math.abs(major - sxx) > 1e-6) {
    vx = sxy;
    vy = major - sxx;
  } else {
    vx = 1;
    vy = 0;
  }
  const angleRad = Math.atan2(vy, vx);
  const angleDeg = (angleRad * 180) / Math.PI;
  return angleDeg;
}

function computeAspectRatio(points, centroid, orientationDeg) {
  // project points onto major/minor axes and compute extent ratio
  const theta = (orientationDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  let minMajor = Infinity;
  let maxMajor = -Infinity;
  let minMinor = Infinity;
  let maxMinor = -Infinity;

  for (const p of points) {
    const dx = p[0] - centroid[0];
    const dy = p[1] - centroid[1];
    const major = dx * cosT + dy * sinT;
    const minor = -dx * sinT + dy * cosT;
    if (major < minMajor) minMajor = major;
    if (major > maxMajor) maxMajor = major;
    if (minor < minMinor) minMinor = minor;
    if (minor > maxMinor) maxMinor = minor;
  }
  const majorExtent = Math.max(1e-6, maxMajor - minMajor);
  const minorExtent = Math.max(1e-6, maxMinor - minMinor);
  return majorExtent / minorExtent;
}

function clipPolygonToRect(points, x0, y0, x1, y1) {
  function clipAgainst(predicate, intersect) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const aInside = predicate(a);
      const bInside = predicate(b);
      if (aInside && bInside) {
        output.push(b);
      } else if (aInside && !bInside) {
        output.push(intersect(a, b));
      } else if (!aInside && bInside) {
        output.push(intersect(a, b));
        output.push(b);
      }
    }
    return output;
  }

  let out = points.slice();
  // left
  out = clipAgainst(
    (p) => p[0] >= x0,
    (a, b) => {
      const t = (x0 - a[0]) / (b[0] - a[0]);
      return [x0, a[1] + t * (b[1] - a[1])];
    }
  );
  // right
  out = clipAgainst(
    (p) => p[0] <= x1,
    (a, b) => {
      const t = (x1 - a[0]) / (b[0] - a[0]);
      return [x1, a[1] + t * (b[1] - a[1])];
    }
  );
  // top
  out = clipAgainst(
    (p) => p[1] >= y0,
    (a, b) => {
      const t = (y0 - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), y0];
    }
  );
  // bottom
  out = clipAgainst(
    (p) => p[1] <= y1,
    (a, b) => {
      const t = (y1 - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), y1];
    }
  );
  return out;
}

export class VoronoiSimulator {
  constructor({ width, height, numSeeds, mineralRegistry }) {
    this.width = width;
    this.height = height;
    this.numSeeds = numSeeds;
    this.mineralRegistry = mineralRegistry;

    this.cells = []; // VoronoiCell[]
    this._mineralByIndex = []; // MineralType per site index (stable)
    this.seedsBase = []; // original site positions (stable)
    this.currentPoints = []; // last-used site positions
    this._baselineRadiusPerIndex = []; // stable baseline radius per site
    this.growthStrength = 1; // global multiplier for size-driven relaxation
    this.anisotropyStrength = 1; // global multiplier for anisotropy shaping
    // Debug/log support
    this._logger = null; // optional function(record)
    this._issues = []; // [{type, cellId, msg}]
    this.lineationDirDeg = 0; // global lineation direction in degrees
    this.lineationStrength = 0; // 0..1 strength
    // View zoom (applied at render time via SVG viewBox). 1 = default.
    this.zoomScale = 1;
    // View pan (center of the current viewport in world coords)
    this.panX = width / 2;
    this.panY = height / 2;
    // World bounds used for Voronoi computation and seed generation
    this._worldRect = [0, 0, this.width, this.height]; // [x0,y0,x1,y1]
    this._voronoiRect = [0, 0, this.width, this.height];
    this._initSeeds();
    this._computeFromPoints(this.seedsBase);
    // Make the initial tessellation more equant by relaxing seeds toward
    // their cell centroids once. This yields default aspect ratios closer
    // to 1 and more uniform sizes, aligning visuals with slider defaults.
    this._relaxToCentroids(1);
  }
  setLogger(fn) { this._logger = typeof fn === 'function' ? fn : null; }
  _log(evt, fields) {
    const rec = { ts: Date.now(), evt, ...fields };
    if (this._logger) this._logger(rec);
    // Also print to console for dev
    try { console.log('VORO', JSON.stringify(rec)); } catch {}
  }

  // Expand the world at startup so it already covers the minimum zoom-out
  // viewport (centered), and seed additional sites at consistent density.
  _bootstrapWorldForMinZoom() {
    // Deprecated: retaining for reference only; not used to avoid edge effects
  }

  // Set render-time zoom scale, clamped to [0.5, 10].
  setZoomScale(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    // Support 0.1×–10× as requested; CPU protection handled by incremental expansion.
    this.zoomScale = Math.max(0.5, Math.min(10, v));
    // Re-clamp pan to valid range for the new zoom level
    this._clampPanToWorld();
  }
  getZoomScale() { return this.zoomScale; }
  getWorldRect() { return (this._worldRect || [0, 0, this.width, this.height]).slice(); }
  getPanCenter() { return [this.panX, this.panY]; }
  setPanCenter(x, y) {
    const nx = Number(x); const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    this.panX = nx; this.panY = ny;
    this._clampPanToWorld();
  }

  _clampPanToWorld() {
    const z = Number(this.zoomScale) || 1;
    // When zoomed out or at 1×, no panning: center on frame to avoid confusion
    if (z <= 1) { this.panX = this.width / 2; this.panY = this.height / 2; return; }
    const wr = this._worldRect || [0, 0, this.width, this.height];
    const vbW = this.width / z; const vbH = this.height / z;
    const minX = wr[0] + vbW / 2; const maxX = wr[2] - vbW / 2;
    const minY = wr[1] + vbH / 2; const maxY = wr[3] - vbH / 2;
    if (minX <= maxX) this.panX = Math.min(maxX, Math.max(minX, this.panX)); else this.panX = (wr[0] + wr[2]) / 2;
    if (minY <= maxY) this.panY = Math.min(maxY, Math.max(minY, this.panY)); else this.panY = (wr[1] + wr[3]) / 2;
  }

  _getZoomViewRect() {
    const z = Number(this.zoomScale) || 1;
    const vbW = this.width / z;
    const vbH = this.height / z;
    const wr = this._worldRect || [0, 0, this.width, this.height];
    // Default center
    let cx = this.panX; let cy = this.panY;
    if (!(Number.isFinite(cx) && Number.isFinite(cy))) { cx = this.width / 2; cy = this.height / 2; }
    // Clamp to world so the viewBox never exceeds bounds
    const minX = wr[0] + vbW / 2; const maxX = wr[2] - vbW / 2;
    const minY = wr[1] + vbH / 2; const maxY = wr[3] - vbH / 2;
    if (minX <= maxX) cx = Math.min(maxX, Math.max(minX, cx)); else cx = (wr[0] + wr[2]) / 2;
    if (minY <= maxY) cy = Math.min(maxY, Math.max(minY, cy)); else cy = (wr[1] + wr[3]) / 2;
    const vbX = cx - vbW / 2; const vbY = cy - vbH / 2;
    return [vbX, vbY, vbX + vbW, vbY + vbH];
  }

  _ensureWorldForRect(rect) {
    // Expand world/seeds to cover rect if needed; keep existing points stable.
    const [rx0, ry0, rx1, ry1] = rect;
    const [wx0, wy0, wx1, wy1] = this._worldRect;
    const needLeft = rx0 < wx0;
    const needTop = ry0 < wy0;
    const needRight = rx1 > wx1;
    const needBottom = ry1 > wy1;
    if (!(needLeft || needTop || needRight || needBottom)) return false; // already covered

    const oldArea = (wx1 - wx0) * (wy1 - wy0);
    const density = Math.max(1, this.currentPoints.length) / Math.max(1, oldArea);
    const addRegions = [];
    if (needLeft) addRegions.push([rx0, wy0, wx0, wy1]);
    if (needRight) addRegions.push([wx1, wy0, rx1, wy1]);
    const nx0 = Math.min(wx0, rx0); const nx1 = Math.max(wx1, rx1);
    if (needTop) addRegions.push([nx0, ry0, nx1, wy0]);
    if (needBottom) addRegions.push([nx0, wy1, nx1, ry1]);

    const newPoints = [];
    for (const [ax0, ay0, ax1, ay1] of addRegions) {
      const w = Math.max(0, ax1 - ax0);
      const h = Math.max(0, ay1 - ay0);
      if (w <= 0 || h <= 0) continue;
      const area = w * h;
      const count = Math.max(0, Math.round(area * density));
      for (let i = 0; i < count; i++) {
        const x = ax0 + Math.random() * w;
        const y = ay0 + Math.random() * h;
        newPoints.push([x, y]);
      }
    }
    if (newPoints.length === 0) return false;
    // Append new seeds with random mineral types and baseline radii
    for (const p of newPoints) {
      const t = this.mineralRegistry.pickRandom();
      const [minR, maxR] = t.baselineRadiusRange;
      const r = randomInRange(minR, maxR) * BASELINE_RADIUS_GLOBAL_SCALE;
      this._mineralByIndex.push(t);
      this._baselineRadiusPerIndex.push(r);
      this.seedsBase.push([p[0], p[1]]);
      this.currentPoints.push([p[0], p[1]]);
    }
    // Update world rect to include rect
    this._worldRect = [Math.min(wx0, rx0), Math.min(wy0, ry0), Math.max(wx1, rx1), Math.max(wy1, ry1)];
    this.numSeeds = this.currentPoints.length;
    return true;
  }

  // One or more Lloyd-style relaxation steps that move sites to Voronoi
  // centroids and recompute. This makes default cells more equant (aspect≈1)
  // and sizes more uniform without changing any slider settings.
  _relaxToCentroids(iterations = 1) {
    const iters = Math.max(0, Math.floor(Number(iterations) || 0));
    for (let k = 0; k < iters; k++) {
      if (!Array.isArray(this.cells) || this.cells.length === 0) return;
      const pts = this.cells.map((c) => {
        const x = Math.min(this.width, Math.max(0, c.centroid[0]));
        const y = Math.min(this.height, Math.max(0, c.centroid[1]));
        return [x, y];
      });
      // Update seed references and recompute once per iteration
      this.seedsBase = pts.map((p) => [p[0], p[1]]);
      this.currentPoints = pts.map((p) => [p[0], p[1]]);
      this._computeFromPoints(pts);
    }
  }
  getIssuesForCell(cellId) {
    if (!Array.isArray(this._issues)) return [];
    return this._issues.filter((x) => x && x.cellId === cellId).map((x) => x.msg || x.type);
  }
  setGrowthStrength(value) {
    this.growthStrength = Math.max(0.1, Number(value) || 1);
  }

  setAnisotropyStrength(value) {
    const v = Number(value);
    this.anisotropyStrength = Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : 1;
  }

  setLineation(dirDeg, strength) {
    const d = Number(dirDeg);
    const s = Number(strength);
    // Adjust by -90° so 0° on the dial corresponds to up (vertical),
    // matching user expectation for geological lineation.
    if (Number.isFinite(d)) {
      let adj = d - 90;
      adj = ((adj % 360) + 360) % 360;
      this.lineationDirDeg = adj;
    } else {
      this.lineationDirDeg = 0;
    }
    this.lineationStrength = Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 0;
  }

  // Randomize site positions while preserving per-site sizes/aspect via
  // subsequent effective-point computation. Mineral assignments and
  // baseline radii remain unchanged; ids stay stable by index.
  randomizePositionsPreserveSizes() {
    const n = this.currentPoints && this.currentPoints.length ? this.currentPoints.length : this.numSeeds;
    const rect = this._worldRect || [0, 0, this.width, this.height];
    const w = Math.max(1, rect[2] - rect[0]);
    const h = Math.max(1, rect[3] - rect[1]);
    const rand = new Array(n)
      .fill(0)
      .map(() => [rect[0] + Math.random() * w, rect[1] + Math.random() * h]);
    // Start a new layout from these randomized seeds
    this.seedsBase = rand.map((p) => [p[0], p[1]]);
    this.currentPoints = rand.map((p) => [p[0], p[1]]);
    this.numSeeds = this.currentPoints.length;
    // Compute targets based on existing scales/orientations across full world
    return this.getEffectivePoints();
  }
  
  _initSeeds() {
    this.seedsBase = new Array(this.numSeeds)
      .fill(0)
      .map(() => [Math.random() * this.width, Math.random() * this.height]);
    this.currentPoints = this.seedsBase.map((p) => [p[0], p[1]]);
    // Assign a stable mineral type to each seed
    this._mineralByIndex = this.seedsBase.map(() => this.mineralRegistry.pickRandom());
    // Assign a stable baseline radius per site based on mineral type
    this._baselineRadiusPerIndex = this._mineralByIndex.map((t) => {
      const [minR, maxR] = t.baselineRadiusRange;
      return randomInRange(minR, maxR) * BASELINE_RADIUS_GLOBAL_SCALE;
    });
  }

  _computeFromPoints(points) {
    // Standard (unweighted) Voronoi from Delaunay, driven solely by site positions
    const rect = this._voronoiRect || [0, 0, this.width, this.height];
    const delaunay = Delaunay.from(points);
    const vor = delaunay.voronoi(rect);

    const cells = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      let ring = vor.cellPolygon(i);
      if (!ring || ring.length < 3) {
        // Fallback for rare degeneracies (e.g., coincident points). Create a
        // tiny box around the site so indices remain aligned and downstream
        // logic stays robust. It will be immediately stabilized by the next step.
        const px = Math.min(this.width, Math.max(0, points[i][0]));
        const py = Math.min(this.height, Math.max(0, points[i][1]));
        const e = 0.1;
        ring = [
          [px - e, py - e],
          [px + e, py - e],
          [px + e, py + e],
          [px - e, py + e]
        ];
      }
      cells[i] = ring;
    }

    this.cells = cells.map((c, id) => {
      const ring = clipPolygonToRect(c, rect[0], rect[1], rect[2], rect[3]);
      const centroid = computeCentroid(ring);
      const mineralType = this._mineralByIndex[id];
      const baselineRadius = this._baselineRadiusPerIndex[id];
      const cell = new VoronoiCell({ id, polygon: ring, centroid, mineralType, baselineRadius });
      const orientationDeg = computePrincipalAxisOrientationDeg(ring, centroid);
      cell.orientationDeg = orientationDeg;
      cell.aspectRatio = computeAspectRatio(ring, centroid, orientationDeg);
      return cell;
    });

    // Neighbor detection via Delaunay, ordered CCW starting at top-most (screen coords)
    for (let i = 0; i < this.cells.length; i++) {
      const center = this.cells[i].centroid;
      const neighborIds = Array.from(delaunay.neighbors(i));
      const ordered = neighborIds.map((nid) => ({
        id: nid,
        // invert dy so increasing angle corresponds to CCW in screen space (y-down)
        angle: Math.atan2(-(this.cells[nid].centroid[1] - center[1]), this.cells[nid].centroid[0] - center[0])
      })).sort((a, b) => a.angle - b.angle);
      // rotate to start at top-most (angle near +π/2)
      let startIdx = 0;
      let best = Infinity;
      for (let k = 0; k < ordered.length; k++) {
        const diff = Math.abs(ordered[k].angle - Math.PI / 2);
        if (diff < best) { best = diff; startIdx = k; }
      }
      const finalOrder = [];
      for (let k = 0; k < ordered.length; k++) finalOrder.push(ordered[(startIdx + k) % ordered.length].id);
      this.cells[i].setNeighborsOrdered(finalOrder);
    }
    this.currentPoints = points.map((p) => [p[0], p[1]]);
  }

  getEffectivePoints(expansionHint = false) {
    // Ensure computations are done against the full world to avoid
    // view-dependent artifacts when zoomed in.
    // Use whatever voronoi rect is in effect (zoomed or world) but do not
    // change it here; transformations should respect the rect chosen by the
    // caller (renderFromPoints). This avoids sudden rect switches.
    // reset issues per computation
    this._issues = [];
    // Compute per-seed transformed positions with three components:
    // 1) local anisotropy scaling around the current centroid
    // 2) global normalization so non-changed minerals do not grow on average
    // 3) toroidal soft-sphere repulsion to share space without edge bias
    const basePoints = this.currentPoints.length ? this.currentPoints : this.seedsBase;
    // Force world rect for all effective-point computations so zoom/view never
    // influences anisotropy or size outcomes.
    const rectUsed = this._worldRect || [0, 0, this.width, this.height];
    const rectW = Math.max(1, rectUsed[2] - rectUsed[0]);
    const rectH = Math.max(1, rectUsed[3] - rectUsed[1]);
    const n = basePoints.length;

    // size mapping and global normalization (area-proxy via baselineRadius^2)
    const SIZE_GAIN = 1.8;
    // Remove global normalization that cancels per-mineral size adjustments.
    // We keep a mild normalization that only prevents runaway growth
    // when many minerals are scaled up at once, but it does not change
    // relative sizes for unchanged minerals.
    const baselineAreaSum = this.cells.reduce((acc, c) => acc + c.baselineRadius * c.baselineRadius, 0);
    const intendedAreaSum = this.cells.reduce((acc, c, i) => {
      const type = this._mineralByIndex[i];
      const s = Math.max(0.2, Number(type.sizeScale || 1)) ** SIZE_GAIN;
      return acc + (c.baselineRadius * c.baselineRadius) * s;
    }, 0);
    const normalizeK = intendedAreaSum > baselineAreaSum ? (baselineAreaSum / intendedAreaSum) : 1;

    const targetRadius = new Array(n);
    for (let i = 0; i < n; i++) {
      const type = this._mineralByIndex[i];
      const s = Math.max(0.2, Number(type.sizeScale || 1)) ** SIZE_GAIN;
      // Apply per-mineral scaling directly; normalizeK is shared but mild
      targetRadius[i] = this.cells[i].baselineRadius * s * normalizeK;
    }

    // Precompute anisotropy target (without repulsion), using normalized size
    const majorUnit = new Array(n);
    const aspectScale = new Array(n);
    const anisotropyTargets = basePoints.map((p, i) => {
      const cell = this.cells[i];
      const type = this._mineralByIndex[i];
      // Blend local cell orientation with global lineation direction
      const localTheta = ((cell?.orientationDeg ?? 0) * Math.PI) / 180;
      const globalTheta = (this.lineationDirDeg * Math.PI) / 180;
      const tBlend = this.lineationStrength; // 0..1
      const theta = (1 - tBlend) * localTheta + tBlend * globalTheta;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const uX = cosT; // major axis
      const uY = sinT;
      const vX = -sinT; // minor axis
      const vY = cosT;
      majorUnit[i] = [uX, uY];

      // Mineral-specific aspect clamping: mica can be extremely platy in 2D
      const isMica = (type?.id === 'mica');
      const maxAspectAllowed = isMica ? 100 : 6;
      const minAspectAllowed = isMica ? 1 : 0.2;
      let requestedAspect = Number(type.aspectRatioScale || 1);
      if (!Number.isFinite(requestedAspect)) requestedAspect = 1;
      const aspect = Math.min(maxAspectAllowed, Math.max(minAspectAllowed, requestedAspect));
      if (aspect !== requestedAspect) {
        this._log('aspect_clamp', { src: 'getEffectivePoints', seeds: n, mineral: type?.id || 'unknown', value: requestedAspect, clampedTo: aspect, aniso: this.anisotropyStrength });
      }
      aspectScale[i] = aspect;
      const size = targetRadius[i] / Math.max(1e-6, cell.baselineRadius);

      // Pivot about the current cell centroid to avoid global migration
      const pivotX = cell?.centroid?.[0] ?? p[0];
      const pivotY = cell?.centroid?.[1] ?? p[1];
      // Use a stable reference vector from centroid to the original seed, so aspect
      // increases always extend along the orientation direction regardless of current dx,dy.
      let refDx = (this.seedsBase[i][0] - pivotX);
      let refDy = (this.seedsBase[i][1] - pivotY);
      if (Math.hypot(refDx, refDy) < 1e-3) {
        // default reference along the major axis with baseline magnitude
        const m = (cell?.baselineRadius || 1) * 0.6;
        refDx = uX * m; refDy = uY * m;
      }
      // decompose reference and scale strictly by aspect along u (orientation) and 1/aspect across
      const major0 = refDx * uX + refDy * uY;
      const minor0 = refDx * vX + refDy * vY;
      const majorScaled = major0 * size * aspect;
      const minorScaled = minor0 * size / aspect;
      const x = pivotX + majorScaled * uX + minorScaled * vX;
      const y = pivotY + majorScaled * uY + minorScaled * vY;
      return [x, y];
    });

    // Neighbor distance relaxation so larger target radii claim more space.
    // We choose a global scale K that maps (r_i + r_j) to current average neighbor distance.
    const pos = anisotropyTargets.map((p) => [p[0], p[1]]);
    const delaunay0 = Delaunay.from(pos);
    // Compute averages
    let totalLen = 0; let numEdges = 0; let totalR = 0;
    for (let i = 0; i < n; i++) {
      for (const j of delaunay0.neighbors(i)) {
        if (j <= i) continue; // count each edge once
        // Toroidal shortest-vector to avoid edge bias in averages
        let dx = pos[j][0] - pos[i][0];
        let dy = pos[j][1] - pos[i][1];
        if (dx > rectW / 2) dx -= rectW;
        if (dx < -rectW / 2) dx += rectW;
        if (dy > rectH / 2) dy -= rectH;
        if (dy < -rectH / 2) dy += rectH;
        const d = Math.hypot(dx, dy);
        totalLen += d;
        totalR += targetRadius[i] + targetRadius[j];
        numEdges++;
      }
    }
    const avgLen = numEdges ? totalLen / numEdges : 1;
    const avgR = numEdges ? totalR / numEdges : 1;
    const K = avgR > 0 ? avgLen / avgR : 1; // desired distance ~ K*(ri+rj)

    // Scale iterations with max aspect for stronger effect when needed
    const maxAspect = aspectScale.reduce((m, a) => Math.max(m, a || 1), 1);
    // Iterations are capped and scaled down when seed count is large to maintain responsiveness
    const isExpanded = (expansionHint === true) || (expansionHint && expansionHint.expanded === true);
    const rawIter = 10 + Math.min(12, Math.floor(Math.max(0, maxAspect - 1) * 2.5));
    // When the world just expanded (zooming out), run extra iterations so the
    // new border seeds equilibrate with the existing interior and avoid center bias.
    const extraIter = isExpanded ? 8 : 0;
    const budgetFactor = Math.max(0.4, Math.min(1, 250 / Math.max(1, n)));
    const ITER = Math.max(8, Math.round((rawIter + extraIter) * budgetFactor));
    const SPRING = isExpanded ? 0.01 : 0.02;
    let totalClamp = 0; let totalEdges = 0;
    const clampHits = new Map(); // cellId -> hits
    let deltaScale = 1; // adaptive scale to reduce pushes when clamping is hot
    for (let iter = 0; iter < ITER; iter++) {
      const delaunay = Delaunay.from(pos);
      const disp = new Array(n).fill(0).map(() => [0, 0]);
      let clampIter = 0; let edgeIter = 0;
      for (let i = 0; i < n; i++) {
        for (const j of delaunay.neighbors(i)) {
          if (j <= i) continue;
          // Use toroidal shortest-vector to neutralize boundary effects
          let dx = pos[j][0] - pos[i][0];
          let dy = pos[j][1] - pos[i][1];
          if (dx > rectW / 2) dx -= rectW;
          if (dx < -rectW / 2) dx += rectW;
          if (dy > rectH / 2) dy -= rectH;
          if (dy < -rectH / 2) dy += rectH;
          const d = Math.hypot(dx, dy) + 1e-6;
          const baseDesired = K * (targetRadius[i] + targetRadius[j]);
          // Anisotropic desired distance blending: longer along major, shorter across
          const ux = dx / d; const uy = dy / d;
          const avgUx = (majorUnit[i][0] + majorUnit[j][0]) * 0.5;
          const avgUy = (majorUnit[i][1] + majorUnit[j][1]) * 0.5;
          const norm = Math.hypot(avgUx, avgUy) || 1;
          const ax = avgUx / norm; const ay = avgUy / norm;
          const align = Math.abs(ux * ax + uy * ay); // 0..1
          const aspectAvg = Math.max(0.2, (aspectScale[i] + aspectScale[j]) * 0.5);
          const aspectClamped = Math.min(10, aspectAvg);
          const weight = Math.pow(align, 6); // stronger emphasis on alignment
          const s = Math.max(0, this.anisotropyStrength) * 2.2; // slightly softer to prevent runaway
          const along = aspectClamped ** s;
          const across = aspectClamped ** (-s);
          const desired = baseDesired * (weight * along + (1 - weight) * across);
          let delta = (desired - d) * 0.5 * this.growthStrength * deltaScale; // adaptive
          // Clamp step to avoid runaway at very high aspect
          const MAX_STEP = 10;
          if (delta > MAX_STEP) { delta = MAX_STEP; totalClamp++; clampIter++; clampHits.set(i, (clampHits.get(i) || 0) + 1); clampHits.set(j, (clampHits.get(j) || 0) + 1); }
          else if (delta < -MAX_STEP) { delta = -MAX_STEP; totalClamp++; clampIter++; clampHits.set(i, (clampHits.get(i) || 0) + 1); clampHits.set(j, (clampHits.get(j) || 0) + 1); }
          totalEdges++; edgeIter++;
          const fx = ux * delta; const fy = uy * delta;
          disp[i][0] -= fx; disp[i][1] -= fy;
          disp[j][0] += fx; disp[j][1] += fy;
        }
      }
      for (let i = 0; i < n; i++) {
        const sx = (this.seedsBase[i][0] - pos[i][0]) * SPRING;
        const sy = (this.seedsBase[i][1] - pos[i][1]) * SPRING;
        let nx = pos[i][0] + disp[i][0] + sx;
        let ny = pos[i][1] + disp[i][1] + sy;
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
          this._log('nan_detected', { src: 'relax', seeds: n, cellId: i, value: 'non-finite' });
          this._issues.push({ type: 'nan', cellId: i, msg: 'non-finite position' });
          nx = Math.min(this.width, Math.max(0, this.seedsBase[i][0]));
          ny = Math.min(this.height, Math.max(0, this.seedsBase[i][1]));
        }
        if (nx < 0) nx = 0; if (nx > this.width) nx = this.width;
        if (ny < 0) ny = 0; if (ny > this.height) ny = this.height;
        pos[i][0] = nx; pos[i][1] = ny;
      }
      // Adaptive damping for next iteration
      if (edgeIter > 0) {
        const rate = clampIter / edgeIter;
        if (rate > 0.6) {
          deltaScale = Math.max(0.4, deltaScale * 0.8);
        } else {
          deltaScale = Math.min(1, deltaScale * 1.05);
        }
      }
    }
    if (totalEdges > 0) {
      const clampRate = totalClamp / totalEdges;
      if (clampRate > 0.6) {
        // Determine top offenders
        const top = Array.from(clampHits.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        for (const [cid] of top) this._issues.push({ type: 'clamp', cellId: cid, msg: 'step_clamp_hot' });
        this._log('step_clamp_hot', { src: 'relax', seeds: n, iter: ITER, stepClampRate: Number(clampRate.toFixed(2)), maxAspect: Number(maxAspect.toFixed(2)) });
      }
    }

    return pos;
  }

  // Adjust per-site mineral types to match target counts per mineral id.
  // countById: Map<string, number> or plain object id -> number
  setMineralCountsTarget(countById) {
    // Normalize to Map
    const targets = countById instanceof Map ? countById : new Map(Object.entries(countById));
    // Build current index lists per id
    const indicesById = new Map();
    for (let i = 0; i < this._mineralByIndex.length; i++) {
      const id = this._mineralByIndex[i].id;
      let arr = indicesById.get(id);
      if (!arr) { arr = []; indicesById.set(id, arr); }
      arr.push(i);
    }
    const allIds = Array.from(new Set(this._mineralByIndex.map((t) => t.id)));
    // Prepare donors and receivers
    const donors = [];
    const receivers = [];
    for (const id of allIds) {
      const have = (indicesById.get(id) || []).length;
      const want = Math.max(0, Math.floor(Number(targets.get(id) ?? have)));
      const delta = want - have;
      if (delta < 0) {
        // surplus: take the last -delta indices deterministically
        const list = indicesById.get(id) || [];
        const give = list.slice(list.length + delta); // delta is negative
        donors.push({ id, indices: give });
      } else if (delta > 0) {
        receivers.push({ id, need: delta });
      }
    }
    // Flatten donors
    const donorPool = [];
    for (const d of donors) donorPool.push(...d.indices);
    // Assign donors to receivers in order (deterministic)
    let pos = 0;
    for (const r of receivers) {
      for (let k = 0; k < r.need && pos < donorPool.length; k++, pos++) {
        const idx = donorPool[pos];
        // Reassign mineral type
        const newType = this.mineralRegistry.getAll().find((t) => t.id === r.id);
        if (!newType) continue;
        this._mineralByIndex[idx] = newType;
        // Update baseline radius to be consistent with new mineral
        const [minR, maxR] = newType.baselineRadiusRange;
        this._baselineRadiusPerIndex[idx] = randomInRange(minR, maxR) * BASELINE_RADIUS_GLOBAL_SCALE;
      }
    }
  }

  renderSVG() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Apply zoom via viewBox cropping/expansion centered on the frame.
    const [vbX, vbY, vbX1, vbY1] = this._getZoomViewRect();
    const vbW = vbX1 - vbX;
    const vbH = vbY1 - vbY;
    svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    svg.setAttribute('width', String(this.width));
    svg.setAttribute('height', String(this.height));

    // Define a simple stripes pattern that can be rotated per cell via patternTransform
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const basePattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    basePattern.setAttribute('id', 'stripe');
    basePattern.setAttribute('patternUnits', 'userSpaceOnUse');
    basePattern.setAttribute('width', '8');
    basePattern.setAttribute('height', '8');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '8');
    bg.setAttribute('height', '8');
    bg.setAttribute('fill', 'none');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    line.setAttribute('x', '0');
    line.setAttribute('y', '0');
    line.setAttribute('width', '2');
    line.setAttribute('height', '8');
    line.setAttribute('fill', 'rgba(255,255,255,0.15)');
    basePattern.appendChild(bg);
    basePattern.appendChild(line);
    defs.appendChild(basePattern);
    svg.appendChild(defs);

    for (const cell of this.cells) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = `M ${cell.polygon.map((p) => `${p[0]} ${p[1]}`).join(' L ')} Z`;
      path.setAttribute('d', d);
      path.setAttribute('fill', cell.displayColor);
      path.setAttribute('class', 'cell');
      path.setAttribute('data-id', String(cell.id));
      path.setAttribute('data-mineral', cell.mineralType.id);
      // Per-cell pattern aligned precisely with the cell's orientation and anchored at its centroid
      const cx = cell.centroid[0];
      const cy = cell.centroid[1];
      const blend = Math.max(0, Math.min(1, this.lineationStrength || 0));
      const hatchDeg = (1 - blend) * (cell.orientationDeg || 0) + blend * (this.lineationDirDeg || 0);
      const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      const patId = `stripe-cell-${cell.id}`;
      pat.setAttribute('id', patId);
      pat.setAttribute('patternUnits', 'userSpaceOnUse');
      pat.setAttribute('patternContentUnits', 'userSpaceOnUse');
      pat.setAttribute('x', '0');
      pat.setAttribute('y', '0');
      pat.setAttribute('width', '8');
      pat.setAttribute('height', '8');
      // Rotate the pattern about the cell centroid to match orientation without offset
      pat.setAttribute('patternTransform', `rotate(${hatchDeg} ${cx} ${cy})`);
      // Stronger alternating bands to make orientation more visible
      const bandDark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bandDark.setAttribute('x', '0');
      bandDark.setAttribute('y', '0');
      bandDark.setAttribute('width', '3');
      bandDark.setAttribute('height', '8');
      bandDark.setAttribute('fill', 'rgba(0,0,0,0.28)');
      const bandLight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bandLight.setAttribute('x', '4');
      bandLight.setAttribute('y', '0');
      bandLight.setAttribute('width', '1');
      bandLight.setAttribute('height', '8');
      bandLight.setAttribute('fill', 'rgba(255,255,255,0.20)');
      pat.appendChild(bandDark);
      pat.appendChild(bandLight);
      defs.appendChild(pat);

      const hatch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hatch.setAttribute('d', d);
      hatch.setAttribute('fill', `url(#${patId})`);
      hatch.setAttribute('opacity', '1');
      hatch.setAttribute('pointer-events', 'none');
      svg.appendChild(path);
      svg.appendChild(hatch);
    }

    // Debug issue overlays
    if (Array.isArray(this._issues) && this._issues.length) {
      for (const issue of this._issues) {
        const cell = this.cells[issue.cellId];
        if (!cell) continue;
        const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d2 = `M ${cell.polygon.map((p) => `${p[0]} ${p[1]}`).join(' L ')} Z`;
        overlay.setAttribute('d', d2);
        overlay.setAttribute('fill', 'none');
        overlay.setAttribute('stroke', issue.type === 'nan' ? '#ef4444' : '#f97316');
        overlay.setAttribute('stroke-width', '2');
        overlay.setAttribute('pointer-events', 'none');
        svg.appendChild(overlay);
        const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circ.setAttribute('cx', String(cell.centroid[0]));
        circ.setAttribute('cy', String(cell.centroid[1]));
        circ.setAttribute('r', '4');
        circ.setAttribute('fill', 'none');
        circ.setAttribute('stroke', '#ef4444');
        circ.setAttribute('stroke-width', '2');
        circ.setAttribute('pointer-events', 'none');
        svg.appendChild(circ);
      }
    }

    // neighbor count labels
    for (const cell of this.cells) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(cell.centroid[0]));
      text.setAttribute('y', String(cell.centroid[1]));
      text.setAttribute('class', 'cell-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = String(cell.neighborIdsCCWFromTop.length);
      svg.appendChild(text);
    }

    return svg;
  }

  renderFromPoints(points) {
    // Always compute Voronoi on the full world to avoid view-driven seams.
    // When zooming out, expand the world first, but keep computation global.
    const zoomRect = this._getZoomViewRect();
    const z = Number(this.zoomScale) || 1;
    let expanded = false;
    if (z < 1) expanded = this._ensureWorldForRect(zoomRect) || false;
    // Use the full world rect consistently so toroidal relaxations and
    // Voronoi clipping share the same domain and no inner rectangle appears.
    this._voronoiRect = (this._worldRect || [0, 0, this.width, this.height]);
    // If the world just expanded due to zooming out, recompute effective
    // points once so new seeds immediately reflect current size/aspect.
    const pts = expanded
      ? this.getEffectivePoints({ expanded: true })
      : (Array.isArray(points) && points.length === this.currentPoints.length ? points : this.currentPoints);
    this._computeFromPoints(pts);
    return this.renderSVG();
  }
}


