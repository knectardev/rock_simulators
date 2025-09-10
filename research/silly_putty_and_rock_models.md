### Purpose

Structured notes derived from the two project references in `research/`:
- `SillyPuttyAJP.pdf` (American Journal of Physics article on Silly Putty mechanics)
- `Advances in Materials Science and Engineering - 2016 - Guo - The Static and Dynamic Mechanical Properties of.pdf`

These notes collect commonly used constitutive models, key equations, and assumptions relevant to putty/soft polymers and rock-like materials for use in the simulators in this repo.

### High-level behavior

- **Viscoelastic response**: time-dependent blend of elasticity and viscosity; rate- and history-dependent.
- **Regime dependence**:
  - Low strain rate: flows/creeps like a very viscous fluid (dominant viscous response).
  - Intermediate rate: strong viscoelasticity; spreading/flattening on impact.
  - High rate: elastic/brittle-like response; rebound or fragmentation possible.

### Constitutive building blocks

- **Maxwell (spring+dashpot in series)**
  - Stress–strain relation (1D): \(\dot{\varepsilon} = \tfrac{\sigma}{\eta} + \tfrac{1}{E}\,\dot{\sigma}\)
  - Captures stress relaxation; unbounded creep.

- **Kelvin–Voigt (spring+dashpot in parallel)**
  - \(\sigma = E\,\varepsilon + \eta\,\dot{\varepsilon}\)
  - Captures bounded creep; no stress relaxation.

- **Standard Linear Solid (Zener)**
  - Relaxation modulus: \(G(t) = G_{\infty} + (G_{0} - G_{\infty}) e^{-t/\tau}\)
  - Creep compliance: \(J(t) = \tfrac{1}{E_{1}} + \tfrac{1}{E_{2}}\bigl(1 - e^{-t/\tau}\bigr)\) (bounded creep)

- **Burgers (Maxwell in series with Kelvin–Voigt)** — useful for Silly Putty-like creep
  - Creep compliance: \(J(t) = \tfrac{1}{E_{1}} + \tfrac{t}{\eta_{1}} + \tfrac{1}{E_{2}}\bigl(1 - e^{-t/\tau}\bigr)\), with \(\tau = \tfrac{\eta_{2}}{E_{2}}\)
  - Captures instantaneous elastic strain, delayed elastic strain, and viscous flow.

- **Generalized Maxwell (Prony series)**
  - \(G(t) = G_{\infty} + \sum_{i} G_{i}\, e^{-t/\tau_{i}}\)
  - Used to fit broadband relaxation behavior and DMA data.

- **Oldroyd‑B (polymeric/viscoelastic fluids)**
  - Momentum: \(\rho\,\dot{\mathbf{v}} = \nabla\!\cdot\!\boldsymbol{\sigma} + \rho\,\mathbf{g}\)
  - Decomposition: \(\boldsymbol{\sigma} = -p\,\mathbf{I} + 2\eta_{s}\,\mathbf{D} + \boldsymbol{\tau}\)
  - Polymer stress: \(\boldsymbol{\tau} + \lambda_{1}\,\overset{\nabla}{\boldsymbol{\tau}} = 2\eta_{p}\,(\mathbf{D} + \lambda_{2}\,\overset{\nabla}{\mathbf{D}})\)
  - \(\mathbf{D} = \tfrac{1}{2}(\nabla\mathbf{v} + (\nabla\mathbf{v})^{T})\); \(\overset{\nabla}{(\cdot)}\) is the upper‑convected derivative.

### Rheological measures

