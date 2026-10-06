import { describe, expect, it } from 'vitest';
import { parseBoxShadows, parseDropShadowFilter, splitTopLevel } from './cssGeometry';
import { ellipsePath, isFinitePath, roundedRectPath } from './scene';
import { sceneToSvg } from './svg';

describe('CSS shadows', () => {
  it('keeps translucent drop-shadow colors in either order', () => {
    const shadow = { color: { r: 0, g: 0, b: 0, a: 0.1 }, dx: 0, dy: 1, blur: 2, spread: 0 };
    // Computed styles put the color first (Chromium); authored CSS may put it last.
    expect(parseDropShadowFilter('drop-shadow(rgba(0, 0, 0, 0.1) 0px 1px 2px)')).toEqual(shadow);
    expect(parseDropShadowFilter('drop-shadow(rgb(0 0 0 / 0.1) 0px 1px 2px)')).toEqual(shadow);
    expect(parseDropShadowFilter('drop-shadow(0px 1px 2px rgb(0 0 0 / 0.1))')).toEqual(shadow);
    expect(parseDropShadowFilter('blur(1px) drop-shadow(rgba(0, 0, 0, 0.1) 0px 1px 2px) drop-shadow(red 0px 0px)')).toEqual(shadow);
    expect(parseDropShadowFilter('blur(2px)')).toBeNull();
    expect(parseDropShadowFilter('drop-shadow(0px 1px)')).toBeNull();
  });

  it('parses computed box-shadow lists', () => {
    expect(parseBoxShadows('rgba(0, 0, 0, 0.2) 0px 2px 4px 1px, rgb(255, 0, 0) 0px 0px 0px 2px inset')).toEqual([
      { inset: false, dx: 0, dy: 2, blur: 4, spread: 1, color: { r: 0, g: 0, b: 0, a: 0.2 } },
      { inset: true, dx: 0, dy: 0, blur: 0, spread: 2, color: { r: 255, g: 0, b: 0, a: 1 } },
    ]);
    expect(splitTopLevel('rgb(1, 2, 3) 1px, 2px', ',')).toEqual(['rgb(1, 2, 3) 1px', '2px']);
  });
});

describe('scene paths', () => {
  it('drops shapes with non-finite coordinates', () => {
    expect(roundedRectPath(Number.NaN, 0, 10, 10)).toEqual([]);
    expect(roundedRectPath(0, 0, Number.NaN, 10)).toEqual([]);
    expect(ellipsePath(5, 5, Number.NaN, 2)).toEqual([]);
    expect(isFinitePath([['M', 0, 0], ['L', Number.NaN, 1], ['Z']])).toBe(false);
    expect(isFinitePath(roundedRectPath(0, 0, 10, 10))).toBe(true);
  });

  it('serializes only well-formed root attribute names', () => {
    const svg = sceneToSvg(
      { width: 10, height: 10, items: [] },
      { attributes: { class: 'drawing', 'aria-label': 'A "graphic"', 'onload="x" a': 'y' } },
    );
    expect(svg).toContain(' class="drawing" aria-label="A &quot;graphic&quot;"');
    expect(svg).not.toContain('onload');
  });
});
