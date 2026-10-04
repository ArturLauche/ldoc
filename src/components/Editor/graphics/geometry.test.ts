import { describe, expect, it } from 'vitest';
import {
  donutLabelPoint,
  donutSegmentPath,
  pointOnRing,
  ringAngles,
  ringTangentDeg,
  satelliteStartAngle,
  tierGeometry,
} from './geometry';

describe('graphic geometry', () => {
  it('spaces ring positions evenly from twelve o’clock', () => {
    expect(ringAngles(4)).toEqual([-90, 0, 90, 180]);
    expect(pointOnRing(-90, 40)).toEqual({ x: 50, y: 10 });
    expect(pointOnRing(0, 40, 30)).toEqual({ x: 90, y: 50 });
    const points = ringAngles(7).map((angle) => pointOnRing(angle, 37));
    for (const point of points) {
      expect(Math.hypot(point.x - 50, point.y - 50)).toBeCloseTo(37, 1);
    }
  });

  it('places hub satellites beside the hub for even counts', () => {
    expect(satelliteStartAngle(3)).toBe(-90);
    expect(ringAngles(2, satelliteStartAngle(2))).toEqual([0, 180]);
    expect(ringAngles(4, satelliteStartAngle(4))).toEqual([-45, 45, 135, 225]);
  });

  it('points arrowheads clockwise along the ring for any box aspect', () => {
    expect(ringTangentDeg(-90, 1)).toBe(0);
    expect(ringTangentDeg(0, 1)).toBe(90);
    expect(ringTangentDeg(90, 1)).toBe(180);
    // In a wide box the ellipse is flatter, so travel near 45° is more horizontal.
    expect(ringTangentDeg(-45, 16 / 9)).toBeLessThan(ringTangentDeg(-45, 1));
  });

  it('builds closed donut segments with a label point inside each', () => {
    for (const count of [3, 5, 8]) {
      for (let index = 0; index < count; index += 1) {
        const path = donutSegmentPath(index, count);
        expect(path.startsWith('M ')).toBe(true);
        expect(path.endsWith('Z')).toBe(true);
        expect(path).not.toContain('NaN');
        const label = donutLabelPoint(index, count);
        expect(Math.hypot(label.x - 50, label.y - 50)).toBeCloseTo(39, 0);
      }
    }
  });

  it('stacks pyramid tiers into one continuous trapezoid', () => {
    const tiers = [0, 1, 2].map((index) => tierGeometry(index, 3, 0.25));
    expect(tiers.map((tier) => tier.width)).toEqual([50, 75, 100]);
    // Each tier's narrow edge matches the wider edge of the tier above it.
    tiers.slice(1).forEach((tier, index) => {
      const topEdge = (tier.width * (100 - 2 * tier.inset)) / 100;
      expect(topEdge).toBeCloseTo(tiers[index].width, 0);
    });
    expect(tiers[0].clip).toMatch(/^polygon\(/);

    const inverted = [0, 1, 2].map((index) => tierGeometry(index, 3, 0.25, true));
    expect(inverted.map((tier) => tier.width)).toEqual([100, 75, 50]);
    expect(inverted[0].clip).toContain('100% 0');
  });

  it('stays finite for empty and single-item inputs', () => {
    for (const count of [0, 1]) {
      expect(Number.isFinite(satelliteStartAngle(count))).toBe(true);
      expect(donutSegmentPath(0, count)).not.toContain('NaN');
      const label = donutLabelPoint(0, count);
      expect(Number.isFinite(label.x) && Number.isFinite(label.y)).toBe(true);
      const tier = tierGeometry(0, count, 0.25);
      expect(Number.isFinite(tier.width) && Number.isFinite(tier.inset)).toBe(true);
      expect(tier.clip).not.toContain('NaN');
    }
  });
});