- **Relaxation modulus and creep compliance**: \(G(t)\), \(J(t)\) identify time response.
- **DMA (oscillatory)**: \(\sigma(t)=\sigma_{0}\sin\omega t\), \(\varepsilon(t)=\varepsilon_{0}\sin(\omega t+\delta)\)
  - Storage modulus: \(E'(\omega)=\tfrac{\sigma_{0}}{\varepsilon_{0}}\cos\delta\)
  - Loss modulus: \(E''(\omega)=\tfrac{\sigma_{0}}{\varepsilon_{0}}\sin\delta\)
  - Loss tangent: \(\tan\delta = E''/E'\)
- **Time–rate scales**: Deborah number \(\mathrm{De}=\lambda/T_{\text{proc}}\), Weissenberg \(\mathrm{Wi}=\lambda\,\dot{\gamma}\)

### Gravity‑driven creep of a resting blob

- Approximate stress scale from self‑weight: \(\sigma_{0} \approx \rho g h\)
- For a constant stress period, strain evolution via \(\varepsilon(t)=\sigma_{0} J(t)\) (choose \(J\) from SLS/Burgers).
- Long‑time behavior dominated by viscous terms (thickness decreases; footprint grows to conserve volume).

### Impact and spreading (1–10 m/s)

- Governing equations: Navier–Stokes with chosen viscoelastic model (e.g., Oldroyd‑B or generalized Maxwell viscosity in a continuum solver).
- Regimes:
  - ~1 m/s: viscous dissipation dominates; large spreading, minimal rebound.
  - ~10 m/s: elastic response and inertia dominate; rebound or fragmentation possible depending on rate‑dependent toughness.
- Numerical notes: use stable stress update with objective rate; CFL limits from wave speed and viscosity; surface tension may matter for smaller blobs.

### Rock and rate‑dependent strength (Guo 2016 context)

- **Static vs dynamic properties**: compressive/tensile strength, modulus, and failure strain increase with strain rate (Dynamic Increase Factors, DIF).
- **Constitutive choices for rock**:
  - Elastic + viscoelastic (creep) for long‑term deformation.
  - Elastic‑plastic with pressure dependence (e.g., Mohr–Coulomb or Drucker–Prager) for failure envelopes.
  - Visco‑elasto‑plastic coupling for rate sensitivity.
- **Testing modalities referenced**: quasi‑static compression, splitting tensile; dynamic (e.g., SHPB) for high strain rates.
- **Calibration outputs**: rate‑dependent modulus and strength curves; fracture energy or damage parameters vs strain rate.

### Parameter identification workflow

1) From creep tests (putty/soft polymer): fit Burgers \((E_{1},E_{2},\eta_{1},\eta_{2})\) to \(\varepsilon(t)\) under constant \(\sigma_{0}\).
2) From stress‑relaxation: fit SLS/Prony series to \(\sigma(t)\) at fixed \(\varepsilon\).
3) From DMA: fit \(E'(\omega),E''(\omega)\) to a Prony series mapped to time constants \(\tau_{i}\).
4) From impact/spread tests: tune \(\eta_{0}\), relaxation times, and any surface tension to match spread radius/time.
5) For rocks (Guo 2016): construct DIF curves and fit pressure‑dependent yield/damage parameters vs \(\dot{\varepsilon}\).

### Simulation guidance for this repo

- **`fem_blob.html` / `sonnet-blob.html`**: use Burgers or generalized Maxwell for material; ensure stable explicit/implicit integration (objective rate for stress, e.g., Jaumann for small strains).
- **Spreading/impact**: start with gravity + viscosity only, then enable elastic and relaxation terms; validate against simple benchmarks (Maxwell relaxation, Burgers creep) before full impact runs.
- **Rock scenarios**: start elastic–plastic (Mohr–Coulomb/Drucker–Prager); add rate effects via viscoelastic branch or DIF‑scaled strengths.

### Assumptions and limitations

- Small‑to‑moderate strain formulas shown; large‑deformation formulations require proper objective rates and finite‑strain kinematics.
- Parameters are material‑, temperature‑, and rate‑dependent; use experiment‑specific fits.
- Fragmentation requires damage/fracture modeling beyond linear viscoelasticity.

### Citations (by filename in `research/`)

- Silly Putty AJP article: `SillyPuttyAJP.pdf`
- Guo 2016: `Advances in Materials Science and Engineering - 2016 - Guo - The Static and Dynamic Mechanical Properties of.pdf`

Note: Page‑specific citations can be added after targeted text extraction; request them if needed.


