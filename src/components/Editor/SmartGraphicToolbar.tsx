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
import { useLocale } from '@/hooks/useLocale';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import { cn } from '@/lib/utils';
import {
  SMART_GRAPHIC_COLOR_SETS,
  SMART_GRAPHIC_LAYOUTS,
  SMART_GRAPHIC_STYLES,
  addGraphicItem,
  canAddGraphicItem,
  canDemoteGraphicItem,
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
  /** Include the insert-graphic gallery (the phone toolbar has its own). */
  showInsert?: boolean;
  /** Visible text labels for touch layouts, where tooltips do not appear. */
  showLabels?: boolean;
}

export function SmartGraphicToolbar({
  editor,
  showInsert = true,
  showLabels = false,
}: SmartGraphicToolbarProps) {
  const { t, locale } = useLocale();
  const [textPaneOpen, setTextPaneOpen] = useState(false);
  const toolsMenu = useTouchSafeMenu();

  const graphicState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: current.isActive('smartGraphic'),
      graphic: current.isActive('smartGraphic')
        ? coerceGraphic(current.getAttributes('smartGraphic').graphic)
        : null,
      activeItemId: (current.storage.smartGraphic?.activeItemId as string | null) ?? null,
    }),
  });

  const apply = (next: SmartGraphicModel, options?: { focus?: boolean }) => {
    const chain = editor.chain();
    if (options?.focus !== false) {
      chain.focus();
    }
    chain.updateSmartGraphic(next).run();
  };

  const selectItem = (id: string) => {
    editor.commands.selectSmartGraphicItem(id);
  };

  const graphic = graphicState.graphic;
  const selectedId =
    graphicState.activeItemId &&
    graphic &&
    flattenGraphicItems(graphic.items).some((item) => item.id === graphicState.activeItemId)
      ? graphicState.activeItemId
      : (graphic?.items[0]?.id ?? null);
  const layout = graphic ? getSmartGraphicLayout(graphic.layoutId) : null;

  return (
    <div className={cn('flex max-w-full items-center gap-1', !showLabels && 'flex-wrap')}>
      {showInsert ? <SmartGraphicGallery editor={editor} /> : null}
      {graphic && layout ? (
        <>
          {/* Non-modal, so focus stays in the document after an action
              instead of being trapped and returned to the trigger. */}
          <DropdownMenu modal={false} open={toolsMenu.open} onOpenChange={toolsMenu.onOpenChange}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild {...toolsMenu.triggerProps}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-9 gap-1 px-2 text-xs', showLabels && 'h-10 px-3 text-sm')}
                    aria-label={t('graphicTools')}
                  >
                    <span
                      className={cn(
                        'max-w-[5.5rem] truncate',
                        showLabels ? 'max-w-[8rem]' : 'hidden lg:inline',
                      )}
                    >
                      {t('graphicTools')}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('graphicTools')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="start"
              className="w-56 bg-popover border border-border shadow-lg z-50"
            >
              <DropdownMenuLabel>{t('graphicLayout')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={graphic.layoutId}
                onValueChange={(value) =>
                  apply(switchGraphicLayout(graphic, value as SmartGraphicLayoutId, locale))
                }
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
                  apply(
                    updateGraphicAppearance(graphic, { colorSet: value as SmartGraphicColorSet }),
                  )
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
            showLabel={showLabels}
            tooltip={t('graphicAddItem')}
            disabled={!canAddGraphicItem(graphic)}
            onClick={() => apply(addGraphicItem(graphic, selectedId, locale))}
          >
            <Plus className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            showLabel={showLabels}
            tooltip={t('graphicRemoveItem')}
            disabled={!canRemoveGraphicItem(graphic) || !selectedId}
            onClick={() => selectedId && apply(removeGraphicItem(graphic, selectedId))}
          >
            <Trash2 className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            showLabel={showLabels}
            tooltip={t('graphicMoveUp')}
            disabled={!selectedId}
            onClick={() => selectedId && apply(moveGraphicItem(graphic, selectedId, 'up'))}
          >
            <ChevronUp className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            showLabel={showLabels}
            tooltip={t('graphicMoveDown')}
            disabled={!selectedId}
            onClick={() => selectedId && apply(moveGraphicItem(graphic, selectedId, 'down'))}
          >
            <ChevronDown className="h-4 w-4" />
          </ToolbarIconButton>
          {layout.supportsHierarchy ? (
            <>
              <ToolbarIconButton
                showLabel={showLabels}
                tooltip={t('graphicPromote')}
                disabled={!selectedId}
                onClick={() => selectedId && apply(promoteGraphicItem(graphic, selectedId))}
              >
                <IndentDecrease className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                showLabel={showLabels}
                tooltip={t('graphicDemote')}
                disabled={!canDemoteGraphicItem(graphic, selectedId)}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-9 w-9 p-0', showLabels && 'h-10 w-auto gap-1 px-3 text-sm')}
                    aria-label={t('graphicTextPane')}
                  >
                    <ListTree className="h-4 w-4" />
                    {showLabels ? (
                      <span className="whitespace-nowrap">{t('graphicTextPane')}</span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('graphicTextPane')}</TooltipContent>
            </Tooltip>
            <PopoverContent
              aria-label={t('graphicTextPane')}
              align="end"
              className="w-[min(20rem,calc(100vw-1.5rem))] p-3 bg-popover border border-border shadow-lg z-50"
            >
              <div className="space-y-2">
                <Input
                  value={graphic.title}
                  placeholder={t('graphicTitlePlaceholder')}
                  aria-label={t('graphicTitlePlaceholder')}
                  onChange={(event) =>
                    apply(updateGraphicTitle(graphic, event.target.value), { focus: false })
                  }
                  className="h-8"
                />
                <ScrollArea className="h-[min(16rem,50vh)]">
                  <GraphicTextTree
                    items={graphic.items}
                    depth={0}
                    activeId={selectedId}
                    itemAriaLabel={t('graphicItemPlaceholder')}
                    onSelect={selectItem}
                    onChange={(id, label) =>
                      apply(updateItemLabel(graphic, id, label), { focus: false })
                    }
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
  showLabel = false,
  children,
}: {
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  showLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-9 w-9 p-0', showLabel && 'h-10 w-auto gap-1 px-3 text-sm')}
          aria-label={tooltip}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
          {showLabel ? <span className="whitespace-nowrap">{tooltip}</span> : null}
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
  itemAriaLabel,
  onSelect,
  onChange,
}: {
  items: SmartGraphicModel['items'];
  depth: number;
  activeId: string | null;
  itemAriaLabel: string;
  onSelect: (id: string) => void;
  onChange: (id: string, label: string) => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id} className="space-y-1">
          <Input
            value={item.label}
            aria-label={item.label || itemAriaLabel}
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
              itemAriaLabel={itemAriaLabel}
              onSelect={onSelect}
              onChange={onChange}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
