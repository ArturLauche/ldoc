import { useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  FileText,
  FolderOpen,
  Save,
  Download,
  FilePlus,
  History,
  ChevronDown,
  FileType,
  FileSpreadsheet,
  FileOutput,
  FileBadge2,
  FileArchive,
} from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { importDocument, getSupportedFormats } from './DocumentImporter';

interface FileMenuProps {
  editor: Editor | null;
  documentName: string;
  setDocumentName: (name: string) => void;
  onShowVersionHistory: () => void;
  hasUnsavedChanges: boolean;
}

const STORAGE_KEY = 'lwrite-current-doc';
const LEGACY_STORAGE_KEY = 'floatwrite-current-doc';

export const FileMenu = ({
  editor,
  documentName,
  setDocumentName,
  onShowVersionHistory,
  hasUnsavedChanges,
}: FileMenuProps) => {
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(documentName);
  const [isImporting, setIsImporting] = useState(false);

  const handleNewDocument = () => {
    if (!editor) return;
    
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Create a new document anyway?')) {
        return;
      }
    }
    
    editor.commands.setContent('<p></p>');
    setDocumentName('Untitled Document');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    toast.success('New document created');
  };

  const handleOpenFile = async () => {
    if (!editor) return;
    
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = getSupportedFormats();
      
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        setIsImporting(true);
        toast.loading('Importing document...', { id: 'import' });

        try {
          const result = await importDocument(file);
          editor.commands.setContent(result.content);
          setDocumentName(result.fileName);
          toast.success(`Opened: ${file.name}`, { id: 'import' });
        } catch (error) {
          console.error('Import error:', error);
          toast.error('Failed to import document. Try a different format.', { id: 'import' });
        } finally {
          setIsImporting(false);
        }
      };
      
      input.click();
    } catch (error) {
      toast.error('Failed to open file');
    }
  };

  const handleSave = () => {
    if (!editor) return;
    
    const content = editor.getHTML();
    const docData = {
      name: documentName,
      content,
      savedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docData));
    toast.success('Document saved');
  };

  const exportAs = async (format: 'txt' | 'html' | 'rtf' | 'docx' | 'odt' | 'pdf') => {
    if (!editor) return;

    const editorHtml = editor.getHTML();
    const blocks = extractBlocksFromHtml(editorHtml);

    let content: string;
    let mimeType: string;
    let extension: string;

    try {
      switch (format) {
        case 'txt':
          content = editor.getText();
          mimeType = 'text/plain';
          extension = 'txt';
          break;
        case 'html':
          content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(documentName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #111827; }
    h1 { font-size: 2em; margin: 0.6em 0 0.4em; }
    h2 { font-size: 1.5em; margin: 0.6em 0 0.4em; }
    h3 { font-size: 1.17em; margin: 0.6em 0 0.4em; }
    p { margin: 0 0 0.75em; }
    ul, ol { padding-left: 1.5em; margin: 0 0 1em; }
    li { margin: 0.2em 0; }
    blockquote { border-left: 3px solid #e5e7eb; padding-left: 1em; color: #374151; margin: 1em 0; }
    mark { background-color: #fef08a; }
    img { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
    hr { border: none; border-top: 1px solid #d1d5db; margin: 1.5em 0; }
  </style>
</head>
<body>
${editorHtml}
</body>
</html>`;
          mimeType = 'text/html';
          extension = 'html';
          break;
        case 'rtf':
          content = convertHtmlToRtf(editorHtml);
          mimeType = 'application/rtf';
          extension = 'rtf';
          break;
        case 'docx': {
          const blob = await buildDocxBlob(blocks);
          const fileName = buildExportFileName(documentName, 'docx');
          downloadBlob(blob, fileName);
          toast.success(`Exported as ${fileName}`);
          return;
        }
        case 'odt': {
          const contentXml = buildOdtContentXml(blocks);
          const manifestXml = buildOdtManifestXml();
          const stylesXml = buildOdtStylesXml();
          const metaXml = buildOdtMetaXml();
          const settingsXml = buildOdtSettingsXml();
          const zip = new JSZip();

          zip.file('mimetype', 'application/vnd.oasis.opendocument.text', {
            compression: 'STORE',
          });
          zip.file('content.xml', contentXml);
          zip.file('styles.xml', stylesXml);
          zip.file('meta.xml', metaXml);
          zip.file('settings.xml', settingsXml);
          zip.file('META-INF/manifest.xml', manifestXml);

          const blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.oasis.opendocument.text',
          });

          const fileName = buildExportFileName(documentName, 'odt');
          downloadBlob(blob, fileName);
          toast.success(`Exported as ${fileName}`);
          return;
        }
        case 'pdf': {
          const blob = await buildPdfBlob(blocks);
          const fileName = buildExportFileName(documentName, 'pdf');
          downloadBlob(blob, fileName);
          toast.success(`Exported as ${fileName}`);
          return;
        }
        default:
          return;
      }

      const fileName = buildExportFileName(documentName, extension);
      const blob = new Blob([content], { type: mimeType });
      downloadBlob(blob, fileName);

      toast.success(`Exported as ${fileName}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    }
  };

  const handleRename = () => {
    if (newName.trim()) {
      setDocumentName(newName.trim());
      setRenameOpen(false);
      toast.success('Document renamed');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 px-3 gap-2 font-medium">
            <FileText className="h-4 w-4" />
            File
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 bg-popover border border-border shadow-lg z-50" align="start">
          <DropdownMenuItem onClick={handleNewDocument}>
            <FilePlus className="h-4 w-4 mr-2" />
            New Document
            <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleOpenFile} disabled={isImporting}>
            <FolderOpen className="h-4 w-4 mr-2" />
            {isImporting ? 'Importing...' : 'Open...'}
            <span className="ml-auto text-xs text-muted-foreground">⌘O</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save
            <span className="ml-auto text-xs text-muted-foreground">⌘S</span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="h-4 w-4 mr-2" />
              Export As
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-popover border border-border shadow-lg z-50 min-w-[180px]">
              <DropdownMenuItem onClick={() => void exportAs('txt')}>
                <FileType className="h-4 w-4 mr-2" />
                Plain Text (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('html')}>
                <FileText className="h-4 w-4 mr-2" />
                HTML Document (.html)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('rtf')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Rich Text Format (.rtf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('docx')}>
                <FileBadge2 className="h-4 w-4 mr-2" />
                Word Document (.docx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('odt')}>
                <FileArchive className="h-4 w-4 mr-2" />
                OpenDocument Text (.odt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('pdf')}>
                <FileOutput className="h-4 w-4 mr-2" />
                PDF Document (.pdf)
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => {
            setNewName(documentName);
            setRenameOpen(true);
          }}>
            Rename...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShowVersionHistory}>
            <History className="h-4 w-4 mr-2" />
            Version History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Document</DialogTitle>
            <DialogDescription>
              Enter a new name for your document.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Document name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Simple RTF to HTML converter
function convertRtfToHtml(rtf: string): string {
  // Basic conversion - strips RTF formatting and returns plain text wrapped in paragraphs
  const text = rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\*?\\[^{}]+\}|[{}]|\\[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .trim();
  
  return `<p>${text.split('\n').filter(p => p.trim()).join('</p><p>')}</p>`;
}

// Simple HTML to RTF converter
function convertHtmlToRtf(html: string): string {
  const blocks = extractBlocksFromHtml(html);
  return buildRtfDocument(blocks);
}

function buildRtfDocument(blocks: HtmlBlock[]): string {
  const fonts = collectRtfFonts(blocks);
  const colors = collectRtfColors(blocks);

  let rtf = '{\\rtf1\\ansi\\deff0';
  rtf += buildRtfFontTable(fonts);
  rtf += buildRtfColorTable(colors);
  rtf += '\n';

  let listIndex = 0;
  blocks.forEach((block, index) => {
    if (block.type === 'list-item') {
      listIndex += 1;
    } else {
      listIndex = 0;
    }
    rtf += buildRtfBlock(block, fonts, colors, listIndex);
    if (index < blocks.length - 1) {
      rtf += '\\par\n';
    }
  });

  rtf += '}';
  return rtf;
}

function collectRtfFonts(blocks: HtmlBlock[]): Map<string, number> {
  const fonts = new Map<string, number>();
  fonts.set('Arial', 0);
  let index = 1;
  blocks.forEach((block) => {
    block.segments?.forEach((segment) => {
      const font = segment.style.fontFamily ? normalizeFontFamilyValue(segment.style.fontFamily) : '';
      if (font && !fonts.has(font)) {
        fonts.set(font, index);
        index += 1;
      }
    });
  });
  return fonts;
}

function collectRtfColors(blocks: HtmlBlock[]): Map<string, number> {
  const colors = new Map<string, number>();
  let index = 1;
  blocks.forEach((block) => {
    block.segments?.forEach((segment) => {
      const color = normalizeColorToHex(segment.style.color);
      if (color && !colors.has(color)) {
        colors.set(color, index);
        index += 1;
      }
      const background = normalizeColorToHex(segment.style.backgroundColor);
      if (background && !colors.has(background)) {
        colors.set(background, index);
        index += 1;
      }
    });
  });
  return colors;
}

function buildRtfFontTable(fonts: Map<string, number>): string {
  const entries = Array.from(fonts.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([font, index]) => `{\\f${index} ${font};}`)
    .join('');
  return `{\\fonttbl${entries}}`;
}

function buildRtfColorTable(colors: Map<string, number>): string {
  if (!colors.size) {
    return '{\\colortbl;}';
  }
  const entries = Array.from(colors.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([hex]) => {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return `\\red${r}\\green${g}\\blue${b};`;
    })
    .join('');
  return `{\\colortbl;${entries}}`;
}

function buildRtfBlock(
  block: HtmlBlock,
  fonts: Map<string, number>,
  colors: Map<string, number>,
  listIndex: number,
): string {
  if (block.type === 'horizontal-rule') {
    return '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\par';
  }

  const alignControl = block.align
    ? block.align === 'center'
      ? '\\qc'
      : block.align === 'right'
        ? '\\qr'
        : block.align === 'justify'
          ? '\\qj'
          : '\\ql'
    : '\\ql';
  const fontSize = block.type === 'heading' ? getRtfHeadingSize(block.level ?? 1) : FONT_SIZE_BASE;
  const paragraphPrefix = `\\pard${alignControl}\\fs${fontSize} `;

  if (block.type === 'image') {
    const placeholder = buildImagePlaceholderSegments(block);
    return `${paragraphPrefix}${buildRtfRunsFromSegments(placeholder, fonts, colors, fontSize)}`;
  }

  if (block.type === 'list-item') {
    const prefix =
      block.listType === 'number' ? `${listIndex}. ` : '• ';
    const segments = block.segments ?? [{ text: '', style: {} }];
    const prefixed = prefix ? [{ text: prefix, style: {} }, ...segments] : segments;
    return `${paragraphPrefix}${buildRtfRunsFromSegments(prefixed, fonts, colors, fontSize)}`;
  }

  const segments = block.segments ?? [{ text: '', style: {} }];
  return `${paragraphPrefix}${buildRtfRunsFromSegments(segments, fonts, colors, fontSize)}`;
}

function buildRtfRunsFromSegments(
  segments: InlineSegment[],
  fonts: Map<string, number>,
  colors: Map<string, number>,
  paragraphFontSize: number,
): string {
  return normalizeSegments(segments)
    .map((segment) => {
      const fontKey = segment.style.fontFamily ? normalizeFontFamilyValue(segment.style.fontFamily) : '';
      const fontIndex = fontKey ? fonts.get(fontKey) ?? 0 : 0;
      const colorIndex = segment.style.color
        ? colors.get(normalizeColorToHex(segment.style.color) ?? '') ?? 0
        : 0;
      const backgroundIndex = segment.style.backgroundColor
        ? colors.get(normalizeColorToHex(segment.style.backgroundColor) ?? '') ?? 0
        : 0;

      const controls = [
        `\\f${fontIndex}`,
        `\\cf${colorIndex}`,
        `\\highlight${backgroundIndex}`,
        segment.style.bold ? '\\b' : '\\b0',
        segment.style.italic ? '\\i' : '\\i0',
        segment.style.underline ? '\\ul' : '\\ul0',
        segment.style.strike ? '\\strike' : '\\strike0',
        segment.style.superscript ? '\\super' : segment.style.subscript ? '\\sub' : '\\nosupersub',
        `\\fs${resolveRtfFontSize(segment.style.fontSize, paragraphFontSize)}`,
      ].join('');

      const text = segment.text
        .split('\n')
        .map((line, index) => (index === 0 ? rtfEscape(line) : `\\line ${rtfEscape(line)}`))
        .join('');

      return `${controls} ${text}\\nosupersub`;
    })
    .join('');
}

function rtfEscape(text: string): string {
  return text.replace(/[\\{}]/g, '\\$&');
}

function getRtfHeadingSize(level: number): number {
  if (level === 1) return 48;
  if (level === 2) return 36;
  return 28;
}

function resolveRtfFontSize(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const points = resolvePtFromCssSize(value);
  if (!points) return fallback;
  return Math.round(points * 2);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildOdtContentXml(blocks: HtmlBlock[]): string {
  const body = blocks.length ? buildOdtBody(blocks) : '<text:p></text:p>';
  const styles = buildOdtAutomaticStyles(blocks);

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.2">
  <office:automatic-styles>
    ${styles}
  </office:automatic-styles>
  <office:body>
    <office:text>${body}</office:text>
  </office:body>
</office:document-content>`;
}

function buildOdtManifestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/" />
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml" />
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml" />
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml" />
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="settings.xml" />
</manifest:manifest>`;
}

function buildOdtStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:paragraph-properties fo:hyphenation-ladder-count="no-limit" text:number-lines="false" text:line-number="0"/>
      <style:text-properties fo:font-size="12pt"/>
    </style:default-style>
  </office:styles>
</office:document-styles>`;
}

function buildOdtMetaXml(): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.2">
  <office:meta>
    <meta:generator>LWrite</meta:generator>
    <meta:creation-date>${escapeXml(now)}</meta:creation-date>
  </office:meta>
</office:document-meta>`;
}

function buildOdtSettingsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"
  office:version="1.2">
  <office:settings>
    <config:config-item-set config:name="ooo:view-settings" />
    <config:config-item-set config:name="ooo:configuration-settings" />
  </office:settings>
</office:document-settings>`;
}

async function buildDocxBlob(blocks: HtmlBlock[]): Promise<Blob> {
  const zip = new JSZip();
  const documentXml = buildDocxDocumentXml(blocks);
  const contentTypesXml = buildDocxContentTypesXml();
  const relsXml = buildDocxRelsXml();
  const documentRelsXml = buildDocxDocumentRelsXml();
  const numberingXml = buildDocxNumberingXml();
  const stylesXml = buildDocxStylesXml();
  const coreXml = buildDocxCoreXml();
  const appXml = buildDocxAppXml();

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('docProps/core.xml', coreXml);
  zip.file('docProps/app.xml', appXml);
  zip.file('word/_rels/document.xml.rels', documentRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/numbering.xml', numberingXml);
  zip.file('word/styles.xml', stylesXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function buildDocxDocumentXml(blocks: HtmlBlock[]): string {
  const paragraphXml = (blocks.length ? blocks : [{ type: 'paragraph', text: '' }]).map(
    (block) => buildDocxParagraph(block),
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphXml.join('')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildDocxContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function buildDocxRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildDocxDocumentRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildDocxNumberingXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0">
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="1"/>
  </w:num>
  <w:num w:numId="2">
    <w:abstractNumId w:val="2"/>
  </w:num>
</w:numbering>`;
}

function buildDocxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
}

function buildDocxCoreXml(): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>LWrite Export</dc:title>
  <dc:creator>LWrite</dc:creator>
  <cp:lastModifiedBy>LWrite</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(now)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(now)}</dcterms:modified>
</cp:coreProperties>`;
}

function buildDocxAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>LWrite</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`;
}

async function buildPdfBlob(blocks: HtmlBlock[]): Promise<Blob> {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const maxCharsPerLine = 90;

  const preparedBlocks = await preparePdfBlocks(blocks);
  const lines = buildPdfLinesFromBlocks(preparedBlocks, maxCharsPerLine, pageWidth, margin);
  const pages = paginatePdfLines(lines, pageHeight, margin);

  const objects: PdfChunk[][] = [];
  let nextId = 1;

  const addObject = (chunks: PdfChunk[]): number => {
    const id = nextId;
    objects[id] = chunks;
    nextId += 1;
    return id;
  };

  const fontRegistry = buildPdfFontRegistry(lines);
  const fontEntries = Array.from(fontRegistry.entries());
  const fontObjectIds = new Map<string, number>();
  fontEntries.forEach(([name]) => {
    const id = addObject([
      `${nextId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>\nendobj`,
    ]);
    fontObjectIds.set(name, id);
  });

  const imageRegistry = new Map<string, { id: number; image: PreparedPdfImage; name: string }>();
  const imageNames = new Map<string, string>();
  let imageIndex = 1;
  lines.forEach((line) => {
    if (line.type !== 'image') return;
    if (imageRegistry.has(line.src)) return;
    const name = `Im${imageIndex}`;
    imageIndex += 1;
    const image = line.image;
    const id = addObject([
      `${nextId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(
        image.width,
      )} /Height ${Math.round(image.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      '\nendstream\nendobj',
    ]);
    imageRegistry.set(line.src, { id, image, name });
    imageNames.set(line.src, name);
  });

  const pagesObjectId = addObject(['']);
  const pageIds: number[] = [];

  pages.forEach((pageLines) => {
    const contentStream = buildPdfContentStream(pageLines, margin, pageHeight, pageWidth, {
      fontRegistry,
      imageNames,
    });
    const contentId = addObject([
      `${nextId} 0 obj\n<< /Length ${getPdfChunkLength(contentStream)} >>\nstream\n`,
      contentStream,
      '\nendstream\nendobj',
    ]);

    const fontResourceEntries = fontEntries
      .map(([name, key]) => `/${key} ${fontObjectIds.get(name)} 0 R`)
      .join(' ');
    const imageResourceEntries = Array.from(imageRegistry.values())
      .map((entry) => `/${entry.name} ${entry.id} 0 R`)
      .join(' ');
    const resources = `<< /Font << ${fontResourceEntries} >>${
      imageResourceEntries ? ` /XObject << ${imageResourceEntries} >>` : ''
    } >>`;

    const pageId = addObject([
      `${nextId} 0 obj\n<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources ${resources} /Contents ${contentId} 0 R >>\nendobj`,
    ]);
    pageIds.push(pageId);
  });

  const pagesObject = `${pagesObjectId} 0 obj\n<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageIds.length} >>\nendobj`;
  objects[pagesObjectId] = [pagesObject];

  const catalogId = addObject([
    `${nextId} 0 obj\n<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>\nendobj`,
  ]);

  const pdfChunks: PdfChunk[] = [];
  const offsets: number[] = new Array(nextId + 1).fill(0);
  let byteLength = 0;

  const pushChunk = (chunk: PdfChunk) => {
    pdfChunks.push(chunk);
    byteLength += getPdfChunkLength(chunk);
  };

  pushChunk('%PDF-1.4\n');

  for (let i = 1; i < nextId; i += 1) {
    offsets[i] = byteLength;
    objects[i].forEach(pushChunk);
    pushChunk('\n');
  }

  const xrefStart = byteLength;
  pushChunk(`xref\n0 ${nextId}\n`);
  pushChunk('0000000000 65535 f \n');
  for (let i = 1; i < nextId; i += 1) {
    pushChunk(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`);
  }
  pushChunk(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob([new Uint8Array(encodePdfChunks(pdfChunks))], { type: 'application/pdf' });
}

type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: string;
  superscript?: boolean;
  subscript?: boolean;
};

type InlineSegment = {
  text: string;
  style: InlineStyle;
};

type HtmlBlock = {
  type: 'paragraph' | 'heading' | 'list-item' | 'horizontal-rule' | 'image';
  segments?: InlineSegment[];
  level?: number;
  listType?: 'bullet' | 'number';
  align?: 'left' | 'center' | 'right' | 'justify';
  src?: string;
  alt?: string;
  widthPct?: number;
};

type PreparedHtmlBlock = HtmlBlock & {
  image?: PreparedPdfImage;
};

type PdfTextSegment = {
  text: string;
  style: InlineStyle;
};

type PdfTextLine = {
  type: 'text';
  segments: PdfTextSegment[];
  fontSize: number;
  baseFontSize: number;
  align?: HtmlBlock['align'];
};

type PdfLine =
  | PdfTextLine
  | { type: 'rule' }
  | { type: 'spacer'; fontSize: number }
  | {
      type: 'image';
      image: PreparedPdfImage;
      src: string;
      width: number;
      height: number;
      align?: HtmlBlock['align'];
    };

type PreparedPdfImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

type PdfChunk = string | Uint8Array;

const EMPTY_STYLE: InlineStyle = {};

const FONT_SIZE_BASE = 24;

function mergeInlineStyles(base: InlineStyle, override: InlineStyle): InlineStyle {
  return {
    bold: base.bold || override.bold,
    italic: base.italic || override.italic,
    underline: base.underline || override.underline,
    strike: base.strike || override.strike,
    superscript: base.superscript || override.superscript,
    subscript: base.subscript || override.subscript,
    color: override.color ?? base.color,
    backgroundColor: override.backgroundColor ?? base.backgroundColor,
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontSize: override.fontSize ?? base.fontSize,
  };
}

function normalizeFontFamilyValue(value: string): string {
  return value.split(',')[0].trim().replace(/['"]/g, '');
}

function normalizeSegments(segments: InlineSegment[]): InlineSegment[] {
  const normalized: InlineSegment[] = [];
  segments.forEach((segment) => {
    if (!segment.text) return;
    const last = normalized.at(-1);
    if (last && JSON.stringify(last.style) === JSON.stringify(segment.style)) {
      last.text += segment.text;
    } else {
      normalized.push({ ...segment, style: { ...segment.style } });
    }
  });
  return normalized;
}

function hasVisibleText(segments: InlineSegment[]): boolean {
  return segments.some((segment) => segment.text.replace(/\s+/g, '').length > 0);
}

function getInlineStyleFromElement(el: HTMLElement): InlineStyle {
  const style: InlineStyle = {};
  const tag = el.tagName.toLowerCase();

  if (tag === 'strong' || tag === 'b') {
    style.bold = true;
  }
  if (tag === 'em' || tag === 'i') {
    style.italic = true;
  }
  if (tag === 'u') {
    style.underline = true;
  }
  if (tag === 's' || tag === 'strike' || tag === 'del') {
    style.strike = true;
  }
  if (tag === 'sup') {
    style.superscript = true;
  }
  if (tag === 'sub') {
    style.subscript = true;
  }

  const css = el.style;
  if (css.color) {
    style.color = css.color;
  }
  if (css.backgroundColor) {
    style.backgroundColor = css.backgroundColor;
  }
  if (css.fontFamily) {
    style.fontFamily = normalizeFontFamilyValue(css.fontFamily);
  }
  if (css.fontWeight) {
    const weight = Number.parseInt(css.fontWeight, 10);
    if (!Number.isNaN(weight) && weight >= 600) {
      style.bold = true;
    }
  }
  if (css.fontStyle === 'italic') {
    style.italic = true;
  }
  if (css.textDecoration.includes('underline')) {
    style.underline = true;
  }
  if (css.textDecoration.includes('line-through')) {
    style.strike = true;
  }
  if (css.fontSize) {
    style.fontSize = css.fontSize;
  }

  return style;
}

function normalizeColorToHex(color?: string): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return hex
        .split('')
        .map((char) => char + char)
        .join('')
        .toUpperCase();
    }
    if (hex.length === 6) {
      return hex.toUpperCase();
    }
    return null;
  }

  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      return [r, g, b]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = trimmed;
  const normalized = ctx.fillStyle;
  if (normalized.startsWith('#')) {
    return normalizeColorToHex(normalized);
  }
  return normalizeColorToHex(normalized);
}

function normalizeAlign(value?: string | null): HtmlBlock['align'] | undefined {
  if (!value) return undefined;
  if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
    return value;
  }
  return undefined;
}

