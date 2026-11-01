import { useEffect, useState } from 'react';
import { readJson, writeJson } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'api-lab.theme';
const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

// "system" leaves data-theme unset so the CSS follows prefers-color-scheme.
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readJson<ThemeMode>(KEY, 'system'));

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
    writeJson(KEY, mode);
  }, [mode]);

  return { mode, cycle: () => setMode((m) => NEXT[m]) };
}
