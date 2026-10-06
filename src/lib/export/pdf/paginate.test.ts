import { describe, expect, it } from 'vitest';
import type { Atom, Galley, LineAtom, TableAtom } from './galley';
import type { LayoutLine } from './inline';
import { paginate } from './paginate';

const base = { gapBefore: 0, insetBefore: 0, insetAfter: 0, x: 0 };

function line(id: number, y: number, height: number, keepWithNext = false): LineAtom {
  const layout: LayoutLine = { pieces: [], width: 0, height, baseline: height, offset: 0, inset: 0 };
  return { ...base, kind: 'line', y, height, line: layout, runs: [], paragraph: { id, index: 0, count: 1 }, ...(keepWithNext ? { keepWithNext } : {}) };
}

function row(y: number, height: number, header = false): TableAtom {
  return {
    ...base,
    kind: 'table',
    y,
    height,
    width: 100,
    tableId: 1,
    borders: 'visible',
    cells: [],
    rowLines: [],
    ...(header ? { header: true, keepWithNext: true } : {}),
  };
}

function pagesOf(atoms: Atom[]) {
  const galley: Galley = {
    atoms,
    decorations: [],
    height: 0,
    tableHeaders: new Map([[1, atoms.filter((atom): atom is TableAtom => atom.kind === 'table' && Boolean(atom.header))]]),
  };
  return paginate(galley, 100).map((page) => page.atoms.map(({ atom }) => atoms.indexOf(atom)));
}

describe('paginate', () => {
  it('keeps a heading with a table that moves to the next page', () => {
    expect(pagesOf([line(1, 0, 80), line(2, 80, 10, true), row(90, 30)])).toEqual([[0], [1, 2]]);
  });

  it('keeps a heading and the table header with the first body row', () => {
    expect(pagesOf([line(1, 0, 70), line(2, 70, 10, true), row(80, 10, true), row(90, 30)])).toEqual([[0], [1, 2, 3]]);
  });

  it('keeps a heading with the next line and leaves it when everything fits', () => {
    expect(pagesOf([line(1, 0, 85), line(2, 85, 10, true), line(3, 95, 10)])).toEqual([[0], [1, 2]]);
    expect(pagesOf([line(1, 0, 60), line(2, 60, 10, true), row(70, 30)])).toEqual([[0, 1, 2]]);
  });
});
