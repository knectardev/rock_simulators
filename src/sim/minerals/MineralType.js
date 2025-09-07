export class MineralType {
  constructor({ id, label, defaultColor, baselineRadiusRange }) {
    this.id = id; // stable id string
    this.label = label; // human label
    this.defaultColor = defaultColor; // hex color
    this.baselineRadiusRange = baselineRadiusRange; // [min, max]

    // UI-adjustable parameters (visual, not physical) with safe defaults
    this.aspectRatioScale = 1; // 1 = no anisotropy
    this.sizeScale = 1; // 1 = no size change
  }
}


