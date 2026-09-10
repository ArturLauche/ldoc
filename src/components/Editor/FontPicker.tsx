import { useState, useEffect, useMemo } from 'react';
import { Search, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocale } from '@/hooks/useLocale';
import { FONT_FAMILIES, loadFont } from '@/lib/fonts';
import { cn } from '@/lib/utils';

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
}

export const FontPicker = ({ value, onChange }: FontPickerProps) => {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Load current font
  useEffect(() => {
    if (value) {
      const fontName = value.split(',')[0].replace(/['"]/g, '').trim();
      loadFont(fontName);
    }
  }, [value]);

  // Filter fonts based on search
  const filteredFonts = useMemo(() => {
    if (!search) return FONT_FAMILIES;
    const searchLower = search.toLowerCase();
    return FONT_FAMILIES.filter(
      (font) =>
        font.name.toLowerCase().includes(searchLower) ||
        font.category.toLowerCase().includes(searchLower),
    );
  }, [search]);

  // Group fonts by category
  const groupedFonts = useMemo(() => {
    const groups: Record<string, typeof FONT_FAMILIES> = {};
    for (const font of filteredFonts) {
      if (!groups[font.category]) {
        groups[font.category] = [];
      }
      groups[font.category].push(font);
    }
    return groups;
  }, [filteredFonts]);

  const currentFontName = value
    ? value.split(',')[0].replace(/['"]/g, '').trim()
    : t('fontDefault');

  const handleSelectFont = (fontName: string) => {
    loadFont(fontName);

    // Get the font category for fallback
    const font = FONT_FAMILIES.find((f) => f.name === fontName);
    let fallback = 'sans-serif';
    if (font?.category === 'serif' || ['Times New Roman', 'Georgia'].includes(fontName))
      fallback = 'serif';
    else if (font?.category === 'monospace' || fontName === 'Courier New') fallback = 'monospace';
    else if (font?.category === 'display') fallback = 'cursive';

    onChange(`"${fontName}", ${fallback}`);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-28 h-9 justify-between text-xs font-medium bg-card border-border"
          aria-label={t('toolbarFontFamily')}
        >
          <span className="truncate" style={{ fontFamily: value || 'inherit' }}>
            {currentFontName}
          </span>
          <Search className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('toolbarFontFamily')}
        className="w-64 p-0 bg-popover border border-border shadow-lg z-50"
        align="start"
      >
        <div className="p-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('fontSearchPlaceholder')}
              aria-label={t('fontSearchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm bg-card"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {/* Default option */}
            <button
              onClick={() => {
                onChange('');
                setOpen(false);
                setSearch('');
              }}
              className={cn(
                'w-full flex items-center justify-between px-2 py-2 text-sm rounded-sm hover:bg-accent/50 transition-colors',
                !value && 'bg-accent',
              )}
            >
              <span>{t('fontDefault')}</span>
              {!value && <Check className="h-4 w-4" />}
            </button>

            {/* Grouped fonts */}
            {Object.entries(groupedFonts).map(([category, fonts]) => (
              <div key={category}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {category}
                </div>
                {fonts.map((font) => {
                  // Preload font on hover
                  const handleMouseEnter = () => loadFont(font.name);

                  return (
                    <button
                      key={font.name}
                      onClick={() => handleSelectFont(font.name)}
                      onMouseEnter={handleMouseEnter}
                      onFocus={handleMouseEnter}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-2 text-sm rounded-sm hover:bg-accent/50 transition-colors',
                        currentFontName === font.name && 'bg-accent',
                      )}
                      style={{ fontFamily: `"${font.name}", ${font.category}` }}
                    >
                      <span>{font.name}</span>
                      {currentFontName === font.name && <Check className="h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredFonts.length === 0 && (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                {t('fontNoResults')}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
