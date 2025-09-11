## Drip2 Soft-Body Simulator — Requirements and Current State

### Overview
Drip2 is a browser-based soft-body blob simulator built on p5.js. A toroidal shell (inner/outer rims) is modeled as a mass–spring network with additional material-like forces (pressure, bending, viscous smoothing, and self-repulsion). Circular obstacles interact with the blob via a signed distance field (SDF) and tangential friction. The scene scrolls upward at a gravity-scaled rate while obstacles spawn below and recycle.

### Dependencies
- p5.js `1.11.10` (CDN loaded in `drip2_modular.html`)
- No bundler/build step; served as static files. Tested in desktop browsers.

### File/Module Structure
- `drip2_modular.html`: HTML host; loads p5 and all `drip2/*.js` scripts in order.
- `drip2/config.js`: Tunable constants and runtime parameters (gravity, stiffness, pressure, damping, visualization scales, safety clamps).
- `drip2/util.js`: Utility helpers (e.g., `pointDistance`).
- `drip2/ui.js`: Simple styling helpers for p5 UI elements.
- `drip2/classes.js`: Core data types
  - `Point`: position, velocity, acceleration.
  - `Spring`: Hooke-style spring between two `Point`s with rest length taken from initial geometry.
  - `ObstacleCircle`: moving circular obstacle with mass, SDF `distance(p)`, `applyForce`, `contains`, `draw`.
  - `SoftBody`: parameters for blob geometry; reinitializes global geometry and caches `restOuterArea`.
- `drip2/physics.js`: Global state and physics system
  - Global arrays: `points`, `springs`, `obstacles`.
  - Core update: `updatePhysics()` computes per-frame forces and integrates state.
  - Material/interaction forces: pressure, rim self-repulsion, rim bending, viscous velocity smoothing, obstacle friction, obstacle dynamics.
  - SDF helpers: `sdf()`, `sdf_force()`, `getNorm()`, `sdfCombine()`.
  - Geometry/area: `initializeBlob()`, `computeOuterArea()`.
  - Mouse tug distribution across nearby rim/paired points.
- `drip2/render.js`: Rendering of fills, wireframe, hub, and force vectors for blob and obstacles.
- `drip2/interactions.js`: Mouse/keyboard interactions, global scrolling, obstacle spawning and recycling.
- `drip2/main.js`: p5 setup, UI creation, slider/checkbox state, per-frame loop orchestration.

### Simulation Model
- Geometry
  - Blob comprised of alternating inner/outer rim points plus a center hub point.
  - Springs:
    - Rim radial: inner–outer per vertex.
    - Rim tangential: outer-to-next-inner/outer, and additional cross/rim supports.
    - Bending: outer-to-outer across two vertices (configurable `BEND_SPRING_K`).
    - Spokes to hub: inner/outer to center (`INNER_SPOKE_K`).
- Forces (per frame, in this order)
  1. Initialize accelerations with gravity scaled by density (`BASE_GRAVITY * gravityScale / densityScale`).
  2. SDF repulsion from obstacles: exponential falloff based on negative SDF, capped.
  3. Spring forces via `Spring.addAcceleration()`.
  4. Pressure forces to preserve area:
     - Relative area error `(restOuterArea - area)/restOuterArea` scaled by `PRESSURE_K` and density.
     - Applied as edge-normal forces around outer rim; clamped by `MAX_PRESSURE_FORCE`.
  5. Rim self-repulsion: pairwise outer-rim point repulsion within `SELF_REPEL_RADIUS` up to `MAX_EXTRA_FORCE`.
  6. Rim bending: Laplacian position smoothing scaled by `BENDING_K`, clamped.
  7. Rim viscous smoothing: Laplacian on velocities scaled by `VISC_BEND_COEF`.
  8. Obstacle friction on points: tangential damping near contact band, magnitude from `frictionSlider` and proximity.
  9. Obstacle dynamics: obstacle mass from radius and `OBSTACLE_DENSITY` (slider-scaled); accumulate reaction-like forces from rim tangential motion; apply damping `OBSTACLE_DAMPING`; integrate obstacle state.
  10. Distributed mouse tug (if dragging): normalized spring/damper across local neighborhood around the grabbed vertex (paired inner/outer shares).
  11. Integrate points: explicit Euler with exponential damping factor `exp(-damp*RATE)`.

### Signed Distance Field (SDF) and Contacts
- Obstacles define `distance(p)` = circle SDF; scene SDF is `sdfCombine` across all obstacles (max inside, min outside).
- Normal is finite-differenced gradient of SDF; obstacle force is `exp(30 * -sdf)` along the normal, capped.
- Separate tangential friction: for rim points within `CONTACT_BAND` of nearest obstacle, apply tangential deceleration proportional to proximity and local tangential velocity; similarly, obstacles receive equal-and-opposite tangential forces before damping/integration.

