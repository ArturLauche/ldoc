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
} from 'lucide-react';
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
    localStorage.removeItem('floatwrite-current-doc');
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
    
    localStorage.setItem('floatwrite-current-doc', JSON.stringify(docData));
    toast.success('Document saved');
  };

  const exportAs = (format: 'txt' | 'html' | 'rtf') => {
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
      default:
        return;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
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
              <DropdownMenuItem onClick={() => exportAs('txt')}>
                <FileType className="h-4 w-4 mr-2" />
                Plain Text (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs('html')}>
                <FileText className="h-4 w-4 mr-2" />
                HTML Document (.html)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs('rtf')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Rich Text Format (.rtf)
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
