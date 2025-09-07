import { describe, it, expect } from 'vitest';
import { MineralTypeRegistry } from '../../sim/minerals/MineralTypeRegistry.js';
import { VoronoiSimulator } from '../VoronoiSimulator.js';

describe('VoronoiSimulator', () => {
  it('generates the requested number of cells with required attributes', () => {
    const registry = MineralTypeRegistry.createDefault();
    const sim = new VoronoiSimulator({ width: 600, height: 600, numSeeds: 50, mineralRegistry: registry });
    expect(sim.cells.length).toBeGreaterThan(10);
    const cell = sim.cells[0];
    expect(cell).toHaveProperty('id');
    expect(cell).toHaveProperty('polygon');
    expect(Array.isArray(cell.polygon)).toBe(true);
    expect(cell).toHaveProperty('centroid');
    expect(cell).toHaveProperty('mineralType');
    expect(cell.mineralType).toHaveProperty('id');
    expect(cell).toHaveProperty('baselineRadius');
    expect(typeof cell.baselineRadius).toBe('number');
    expect(cell).toHaveProperty('aspectRatio');
    expect(cell).toHaveProperty('orientationDeg');
    expect(Array.isArray(cell.neighborIdsCCWFromTop)).toBe(true);
  });

  it('orders neighbors CCW starting from top-most', () => {
    const registry = MineralTypeRegistry.createDefault();
    const sim = new VoronoiSimulator({ width: 300, height: 300, numSeeds: 30, mineralRegistry: registry });
    const c = sim.cells.find((x) => Array.isArray(x.neighborIdsCCWFromTop) && x.neighborIdsCCWFromTop.length >= 3);
    expect(c).toBeTruthy();
    const neighbors = c.neighborIdsCCWFromTop;
    // neighbors should be unique
    const set = new Set(neighbors);
    expect(set.size).toBe(neighbors.length);
    // Order should be CCW in screen space and start at top-most (rotation of angle sort)
    const center = c.centroid;
    const angleOf = (nid) => {
      const n = sim.cells[nid];
      return Math.atan2(-(n.centroid[1] - center[1]), n.centroid[0] - center[0]);
    };
    const sortedByAngle = neighbors.slice().sort((a, b) => angleOf(a) - angleOf(b));
    // neighbors is a rotation of sortedByAngle
    const startIdx = neighbors.indexOf(sortedByAngle[0]);
    const rotated = neighbors.map((_, i) => neighbors[(startIdx + i) % neighbors.length]);
    expect(rotated).toEqual(sortedByAngle);
    // First neighbor is top-most (closest to +π/2)
    const topMost = neighbors.reduce((best, nid) => {
      const diff = Math.abs(angleOf(nid) - Math.PI / 2);
      if (!best) return { nid, diff };
      return diff < best.diff ? { nid, diff } : best;
    }, null).nid;
    expect(neighbors[0]).toBe(topMost);
  });
});


