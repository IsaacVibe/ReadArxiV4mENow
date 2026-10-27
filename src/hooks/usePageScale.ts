import { useEffect, useState } from 'react';

export const pageScales = [80, 90, 100, 110, 125, 150, 175, 200];

export function usePageScale() {
  const [scale, setScale] = useState(() => {
    try { const saved = Number(localStorage.getItem('raven-page-scale')); return pageScales.includes(saved) ? saved : 100; }
    catch { return 100; }
  });
  useEffect(() => { try { localStorage.setItem('raven-page-scale', String(scale)); } catch { /* Scaling still works without browser storage. */ } }, [scale]);
  return { scale, setScale };
}