function extractBlocksFromHtml(html: string): HtmlBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: HtmlBlock[] = [];

  const addTextBlock = (block: HtmlBlock, segments: InlineSegment[]) => {
    const normalized = normalizeSegments(segments);
    if (!hasVisibleText(normalized)) return;
    blocks.push({ ...block, segments: normalized });
  };

  const addImageBlock = (img: HTMLImageElement) => {
    const src = img.getAttribute('src') ?? '';
    if (!src) return;
    const alt = img.getAttribute('alt') ?? 'Image';
    const widthAttr = img.getAttribute('data-width') ?? img.style.width;
    const widthPct = widthAttr?.includes('%')
      ? Number.parseFloat(widthAttr)
      : widthAttr
        ? Number.parseFloat(widthAttr)
        : undefined;
    const align = normalizeAlign(img.getAttribute('data-align')) ?? normalizeAlign(img.style.textAlign);
    blocks.push({
      type: 'image',
      src,
      alt,
      widthPct: Number.isNaN(widthPct ?? NaN) ? undefined : widthPct,
      align,
    });
  };

  const collectInlineSegments = (node: Node, style: InlineStyle, segments: InlineSegment[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      segments.push({ text: node.textContent ?? '', style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      segments.push({ text: '\n', style });
      return;
    }
    if (tag === 'img') {
      return;
    }

    const nextStyle = mergeInlineStyles(style, getInlineStyleFromElement(el));
    el.childNodes.forEach((child) => collectInlineSegments(child, nextStyle, segments));
  };

  const handleBlockElement = (
    el: HTMLElement,
    blockType: HtmlBlock['type'],
    extra: Partial<HtmlBlock>,
  ) => {
    const align = normalizeAlign(el.style.textAlign) ?? normalizeAlign(el.getAttribute('align'));
    const segments: InlineSegment[] = [];
    const baseStyle = getInlineStyleFromElement(el);
    const flushSegments = () => {
      if (segments.length) {
        addTextBlock({ type: blockType, align, ...extra }, segments.splice(0));
      }
    };

    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'img') {
        flushSegments();
        addImageBlock(child as HTMLImageElement);
        return;
      }
      collectInlineSegments(child, baseStyle, segments);
    });

    flushSegments();
  };

  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'p' || tag === 'div') {
      handleBlockElement(el, 'paragraph', {});
      return;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = Number(tag.replace('h', ''));
      handleBlockElement(el, 'heading', { level });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const listType = tag === 'ol' ? 'number' : 'bullet';
      el.querySelectorAll(':scope > li').forEach((item) => {
        handleBlockElement(item as HTMLElement, 'list-item', { listType });
      });
      return;
    }

    if (tag === 'li') {
      handleBlockElement(el, 'list-item', { listType: 'bullet' });
      return;
    }

    if (tag === 'hr') {
      blocks.push({ type: 'horizontal-rule' });
      return;
    }

    if (tag === 'img') {
      addImageBlock(el as HTMLImageElement);
      return;
    }

    el.childNodes.forEach(walk);
  };

  doc.body.childNodes.forEach(walk);
  if (blocks.length) {
    return blocks;
  }

  const fallbackSegments: InlineSegment[] = [];
  collectInlineSegments(doc.body, EMPTY_STYLE, fallbackSegments);
  return [
    {
      type: 'paragraph',
      segments: normalizeSegments(fallbackSegments),
    },
  ];
}

