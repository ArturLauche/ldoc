import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/hooks/useLocale';
import { formatMessage } from '@/lib/translations';
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
  const { t, locale } = useLocale();
  const { wordCount, characterCount, selectedWordCount } = useDocumentStats(editor, locale);
  const plural = new Intl.PluralRules(locale);
  const words = wordCount.toLocaleString(locale);

  return (
    <footer className="app-footer" data-editor-chrome>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-3 tabular-nums" aria-live="off">
          <span>
            {selectedWordCount !== null
              ? formatMessage(t('selectedWords'), {
                  selected: selectedWordCount.toLocaleString(locale),
                  total: words,
                })
              : `${words} ${t(plural.select(wordCount) === 'one' ? 'word' : 'words')}`}
          </span>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <span>
            {characterCount.toLocaleString(locale)}{' '}
            {t(plural.select(characterCount) === 'one' ? 'character' : 'characters')}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {lastSaved ? (
            <span className="tabular-nums">
              {t('lastSaved')}{' '}
              <time dateTime={lastSaved.toISOString()}>
                {lastSaved.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
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
