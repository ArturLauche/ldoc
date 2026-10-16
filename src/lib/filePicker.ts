/**
 * Opens the browser's file chooser. Must run inside a user gesture (a click
 * or tap handler). `onSelect` is not called when the chooser is cancelled.
 */
export function openFilePicker({
  accept,
  multiple = false,
  onSelect,
}: {
  accept: string;
  multiple?: boolean;
  onSelect: (files: File[]) => void;
}): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.addEventListener(
    'change',
    () => {
      const files = Array.from(input.files ?? []);
      if (files.length) onSelect(files);
    },
    { once: true },
  );
  input.click();
}