function buildDocxParagraph(block: HtmlBlock): string {
  if (block.type === 'horizontal-rule') {
    return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`;
  }

  const paragraphProps: string[] = [];
  if (block.type === 'heading') {
    paragraphProps.push(buildDocxHeadingStyle(block.level ?? 1));
  }
  if (block.type === 'list-item') {
    paragraphProps.push(buildDocxListStyle(block.listType ?? 'bullet'));
  }
  if (block.align) {
    paragraphProps.push(buildDocxAlignment(block.align));
  }

  const propsXml = paragraphProps.length ? `<w:pPr>${paragraphProps.join('')}</w:pPr>` : '';
  const segments =
    block.type === 'image'
      ? buildImagePlaceholderSegments(block)
      : block.segments ?? [{ text: '', style: {} }];
  const runs = buildDocxRunsFromSegments(
    segments,
    block.type === 'heading' ? block.level : undefined,
  );

  return `<w:p>${propsXml}${runs}</w:p>`;
}

function buildDocxRunsFromSegments(segments: InlineSegment[], headingLevel?: number): string {
  const normalized = normalizeSegments(segments);
  return normalized
    .map((segment) => {
      const parts = segment.text.split('\n');
      return parts
        .map((part, index) => {
          const escaped = escapeXml(part);
          const breakTag = index > 0 ? '<w:r><w:br/></w:r>' : '';
          const runProps = buildDocxRunProps(segment.style, headingLevel);
          return `${breakTag}<w:r>${runProps}<w:t xml:space="preserve">${escaped}</w:t></w:r>`;
        })
        .join('');
    })
    .join('');
}

function buildOdtBlock(block: HtmlBlock, index: number): string {
  if (block.type === 'horizontal-rule') {
    return `<text:p>${escapeXml('─'.repeat(48))}</text:p>`;
  }

  if (block.type === 'list-item') {
    const segments = block.segments ?? [{ text: '', style: {} }];
    const text = block.listType === 'number' ? `${index + 1}. ` : '';
    const prefixSegments: InlineSegment[] = text
      ? [{ text, style: {} }, ...segments]
      : segments;
    const styleName = block.align ? ` text:style-name="${getOdtParagraphStyleName(block.align)}"` : '';
    return `<text:list-item><text:p${styleName}>${buildOdtInlineRuns(
      prefixSegments,
    )}</text:p></text:list-item>`;
  }

  if (block.type === 'image') {
    const segments = buildImagePlaceholderSegments(block);
    return `<text:p>${buildOdtInlineRuns(segments)}</text:p>`;
  }

  const tagName = block.type === 'heading' ? 'text:h' : 'text:p';
  const outline = block.type === 'heading' ? ` text:outline-level="${block.level ?? 1}"` : '';
  const styleName = block.align ? ` text:style-name="${getOdtParagraphStyleName(block.align)}"` : '';
  return `<${tagName}${outline}${styleName}>${buildOdtInlineRuns(
    block.segments ?? [{ text: '', style: {} }],
  )}</${tagName}>`;
}

function buildPdfLinesFromBlocks(
  blocks: PreparedHtmlBlock[],
  maxChars: number,
  pageWidth: number,
  margin: number,
): PdfLine[] {
  const lines: PdfLine[] = [];
  let listIndex = 0;
  const maxWidth = pageWidth - margin * 2;

  blocks.forEach((block, index) => {
    if (block.type === 'list-item') {
      listIndex += 1;
    } else {
      listIndex = 0;
    }

    if (block.type === 'horizontal-rule') {
      lines.push({ type: 'rule' });
    } else if (block.type === 'image' && block.image) {
      const widthTarget = block.widthPct ? (maxWidth * block.widthPct) / 100 : maxWidth;
      const width = Math.min(block.image.width, widthTarget);
      const scale = width / block.image.width;
      const height = block.image.height * scale;
      lines.push({
        type: 'image',
        image: block.image,
        src: block.src ?? '',
        width,
        height,
        align: block.align,
      });
    } else {
      const baseSegments =
        block.type === 'image'
          ? buildImagePlaceholderSegments(block)
          : block.segments ?? [{ text: '', style: {} }];
      const prefix =
        block.type === 'list-item'
          ? block.listType === 'number'
            ? `${listIndex}. `
            : '• '
          : '';
      const segments: InlineSegment[] = prefix
        ? [{ text: prefix, style: {} }, ...baseSegments]
        : baseSegments;
      const fontSize = block.type === 'heading' ? 18 - ((block.level ?? 1) - 1) * 2 : 12;
      wrapPdfSegments(segments, maxChars).forEach((lineSegments) => {
        lines.push({
          type: 'text',
          segments: lineSegments,
          fontSize: getPdfLineFontSize(lineSegments, fontSize),
          baseFontSize: fontSize,
          align: block.align,
        });
      });
    }

    if (index < blocks.length - 1) {
      lines.push({ type: 'spacer', fontSize: 12 });
    }
  });

  return lines.length
    ? lines
    : [{ type: 'text', segments: [{ text: '', style: {} }], fontSize: 12, baseFontSize: 12 }];
}

function wrapPdfSegments(segments: InlineSegment[], maxChars: number): PdfTextSegment[][] {
  const lines: PdfTextSegment[][] = [];
  let currentLine: PdfTextSegment[] = [];
  let currentLength = 0;

  const pushLine = () => {
    if (currentLine.length) {
      lines.push(currentLine);
      currentLine = [];
      currentLength = 0;
    } else {
      lines.push([]);
    }
  };

  normalizeSegments(segments).forEach((segment) => {
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      const tokens = part.split(/(\s+)/).filter((token) => token.length);
      tokens.forEach((token) => {
        const nextLength = currentLength + token.length;
        if (nextLength > maxChars && currentLine.length) {
          pushLine();
        }
        currentLine.push({ text: token, style: segment.style });
        currentLength += token.length;
      });
      if (index < parts.length - 1) {
        pushLine();
      }
    });
  });

  if (currentLine.length) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [[{ text: '', style: {} }]];
}

function buildPdfContentStream(
  lines: PdfLine[],
  margin: number,
  pageHeight: number,
  pageWidth: number,
  resources: { fontRegistry: Map<string, string>; imageNames: Map<string, string> },
): string {
  let cursorY = pageHeight - margin;
  let stream = 'BT\n';

  lines.forEach((line) => {
    if (line.type === 'spacer') {
      cursorY -= line.fontSize * 1.4;
      return;
    }

    if (line.type === 'rule') {
      cursorY -= 12;
      stream += 'ET\n';
      const y = cursorY;
      stream += `q 0.5 w ${margin} ${y} m ${pageWidth - margin} ${y} l S Q\n`;
      stream += 'BT\n';
      return;
    }

    if (line.type === 'image') {
      cursorY -= line.height;
      stream += 'ET\n';
      const x =
        line.align === 'center'
          ? margin + (pageWidth - margin * 2 - line.width) / 2
          : line.align === 'right'
            ? pageWidth - margin - line.width
            : margin;
      const imageName = resources.imageNames.get(line.src);
      if (imageName) {
        stream += `q ${line.width.toFixed(2)} 0 0 ${line.height.toFixed(
          2,
        )} ${x.toFixed(2)} ${cursorY.toFixed(2)} cm /${imageName} Do Q\n`;
      }
      stream += 'BT\n';
      return;
    }

    const lineHeight = line.fontSize * 1.4;
    const lineText = line.segments.map((segment) => segment.text).join('');
    const approximateWidth = lineText.length * line.fontSize * 0.5;
    const availableWidth = pageWidth - margin * 2;
    const x =
      line.align === 'center'
        ? margin + (availableWidth - approximateWidth) / 2
        : line.align === 'right'
          ? margin + (availableWidth - approximateWidth)
          : margin;

    stream += `1 0 0 1 ${x.toFixed(2)} ${cursorY.toFixed(2)} Tm\n`;
    line.segments.forEach((segment) => {
      const fontName = resolvePdfFontName(segment.style);
      const fontKey = resources.fontRegistry.get(fontName) ?? 'F1';
      const segmentFontSize = resolvePdfFontSize(line.baseFontSize, segment.style.fontSize);
      const color = normalizeColorToHex(segment.style.color);
      stream += `/${fontKey} ${segmentFontSize} Tf\n`;
      if (color) {
        const [r, g, b] = [
          Number.parseInt(color.slice(0, 2), 16) / 255,
          Number.parseInt(color.slice(2, 4), 16) / 255,
          Number.parseInt(color.slice(4, 6), 16) / 255,
        ];
        stream += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n`;
      } else {
        stream += '0 0 0 rg\n';
      }
      stream += `(${escapePdfText(segment.text)}) Tj\n`;
    });
    cursorY -= lineHeight;
  });

  stream += 'ET';
  return stream;
}

