import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Editor } from '@tiptap/react';
import { Check } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/hooks/useLocale';
import { normalizeLinkUrl } from '@/lib/links';
import { ariaKeyShortcut, formatShortcut } from '@/lib/shortcuts';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { NO_COLOR } from './toolbarModel';

interface ToolbarButtonProps extends Omit<ButtonProps, 'children'> {
  /** Accessible name, also shown in the tooltip. */
  label: string;
  /** Key binding in `Mod+B` form, shown next to the label. */
  shortcut?: string;
  /** Toggle state; omit for plain actions. */
  pressed?: boolean;
  /** Extra tooltip line, e.g. why the control is unavailable. */
  hint?: string;
  tooltipSide?: 'top' | 'bottom';
  children: ReactNode;
}

/**
 * Icon button for toolbars: tooltip with an optional shortcut, a pressed
 * state that differs from hover, and a 36px target (40px on touch).
 * Forwards props so it can serve as a Popover/Dialog/Menu trigger.
 */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ label, shortcut, pressed, hint, tooltipSide = 'bottom', className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="icon"
          className={cn('p-0', className)}
          aria-label={label}
          aria-pressed={pressed}
          aria-keyshortcuts={shortcut ? ariaKeyShortcut(shortcut) : undefined}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        <span className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut ? (
            <kbd className="font-sans text-background/60">{formatShortcut(shortcut)}</kbd>
          ) : null}
        </span>
        {hint ? <span className="block font-normal text-background/70">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  ),
);
ToolbarButton.displayName = 'ToolbarButton';

/** Thin vertical rule between toolbar groups. */
export function ToolbarSeparator({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('toolbar-separator', className)} />;
}

/** Letter or icon with a bar showing the current color underneath. */
export function ColorIndicator({
  color,
  children,
}: {
  color?: string;
  children: ReactNode;
}) {
  return (
    <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
      {children}
      <span
        className={cn('h-[3px] w-4 rounded-full', !color && 'bg-current opacity-80')}
        style={color ? { backgroundColor: color, boxShadow: 'inset 0 0 0 1px hsl(var(--foreground) / 0.12)' } : undefined}
      />
    </span>
  );
}

interface ColorSwatchGridProps {
  editor: Editor;
  kind: 'text' | 'highlight';
  colors: readonly string[];
  /** The color at the selection, if any. */
  current?: string;
  className?: string;
  swatchClassName?: string;
  /** Runs after a color was applied. */
  onPick?: () => void;
}

/** Text or highlight color choices; used in the desktop popovers and the phone panel. */
export function ColorSwatchGrid({
  editor,
  kind,
  colors,
  current,
  className,
  swatchClassName,
  onPick,
}: ColorSwatchGridProps) {
  const { t } = useLocale();
  const active = current?.toLowerCase();
  return (
    <div className={cn('grid grid-cols-6 gap-1.5', className)}>
      {colors.map((color) => {
        const remove = color === NO_COLOR;
        const selected = remove ? !active : active === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            onClick={() => {
              const chain = editor.chain().focus();
              if (kind === 'text') {
                if (remove) chain.unsetColor().run();
                else chain.setColor(color).run();
              } else if (remove) chain.unsetHighlight().run();
              else chain.setHighlight({ color }).run();
              onPick?.();
            }}
            className={cn(
              'relative flex size-7 items-center justify-center rounded-sm border border-foreground/15 transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:size-9',
              remove && 'bg-card text-muted-foreground',
              selected && 'ring-2 ring-selected ring-offset-1 ring-offset-popover',
              swatchClassName,
            )}
            style={{ backgroundColor: remove ? undefined : color }}
            aria-pressed={selected}
            aria-label={
              remove
                ? t(kind === 'text' ? 'toolbarDefaultColor' : 'toolbarRemoveHighlight')
                : formatMessage(t(kind === 'text' ? 'toolbarSetTextColor' : 'toolbarSetHighlight'), {
                    color,
                  })
            }
          >
            {remove && kind === 'text' ? (
              <span aria-hidden="true" className="text-[13px] font-semibold leading-none text-foreground">
                A
              </span>
            ) : remove ? (
              <span
                aria-hidden="true"
                className="absolute inset-[3px] rounded-[2px] bg-[linear-gradient(to_top_right,transparent_calc(50%-0.75px),hsl(var(--destructive))_calc(50%-0.75px),hsl(var(--destructive))_calc(50%+0.75px),transparent_calc(50%+0.75px))]"
              />
            ) : null}
            {selected && !remove ? (
              <Check
                aria-hidden="true"
                className="size-3.5 drop-shadow-[0_0_1px_rgb(0_0_0_/_0.6)]"
                style={{ color: isDarkColor(color) ? '#ffffff' : '#111827' }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Relative luminance check for choosing a readable check mark on a swatch. */
function isDarkColor(hex: string): boolean {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
}

/** A labeled block of options inside a popover (e.g. "Text color"). */
export function PopoverSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

interface ToolTileProps extends ButtonProps {
  icon: ReactNode;
  label: string;
}

/** Labeled touch control for phone panels, where icon tooltips are unavailable. */
export const ToolTile = forwardRef<HTMLButtonElement, ToolTileProps>(
  ({ icon, label, className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      className={cn('tool-tile', className)}
      aria-label={props['aria-label'] ?? label}
      {...props}
    >
      {icon}
      <span className="tool-tile-label">{label}</span>
    </Button>
  ),
);
ToolTile.displayName = 'ToolTile';

interface LinkPopoverProps {
  editor: Editor;
  /** The trigger button; receives open state through Radix. */
  trigger: ReactElement;
  align?: 'start' | 'center' | 'end';
  /** Runs once a link is applied or removed and focus is back in the document. */
  onComplete?: () => void;
}

export function LinkPopover({ editor, trigger, align = 'center', onComplete }: LinkPopoverProps) {
  const { t } = useLocale();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [linkUrl, setLinkUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [editing, setEditing] = useState(false);
  // After editing the link, writing continues in the document instead of the trigger.
  const returnToEditorRef = useRef(false);

  const setLink = useCallback(() => {
    const href = normalizeLinkUrl(linkUrl);
    if (!href) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    returnToEditorRef.current = true;
    setOpen(false);
    setLinkError(false);
  }, [editor, linkUrl]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const href: unknown = editor.getAttributes('link').href;
          setLinkUrl(typeof href === 'string' ? href : '');
          setEditing(editor.isActive('link'));
          setLinkError(false);
          returnToEditorRef.current = false;
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        aria-label={t('toolbarLink')}
        align={align}
        className="w-[min(22rem,calc(100vw-1rem))] p-3"
        onCloseAutoFocus={(event) => {
          if (!returnToEditorRef.current) return;
          returnToEditorRef.current = false;
          event.preventDefault();
          if (editor.isDestroyed) return;
          editor.commands.focus();
          onComplete?.();
        }}
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setLink();
          }}
        >
          <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
            {t('toolbarLink')}
          </Label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              aria-invalid={linkError}
              aria-describedby={linkError ? errorId : undefined}
              type="url"
              inputMode="url"
              enterKeyHint="done"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('toolbarLinkPlaceholder')}
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                if (linkError) setLinkError(false);
              }}
            />
            <Button type="submit" disabled={!linkUrl.trim()}>
              {t('toolbarLinkApply')}
            </Button>
          </div>
          {linkError ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {t('linkInvalid')}
            </p>
          ) : null}
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start px-2 text-muted-foreground hover:text-destructive"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                returnToEditorRef.current = true;
                setOpen(false);
              }}
            >
              {t('toolbarLinkRemove')}
            </Button>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}
