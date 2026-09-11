import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { getSearchState } from './findReplaceExtension';

interface FindReplaceBarProps {
  editor: Editor | null;
  onClose: () => void;
}

/**
 * Find-and-replace bar. The parent mounts it while open; highlights are
 * cleared automatically when it unmounts.
 */
export const FindReplaceBar = ({ editor, onClose }: FindReplaceBarProps) => {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);

  const searchState = useEditorState({
    editor,
    selector: ({ editor: editorInstance }) => {
      if (!editorInstance) return { matchCount: 0, activeIndex: 0 };
      const search = getSearchState(editorInstance.state);
      return {
        matchCount: search?.matches.length ?? 0,
        activeIndex: search?.activeIndex ?? 0,
      };
    },
  });

  const matchCount = searchState?.matchCount ?? 0;
  const activeIndex = searchState?.activeIndex ?? 0;

  useEffect(() => {
    findInputRef.current?.focus();

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.commands.clearSearch();
      }
    };
  }, [editor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[role=dialog], [role=alertdialog]')
      ) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    editor?.commands.setSearchQuery(value, caseSensitive);
  };

  const handleCaseSensitiveToggle = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    if (query) {
      editor?.commands.setSearchQuery(query, next);
    }
  };

  const handleReplaceAll = () => {
    if (!editor || !matchCount) return;
    const replaced = matchCount;
    editor.commands.replaceAllMatches(replacement);
    toast.success(formatMessage(t('replacedAllToast'), { count: replaced }));
  };

  const handleFindKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        editor?.commands.findPreviousMatch();
      } else {
        editor?.commands.findNextMatch();
      }
    }
  };

  return (
    <div
      role="search"
      aria-label={t('findReplaceTitle')}
      className="app-bar flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/20"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Input
          ref={findInputRef}
          data-find-input
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleFindKeyDown}
          placeholder={t('findPlaceholder')}
          aria-label={t('findPlaceholder')}
          className="h-9 w-36 min-w-0 text-sm sm:w-44"
        />
        <span className="min-w-16 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {query
            ? matchCount
              ? formatMessage(t('findMatchCount'), { current: activeIndex + 1, total: matchCount })
              : t('findNoMatches')
            : null}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-9 w-9 p-0', caseSensitive && 'bg-primary/10 text-primary')}
              onClick={handleCaseSensitiveToggle}
              aria-label={t('matchCase')}
              aria-pressed={caseSensitive}
            >
              <CaseSensitive className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('matchCase')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => editor?.commands.findPreviousMatch()}
              disabled={!matchCount}
              aria-label={t('findPrevious')}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('findPrevious')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => editor?.commands.findNextMatch()}
              disabled={!matchCount}
              aria-label={t('findNext')}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('findNext')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Input
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder={t('replacePlaceholder')}
          aria-label={t('replacePlaceholder')}
          className="h-9 w-36 min-w-0 text-sm sm:w-44"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => editor?.commands.replaceCurrentMatch(replacement)}
          disabled={!matchCount}
        >
          {t('replaceOne')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={handleReplaceAll}
          disabled={!matchCount}
        >
          {t('replaceAll')}
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-9 w-9 p-0"
        onClick={onClose}
        aria-label={t('findCloseAria')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
