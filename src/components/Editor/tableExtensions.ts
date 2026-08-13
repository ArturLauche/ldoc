import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';

const SAFE_CELL_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)$/i;

function contrastingInk(background: string): string {
  const trimmed = background.trim();
  let r = 255;
  let g = 255;
  let b = 255;
  const hex = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  const rgb = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (hex) {
    let value = hex[1];
    if (value.length === 3 || value.length === 4) {
      value = value
        .slice(0, 3)
        .split('')
        .map((char) => char + char)
        .join('');
    }
    r = Number.parseInt(value.slice(0, 2), 16);
    g = Number.parseInt(value.slice(2, 4), 16);
    b = Number.parseInt(value.slice(4, 6), 16);
  } else if (rgb) {
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
  }
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? '#0f172a' : '#f8fafc';
}

const extraCellAttributes = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute('data-background-color') || element.style.backgroundColor || '';
      return SAFE_CELL_COLOR.test(value.trim()) ? value.trim() : null;
    },
    renderHTML: (attributes: { backgroundColor?: string | null }) => {
      if (!attributes.backgroundColor) return {};
      return {
        'data-background-color': attributes.backgroundColor,
        style: `background-color: ${attributes.backgroundColor}; color: ${contrastingInk(attributes.backgroundColor)}`,
      };
    },
  },
};

export const EditorTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borders: {
        default: 'visible' as const,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-borders') === 'hidden' ? 'hidden' : 'visible',
        renderHTML: (attributes: { borders?: 'visible' | 'hidden' }) =>
          attributes.borders === 'hidden' ? { 'data-borders': 'hidden' } : {},
      },
    };
  },
}).configure({
  resizable: true,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
  cellMinWidth: 48,
});

export const EditorTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttributes,
    };
  },
});

export const EditorTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttributes,
    };
  },
});

export const EditorTableRow = TableRow;
