import { renderToString } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { ConfirmProvider } from '@/components/confirm-provider';
import { VersionHistory } from './VersionHistory';
import { storedItem } from '@/test/documentStorage';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('does not read or migrate history during rendering', () => {
  const open = vi.spyOn(indexedDB, 'open');
  renderToString(
    <LocaleProvider>
      <ConfirmProvider>
        <VersionHistory
          isOpen
          documentId="draft"
          documentName="Draft"
          currentContent="<p>Draft</p>"
          onClose={() => {}}
          onRestore={async () => true}
        />
      </ConfirmProvider>
    </LocaleProvider>,
  );
  expect(open).not.toHaveBeenCalled();
  open.mockRestore();
});

it('migrates legacy history after mounting even without a current document', async () => {
  localStorage.setItem(
    'lwrite-versions',
    JSON.stringify([
      {
        id: 'old-version',
        name: 'Recovered snapshot',
        content: '<p>Legacy draft</p>',
        timestamp: '2026-09-01T12:00:00Z',
      },
    ]),
  );
  render(
    <LocaleProvider>
      <ConfirmProvider>
        <VersionHistory
          isOpen
          documentId="draft"
          documentName="Draft"
          currentContent="<p></p>"
          onClose={() => {}}
          onRestore={async () => true}
        />
      </ConfirmProvider>
    </LocaleProvider>,
  );
  expect(await screen.findByText('Legacy draft')).toBeVisible();
  expect(screen.getByRole('button', { name: /Recovered snapshot/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await storedItem('lwrite-document-versions-migrated')).toBe('true');
  expect(localStorage.getItem('lwrite-versions')).toContain('Legacy draft');
});
