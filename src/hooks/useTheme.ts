import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const value = localStorage.getItem('raven-theme'); return value === 'dark' || value === 'system' ? value : 'light'; }
    catch { return 'light'; }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(query.matches);
    query.addEventListener('change', change); return () => query.removeEventListener('change', change);
  }, []);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try { localStorage.setItem('raven-theme', theme); } catch { /* Theme works without storage. */ }
  }, [theme, isDark]);
  return { theme, setTheme, isDark, toggleTheme: () => setTheme(isDark ? 'light' : 'dark') };
}
