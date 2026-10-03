import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { ArrowDown, ArrowUp, CaseSensitive, ChevronDown, X } from 'lucide-react';
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
  /** Phones show one row and reveal the replace row on demand. */
  compact?: boolean;
  onClose: () => void;
}

/**
 * Find-and-replace bar. The parent mounts it while open; highlights are
 * cleared automatically when it unmounts.
 */
export const FindReplaceBar = ({ editor, compact = false, onClose }: FindReplaceBarProps) => {
  const { t } = useLocale();
  const [showReplace, setShowReplace] = useState(false);
  const replaceVisible = !compact || showReplace;
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

  const matchStatus = query
    ? matchCount
      ? formatMessage(t('findMatchCount'), { current: activeIndex + 1, total: matchCount })
      : t('findNoMatches')
    : null;

  const iconButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    options: { disabled?: boolean; pressed?: boolean; expanded?: boolean } = {},
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 w-9 shrink-0 p-0',
            compact && 'h-10 w-10',
            (options.pressed || options.expanded) && 'bg-primary/10 text-primary',
          )}
          onClick={onClick}
          disabled={options.disabled}
          aria-label={label}
          aria-pressed={options.pressed}
          aria-expanded={options.expanded}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div
      role="search"
      aria-label={t('findReplaceTitle')}
      className={cn(
        'find-bar app-bar flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/20',
        compact && 'is-compact gap-x-1 gap-y-1.5 px-2 py-1.5',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5',
          compact && 'w-full flex-nowrap gap-0.5',
        )}
      >
        <div className={cn('relative min-w-0', compact && 'flex-1')}>
          <Input
            ref={findInputRef}
            data-find-input
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder={t('findPlaceholder')}
            aria-label={t('findPlaceholder')}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            className={cn('h-9 w-36 min-w-0 sm:w-44', compact && 'h-10 w-full pr-[4.75rem]')}
          />
          {compact ? (
            <span
              className="pointer-events-none absolute inset-y-0 right-2 flex max-w-[4.5rem] items-center truncate text-xs text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {matchStatus}
            </span>
          ) : null}
        </div>
        {compact ? null : (
          <span className="min-w-16 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {matchStatus}
          </span>
        )}
        {iconButton(
          t('matchCase'),
          <CaseSensitive className="h-4 w-4" />,
          handleCaseSensitiveToggle,
          {
            pressed: caseSensitive,
          },
        )}
        {iconButton(
          t('findPrevious'),
          <ArrowUp className="h-4 w-4" />,
          () => editor?.commands.findPreviousMatch(),
          { disabled: !matchCount },
        )}
        {iconButton(
          t('findNext'),
          <ArrowDown className="h-4 w-4" />,
          () => editor?.commands.findNextMatch(),
          { disabled: !matchCount },
        )}
        {compact ? (
          <>
            {iconButton(
              t('findToggleReplace'),
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', showReplace && 'rotate-180')}
              />,
              () => setShowReplace((value) => !value),
              { expanded: showReplace },
            )}
            {iconButton(t('findCloseAria'), <X className="h-4 w-4" />, onClose)}
          </>
        ) : null}
      </div>

      {replaceVisible ? (
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-1.5',
            compact && 'w-full flex-nowrap gap-1',
          )}
        >
          <Input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder={t('replacePlaceholder')}
            aria-label={t('replacePlaceholder')}
            autoComplete="off"
            className={cn('h-9 w-36 min-w-0 sm:w-44', compact && 'h-10 w-auto flex-1')}
          />
          <Button
            variant="outline"
            size="sm"
            className={cn('h-9', compact && 'h-10 shrink-0 px-3')}
            onClick={() => editor?.commands.replaceCurrentMatch(replacement)}
            disabled={!matchCount}
          >
            {t('replaceOne')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn('h-9', compact && 'h-10 shrink-0 px-3')}
            onClick={handleReplaceAll}
            disabled={!matchCount}
          >
            {t('replaceAll')}
          </Button>
        </div>
      ) : null}

      {compact ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-9 w-9 p-0"
          onClick={onClose}
          aria-label={t('findCloseAria')}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
