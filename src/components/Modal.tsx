import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Shared modal shell used by every popup (worker profile, rating, report,
 * admin actions, login/register).
 *
 * Fixes (root cause: each popup was a tall card inside a scrolling overlay with
 * the X absolutely positioned on the card, so on long content the X scrolled
 * out of view and the card could exceed the viewport):
 *  - the overlay does not scroll; the CARD is capped to the visible viewport
 *    (100dvh, so mobile browser toolbars are accounted for) and only its body scrolls
 *  - the X is positioned on the (non-scrolling) card, so it is always visible
 *  - the page behind is scroll-locked while any modal is open
 *  - clicking the dark overlay closes ordinary popups (closeOnOverlay); clicks that
 *    start inside the card, or text selections dragged outside it, never close it.
 *    Login / Register pass closeOnOverlay={false}.
 */

let scrollLocks = 0;
let savedOverflow = '';
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    if (scrollLocks === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLocks += 1;
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
    };
  }, [active]);
}

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Close when the dark overlay is clicked. Default true; false for Login/Register. */
  closeOnOverlay?: boolean;
  /** Render the top-right X (default true). */
  showClose?: boolean;
  /** Called by the X button instead of onClose (e.g. Login's "verification required" notice). */
  onCloseButton?: () => void;
  /** Tailwind max-width class, e.g. "max-w-md". */
  widthClass?: string;
  /** Extra classes for the card (border colour etc.). */
  cardClassName?: string;
  /** Padding of the scrolling body. */
  bodyClassName?: string;
  overlayClassName?: string;
  ariaLabel?: string;
}

export const Modal: React.FC<ModalProps> = ({
  onClose,
  children,
  closeOnOverlay = true,
  showClose = true,
  onCloseButton,
  widthClass = 'max-w-lg',
  cardClassName = 'border border-[#176B4D]/20',
  bodyClassName = 'p-5 sm:p-7',
  overlayClassName = 'bg-black/50',
  ariaLabel,
}) => {
  useBodyScrollLock(true);
  // Only a press that STARTED on the overlay may close it.
  const pressedOnOverlay = useRef(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-modal-overlay
      className={`fixed inset-0 h-[100dvh] z-50 flex items-center justify-center p-3 sm:p-4 ${overlayClassName} backdrop-blur-xs animate-in fade-in`}
      onPointerDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const direct = e.target === e.currentTarget;
        const started = pressedOnOverlay.current;
        pressedOnOverlay.current = false;
        if (closeOnOverlay && direct && started) onClose();
      }}
    >
      <div
        data-modal-card
        className={`relative flex flex-col w-full ${widthClass} max-h-full min-h-0 bg-[#FAF7EF] rounded-3xl shadow-2xl overflow-hidden ${cardClassName}`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onCloseButton ?? onClose}
            aria-label="Close"
            data-modal-close
            className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div data-modal-body className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
