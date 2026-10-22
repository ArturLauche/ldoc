import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/hooks/useLocale';
import { SHORTCUT_GROUPS, SHORTCUTS } from './editorShortcuts';
import { ShortcutLabel } from './toolbarControls';

/** Reference of the editor's keyboard shortcuts (opened with Mod+/). */
export function ShortcutsDialog({
  open,
  onOpenChange,
  onReturnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Puts focus back where the reference was opened from (no trigger to return to). */
  onReturnFocus: () => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle>{t('keyboardShortcuts')}</DialogTitle>
          <DialogDescription>{t('keyboardShortcutsDescription')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
          {/* Columns let the groups flow without gaps below the shorter ones. */}
          <div className="gap-8 sm:columns-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section
                key={group.label}
                aria-label={t(group.label)}
                className="mb-5 min-w-0 break-inside-avoid last:mb-0"
              >
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t(group.label)}</h3>
                <dl>
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex min-h-9 items-center justify-between gap-4 border-b border-border/60 last:border-b-0"
                    >
                      <dt className="min-w-0 truncate text-sm">{t(item.label)}</dt>
                      <dd className="shrink-0">
                        <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium tabular-nums text-muted-foreground">
                          <ShortcutLabel shortcut={SHORTCUTS[item.id]} />
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
