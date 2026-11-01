import React from 'react';
import {
  Star,
  MapPin,
  Briefcase,
  Phone,
  MessageCircle,
  Heart,
  Flag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Shield,
  Layers,
  Calendar,
} from 'lucide-react';
import { Modal } from './Modal';
import { Worker } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { WORKER_CATEGORIES } from '../data/tamilNaduData';
import { localizePlace, localizeTaluk, localizeDistrict } from '../i18n/locationNames';
import { useLocationNames } from '../i18n/useLocationNames';

interface WorkerProfileModalProps {
  worker: Worker | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenRate: (worker: Worker) => void;
  onOpenReport: (worker: Worker) => void;
  onCall: (worker: Worker) => void;
  onWhatsApp: (worker: Worker) => void;
}

export const WorkerProfileModal: React.FC<WorkerProfileModalProps> = ({
  worker,
  isOpen,
  onClose,
  onOpenRate,
  onOpenReport,
  onCall,
  onWhatsApp,
}) => {
  const { language, t } = useLanguage();
  const loc = useLocationNames();
  const { isFavourite, toggleFavourite } = useAuth();

  if (!isOpen || !worker) return null;

  const isFav = isFavourite(worker.id);

  // Category Translation
  const catObj = WORKER_CATEGORIES.find((c) => c.id === worker.category);
  const categoryLabel = catObj
    ? language === 'ta'
      ? catObj.nameTa
      : catObj.nameEn
    : worker.category;

  // Breakdown Percentages
  const total = worker.ratingSummary?.totalRatings || 0;
  const breakdown = worker.ratingSummary?.breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const calcPct = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

  return (
    // pt-14 reserves a strip for the shared close button so it never overlaps the
    // favourite / report icons or the header below it.
    <Modal onClose={onClose} widthClass="max-w-2xl" bodyClassName="p-5 sm:p-7 pt-14 sm:pt-14" ariaLabel={worker.name}>
      <div>

        {/* Suspended Worker Banner (Req 27 & 30: Red Suspended badge, suspension reason NOT publicly shown) */}
        {worker.isSuspended && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#D64545] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-[#D64545] uppercase tracking-wide">
                {t('profile_suspended_notice')}
              </h4>
              <p className="text-xs text-red-800 mt-0.5">
                This worker account is currently suspended. Contact actions and new rating
                submissions are temporarily disabled.
              </p>
            </div>
          </div>
        )}

        {/* Pending Worker Banner (Req 18: Shows Verification Pending, CAN be contacted, CAN receive ratings) */}
        {!worker.isSuspended && worker.verificationStatus === 'pending' && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span className="text-xs text-amber-900 font-semibold">
              {t('status_pending')} — Profile is active and awaiting administrative badge verification.
            </span>
          </div>
        )}

        {/* Header: Photo, Name, Category, Verification */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-5 border-b border-[#176B4D]/10">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl overflow-hidden bg-white border-2 border-[#176B4D]/20 shadow-md flex-shrink-0">
            {worker.profilePhoto ? (
              <img
                src={worker.profilePhoto}
                alt={worker.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#176B4D]/15 text-[#176B4D] font-black text-3xl">
                {worker.name.charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl sm:text-2xl font-black text-[#26332D] truncate">
                {worker.name}
              </h2>
              {worker.verificationStatus === 'verified' && !worker.isSuspended && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#176B4D] text-[#FAF7EF]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#E8B83D]" />
                  {t('status_verified')}
                </span>
              )}
            </div>

            <p className="text-sm font-bold text-[#176B4D] flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-[#E8B83D]" />
              <span>{categoryLabel}</span>
            </p>

            <p className="text-xs text-[#586B63] flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#E8B83D]" />
              <span>{loc.place(worker.publicArea)}</span>
              <span className="text-stone-300">•</span>
              <span className="capitalize">{t('district_with_name', { name: loc.district(worker.district) })}</span>
            </p>

            {/* Availability Pill */}
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  worker.availability === 'Available' && !worker.isSuspended
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-stone-100 text-stone-600 border-stone-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    worker.availability === 'Available' && !worker.isSuspended
                      ? 'bg-emerald-600'
                      : 'bg-stone-400'
                  }`}
                />
                {worker.availability === 'Available' && !worker.isSuspended
                  ? t('status_available')
                  : t('status_offline')}
              </span>
            </div>
          </div>

          {/* Favourite & Report Icons */}
          <div className="flex sm:flex-col items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => toggleFavourite(worker.id)}
              className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full border transition ${
                isFav
                  ? 'bg-red-50 text-[#D64545] border-red-200'
                  : 'bg-white text-stone-400 border-stone-200 hover:text-[#D64545]'
              }`}
              aria-label={isFav ? t('action_unfavourite') : t('action_favourite')}
              title={isFav ? t('action_unfavourite') : t('action_favourite')}
            >
              <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => onOpenReport(worker)}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-white text-stone-400 hover:text-[#D64545] border border-stone-200 transition"
              aria-label={t('action_report')}
              title={t('action_report')}
            >
              <Flag className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4">
          <div className="bg-white/80 rounded-2xl p-3 border border-[#176B4D]/10">
            <span className="text-[10px] text-[#586B63] uppercase tracking-wider block font-semibold">
              {t('profile_experience')}
            </span>
            <span className="text-base font-black text-[#176B4D]">
              {worker.experience} Years
            </span>
          </div>

          <div className="bg-white/80 rounded-2xl p-3 border border-[#176B4D]/10">
            <span className="text-[10px] text-[#586B63] uppercase tracking-wider block font-semibold">
              {t('profile_rate')}
            </span>
            <span className="text-base font-black text-[#176B4D]">{worker.rate}</span>
          </div>

          <div className="bg-white/80 rounded-2xl p-3 border border-[#176B4D]/10 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-[#586B63] uppercase tracking-wider block font-semibold">
              {t('profile_ratings_breakdown')}
            </span>
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-[#E8B83D] text-[#E8B83D]" />
              <span className="text-base font-black text-[#26332D]">
                {worker.ratingSummary?.averageRating > 0
                  ? worker.ratingSummary.averageRating
                  : t('rating_new')}
              </span>
              <span className="text-xs text-[#586B63]">
                ({worker.ratingSummary?.totalRatings})
              </span>
            </div>
          </div>
        </div>

        {/* Description / About */}
        <div className="mb-5">
          <h4 className="text-xs font-black text-[#176B4D] uppercase tracking-wider mb-1.5">
            {t('profile_about')}
          </h4>
          <p className="text-xs sm:text-sm text-[#26332D] leading-relaxed bg-white/60 p-3.5 rounded-2xl border border-[#176B4D]/10">
            {worker.description || t('profile_default_desc')}
          </p>
        </div>

        {/* Service Coverage Areas (Req 21: Service areas visible, exact coordinates hidden) */}
        {worker.serviceAreas && worker.serviceAreas.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-black text-[#176B4D] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#E8B83D]" />
              <span>{t('profile_service_areas')}</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {worker.serviceAreas.map((sa, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-white text-[#26332D] font-medium border border-[#176B4D]/15 px-2.5 py-1 rounded-lg"
                >
                  {loc.place(sa)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Full Rating Breakdown Visual Percentage Bars (Req 12) */}
        <div className="mb-6 p-4 rounded-2xl bg-white/90 border border-[#176B4D]/10">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black text-[#176B4D] uppercase tracking-wider">
              {t('profile_ratings_breakdown')}
            </h4>
            {!worker.isSuspended && (
              <button
                onClick={() => {
                  onClose();
                  onOpenRate(worker);
                }}
                className="text-xs font-bold text-[#176B4D] hover:underline flex items-center gap-1"
              >
                <Star className="w-3.5 h-3.5 text-[#E8B83D]" />
                {t('action_rate')}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = (breakdown as any)[stars] || 0;
              const pct = calcPct(count);
              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-[#26332D] font-bold flex items-center gap-1">
                    <span>{stars}</span>
                    <Star className="w-3 h-3 fill-[#E8B83D] text-[#E8B83D]" />
                  </span>
                  <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#E8B83D] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-[11px] font-semibold text-[#586B63]">
                    {pct}% ({count})
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-[#586B63] italic mt-3 text-center">
            {t('rating_anonymous_notice')}
          </p>
        </div>

        {/* Direct Action Buttons (Req 26 & 27: Call & WhatsApp buttons, phone hidden) */}
        <div className="pt-2">
          {worker.isSuspended ? (
            <div className="p-3 bg-red-100/50 rounded-2xl text-center text-xs font-bold text-[#D64545] border border-red-200">
              {t('profile_suspended_notice')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onCall(worker)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                <Phone className="w-4 h-4" />
                <span>{t('action_call')}</span>
              </button>

              <button
                onClick={() => onWhatsApp(worker)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#2E8B57] hover:bg-[#28794c] text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('action_whatsapp')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