async function preparePdfBlocks(blocks: HtmlBlock[]): Promise<PreparedHtmlBlock[]> {
  const prepared: PreparedHtmlBlock[] = [];

  for (const block of blocks) {
    if (block.type !== 'image') {
      prepared.push(block);
      continue;
    }

    if (!block.src) {
      prepared.push({
        type: 'paragraph',
        segments: buildImagePlaceholderSegments(block),
        align: block.align,
      });
      continue;
    }

    try {
      const image = await loadPdfImage(block.src);
      if (image) {
        prepared.push({ ...block, image });
      } else {
        prepared.push({
          type: 'paragraph',
          segments: buildImagePlaceholderSegments(block),
          align: block.align,
        });
      }
    } catch {
      prepared.push({
        type: 'paragraph',
        segments: buildImagePlaceholderSegments(block),
        align: block.align,
      });
    }
  }

  return prepared;
}

function loadPdfImage(src: string): Promise<PreparedPdfImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 1);
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        resolve(null);
        return;
      }
      resolve({
        bytes: base64ToUint8Array(base64),
        width: canvas.width,
        height: canvas.height,
      });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildPdfFontRegistry(lines: PdfLine[]): Map<string, string> {
  const fonts = new Map<string, string>();
  let index = 1;
  const register = (fontName: string) => {
    if (!fonts.has(fontName)) {
      fonts.set(fontName, `F${index}`);
      index += 1;
    }
  };

  lines.forEach((line) => {
    if (line.type !== 'text') return;
    line.segments.forEach((segment) => {
      register(resolvePdfFontName(segment.style));
    });
  });

  if (!fonts.size) {
    register('Helvetica');
  }

  return fonts;
}

