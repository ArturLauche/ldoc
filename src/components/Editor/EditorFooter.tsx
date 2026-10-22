import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/hooks/useLocale';
import { formatNumber, formatTime } from '@/lib/translations';
import { useDocumentStats } from './useDocumentStats';

/**
 * Counts, last save time and legal links. Owns the count subscription, so
 * typing re-renders this footer instead of the whole editor shell.
 */
export const EditorFooter = memo(function EditorFooter({
  editor,
  lastSaved,
}: {
  editor: Editor | null;
  lastSaved: Date | null;
}) {
  const { t, tCount, locale } = useLocale();
  const { wordCount, characterCount, selectedWordCount } = useDocumentStats(editor, locale);

  return (
    <footer className="app-footer" data-editor-chrome>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground sm:px-6">
        <p className="flex flex-wrap items-center gap-x-3 tabular-nums" aria-live="off">
          <span>
            {selectedWordCount !== null
              ? tCount('selectedWords', wordCount, {
                  selected: formatNumber(selectedWordCount, locale),
                  total: formatNumber(wordCount, locale),
                })
              : tCount('wordCount', wordCount)}
          </span>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <span>{tCount('characterCount', characterCount)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {lastSaved ? (
            <span className="tabular-nums">
              {t('lastSaved')}{' '}
              <time dateTime={lastSaved.toISOString()}>
                {formatTime(lastSaved, locale)}
              </time>
            </span>
          ) : null}
          <nav className="flex items-center gap-3" aria-label={t('legalLinks')}>
            <Link to={locale === 'de' ? '/datenschutz' : '/privacy'} className="app-footer-link">
              {t('privacyPolicy')}
            </Link>
            <Link to={locale === 'de' ? '/nutzung' : '/terms'} className="app-footer-link">
              {t('termsOfUse')}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
});
