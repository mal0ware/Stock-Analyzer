import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'midnight' | 'ocean' | 'terminal';

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: 'dark',     label: 'Dark',     swatch: '#0f1117' },
  { id: 'light',    label: 'Light',    swatch: '#f5f6fa' },
  { id: 'midnight', label: 'Midnight', swatch: '#000000' },
  { id: 'ocean',    label: 'Ocean',    swatch: '#0b1628' },
  { id: 'terminal', label: 'Terminal', swatch: '#0a0e0a' },
];

const STORAGE_KEY = 'stock-analyzer-theme';

function readInitial(): Theme {
  if (typeof localStorage === 'undefined') return 'dark';
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return saved && THEMES.some((t) => t.id === saved) ? saved : 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readInitial);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!previewing) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme, previewing]);

  const setTheme = (t: Theme) => {
    setPreviewing(false);
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  const previewTheme = (t: Theme) => {
    document.documentElement.setAttribute('data-theme', t);
    setPreviewing(true);
  };

  const cancelPreview = () => {
    document.documentElement.setAttribute('data-theme', theme);
    setPreviewing(false);
  };

  return { theme, setTheme, previewTheme, cancelPreview };
}

// Apply theme synchronously on module load to prevent flash-of-wrong-theme.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', readInitial());
}
