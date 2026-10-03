export type InputModality = 'keyboard' | 'mouse' | 'pen' | 'touch';

let lastModality: InputModality = 'mouse';
let listeners = 0;

const onPointerDown = (event: PointerEvent) => {
  lastModality =
    event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse';
};
const onKeyDown = (event: KeyboardEvent) => {
  // Typing into the document is not a navigation choice.
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (['Tab', 'Enter', ' ', 'Escape'].includes(event.key) || event.key.startsWith('Arrow')) {
    lastModality = 'keyboard';
  }
};

/**
 * Records how the user last interacted, so overlays can avoid moving focus
 * (and opening the software keyboard) after a tap while still focusing their
 * content for keyboard users. Returns a cleanup function; nested calls share
 * one set of listeners.
 */
export function trackInputModality(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (listeners++ === 0) {
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--listeners === 0) {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    }
  };
}

export function getInputModality(): InputModality {
  return lastModality;
}

/** True when the interaction that is being handled came from a finger or stylus. */
export function isTouchInteraction(): boolean {
  return lastModality === 'touch' || lastModality === 'pen';
}

/**
 * `onOpenAutoFocus` handler for dialogs and sheets: after a tap, focus the
 * dialog itself rather than its first control, so no software keyboard or
 * focus ring appears until the user picks a field. Keyboard users still land
 * on the first control. (Radix's FocusScope gives dialog content
 * `tabIndex={-1}`, so the container can take focus.)
 */
export function focusContainerOnTouch(event: Event) {
  if (!isTouchInteraction()) return;
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
}

/**
 * `onMouseDown` handler for toolbar surfaces: keeps focus (and the software
 * keyboard and selection) in the editor while a button is pressed. Text fields
 * still receive focus normally, and portaled overlays (whose React events
 * bubble through the toolbar) keep their default focus handling.
 */
export function keepEditorFocus(event: {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
}) {
  const { target, currentTarget } = event;
  if (!(target instanceof Element) || !(currentTarget instanceof Element)) return;
  if (!currentTarget.contains(target)) return;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
}
