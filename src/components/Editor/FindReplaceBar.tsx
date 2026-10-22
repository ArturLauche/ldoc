import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { ArrowDown, ArrowUp, CaseSensitive, ChevronDown, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { getSearchState } from './findReplaceExtension';
import { ToolbarButton } from './toolbarControls';

interface FindReplaceBarProps {
  editor: Editor | null;
  /** Phones show one row and reveal the replace row on demand. */
  compact?: boolean;
  onClose: () => void;
}

/** A text field with an optional leading icon and trailing slot, styled like `Input`. */
function Field({
  icon,
  trailing,
  className,
  children,
}: {
  icon?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-9 min-w-0 items-center rounded-md border border-input bg-card shadow-xs transition-[border-color,box-shadow] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/20 has-[input:focus-visible]:outline-hidden pointer-coarse:h-10',
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="ps-2.5 text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      {children}
      {trailing}
    </div>
  );
}

const fieldInput =
  'h-full min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none placeholder:text-muted-foreground md:text-sm';

/**
 * Find-and-replace bar. The parent mounts it while open; highlights are
 * cleared automatically when it unmounts.
 */
export const FindReplaceBar = ({ editor, compact = false, onClose }: FindReplaceBarProps) => {
  const { t, tCount } = useLocale();
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
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
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
    toast.success(tCount('replacedAllToast', replaced));
  };

  const handleFindKeyDown = (event: KeyboardEvent) => {
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

  const iconSize = compact ? 'size-10 max-[379px]:w-9!' : undefined;

  const matchCaseButton = (
    <ToolbarButton
      label={t('matchCase')}
      pressed={caseSensitive}
      className={iconSize}
      onClick={handleCaseSensitiveToggle}
    >
      <CaseSensitive />
    </ToolbarButton>
  );

  const closeButton = (
    <ToolbarButton
      label={t('findCloseAria')}
      className={cn(iconSize, !compact && 'ms-auto')}
      onClick={onClose}
    >
      <X />
    </ToolbarButton>
  );

  return (
    <div
      role="search"
      aria-label={t('findReplaceTitle')}
      className={cn(
        'find-bar flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 sm:px-5',
        compact && 'is-compact gap-x-1 gap-y-1.5 px-2 py-1.5',
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-1', compact && 'w-full')}>
        <Field
          icon={compact ? undefined : <Search />}
          className={compact ? 'flex-1' : 'w-60'}
          trailing={
            query ? (
              // A find-bar style counter fits every language; the sentence
              // stays available to screen readers.
              <span
                aria-hidden="true"
                className={cn(
                  'shrink-0 whitespace-nowrap pe-2.5 text-xs tabular-nums text-muted-foreground',
                  !matchCount && 'text-destructive',
                )}
              >
                {`${matchCount ? activeIndex + 1 : 0}/${matchCount}`}
              </span>
            ) : null
          }
        >
          <input
            ref={findInputRef}
            data-find-input
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder={t('findPlaceholder')}
            aria-label={t('findPlaceholder')}
            aria-keyshortcuts="Enter Shift+Enter"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            className={fieldInput}
          />
        </Field>
        <span className="sr-only" aria-live="polite">
          {matchStatus}
        </span>
        {compact ? null : matchCaseButton}
        <ToolbarButton
          label={t('findPrevious')}
          shortcut="Shift+Enter"
          className={iconSize}
          onClick={() => editor?.commands.findPreviousMatch()}
          disabled={!matchCount}
        >
          <ArrowUp />
        </ToolbarButton>
        <ToolbarButton
          label={t('findNext')}
          shortcut="Enter"
          className={iconSize}
          onClick={() => editor?.commands.findNextMatch()}
          disabled={!matchCount}
        >
          <ArrowDown />
        </ToolbarButton>
        {compact ? (
          <>
            <ToolbarButton
              label={t('findToggleReplace')}
              className={iconSize}
              aria-expanded={showReplace}
              onClick={() => setShowReplace((value) => !value)}
            >
              <ChevronDown className={cn('transition-transform', showReplace && 'rotate-180')} />
            </ToolbarButton>
            {closeButton}
          </>
        ) : null}
      </div>

      {replaceVisible ? (
        <div className={cn('flex min-w-0 items-center gap-1', compact && 'w-full flex-wrap gap-1')}>
          {/* Narrow phones wrap the buttons below the field instead of squeezing it. */}
          {compact ? matchCaseButton : null}
          <Field className={compact ? 'flex-[3_1_7rem]' : 'w-60'}>
            <input
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder={t('replacePlaceholder')}
              aria-label={t('replacePlaceholder')}
              autoComplete="off"
              className={fieldInput}
            />
          </Field>
          <Button
            variant="outline"
            className={cn('ms-1', compact && 'ms-0 grow px-3')}
            onClick={() => editor?.commands.replaceCurrentMatch(replacement)}
            disabled={!matchCount}
          >
            {t('replaceOne')}
          </Button>
          <Button
            variant="outline"
            className={cn(compact && 'grow px-3')}
            onClick={handleReplaceAll}
            disabled={!matchCount}
          >
            {t('replaceAll')}
          </Button>
        </div>
      ) : null}

      {compact ? null : closeButton}
    </div>
  );
};
