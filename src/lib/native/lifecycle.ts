type NativeSession = { flush: () => Promise<boolean>; canLeave: () => Promise<boolean> };
let activeSession: NativeSession | null = null;

export function registerNativeSession(session: NativeSession): () => void {
  activeSession = session;
  return () => { if (activeSession === session) activeSession = null; };
}

export const flushNativeSession = (): Promise<boolean> => activeSession?.flush() ?? Promise.resolve(true);
export const prepareNativeDeparture = (): Promise<boolean> => activeSession?.canLeave() ?? Promise.resolve(true);

/** Radix dialogs and the mobile toolbar already share Escape dismissal behavior. */
export function dismissNativeOverlay(): boolean {
  const hasOverlay = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-state="open"][data-radix-popper-content-wrapper], .mobile-panel'));
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return hasOverlay || event.defaultPrevented;
}
