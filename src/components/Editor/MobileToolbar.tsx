import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Plus,
  Redo,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
  Undo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/hooks/useLocale';
import { useScrollFade } from '@/hooks/useScrollFade';
import { keepEditorFocus } from '@/lib/inputModality';
import { cn } from '@/lib/utils';
import { FontPicker } from './FontPicker';
import { ImageToolbar } from './ImageToolbar';
import { SmartGraphicGallery } from './SmartGraphicGallery';
import { SmartGraphicToolbar } from './SmartGraphicToolbar';
import { TableGridPicker } from './TableGridPicker';
import { TableToolbar } from './TableToolbar';
import { ColorSwatchGrid, LinkPopover, ToolTile } from './toolbarControls';
import {
  DEFAULT_FONT_SIZE,
  HIGHLIGHT_COLORS,
  MAX_FONT_SIZE_PX,
  MIN_FONT_SIZE_PX,
  TEXT_BLOCK_STYLES,
  TEXT_COLORS,
  applyTextBlockStyle,
  stepFontSize,
  useLineSpacings,
  useToolbarState,
  type TextAlignment,
} from './toolbarModel';

type Panel = 'format' | 'insert';
type FormatTab = 'text' | 'color' | 'paragraph';

const FORMAT_PANEL_ID = 'mobile-format-panel';
const INSERT_PANEL_ID = 'mobile-insert-panel';

