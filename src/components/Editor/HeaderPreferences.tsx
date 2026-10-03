import { EllipsisVertical, Languages, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/hooks/useLocale';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import { isSupportedLocale, localeNames, supportedLocales } from '@/lib/translations';

/**
 * Language and theme controls. Wide headers show two icon buttons; phones
 * fold both into one menu so the document title keeps its room.
 */
export function HeaderPreferences({ compact }: { compact: boolean }) {
  const { t, locale, setLocale } = useLocale();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const languageMenu = useTouchSafeMenu();
  const compactMenu = useTouchSafeMenu();
  const dark = resolvedTheme === 'dark';
  const toggleTheme = () => {
    const activeTheme = theme === 'system' ? resolvedTheme : theme;
    setTheme(activeTheme === 'dark' ? 'light' : 'dark');
  };
  const languageItems = (
    <DropdownMenuRadioGroup
      value={locale}
      onValueChange={(value) => {
        if (isSupportedLocale(value)) setLocale(value);
      }}
    >
      {supportedLocales.map((code) => (
        <DropdownMenuRadioItem key={code} value={code} lang={code}>
          {localeNames[code]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );

  if (compact) {
    return (
      <DropdownMenu modal={false} open={compactMenu.open} onOpenChange={compactMenu.onOpenChange}>
        <DropdownMenuTrigger asChild {...compactMenu.triggerProps}>
          <Button
            variant="ghost"
            size="icon"
            className="header-icon-button"
            aria-label={t('displayOptions')}
          >
            <EllipsisVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          aria-label={t('displayOptions')}
          align="end"
          className="w-56 bg-popover border border-border shadow-lg z-50"
        >
          <DropdownMenuItem onSelect={toggleTheme}>
            {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {t(dark ? 'switchToLightMode' : 'switchToDarkMode')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Languages aria-hidden="true" className="h-3.5 w-3.5" />
            {t('language')}
          </DropdownMenuLabel>
          {languageItems}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <DropdownMenu modal={false} open={languageMenu.open} onOpenChange={languageMenu.onOpenChange}>
        <DropdownMenuTrigger asChild {...languageMenu.triggerProps}>
          <Button
            variant="ghost"
            size="icon"
            className="header-icon-button"
            aria-label={t('languageSwitcherLabel')}
          >
            <Languages className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          aria-label={t('languageSwitcherLabel')}
          align="end"
          className="w-40 bg-popover border border-border shadow-lg z-50"
        >
          {languageItems}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        className="header-icon-button"
        onClick={toggleTheme}
        aria-label={t('toggleTheme')}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </>
  );
}
