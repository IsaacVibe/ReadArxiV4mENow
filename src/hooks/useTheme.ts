import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // The old key also stored the implicit light default; start those users in automatic mode.
    try { const value = localStorage.getItem('raven-theme-mode'); return value === 'dark' || value === 'light' ? value : 'system'; }
    catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(query.matches);
    change();
    query.addEventListener('change', change); return () => query.removeEventListener('change', change);
  }, []);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try { localStorage.setItem('raven-theme-mode', theme); } catch { /* Theme works without storage. */ }
  }, [theme, isDark]);
  return { theme, setTheme, isDark, toggleTheme: () => setTheme(value => value === 'system' ? 'light' : value === 'light' ? 'dark' : 'system') };
}
