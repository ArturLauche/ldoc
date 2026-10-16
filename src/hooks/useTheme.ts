import { createContext, useContext } from 'react';
import type { ResolvedTheme, ThemePreference } from '@/lib/theme';

export interface ThemeContextValue {
  /** The stored choice, including `system`. */
  theme: ThemePreference;
  /** The theme on screen. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
