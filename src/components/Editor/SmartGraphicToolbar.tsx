import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  LayoutTemplate,
  ListPlus,
  ListTree,
  Minus,
  Palette,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/hooks/useLocale';
import { cn } from '@/lib/utils';
import {
  canAddGraphicChild,
  canAddGraphicItem,
  canDemoteGraphicItem,
  canMoveGraphicItem,
  canPromoteGraphicItem,
  canRemoveGraphicItem,
  coerceGraphic,
  demoteGraphicItem,
  flattenGraphicItems,
  getSmartGraphicLayout,
  graphicSelectionAfterRemoval,
  insertGraphicChild,
  insertGraphicItem,
  moveGraphicItem,
  promoteGraphicItem,
  removeGraphicItem,
  switchGraphicLayout,
  updateGraphicAppearance,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { formatMessage } from '@/lib/translations';
import { DesignPicker } from './graphics/DesignPicker';
import { LayoutPicker } from './graphics/LayoutPicker';
import { TextPane } from './graphics/TextPane';
import { GRAPHIC_LAYOUT_KEYS } from './smartGraphicLabels';
import { SmartGraphicGallery } from './SmartGraphicGallery';

interface SmartGraphicToolbarProps {
  editor: Editor;
  /** Include the insert-graphic gallery (the phone toolbar has its own). */
  showInsert?: boolean;
  /** Visible text labels for touch layouts, where tooltips do not appear. */
  showLabels?: boolean;
}

/** Moves focus into a shape's label once the node view has rendered it. */
function focusGraphicLabel(editor: Editor, id: string) {
  const attempt = (retries: number) => {
    if (editor.isDestroyed) return;
    const label = editor.view.dom.querySelector<HTMLTextAreaElement>(
      // Ids are sanitized to [A-Za-z0-9_-], so they are safe in a selector.
      `textarea[data-graphic-label="${id}"]`,
    );
    if (label) {
      label.focus();
      label.select();
    } else if (retries > 0) {
      requestAnimationFrame(() => attempt(retries - 1));
    }
  };
  attempt(3);
}

export function SmartGraphicToolbar({
  editor,
  showInsert = true,
  showLabels = false,
}: SmartGraphicToolbarProps) {
  const { t, locale } = useLocale();
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [textPaneOpen, setTextPaneOpen] = useState(false);

  const graphicState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
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

  const selectItem = (id: string | null) => {
    editor.commands.selectSmartGraphicItem(id);
  };

  const graphic = graphicState.graphic;
  if (!graphic) {
    return showInsert ? <SmartGraphicGallery editor={editor} /> : null;
  }

  const layout = getSmartGraphicLayout(graphic.layoutId);
  // Item actions apply to the shape the user picked; nothing is assumed.
  const selectedId =
    graphicState.activeItemId &&
    flattenGraphicItems(graphic.items).some((item) => item.id === graphicState.activeItemId)
      ? graphicState.activeItemId
      : null;
  const needsSelection = selectedId ? undefined : t('graphicSelectItemReason');
  const layoutName = t(GRAPHIC_LAYOUT_KEYS[layout.id]);

  const addItem = (child: boolean) => {
    const { model, itemId } =
      child && selectedId
        ? insertGraphicChild(graphic, selectedId, locale)
        : insertGraphicItem(graphic, selectedId, locale);
    if (!itemId) return;
    apply(model);
    selectItem(itemId);
    focusGraphicLabel(editor, itemId);
  };

  const removeItem = () => {
    if (!selectedId) return;
    const next = graphicSelectionAfterRemoval(graphic, selectedId);
    apply(removeGraphicItem(graphic, selectedId));
    selectItem(next);
  };

  const separator = <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

  return (
    <div className={cn('flex max-w-full items-center gap-0.5', !showLabels && 'flex-wrap')}>
      {showInsert ? <SmartGraphicGallery editor={editor} /> : null}

      <Popover open={layoutOpen} onOpenChange={setLayoutOpen}>
        <ToolbarTrigger
          label={t('graphicChangeLayout')}
          showLabel={showLabels}
          icon={<LayoutTemplate className="h-4 w-4" />}
          text={layoutName}
        />
        <PopoverContent
          align="start"
          className="w-[min(30rem,calc(100vw-1.5rem))] border border-border bg-popover p-3 shadow-lg"
        >
          <LayoutPicker
            graphic={graphic}
            onChange={(layoutId) => apply(switchGraphicLayout(graphic, layoutId, locale), { focus: false })}
          />
        </PopoverContent>
      </Popover>

      <Popover open={designOpen} onOpenChange={setDesignOpen}>
        <ToolbarTrigger
          label={t('graphicDesign')}
          showLabel={showLabels}
          icon={<Palette className="h-4 w-4" />}
        />
        <PopoverContent
          align="start"
          className="w-[min(19rem,calc(100vw-1.5rem))] border border-border bg-popover p-3 shadow-lg"
        >
          <DesignPicker
            colorSet={graphic.colorSet}
            style={graphic.style}
            onChange={(patch) => apply(updateGraphicAppearance(graphic, patch), { focus: false })}
          />
        </PopoverContent>
      </Popover>

      {separator}

      <ToolbarIconButton
        showLabel={showLabels}
        label={t('graphicAddItem')}
        disabledReason={
          canAddGraphicItem(graphic)
            ? undefined
            : formatMessage(t('graphicMaxItemsReason'), { count: layout.maxItems })
        }
        onClick={() => addItem(false)}
      >
        <Plus className="h-4 w-4" />
      </ToolbarIconButton>
      {layout.supportsHierarchy ? (
        <ToolbarIconButton
          showLabel={showLabels}
          label={t('graphicAddChild')}
          disabledReason={
            !selectedId
              ? needsSelection
              : !canAddGraphicItem(graphic)
                ? formatMessage(t('graphicMaxItemsReason'), { count: layout.maxItems })
                : canAddGraphicChild(graphic, selectedId)
                  ? undefined
                  : ''
          }
          onClick={() => addItem(true)}
        >
          <ListPlus className="h-4 w-4" />
        </ToolbarIconButton>
      ) : null}
      <ToolbarIconButton
        showLabel={showLabels}
        label={t('graphicRemoveItem')}
        disabledReason={
          !selectedId
            ? needsSelection
            : canRemoveGraphicItem(graphic)
              ? undefined
              : formatMessage(t('graphicMinItemsReason'), { count: layout.minItems })
        }
        onClick={removeItem}
      >
        <Minus className="h-4 w-4" />
      </ToolbarIconButton>

      {separator}

      <ToolbarIconButton
        showLabel={showLabels}
        label={t('graphicMoveUp')}
        disabledReason={!selectedId ? needsSelection : canMoveGraphicItem(graphic, selectedId, 'up') ? undefined : ''}
        onClick={() => selectedId && apply(moveGraphicItem(graphic, selectedId, 'up'))}
      >
        <ArrowUp className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        showLabel={showLabels}
        label={t('graphicMoveDown')}
        disabledReason={!selectedId ? needsSelection : canMoveGraphicItem(graphic, selectedId, 'down') ? undefined : ''}
        onClick={() => selectedId && apply(moveGraphicItem(graphic, selectedId, 'down'))}
      >
        <ArrowDown className="h-4 w-4" />
      </ToolbarIconButton>
      {layout.supportsHierarchy ? (
        <>
          <ToolbarIconButton
            showLabel={showLabels}
            label={t('graphicPromote')}
            disabledReason={!selectedId ? needsSelection : canPromoteGraphicItem(graphic, selectedId) ? undefined : ''}
            onClick={() => selectedId && apply(promoteGraphicItem(graphic, selectedId))}
          >
            <IndentDecrease className="h-4 w-4 rtl:-scale-x-100" />
          </ToolbarIconButton>
          <ToolbarIconButton
            showLabel={showLabels}
            label={t('graphicDemote')}
            disabledReason={!selectedId ? needsSelection : canDemoteGraphicItem(graphic, selectedId) ? undefined : ''}
            onClick={() => selectedId && apply(demoteGraphicItem(graphic, selectedId))}
          >
            <IndentIncrease className="h-4 w-4 rtl:-scale-x-100" />
          </ToolbarIconButton>
        </>
      ) : null}

      {separator}

      <Popover open={textPaneOpen} onOpenChange={setTextPaneOpen}>
        <ToolbarTrigger
          label={t('graphicTextPane')}
          showLabel={showLabels}
          icon={<ListTree className="h-4 w-4" />}
          chevron={false}
        />
        <PopoverContent
          aria-label={t('graphicTextPane')}
          align="end"
          className="w-[min(21rem,calc(100vw-1.5rem))] border border-border bg-popover p-3 shadow-lg"
        >
          <TextPane
            graphic={graphic}
            activeId={selectedId}
            onSelect={selectItem}
            onChange={(next) => apply(next, { focus: false })}
          />
        </PopoverContent>
      </Popover>
      <ToolbarIconButton
        showLabel={showLabels}
        label={t('graphicDelete')}
        onClick={() => editor.chain().focus().deleteSmartGraphic().run()}
        className="hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </ToolbarIconButton>
    </div>
  );
}

/** Popover trigger with a tooltip; shows text on touch layouts (and the layout name on wide screens). */
function ToolbarTrigger({
  label,
  showLabel,
  icon,
  text,
  chevron = true,
}: {
  label: string;
  showLabel: boolean;
  icon: ReactNode;
  /** Visible text when it differs from the label (e.g. the current layout name). */
  text?: string;
  chevron?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-9 shrink-0 gap-1 px-2 text-xs',
              !showLabel && !text && 'w-9 p-0',
              showLabel && 'h-10 px-3 text-sm',
            )}
            aria-label={label}
          >
            {icon}
            {showLabel ? (
              <span className="max-w-[9rem] truncate whitespace-nowrap">{text ?? label}</span>
            ) : text ? (
              <span className="hidden max-w-[8rem] truncate lg:inline">{text}</span>
            ) : null}
            {chevron && (showLabel || text) ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : null}
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Icon button whose unavailable state stays focusable and explains itself:
 * `disabledReason` (possibly empty) marks it unavailable, and a non-empty
 * reason is shown in the tooltip.
 */
function ToolbarIconButton({
  label,
  disabledReason,
  onClick,
  showLabel = false,
  className,
  children,
}: {
  label: string;
  disabledReason?: string;
  onClick: () => void;
  showLabel?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const disabled = disabledReason !== undefined;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 w-9 shrink-0 p-0',
            showLabel && 'h-10 w-auto gap-1 px-3 text-sm',
            disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
            !disabled && className,
          )}
          aria-label={label}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) onClick();
          }}
        >
          {children}
          {showLabel ? <span className="whitespace-nowrap">{label}</span> : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem]">
        <span className="block">{label}</span>
        {disabledReason ? <span className="block text-xs opacity-75">{disabledReason}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
