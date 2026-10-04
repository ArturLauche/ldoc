import { useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Search, Shapes, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/hooks/useLocale';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { focusContainerOnTouch } from '@/lib/inputModality';
import {
  SMART_GRAPHIC_CATEGORIES,
  SMART_GRAPHIC_LAYOUTS,
  createStarterGraphic,
  type SmartGraphicCategory,
  type SmartGraphicLayoutId,
} from '@/lib/smartGraphic';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { LayoutCard } from './graphics/LayoutCard';
import { layoutMatchesQuery } from './graphics/layoutSearch';
import { GRAPHIC_CATEGORY_KEYS, GRAPHIC_LAYOUT_HINT_KEYS, GRAPHIC_LAYOUT_KEYS } from './smartGraphicLabels';
import { ToolTile } from './toolbarControls';

type GalleryTab = 'all' | SmartGraphicCategory;

interface SmartGraphicGalleryProps {
  editor: Editor;
  /** `tile`: labeled trigger for the phone insert panel. */
  variant?: 'icon' | 'tile';
  /** Runs once a graphic is inserted and focus is back in the document. */
  onComplete?: () => void;
}

export function SmartGraphicGallery({
  editor,
  variant = 'icon',
  onComplete,
}: SmartGraphicGalleryProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GalleryTab>('all');
  const insertedRef = useRef(false);

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
        className="flex flex-col gap-0 overflow-hidden bg-background p-0 max-sm:h-[calc(var(--app-viewport-height,100dvh)-2.5rem)] sm:h-[min(46rem,90vh)] sm:w-[min(66rem,calc(100vw-2rem))] sm:max-w-none"
        onOpenAutoFocus={focusContainerOnTouch}
        onCloseAutoFocus={(event) => {
          if (!insertedRef.current) return;
          insertedRef.current = false;
          event.preventDefault();
          if (editor.isDestroyed) return;
          editor.commands.focus();
          onComplete?.();
        }}
      >
        <GalleryBody tab={tab} onTabChange={setTab} onInsert={insertLayout} />
      </DialogContent>
    </Dialog>
  );
}

/** Dialog content; mounted only while the gallery is open. */
function GalleryBody({
  tab,
  onTabChange,
  onInsert,
}: {
  tab: GalleryTab;
  onTabChange: (tab: GalleryTab) => void;
  onInsert: (layoutId: SmartGraphicLayoutId) => void;
}) {
  const { t, locale } = useLocale();
  const wide = useMediaQuery('(min-width: 640px)');
  const [query, setQuery] = useState('');

  const previews = useMemo(
    () => new Map(SMART_GRAPHIC_LAYOUTS.map((layout) => [layout.id, createStarterGraphic(layout.id, locale)])),
    [locale],
  );
  const matching = useMemo(
    () => SMART_GRAPHIC_LAYOUTS.filter((layout) => layoutMatchesQuery(layout, query, t)),
    [query, t],
  );
  const tabs: GalleryTab[] = ['all', ...SMART_GRAPHIC_CATEGORIES];
  const countFor = (item: GalleryTab) =>
    matching.filter((layout) => item === 'all' || layout.category === item).length;
  const tabLabel = (item: GalleryTab) => t(item === 'all' ? 'graphicCategoryAll' : GRAPHIC_CATEGORY_KEYS[item]);

  const renderGrid = (category: SmartGraphicCategory) => {
    const layouts = matching.filter((layout) => layout.category === category);
    if (!layouts.length) return null;
    return (
      <section key={category} aria-label={t(GRAPHIC_CATEGORY_KEYS[category])} className="space-y-2.5">
        {tab === 'all' ? (
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(GRAPHIC_CATEGORY_KEYS[category])}
          </h3>
        ) : null}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          {layouts.map((layout) => (
            <LayoutCard
              key={layout.id}
              name={t(GRAPHIC_LAYOUT_KEYS[layout.id])}
              hint={t(GRAPHIC_LAYOUT_HINT_KEYS[layout.id])}
              preview={previews.get(layout.id) ?? createStarterGraphic(layout.id, locale)}
              onSelect={() => onInsert(layout.id)}
            />
          ))}
        </div>
      </section>
    );
  };

  const visibleCategories = tab === 'all' ? SMART_GRAPHIC_CATEGORIES : [tab];
  const empty = visibleCategories.every((category) => !matching.some((layout) => layout.category === category));

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as GalleryTab)}
      orientation={wide ? 'vertical' : 'horizontal'}
      className="flex min-h-0 flex-1 flex-col sm:flex-row"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pb-3 pt-4 sm:w-56 sm:border-b-0 sm:border-e sm:bg-card/60 sm:px-3 sm:py-5">
        <DialogHeader className="space-y-1 pe-8 sm:px-2 sm:pe-2">
          <DialogTitle>{t('graphicGalleryTitle')}</DialogTitle>
          <DialogDescription className="text-xs sm:text-[0.8125rem]">{t('graphicGalleryDescription')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchField query={query} onQueryChange={setQuery} />
        </div>
        <TabsList
          aria-label={t('graphicGalleryCategories')}
          className="scroll-strip -mx-4 flex h-auto justify-start gap-1 rounded-none bg-transparent p-0 px-4 text-foreground sm:mx-0 sm:flex-col sm:items-stretch sm:overflow-visible sm:px-0"
        >
          {tabs.map((item) => (
            <TabsTrigger
              key={item}
              value={item}
              className="shrink-0 justify-between gap-3 rounded-full border border-border px-3 py-1.5 text-[0.8125rem] font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground max-sm:min-h-9 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none sm:rounded-md sm:border-transparent sm:px-2.5 sm:py-2 sm:data-[state=active]:border-transparent sm:data-[state=active]:bg-accent sm:data-[state=active]:text-foreground"
            >
              {tabLabel(item)}
              <span aria-hidden="true" className="text-xs tabular-nums opacity-70">
                {countFor(item)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-baseline gap-2 border-b border-border px-5 pe-14 pt-[1.125rem] sm:flex">
          <h3 className="text-sm font-semibold text-foreground">{tabLabel(tab)}</h3>
          <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">
            {countFor(tab)}
          </span>
        </div>
        {tabs.map((item) => (
          <TabsContent
            key={item}
            value={item}
            className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 focus-visible:ring-inset focus-visible:ring-offset-0 sm:px-5"
          >
            {empty ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <p>{formatMessage(t('graphicGalleryNoResults'), { query: query.trim() })}</p>
                <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                  {t('graphicGalleryClearSearch')}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">{visibleCategories.map(renderGrid)}</div>
            )}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

function SearchField({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const { t } = useLocale();
  return (
    <>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('graphicGallerySearch')}
        aria-label={t('graphicGallerySearch')}
        className={cn('h-9 ps-9', query && 'pe-9')}
      />
      {query ? (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label={t('graphicGalleryClearSearch')}
          className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  );
}
