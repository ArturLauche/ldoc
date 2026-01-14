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
        const blocks = extractBlocksFromHtml(editor.getHTML());
        const blob = await buildDocxBlob(blocks);
        downloadBlob(blob, `${documentName}.docx`);
        toast.success(`Exported as ${documentName}.docx`);
        return;
      }
      case 'odt': {
        const blocks = extractBlocksFromHtml(editor.getHTML());

        const contentXml = buildOdtContentXml(blocks);
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
        const blocks = extractBlocksFromHtml(editor.getHTML());
        const blob = buildPdfBlob(blocks);
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

function buildOdtContentXml(blocks: HtmlBlock[]): string {
  const body = blocks.length ? buildOdtBody(blocks) : '<text:p></text:p>';

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

async function buildDocxBlob(blocks: HtmlBlock[]): Promise<Blob> {
  const zip = new JSZip();
  const documentXml = buildDocxDocumentXml(blocks);
  const contentTypesXml = buildDocxContentTypesXml();
  const relsXml = buildDocxRelsXml();
  const documentRelsXml = buildDocxDocumentRelsXml();
  const numberingXml = buildDocxNumberingXml();

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/_rels/document.xml.rels', documentRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/numbering.xml', numberingXml);

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
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

function buildDocxRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildDocxDocumentRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
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

function buildPdfBlob(blocks: HtmlBlock[]): Blob {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const maxCharsPerLine = 90;
  const lines = buildPdfLinesFromBlocks(blocks, maxCharsPerLine);
  const pages = paginatePdfLines(lines, pageHeight - margin * 2);

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
    const contentStream = buildPdfContentStream(pageLines, margin, pageHeight, pageWidth);
    const length = getPdfByteLength(contentStream);

    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`;
    objects[contentId] =
      `${contentId} 0 obj\n<< /Length ${length} >>\nstream\n${contentStream}\nendstream\nendobj`;
  });

  const pdfChunks: string[] = [];
  const offsets: number[] = new Array(maxId + 1).fill(0);
  let byteLength = 0;

  const pushChunk = (chunk: string) => {
    pdfChunks.push(chunk);
    byteLength += getPdfByteLength(chunk);
  };

  pushChunk('%PDF-1.4\n');

  for (let i = 1; i <= maxId; i += 1) {
    offsets[i] = byteLength;
    pushChunk(`${objects[i]}\n`);
  }

  const xrefStart = byteLength;
  pushChunk(`xref\n0 ${maxId + 1}\n`);
  pushChunk('0000000000 65535 f \n');
  for (let i = 1; i <= maxId; i += 1) {
    pushChunk(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`);
  }
  pushChunk(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob([encodePdfChunks(pdfChunks)], { type: 'application/pdf' });
}

type HtmlBlock = {
  type: 'paragraph' | 'heading' | 'list-item' | 'horizontal-rule';
  text: string;
  level?: number;
  listType?: 'bullet' | 'number';
};

function extractBlocksFromHtml(html: string): HtmlBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: HtmlBlock[] = [];

  const addBlock = (block: HtmlBlock) => {
    const trimmed = block.text.trim();
    if (!trimmed) return;
    blocks.push({ ...block, text: trimmed });
  };

  const extractInlineText = (node: Node): string => {
    let result = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.tagName.toLowerCase() === 'br') {
          result += '\n';
        } else {
          result += extractInlineText(child);
        }
      }
    });
    return result.replace(/\s+/g, ' ').replace(/ \n/g, '\n').replace(/\n /g, '\n');
  };

  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'p' || tag === 'div') {
      addBlock({ type: 'paragraph', text: extractInlineText(el) });
      return;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = Number(tag.replace('h', ''));
      addBlock({ type: 'heading', text: extractInlineText(el), level });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const listType = tag === 'ol' ? 'number' : 'bullet';
      el.querySelectorAll(':scope > li').forEach((item) => {
        addBlock({
          type: 'list-item',
          text: extractInlineText(item),
          listType,
        });
      });
      return;
    }

    if (tag === 'li') {
      addBlock({ type: 'list-item', text: extractInlineText(el), listType: 'bullet' });
      return;
    }

    if (tag === 'hr') {
      blocks.push({ type: 'horizontal-rule', text: '' });
      return;
    }

    el.childNodes.forEach(walk);
  };

  doc.body.childNodes.forEach(walk);
  return blocks.length ? blocks : [{ type: 'paragraph', text: extractInlineText(doc.body) }];
}

