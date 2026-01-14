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

    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'txt':
        content = editor.getText();
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'html':
        content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${documentName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.17em; }
  </style>
</head>
<body>
${editor.getHTML()}
</body>
</html>`;
        mimeType = 'text/html';
        extension = 'html';
        break;
      case 'rtf':
        content = convertHtmlToRtf(editor.getHTML());
        mimeType = 'application/rtf';
        extension = 'rtf';
        break;
      case 'docx': {
        const paragraphs = normalizeParagraphs(editor.getText());
        const blob = await buildDocxBlob(paragraphs);
        downloadBlob(blob, `${documentName}.docx`);
        toast.success(`Exported as ${documentName}.docx`);
        return;
      }
      case 'odt': {
        const paragraphs = normalizeParagraphs(editor.getText());

        const contentXml = buildOdtContentXml(paragraphs);
        const manifestXml = buildOdtManifestXml();
        const zip = new JSZip();

        zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
        zip.file('content.xml', contentXml);
        zip.file('META-INF/manifest.xml', manifestXml);

        const blob = await zip.generateAsync({
          type: 'blob',
          mimeType: 'application/vnd.oasis.opendocument.text',
        });

        downloadBlob(blob, `${documentName}.odt`);
        toast.success(`Exported as ${documentName}.odt`);
        return;
      }
      case 'pdf': {
        const blob = buildPdfBlob(editor.getText());
        downloadBlob(blob, `${documentName}.pdf`);
        toast.success(`Exported as ${documentName}.pdf`);
        return;
      }
      default:
        return;
    }

    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, `${documentName}.${extension}`);

    toast.success(`Exported as ${documentName}.${extension}`);
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
  let text = rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\*?\\[^{}]+\}|[{}]|\\[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .trim();
  
  return `<p>${text.split('\n').filter(p => p.trim()).join('</p><p>')}</p>`;
}

// Simple HTML to RTF converter
function convertHtmlToRtf(html: string): string {
  // Create a temporary element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  let rtf = '{\\rtf1\\ansi\\deff0';
  
  // Font table
  rtf += '{\\fonttbl{\\f0 Arial;}}';
  
  // Process content
  const processNode = (node: Node): string => {
    let result = '';
    
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent?.replace(/[\\{}]/g, '\\$&') || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      
      switch (tag) {
        case 'b':
        case 'strong':
          result += '\\b ';
          break;
        case 'i':
        case 'em':
          result += '\\i ';
          break;
        case 'u':
          result += '\\ul ';
          break;
        case 'p':
          result += '\\par ';
          break;
        case 'br':
          result += '\\line ';
          break;
        case 'h1':
          result += '\\fs48\\b ';
          break;
        case 'h2':
          result += '\\fs36\\b ';
          break;
        case 'h3':
          result += '\\fs28\\b ';
          break;
      }
      
      for (const child of Array.from(node.childNodes)) {
        result += processNode(child);
      }
      
      switch (tag) {
        case 'b':
        case 'strong':
          result += '\\b0 ';
          break;
        case 'i':
        case 'em':
          result += '\\i0 ';
          break;
        case 'u':
          result += '\\ul0 ';
          break;
        case 'h1':
        case 'h2':
        case 'h3':
          result += '\\b0\\fs24\\par ';
          break;
      }
    }
    
    return result;
  };
  
  rtf += processNode(tempDiv);
  rtf += '}';
  
  return rtf;
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

function buildOdtContentXml(paragraphs: string[]): string {
  const body = paragraphs.length
    ? paragraphs.map((paragraph) => `<text:p>${escapeXml(paragraph)}</text:p>`).join('')
    : '<text:p></text:p>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
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
</manifest:manifest>`;
}

function normalizeParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

async function buildDocxBlob(paragraphs: string[]): Promise<Blob> {
  const zip = new JSZip();
  const documentXml = buildDocxDocumentXml(paragraphs);
  const contentTypesXml = buildDocxContentTypesXml();
  const relsXml = buildDocxRelsXml();

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function buildDocxDocumentXml(paragraphs: string[]): string {
  const paragraphXml = (paragraphs.length ? paragraphs : ['']).map((paragraph) => {
    const safeText = escapeXml(paragraph || ' ');
    return `<w:p><w:r><w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`;
  });

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
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

function buildDocxRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildPdfBlob(text: string): Blob {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const lineHeight = 14;
  const maxCharsPerLine = 90;
  const lines = wrapPdfText(text || ' ', maxCharsPerLine);
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  const maxId = 3 + pages.length * 2;
  const objects: string[] = new Array(maxId + 1);

  const pageIds = pages.map((_, index) => 4 + index * 2);
  const contentIds = pages.map((_, index) => 5 + index * 2);

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pages.length} >>\nendobj`;
  objects[3] =
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj';

  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    const contentStream = buildPdfContentStream(pageLines, margin, pageHeight, lineHeight);
    const length = contentStream.length;

    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`;
    objects[contentId] =
      `${contentId} 0 obj\n<< /Length ${length} >>\nstream\n${contentStream}\nendstream\nendobj`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = new Array(maxId + 1).fill(0);

  for (let i = 1; i <= maxId; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${objects[i]}\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= maxId; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function wrapPdfText(text: string, maxChars: number): string[] {
  const sanitized = text.replace(/[^\x20-\x7E]/g, '?');
  const lines: string[] = [];

  sanitized.split('\n').forEach((line) => {
    let current = '';
    line.split(/\s+/).forEach((word) => {
      if (!word) return;
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) {
          lines.push(current);
        }
        current = word;
      } else {
        current = next;
      }
    });

    if (current) {
      lines.push(current);
    } else {
      lines.push('');
    }
  });

  return lines;
}

function buildPdfContentStream(
  lines: string[],
  margin: number,
  pageHeight: number,
  lineHeight: number,
): string {
  const startY = pageHeight - margin;
  const escapedLines = lines.map((line) => escapePdfText(line));
  let stream = 'BT\n/F1 12 Tf\n';
  stream += `${margin} ${startY} Td\n`;

  escapedLines.forEach((line, index) => {
    if (index > 0) {
      stream += `0 -${lineHeight} Td\n`;
    }
    stream += `(${line}) Tj\n`;
  });

  stream += 'ET';
  return stream;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
