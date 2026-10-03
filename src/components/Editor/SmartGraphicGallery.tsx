import { useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/hooks/useLocale';
import { focusContainerOnTouch } from '@/lib/inputModality';
import {
  SMART_GRAPHIC_CATEGORIES,
  createStarterGraphic,
  layoutsForCategory,
  type SmartGraphicCategory,
  type SmartGraphicLayoutId,
} from '@/lib/smartGraphic';
import { GRAPHIC_CATEGORY_KEYS, GRAPHIC_LAYOUT_KEYS } from './smartGraphicLabels';
import { SmartGraphicCanvas } from './SmartGraphicCanvas';
import { ToolTile } from './toolbarControls';

interface SmartGraphicGalleryProps {
  editor: Editor;
  /** `tile`: labeled trigger for the phone insert panel. */
  variant?: 'icon' | 'tile';
}

export function SmartGraphicGallery({ editor, variant = 'icon' }: SmartGraphicGalleryProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SmartGraphicCategory>('list');
  const insertedRef = useRef(false);

  const layouts = useMemo(() => layoutsForCategory(category), [category]);

  const insertLayout = (layoutId: SmartGraphicLayoutId) => {
    editor.chain().focus().insertSmartGraphic(layoutId, locale).run();
    insertedRef.current = true;
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === 'tile' ? (
        <DialogTrigger asChild>
          <ToolTile
            icon={<Shapes />}
            label={t('insertGraphicShort')}
            aria-label={t('toolbarInsertGraphic')}
          />
        </DialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                aria-label={t('toolbarInsertGraphic')}
              >
                <Shapes className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('toolbarInsertGraphic')}</TooltipContent>
        </Tooltip>
      )}

      <DialogContent
        className="flex flex-col gap-3 overflow-hidden bg-background p-4 sm:max-h-[85vh] sm:w-[min(52rem,calc(100vw-1.25rem))] sm:max-w-4xl sm:p-6"
        onOpenAutoFocus={focusContainerOnTouch}
        onCloseAutoFocus={(event) => {
          if (!insertedRef.current) return;
          insertedRef.current = false;
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('graphicGalleryTitle')}</DialogTitle>
          <DialogDescription>{t('graphicGalleryDescription')}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={category}
          onValueChange={(value) => setCategory(value as SmartGraphicCategory)}
          className="min-h-0 flex-1"
        >
          <TabsList className="scroll-strip flex h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0 text-foreground max-sm:overflow-x-auto sm:flex-wrap">
            {SMART_GRAPHIC_CATEGORIES.map((item) => (
              <TabsTrigger
                key={item}
                value={item}
                className="shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs text-muted-foreground shadow-none max-sm:min-h-10 focus-visible:ring-inset focus-visible:ring-offset-0 sm:text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t(GRAPHIC_CATEGORY_KEYS[item])}
              </TabsTrigger>
            ))}
          </TabsList>
          {SMART_GRAPHIC_CATEGORIES.map((item) => (
            <TabsContent key={item} value={item} className="mt-3 min-h-0">
              <ScrollArea className="h-[min(28rem,55vh)] pr-3 max-sm:h-auto max-sm:[&>[data-radix-scroll-area-viewport]]:max-h-[calc(var(--app-viewport-height,100dvh)-14rem)]">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {(item === category ? layouts : layoutsForCategory(item)).map((layout) => {
                    const preview = createStarterGraphic(layout.id, locale);
                    return (
                      <button
                        key={layout.id}
                        type="button"
                        className="min-w-0 rounded-md border border-border bg-card p-2 text-left transition-colors hover:border-primary focus:outline-hidden focus:ring-2 focus:ring-ring sm:p-3"
                        onClick={() => insertLayout(layout.id)}
                        aria-label={t(GRAPHIC_LAYOUT_KEYS[layout.id])}
                      >
                        <div className="mb-2 truncate text-xs font-medium text-foreground sm:text-sm">
                          {t(GRAPHIC_LAYOUT_KEYS[layout.id])}
                        </div>
                        <div
                          data-testid="graphic-preview-frame"
                          className="flex h-24 items-center justify-center overflow-hidden bg-background p-1 sm:h-36 sm:p-2"
                        >
                          <div className="flex h-full w-full min-w-0 items-center justify-center">
                            <SmartGraphicCanvas graphic={preview} compact />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