function resolvePdfFontName(style: InlineStyle): string {
  const family = style.fontFamily ? normalizeFontFamilyValue(style.fontFamily).toLowerCase() : '';
  let base = 'Helvetica';
  if (family.includes('times')) {
    base = 'Times-Roman';
  } else if (family.includes('courier')) {
    base = 'Courier';
  }

  const isBold = !!style.bold;
  const isItalic = !!style.italic;

  if (base === 'Times-Roman') {
    if (isBold && isItalic) return 'Times-BoldItalic';
    if (isBold) return 'Times-Bold';
    if (isItalic) return 'Times-Italic';
    return 'Times-Roman';
  }

  if (base === 'Courier') {
    if (isBold && isItalic) return 'Courier-BoldOblique';
    if (isBold) return 'Courier-Bold';
    if (isItalic) return 'Courier-Oblique';
    return 'Courier';
  }

  if (isBold && isItalic) return 'Helvetica-BoldOblique';
  if (isBold) return 'Helvetica-Bold';
  if (isItalic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code > 255) {
        return '?';
      }
      const octal = code.toString(8).padStart(3, '0');
      return `\\${octal}`;
    });
}

function paginatePdfLines(lines: PdfLine[], pageHeight: number, margin: number): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let cursorY = pageHeight - margin;

  const lineHeight = (line: PdfLine): number => {
    if (line.type === 'rule') return 12;
    if (line.type === 'spacer') return line.fontSize * 1.4;
    if (line.type === 'image') return line.height;
    return line.fontSize * 1.4;
  };

  lines.forEach((line) => {
    const height = lineHeight(line);
    if (cursorY - height < margin && current.length) {
      pages.push(current);
      current = [];
      cursorY = pageHeight - margin;
    }

    current.push(line);
    cursorY -= height;
  });

  if (current.length) {
    pages.push(current);
  }

  return pages.length
    ? pages
    : [[{ type: 'text', segments: [{ text: '', style: {} }], fontSize: 12, baseFontSize: 12 }]];
}

