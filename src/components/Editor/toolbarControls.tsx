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
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/hooks/useLocale';
import { normalizeLinkUrl } from '@/lib/links';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { REMOVE_HIGHLIGHT } from './toolbarModel';

interface ColorSwatchGridProps {
  editor: Editor;
  kind: 'text' | 'highlight';
  colors: readonly string[];
  className?: string;
  swatchClassName?: string;
}

/** Text or highlight color choices; used in the desktop popovers and the phone panel. */
export function ColorSwatchGrid({
  editor,
  kind,
  colors,
  className,
  swatchClassName,
}: ColorSwatchGridProps) {
  const { t } = useLocale();
  return (
    <div className={cn('grid grid-cols-6 gap-1.5', className)}>
      {colors.map((color) => {
        const remove = kind === 'highlight' && color === REMOVE_HIGHLIGHT;
        return (
          <button
            key={color}
            type="button"
            onClick={() => {
              if (kind === 'text') editor.chain().focus().setColor(color).run();
              else if (remove) editor.chain().focus().unsetHighlight().run();
              else editor.chain().focus().setHighlight({ color }).run();
            }}
            className={cn(
              'h-8 w-8 rounded-sm border border-border transition-colors hover:ring-2 hover:ring-ring focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              remove &&
                "bg-background relative after:content-['×'] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-muted-foreground",
              swatchClassName,
            )}
            style={{ backgroundColor: remove ? undefined : color }}
            aria-label={
              remove
                ? t('toolbarRemoveHighlight')
                : formatMessage(
                    t(kind === 'text' ? 'toolbarSetTextColor' : 'toolbarSetHighlight'),
                    {
                      color,
                    },
                  )
            }
          />
        );
      })}
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
          setLinkError(false);
          returnToEditorRef.current = false;
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        aria-label={t('toolbarLink')}
        align={align}
        className="w-[min(20rem,calc(100vw-1rem))] p-3 bg-popover border border-border shadow-lg z-50"
        onCloseAutoFocus={(event) => {
          if (!returnToEditorRef.current) return;
          returnToEditorRef.current = false;
          event.preventDefault();
          if (editor.isDestroyed) return;
          editor.commands.focus();
          onComplete?.();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>{t('toolbarLink')}</Label>
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
            aria-label={t('toolbarLinkPlaceholder')}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="h-10 sm:h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setLink();
              }
            }}
          />
          {linkError && (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {t('linkInvalid')}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={setLink}
              disabled={!linkUrl.trim()}
              className="h-10 flex-1 sm:h-9"
            >
              {t('toolbarLinkApply')}
            </Button>
            {editor.isActive('link') && (
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  returnToEditorRef.current = true;
                  setOpen(false);
                }}
              >
                {t('toolbarLinkRemove')}
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
