import { Node, mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  coerceGraphic,
  createStarterGraphic,
  graphicFallbackDOMSpec,
  parseSmartGraphicFromDom,
  parseSmartGraphicJson,
  serializeSmartGraphic,
  type SmartGraphicLayoutId,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { SmartGraphicView } from './SmartGraphicView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartGraphic: {
      insertSmartGraphic: (layoutId?: SmartGraphicLayoutId) => ReturnType;
      updateSmartGraphic: (graphic: SmartGraphicModel) => ReturnType;
      deleteSmartGraphic: () => ReturnType;
    };
  }
}

export const SmartGraphic = Node.create({
  name: 'smartGraphic',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      graphic: {
        default: createStarterGraphic('list-block'),
        renderHTML: (attributes: { graphic?: unknown }) => ({
          'data-lwrite-graphic': serializeSmartGraphic(coerceGraphic(attributes.graphic)),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-lwrite-graphic]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const model =
            parseSmartGraphicJson(element.getAttribute('data-lwrite-graphic')) ??
            parseSmartGraphicFromDom(element);
          return model ? { graphic: model } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const model = coerceGraphic(node.attrs.graphic);
    return [
      'div',
      mergeAttributes(
        {
          class: 'lwrite-graphic',
          contenteditable: 'false',
        },
        HTMLAttributes,
      ),
      ...(graphicFallbackDOMSpec(model) as DOMOutputSpec[]),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartGraphicView, {
      as: 'div',
      className: 'lwrite-graphic-view',
      stopEvent: ({ event }) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;
        return Boolean(target.closest('input, textarea, button, [data-graphic-edit]'));
      },
    });
  },

  addCommands() {
    return {
      insertSmartGraphic:
        (layoutId) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: {
                graphic: createStarterGraphic(layoutId ?? 'list-block'),
              },
            })
            .command(({ tr, dispatch }) => {
              let closestPos: number | null = null;
              let closestDistance = Number.POSITIVE_INFINITY;
              const from = tr.selection.from;
              tr.doc.descendants((node, pos) => {
                if (node.type.name !== 'smartGraphic') return true;
                const distance = Math.abs(pos - from);
                if (distance < closestDistance) {
                  closestPos = pos;
                  closestDistance = distance;
                }
                return true;
              });
              if (closestPos == null) return false;
              if (dispatch) {
                tr.setSelection(NodeSelection.create(tr.doc, closestPos));
              }
              return true;
            })
            .run(),
      updateSmartGraphic:
        (graphic) =>
        ({ editor, commands }) => {
          if (!editor.isActive(this.name)) return false;
          return commands.updateAttributes(this.name, { graphic: coerceGraphic(graphic) });
        },
      deleteSmartGraphic:
        () =>
        ({ editor, commands }) => {
          if (!editor.isActive(this.name)) return false;
          return commands.deleteSelection();
        },
    };
  },
});