function BarButton({
  label,
  pressed,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn('bar-button', className)}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="toolbar-chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Phone toolbar docked above the software keyboard. One row keeps the most
 * frequent actions in thumb reach; less common formatting and insertions open
 * in labeled panels instead of a wrapping multi-row toolbar, and the editor
 * keeps focus (and its keyboard) while buttons are pressed.
 */
export const MobileToolbar = memo(function MobileToolbar({ editor }: { editor: Editor | null }) {
  const { t } = useLocale();
  const state = useToolbarState(editor);
  const lineSpacings = useLineSpacings(t);
  const rootRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [tab, setTab] = useState<FormatTab>('text');
  const mainFadeRef = useScrollFade<HTMLDivElement>();
  const contextFadeRef = useScrollFade<HTMLDivElement>();
  const stylesFadeRef = useScrollFade<HTMLDivElement>();

  // Publish the docked height so the page can reserve room for it.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty('--bottom-chrome-height', `${Math.ceil(element.offsetHeight)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--bottom-chrome-height');
    };
  }, [editor]);

  useEffect(() => {
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Open menus, popovers and dialogs claim Escape first (Radix prevents
      // the default while dismissing in the capture phase).
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setPanel(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panel]);

  if (!editor || !state) return null;

  const togglePanel = (next: Panel) => setPanel((current) => (current === next ? null : next));
  // Insertions are one-off: give the room back once focus is in the document.
  const closePanel = () => setPanel(null);
  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    command(editor.chain().focus()).run();
  const setAlignment = (alignment: TextAlignment) => run((chain) => chain.setTextAlign(alignment));
  const fontSizePx = Number.parseInt(state.fontSize, 10);
  const hasContext = state.inTable || state.inGraphic || state.imageSelected || state.link;

  return (
    <div
      ref={rootRef}
      className="mobile-toolbar"
      role="group"
      aria-label={t('formattingToolbar')}
      data-editor-chrome
      data-scroll-inset="bottom"
      onMouseDown={keepEditorFocus}
    >
      {panel === 'format' ? (
        <div
          id={FORMAT_PANEL_ID}
          role="region"
          aria-label={t('formatPanelLabel')}
          className="mobile-panel"
        >
          <Tabs value={tab} onValueChange={(value) => setTab(value as FormatTab)}>
            <TabsList className="mobile-panel-tabs">
              <TabsTrigger value="text">{t('formatTabText')}</TabsTrigger>
              <TabsTrigger value="color">{t('formatTabColor')}</TabsTrigger>
              <TabsTrigger value="paragraph">{t('formatTabParagraph')}</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="mobile-panel-body">
              <div
                ref={stylesFadeRef}
                className="scroll-strip panel-row"
                role="group"
                aria-label={t('toolbarTextStyle')}
              >
                {TEXT_BLOCK_STYLES.map((style) => (
                  <Chip
                    key={style.value}
                    pressed={state.blockStyle === style.value}
                    onClick={() => applyTextBlockStyle(editor, style.value)}
                  >
                    {t(style.label)}
                  </Chip>
                ))}
              </div>
              <div className="panel-row gap-0.5">
                <BarButton
                  label={t('toolbarUnderline')}
                  pressed={state.underline}
                  onClick={() => run((chain) => chain.toggleUnderline())}
                >
                  <Underline />
                </BarButton>
                <BarButton
                  label={t('toolbarStrikethrough')}
                  pressed={state.strike}
                  onClick={() => run((chain) => chain.toggleStrike())}
                >
                  <Strikethrough />
                </BarButton>
                <BarButton
                  label={t('toolbarSuperscript')}
                  pressed={state.superscript}
                  onClick={() => run((chain) => chain.toggleSuperscript())}
                >
                  <Superscript />
                </BarButton>
                <BarButton
                  label={t('toolbarSubscript')}
                  pressed={state.subscript}
                  onClick={() => run((chain) => chain.toggleSubscript())}
                >
                  <Subscript />
                </BarButton>
                <BarButton
                  label={t('toolbarClearFormatting')}
                  onClick={() => run((chain) => chain.unsetAllMarks().clearNodes())}
                >
                  <RemoveFormatting />
                </BarButton>
              </div>
              <div className="panel-row">
                <FontPicker
                  value={state.fontFamily}
                  align="center"
                  label={t('fontLabel')}
                  triggerClassName="h-11 w-auto min-w-0 flex-1 gap-2 text-sm"
                  onChange={(value) => {
                    if (value === '') editor.chain().focus().unsetFontFamily().run();
                    else editor.chain().focus().setFontFamily(value).run();
                  }}
                />
                <div className="font-size-stepper" role="group" aria-label={t('toolbarFontSize')}>
                  <BarButton
                    label={t('decreaseFontSize')}
                    disabled={fontSizePx <= MIN_FONT_SIZE_PX}
                    onClick={() =>
                      run((chain) =>
                        chain.setMark('textStyle', { fontSize: stepFontSize(state.fontSize, -1) }),
                      )
                    }
                  >
                    <AArrowDown />
                  </BarButton>
                  <output className="font-size-value" aria-live="polite">
                    {Number.isFinite(fontSizePx)
                      ? fontSizePx
                      : Number.parseFloat(DEFAULT_FONT_SIZE)}
                  </output>
                  <BarButton
                    label={t('increaseFontSize')}
                    disabled={fontSizePx >= MAX_FONT_SIZE_PX}
                    onClick={() =>
                      run((chain) =>
                        chain.setMark('textStyle', { fontSize: stepFontSize(state.fontSize, 1) }),
                      )
                    }
                  >
                    <AArrowUp />
                  </BarButton>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="color" className="mobile-panel-body">
              <p className="panel-label">{t('toolbarTextColor')}</p>
              <ColorSwatchGrid
                editor={editor}
                kind="text"
                colors={TEXT_COLORS}
                className="panel-swatches"
                swatchClassName="h-9 w-full"
              />
              <p className="panel-label">{t('toolbarHighlight')}</p>
              <ColorSwatchGrid
                editor={editor}
                kind="highlight"
                colors={HIGHLIGHT_COLORS}
                className="panel-swatches"
                swatchClassName="h-9 w-full"
              />
            </TabsContent>
            <TabsContent value="paragraph" className="mobile-panel-body">
              <div className="panel-row flex-wrap justify-between gap-y-1">
                <div
                  className="flex items-center gap-0.5"
                  role="group"
                  aria-label={t('paragraphAlignment')}
                >
                  <BarButton
                    label={t('toolbarAlignLeft')}
                    pressed={state.alignment === 'left'}
                    onClick={() => setAlignment('left')}
                  >
                    <AlignLeft />
                  </BarButton>
                  <BarButton
                    label={t('toolbarAlignCenter')}
                    pressed={state.alignment === 'center'}
                    onClick={() => setAlignment('center')}
                  >
                    <AlignCenter />
                  </BarButton>
                  <BarButton
                    label={t('toolbarAlignRight')}
                    pressed={state.alignment === 'right'}
                    onClick={() => setAlignment('right')}
                  >
                    <AlignRight />
                  </BarButton>
                  <BarButton
                    label={t('toolbarAlignJustify')}
                    pressed={state.alignment === 'justify'}
                    onClick={() => setAlignment('justify')}
                  >
                    <AlignJustify />
                  </BarButton>
                </div>
                <div
                  className="flex items-center gap-0.5"
                  role="group"
                  aria-label={t('paragraphIndent')}
                >
                  <BarButton
                    label={t('toolbarDecreaseIndent')}
                    disabled={!state.canOutdent}
                    onClick={() => run((chain) => chain.liftListItem('listItem'))}
                  >
                    <IndentDecrease />
                  </BarButton>
                  <BarButton
                    label={t('toolbarIncreaseIndent')}
                    disabled={!state.canIndent}
                    onClick={() => run((chain) => chain.sinkListItem('listItem'))}
                  >
                    <IndentIncrease />
                  </BarButton>
                </div>
              </div>
              <p className="panel-label">{t('toolbarLineSpacing')}</p>
              <div
                className="panel-row flex-wrap"
                role="group"
                aria-label={t('toolbarLineSpacing')}
              >
                {lineSpacings.map((spacing) => (
                  <Chip
                    key={spacing.value}
                    pressed={state.lineHeight === spacing.value}
                    onClick={() =>
                      run((chain) => chain.setMark('textStyle', { lineHeight: spacing.value }))
                    }
                  >
                    {spacing.name}
                  </Chip>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {panel === 'insert' ? (
        <div
          id={INSERT_PANEL_ID}
          role="region"
          aria-label={t('insertPanelToggle')}
          className="mobile-panel"
        >
          <div className="grid grid-cols-4 gap-1">
            <LinkPopover
              editor={editor}
              onComplete={closePanel}
              trigger={
                <ToolTile
                  icon={<Link />}
                  label={t('insertLinkShort')}
                  aria-label={t('toolbarLink')}
                />
              }
            />
            <ImageToolbar editor={editor} variant="tile" onComplete={closePanel} />
            <TableGridPicker editor={editor} variant="tile" onComplete={closePanel} />
            <SmartGraphicGallery editor={editor} variant="tile" onComplete={closePanel} />
          </div>
        </div>
      ) : null}

      {hasContext && !panel ? (
        <div ref={contextFadeRef} className="mobile-context scroll-strip">
          {state.inTable ? <TableToolbar editor={editor} showInsert={false} showLabels /> : null}
          {state.inGraphic ? (
            <SmartGraphicToolbar editor={editor} showInsert={false} showLabels />
          ) : null}
          {state.imageSelected ? <ImageToolbar editor={editor} variant="context" /> : null}
          {state.link ? (
            <LinkPopover
              editor={editor}
              align="start"
              trigger={
                <Button variant="ghost" size="sm" className="h-10 shrink-0 gap-1 px-3 text-sm">
                  <Link className="h-4 w-4" />
                  <span className="whitespace-nowrap">{t('insertLinkShort')}</span>
                </Button>
              }
            />
          ) : null}
        </div>
      ) : null}

      <div className="mobile-toolbar-main">
        <div ref={mainFadeRef} className="mobile-toolbar-scroll scroll-strip">
          <BarButton
            label={t('toolbarUndo')}
            disabled={!state.canUndo}
            onClick={() => run((chain) => chain.undo())}
          >
            <Undo />
          </BarButton>
          <BarButton
            label={t('toolbarRedo')}
            disabled={!state.canRedo}
            onClick={() => run((chain) => chain.redo())}
          >
            <Redo />
          </BarButton>
          <span className="bar-separator" aria-hidden="true" />
          <BarButton
            label={t('toolbarBold')}
            pressed={state.bold}
            onClick={() => run((chain) => chain.toggleBold())}
          >
            <Bold />
          </BarButton>
          <BarButton
            label={t('toolbarItalic')}
            pressed={state.italic}
            onClick={() => run((chain) => chain.toggleItalic())}
          >
            <Italic />
          </BarButton>
          {/* Narrow phones keep underline in the Text panel only. */}
          <BarButton
            label={t('toolbarUnderline')}
            pressed={state.underline}
            className="bar-optional"
            onClick={() => run((chain) => chain.toggleUnderline())}
          >
            <Underline />
          </BarButton>
          <span className="bar-separator" aria-hidden="true" />
          <BarButton
            label={t('toolbarBulletList')}
            pressed={state.bulletList}
            onClick={() => run((chain) => chain.toggleBulletList())}
          >
            <List />
          </BarButton>
          <BarButton
            label={t('toolbarOrderedList')}
            pressed={state.orderedList}
            onClick={() => run((chain) => chain.toggleOrderedList())}
          >
            <ListOrdered />
          </BarButton>
        </div>
        <div className="mobile-toolbar-pinned">
          <Button
            type="button"
            variant="ghost"
            className={cn('bar-button', panel === 'format' && 'is-open')}
            aria-label={t('formatPanelToggle')}
            aria-expanded={panel === 'format'}
            aria-controls={panel === 'format' ? FORMAT_PANEL_ID : undefined}
            onClick={() => togglePanel('format')}
          >
            <Type />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn('bar-button', panel === 'insert' && 'is-open')}
            aria-label={t('insertPanelToggle')}
            aria-expanded={panel === 'insert'}
            aria-controls={panel === 'insert' ? INSERT_PANEL_ID : undefined}
            onClick={() => togglePanel('insert')}
          >
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
});
