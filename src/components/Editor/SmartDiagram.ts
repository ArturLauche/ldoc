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
    const items = (attrs.items ?? '').split('|').map((item) => item.trim()).filter(Boolean);
    const resolvedItems = items.length ? items : DEFAULT_ITEMS;

    const connectorSymbol = attrs.template === 'cycle' ? '⟲' : attrs.template === 'hierarchy' ? '↓' : '→';

    return [
      'div',
      mergeAttributes(
        {
          'data-smart-diagram': 'true',
          'data-template': attrs.template,
          'data-title': attrs.title,
          'data-items': resolvedItems.join('|'),
          contenteditable: 'false',
          class: 'smart-diagram smart-diagram--' + (attrs.template ?? 'process'),
        },
        HTMLAttributes,
      ),
      ['div', { class: 'smart-diagram__title' }, attrs.title ?? 'Diagram'],
      [
        'div',
        { class: 'smart-diagram__nodes' },
        ...resolvedItems.flatMap((item, index) => {
          const nodes: DOMOutputSpec[] = [['div', { class: 'smart-diagram__node' }, item]];
          if (index < resolvedItems.length - 1) {
            nodes.push(['span', { class: 'smart-diagram__connector' }, connectorSymbol]);
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
          const items = attrs?.items?.split('|').map((item) => item.trim()).filter(Boolean) ?? DEFAULT_ITEMS;
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
          return commands.updateAttributes(this.name, attrs);
        },
    };
  },
});
