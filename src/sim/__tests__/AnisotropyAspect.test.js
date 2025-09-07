import { describe, it, expect } from 'vitest';
import { MineralTypeRegistry } from '../../sim/minerals/MineralTypeRegistry.js';
import { VoronoiSimulator } from '../VoronoiSimulator.js';

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe('Anisotropy aspect alignment', () => {
  it('increasing mica aspect increases computed aspect ratios', () => {
    const registry = MineralTypeRegistry.createDefault();
    const sim = new VoronoiSimulator({ width: 500, height: 400, numSeeds: 60, mineralRegistry: registry });
    // Baseline average aspect for mica
    const micaId = 'mica';
    const baseAspects = sim.cells.filter((c) => c.mineralType.id === micaId).map((c) => c.aspectRatio);
    const baseMean = mean(baseAspects);

    // Increase mica aspect ratio scale substantially (emulate slider)
    const mica = registry.getAll().find((t) => t.id === micaId);
    mica.aspectRatioScale = 8;
    // Recompute effective points and update cells (model-only)
    const pts = sim.getEffectivePoints();
    sim._computeFromPoints(pts);
    const afterAspects = sim.cells.filter((c) => c.mineralType.id === micaId).map((c) => c.aspectRatio);
    const afterMean = mean(afterAspects);

    // Expect growth along orientation (aspect number increases). Use
    // a mild factor to keep the test deterministic across random seeds.
    expect(afterMean).toBeGreaterThan(baseMean * 1.05);
  });
});