### UI, Inputs, and Controls
- Sliders
  - Red channel for background; vertex density exponent (scales vertex count by `2^v`); gravity scale; density scale (inverted mapping); rim thickness; fill gray; friction; obstacle density.
- Checkboxes
  - Toggle fill, rim, wireframe, points, and solid interior.
- Keys
  - `i` toggle internal springs visualization; `c` toggle center-spring visualization; `Space` pauses obstacle spawning and clears current obstacles.
- Mouse
  - Drag an obstacle by clicking inside it.
  - Drag the blob by nearest vertex (within `1.5 × outer_radius`) using a distributed mouse spring across a local rim neighborhood and paired inner/outer points; forces damped and clamped by `MOUSE_MAX_FORCE`.
- Auto scene scroll
  - After physics, the scene scrolls upward by `-BASE_GRAVITY * gravityScale * RATE` applied to all points and obstacles, creating a “falling blob / rising world” effect. Obstacles recycle and respawn below while not paused.

### Configuration and Safety
- Core constants in `drip2/config.js` group parameters by domain: gravity, stiffness, pressure, bending, damping, visualization, clamps, obstacle properties, mass scaling.
- Safety clamps: `MAX_PRESSURE_FORCE`, `MAX_EXTRA_FORCE`; viscous damping prevents runaway velocities.
- `restOuterArea` recalculated on geometry rebuild and on mouse release to stabilize pressure setpoint.

### Rendering
- Rim fill via triangle strip between outer and inner rims; optional solid fill of outer rim polygon.
- Wireframe draws springs; optional hub and spoke visualization.
- Force vectors
  - Blob: EWMA of sum of point accelerations scaled by `FORCE_VIS_SCALE`, capped by `FORCE_VIS_MAX_LEN`.
  - Obstacles: either force-derived or velocity-derived arrows to visualize interactions/dynamics.

### Technical Characteristics
- Integration: explicit Euler with exponential damping term.
- Time step: `RATE = 1 / FRAME`, `FRAME = 60`; simulation bound to p5 frame rate.
- Coordinate system: p5 pixel coordinates; masses approximate area-based scaling for blob and radius-based for obstacles.
- Global state: intentionally shared across modules for simplicity; `SoftBody` methods update these globals.

### Assumptions and Current Limitations
- Global mutable state across files; not an ES module system.
- SDF gradient finite-difference epsilon constant; may produce artifacts at very small scales.
- Self-repulsion is only applied on outer rim points and skips immediate neighbors to preserve rim continuity.
- Pressure maintains outer rim area, not full-volume conservation; inner rim is decoupled except via springs.
- No continuous collision detection; interactions are force-based rather than positional constraints.

### How to Run
Open `drip2_modular.html` in a modern desktop browser with network access to the p5.js CDN. Use the on-canvas UI to adjust parameters.

### Extension Points
- Replace explicit Euler with semi-implicit or Verlet integration for stability at higher stiffness.
- Generalize obstacles beyond circles; keep SDF framework and supply new SDFs.
- Modularize globals into a state container or classes for improved reusability.
- Persist/restore UI settings; add presets for material behaviors.



### Physics formulas
- Gravity
  - Point acceleration: \(\mathbf{a}_g = (0,\; g_0\, s_g / s_d)\) where `g0 = BASE_GRAVITY`, `s_g` is the gravity slider value, `s_d` is density scale.
- Hooke spring (between points i and j)
  - Rest length \(L_0\) from initialization, current \(L = \lVert\mathbf{x}_i - \mathbf{x}_j\rVert\), unit \(\mathbf{u} = (\mathbf{x}_i - \mathbf{x}_j)/\max(L,\varepsilon)\).
  - Acceleration contribution (per code’s normalization by \(L_0\)): \(\mathbf{a}_i \mathrel{+}= -k\, \frac{L - L_0}{L_0}\, \mathbf{u}\), \(\mathbf{a}_j \mathrel{-}= -k\, \frac{L - L_0}{L_0}\, \mathbf{u}\).
- Pressure (outer rim area preservation)
  - Polygon area \(A\), rest area \(A_0\), relative error \(r = (A_0 - A)/A_0\).
  - Pressure scalar: \(p = k_p\, s_d\, r\) with `k_p = PRESSURE_K` (slightly higher on compression), sign aligns with outward normal.
  - For each outer edge \(e = (\mathbf{a},\mathbf{b})\), length \(\ell_e\), outward unit normal \(\mathbf{n}_e\): edge force magnitude \(m = \min(|p|\, \ell_e,\; \text{MAX\_PRESSURE\_FORCE})\), vector \(\mathbf{F}_e = m\, \operatorname{sign}(p)\, \mathbf{n}_e\). Apply \(\tfrac{1}{2}\mathbf{F}_e\) to each endpoint.
