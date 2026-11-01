import React, { useState } from 'react';
import { Flag, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { Worker } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface ReportModalProps {
  worker: Worker | null;
  isOpen: boolean;
  onClose: () => void;
}

const REPORT_REASONS = [
  'Fake profile',
  'Wrong information',
  'Misbehavior',
  'Spam',
  'Fraud/Scam',
  'Harassment',
  'Inappropriate content',
];

export const ReportModal: React.FC<ReportModalProps> = ({ worker, isOpen, onClose }) => {
  const { t } = useLanguage();
  const { token } = useAuth();

  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !worker) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workerId: worker.id,
          reason: selectedReason,
          description,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to submit report');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(t('report_success'));
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 2000);
    } catch {
      setErrorMessage('Network error while submitting report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} widthClass="max-w-lg" bodyClassName="p-5 sm:p-6" overlayClassName="bg-black/40">
      <div>
        <div className="flex items-center gap-3 mb-4 pr-10">
          <div className="w-10 h-10 rounded-2xl bg-red-100 text-[#D64545] flex items-center justify-center">
            <Flag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#26332D]">{t('report_modal_title')}</h3>
            <p className="text-xs text-[#586B63]">
              {worker.name} • {worker.publicArea}
            </p>
          </div>
        </div>

        {successMessage ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-emerald-900">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Fixed Reasons Selector (Req 13: Fixed reasons only, NO "Other") */}
            <div>
              <label className="block text-xs font-bold text-[#176B4D] mb-1.5">
                {t('report_reason_label')}
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {REPORT_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      selectedReason === reason
                        ? 'bg-[#176B4D]/10 border-[#176B4D] font-bold text-[#176B4D]'
                        : 'bg-white border-stone-200 hover:bg-stone-50 text-[#26332D]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-[#176B4D]"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Optional Description */}
            <div>
              <label className="block text-xs font-bold text-[#176B4D] mb-1.5">
                {t('report_desc_label')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t('report_desc_placeholder')}
                className="w-full text-xs p-3 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#176B4D]"
              />
              <span className="text-[10px] text-stone-400 block text-right">
                {description.length}/500
              </span>
            </div>

            {/* Privacy Guarantee */}
            <div className="p-3 bg-stone-100 rounded-xl text-[11px] text-[#586B63] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-[#176B4D] flex-shrink-0 mt-0.5" />
              <span>
                Reports are submitted confidentially to platform moderators. Your identity is never
                disclosed to the worker.
              </span>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-50 text-xs text-[#D64545] font-semibold border border-red-200">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 transition"
              >
                {t('action_cancel')}
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#D64545] hover:bg-red-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Submitting...' : t('report_submit_btn')}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
