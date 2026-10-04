import { useCallback, useMemo } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { coerceGraphic, flattenGraphicItems, updateItemLabel } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { SmartGraphicCanvas } from './SmartGraphicCanvas';

export function SmartGraphicView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: ReactNodeViewProps) {
  const stored: unknown = node.attrs.graphic;
  // Parse once per stored value, not on every editor transaction.
  const graphic = useMemo(() => coerceGraphic(stored), [stored]);
  const storedActiveId = useEditorState({
    editor,
    selector: ({ editor: current }) => current.storage.smartGraphic?.activeItemId as string | null,
  });
  const activeId = flattenGraphicItems(graphic.items).some((item) => item.id === storedActiveId)
    ? storedActiveId
    : null;

  const selectItem = useCallback(
    (id: string) => {
      const pos = typeof getPos === 'function' ? getPos() : getPos;
      if (typeof pos === 'number') {
        editor.chain().setNodeSelection(pos).selectSmartGraphicItem(id).run();
      }
    },
    [editor, getPos],
  );

  // Escape from a label returns to the document with the graphic selected,
  // so keyboard users can continue with the arrow keys.
  const exitToDocument = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : getPos;
    const chain = editor.chain().focus();
    if (typeof pos === 'number') chain.setNodeSelection(pos);
    chain.run();
  }, [editor, getPos]);

  return (
    <NodeViewWrapper
      as="div"
      className={cn('lwrite-graphic-view', selected && 'is-selected')}
      data-layout={graphic.layoutId}
    >
      <SmartGraphicCanvas
        graphic={graphic}
        editable
        activeId={activeId}
        onSelectItem={selectItem}
        onChangeLabel={(id, label) => {
          updateAttributes({ graphic: updateItemLabel(graphic, id, label) });
        }}
        onExit={exitToDocument}
      />
    </NodeViewWrapper>
  );
}
