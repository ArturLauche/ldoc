import { Fragment } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/hooks/useLocale';
import { formatShortcut } from '@/lib/shortcuts';
import { SHORTCUT_GROUPS, SHORTCUTS } from './editorShortcuts';

/** Reference of the editor's keyboard shortcuts (opened with Mod+/). */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle>{t('keyboardShortcuts')}</DialogTitle>
          <DialogDescription>{t('keyboardShortcutsDescription')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.label} aria-label={t(group.label)} className="min-w-0">
                <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{t(group.label)}</h3>
                <dl className="grid grid-cols-[1fr_auto] items-center gap-x-4">
                  {group.items.map((item) => (
                    <Fragment key={item.id}>
                      <dt className="truncate border-b border-border/60 py-1.5 text-sm">{t(item.label)}</dt>
                      <dd className="border-b border-border/60 py-1.5 text-end">
                        <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium tabular-nums text-muted-foreground">
                          {formatShortcut(SHORTCUTS[item.id])}
                        </kbd>
                      </dd>
                    </Fragment>
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
