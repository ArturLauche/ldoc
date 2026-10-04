/**
 * Deterministic geometry for the circular and tiered layouts. Everything is in
 * percentages of the layout box (or a 100×100 SVG view box), so diagrams
 * scale with the editor without measuring the DOM.
 */

export interface Point {
  x: number;
  y: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const round = (value: number) => Math.round(value * 100) / 100;

/** Evenly spaced angles, clockwise from `startDeg` (−90 = 12 o'clock). */
export function ringAngles(count: number, startDeg = -90): number[] {
  return Array.from({ length: count }, (_, index) => startDeg + (index * 360) / Math.max(count, 1));
}

/**
 * Start angle for satellites around a hub: odd counts start at the top; even
 * counts are rotated so nodes sit beside the hub, where a wide box has room.
 */
export function satelliteStartAngle(count: number): number {
  return count % 2 === 1 ? -90 : -90 + 180 / Math.max(count, 1);
}

/** Point on an ellipse centered in the box, radii in % of each axis. */
export function pointOnRing(angleDeg: number, radiusX: number, radiusY = radiusX): Point {
  const angle = toRadians(angleDeg);
  return { x: round(50 + radiusX * Math.cos(angle)), y: round(50 + radiusY * Math.sin(angle)) };
}

/**
 * Screen-space direction of travel (clockwise) at a ring angle, for a box
 * whose width is `aspect` times its height and radii given in % of each
 * axis. Used to rotate arrowheads.
 */
export function ringTangentDeg(angleDeg: number, aspect: number, radiusX = 1, radiusY = radiusX): number {
  const angle = toRadians(angleDeg);
  const dx = -Math.sin(angle) * radiusX * aspect;
  const dy = Math.cos(angle) * radiusY;
  return round((Math.atan2(dy, dx) * 180) / Math.PI);
}

/**
 * An annular segment with a chevron tip at its clockwise end and a matching
 * notch at its start, in a 100×100 view box.
 */
export function donutSegmentPath(
  index: number,
  count: number,
  outer = 48,
  inner = 30,
  gapDeg = 1.5,
): string {
  const span = 360 / Math.max(count, 1);
  const start = -90 + index * span + gapDeg;
  const end = -90 + (index + 1) * span - gapDeg;
  const middle = (outer + inner) / 2;
  // The tip reaches a few degrees past the end; the notch mirrors it.
  const tip = Math.min(7, span / 4);
  const at = (radius: number, deg: number) => pointOnRing(deg, radius);
  const o0 = at(outer, start);
  const o1 = at(outer, end);
  const tipPoint = at(middle, end + tip);
  const i1 = at(inner, end);
  const i0 = at(inner, start);
  const notch = at(middle, start + tip);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${tipPoint.x} ${tipPoint.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${i0.x} ${i0.y}`,
    `L ${notch.x} ${notch.y}`,
    'Z',
  ].join(' ');
}

/** Label anchor in the middle of a donut segment. */
export function donutLabelPoint(index: number, count: number, outer = 48, inner = 30): Point {
  const span = 360 / Math.max(count, 1);
  return pointOnRing(-90 + (index + 0.5) * span, (outer + inner) / 2);
}

export interface TierGeometry {
  /** Element width, % of the pyramid box. */
  width: number;
  /** Horizontal inset of the narrow edge, % of the element width. */
  inset: number;
  clip: string;
}

/**
 * One trapezoid tier of a pyramid. Tier 0 is at the top. `apex` is the width
 * of the narrow end as a fraction of the base (0 = a sharp point).
 */
export function tierGeometry(index: number, count: number, apex: number, inverted = false): TierGeometry {
  const narrowAt = (step: number) => apex + ((1 - apex) * step) / Math.max(count, 1);
  const top = inverted ? narrowAt(count - index) : narrowAt(index);
  const bottom = inverted ? narrowAt(count - index - 1) : narrowAt(index + 1);
  const width = Math.max(top, bottom);
  const inset = round((Math.abs(bottom - top) / 2 / width) * 100);
  const clip = inverted
    ? `polygon(0 0, 100% 0, ${round(100 - inset)}% 100%, ${inset}% 100%)`
    : `polygon(${inset}% 0, ${round(100 - inset)}% 0, 100% 100%, 0 100%)`;
  return { width: round(width * 100), inset, clip };
}
