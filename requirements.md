# Rock Mineral Grain Simulator – Requirements and Technical Notes

## Overview
A single-page web app that simulates rock textures as a 2D Voronoi tessellation within a fixed 1000×800 px frame. Each Voronoi cell represents a mineral grain with identifiable attributes and neighbor relationships. The app renders to SVG and includes:
- A legend panel with per-mineral controls for anisotropy (aspect) and average grain size.
- A live area pie chart showing “real estate” share by mineral type.
Updates are animated and preserve a gap-free tiling by recomputing the Voronoi from moving generator points.

## Goals / Scope
- Generate a Voronoi texture constrained to a 1000×800 px frame.
- Assign each cell a mineral type from a fixed registry (3 minerals by default).
- Maintain per-cell attributes and ordered neighbor lists.
- Render cells, a legend, a live area pie chart, and an optional per-cell neighbor-count label.
- Provide live per-mineral controls:
  - Aspect (anisotropy along each grain’s long axis)
  - Size (uniform grain growth/shrink)
- When controls change, animate boundaries and maintain perfect tiling (no voids/overlaps).
- Baseline tests and linting run clean.

## UI/UX
- Layout: three columns centered horizontally — area pie chart (left), 1000×800 frame (center), legend panel (right).
 - Zoom: mouse wheel over the frame zooms 0.1×–10× using SVG viewBox (centered). Zoom changes do not alter seed positions; only the viewport.
- Legend panel shows:
  - Mineral list with color swatches (Quartz, Feldspar, Mica by default)
  - For each mineral: two sliders
    - Aspect: 0.5–10.0 (mica up to 100)
    - Size: 0.1–10
  - Global control:
    - Growth: 0.5–3.0 (amplifies size-driven grain expansion strength)
    - Aniso: 0–3.0 (amplifies aspect-driven elongation strength)
    - Lineation: direction dial (0–360°) and strength slider (0–1) that bias grain orientations globally toward a chosen direction.
  - Checkbox: “Show neighbor counts” (on by default)
  - Frame meta: dimensions and cell count
- Interaction:
  - Slider changes animate the texture to its new state (~350 ms).
  - Toggle hides/shows small black numbers at grain centroids (number of neighbors).
  - Area pie chart updates live to reflect current polygon areas by mineral. Slice labels show percentages (black text) and always sum to ~100%.
- Rendering:
  - SVG polygons with subtle stroke; labels centered and non-interactive.
  - Each cell includes a light grey, semi-transparent stripe pattern rotated to the cell’s `orientationDeg`.
  - Pie chart is pure SVG; no external dependencies.

### Landing Page
- The `index.html` landing page includes a compact "Demos" section above the simulator UI with four linked tiles (small inline SVG thumbnail + short description) to: `layer_shear.html`, `voronio1.html`, `voronoi2.html`, and `voronoi3.html`.

## Domain Model
- VoronoiCell
  - id: number (stable for lifecycle of a generation)
  - polygon: Array<[x,y]>
  - centroid: [x,y]
  - mineralType: MineralType
  - baselineRadius: number (pixels; sampled from type range on generation)
  - colorOverride: string | null
  - aspectRatio: number (dynamic; computed from polygon principal axis)
  - orientationDeg: number (dynamic; principal axis angle)
  - neighborIdsCCWFromTop: number[] (ordered CCW starting at top-most neighbor)
- MineralType
  - id, label, defaultColor, baselineRadiusRange: [min,max]
  - aspectRatioScale: number (UI-adjustable, default 1)
  - sizeScale: number (UI-adjustable, default 1)
- MineralTypeRegistry
  - Holds the set of types and helpers (getAll, pickRandom, createDefault).

## Geometry and Animation Strategy
- We use d3-delaunay to compute the Voronoi from a set of site points.
- Sites are initialized randomly within the frame and assigned a stable mineral type. On creation a single Lloyd-style centroid relaxation step moves each site to its cell centroid and recomputes once. This makes the default texture more equant (aspect ratios closer to 1) and sizes more uniform, aligning with the sliders' default value of 1 for Aspect and Size.
- For live updates:
  1. Compute target site positions from current per-type `aspectRatioScale` and `sizeScale`.
     - Coupled aspect-orientation: the aspect slider now always elongates parallel to each grain’s orientation. Implementation: take a stable reference vector from the cell centroid to its original seed, decompose into the local major/minor axes (from PCA), scale along the major axis by `(size×aspect)` and along the minor axis by `(size/aspect)`, and reconstruct in world space. The major axis itself can blend with a global lineation dial.
     - Size mapping is non-linear (`sizeScale^1.8`) so perceived area change better matches the slider range.
     - To address the “room problem,” iterative neighbor-distance relaxation biases edge lengths toward `K×(ri+rj)` with anisotropic targets (longer along orientation, shorter across). Iterations adapt to max aspect; per-step displacement is clamped for stability. Positions are clamped to the 1000×800 frame after each iteration.
  2. Animate from current to target positions using requestAnimationFrame over ~350 ms.
  3. On each frame, recompute the Voronoi with the interpolated sites and re-render the SVG. This guarantees a gap-free tessellation at all times.
- Neighbor ordering is computed from Delaunay adjacency, sorted CCW, rotated to start at top-most.

## Rendering Details
- All rendering is SVG; one <path> per cell; optional <text> per cell for neighbor count.
- CSS classes: .cell, .cell-label, .hide-labels (toggles label visibility).
- Legend DOM is vanilla JS; sliders update label readouts and trigger re-renders.
  
