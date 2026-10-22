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
import { Extension, mergeAttributes, type Extensions } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { ImageAlignment, ImageWidth } from '@/lib/media';
import { FindReplace } from './findReplaceExtension';
import { ImageFiles } from './imageFileExtension';
import { selectInsertedNode } from './insertedNode';
import { SmartGraphic } from './smartGraphicExtension';
import { EditorTable, EditorTableCell, EditorTableHeader, EditorTableRow } from './tableExtensions';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    editorPlaceholder: {
      setEditorPlaceholder: (text: string) => ReturnType;
    };
    enhancedImage: {
      /** Inserts an image with its layout at the cursor and selects it. */
      insertImage: (attributes: {
        src: string;
        alt: string;
        align: ImageAlignment;
        width: ImageWidth;
      }) => ReturnType;
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
  addCommands() {
    return {
      ...this.parent?.(),
      // One step with every attribute: a follow-up `updateAttributes` only
      // reached the image when the cursor happened to end up on it.
      insertImage:
        (attributes) =>
        ({ chain, tr }) => {
          const firstStep = tr.steps.length;
          return chain()
            .insertContent({ type: this.name, attrs: attributes })
            .command(({ tr, dispatch }) => selectInsertedNode(tr, firstStep, this.name, dispatch))
            .run();
        },
    };
  },
});

/** First color of the highlight palette (toolbarModel's HIGHLIGHT_COLORS). */
export const DEFAULT_HIGHLIGHT_COLOR = '#FEF08A';

const EnhancedHighlight = Highlight.extend({
  addKeyboardShortcuts() {
    // A toggle like Bold: removes any highlight (at a cursor, from the text
    // typed next), otherwise applies the palette yellow (a colorless <mark>
    // would show browser yellow that no swatch matches).
    return {
      'Mod-Shift-h': () =>
        this.editor.isActive('highlight')
          ? this.editor.commands.unsetHighlight()
          : this.editor.commands.setHighlight({ color: DEFAULT_HIGHLIGHT_COLOR }),
    };
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

const SCROLL_GAP_PX = 16;

type ChromeInsets = Record<'top' | 'bottom', number>;

/** How long the list of chrome elements is reused before it is looked up again. */
const INSET_ELEMENTS_TTL_MS = 1000;
let insetElements: HTMLElement[] | null = null;
let insetElementsAt = 0;

if (typeof window !== 'undefined') {
  // A resize can swap the layout (and with it the docked phone toolbar).
  window.addEventListener('resize', () => {
    insetElements = null;
  });
}

/**
 * Elements marked `data-scroll-inset`. Every caret scroll asks for them, and
 * matching an attribute selector visits every node of a long document, so the
 * list is reused until an element leaves the page, the window resizes, or it
 * is a second old (an empty list is never reused).
 */
function scrollInsetElements(): HTMLElement[] {
  const now = performance.now();
  if (
    !insetElements?.length ||
    now - insetElementsAt > INSET_ELEMENTS_TTL_MS ||
    insetElements.some((element) => !element.isConnected)
  ) {
    insetElements = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-inset]'));
    insetElementsAt = now;
  }
  return insetElements;
}

/**
 * Height of sticky or fixed chrome (`data-scroll-inset="top|bottom"`) that
 * covers, or can slide over, an edge of the visual viewport, so caret
 * scrolling keeps the cursor clear of the header and the docked phone toolbar.
 */
function measureChromeInsets(): ChromeInsets {
  const viewport = window.visualViewport;
  const offsetTop = viewport?.offsetTop ?? 0;
  const height = viewport?.height ?? window.innerHeight;
  const insets: ChromeInsets = { top: 0, bottom: 0 };
  scrollInsetElements().forEach((element) => {
    const side = element.dataset.scrollInset;
    if (side !== 'top' && side !== 'bottom') return;
    const rect = element.getBoundingClientRect();
    if (!rect.height) return;
    insets[side] = Math.max(
      insets[side],
      // A header that auto-hides slides back in when the page scrolls up, so
      // reserve its full height rather than its current (hidden) position.
      side === 'top' ? element.offsetHeight : offsetTop + height - rect.top,
    );
  });
  const clamp = (inset: number) => Math.max(0, Math.min(inset, height / 2)) + SCROLL_GAP_PX;
  return { top: clamp(insets.top), bottom: clamp(insets.bottom) };
}

let cachedChromeInsets: ChromeInsets | null = null;

function chromeInset(side: 'top' | 'bottom'): number {
  if (typeof document === 'undefined') return SCROLL_GAP_PX;
  if (!cachedChromeInsets) {
    cachedChromeInsets = measureChromeInsets();
    // One scroll-into-view reads every side (for each scrollable ancestor)
    // synchronously; share a single measurement across those reads.
    queueMicrotask(() => {
      cachedChromeInsets = null;
    });
  }
  return cachedChromeInsets[side];
}

// ProseMirror reads these sides on every scroll-into-view, so the getters
// follow the header hiding or the phone toolbar growing.
const chromeAwareSides = {
  get top() {
    return chromeInset('top');
  },
  get bottom() {
    return chromeInset('bottom');
  },
  left: SCROLL_GAP_PX,
  right: SCROLL_GAP_PX,
};

const ChromeAwareScrolling = Extension.create({
  name: 'chromeAwareScrolling',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('chromeAwareScrolling'),
        props: { scrollThreshold: chromeAwareSides, scrollMargin: chromeAwareSides },
      }),
    ];
  },
});

/** DOM attributes of the editable document; the label follows the interface language. */
export function editorAttributes(label: string): Record<string, string> {
  return {
    class: 'prose max-w-none focus:outline-hidden',
    role: 'textbox',
    dir: 'auto',
    'aria-multiline': 'true',
    'aria-label': label,
  };
}

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
    EnhancedHighlight.configure({
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
    ChromeAwareScrolling,
    ImageFiles,
  ];
}
