import { useState, useEffect, useMemo } from 'react';
import { Search, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
}

// Google Fonts - curated list of popular fonts
const GOOGLE_FONTS = [
  // Sans-serif
  { name: 'Inter', category: 'sans-serif' },
  { name: 'Roboto', category: 'sans-serif' },
  { name: 'Open Sans', category: 'sans-serif' },
  { name: 'Lato', category: 'sans-serif' },
  { name: 'Montserrat', category: 'sans-serif' },
  { name: 'Poppins', category: 'sans-serif' },
  { name: 'Nunito', category: 'sans-serif' },
  { name: 'Raleway', category: 'sans-serif' },
  { name: 'Ubuntu', category: 'sans-serif' },
  { name: 'Work Sans', category: 'sans-serif' },
  { name: 'Mulish', category: 'sans-serif' },
  { name: 'Quicksand', category: 'sans-serif' },
  { name: 'Rubik', category: 'sans-serif' },
  { name: 'Josefin Sans', category: 'sans-serif' },
  { name: 'DM Sans', category: 'sans-serif' },
  // Serif
  { name: 'Playfair Display', category: 'serif' },
  { name: 'Merriweather', category: 'serif' },
  { name: 'Lora', category: 'serif' },
  { name: 'Libre Baskerville', category: 'serif' },
  { name: 'PT Serif', category: 'serif' },
  { name: 'Crimson Text', category: 'serif' },
  { name: 'Noto Serif', category: 'serif' },
  { name: 'EB Garamond', category: 'serif' },
  { name: 'Bitter', category: 'serif' },
  { name: 'Cormorant Garamond', category: 'serif' },
  // Monospace
  { name: 'Fira Code', category: 'monospace' },
  { name: 'Source Code Pro', category: 'monospace' },
  { name: 'JetBrains Mono', category: 'monospace' },
  { name: 'IBM Plex Mono', category: 'monospace' },
  { name: 'Roboto Mono', category: 'monospace' },
  // Display
  { name: 'Abril Fatface', category: 'display' },
  { name: 'Lobster', category: 'display' },
  { name: 'Pacifico', category: 'display' },
  { name: 'Dancing Script', category: 'display' },
  { name: 'Caveat', category: 'display' },
  { name: 'Satisfy', category: 'display' },
  { name: 'Great Vibes', category: 'display' },
  // System fonts
  { name: 'Arial', category: 'system' },
  { name: 'Times New Roman', category: 'system' },
  { name: 'Georgia', category: 'system' },
  { name: 'Verdana', category: 'system' },
  { name: 'Courier New', category: 'system' },
];

// Track loaded fonts
const loadedFonts = new Set<string>();

function loadGoogleFont(fontName: string) {
  if (loadedFonts.has(fontName) || ['Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New'].includes(fontName)) {
    return;
  }
  
  const link = document.createElement('link');
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  loadedFonts.add(fontName);
}

export const FontPicker = ({ value, onChange }: FontPickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  // Load current font
  useEffect(() => {
    if (value) {
      const fontName = value.split(',')[0].replace(/['"]/g, '').trim();
      loadGoogleFont(fontName);
    }
  }, [value]);
  
  // Filter fonts based on search
  const filteredFonts = useMemo(() => {
    if (!search) return GOOGLE_FONTS;
    const searchLower = search.toLowerCase();
    return GOOGLE_FONTS.filter(font => 
      font.name.toLowerCase().includes(searchLower) ||
      font.category.toLowerCase().includes(searchLower)
    );
  }, [search]);
  
  // Group fonts by category
  const groupedFonts = useMemo(() => {
    const groups: Record<string, typeof GOOGLE_FONTS> = {};
    for (const font of filteredFonts) {
      if (!groups[font.category]) {
        groups[font.category] = [];
      }
      groups[font.category].push(font);
    }
    return groups;
  }, [filteredFonts]);
  
  const currentFontName = value ? value.split(',')[0].replace(/['"]/g, '').trim() : 'Default';
  
  const handleSelectFont = (fontName: string) => {
    loadGoogleFont(fontName);
    
    // Get the font category for fallback
    const font = GOOGLE_FONTS.find(f => f.name === fontName);
    let fallback = 'sans-serif';
    if (font?.category === 'serif') fallback = 'serif';
    else if (font?.category === 'monospace') fallback = 'monospace';
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
          className="w-36 h-8 justify-between text-xs font-medium bg-background/50 border-border/50"
          aria-label="Select font"
        >
          <span 
            className="truncate" 
            style={{ fontFamily: value || 'inherit' }}
          >
            {currentFontName}
          </span>
          <Search className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 bg-popover border border-border shadow-lg z-50" align="start">
        <div className="p-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search fonts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-background/50"
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
              }}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-accent/50 transition-colors",
                !value && "bg-accent"
              )}
            >
              <span>Default</span>
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
                  const handleMouseEnter = () => loadGoogleFont(font.name);
                  
                  return (
                    <button
                      key={font.name}
                      onClick={() => handleSelectFont(font.name)}
                      onMouseEnter={handleMouseEnter}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-accent/50 transition-colors",
                        currentFontName === font.name && "bg-accent"
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
                No fonts found
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
