import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { coerceGraphic, updateItemLabel } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { SmartGraphicCanvas } from './SmartGraphicCanvas';

export function SmartGraphicView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const graphic = coerceGraphic(node.attrs.graphic);

  return (
    <NodeViewWrapper
      as="div"
      className={cn('lwrite-graphic-view', selected && 'is-selected')}
      data-layout={graphic.layoutId}
    >
      <SmartGraphicCanvas
        graphic={graphic}
        editable
        onChangeLabel={(id, label) => {
          updateAttributes({ graphic: updateItemLabel(graphic, id, label) });
        }}
      />
    </NodeViewWrapper>
  );
}