function buildOdtBody(blocks: HtmlBlock[]): string {
  const parts: string[] = [];
  let listBuffer: HtmlBlock[] = [];
  let listType: HtmlBlock['listType'] | null = null;

  const flushList = () => {
    if (!listBuffer.length) return;
    const items = listBuffer
      .map((block, index) => buildOdtBlock(block, index))
      .join('');
    parts.push(`<text:list>${items}</text:list>`);
    listBuffer = [];
    listType = null;
  };

  blocks.forEach((block) => {
    if (block.type === 'list-item') {
      if (listType && listType !== block.listType) {
        flushList();
      }
      listType = block.listType ?? 'bullet';
      listBuffer.push(block);
      return;
    }

    flushList();
    parts.push(buildOdtBlock(block, 0));
  });

  flushList();
  return parts.join('');
}

function buildOdtAutomaticStyles(blocks: HtmlBlock[]): string {
  const textStyles = new Map<string, InlineStyle>();
  const paragraphAlignments = new Set<HtmlBlock['align']>();

  blocks.forEach((block) => {
    if (block.align) {
      paragraphAlignments.add(block.align);
    }
    block.segments?.forEach((segment) => {
      const key = buildOdtStyleKey(segment.style);
      if (key) {
        textStyles.set(key, segment.style);
      }
    });
  });

  const paragraphStyles = Array.from(paragraphAlignments)
    .filter(Boolean)
    .map((align) => buildOdtParagraphStyleDefinition(align!))
    .join('');
  const textStyleDefs = Array.from(textStyles.values())
    .map((style) => buildOdtTextStyleDefinition(style))
    .join('');

  return `${paragraphStyles}${textStyleDefs}`;
}

