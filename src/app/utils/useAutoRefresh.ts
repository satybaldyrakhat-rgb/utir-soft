// Periodic auto-refresh hook for pages whose data can change server-side
// (e.g. Telegram bot creating tasks/deals/activity entries).
//
// - Calls `refresh` every `intervalMs` while the tab is visible.
// - Pauses the interval when the tab is hidden (no wasted requests).
// - Fires `refresh` once immediately when the tab becomes visible again,
//   so a user returning from Telegram sees fresh data without manual reload.

import { useEffect, useRef } from 'react';

export function useAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 15000) {
  // Keep a ref to the latest callback so we don't tear down the interval
  // every render when the caller passes an inline function.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => {
        try { void refreshRef.current(); } catch { /* swallow */ }
      }, intervalMs);
    };

    const stop = () => {
      if (timer != null) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Returning to the tab: refresh immediately, then resume polling.
        try { void refreshRef.current(); } catch { /* swallow */ }
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
