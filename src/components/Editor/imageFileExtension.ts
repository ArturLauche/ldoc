import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { dropPoint } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';
import { readFileAsDataUrl, validateImageFile, type ImageFileError } from '@/lib/media';

/** Bubbles from the editor DOM when a pasted or dropped file cannot become an image. */
export const IMAGE_FILE_ERROR_EVENT = 'lwrite:image-file-error';

export type ImageFileErrorCode = ImageFileError | 'not-image-drop' | 'read-failed';

function reportError(view: EditorView, code: ImageFileErrorCode) {
  view.dom.dispatchEvent(
    new CustomEvent<ImageFileErrorCode>(IMAGE_FILE_ERROR_EVENT, { detail: code, bubbles: true }),
  );
}

const isFileDrag = (types: readonly string[] | undefined) => Boolean(types?.includes('Files'));

/** Document position under the pointer, or null to use the selection. */
function dropPosition(view: EditorView, event: DragEvent): number | null {
  try {
    return view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
  } catch {
    return null;
  }
}

/** Inserts images read locally from files; nothing leaves the device. */
async function insertImageFiles(view: EditorView, files: File[], position: number | null) {
  let at = position;
  for (const file of files) {
    const validation = validateImageFile(file);
    if (!validation.ok) {
      reportError(view, validation.code);
      continue;
    }
    let src: string;
    try {
      src = await readFileAsDataUrl(file);
    } catch {
      if (!view.isDestroyed) reportError(view, 'read-failed');
      continue;
    }
    if (view.isDestroyed) return;
    const imageType = view.state.schema.nodes.image;
    if (!imageType) return;
    const node = imageType.create({ src, alt: file.name });
    const { tr } = view.state;
    const target =
      at === null
        ? null
        : (dropPoint(
            tr.doc,
            Math.min(at, tr.doc.content.size),
            new Slice(Fragment.from(node), 0, 0),
          ) ?? null);
    if (target === null) {
      tr.replaceSelectionWith(node);
    } else {
      tr.insert(target, node);
      // Several dropped files land in order, one after another.
      at = target + node.nodeSize;
    }
    view.dispatch(tr.scrollIntoView());
  }
}

/**
 * Pasted screenshots and dropped image files become images at the cursor or
 * drop point. Other dropped files are refused instead of letting the browser
 * navigate away from the editor.
 */
export const ImageFiles = Extension.create({
  name: 'imageFiles',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imageFiles'),
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            const files = Array.from(data?.files ?? []);
            // Copied text (with or without images) keeps the normal paste.
            if (!files.length || data?.getData('text/plain')) return false;
            const images = files.filter((file) => file.type.startsWith('image/'));
            if (!images.length) return false;
            event.preventDefault();
            void insertImageFiles(view, images, null);
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (moved || !isFileDrag(event.dataTransfer?.types)) return false;
            const files = Array.from(event.dataTransfer?.files ?? []);
            event.preventDefault();
            const images = files.filter((file) => file.type.startsWith('image/'));
            if (!images.length) {
              reportError(view, 'not-image-drop');
              return true;
            }
            void insertImageFiles(view, images, dropPosition(view, event));
            return true;
          },
        },
      }),
    ];
  },
});
