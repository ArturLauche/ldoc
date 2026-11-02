import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { parseCssColor } from '@/lib/export/color';

const SAFE_CELL_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)$/i;

function contrastingInk(background: string): string {
  // Named colors and modern color syntaxes are common in imported tables.
  const color = parseCssColor(background);
  // Translucent fills sit on the page's white surface.
  const r = color ? color.r * color.a + 255 * (1 - color.a) : 255;
  const g = color ? color.g * color.a + 255 * (1 - color.a) : 255;
  const b = color ? color.b * color.a + 255 * (1 - color.a) : 255;
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
