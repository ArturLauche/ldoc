import { useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/components/locale-provider';
import {
  SMART_GRAPHIC_CATEGORIES,
  createStarterGraphic,
  layoutsForCategory,
  type SmartGraphicCategory,
  type SmartGraphicLayoutId,
} from '@/lib/smartGraphic';
import { GRAPHIC_CATEGORY_KEYS, GRAPHIC_LAYOUT_KEYS } from './smartGraphicLabels';
import { SmartGraphicCanvas } from './SmartGraphicCanvas';

interface SmartGraphicGalleryProps {
  editor: Editor;
}

export function SmartGraphicGallery({ editor }: SmartGraphicGalleryProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SmartGraphicCategory>('list');

  const layouts = useMemo(() => layoutsForCategory(category), [category]);

  const insertLayout = (layoutId: SmartGraphicLayoutId) => {
    editor.chain().focus().insertSmartGraphic(layoutId).run();
    setOpen(false);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={t('toolbarInsertGraphic')}
            onClick={() => setOpen(true)}
          >
            <Shapes className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('toolbarInsertGraphic')}</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-[min(52rem,calc(100vw-1.25rem))] max-w-4xl flex-col gap-3 overflow-hidden bg-background p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t('graphicGalleryTitle')}</DialogTitle>
            <DialogDescription>{t('graphicGalleryDescription')}</DialogDescription>
          </DialogHeader>
          <Tabs
            value={category}
            onValueChange={(value) => setCategory(value as SmartGraphicCategory)}
            className="min-h-0 flex-1"
          >
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0 rounded-none border-b border-border bg-transparent p-0 text-foreground">
              {SMART_GRAPHIC_CATEGORIES.map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs text-muted-foreground shadow-none sm:text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {t(GRAPHIC_CATEGORY_KEYS[item])}
                </TabsTrigger>
              ))}
            </TabsList>
            {SMART_GRAPHIC_CATEGORIES.map((item) => (
              <TabsContent key={item} value={item} className="mt-3 min-h-0">
                <ScrollArea className="h-[min(28rem,55vh)] pr-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(item === category ? layouts : layoutsForCategory(item)).map((layout) => {
                      const preview = createStarterGraphic(layout.id);
                      return (
                        <button
                          key={layout.id}
                          type="button"
                          className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
                          onClick={() => insertLayout(layout.id)}
                          aria-label={t(GRAPHIC_LAYOUT_KEYS[layout.id])}
                        >
                          <div className="mb-2 text-sm font-medium text-foreground">
                            {t(GRAPHIC_LAYOUT_KEYS[layout.id])}
                          </div>
                          <div
                            data-testid="graphic-preview-frame"
                            className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background p-2"
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
    </>
  );
}