function buildOdtParagraphStyleDefinition(align: HtmlBlock['align']): string {
  if (!align) return '';
  return `<style:style style:name="${getOdtParagraphStyleName(align)}" style:family="paragraph">
    <style:paragraph-properties fo:text-align="${align}"/>
  </style:style>`;
}

function buildOdtTextStyleDefinition(style: InlineStyle): string {
  const parts: string[] = [];
  if (style.bold) parts.push('fo:font-weight="bold"');
  if (style.italic) parts.push('fo:font-style="italic"');
  if (style.underline)
    parts.push('style:text-underline-style="solid" style:text-underline-width="auto"');
  if (style.strike) parts.push('style:text-line-through-style="solid"');
  if (style.superscript) parts.push('style:text-position="super 58%"');
  if (style.subscript) parts.push('style:text-position="sub 58%"');
  const color = normalizeColorToHex(style.color);
  if (color) parts.push(`fo:color="#${color}"`);
  const background = normalizeColorToHex(style.backgroundColor);
  if (background) parts.push(`fo:background-color="#${background}"`);
  if (style.fontFamily) parts.push(`fo:font-family="${escapeXml(style.fontFamily)}"`);
  if (style.fontSize) {
    const points = resolvePtFromCssSize(style.fontSize);
    if (points) {
      parts.push(`fo:font-size="${points.toFixed(1)}pt"`);
    }
  }

  if (!parts.length) return '';
  return `<style:style style:name="${getOdtTextStyleName(style)}" style:family="text">
    <style:text-properties ${parts.join(' ')}/>
  </style:style>`;
}

function buildOdtStyleKey(style: InlineStyle): string {
  const keyParts = [
    style.bold ? 'b' : '',
    style.italic ? 'i' : '',
    style.underline ? 'u' : '',
    style.strike ? 's' : '',
    style.superscript ? 'sup' : '',
    style.subscript ? 'sub' : '',
    style.color ? `c:${style.color}` : '',
    style.backgroundColor ? `bg:${style.backgroundColor}` : '',
    style.fontFamily ? `f:${style.fontFamily}` : '',
    style.fontSize ? `fs:${style.fontSize}` : '',
  ].filter(Boolean);
  return keyParts.join('|');
}

