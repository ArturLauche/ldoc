import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  ChevronDown,
  ChevronUp,
  IndentDecrease,
  IndentIncrease,
  ListTree,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/components/locale-provider';
import {
  SMART_GRAPHIC_COLOR_SETS,
  SMART_GRAPHIC_LAYOUTS,
  SMART_GRAPHIC_STYLES,
  addGraphicItem,
  canAddGraphicItem,
  canRemoveGraphicItem,
  coerceGraphic,
  demoteGraphicItem,
  flattenGraphicItems,
  getSmartGraphicLayout,
  moveGraphicItem,
  promoteGraphicItem,
  removeGraphicItem,
  switchGraphicLayout,
  updateGraphicAppearance,
  updateGraphicTitle,
  updateItemLabel,
  type SmartGraphicColorSet,
  type SmartGraphicLayoutId,
  type SmartGraphicModel,
  type SmartGraphicStyle,
} from '@/lib/smartGraphic';
import type { TranslationKey } from '@/lib/translations';
import { GRAPHIC_LAYOUT_KEYS } from './smartGraphicLabels';
import { SmartGraphicGallery } from './SmartGraphicGallery';

const COLOR_KEYS: Record<SmartGraphicColorSet, TranslationKey> = {
  theme: 'graphicColorTheme',
  blue: 'graphicColorBlue',
  green: 'graphicColorGreen',
  orange: 'graphicColorOrange',
  purple: 'graphicColorPurple',
  gray: 'graphicColorGray',
};

const STYLE_KEYS: Record<SmartGraphicStyle, TranslationKey> = {
  filled: 'graphicStyleFilled',
  outline: 'graphicStyleOutline',
  subtle: 'graphicStyleSubtle',
  intense: 'graphicStyleIntense',
};

interface SmartGraphicToolbarProps {
  editor: Editor;
}

export function SmartGraphicToolbar({ editor }: SmartGraphicToolbarProps) {
  const { t } = useLocale();
  const [textPaneOpen, setTextPaneOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const graphicState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: current.isActive('smartGraphic'),
      graphic: current.isActive('smartGraphic')
        ? coerceGraphic(current.getAttributes('smartGraphic').graphic)
        : null,
    }),
  });

  const apply = (next: SmartGraphicModel) => {
    editor.chain().focus().updateSmartGraphic(next).run();
  };

  const graphic = graphicState.graphic;
  const selectedId = activeId && graphic && flattenGraphicItems(graphic.items).some((item) => item.id === activeId)
    ? activeId
    : graphic?.items[0]?.id ?? null;
  const layout = graphic ? getSmartGraphicLayout(graphic.layoutId) : null;

  return (
    <div className="flex items-center gap-0.5">
      <SmartGraphicGallery editor={editor} />
      {graphic && layout ? (
        <>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    aria-label={t('graphicTools')}
                  >
                    <span className="hidden max-w-[5.5rem] truncate sm:inline">{t('graphicTools')}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('graphicTools')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-56 bg-popover border border-border shadow-lg z-50">
              <DropdownMenuLabel>{t('graphicLayout')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={graphic.layoutId}
                onValueChange={(value) => apply(switchGraphicLayout(graphic, value as SmartGraphicLayoutId))}
              >
                {SMART_GRAPHIC_LAYOUTS.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id} className="text-sm">
                    {t(GRAPHIC_LAYOUT_KEYS[item.id])}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('graphicColorSet')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={graphic.colorSet}
                onValueChange={(value) =>
                  apply(updateGraphicAppearance(graphic, { colorSet: value as SmartGraphicColorSet }))
                }
              >
                {SMART_GRAPHIC_COLOR_SETS.map((colorSet) => (
                  <DropdownMenuRadioItem key={colorSet} value={colorSet}>
                    {t(COLOR_KEYS[colorSet])}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('graphicStyle')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={graphic.style}
                onValueChange={(value) =>
                  apply(updateGraphicAppearance(graphic, { style: value as SmartGraphicStyle }))
                }
              >
                {SMART_GRAPHIC_STYLES.map((style) => (
                  <DropdownMenuRadioItem key={style} value={style}>
                    {t(STYLE_KEYS[style])}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editor.chain().focus().deleteSmartGraphic().run()}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('graphicDelete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarIconButton
            tooltip={t('graphicAddItem')}
            disabled={!canAddGraphicItem(graphic)}
            onClick={() => apply(addGraphicItem(graphic, selectedId))}
          >
            <Plus className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            tooltip={t('graphicRemoveItem')}
            disabled={!canRemoveGraphicItem(graphic) || !selectedId}
            onClick={() => selectedId && apply(removeGraphicItem(graphic, selectedId))}
          >
            <Trash2 className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            tooltip={t('graphicMoveUp')}
            disabled={!selectedId}
            onClick={() => selectedId && apply(moveGraphicItem(graphic, selectedId, 'up'))}
          >
            <ChevronUp className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            tooltip={t('graphicMoveDown')}
            disabled={!selectedId}
            onClick={() => selectedId && apply(moveGraphicItem(graphic, selectedId, 'down'))}
          >
            <ChevronDown className="h-4 w-4" />
          </ToolbarIconButton>
          {layout.supportsHierarchy ? (
            <>
              <ToolbarIconButton
                tooltip={t('graphicPromote')}
                disabled={!selectedId}
                onClick={() => selectedId && apply(promoteGraphicItem(graphic, selectedId))}
              >
                <IndentDecrease className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                tooltip={t('graphicDemote')}
                disabled={!selectedId}
                onClick={() => selectedId && apply(demoteGraphicItem(graphic, selectedId))}
              >
                <IndentIncrease className="h-4 w-4" />
              </ToolbarIconButton>
            </>
          ) : null}

          <Popover open={textPaneOpen} onOpenChange={setTextPaneOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('graphicTextPane')}>
                    <ListTree className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('graphicTextPane')}</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              className="w-[min(20rem,calc(100vw-1.5rem))] p-3 bg-popover border border-border shadow-lg z-50"
            >
              <div className="space-y-2">
                <Input
                  value={graphic.title}
                  placeholder={t('graphicTitlePlaceholder')}
                  aria-label={t('graphicTitlePlaceholder')}
                  onChange={(event) => apply(updateGraphicTitle(graphic, event.target.value))}
                  className="h-8"
                />
                <ScrollArea className="max-h-64">
                  <GraphicTextTree
                    items={graphic.items}
                    depth={0}
                    activeId={selectedId}
                    onSelect={setActiveId}
                    onChange={(id, label) => apply(updateItemLabel(graphic, id, label))}
                  />
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </div>
  );
}

function ToolbarIconButton({
  tooltip,
  disabled,
  onClick,
  children,
}: {
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={tooltip}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function GraphicTextTree({
  items,
  depth,
  activeId,
  onSelect,
  onChange,
}: {
  items: SmartGraphicModel['items'];
  depth: number;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, label: string) => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id} className="space-y-1">
          <Input
            value={item.label}
            aria-label={item.label || 'Graphic item'}
            onFocus={() => onSelect(item.id)}
            onChange={(event) => onChange(item.id, event.target.value)}
            className={item.id === activeId ? 'h-8 ring-1 ring-ring' : 'h-8'}
            style={{ marginLeft: depth * 12, width: `calc(100% - ${depth * 12}px)` }}
          />
          {item.children.length ? (
            <GraphicTextTree
              items={item.children}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onChange={onChange}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