- Rim self-repulsion (outer rim only)
  - For pair distance \(d\) within radius \(r\): overlap \(o = \max\{0,\; 1 - d/r\}\), direction \(\mathbf{u}\) from a→b.
  - Force: \(\mathbf{F} = \min(k_{rep}\, o,\; \text{MAX\_EXTRA\_FORCE})\, \mathbf{u}\); equal and opposite on the pair.
- Bending (positional Laplacian)
  - For rim vertex \(i\): \(\mathbf{F}_i = \operatorname{clamp}\big(k_b\, (\mathbf{x}_{i-1} + \mathbf{x}_{i+1} - 2\mathbf{x}_i),\; \lVert\cdot\rVert \le \text{MAX\_EXTRA\_FORCE}\big)\).
- Viscous bending (velocity Laplacian)
  - \(\mathbf{v}_i \leftarrow \mathbf{v}_i + \nu\, (\mathbf{v}_{i-1} + \mathbf{v}_{i+1} - 2\mathbf{v}_i)\, \Delta t\).
- SDF obstacle repulsion
  - Signed distance \(d = \text{sdf}(\mathbf{x})\), unit normal \(\hat{\mathbf{n}} \approx \nabla d / \max(\lVert\nabla d\rVert,\varepsilon)\) via finite differences.
  - Scale \(s = \min\{ e^{\beta (-d)},\; s_{max}\}\) with \(\beta = 30\), \(s_{max} = 1000\).
  - Acceleration: \(\mathbf{a}_{sdf} = s\, \hat{\mathbf{n}}\).
- Tangential friction near obstacles (points)
  - For nearest obstacle, if gap \(d < \text{CONTACT\_BAND}\): normal \(\hat{\mathbf{n}}\), tangent \(\hat{\mathbf{t}}\) (perp to \(\hat{\mathbf{n}}\)); tangential speed \(v_t = \mathbf{v}\cdot\hat{\mathbf{t}}\).
  - Proximity factor \(q = 1 - \max(0,d)/\text{CONTACT\_BAND}\).
  - Accel: \(\mathbf{a} \mathrel{+}= \operatorname{clip}(-\mu\, v_t\, q,\; |\cdot| \le 0.4\, \text{MAX\_EXTRA\_FORCE})\, \hat{\mathbf{t}}\).
- Obstacle reaction and dynamics
  - Aggregate on obstacle: \(\mathbf{F}_o \mathrel{+}= \operatorname{clip}(c_f\, M_{blob}\, \mu\, v_t\, q,\; |\cdot| \le \text{MAX\_EXTRA\_FORCE})\, (-\hat{\mathbf{t}})\), `c_f = CONTACT_FORCE_FACTOR`.
  - Integrate: \(\mathbf{v}_o \leftarrow (\mathbf{v}_o + \mathbf{a}_o\, \Delta t)\, e^{-c\, \Delta t}\), \(\mathbf{x}_o \leftarrow \mathbf{x}_o + \mathbf{v}_o\, \Delta t\), with `c = OBSTACLE_DAMPING`.
- Mouse drag spring/damper (distributed)
  - For share \(s' = s/\sum s\): \(\mathbf{F} = \operatorname{clip}\big( K\, s'\, (\mathbf{x}_m - \mathbf{x}) - D\, s'\, \mathbf{v},\; \lVert\mathbf{F}\rVert \le M\, s'\big)\), `K = MOUSE_SPRING_K`, `D = MOUSE_SPRING_DAMP * DRAG_DAMP_MULTIPLIER`, `M = MOUSE_MAX_FORCE`.
- Point integration with damping
  - \(\mathbf{v} \leftarrow (\mathbf{v} + \mathbf{a}\, \Delta t)\, e^{-d\, \Delta t}\), \(\mathbf{x} \leftarrow \mathbf{x} + \mathbf{v}\, \Delta t\), with damping `d` and \(\Delta t = \text{RATE}\).
- Outer rim polygon area (shoelace)
  - \(A = \tfrac{1}{2}\sum_i (x_i y_{i+1} - x_{i+1} y_i)\).

### Attribution
Fork of "Soft Body Physics" by Lab Rat  
`https://openprocessing.org/sketch/2112774`  
`https://openprocessing.org/user/360958/#sketches`  
License: `https://creativecommons.org/licenses/by-nc-sa/3.0/`

