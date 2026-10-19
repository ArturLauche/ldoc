import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/useLocale';
import {
  FONT_FAMILIES,
  fontFamilyValue,
  loadFont,
  primaryFontName,
  type FontCategory,
} from '@/lib/fonts';
import { isTouchInteraction, keepEditorFocus } from '@/lib/inputModality';
import type { TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<FontCategory, TranslationKey> = {
  'sans-serif': 'fontCategorySansSerif',
  serif: 'fontCategorySerif',
  monospace: 'fontCategoryMonospace',
  display: 'fontCategoryDisplay',
  system: 'fontCategorySystem',
};

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
  triggerClassName?: string;
  /** Visible prefix in the trigger where no tooltip explains it (phone panel). */
  label?: string;
  align?: 'start' | 'center' | 'end';
}

/** Index of the option under a pointer event target, if any. */
function optionIndexAt(target: EventTarget): number | null {
  if (!(target instanceof Element)) return null;
  const value = target.closest('[data-index]')?.getAttribute('data-index');
  return value === null || value === undefined ? null : Number(value);
}

/** One option in the list: `''` is the document default. */
type FontOption = { name: string; category: FontCategory | null };

/**
 * Searchable font list (ARIA combobox): typing filters, arrow keys move the
 * active option, Enter applies it. Fonts load on hover or focus so the
 * preview renders in the face itself.
 */
export const FontPicker = ({
  value,
  onChange,
  triggerClassName,
  label,
  align = 'start',
}: FontPickerProps) => {
  const { t, locale } = useLocale();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // After a pick, focus stays in the document that `onChange` focused.
  const pickedRef = useRef(false);
  const currentFontName = value ? primaryFontName(value) : '';

  useEffect(() => {
    if (currentFontName) loadFont(currentFontName);
  }, [currentFontName]);

  const options = useMemo<FontOption[]>(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    const fonts = query
      ? FONT_FAMILIES.filter(
          (font) =>
            font.name.toLocaleLowerCase(locale).includes(query) ||
            t(CATEGORY_LABELS[font.category]).toLocaleLowerCase(locale).includes(query),
        )
      : FONT_FAMILIES;
    return [...(query ? [] : [{ name: '', category: null }]), ...fonts];
  }, [locale, search, t]);

  // Each font shows in its own face once its row scrolls into view, so the
  // list can be scanned by appearance (faces still load only when needed).
  // A callback ref: the popover mounts its list a render after opening.
  const listCallbackRef = useCallback(
    (list: HTMLDivElement | null) => {
      listRef.current = list;
      // Open on the current font, not at the top of the list.
      list?.querySelector<HTMLElement>('[data-active]')?.scrollIntoView?.({ block: 'center' });
      if (!list || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
            const name = options[Number(entry.target.dataset.index)]?.name;
            if (name) loadFont(name);
            observer.unobserve(entry.target);
          }
        },
        { root: list, rootMargin: '64px 0px' },
      );
      list.querySelectorAll('[role="option"]').forEach((option) => observer.observe(option));
      return () => {
        observer.disconnect();
        listRef.current = null;
      };
    },
    [options],
  );

  const select = (option: FontOption) => {
    if (option.name) loadFont(option.name);
    pickedRef.current = true;
    onChange(option.name ? fontFamilyValue(option.name) : '');
    setOpen(false);
    setSearch('');
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  const moveActive = (index: number) => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActiveIndex(next);
    const option = options[next];
    if (option?.name) loadFont(option.name);
    listRef.current?.ownerDocument
      .getElementById(optionId(next))
      ?.scrollIntoView?.({ block: 'nearest' });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(activeIndex - 1);
    } else if (event.key === 'Home' && !search) {
      event.preventDefault();
      moveActive(0);
    } else if (event.key === 'End' && !search) {
      event.preventDefault();
      moveActive(options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) select(option);
    }
  };

  const selectedIndex = options.findIndex((option) =>
    option.name ? option.name === currentFontName : !currentFontName,
  );
  // Where the current font sits once the search is cleared (the list opens
  // unfiltered; `options` may still hold the last search).
  const openIndex = currentFontName
    ? FONT_FAMILIES.findIndex((font) => font.name === currentFontName) + 1
    : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // A pick whose close was cut short (the panel unmounted) must not
        // swallow focus restoration the next time.
        if (next) {
          pickedRef.current = false;
          setActiveIndex(Math.max(0, openIndex));
        }
        setSearch('');
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            // Same field look and focus treatment as the Select triggers beside it.
            'h-9 w-28 justify-between gap-1.5 border-input bg-card px-3 font-normal shadow-xs hover:border-ring/50 hover:bg-card focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-ring/20 data-[state=open]:border-ring',
            triggerClassName,
          )}
          aria-label={t('toolbarFontFamily')}
        >
          {label ? (
            <span aria-hidden="true" className="shrink-0 text-muted-foreground">
              {label}
            </span>
          ) : null}
          <span
            className={cn('min-w-0 truncate text-start', label && 'flex-1')}
            style={{ fontFamily: value || 'inherit' }}
          >
            {currentFontName || t('fontDefault')}
          </span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('toolbarFontFamily')}
        className="flex w-64 flex-col overflow-hidden p-0"
        align={align}
        onOpenAutoFocus={(event) => {
          // Keyboard users land in the search field; a tap shows the list
          // without covering it with the software keyboard.
          if (isTouchInteraction()) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (!pickedRef.current) return;
          pickedRef.current = false;
          event.preventDefault();
        }}
        onMouseDown={keepEditorFocus}
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options[activeIndex] ? optionId(activeIndex) : undefined}
              placeholder={t('fontSearchPlaceholder')}
              aria-label={t('fontSearchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="ps-8"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div
          ref={listCallbackRef}
          id={listId}
          role="listbox"
          aria-label={t('toolbarFontFamily')}
          onPointerMove={(event) => {
            const index = optionIndexAt(event.target);
            if (index !== null && index !== activeIndex) moveActive(index);
          }}
          onClick={(event) => {
            const index = optionIndexAt(event.target);
            if (index !== null && options[index]) select(options[index]);
          }}
          className="h-72 max-h-[calc(var(--radix-popover-content-available-height,18rem)-3.5rem)] overflow-y-auto overscroll-contain p-1"
        >
          {options.length ? (
            options.map((option, index) => {
              const previous = options[index - 1];
              const heading =
                option.category && option.category !== previous?.category
                  ? t(CATEGORY_LABELS[option.category])
                  : null;
              const selected = index === selectedIndex;
              return (
                <div key={option.name || 'default'} role="presentation">
                  {heading ? (
                    <div
                      role="presentation"
                      className="pb-1 pe-2 ps-8 pt-2.5 text-xs font-medium text-muted-foreground"
                    >
                      {heading}
                    </div>
                  ) : null}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    data-active={index === activeIndex || undefined}
                    className="relative flex min-h-8 cursor-default select-none items-center rounded-md py-1.5 pe-2 ps-8 text-sm data-[active]:bg-accent pointer-coarse:min-h-11"
                    style={option.name ? { fontFamily: fontFamilyValue(option.name) } : undefined}
                  >
                    {/* The check sits where the Select menus beside it put theirs. */}
                    {selected ? (
                      <Check
                        aria-hidden="true"
                        className="absolute start-2 h-4 w-4 text-selected-foreground"
                      />
                    ) : null}
                    <span className="truncate">{option.name || t('fontDefault')}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t('fontNoResults')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
