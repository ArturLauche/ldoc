import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import {
  type SmartGraphicColorSet,
  type SmartGraphicItem,
  type SmartGraphicModel,
  type SmartGraphicStyle,
} from '@/lib/smartGraphic';

interface GraphicPalette {
  fills: string[];
  textOnFill: string;
  textOnSubtle: string;
  connector: string;
}

const NAMED_PALETTES: Record<Exclude<SmartGraphicColorSet, 'theme'>, string[]> = {
  blue: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#1e40af', '#93c5fd'],
  green: ['#047857', '#059669', '#10b981', '#34d399', '#065f46', '#6ee7b7'],
  orange: ['#c2410c', '#ea580c', '#f97316', '#fb923c', '#9a3412', '#fdba74'],
  purple: ['#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#5b21b6', '#c4b5fd'],
  gray: ['#374151', '#4b5563', '#6b7280', '#9ca3af', '#1f2937', '#d1d5db'],
};

function getGraphicPalette(colorSet: SmartGraphicColorSet): GraphicPalette {
  if (colorSet === 'theme') {
    return {
      fills: [
        'hsl(var(--primary))',
        'hsl(var(--secondary))',
        'hsl(var(--chart-3))',
        'hsl(var(--chart-4))',
        'hsl(var(--chart-5))',
        'hsl(var(--muted-foreground))',
      ],
      textOnFill: 'hsl(var(--primary-foreground))',
      textOnSubtle: 'hsl(var(--foreground))',
      connector: 'hsl(var(--border))',
    };
  }

  return {
    fills: NAMED_PALETTES[colorSet],
    textOnFill: '#ffffff',
    textOnSubtle: 'hsl(var(--foreground))',
    connector: 'hsl(var(--border))',
  };
}

interface SmartGraphicCanvasProps {
  graphic: SmartGraphicModel;
  compact?: boolean;
  editable?: boolean;
  activeId?: string | null;
  onSelectItem?: (id: string) => void;
  onChangeLabel?: (id: string, label: string) => void;
}

export function SmartGraphicCanvas({
  graphic,
  compact = false,
  editable = false,
  activeId = null,
  onSelectItem,
  onChangeLabel,
}: SmartGraphicCanvasProps) {
  const palette = getGraphicPalette(graphic.colorSet);
  const items = graphic.items;
  const shapeProps = {
    palette,
    style: graphic.style,
    compact,
    editable,
    activeId,
    onSelectItem,
    onChangeLabel,
  };

  return (
    <div
      className={cn('lwrite-graphic-canvas w-full min-w-0', compact && 'pointer-events-none select-none')}
      data-layout={graphic.layoutId}
    >
      {graphic.title ? (
        <p className={cn('mb-3 text-center font-semibold text-foreground', compact && 'mb-1 text-xs')}>
          {graphic.title}
        </p>
      ) : null}
      {graphic.layoutId === 'list-block' ? <BlockList items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'list-horizontal' ? <HorizontalList items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'process-chevron' ? <ChevronProcess items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'process-steps' ? <StepProcess items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'cycle-basic' ? <CycleLayout items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'hierarchy-org' ? <OrgLayout items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'relationship-opposing' ? <OpposingLayout items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'relationship-radial' ? <RadialLayout items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'matrix-grid' ? <MatrixLayout items={items} shapeProps={shapeProps} /> : null}
      {graphic.layoutId === 'pyramid-basic' ? <PyramidLayout items={items} shapeProps={shapeProps} /> : null}
    </div>
  );
}

interface ShapeProps {
  palette: GraphicPalette;
  style: SmartGraphicStyle;
  compact: boolean;
  editable: boolean;
  activeId: string | null;
  onSelectItem?: (id: string) => void;
  onChangeLabel?: (id: string, label: string) => void;
}

function GraphicShape({
  item,
  index,
  shapeProps,
  className,
}: {
  item: SmartGraphicItem;
  index: number;
  shapeProps: ShapeProps;
  className?: string;
}) {
  const fill = shapeProps.palette.fills[index % shapeProps.palette.fills.length];
  const visual = shapeStyle(shapeProps.style, fill, shapeProps.palette);
  const isActive = shapeProps.activeId === item.id;

  return (
    <div
      className={cn(
        'flex min-h-[2.75rem] min-w-0 items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-medium',
        shapeProps.compact && 'min-h-[1.75rem] px-1 py-1 text-[10px] leading-tight',
        isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className,
      )}
      style={visual}
      data-graphic-edit={shapeProps.editable ? 'true' : undefined}
      onMouseDown={(event) => {
        if (!shapeProps.editable) return;
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (!shapeProps.editable) return;
        event.stopPropagation();
        shapeProps.onSelectItem?.(item.id);
      }}
    >
      {shapeProps.editable ? (
        <input
          value={item.label}
          onChange={(event) => shapeProps.onChangeLabel?.(item.id, event.target.value)}
          onFocus={() => shapeProps.onSelectItem?.(item.id)}
          className="w-full min-w-0 bg-transparent text-center outline-none placeholder:text-current/60"
          aria-label={item.label || 'Graphic item'}
        />
      ) : (
        <span className="break-words">{item.label}</span>
      )}
    </div>
  );
}

