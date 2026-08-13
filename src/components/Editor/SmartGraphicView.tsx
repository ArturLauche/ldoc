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
  const graphic = coerceGraphic(node.attrs.graphic);
  const storedActiveId = useEditorState({
    editor,
    selector: ({ editor: current }) => current.storage.smartGraphic?.activeItemId as string | null,
  });
  const activeId = flattenGraphicItems(graphic.items).some((item) => item.id === storedActiveId)
    ? storedActiveId
    : null;

  const selectItem = (id: string) => {
    editor.storage.smartGraphic.activeItemId = id;
    const pos = typeof getPos === 'function' ? getPos() : getPos;
    if (typeof pos === 'number') {
      editor.commands.setNodeSelection(pos);
    }
  };

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
      />
    </NodeViewWrapper>
  );
}
