import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

/**
 * ONE shared toast system. Toasts are rendered in a viewport-fixed container (position: fixed, portalled to
 * <body>) so they are visible wherever the page is scrolled and never take part in page layout.
 *
 * - success / info: polite live region (role="status"); warning / error: assertive (role="alert")
 * - auto-dismiss: success/info 4s, warning 6s, error 8s (longer messages get more time, max 15s)
 * - toasts stack vertically with a gap (they can never overlap); at most MAX_VISIBLE are shown, oldest dropped
 * - an identical message that is already showing is refreshed instead of duplicated
 * - desktop (>= sm): top-right; phones: full width with 12px side gutters; safe-area insets respected
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastApi {
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 4;
const BASE_MS: Record<ToastType, number> = { success: 4000, info: 4000, warning: 6000, error: 8000 };

/** Errors/warnings stay long enough to read: +60ms per character beyond ~60 chars, capped at 15s. */
export function toastDuration(type: ToastType, message: string): number {
  const extra = Math.max(0, message.length - 60) * 60;
  return Math.min(15000, BASE_MS[type] + extra);
}

const ToastContext = createContext<ToastApi | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  // The list lives in a ref too so add/remove logic (and its timers) runs once per call, not inside a state
  // updater (React StrictMode runs updaters twice in development).
  const itemsRef = useRef<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const commit = (next: ToastItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };
  const clearTimer = (id: number) => {
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);
  };

  const dismiss = useCallback((id: number) => {
    clearTimer(id);
    commit(itemsRef.current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = 'info', durationMs?: number) => {
      const text = String(message ?? '').trim();
      if (!text) return;
      const duration = durationMs ?? toastDuration(type, text);
      let next = itemsRef.current;
      // Same message already on screen: replace it (fresh timer) rather than stacking duplicates.
      const same = next.find((t) => t.message === text && t.type === type);
      if (same) {
        clearTimer(same.id);
        next = next.filter((t) => t.id !== same.id);
      }
      const id = nextId.current++;
      next = [...next, { id, type, message: text, duration }];
      while (next.length > MAX_VISIBLE) {
        clearTimer(next[0].id);
        next = next.slice(1);
      }
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
      commit(next);
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((tm) => clearTimeout(tm));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, d) => show(m, 'success', d),
      error: (m, d) => show(m, 'error', d),
      warning: (m, d) => show(m, 'warning', d),
      info: (m, d) => show(m, 'info', d),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

const STYLE: Record<ToastType, { box: string; icon: React.ReactNode }> = {
  success: { box: 'bg-emerald-50 border-emerald-300 text-emerald-900', icon: <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> },
  error: { box: 'bg-red-50 border-red-300 text-[#B93A3A]', icon: <XCircle className="w-4 h-4 shrink-0 text-[#D64545]" /> },
  warning: { box: 'bg-amber-50 border-amber-300 text-amber-900', icon: <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" /> },
  info: { box: 'bg-white border-[#176B4D]/30 text-[#26332D]', icon: <Info className="w-4 h-4 shrink-0 text-[#176B4D]" /> },
};

const ToastViewport: React.FC<{ items: ToastItem[]; onDismiss: (id: number) => void }> = ({ items, onDismiss }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(
    // pointer-events-none on the container so it never blocks clicks on the page; each toast re-enables them.
    // z-[100] is above the modal overlay (z-50) and the sticky header (z-40).
    <div
      data-testid="toast-viewport"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-0 sm:w-[26rem] sm:max-w-full"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' || t.type === 'warning' ? 'alert' : 'status'}
          aria-live={t.type === 'error' || t.type === 'warning' ? 'assertive' : 'polite'}
          aria-atomic="true"
          data-testid={`toast-${t.type}`}
          className={`now-toast pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-xs font-semibold shadow-lg min-w-0 ${STYLE[t.type].box}`}
        >
          <span className="mt-px">{STYLE[t.type].icon}</span>
          <span className="flex-1 min-w-0 break-words leading-snug">{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="-m-1.5 p-1.5 shrink-0 rounded-full opacity-60 hover:opacity-100 hover:bg-black/5 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
