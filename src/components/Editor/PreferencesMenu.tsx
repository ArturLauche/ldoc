import { useRef } from 'react';
import { EllipsisVertical, Keyboard, Languages, Monitor, Moon, Settings2, Sun } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/hooks/useTheme';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import { isThemePreference, type ThemePreference } from '@/lib/theme';
import {
  isSupportedLocale,
  localeNames,
  supportedLocales,
  type TranslationKey,
} from '@/lib/translations';
import { SHORTCUTS } from './editorShortcuts';
import { ShortcutLabel, ToolbarButton } from './toolbarControls';

const THEMES: { value: ThemePreference; label: TranslationKey; icon: typeof Sun }[] = [
  { value: 'system', label: 'themeSystem', icon: Monitor },
  { value: 'light', label: 'themeLight', icon: Sun },
  { value: 'dark', label: 'themeDark', icon: Moon },
];

/**
 * Theme, language and the shortcut reference in one menu, so the header
 * keeps a single preferences control on every screen size.
 */
export function PreferencesMenu({
  compact,
  onShowShortcuts,
}: {
  compact: boolean;
  /** Opens the shortcut reference; focus returns to `returnFocusTo` when it closes. */
  onShowShortcuts: (returnFocusTo: HTMLElement | null) => void;
}) {
  const { t, locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const menu = useTouchSafeMenu();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const languages = (
    <DropdownMenuRadioGroup
      value={locale}
      onValueChange={(value) => {
        if (!isSupportedLocale(value)) return;
        setLocale(value).catch(() => toast.error(t('languageLoadFailed')));
      }}
    >
      {supportedLocales.map((code) => (
        <DropdownMenuRadioItem key={code} value={code} lang={code}>
          {localeNames[code]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );

  return (
    <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild {...menu.triggerProps}>
        <ToolbarButton
          ref={triggerRef}
          label={t('displayOptions')}
          className="header-icon-button data-[state=open]:bg-accent"
        >
          {compact ? <EllipsisVertical /> : <Settings2 />}
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={t('displayOptions')} align="end" className="w-max min-w-60 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel>{t('themeLabel')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isThemePreference(value)) setTheme(value);
          }}
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              {t(label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {compact ? (
          <>
            <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
            {languages}
          </>
        ) : (
          <>
            <DropdownMenuSub>
              {/* inset: icons line up with the theme items after their check column. */}
              <DropdownMenuSubTrigger inset>
                <Languages />
                {t('language')}
                <span className="ms-auto ps-3 text-xs text-muted-foreground">
                  {localeNames[locale]}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-44">{languages}</DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem inset onSelect={() => onShowShortcuts(triggerRef.current)}>
              <Keyboard />
              {t('keyboardShortcuts')}
              <DropdownMenuShortcut>
                <ShortcutLabel shortcut={SHORTCUTS.shortcuts} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
