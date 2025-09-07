import { VoronoiSimulator, BASELINE_RADIUS_GLOBAL_SCALE } from './sim/VoronoiSimulator.js';
import { MineralTypeRegistry } from './sim/minerals/MineralTypeRegistry.js';

const FRAME_WIDTH = 1000;
const FRAME_HEIGHT = 800;
// Baseline calibration seed count used to derive dynamic density (not a cap)
const BASE_NUM_POINTS = 120;
// Reference baseline scale used only for calibration so that changing the
// runtime baseline scale actually affects density.
const BASELINE_SCALE_REFERENCE = 1;
const SIZE_GAIN_EXPONENT = 1.8; // must mirror simulator mapping

function mountLegend(container, registry) {
  container.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = 'Mineral Types';
  container.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'legend-list';
  const controlsByMineral = new Map();
  registry.getAll().forEach((type) => {
    const li = document.createElement('li');
    li.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = type.defaultColor;
    const label = document.createElement('span');
    label.textContent = type.label;
    li.appendChild(swatch);
    li.appendChild(label);
    list.appendChild(li);

    // Per-mineral controls
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.style.margin = '6px 0 10px 26px';

    const aspectRow = document.createElement('label');
    aspectRow.style.display = 'flex';
    aspectRow.style.alignItems = 'center';
    aspectRow.style.gap = '8px';
    const aspectText = document.createElement('span');
    aspectText.textContent = 'Aspect';
    const aspectInput = document.createElement('input');
    aspectInput.type = 'range';
    // Wider aspect range for mica
    if (type.id === 'mica') {
      aspectInput.min = '1';
      aspectInput.max = '100';
    } else {
      aspectInput.min = '0.5';
      aspectInput.max = '10';
    }
    aspectInput.step = '0.1';
    aspectInput.value = String(type.aspectRatioScale);
    const aspectTip = 'Per-mineral anisotropy (aspect ratio). >1 elongates along each grain\'s orientation; <1 squashes across. Combined with global Aniso and Lineation.';
    aspectText.title = aspectTip;
    aspectInput.title = aspectTip;
    const aspectVal = document.createElement('span');
    aspectVal.style.width = '32px';
    aspectVal.textContent = aspectInput.value;
    aspectRow.appendChild(aspectText);
    aspectRow.appendChild(aspectInput);
    aspectRow.appendChild(aspectVal);

    const sizeRow = document.createElement('label');
    sizeRow.style.display = 'flex';
    sizeRow.style.alignItems = 'center';
    sizeRow.style.gap = '8px';
    const sizeText = document.createElement('span');
    sizeText.textContent = 'Size';
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.min = '0.1';
    sizeInput.max = '10';
    sizeInput.step = '0.1';
    sizeInput.value = String(type.sizeScale);
    const sizeTip = 'Per-mineral size scale (area proxy). Increases/decreases only this mineral\'s typical grain size; total cell count adjusts separately.';
    sizeText.title = sizeTip;
    sizeInput.title = sizeTip;
    const sizeVal = document.createElement('span');
    sizeVal.style.width = '32px';
    sizeVal.textContent = sizeInput.value;
    sizeRow.appendChild(sizeText);
    sizeRow.appendChild(sizeInput);
    sizeRow.appendChild(sizeVal);

    // Share slider (target percentage of total cells)
    const shareRow = document.createElement('label');
    shareRow.style.display = 'flex';
    shareRow.style.alignItems = 'center';
    shareRow.style.gap = '8px';
    const shareText = document.createElement('span');
    shareText.textContent = 'Share';
    const shareInput = document.createElement('input');
    shareInput.type = 'range';
    shareInput.min = '5';
    shareInput.max = '50';
    shareInput.step = '1';
    shareInput.value = '33';
    const shareTip = 'Target percentage of total cells for this mineral. Reassigns identities without resetting layout; always normalized to 100% overall.';
    shareText.title = shareTip;
    shareInput.title = shareTip;
    const shareVal = document.createElement('span');
    shareVal.style.width = '32px';
    shareVal.textContent = shareInput.value + '%';
    shareRow.appendChild(shareText);
    shareRow.appendChild(shareInput);
    shareRow.appendChild(shareVal);

    wrapper.appendChild(aspectRow);
    wrapper.appendChild(sizeRow);
    wrapper.appendChild(shareRow);
    list.appendChild(wrapper);

    controlsByMineral.set(type.id, {
      aspectInput,
      sizeInput,
      shareInput,
      updateLabels: () => {
        aspectVal.textContent = aspectInput.value;
        sizeVal.textContent = sizeInput.value;
        shareVal.textContent = shareInput.value + '%';
      },
    });
  });
  container.appendChild(list);

  const controls = document.createElement('div');
  controls.className = 'legend-controls';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'toggle-labels';
  checkbox.checked = true;
  const lbl = document.createElement('label');
  lbl.setAttribute('for', 'toggle-labels');
  lbl.textContent = 'Show neighbor counts';
  controls.appendChild(checkbox);
  controls.appendChild(lbl);
  // Growth strength control
  const growthWrap = document.createElement('div');
  growthWrap.style.display = 'flex';
  growthWrap.style.alignItems = 'center';
  growthWrap.style.gap = '8px';
  growthWrap.style.marginLeft = '12px';
  const growthText = document.createElement('span');
  growthText.textContent = 'Growth';
  const growthInput = document.createElement('input');
  growthInput.type = 'range';
  growthInput.min = '0.5';
  growthInput.max = '3';
  growthInput.step = '0.1';
  growthInput.value = '1';
  // Tooltip: explain Growth
  const growthTip = 'Global gain on size-driven motion. Higher values make grains claim or yield space more aggressively based on per-mineral Size; lower values dampen movement. Does not change Size values or cell count.';
  growthText.title = growthTip;
  growthInput.title = growthTip;
  const growthVal = document.createElement('span');
  growthVal.style.width = '32px';
  growthVal.textContent = growthInput.value;
  growthWrap.appendChild(growthText);
  growthWrap.appendChild(growthInput);
  growthWrap.appendChild(growthVal);
  controls.appendChild(growthWrap);

  // Anisotropy strength control
  const anisoWrap = document.createElement('div');
  anisoWrap.style.display = 'flex';
  anisoWrap.style.alignItems = 'center';
  anisoWrap.style.gap = '8px';
  anisoWrap.style.marginLeft = '12px';
  const anisoText = document.createElement('span');
  anisoText.textContent = 'Aniso';
  const anisoInput = document.createElement('input');
  anisoInput.type = 'range';
  anisoInput.min = '0';
  anisoInput.max = '3';
  anisoInput.step = '0.1';
  anisoInput.value = '1';
  // Tooltip: explain Aniso
  const anisoTip = 'Global gain on anisotropy. Amplifies elongation along each grain\'s major axis (and any lineation bias). 0 disables anisotropy influence; does not change total area.';
  anisoText.title = anisoTip;
  anisoInput.title = anisoTip;
  const anisoVal = document.createElement('span');
  anisoVal.style.width = '32px';
  anisoVal.textContent = anisoInput.value;
  anisoWrap.appendChild(anisoText);
  anisoWrap.appendChild(anisoInput);
  anisoWrap.appendChild(anisoVal);
  controls.appendChild(anisoWrap);

  // Lineation controls (direction dial + strength slider)
  function createDial(initialDeg = 0) {
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    root.setAttribute('viewBox', '0 0 48 48');
    root.setAttribute('width', '48');
    root.setAttribute('height', '48');
    root.style.cursor = 'pointer';
    const cx = 24, cy = 24, r = 18;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx)); circle.setAttribute('cy', String(cy)); circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', '#334155');
    const knob = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    knob.setAttribute('x1', String(cx)); knob.setAttribute('y1', String(cy));
    knob.setAttribute('stroke', '#cbd5e1'); knob.setAttribute('stroke-width', '3');
    root.appendChild(circle); root.appendChild(knob);
    let deg = initialDeg;
    function render() {
      const rad = (deg * Math.PI) / 180;
      const x2 = cx + r * Math.cos(rad);
      const y2 = cy + r * Math.sin(rad);
      knob.setAttribute('x2', String(x2)); knob.setAttribute('y2', String(y2));
    }
    function setValue(v) { deg = (Number(v) || 0) % 360; if (deg < 0) deg += 360; render(); changeCb && changeCb(deg); }
    function getValue() { return deg; }
    let changeCb = null;
    function onChange(cb) { changeCb = cb; }
    function handleEvt(e) {
      const rect = root.getBoundingClientRect();
      const px = e.clientX - rect.left; const py = e.clientY - rect.top;
      const dx = px - cx; const dy = py - cy;
      let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a < 0) a += 360; setValue(a);
    }
    let dragging = false;
    root.addEventListener('mousedown', (e) => { dragging = true; handleEvt(e); });
    window.addEventListener('mousemove', (e) => { if (dragging) handleEvt(e); });
    window.addEventListener('mouseup', () => { dragging = false; });
    render();
    return { root, getValue, setValue, onChange };
  }

  const lineWrap = document.createElement('div');
  lineWrap.style.display = 'flex';
  lineWrap.style.alignItems = 'center';
  lineWrap.style.gap = '10px';
  lineWrap.style.marginLeft = '12px';
  const lineText = document.createElement('span');
  lineText.textContent = 'Lineation';
  const dialComp = createDial(0);
  const dialVal = document.createElement('span');
  dialVal.style.width = '28px';
  dialVal.textContent = '0°';
  const lineStrength = document.createElement('input');
  lineStrength.type = 'range';
  lineStrength.min = '0';
  lineStrength.max = '1';
  lineStrength.step = '0.05';
  lineStrength.value = '0';
  const lineStrengthVal = document.createElement('span');
  lineStrengthVal.style.width = '28px';
  lineStrengthVal.textContent = lineStrength.value;
  lineWrap.appendChild(lineText);
  lineWrap.appendChild(dialComp.root);
  lineWrap.appendChild(dialVal);
  lineWrap.appendChild(lineStrength);
  lineWrap.appendChild(lineStrengthVal);
  controls.appendChild(lineWrap);
  container.appendChild(controls);

  const meta = document.createElement('div');
  meta.className = 'meta';
  function updateMeta(count) {
    meta.textContent = `Frame: ${FRAME_WIDTH}×${FRAME_HEIGHT}, Cells: ${count}`;
  }
  updateMeta(BASE_NUM_POINTS);
  container.appendChild(meta);

  // Randomize button
  const randomizeBtn = document.createElement('button');
  randomizeBtn.textContent = 'Randomize positions';
  randomizeBtn.style.marginLeft = '12px';
  randomizeBtn.style.marginTop = '6px';
  randomizeBtn.className = 'btn';
  container.appendChild(randomizeBtn);

  return { checkbox, controlsByMineral, growthInput, growthVal, anisoInput, anisoVal, dialComp, dialVal, lineStrength, lineStrengthVal, randomizeBtn, updateMeta };
}

