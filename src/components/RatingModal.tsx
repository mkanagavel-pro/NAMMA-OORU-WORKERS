import React, { useState } from 'react';
import { Star, ShieldAlert, Check } from 'lucide-react';
import { Modal } from './Modal';
import { Worker } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface RatingModalProps {
  worker: Worker | null;
  isOpen: boolean;
  onClose: () => void;
  onRatingSuccess: (workerId: string, newSummary: any) => void;
  onRequireLogin: () => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({
  worker,
  isOpen,
  onClose,
  onRatingSuccess,
  onRequireLogin,
}) => {
  const { t } = useLanguage();
  const { user, token } = useAuth();

  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !worker) return null;

  const handleSubmit = async () => {
    if (!user) {
      onClose();
      onRequireLogin();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workerId: worker.id,
          rating: selectedRating,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to submit rating');
        setIsSubmitting(false);
        return;
      }

      onRatingSuccess(worker.id, data.ratingSummary);
      onClose();
    } catch {
      setErrorMessage('Network error while submitting rating');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} widthClass="max-w-md" bodyClassName="p-5 sm:p-6" overlayClassName="bg-black/40">
      <div>

        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#E8B83D]/20 text-[#176B4D] flex items-center justify-center mx-auto mb-3">
            <Star className="w-6 h-6 fill-[#E8B83D] text-[#E8B83D]" />
          </div>
          <h3 className="text-xl font-black text-[#26332D]">{t('rating_modal_title')}</h3>
          <p className="text-xs text-[#586B63] mt-1">
            {worker.name} • {worker.category}
          </p>
        </div>

        {/* 1-5 Star Interactive Selector */}
        <div className="flex items-center justify-center gap-2 py-4 mb-3">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = (hoverRating || selectedRating) >= star;
            return (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setSelectedRating(star)}
                className="p-1.5 focus:outline-none transition-transform hover:scale-125"
              >
                <Star
                  className={`w-9 h-9 transition-colors ${
                    isFilled
                      ? 'fill-[#E8B83D] text-[#E8B83D]'
                      : 'text-stone-300 hover:text-[#E8B83D]/60'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="text-center font-bold text-sm text-[#176B4D] mb-4">
          {selectedRating === 5 && '★★★★★ Excellent (சிறந்தது)'}
          {selectedRating === 4 && '★★★★☆ Very Good (மிக நல்லது)'}
          {selectedRating === 3 && '★★★☆☆ Good (நல்லது)'}
          {selectedRating === 2 && '★★☆☆☆ Fair (சுமாரானது)'}
          {selectedRating === 1 && '★☆☆☆☆ Poor (மோசம்)'}
        </div>

        {/* Anonymous Guarantee Notice (Req 12: Anonymous to worker) */}
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 mb-5 flex items-start gap-2.5">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-900 leading-relaxed">
            {t('rating_anonymous_notice')}
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 rounded-xl bg-red-50 text-xs text-[#D64545] font-semibold border border-red-200">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 transition"
          >
            {t('action_cancel')}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Submitting...' : t('rating_submit_btn')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
