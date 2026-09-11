import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from '@/hooks/useConfirm';
import { useLocale } from '@/hooks/useLocale';

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/**
 * Promise-based replacement for `window.confirm` backed by an accessible
 * AlertDialog: `const confirmed = await confirm({ title, description })`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      // A second request while one is open cancels the first one.
      pendingRef.current?.resolve(false);
      if (!pendingRef.current)
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed);
    pendingRef.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
            });
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.options.title}</AlertDialogTitle>
            {pending?.options.description ? (
              <AlertDialogDescription>{pending.options.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {pending?.options.cancelLabel ?? t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                pending?.options.destructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {pending?.options.confirmLabel ?? t('confirmContinue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
