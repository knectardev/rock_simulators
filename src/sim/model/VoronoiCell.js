export class VoronoiCell {
  constructor({ id, polygon, centroid, mineralType, baselineRadius, colorOverride = null }) {
    this.id = id; // stable numeric id
    this.polygon = polygon; // array of [x,y]
    this.centroid = centroid; // [x,y]
    this.mineralType = mineralType; // MineralType
    this.baselineRadius = baselineRadius; // number in pixels
    this.colorOverride = colorOverride; // nullable hex

    // dynamic attributes
    this.aspectRatio = 1; // width/height approx; updated later
    this.orientationDeg = 0; // angle in degrees; updated later

    // neighbor ids ordered CCW starting from top-most neighbor
    this.neighborIdsCCWFromTop = [];
  }

  get displayColor() {
    return this.colorOverride || this.mineralType.defaultColor;
  }

  setNeighborsOrdered(ids) {
    this.neighborIdsCCWFromTop = ids;
  }
}


