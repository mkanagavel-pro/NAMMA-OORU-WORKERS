import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Styles the confirm button as a destructive action (default true). */
  danger?: boolean;
}

/**
 * Small confirmation dialog built on the shared Modal (same overlay, scroll lock and card styling).
 * Portalled to <body> because the header uses backdrop-filter, which would otherwise become the containing block
 * of a position:fixed overlay and trap it inside the navbar.
 * Cancel, the X, a click on the dark overlay and Escape all close it WITHOUT confirming.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <Modal onClose={onCancel} widthClass="max-w-sm" bodyClassName="p-6 pt-12 sm:p-7 sm:pt-12" ariaLabel={message}>
      <div data-testid="confirm-dialog">
        <p className="text-sm sm:text-base font-bold text-[#26332D] text-center leading-snug">{message}</p>
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            autoFocus
            data-testid="confirm-cancel"
            onClick={onCancel}
            className="min-h-[44px] px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-[#26332D] text-xs sm:text-sm font-bold transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-ok"
            onClick={onConfirm}
            className={`min-h-[44px] px-3 rounded-xl text-white text-xs sm:text-sm font-bold transition ${
              danger ? 'bg-[#D64545] hover:bg-[#B93A3A]' : 'bg-[#176B4D] hover:bg-[#2F8F68]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>,
    document.body
  );
};
