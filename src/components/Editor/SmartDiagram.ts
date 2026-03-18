import { Node, mergeAttributes, type DOMOutputSpec } from '@tiptap/core';

export type SmartDiagramTemplate = 'process' | 'cycle' | 'hierarchy';

type SmartDiagramAttrs = {
  template: SmartDiagramTemplate;
  title: string;
  items: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartDiagram: {
      insertSmartDiagram: (attrs?: Partial<SmartDiagramAttrs>) => ReturnType;
      updateSmartDiagram: (attrs: Partial<SmartDiagramAttrs>) => ReturnType;
    };
  }
}

const DEFAULT_ITEMS = ['Step 1', 'Step 2', 'Step 3'];
const TEMPLATE_ACCENTS: Record<SmartDiagramTemplate, string> = {
  process: 'process',
  cycle: 'cycle',
  hierarchy: 'hierarchy',
};

function normalizeItems(value?: string): string[] {
  const items = (value ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return items.length ? items : DEFAULT_ITEMS;
}

export const SmartDiagram = Node.create({
  name: 'smartDiagram',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      template: {
        default: 'process',
      },
      title: {
        default: 'Diagram',
      },
      items: {
        default: DEFAULT_ITEMS.join('|'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-smart-diagram]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as SmartDiagramAttrs;
    const items = normalizeItems(attrs.items);
    const template = (attrs.template ?? 'process') as SmartDiagramTemplate;

    return [
      'div',
      mergeAttributes(
        {
          'data-smart-diagram': 'true',
          'data-template': template,
          'data-title': attrs.title,
          'data-items': items.join('|'),
          'data-item-count': String(items.length),
          contenteditable: 'false',
          class: `smart-diagram smart-diagram--${template} smart-diagram--accent-${TEMPLATE_ACCENTS[template]}`,
        },
        HTMLAttributes,
      ),
      [
        'div',
        { class: 'smart-diagram__header' },
        ['div', { class: 'smart-diagram__title' }, attrs.title ?? 'Diagram'],
        ['div', { class: 'smart-diagram__meta', 'aria-hidden': 'true' }, String(items.length).padStart(2, '0')],
      ],
      [
        'div',
        { class: 'smart-diagram__nodes' },
        ...items.flatMap((item, index) => {
          const nodes: DOMOutputSpec[] = [[
            'div',
            { class: 'smart-diagram__node', 'data-step': String(index + 1) },
            ['span', { class: 'smart-diagram__node-index' }, String(index + 1)],
            ['span', { class: 'smart-diagram__node-label' }, item],
          ]];
          if (index < items.length - 1) {
            nodes.push(['span', { class: 'smart-diagram__connector', 'aria-hidden': 'true' }]);
          }
          return nodes;
        }),
      ],
    ];
  },

  addCommands() {
    return {
      insertSmartDiagram:
        (attrs) =>
        ({ commands }) => {
          const items = normalizeItems(attrs?.items);
          return commands.insertContent({
            type: this.name,
            attrs: {
              template: attrs?.template ?? 'process',
              title: attrs?.title ?? 'Diagram',
              items: items.join('|'),
            },
          });
        },
      updateSmartDiagram:
        (attrs) =>
        ({ editor, commands }) => {
          if (!editor.isActive(this.name)) {
            return false;
          }
          const nextAttrs = {
            ...attrs,
            ...(attrs.items ? { items: normalizeItems(attrs.items).join('|') } : {}),
          };
          return commands.updateAttributes(this.name, nextAttrs);
        },
    };
  },
});
