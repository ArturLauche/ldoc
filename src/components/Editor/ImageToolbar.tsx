import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, Link2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { formatMessage, type TranslationKey } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
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
  type ImageFileError,
  type ImageUrlError,
} from '@/lib/media';

const URL_ERROR_KEYS: Record<ImageUrlError, TranslationKey> = {
  empty: 'imageErrorEmptyUrl',
  'invalid-protocol': 'imageErrorInvalidProtocol',
  'invalid-url': 'imageErrorInvalidUrl',
};

interface ImageToolbarProps {
  editor: Editor | null;
}

export const ImageToolbar = ({ editor }: ImageToolbarProps) => {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [imageAlignment, setImageAlignment] = useState(DEFAULT_IMAGE_ALIGNMENT);
  const [imageWidth, setImageWidth] = useState(DEFAULT_IMAGE_WIDTH);

  if (!editor) return null;

  const describeFileError = (code: ImageFileError): string =>
    code === 'not-image'
      ? t('imageErrorNotImage')
      : formatMessage(t('imageErrorTooLarge'), { maxSize: MAX_IMAGE_SIZE_MB });

  const isEditingSelection = editor.isActive('image');

  const syncSelectionAttributes = () => {
    if (!isEditingSelection) {
      setAltText('');
      setImageAlignment(DEFAULT_IMAGE_ALIGNMENT);
      setImageWidth(DEFAULT_IMAGE_WIDTH);
      return;
    }

    const attributes = editor.getAttributes('image');
    setAltText(attributes.alt ?? '');
    setImageAlignment(normalizeImageAlignment(attributes.align));
    setImageWidth(normalizeImageWidth(attributes.width));
  };

  const insertImage = (src: string, fallbackAlt: string) => {
    const safeAlt = sanitizeAltText(altText) || fallbackAlt;
    const safeAlignment = normalizeImageAlignment(imageAlignment);
    const safeWidth = normalizeImageWidth(imageWidth);

    editor
      .chain()
      .focus()
      .setImage({
        src,
        alt: safeAlt,
      })
      .updateAttributes('image', {
        align: safeAlignment,
        width: safeWidth,
      })
      .run();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.ok) {
      toast.error(describeFileError(validation.code));
      return;
    }

    setIsUploading(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      insertImage(dataUrl, file.name);
      setIsOpen(false);
      setAltText('');
      toast.success(t('imageInserted'));
    } catch {
      toast.error(t('imageUploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlInsert = () => {
    const normalized = normalizeImageUrl(imageUrl);
    if (!normalized.ok) {
      toast.error(t(URL_ERROR_KEYS[normalized.code]));
      return;
    }

    insertImage(normalized.url, 'Image');
    setIsOpen(false);
    setImageUrl('');
    setAltText('');
    toast.success(t('imageInserted'));
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file) {
      toast.error(t('imageDropNotImage'));
      return;
    }

    const validation = validateImageFile(file);
    if (!validation.ok) {
      toast.error(describeFileError(validation.code));
      return;
    }

    readFileAsDataUrl(file)
      .then((dataUrl) => {
        insertImage(dataUrl, file.name);
        toast.success(t('imageInserted'));
      })
      .catch(() => {
        toast.error(t('imageUploadFailed'));
      });
  };

  const handleApplyFormatting = () => {
    if (!isEditingSelection) return;
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
    toast.success(t('imageUpdated'));
    setIsOpen(false);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              syncSelectionAttributes();
              setIsOpen(true);
            }}
            className="h-8 w-8 p-0"
            aria-label={t('imageInsertTooltip')}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('imageInsertTooltip')}</TooltipContent>
      </Tooltip>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('imageDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('imageDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Upload className="h-4 w-4 mr-2" />
                {t('imageTabUpload')}
              </TabsTrigger>
              <TabsTrigger value="url">
                <Link2 className="h-4 w-4 mr-2" />
                {t('imageTabUrl')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4">
              <div
                className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="image-upload"
                  disabled={isUploading}
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {isUploading ? t('imageUploading') : t('imageDropHint')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('imageFormatsHint')}</p>
                </label>
              </div>

              <div className="mt-4">
                <Label htmlFor="alt-upload">{t('imageAltLabel')}</Label>
                <Input
                  id="alt-upload"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder={t('imageAltPlaceholder')}
                  className="mt-1.5"
                />
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4 space-y-4">
              <div>
                <Label htmlFor="image-url">{t('imageUrlLabel')}</Label>
                <Input
                  id="image-url"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="alt-url">{t('imageAltLabel')}</Label>
                <Input
                  id="alt-url"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder={t('imageAltPlaceholder')}
                  className="mt-1.5"
                />
              </div>

              <Button onClick={handleUrlInsert} className="w-full">
                {t('imageInsertAction')}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-sm">{t('imageAlignmentLabel')}</Label>
              <ToggleGroup
                type="single"
                value={imageAlignment}
                onValueChange={(value) => value && setImageAlignment(value)}
                className="mt-2 justify-start"
              >
                <ToggleGroupItem value="left" aria-label={t('toolbarAlignLeft')}>
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label={t('toolbarAlignCenter')}>
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label={t('toolbarAlignRight')}>
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div>
              <Label className="text-sm">{t('imageSizeLabel')}</Label>
              <ToggleGroup
                type="single"
                value={imageWidth}
                onValueChange={(value) => value && setImageWidth(value)}
                className="mt-2 justify-start"
              >
                <ToggleGroupItem value="25">25%</ToggleGroupItem>
                <ToggleGroupItem value="50">50%</ToggleGroupItem>
                <ToggleGroupItem value="75">75%</ToggleGroupItem>
                <ToggleGroupItem value="100">100%</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {isEditingSelection && (
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={handleApplyFormatting}>
                {t('imageUpdateSelected')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
