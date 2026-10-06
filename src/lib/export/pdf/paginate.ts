import type { Atom, Decoration, Galley, PlacedCell, TableAtom } from './galley';

/**
 * Cuts a galley into pages. Breaks happen between atoms; the margin above
 * the first atom on a page is dropped. Headings stay with what follows,
 * paragraphs keep at least two lines together at either side of a break,
 * table header rows repeat, and table rows taller than a page are split
 * between lines of their cells.
 */

export interface PlacedAtom {
  atom: Atom;
  /** Top on the page's content area, px. */
  top: number;
}

export interface DecorationPiece {
  decoration: Decoration;
  top: number;
  bottom: number;
}

export interface Page {
  atoms: PlacedAtom[];
  decorations: DecorationPiece[];
}

const EPSILON = 0.5;

function bottomOf(atom: Atom): number {
  return atom.y + atom.height + atom.insetAfter;
}

/**
 * The first atom after a keep-with-next chain (heading lines, then a table's
 * header rows): a heading stays with the first body row below its table header.
 */
function nextKeepTarget(atoms: Atom[], index: number): number {
  let next = index + 1;
  while (next < atoms.length && atoms[next].keepWithNext) next += 1;
  return Math.min(next, atoms.length - 1);
}

export function paginate(galley: Galley, pageHeight: number): Page[] {
  const pages: Page[] = [{ atoms: [], decorations: [] }];
  const placements = new Map<Atom, { page: number; top: number }>();
  let offset = 0;
  const atoms = galley.atoms.slice();

  const newPage = (atom: Atom) => {
    pages.push({ atoms: [], decorations: [] });
    offset = atom.y - atom.insetBefore;
  };
  const fits = (atom: Atom, extra = 0) => bottomOf(atom) - offset + extra <= pageHeight + EPSILON;
  const place = (atom: Atom) => {
    const top = atom.y - offset;
    pages[pages.length - 1].atoms.push({ atom, top });
    placements.set(atom, { page: pages.length - 1, top });
  };

  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index];
    const page = pages[pages.length - 1];
    const hasContent = page.atoms.length > 0;
    let breakBefore = hasContent && !fits(atom);

    if (!breakBefore && hasContent && atom.keepWithNext) {
      const target = atoms[nextKeepTarget(atoms, index)];
      // Keep a heading with the first line, row, image or graphic that follows it,
      // unless that is a table row too tall for a page, which is split here anyway.
      const splitsHere = target.kind === 'table' && target.height > pageHeight - repeatedHeaderHeight(galley, target);
      if (target !== atom && !splitsHere && !fits(target)) breakBefore = true;
    }
    if (!breakBefore && hasContent && atom.kind === 'line' && atom.paragraph.count >= 2) {
      const { index: line, count } = atom.paragraph;
      const next = atoms[index + 1];
      // Orphans: never leave only the first line of a paragraph at a page bottom.
      if (line === 0 && next?.kind === 'line' && !fits(next)) breakBefore = true;
      // Widows: never carry only the last line to the next page.
      if (line === count - 2 && line >= 2 && next?.kind === 'line' && fits(atom) && !fits(next)) breakBefore = true;
    }

    if (atom.kind === 'table' && !fits(atom) && atom.height > pageHeight - repeatedHeaderHeight(galley, atom)) {
      // A row group taller than a page is split between the lines of its cells.
      let room = pageHeight - (atom.y - offset);
      if (hasContent && room < 60) {
        newPage(atom);
        offset -= placeHeaders(galley, atom, pages, offset);
        room = pageHeight - (atom.y - offset);
      }
      const split = splitTable(atom, room);
      if (split) {
        place(split[0]);
        atoms.splice(index + 1, 0, split[1]);
        continue;
      }
    }

    if (breakBefore) {
      newPage(atom);
      if (atom.kind === 'table' && !atom.header) offset -= placeHeaders(galley, atom, pages, offset);
    }
    place(atom);
  }

  galley.decorations.forEach((decoration) => {
    const byPage = new Map<number, { top: number; bottom: number; first: boolean; last: boolean }>();
    for (let index = decoration.first; index <= decoration.last; index += 1) {
      const placement = placements.get(galley.atoms[index]);
      if (!placement) continue;
      const atom = galley.atoms[index];
      const entry = byPage.get(placement.page) ?? { top: Infinity, bottom: -Infinity, first: false, last: false };
      entry.top = Math.min(entry.top, placement.top);
      entry.bottom = Math.max(entry.bottom, placement.top + atom.height);
      entry.first ||= index === decoration.first;
      entry.last ||= index === decoration.last;
      byPage.set(placement.page, entry);
    }
    byPage.forEach((entry, page) => {
      pages[page].decorations.push({
        decoration,
        top: entry.top - (entry.first ? decoration.padTop : 0),
        bottom: entry.bottom + (entry.last ? decoration.padBottom : 0),
      });
    });
  });

  return pages.filter((page, index) => index === 0 || page.atoms.length > 0);
}

function repeatedHeaderHeight(galley: Galley, atom: TableAtom): number {
  if (atom.header) return 0;
  return (galley.tableHeaders.get(atom.tableId) ?? []).reduce((sum, header) => sum + header.height, 0);
}

/** Repeats a table's header rows at the top of a continuation page; returns their height. */
function placeHeaders(galley: Galley, atom: TableAtom, pages: Page[], offset: number): number {
  const headers = galley.tableHeaders.get(atom.tableId);
  if (!headers?.length) return 0;
  const page = pages[pages.length - 1];
  let top = 0;
  headers.forEach((header) => {
    page.atoms.push({ atom: { ...header, y: offset + top, gapBefore: 0 }, top });
    top += header.height;
  });
  return top;
}

/** Splits a table row group so the first part is at most `available` px tall. */
export function splitTable(atom: TableAtom, available: number): [TableAtom, TableAtom] | null {
  if (available <= 24) return null;
  // Cut where every cell can break between atoms.
  let cut = available;
  atom.cells.forEach((cell) => {
    if (cell.y >= cut || cell.y + cell.height <= cut) return;
    const local = cut - cell.y - cell.contentOffset;
    let best = 0;
    cell.galley.atoms.forEach((child) => {
      const bottom = child.y + child.height + child.insetAfter + 3.2;
      if (bottom <= local) best = Math.max(best, bottom);
    });
    const cellCut = cell.y + cell.contentOffset + best;
    if (cellCut > 24) cut = Math.min(cut, cellCut);
  });
  if (cut <= 24 || cut >= atom.height) return null;
  const head: PlacedCell[] = [];
  const tail: PlacedCell[] = [];
  atom.cells.forEach((cell) => {
    if (cell.y + cell.height <= cut) {
      head.push(cell);
      return;
    }
    if (cell.y >= cut) {
      tail.push({ ...cell, y: cell.y - cut });
      return;
    }
    head.push({ ...cell, height: cut - cell.y });
    tail.push({ ...cell, y: 0, height: cell.y + cell.height - cut, contentOffset: cell.contentOffset - (cut - cell.y) });
  });
  return [
    { ...atom, height: cut, cells: head, rowLines: atom.rowLines.filter((line) => line < cut), keepWithNext: false },
    {
      ...atom,
      y: atom.y + cut,
      height: atom.height - cut,
      cells: tail,
      rowLines: atom.rowLines.filter((line) => line > cut).map((line) => line - cut),
      gapBefore: 0,
      header: false,
    },
  ];
}
