import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

/**
 * Radix dropdown triggers open on `pointerdown`. With a finger that turns the
 * start of a scroll gesture (in a scrolling list or toolbar) into an
 * accidental open, so touch and pen open on a completed tap instead. Mouse
 * and keyboard keep Radix's default behavior.
 *
 * Spread `triggerProps` on the `DropdownMenuTrigger` and pass `open` and
 * `onOpenChange` to the `DropdownMenu` root.
 */
export function useTouchSafeMenu() {
  const [open, setOpen] = useState(false);
  const tapRef = useRef<{ touch: boolean; wasOpen: boolean }>({ touch: false, wasOpen: false });

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const touch = event.pointerType === 'touch' || event.pointerType === 'pen';
      tapRef.current = { touch, wasOpen: open };
      if (touch) event.preventDefault();
    },
    [open],
  );

  const onClick = useCallback((_event: MouseEvent<HTMLElement>) => {
    const { touch, wasOpen } = tapRef.current;
    tapRef.current = { touch: false, wasOpen: false };
    // A tap on the trigger of an open menu has already dismissed it.
    if (touch && !wasOpen) setOpen(true);
  }, []);

  return { open, onOpenChange: setOpen, triggerProps: { onPointerDown, onClick } };
}
