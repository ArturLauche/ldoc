import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Image as ImageIcon,
  ImageUp,
  Link2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import { formatMessage, type TranslationKey } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { focusContainerOnTouch } from '@/lib/inputModality';
import { cn } from '@/lib/utils';
import { ToolbarButton, ToolTile } from './toolbarControls';
import {
  DEFAULT_IMAGE_ALIGNMENT,
  DEFAULT_IMAGE_WIDTH,
  MAX_IMAGE_SIZE_MB,
  normalizeImageAlignment,
  normalizeImageUrl,
  normalizeImageWidth,
  readFileAsDataUrl,
  sanitizeAltText,
  validateImageFile,
  type ImageAlignment,
  type ImageFileError,
  type ImageUrlError,
  type ImageWidth,
} from '@/lib/media';

const URL_ERROR_KEYS: Record<ImageUrlError, TranslationKey> = {
  empty: 'imageErrorEmptyUrl',
  'too-large': 'imageErrorTooLarge',
  'invalid-protocol': 'imageErrorInvalidProtocol',
  'invalid-url': 'imageErrorInvalidUrl',
};

const WIDTHS: ImageWidth[] = ['25', '50', '75', '100'];

interface ImageToolbarProps {
  editor: Editor | null;
  /** `tile`: labeled insert control; `context`: labeled edit control for a selected image. */
  variant?: 'icon' | 'tile' | 'context';
  /** Runs once an image is inserted or updated and focus is back in the document. */
  onComplete?: () => void;
}

type Source = 'file' | 'url';

