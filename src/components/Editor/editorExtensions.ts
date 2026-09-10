import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import FontFamily from '@tiptap/extension-font-family';
import Placeholder, { type PlaceholderOptions } from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { mergeAttributes, type Extensions } from '@tiptap/core';
import { FindReplace } from './findReplaceExtension';
import { SmartGraphic } from './smartGraphicExtension';
import { EditorTable, EditorTableCell, EditorTableHeader, EditorTableRow } from './tableExtensions';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    editorPlaceholder: {
      setEditorPlaceholder: (text: string) => ReturnType;
    };
  }
  interface Storage {
    placeholder: { text: string | null };
  }
}

const EditorPlaceholder = Placeholder.extend<PlaceholderOptions, { text: string | null }>({
  addStorage() {
    return { text: null };
  },
  addCommands() {
    return {
      setEditorPlaceholder: (text) => ({ tr, dispatch }) => {
        if (dispatch) {
          this.storage.text = text;
          // Refresh decorations without changing content or creating an undo step.
          tr.setMeta('editorPlaceholder', text);
        }
        return true;
      },
    };
  },
});

const EnhancedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align,
        }),
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-width'),
        renderHTML: (attributes) =>
          attributes.width
            ? {
                'data-width': attributes.width,
                style: `width: ${attributes.width}%;`,
              }
            : {},
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
});

const EnhancedTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return {
            'data-lwrite-theme-text': 'true',
            style: `font-size: ${attributes.fontSize}`,
          };
        },
      },
      lineHeight: {
        default: null,
        parseHTML: (element) => element.style.lineHeight || null,
        renderHTML: (attributes) => {
          if (!attributes.lineHeight) return {};
          return {
            'data-lwrite-theme-text': 'true',
            style: `line-height: ${attributes.lineHeight}`,
          };
        },
      },
    };
  },
});

/**
 * Builds the TipTap extension set with an initial placeholder. Later locale
 * changes use setEditorPlaceholder without rebuilding the editor or its history.
 */
export function createEditorExtensions(getPlaceholder: () => string): Extensions {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      link: false,
      underline: false,
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    EnhancedTextStyle,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    Link.configure({
      openOnClick: false,
      autolink: false,
      protocols: ['http', 'https', 'mailto'],
      // Defense in depth: never let javascript:/data: URLs reach the schema,
      // even if they somehow survive an import.
      validate: (href: string) => /^(https?:\/\/|mailto:|#|\/)/i.test(href.trim()),
      HTMLAttributes: {
        class: 'text-primary underline cursor-pointer hover:text-primary/80',
      },
    }),
    Superscript,
    Subscript,
    FontFamily,
    EditorPlaceholder.configure({
      placeholder: ({ editor }) => editor.storage.placeholder.text ?? getPlaceholder(),
    }),
    EnhancedImage.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: {
        class: 'rounded-lg max-w-full h-auto my-4 mx-auto block',
      },
    }),
    EditorTable,
    EditorTableRow,
    EditorTableHeader,
    EditorTableCell,
    SmartGraphic,
    FindReplace,
  ];
}