function shapeStyle(style: SmartGraphicStyle, fill: string, palette: GraphicPalette): CSSProperties {
  switch (style) {
    case 'outline':
      return {
        backgroundColor: 'transparent',
        color: fill,
        border: `2px solid ${fill}`,
      };
    case 'subtle':
      return {
        backgroundColor: fill,
        color: palette.textOnSubtle,
        opacity: 0.78,
        border: `1px solid ${fill}`,
      };
    case 'intense':
      return {
        backgroundColor: fill,
        color: palette.textOnFill,
        boxShadow: '0 10px 24px -12px hsl(var(--foreground) / 0.45)',
      };
    default:
      return {
        backgroundColor: fill,
        color: palette.textOnFill,
      };
  }
}

function BlockList({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <GraphicShape key={item.id} item={item} index={index} shapeProps={shapeProps} />
      ))}
    </div>
  );
}

function HorizontalList({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <GraphicShape
          key={item.id}
          item={item}
          index={index}
          shapeProps={shapeProps}
          className="min-w-[6rem] flex-1"
        />
      ))}
    </div>
  );
}

function ChevronProcess({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1 overflow-x-auto">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="min-w-[7rem] flex-1"
          style={{
            clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)',
            marginLeft: index === 0 ? 0 : -6,
          }}
        >
          <GraphicShape item={item} index={index} shapeProps={shapeProps} className="h-full rounded-none px-4" />
        </div>
      ))}
    </div>
  );
}

function StepProcess({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="relative flex flex-wrap items-start justify-between gap-3 pt-1">
      <div
        className="absolute left-6 right-6 top-5 h-px bg-border"
        style={{ backgroundColor: shapeProps.palette.connector }}
        aria-hidden="true"
      />
      {items.map((item, index) => (
        <div key={item.id} className="relative z-[1] flex min-w-[5.5rem] flex-1 flex-col items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: shapeProps.palette.fills[index % shapeProps.palette.fills.length],
              color: shapeProps.palette.textOnFill,
            }}
          >
            {index + 1}
          </div>
          <GraphicShape item={item} index={index} shapeProps={shapeProps} className="w-full" />
        </div>
      ))}
    </div>
  );
}

function CycleLayout({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div
        className="absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed"
        style={{ borderColor: shapeProps.palette.connector }}
        aria-hidden="true"
      />
      {items.map((item, index) => {
        const angle = (index / items.length) * 2 * Math.PI - Math.PI / 2;
        const x = 50 + 38 * Math.cos(angle);
        const y = 50 + 38 * Math.sin(angle);
        return (
          <div
            key={item.id}
            className="absolute w-[34%] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <GraphicShape item={item} index={index} shapeProps={shapeProps} />
          </div>
        );
      })}
    </div>
  );
}

function OrgLayout({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="flex flex-wrap justify-center gap-6 overflow-x-auto">
      {items.map((item, index) => (
        <OrgNode key={item.id} item={item} index={index} shapeProps={shapeProps} offset={0} />
      ))}
    </div>
  );
}

function OrgNode({
  item,
  index,
  shapeProps,
  offset,
}: {
  item: SmartGraphicItem;
  index: number;
  shapeProps: ShapeProps;
  offset: number;
}) {
  return (
    <div className="flex min-w-[7rem] flex-col items-center">
      <GraphicShape item={item} index={index + offset} shapeProps={shapeProps} className="w-full min-w-[7rem]" />
      {item.children.length > 0 ? (
        <>
          <div className="h-4 w-px" style={{ backgroundColor: shapeProps.palette.connector }} aria-hidden="true" />
          <div className="flex flex-wrap justify-center gap-3">
            {item.children.map((child, childIndex) => (
              <OrgNode
                key={child.id}
                item={child}
                index={childIndex}
                shapeProps={shapeProps}
                offset={index + offset + 1}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function OpposingLayout({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
      <div className="flex flex-col gap-2">
        {left.map((item, index) => (
          <GraphicShape key={item.id} item={item} index={index} shapeProps={shapeProps} />
        ))}
      </div>
      <div className="flex items-center justify-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        vs
      </div>
      <div className="flex flex-col gap-2">
        {right.map((item, index) => (
          <GraphicShape key={item.id} item={item} index={index + left.length} shapeProps={shapeProps} />
        ))}
      </div>
    </div>
  );
}

function RadialLayout({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  const [center, ...rest] = items;
  if (!center) return null;
  return (
    <div className="relative mx-auto min-h-[16rem] w-full max-w-lg">
      <div className="absolute left-1/2 top-1/2 z-[1] w-[42%] -translate-x-1/2 -translate-y-1/2">
        <GraphicShape item={center} index={0} shapeProps={shapeProps} className="min-h-[4.5rem]" />
      </div>
      {rest.map((item, index) => {
        const angle = (index / Math.max(rest.length, 1)) * 2 * Math.PI - Math.PI / 2;
        const x = 50 + 38 * Math.cos(angle);
        const y = 50 + 38 * Math.sin(angle);
        return (
          <div
            key={item.id}
            className="absolute w-[28%] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <GraphicShape item={item} index={index + 1} shapeProps={shapeProps} />
          </div>
        );
      })}
    </div>
  );
}

function MatrixLayout({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.slice(0, 4).map((item, index) => (
        <GraphicShape key={item.id} item={item} index={index} shapeProps={shapeProps} className="min-h-[4.5rem]" />
      ))}
    </div>
  );
}

function PyramidLayout({ items, shapeProps }: { items: SmartGraphicItem[]; shapeProps: ShapeProps }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {items.map((item, index) => {
        const width = 46 + ((index + 1) / items.length) * 54;
        return (
          <div key={item.id} style={{ width: `${width}%` }} className="min-w-[8rem]">
            <GraphicShape item={item} index={index} shapeProps={shapeProps} />
          </div>
        );
      })}
    </div>
  );
}