/** A picked file, read locally; nothing leaves the device. */
interface PendingFile {
  src: string;
  name: string;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export const ImageToolbar = ({ editor, variant = 'icon', onComplete }: ImageToolbarProps) => {
  const { t } = useLocale();
  const ids = useId();
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // After inserting, writing continues in the document instead of the trigger.
  const returnToEditorRef = useRef(false);
  // Opening or dismissing the dialog starts a new session; a read that
  // outlives its session was cancelled and must not change the dialog.
  const sessionRef = useRef(0);
  // Unmounting (route change, editor teardown) cancels a pending read too.
  useEffect(
    () => () => {
      sessionRef.current += 1;
    },
    [],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<Source>('file');
  const [imageUrl, setImageUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [imageAlignment, setImageAlignment] = useState<ImageAlignment>(DEFAULT_IMAGE_ALIGNMENT);
  const [imageWidth, setImageWidth] = useState<ImageWidth>(DEFAULT_IMAGE_WIDTH);
  const [currentSrc, setCurrentSrc] = useState('');

  if (!editor) return null;

  const describeFileError = (code: ImageFileError): string =>
    code === 'not-image'
      ? t('imageErrorNotImage')
      : formatMessage(t('imageErrorTooLarge'), { maxSize: MAX_IMAGE_SIZE_MB });

  /** Prepares the dialog for the current selection: edit a selected image, otherwise insert. */
  const prepare = () => {
    const selected = editor.isActive('image');
    setEditing(selected);
    setPending(null);
    setImageUrl('');
    setSource('file');
    if (!selected) {
      setAltText('');
      setImageAlignment(DEFAULT_IMAGE_ALIGNMENT);
      setImageWidth(DEFAULT_IMAGE_WIDTH);
      setCurrentSrc('');
      return;
    }
    const attributes = editor.getAttributes('image');
    setAltText(typeof attributes.alt === 'string' ? attributes.alt : '');
    setImageAlignment(normalizeImageAlignment(attributes.align));
    setImageWidth(normalizeImageWidth(attributes.width));
    setCurrentSrc(typeof attributes.src === 'string' ? attributes.src : '');
  };

  const finish = (message: TranslationKey) => {
    returnToEditorRef.current = true;
    setIsOpen(false);
    toast.success(t(message));
  };

  const insertImage = (src: string, fallbackAlt: string) => {
    editor
      .chain()
      .focus()
      .insertImage({
        src,
        alt: sanitizeAltText(altText) || fallbackAlt,
        align: normalizeImageAlignment(imageAlignment),
        width: normalizeImageWidth(imageWidth),
      })
      .run();
    finish('imageInserted');
  };

  const readFile = async (file: File) => {
    if (isReading) return;
    const validation = validateImageFile(file);
    if (!validation.ok) {
      toast.error(describeFileError(validation.code));
      return;
    }
    const session = sessionRef.current;
    setIsReading(true);
    try {
      const src = await readFileAsDataUrl(file);
      if (session !== sessionRef.current) return;
      setPending({ src, name: file.name });
    } catch {
      if (session === sessionRef.current) toast.error(t('imageUploadFailed'));
    } finally {
      if (session === sessionRef.current) setIsReading(false);
    }
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) {
      toast.error(t('imageDropNotImage'));
      return;
    }
    void readFile(file);
  };

  const handleInsert = () => {
    if (source === 'file') {
      if (pending) insertImage(pending.src, pending.name);
      return;
    }
    const normalized = normalizeImageUrl(imageUrl);
    if (!normalized.ok) {
      toast.error(formatMessage(t(URL_ERROR_KEYS[normalized.code]), { maxSize: MAX_IMAGE_SIZE_MB }));
      return;
    }
    insertImage(normalized.url, 'Image');
  };

  const handleApply = () => {
    const attributes = editor.getAttributes('image');
    editor
      .chain()
      .focus()
      .updateAttributes('image', {
        alt: sanitizeAltText(altText) || attributes.alt,
        align: normalizeImageAlignment(imageAlignment),
        width: normalizeImageWidth(imageWidth),
      })
      .run();
    finish('imageUpdated');
  };

  const canInsert = source === 'file' ? Boolean(pending) && !isReading : Boolean(imageUrl.trim());

  const placement = (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
      <Field label={t('imageAlignmentLabel')}>
        <ToggleGroup
          type="single"
          value={imageAlignment}
          onValueChange={(value) => value && setImageAlignment(normalizeImageAlignment(value))}
          aria-label={t('imageAlignmentLabel')}
          className="justify-start gap-0.5"
        >
          <ToggleGroupItem value="left" aria-label={t('toolbarAlignLeft')}>
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label={t('toolbarAlignCenter')}>
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label={t('toolbarAlignRight')}>
            <AlignRight />
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field label={t('imageSizeLabel')}>
        <ToggleGroup
          type="single"
          value={imageWidth}
          onValueChange={(value) => value && setImageWidth(normalizeImageWidth(value))}
          aria-label={t('imageSizeLabel')}
          className="justify-start gap-0.5"
        >
          {WIDTHS.map((width) => (
            <ToggleGroupItem key={width} value={width} className="tabular-nums">
              {width}%
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </div>
  );

  const altField = (
    <Field label={t('imageAltLabel')} htmlFor={`${ids}-alt`}>
      <Input
        id={`${ids}-alt`}
        value={altText}
        onChange={(event) => setAltText(event.target.value)}
        placeholder={t('imageAltPlaceholder')}
      />
    </Field>
  );

  const trigger =
    variant === 'tile' ? (
      <ToolTile icon={<ImageIcon />} label={t('insertImageShort')} aria-label={t('imageInsertTooltip')} />
    ) : variant === 'context' ? (
      <Button variant="ghost" className="h-10 gap-1.5 px-3">
        <ImageUp />
        <span className="whitespace-nowrap">{t('editImage')}</span>
      </Button>
    ) : (
      <ToolbarButton label={t('imageInsertTooltip')}>
        <ImageIcon />
      </ToolbarButton>
    );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        sessionRef.current += 1;
        setIsReading(false);
        setDragging(false);
        if (next) {
          returnToEditorRef.current = false;
          prepare();
        }
        setIsOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={focusContainerOnTouch}
        onCloseAutoFocus={(event) => {
          if (!returnToEditorRef.current) return;
          returnToEditorRef.current = false;
          event.preventDefault();
          if (editor.isDestroyed) return;
          editor.commands.focus();
          onComplete?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(editing ? 'editImage' : 'imageDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t(editing ? 'imageEditDescription' : 'imageDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="grid gap-4">
            {currentSrc ? (
              <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border bg-muted/50 p-2">
                <img src={currentSrc} alt="" className="max-h-full max-w-full rounded-sm object-contain" />
              </div>
            ) : null}
            {altField}
            {placement}
          </div>
        ) : (
          <Tabs value={source} onValueChange={(value) => setSource(value as Source)} className="grid gap-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">
                <Upload />
                {t('imageTabUpload')}
              </TabsTrigger>
              <TabsTrigger value="url">
                <Link2 />
                {t('imageTabUrl')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-0">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void readFile(file);
                }}
                className="sr-only"
                id="image-upload"
                aria-label={t('imageTabUpload')}
                tabIndex={-1}
                disabled={isReading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                disabled={isReading}
                aria-describedby={`${ids}-formats`}
                className={cn(
                  'flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-4 py-5 text-center transition-colors hover:border-ring/60 hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress',
                  dragging && 'border-ring bg-selected/10',
                )}
              >
                {pending ? (
                  <>
                    <img src={pending.src} alt="" className="max-h-24 max-w-full rounded-sm object-contain" />
                    <span className="max-w-full truncate text-sm font-medium">{pending.name}</span>
                    <span className="text-xs text-muted-foreground">{t('imageChooseAnother')}</span>
                  </>
                ) : (
                  <>
                    <Upload aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {isReading ? t('imageUploading') : t(coarsePointer ? 'imageTapHint' : 'imageDropHint')}
                    </span>
                    <span id={`${ids}-formats`} className="text-xs text-muted-foreground">
                      {formatMessage(t('imageFormatsHint'), { maxSize: MAX_IMAGE_SIZE_MB })}
                    </span>
                  </>
                )}
              </button>
            </TabsContent>

            <TabsContent value="url" className="mt-0">
              <Field label={t('imageUrlLabel')} htmlFor={`${ids}-url`}>
                <Input
                  id={`${ids}-url`}
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleInsert();
                    }
                  }}
                  placeholder="https://example.com/image.jpg"
                  aria-describedby={`${ids}-url-hint`}
                />
                <p id={`${ids}-url-hint`} className="text-xs text-muted-foreground">
                  {t('imageUrlPrivacyHint')}
                </p>
              </Field>
            </TabsContent>

            {altField}
            {placement}
          </Tabs>
        )}

        <DialogFooter className="pt-1">
          <DialogClose asChild>
            <Button variant="outline">{t('cancel')}</Button>
          </DialogClose>
          {editing ? (
            <Button onClick={handleApply}>{t('imageUpdateSelected')}</Button>
          ) : (
            <Button onClick={handleInsert} disabled={!canInsert}>
              {t('imageInsertAction')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
