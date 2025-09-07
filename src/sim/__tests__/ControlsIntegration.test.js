import { describe, it, expect } from 'vitest';
import { MineralTypeRegistry } from '../../sim/minerals/MineralTypeRegistry.js';
import { VoronoiSimulator } from '../VoronoiSimulator.js';

describe('Controls integration (model-side)', () => {
  it('share slider effect: setMineralCountsTarget matches requested totals', () => {
    const registry = MineralTypeRegistry.createDefault();
    const sim = new VoronoiSimulator({ width: 400, height: 300, numSeeds: 30, mineralRegistry: registry });
    const types = registry.getAll();
    const target = {};
    // 10/10/10 split deterministically
    target[types[0].id] = 10;
    target[types[1].id] = 10;
    target[types[2].id] = 10;
    sim.setMineralCountsTarget(target);
    // Recompute cells (model-only) so mineralType on cells reflects new assignments
    sim._computeFromPoints(sim.currentPoints);
    const counts = new Map();
    sim.cells.forEach((c) => {
      const id = c.mineralType.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    expect(counts.get(types[0].id)).toBe(10);
    expect(counts.get(types[1].id)).toBe(10);
    expect(counts.get(types[2].id)).toBe(10);
  });

  it('size slider effect: increasing sizeScale moves target sites on average', () => {
    const registry = MineralTypeRegistry.createDefault();
    const sim = new VoronoiSimulator({ width: 400, height: 300, numSeeds: 40, mineralRegistry: registry });
    // Baseline effective points
    const base = sim.getEffectivePoints();
    // Increase size of the first mineral substantially
    const first = registry.getAll()[0];
    first.sizeScale = 3; // emulate slider change
    const after = sim.getEffectivePoints();
    // Average displacement should be > 0
    let total = 0;
    for (let i = 0; i < base.length; i++) {
      const dx = after[i][0] - base[i][0];
      const dy = after[i][1] - base[i][1];
      total += Math.hypot(dx, dy);
    }
    expect(total).toBeGreaterThan(0.1);
  });
});


