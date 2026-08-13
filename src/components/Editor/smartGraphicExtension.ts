import { Node, mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  coerceGraphic,
  createStarterGraphic,
  flattenGraphicLabels,
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

  interface Storage {
    smartGraphic: {
      activeItemId: string | null;
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
        default: null,
        renderHTML: (attributes: { graphic?: unknown }) => ({
          'data-lwrite-graphic': serializeSmartGraphic(coerceGraphic(attributes.graphic)),
        }),
      },
    };
  },

  renderText({ node }) {
    const model = coerceGraphic(node.attrs.graphic);
    return [model.title, ...flattenGraphicLabels(model)].filter(Boolean).join(' ');
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

  addStorage() {
    return {
      activeItemId: null as string | null,
    };
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
        ({ chain, state }) => {
          const insertPos = state.selection.from;
          return chain()
            .insertContentAt(
              insertPos,
              {
                type: this.name,
                attrs: {
                  graphic: createStarterGraphic(layoutId ?? 'list-block'),
                },
              },
              { updateSelection: false },
            )
            .command(({ tr, dispatch }) => {
              const pos = tr.mapping.map(insertPos, -1);
              if (tr.doc.nodeAt(pos)?.type.name !== this.name) {
                return false;
              }
              if (dispatch) {
                tr.setSelection(NodeSelection.create(tr.doc, pos));
              }
              return true;
            })
            .run();
        },
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
