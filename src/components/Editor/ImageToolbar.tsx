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

interface ImageToolbarProps {
  editor: Editor | null;
}

export const ImageToolbar = ({ editor }: ImageToolbarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [imageAlignment, setImageAlignment] = useState('center');
  const [imageWidth, setImageWidth] = useState('100');

  if (!editor) return null;

  const isEditingSelection = editor.isActive('image');

  const syncSelectionAttributes = () => {
    if (!isEditingSelection) {
      setAltText('');
      setImageAlignment('center');
      setImageWidth('100');
      return;
    }

    const attributes = editor.getAttributes('image');
    setAltText(attributes.alt ?? '');
    setImageAlignment(attributes.align ?? 'center');
    setImageWidth(attributes.width ?? '100');
  };

  const applyImage = (src: string, alt: string) => {
    if (isEditingSelection) {
      editor
        .chain()
        .focus()
        .updateAttributes('image', {
          src,
          alt,
          align: imageAlignment,
          width: imageWidth,
        })
        .run();
      toast.success('Image updated');
      setIsOpen(false);
      return;
    }

    editor
      .chain()
      .focus()
      .setImage({ src, alt })
      .updateAttributes('image', {
        align: imageAlignment,
        width: imageWidth,
      })
      .run();
    setIsOpen(false);
    toast.success('Image inserted');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setIsUploading(true);

    try {
      // Convert to base64 for local storage
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        applyImage(dataUrl, altText || file.name);
        setAltText('');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlInsert = () => {
    if (!imageUrl) {
      toast.error('Please enter an image URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(imageUrl);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    applyImage(imageUrl, altText || 'Image');
    setImageUrl('');
    setAltText('');
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        applyImage(dataUrl, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyFormatting = () => {
    if (!isEditingSelection) return;
    const attributes = editor.getAttributes('image');
    editor
      .chain()
      .focus()
      .updateAttributes('image', {
        alt: altText || attributes.alt,
        align: imageAlignment,
        width: imageWidth,
      })
      .run();
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
            aria-label="Insert image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Insert Image</TooltipContent>
      </Tooltip>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditingSelection ? 'Edit Image' : 'Insert Image'}</DialogTitle>
            <DialogDescription>
              Upload an image from your device or paste a URL to {isEditingSelection ? 'replace' : 'insert'} it.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url">
                <Link2 className="h-4 w-4 mr-2" />
                URL
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
                    {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF supported</p>
                </label>
              </div>

              <div className="mt-4">
                <Label htmlFor="alt-upload">Alt text (optional)</Label>
                <Input
                  id="alt-upload"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe the image..."
                  className="mt-1.5"
                />
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4 space-y-4">
              <div>
                <Label htmlFor="image-url">Image URL</Label>
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
                <Label htmlFor="alt-url">Alt text (optional)</Label>
                <Input
                  id="alt-url"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe the image..."
                  className="mt-1.5"
                />
              </div>

              <Button onClick={handleUrlInsert} className="w-full">
                Insert Image
              </Button>
            </TabsContent>
          </Tabs>

          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-sm">Alignment</Label>
              <ToggleGroup
                type="single"
                value={imageAlignment}
                onValueChange={(value) => value && setImageAlignment(value)}
                className="mt-2 justify-start"
              >
                <ToggleGroupItem value="left" aria-label="Align left">
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Align center">
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Align right">
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div>
              <Label className="text-sm">Size</Label>
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
                Update Selected Image
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