function getOdtTextStyleName(style: InlineStyle): string {
  const key = buildOdtStyleKey(style);
  if (!key) return '';
  return `T${hashString(key)}`;
}

function getOdtParagraphStyleName(align: HtmlBlock['align']): string {
  return `P-${align}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 0xfffffff;
  }
  return hash.toString(16);
}

function buildOdtInlineRuns(segments: InlineSegment[]): string {
  const normalized = normalizeSegments(segments);
  return normalized
    .map((segment) => {
      const styleName = getOdtTextStyleName(segment.style);
      const content = segment.text
        .split('\n')
        .map((line, index) =>
          index === 0 ? escapeXml(line) : `<text:line-break/>${escapeXml(line)}`,
        )
        .join('');
      if (!styleName) {
        return content;
      }
      return `<text:span text:style-name="${styleName}">${content}</text:span>`;
    })
    .join('');
}

function buildDocxHeadingStyle(_level: number): string {
  return `<w:spacing w:before="240" w:after="120"/>`;
}

function buildDocxHeadingRunProps(level: number): string {
  const size = level === 1 ? 48 : level === 2 ? 36 : 28;
  return `<w:b/><w:sz w:val="${size}"/>`;
}

function buildDocxListStyle(listType: HtmlBlock['listType']): string {
  const numId = listType === 'number' ? 2 : 1;
  return `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`;
}

function buildDocxAlignment(align: HtmlBlock['align']): string {
  if (!align) return '';
  const map: Record<NonNullable<HtmlBlock['align']>, string> = {
    left: 'left',
    center: 'center',
    right: 'right',
    justify: 'both',
  };
  return `<w:jc w:val="${map[align]}"/>`;
}

function buildDocxRunProps(style: InlineStyle, headingLevel?: number): string {
  const props: string[] = [];
  if (headingLevel) {
    props.push(buildDocxHeadingRunProps(headingLevel));
  }
  if (style.bold) props.push('<w:b/>');
  if (style.italic) props.push('<w:i/>');
  if (style.underline) props.push('<w:u w:val="single"/>');
  if (style.strike) props.push('<w:strike/>');
  if (style.superscript) props.push('<w:vertAlign w:val="superscript"/>');
  if (style.subscript) props.push('<w:vertAlign w:val="subscript"/>');

  const color = normalizeColorToHex(style.color);
  if (color) {
    props.push(`<w:color w:val="${color}"/>`);
  }

  const highlight = normalizeDocxHighlight(style.backgroundColor);
  if (highlight) {
    props.push(`<w:highlight w:val="${highlight}"/>`);
  }

  if (style.fontFamily) {
    props.push(
      `<w:rFonts w:ascii="${escapeXml(style.fontFamily)}" w:hAnsi="${escapeXml(
        style.fontFamily,
      )}"/>`,
    );
  }

  if (style.fontSize) {
    const points = resolvePtFromCssSize(style.fontSize);
    if (points) {
      props.push(`<w:sz w:val="${Math.round(points * 2)}"/>`);
    }
  }

  if (!props.length) {
    return '';
  }
  return `<w:rPr>${props.join('')}</w:rPr>`;
}

function normalizeDocxHighlight(color?: string): string | null {
  const hex = normalizeColorToHex(color);
  if (!hex) return null;
  const mapping: Record<string, string> = {
    FFFFFF: 'white',
    FFFF00: 'yellow',
    '00FF00': 'green',
    '00FFFF': 'cyan',
    FF00FF: 'magenta',
    FF0000: 'red',
    '0000FF': 'blue',
    '000000': 'black',
    '808080': 'gray',
  };
  return mapping[hex] ?? null;
}

function buildImagePlaceholderSegments(block: HtmlBlock): InlineSegment[] {
  const isSvg = block.src?.startsWith('data:image/svg+xml');
  const typeLabel = isSvg ? 'SmartArt' : 'Image';
  const label = block.alt?.trim();
  const text = label ? `${typeLabel}: ${label}` : typeLabel;
  return [{ text, style: {} }];
}

function getPdfByteLength(value: string): number {
  let length = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    length += code <= 0xff ? 1 : 1;
  }
  return length;
}

function getPdfChunkLength(chunk: PdfChunk): number {
  if (typeof chunk === 'string') {
    return getPdfByteLength(chunk);
  }
  return chunk.length;
}

function encodePdfChunks(chunks: PdfChunk[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + getPdfChunkLength(chunk), 0);
  const buffer = new Uint8Array(total);
  let offset = 0;

  chunks.forEach((chunk) => {
    if (typeof chunk === 'string') {
      for (let i = 0; i < chunk.length; i += 1) {
        const code = chunk.charCodeAt(i);
        buffer[offset] = code <= 0xff ? code : 63;
        offset += 1;
      }
      return;
    }

    buffer.set(chunk, offset);
    offset += chunk.length;
  });

  return buffer;
}

function sanitizeBaseFileName(value: string): string {
  const trimmed = value.trim();
  const base = trimmed || 'Untitled Document';
  const normalized = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

  const cleaned = normalized
    .replace(/[\/?%*:|"<> -]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/^\.+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const fallback = cleaned || 'Untitled Document';
  return fallback.slice(0, 180);
}

function buildExportFileName(value: string, extension: string): string {
  const base = sanitizeBaseFileName(value).replace(/\.[^/.]+$/, '');
  return `${base}.${extension}`;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolvePtFromCssSize(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const numeric = Number.parseFloat(trimmed);
  if (Number.isNaN(numeric) || numeric <= 0) return null;

  if (trimmed.endsWith('pt')) return numeric;
  if (trimmed.endsWith('px')) return numeric * 0.75;
  if (trimmed.endsWith('rem')) return numeric * 12;
  if (trimmed.endsWith('em')) return numeric * 12;

  return numeric;
}

function resolvePdfFontSize(fallback: number, value?: string): number {
  const points = value ? resolvePtFromCssSize(value) : null;
  return points ? Math.max(6, Math.min(48, Number(points.toFixed(2)))) : fallback;
}

function getPdfLineFontSize(segments: InlineSegment[], fallback: number): number {
  const max = segments.reduce((largest, segment) => {
    const size = resolvePdfFontSize(fallback, segment.style.fontSize);
    return Math.max(largest, size);
  }, fallback);
  return max;
}