function main() {
  const frameContainer = document.getElementById('frame-container');
  const zoomIndicator = document.getElementById('zoom-indicator');
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const zoomResetBtn = document.getElementById('zoom-reset');
  const chartContainer = document.getElementById('chart');
  const legendContainer = document.getElementById('legend');

  const registry = MineralTypeRegistry.createDefault();
  const { checkbox, controlsByMineral, growthInput, growthVal, anisoInput, anisoVal, dialComp, dialVal, lineStrength, lineStrengthVal, randomizeBtn, updateMeta } = mountLegend(legendContainer, registry);
  // Ensure slider thumbs remain interactive even when an overlaid tooltip might exist
  growthInput.style.pointerEvents = 'auto';
  anisoInput.style.pointerEvents = 'auto';

  // Helper: compute desired total seed count from current per-mineral sizes and shares
  function computeDesiredSeedCount() {
    const types = registry.getAll();
    // Area proxy is proportional to r^2; use mean of baseline range scaled by UI size
    let areaProxy = 0;
    const equalFrac = types.length ? 1 / types.length : 1;
    types.forEach((t) => {
      const meanR = ((t.baselineRadiusRange[0] + t.baselineRadiusRange[1]) * 0.5) * BASELINE_RADIUS_GLOBAL_SCALE;
      // Density ignores UI shares; only baseline radii determine total count.
      areaProxy += equalFrac * (meanR * meanR);
    });
    if (areaProxy <= 0) return 1;
    // Calibrate coefficient to match BASE_NUM_POINTS at initial UI defaults
    // We compute once lazily on first call using equal shares and sizeScale=1
    return Math.max(1, Math.round((FRAME_WIDTH * FRAME_HEIGHT) / (window.__CELL_AREA_COEFF__ * areaProxy)));
  }

  // Initialize calibration coefficient so that with default controls we get BASE_NUM_POINTS
  if (!window.__CELL_AREA_COEFF__) {
    const types = registry.getAll();
    // default equal shares based on current UI default (roughly thirds)
    const defaultShares = new Map();
    types.forEach((t) => defaultShares.set(t.id, 100 / types.length));
    // set temporary sizeScale = 1
    types.forEach((t) => { t.sizeScale = 1; });
    let areaProxyDefault = 0;
    types.forEach((t) => {
      const shareFrac = 1 / types.length;
      // Use reference scale (1) here so runtime baseline scale changes
      // actually modify the resulting density.
      const meanR = ((t.baselineRadiusRange[0] + t.baselineRadiusRange[1]) * 0.5) * BASELINE_SCALE_REFERENCE;
      const size = 1 ** SIZE_GAIN_EXPONENT;
      areaProxyDefault += shareFrac * (meanR * meanR) * size;
    });
    const frameArea = FRAME_WIDTH * FRAME_HEIGHT;
    window.__CELL_AREA_COEFF__ = frameArea / (BASE_NUM_POINTS * areaProxyDefault);
  }

  // Build initial shares map from default UI controls
  const initShares = new Map();
  registry.getAll().forEach((t) => {
    const controls = controlsByMineral.get(t.id);
    const v = controls ? Number(controls.shareInput.value) : 100 / registry.getAll().length;
    initShares.set(t.id, v);
  });
  const desiredSeeds = computeDesiredSeedCount();
  let sim = new VoronoiSimulator({
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    numSeeds: desiredSeeds,
    mineralRegistry: registry,
  });

  // Attach a small debug log panel in lower-right of legend
  const logPanel = document.createElement('div');
  logPanel.style.fontSize = '11px';
  logPanel.style.lineHeight = '1.3';
  logPanel.style.height = '96px';
  logPanel.style.overflowY = 'auto';
  logPanel.style.overflowX = 'hidden';
  logPanel.style.wordBreak = 'break-all';
  // Fix width so content never expands the legend
  logPanel.style.width = '260px';
  logPanel.style.maxWidth = '260px';
  logPanel.style.boxSizing = 'border-box';
  logPanel.style.flex = '0 0 96px';
  logPanel.style.flexShrink = '0';
  logPanel.style.margin = '8px 12px 0 12px';
  logPanel.style.padding = '6px';
  logPanel.style.background = 'rgba(15,23,42,0.6)';
  logPanel.style.border = '1px solid #334155';
  logPanel.style.borderRadius = '6px';
  logPanel.textContent = 'Logs…';
  legendContainer.appendChild(logPanel);

  function logToPanel(rec) {
    try {
      const line = `VORO ${JSON.stringify(rec)}`;
      const div = document.createElement('div');
      div.style.whiteSpace = 'pre-wrap';
      div.textContent = line;
      logPanel.appendChild(div);
      logPanel.scrollTop = logPanel.scrollHeight;
    } catch {}
  }
  sim.setLogger((rec) => logToPanel(rec));

  let svg = sim.renderSVG();
  frameContainer.innerHTML = '';
  frameContainer.appendChild(svg);
  updateMeta(sim.numSeeds);
  function updateZoomIndicator() {
    const z = (sim.getZoomScale ? sim.getZoomScale() : 1) || 1;
    const pct = (z * 100).toFixed(0);
    if (zoomIndicator) zoomIndicator.textContent = `Zoom: ${z.toFixed(2)}× (${pct}%)`;
  }
  updateZoomIndicator();
  // Tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'cell-tooltip';
  tooltip.style.display = 'none';
  tooltip.style.pointerEvents = 'none';
  document.body.appendChild(tooltip);

  // Charts setup
  chartContainer.innerHTML = '';
  const titleArea = document.createElement('div');
  titleArea.className = 'chart-title';
  titleArea.textContent = 'Coverage by area';
  chartContainer.appendChild(titleArea);
  const chartSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chartSvg.setAttribute('viewBox', '0 0 200 200');
  chartSvg.setAttribute('width', '196');
  chartSvg.setAttribute('height', '196');
  chartSvg.classList.add('chart-svg');
  chartContainer.appendChild(chartSvg);

  const titleCount = document.createElement('div');
  titleCount.className = 'chart-title';
  titleCount.textContent = 'Coverage by count';
  chartContainer.appendChild(titleCount);
  const chartSvgCount = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chartSvgCount.setAttribute('viewBox', '0 0 200 200');
  chartSvgCount.setAttribute('width', '196');
  chartSvgCount.setAttribute('height', '196');
  chartSvgCount.classList.add('chart-svg');
  chartContainer.appendChild(chartSvgCount);

  function computeAreasByMineral() {
    // polygon area via shoelace
    function polygonArea(points) {
      let sum = 0;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        sum += x1 * y2 - x2 * y1;
      }
      return Math.abs(sum) * 0.5;
    }
    const map = new Map();
    for (const cell of sim.cells) {
      const id = cell.mineralType.id;
      const a = polygonArea(cell.polygon);
      map.set(id, (map.get(id) || 0) + a);
    }
    return map; // id -> area
  }

  function renderPie() {
    const areas = computeAreasByMineral();
    const total = Array.from(areas.values()).reduce((a, b) => a + b, 0) || 1;
    chartSvg.innerHTML = '';
    let startAngle = -Math.PI / 2; // start at top
    const center = 100;
    const radius = 90;
    const types = registry.getAll();
    for (const type of types) {
      const value = areas.get(type.id) || 0;
      const slice = (value / total) * Math.PI * 2;
      const endAngle = startAngle + slice;
      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);
      const largeArc = slice > Math.PI ? 1 : 0;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      path.setAttribute('d', d);
      path.setAttribute('fill', type.defaultColor);
      path.setAttribute('stroke', '#0f172a');
      path.setAttribute('stroke-width', '1');
      chartSvg.appendChild(path);

      // percentage label at the wedge centroid
      const mid = (startAngle + endAngle) / 2;
      const labelR = radius * 0.6;
      const lx = center + labelR * Math.cos(mid);
      const ly = center + labelR * Math.sin(mid);
      const pct = ((value / total) * 100).toFixed(0);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(lx));
      text.setAttribute('y', String(ly));
      text.setAttribute('fill', '#000');
      text.setAttribute('font-size', '12');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.textContent = `${pct}%`;
      chartSvg.appendChild(text);
      startAngle = endAngle;
    }

    // Count bar chart (absolute counts of all grains, no visibility threshold)
    const counts = new Map();
    for (const cell of sim.cells) {
      const id = cell.mineralType.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    chartSvgCount.innerHTML = '';
    const w = 196;
    const h = 196;
    const margin = { left: 16, right: 8, top: 16, bottom: 24 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;
    // axis line
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', String(margin.left));
    axis.setAttribute('y1', String(margin.top + innerH));
    axis.setAttribute('x2', String(margin.left + innerW));
    axis.setAttribute('y2', String(margin.top + innerH));
    axis.setAttribute('stroke', '#0f172a');
    chartSvgCount.appendChild(axis);

    const maxCount = Math.max(1, ...types.map((t) => counts.get(t.id) || 0));
    const totalCount = types.reduce((sum, t) => sum + (counts.get(t.id) || 0), 0);
    const slot = innerW / types.length;
    const barW = Math.max(10, slot * 0.6);
    types.forEach((type, i) => {
      const c = counts.get(type.id) || 0;
      const barH = (c / maxCount) * innerH;
      const x = margin.left + i * slot + (slot - barW) / 2;
      const y = margin.top + innerH - barH;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(barW));
      rect.setAttribute('height', String(barH));
      rect.setAttribute('fill', type.defaultColor);
      rect.setAttribute('stroke', '#0f172a');
      rect.setAttribute('stroke-width', '1');
      chartSvgCount.appendChild(rect);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x + barW / 2));
      label.setAttribute('y', String(y - 4));
      label.setAttribute('fill', '#fff');
      label.setAttribute('font-size', '12');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = String(c);
      chartSvgCount.appendChild(label);

      // Percentage label near the bottom of the bar (black, like pie chart labels)
      const pct = totalCount > 0 ? Math.round((c / totalCount) * 100) : 0;
      const pctText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const bottomY = margin.top + innerH - 6; // a few px above axis
      pctText.setAttribute('x', String(x + barW / 2));
      pctText.setAttribute('y', String(bottomY));
      pctText.setAttribute('fill', '#000');
      pctText.setAttribute('font-size', '12');
      pctText.setAttribute('text-anchor', 'middle');
      pctText.setAttribute('dominant-baseline', 'middle');
      pctText.textContent = `${pct}%`;
      chartSvgCount.appendChild(pctText);
    });
  }
  renderPie();

  function applyToggle() {
    if (checkbox.checked) {
      svg.classList.remove('hide-labels');
    } else {
      svg.classList.add('hide-labels');
    }
  }
  checkbox.addEventListener('change', applyToggle);
  applyToggle();
  // Hide tooltip whenever user moves into the legend area
  legendContainer.addEventListener('mouseenter', () => { tooltip.style.display = 'none'; });
  legendContainer.addEventListener('mousedown', () => { tooltip.style.display = 'none'; });
  legendContainer.style.zIndex = '10';

  // Hover tooltip handlers (delegated on SVG)
  function cellFromEventTarget(t) {
    if (!t) return null;
    if (t.classList && t.classList.contains('cell')) return t;
    return null;
  }
  function getCellAttributes(el) {
    const id = Number(el.getAttribute('data-id'));
    const mineralId = el.getAttribute('data-mineral');
    const cell = sim.cells[id];
    if (!cell) return null;
    const issues = (sim.getIssuesForCell ? sim.getIssuesForCell(id) : []) || [];
    return {
      id: cell.id,
      mineral: mineralId,
      centroid: cell.centroid.map((n) => Math.round(n)).join(', '),
      aspectRatio: cell.aspectRatio.toFixed(2),
      orientationDeg: Math.round(cell.orientationDeg),
      neighbors: cell.neighborIdsCCWFromTop.length,
      issues,
    };
  }
  function formatTooltip(attrs) {
    const lines = [
      `Cell ${attrs.id}`,
      `Mineral: ${attrs.mineral}`,
      `Centroid: ${attrs.centroid}`,
      `Aspect: ${attrs.aspectRatio}`,
      `Orientation: ${attrs.orientationDeg}°`,
      `Neighbors: ${attrs.neighbors}`,
    ];
    if (Array.isArray(attrs.issues) && attrs.issues.length) {
      lines.push(`Issues: ${attrs.issues.join(', ')}`);
    }
    return lines.join('\n');
  }
  function attachTooltipListeners(currentSvg) {
    let hoverEl = null;
    function onMove(e) {
      if (!hoverEl) return;
      tooltip.style.left = `${e.pageX + 12}px`;
      tooltip.style.top = `${e.pageY + 12}px`;
    }
    function onOver(e) {
      const el = cellFromEventTarget(e.target);
      if (!el) return;
      hoverEl = el;
      const attrs = getCellAttributes(el);
      if (!attrs) return;
      tooltip.textContent = formatTooltip(attrs);
      tooltip.style.display = 'block';
      onMove(e);
    }
    function onOut(e) {
      // Always hide tooltip on mouseout of the svg regardless of target
      if (!currentSvg.contains(e.relatedTarget)) {
        hoverEl = null;
        tooltip.style.display = 'none';
      }
    }
    currentSvg.addEventListener('mousemove', onMove);
    currentSvg.addEventListener('mouseover', onOver);
    currentSvg.addEventListener('mouseout', onOut);
    return () => {
      currentSvg.removeEventListener('mousemove', onMove);
      currentSvg.removeEventListener('mouseover', onOver);
      currentSvg.removeEventListener('mouseout', onOut);
    };
  }
  let detachTooltip = attachTooltipListeners(svg);

  // Mouse wheel zoom: adjust simulator zoom scale and re-render.
  // Clamp to [0.5, 10]. Use exponential wheel mapping and rAF throttle.
  let zoomScheduled = false;
  let targetZoom = sim.getZoomScale ? sim.getZoomScale() : 1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 10;
  const ZOOM_STEP = 0.5;
  // Pan drag state for cursor management
  let isDraggingPan = false;
  function updateCursor() {
    const z = sim.getZoomScale ? sim.getZoomScale() : 1;
    if (z > 1) {
      frameContainer.style.cursor = isDraggingPan ? 'grabbing' : 'grab';
    } else {
      frameContainer.style.cursor = 'default';
    }
  }
  function quantizeZoom(z) {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const q = Math.round(clamped / ZOOM_STEP) * ZOOM_STEP;
    // Avoid FP drift like 1.499999
    return Number(q.toFixed(2));
  }
  function applyZoom() {
    zoomScheduled = false;
    if (typeof sim.setZoomScale === 'function') sim.setZoomScale(targetZoom);
    // Compute; cropping via SVG viewBox happens in render
    const updated = sim.renderFromPoints(sim.currentPoints);
    if (!checkbox.checked) updated.classList.add('hide-labels');
    frameContainer.replaceChild(updated, svg);
    if (detachTooltip) detachTooltip();
    detachTooltip = attachTooltipListeners(updated);
    svg = updated;
    renderPie();
    updateZoomIndicator();
    updateCursor();
  }
  function setZoom(z) {
    targetZoom = quantizeZoom(z);
    applyZoom();
  }
  function onWheelZoom(e) {
    e.preventDefault();
    const delta = e.deltaY; // positive is wheel down (zoom out)
    // Use continuous mapping so both notched wheels and trackpads work reliably
    // Negative delta -> factor > 1 (zoom in), positive -> < 1 (zoom out)
    const strength = e.ctrlKey ? 0.005 : 0.002; // faster when Ctrl is held
    const current = sim.getZoomScale ? sim.getZoomScale() : targetZoom;
    let proposed = current * Math.exp(-delta * strength);
    proposed = quantizeZoom(proposed);
    // Ensure we move at least one step in the intended direction
    if (proposed === current) {
      if (delta < 0) proposed = quantizeZoom(current + ZOOM_STEP);
      else if (delta > 0) proposed = quantizeZoom(current - ZOOM_STEP);
    }
    targetZoom = proposed;
    if (!zoomScheduled) {
      zoomScheduled = true;
      requestAnimationFrame(applyZoom);
    }
  }
  // Attach to the frame container to avoid zooming the whole page
  frameContainer.addEventListener('wheel', onWheelZoom, { passive: false });
  // Pan with mouse drag when zoom > 1×
  (function enablePanning() {
    let startX = 0, startY = 0;
    let startPan = [sim.getPanCenter ? sim.getPanCenter()[0] : FRAME_WIDTH / 2, sim.getPanCenter ? sim.getPanCenter()[1] : FRAME_HEIGHT / 2];
    function onDown(e) {
      // Only pan when zoomed in
      if ((sim.getZoomScale ? sim.getZoomScale() : 1) <= 1) return;
      isDraggingPan = true;
      startX = e.clientX; startY = e.clientY;
      startPan = sim.getPanCenter ? sim.getPanCenter() : [FRAME_WIDTH / 2, FRAME_HEIGHT / 2];
      updateCursor();
      e.preventDefault();
    }
    function onMove(e) {
      if (!isDraggingPan) return;
      const z = sim.getZoomScale ? sim.getZoomScale() : 1;
      const vbW = FRAME_WIDTH / z; const vbH = FRAME_HEIGHT / z;
      const dxPx = e.clientX - startX; const dyPx = e.clientY - startY;
      // Pixels map 1:1 to world units within the current viewBox
      const worldDx = (dxPx / FRAME_WIDTH) * vbW;
      const worldDy = (dyPx / FRAME_HEIGHT) * vbH;
      const nx = startPan[0] - worldDx; // subtract to move content with the cursor
      const ny = startPan[1] - worldDy;
      if (sim.setPanCenter) sim.setPanCenter(nx, ny);
      const updated = sim.renderFromPoints(sim.currentPoints);
      if (!checkbox.checked) updated.classList.add('hide-labels');
      frameContainer.replaceChild(updated, svg);
      if (detachTooltip) detachTooltip();
      detachTooltip = attachTooltipListeners(updated);
      svg = updated;
      renderPie();
      updateZoomIndicator();
    }
    function onUp() { isDraggingPan = false; updateCursor(); }
    frameContainer.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  })();
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom((sim.getZoomScale ? sim.getZoomScale() : targetZoom) + ZOOM_STEP));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom((sim.getZoomScale ? sim.getZoomScale() : targetZoom) - ZOOM_STEP));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => setZoom(1));

  // Hook slider interactions to re-render with visual scaling
  let animId = 0;
  let lastSharesKey = '';
  function reRenderCore() {
    // update per-mineral scales
    registry.getAll().forEach((t) => {
      const controls = controlsByMineral.get(t.id);
      if (!controls) return;
      t.aspectRatioScale = parseFloat(controls.aspectInput.value);
      t.sizeScale = parseFloat(controls.sizeInput.value);
      controls.updateLabels();
    });
    // Apply growth strength
    sim.setGrowthStrength(parseFloat(growthInput.value) || 1);
    growthVal.textContent = growthInput.value;
    sim.setAnisotropyStrength(parseFloat(anisoInput.value) || 1);
    anisoVal.textContent = anisoInput.value;
    const dir = dialComp.getValue();
    const ls = Math.max(0, Math.min(1, parseFloat(lineStrength.value) || 0));
    sim.setLineation(dir, ls);
    dialVal.textContent = `${Math.round(dir)}°`;
    lineStrengthVal.textContent = ls.toFixed(2);
    // Read share targets and redistribute to keep 100%
    const types = registry.getAll();
    const shares = new Map();
    let fixedTotal = 0;
    types.forEach((t) => {
      const controls = controlsByMineral.get(t.id);
      const v = Math.min(50, Math.max(5, parseFloat(controls.shareInput.value)));
      shares.set(t.id, v);
      fixedTotal += v;
    });
    // Normalize to 100% while preserving constraints via proportional scaling
    if (fixedTotal !== 100) {
      const scale = 100 / fixedTotal;
      types.forEach((t) => {
        const v = Math.round(shares.get(t.id) * scale);
        shares.set(t.id, Math.min(50, Math.max(5, v)));
      });
      // second pass to fix rounding drift to 100
      let sum = 0; types.forEach((t) => { sum += shares.get(t.id); });
      // greedily adjust within bounds
      const order = types.map((t) => t.id);
      while (sum !== 100) {
        for (const id of order) {
          if (sum === 100) break;
          const cur = shares.get(id);
          if (sum > 100 && cur > 5) { shares.set(id, cur - 1); sum--; }
          else if (sum < 100 && cur < 50) { shares.set(id, cur + 1); sum++; }
        }
      }
      // Push normalized values back to the sliders so the UI always sums to 100%
      types.forEach((t) => {
        const controls = controlsByMineral.get(t.id);
        if (!controls) return;
        const nv = String(shares.get(t.id));
        if (controls.shareInput.value !== nv) {
          controls.shareInput.value = nv;
          controls.updateLabels();
        }
      });
    }
    // Translate shares into target counts
    // Recalculate desired total seed count from current sizes and shares
    const desired = computeDesiredSeedCount();
    const total = desired;
    const targetCounts = {};
    let assigned = 0;
    types.forEach((t, i) => {
      const pct = shares.get(t.id);
      let cnt = Math.floor((pct / 100) * total);
      // For last mineral, take the remainder to ensure sum==total
      if (i === types.length - 1) cnt = total - assigned;
      targetCounts[t.id] = cnt;
      assigned += cnt;
    });
    // Apply reassignment; decide if we should animate or not
    const sharesKey = JSON.stringify(Array.from(shares.entries()));
    const sharesChanged = sharesKey !== lastSharesKey;
    lastSharesKey = sharesKey;
    // If the desired total seed count changed, rebuild the simulator but
    // preserve current site positions so the state is not reset.
    if (desired !== sim.numSeeds) {
      const prevGrowth = parseFloat(growthInput.value) || 1;
      const prevAniso = parseFloat(anisoInput.value) || 1;
      const dir = dialComp.getValue();
      const ls = Math.max(0, Math.min(1, parseFloat(lineStrength.value) || 0));
      const oldPoints = sim.currentPoints.map((p) => [p[0], p[1]]);
      // Create new simulator
      sim = new VoronoiSimulator({ width: FRAME_WIDTH, height: FRAME_HEIGHT, numSeeds: desired, mineralRegistry: registry });
      sim.setGrowthStrength(prevGrowth);
      sim.setAnisotropyStrength(prevAniso);
      sim.setLineation(dir, ls);
      sim.setMineralCountsTarget(targetCounts);
      // Seed the new simulator with previous layout where possible
      const pts = [];
      for (let i = 0; i < desired; i++) {
        if (i < oldPoints.length) pts.push([oldPoints[i][0], oldPoints[i][1]]);
        else pts.push([Math.random() * FRAME_WIDTH, Math.random() * FRAME_HEIGHT]);
      }
      const updated = sim.renderFromPoints(pts);
      if (!checkbox.checked) updated.classList.add('hide-labels');
      frameContainer.replaceChild(updated, svg);
      if (detachTooltip) detachTooltip();
      detachTooltip = attachTooltipListeners(updated);
      svg = updated;
      updateMeta(sim.numSeeds);
      renderPie();
      return;
    }

    sim.setMineralCountsTarget(targetCounts);
    if (sharesChanged) {
      // Share-only updates: recompute immediately without animation
      const updated = sim.renderFromPoints(sim.currentPoints);
      if (!checkbox.checked) updated.classList.add('hide-labels');
      frameContainer.replaceChild(updated, svg);
      // Avoid stacking multiple listeners by always detaching first
      if (detachTooltip) detachTooltip();
      detachTooltip = attachTooltipListeners(updated);
      svg = updated;
      renderPie();
      return;
    }
    // For weighted Voronoi, we can still animate lightly by interpolating positions
    // while weights change immediately; reusing existing position interpolation
    const target = sim.getEffectivePoints();
    const start = performance.now();
    const from = sim.currentPoints.map((p) => [p[0], p[1]]);
    const thisAnim = ++animId;

    function step(now) {
      if (thisAnim !== animId) return; // superseded by a newer animation
      const t = Math.min(1, (now - start) / 350);
      const interp = from.map((p, i) => {
        const q = target[i];
        return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      });
      const updated = sim.renderFromPoints(interp);
      if (!checkbox.checked) updated.classList.add('hide-labels');
      frameContainer.replaceChild(updated, svg);
      if (detachTooltip) detachTooltip();
      detachTooltip = attachTooltipListeners(updated);
      svg = updated;
      renderPie();
      if (t < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
    // Ensure slider focus remains so subsequent drags work
    anisoInput.blur(); anisoInput.focus();
    growthInput.blur(); growthInput.focus();
  }

  // Throttle input to rAF to avoid overwhelming the main thread
  let renderScheduled = false;
  function reRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      reRenderCore();
    });
  }

  controlsByMineral.forEach(({ aspectInput, sizeInput, shareInput }) => {
    const handler = () => reRender();
    aspectInput.addEventListener('input', handler);
    sizeInput.addEventListener('input', handler);
    shareInput.addEventListener('input', handler);
  });
  const onGrowth = () => {
    // sync displayed value to avoid any UI desync that could block further drag
    growthVal.textContent = growthInput.value;
    reRender();
  };
  const onAniso = () => {
    anisoVal.textContent = anisoInput.value;
    reRender();
  };
  growthInput.addEventListener('input', onGrowth);
  growthInput.addEventListener('change', onGrowth);
  anisoInput.addEventListener('input', onAniso);
  anisoInput.addEventListener('change', onAniso);
  dialComp.onChange(() => reRender());
  lineStrength.addEventListener('input', () => reRender());

  // Randomize positions while preserving sizes
  randomizeBtn.addEventListener('click', () => {
    // randomize base/current points
    const targets = sim.randomizePositionsPreserveSizes();
    // Immediately render with these targets
    const updated = sim.renderFromPoints(targets);
    if (!checkbox.checked) updated.classList.add('hide-labels');
    frameContainer.replaceChild(updated, svg);
    if (detachTooltip) detachTooltip();
    detachTooltip = attachTooltipListeners(updated);
    svg = updated;
    renderPie();
    updateZoomIndicator();
  });
}

main();