function buildDocxParagraph(block: HtmlBlock): string {
  if (block.type === 'horizontal-rule') {
    return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`;
  }

  const style =
    block.type === 'heading'
      ? buildDocxHeadingStyle(block.level ?? 1)
      : block.type === 'list-item'
        ? buildDocxListStyle(block.listType ?? 'bullet')
      : '';
  const runs = buildDocxRuns(block.text, block.type === 'heading' ? block.level : undefined);
  const prefix = block.type === 'list-item' ? '' : '';
  const prefixRun = prefix
    ? `<w:r><w:t xml:space="preserve">${escapeXml(prefix)}</w:t></w:r>`
    : '';

  return `<w:p>${style}${prefixRun}${runs}</w:p>`;
}

function buildDocxRuns(text: string, headingLevel?: number): string {
  const parts = text.split('\n');
  const runProps = headingLevel ? buildDocxHeadingRunProps(headingLevel) : '';
  return parts
    .map((part, index) => {
      const escaped = escapeXml(part);
      const breakTag = index > 0 ? '<w:r><w:br/></w:r>' : '';
      return `${breakTag}<w:r>${runProps}<w:t xml:space="preserve">${escaped}</w:t></w:r>`;
    })
    .join('');
}

function buildOdtBlock(block: HtmlBlock, index: number): string {
  if (block.type === 'horizontal-rule') {
    return `<text:p>${escapeXml('─'.repeat(48))}</text:p>`;
  }

  if (block.type === 'list-item') {
    const text = block.listType === 'number' ? `${index + 1}. ${block.text}` : block.text;
    return `<text:list-item><text:p>${buildOdtInlineText(text)}</text:p></text:list-item>`;
  }

  const tag =
    block.type === 'heading'
      ? `text:h text:outline-level="${block.level ?? 1}"`
      : 'text:p';
  return `<${tag}>${buildOdtInlineText(block.text)}</${tag.split(' ')[0]}>`;
}

function buildPdfLinesFromBlocks(blocks: HtmlBlock[], maxChars: number): PdfLine[] {
  const lines: PdfLine[] = [];
  let listIndex = 0;

  blocks.forEach((block, index) => {
    if (block.type === 'list-item') {
      listIndex += 1;
    } else {
      listIndex = 0;
    }

    if (block.type === 'horizontal-rule') {
      lines.push({ type: 'rule' });
    } else {
      const prefix =
        block.type === 'list-item'
          ? block.listType === 'number'
            ? `${listIndex}. `
            : '• '
          : '';
      const text = `${prefix}${block.text}`;
      const fontSize = block.type === 'heading' ? 16 - ((block.level ?? 1) - 1) * 2 : 12;

      wrapPdfText(text, maxChars).forEach((line) => {
        lines.push({ type: 'text', text: line, fontSize });
      });
    }

    if (index < blocks.length - 1) {
      lines.push({ type: 'spacer', fontSize: 12 });
    }
  });

  return lines.length ? lines : [{ type: 'text', text: '', fontSize: 12 }];
}

function wrapPdfText(text: string, maxChars: number): string[] {
  const lines: string[] = [];

  text.split('\n').forEach((line) => {
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
  lines: PdfLine[],
  margin: number,
  pageHeight: number,
  pageWidth: number,
): string {
  let cursorY = pageHeight - margin;
  let stream = 'BT\n/F1 12 Tf\n';
  stream += `${margin} ${cursorY} Td\n`;

  lines.forEach((line, index) => {
    if (index > 0) {
      const move = line.type === 'rule' ? 10 : (line.fontSize ?? 12) * 1.4;
      stream += `0 -${move.toFixed(2)} Td\n`;
      cursorY -= move;
    }

    if (line.type === 'rule') {
      stream += 'ET\n';
      const y = cursorY;
      stream += `q 0.5 w ${margin} ${y} m ${pageWidth - margin} ${y} l S Q\n`;
      stream += 'BT\n/F1 12 Tf\n';
      stream += `${margin} ${y} Td\n`;
      return;
    }

    if (line.type === 'spacer') {
      return;
    }

    stream += `/F1 ${line.fontSize ?? 12} Tf\n`;
    stream += `(${escapePdfText(line.text ?? '')}) Tj\n`;
  });

  stream += 'ET';
  return stream;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

type PdfLine =
  | { type: 'text'; text: string; fontSize: number }
  | { type: 'rule' }
  | { type: 'spacer'; fontSize: number };

function paginatePdfLines(lines: PdfLine[], availableHeight: number): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let used = 0;

  lines.forEach((line) => {
    const height =
      line.type === 'rule'
        ? 12
        : line.type === 'spacer'
          ? line.fontSize * 1.4
          : line.fontSize * 1.4;

    if (used + height > availableHeight && current.length) {
      pages.push(current);
      current = [];
      used = 0;
    }

    current.push(line);
    used += height;
  });

  if (current.length) {
    pages.push(current);
  }

  return pages.length ? pages : [[{ type: 'text', text: '', fontSize: 12 }]];
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

function buildOdtInlineText(text: string): string {
  return text
    .split('\n')
    .map((line, index) =>
      index === 0 ? escapeXml(line) : `<text:line-break/>${escapeXml(line)}`,
    )
    .join('');
}

function buildDocxHeadingStyle(_level: number): string {
  return `<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>`;
}

function buildDocxHeadingRunProps(level: number): string {
  const size = level === 1 ? 48 : level === 2 ? 36 : 28;
  return `<w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr>`;
}

function buildDocxListStyle(listType: HtmlBlock['listType']): string {
  const numId = listType === 'number' ? 2 : 1;
  return `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
}

function getPdfByteLength(value: string): number {
  let length = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    length += code <= 0xff ? 1 : 1;
  }
  return length;
}

function encodePdfChunks(chunks: string[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + getPdfByteLength(chunk), 0);
  const buffer = new Uint8Array(total);
  let offset = 0;

  chunks.forEach((chunk) => {
    for (let i = 0; i < chunk.length; i += 1) {
      const code = chunk.charCodeAt(i);
      buffer[offset] = code <= 0xff ? code : 63;
      offset += 1;
    }
  });

  return buffer;
}
