import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useTheme } from '@/hooks/useTheme';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { ThemeProvider } from './theme-provider';

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <output>{`${theme}/${resolvedTheme}`}</output>
      <button type="button" onClick={() => setTheme('dark')}>
        Dark
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        System
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('starts from the stored preference and persists changes', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('light/light');
    expect(document.documentElement).toHaveClass('light');

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByRole('status')).toHaveTextContent('dark/dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // The test environment reports a light system scheme.
    await userEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(screen.getByRole('status')).toHaveTextContent('system/light');
  });

  it('applies a preference saved in another tab', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('dark/dark');
  });
});
