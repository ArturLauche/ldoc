/** Shared dialog surface: phones turn it into a bottom sheet (`.dialog-sheet` in index.css). */
export const dialogSurface =
  'dialog-sheet fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-dialog duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

export const dialogOverlay =
  'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:bg-black/60';
