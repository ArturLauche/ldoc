import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { History, Clock, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  deleteDocumentVersion,
  getDocumentVersions,
  saveDocumentVersion,
  type StoredVersion,
} from '@/lib/versionHistory';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';

interface VersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (content: string) => void;
  currentContent: string;
  documentName: string;
  documentId: string;
}

export const VersionHistory = ({
  isOpen,
  onClose,
  onRestore,
  currentContent,
  documentName,
  documentId,
}: VersionHistoryProps) => {
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<StoredVersion | null>(null);

  const loadVersions = () => {
    setVersions(getDocumentVersions(documentId));
  };

  useEffect(() => {
    loadVersions();
    setSelectedVersion(null);
  }, [documentId, isOpen]);

  const saveVersion = () => {
    saveDocumentVersion({
      documentId,
      name: documentName,
      content: currentContent,
    });
    loadVersions();
    toast.success('Version saved');
  };

  const handleRestore = (version: StoredVersion) => {
    onRestore(version.content);
    toast.success(`Restored version from ${format(new Date(version.timestamp), 'MMM d, yyyy h:mm a')}`);
    onClose();
  };

  const handleDelete = (versionId: string) => {
    deleteDocumentVersion(versionId);
    loadVersions();
    if (selectedVersion?.id === versionId) {
      setSelectedVersion(null);
    }
    toast.success('Version deleted');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="bg-background border border-border w-full max-w-4xl h-[80vh] flex flex-col rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Version History</h2>
              <p className="text-sm text-muted-foreground">{versions.length} saved versions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={saveVersion} size="sm">
              Save Current Version
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close version history">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Version List */}
          <div className="w-72 border-r border-border/50 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {versions.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No saved versions yet</p>
                    <p className="text-xs mt-1">Click "Save Current Version" to create a snapshot</p>
                  </div>
                ) : (
                  versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => setSelectedVersion(version)}
                      className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                        selectedVersion?.id === version.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-accent/50 border border-transparent'
                      }`}
                    >
                      <div className="font-medium text-sm truncate">{version.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(version.timestamp), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(version.timestamp), 'h:mm a')}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col">
            {selectedVersion ? (
              <>
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{selectedVersion.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedVersion.timestamp), 'MMMM d, yyyy \'at\' h:mm a')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(selectedVersion.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                    <Button size="sm" onClick={() => handleRestore(selectedVersion)}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Restore
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(selectedVersion.content) }}
                  />
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Select a version to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