### Area Pie Chart
- Location: left panel.
- Data: sums of per-cell polygon areas by mineral type.
- Area computation: shoelace formula over the cell’s polygon vertices; totals divided by sum of all cell areas.
- Labels: percentage text at each wedge’s mid-angle, black fill, centered.

### Consistency between Share and Coverage by count
- The “Coverage by count” bar chart counts all grains (no minimum-area filter). Percentages are based on absolute counts of cells per mineral and therefore match the normalized Share targets (modulo integer rounding).

## Key Files
- index.html: Shell with `#chart`, `#frame-container`, and `#legend`.
- src/main.js:
  - App bootstrap, legend UI, event wiring.
  - Creates VoronoiSimulator; handles toggle and slider-driven animations.
  - Pie chart: computes polygon areas (shoelace), aggregates by mineral, renders SVG wedges and percentage labels.
  - Tooltip rules: Every control in the legend must have a concise `title` tooltip explaining its effect. When logic changes or new controls are added, update tooltips in the same edit.
- src/sim/VoronoiSimulator.js:
  - Seed initialization and stable mineral assignment.
  - renderFromPoints(points): recompute cells and return SVG.
  - getEffectivePoints(): compute per-site target positions from current aspect/size scales and cell orientations; applies soft-sphere repulsion + light spring.
  - setZoomScale/getZoomScale: clamp [0.1, 10] and apply via viewBox in render.
  - Computes cell attributes, centroids, PCA orientation, aspect ratio, and neighbor ordering.
  - Global baseline size scale: `BASELINE_RADIUS_GLOBAL_SCALE` (set to 0.5 to make all starting sizes 50% smaller). Used when sampling per-site `baselineRadius` and when reassigning minerals.
- src/sim/model/VoronoiCell.js: Cell data class.
- src/sim/minerals/MineralType.js: Mineral type definition (with adjustable scales).
- src/sim/minerals/MineralTypeRegistry.js: Mineral set creation and random selection.
- src/styles.css: Theme, layout, legend, SVG styles.
- src/sim/__tests__/VoronoiSimulator.test.js: Baseline tests.

## Configuration
 - Frame: FRAME_WIDTH = 1000, FRAME_HEIGHT = 800 in src/main.js.
 - Initial seed count: NUM_POINTS = 120 in src/main.js.
 - Default minerals (MineralTypeRegistry.createDefault): Quartz, Feldspar, Mica.
 - Baseline size global scale: set `BASELINE_RADIUS_GLOBAL_SCALE` in `src/sim/VoronoiSimulator.js` (0.5 = 50% smaller starting sizes).
 - Initial relaxation: one Lloyd step at startup (private `_relaxToCentroids(1)` in `VoronoiSimulator`).

## Build, Run, Quality
- Tooling: Vite, ESLint (flat config), Vitest.
- Scripts (see package.json):
  - npm run dev – start dev server at http://localhost:5173/.
  - npm run build – production build.
  - npm run preview – serve production build.
  - npm run lint – ESLint (ES2022 modules).
  - npm test – Vitest run.
- CI suggestion: run npm ci && npm run lint && npm test before accepting updates.

### Layer Shearing Visualization (layer_shear.html)
- Remeshing cadence: the computational mesh is rebuilt whenever accumulated total strain increases by 250% (Δε_total ≥ 2.5).

## Acceptance Criteria
- On page load, a 1000×800 Voronoi texture is rendered with three mineral types in varied colors.
- Each cell has:
  - A fixed id for the current generation.
  - Correct mineralType and displayColor.
  - Computed centroid, orientationDeg, aspectRatio.
  - neighborIdsCCWFromTop ordered CCW starting at top-most neighbor.
- Legend shows minerals with color swatches and two sliders (Aspect, Size) per mineral.
- Adjusting sliders animates the texture; no gaps/overlaps appear during/after updates.
- Checkbox hides/shows the small black neighbor counts (~8px) at cell centroids.
- A pie chart shows area shares by mineral type; percentages update live and sum to ~100%.
- Lint and tests pass locally.

## Extensibility Notes
- Adding minerals: extend MineralTypeRegistry.createDefault() with new MineralTypes.
- Changing frame or seeds: update FRAME_SIZE, NUM_POINTS in src/main.js.
- Different animation curve/duration: update timing in src/main.js re-render logic.
- Alternate anisotropy model:
  - Replace getEffectivePoints() logic to bias sites via different transforms (e.g., directional Lloyd relaxation, physically inspired grain growth).
- Performance tuning:
  - Throttle slider events, lower animation duration, or reduce seed count.
  - Consider reusing a single <svg> and diffing paths if needed.

## Known Limitations / Future Work
- Orientation is recomputed from polygons per frame; heavy updates at high seeds may impact FPS.
- Aspect/size transforms are visually driven; they are not a physical grain growth model.
- Soft-sphere repulsion is heuristic; gains/iterations may need tuning for large seed counts.
- No persistence of parameters between sessions.
- No responsive layout (intentionally out of scope).

## Minimal Onboarding for New Contributors
1. npm install
2. npm run dev and open the printed localhost URL.
3. Explore entrypoints: src/main.js and src/sim/VoronoiSimulator.js.
4. Run tests with npm test; run linter with npm run lint.
5. For feature changes, update or add tests under src/sim/__tests__.
